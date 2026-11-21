#include "polpo/link/link_proto.h"

namespace polpo {
namespace link {

// ---------------- righe ----------------

LineFramer::Result LineFramer::feed(char c) {
    if (c == '\r') return Result::None;
    if (c == '\n') {
        if (overflow_) {
            overflow_ = false;
            buf_.clear();
            return Result::None;  // la riga troppo lunga è già stata segnalata
        }
        ready_.swap(buf_);
        buf_.clear();
        return Result::Line;
    }
    if (overflow_) return Result::None;
    if (buf_.size() >= kMaxLine) {
        overflow_ = true;
        buf_.clear();
        return Result::Overflow;
    }
    buf_.push_back(c);
    return Result::None;
}

std::string LineFramer::take() {
    std::string out;
    out.swap(ready_);
    return out;
}

// ---------------- comandi ----------------

const std::vector<CommandSpec>& commands() {
    static const std::vector<CommandSpec> list = {
        {"ping", false, false},          {"hello", false, false},
        {"info", true, false},           {"diag", true, false},
        {"bye", true, false},            {"fs.list", true, false},
        {"fs.read", true, false},        {"fs.write", true, false},  // sensibile solo in /polpo/badusb
        {"fs.delete", true, false},      {"ir.send", true, false},
        {"ir.learn.start", true, false}, {"ir.learn.stop", true, false},
        {"rf.rx.start", true, false},    {"rf.rx.stop", true, false},
        {"rf.raw.start", true, false},   {"rf.raw.snapshot", true, false},
        {"rf.raw.stop", true, false},    {"rf.tx", true, true},
        {"nfc.read", true, false},       {"nfc.write_ndef", true, true},
        {"wifi.scan", true, false},      {"ble.scan", true, false},
        {"gpio.i2c_scan", true, false},  {"gpio.pins", true, false},
    };
    return list;
}

const CommandSpec* find_command(const std::string& name) {
    for (const auto& c : commands())
        if (name == c.name) return &c;
    return nullptr;
}

// ---------------- risposte ----------------

static std::string serialize(const JsonDocument& doc) {
    std::string out;
    serializeJson(doc, out);
    return out;
}

std::string make_ok(uint32_t id, JsonVariantConst data) {
    JsonDocument doc;
    doc["id"] = id;
    doc["ok"] = true;
    doc["data"] = data;
    return serialize(doc);
}

std::string make_ok(uint32_t id) {
    JsonDocument doc;
    doc["id"] = id;
    doc["ok"] = true;
    doc["data"].to<JsonObject>();
    return serialize(doc);
}

std::string make_error(uint32_t id, const char* code, const char* msg) {
    JsonDocument doc;
    doc["id"] = id;
    doc["ok"] = false;
    doc["error"]["code"] = code;
    doc["error"]["msg"] = msg;
    return serialize(doc);
}

std::string make_event(const char* ev, JsonVariantConst data) {
    JsonDocument doc;
    doc["ev"] = ev;
    doc["data"] = data;
    return serialize(doc);
}

// ---------------- validazione ----------------

std::string preprocess(const std::string& line, bool session, bool busy, Request& out) {
    out.id = 0;
    out.cmd.clear();
    out.spec = nullptr;
    out.doc.clear();
    if (line.size() > kMaxLine) return make_error(0, "line_too_long", "riga oltre 2048 byte");
    const DeserializationError e = deserializeJson(out.doc, line, DeserializationOption::NestingLimit(6));
    if (e) return make_error(0, "bad_json", "JSON non valido");
    if (!out.doc.is<JsonObjectConst>()) return make_error(0, "bad_request", "serve un oggetto JSON");
    JsonVariantConst id = out.doc["id"];
    if (!id.is<uint32_t>()) return make_error(0, "bad_request", "manca un id numerico");
    out.id = id.as<uint32_t>();
    JsonVariantConst cmd = out.doc["cmd"];
    if (!cmd.is<const char*>()) return make_error(out.id, "bad_request", "manca il comando");
    out.cmd = cmd.as<const char*>();
    JsonVariantConst args = out.doc["args"];
    if (!args.isNull() && !args.is<JsonObjectConst>()) return make_error(out.id, "bad_request", "args deve essere un oggetto");
    out.spec = find_command(out.cmd);
    if (!out.spec) return make_error(out.id, "unknown_cmd", "comando sconosciuto");
    if (out.cmd == "ping") {
        JsonDocument data;
        data["pong"] = true;
        data["proto"] = kProtocolVersion;
        return make_ok(out.id, data);
    }
    if (busy) return make_error(out.id, "busy", "un'altra richiesta è in corso");
    if (out.spec->needs_session && !session)
        return make_error(out.id, "not_connected", "collegamento non accettato sul Polpo: invia hello");
    return std::string();
}

// ---------------- codifiche ----------------

static const char kB64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string base64_encode(const uint8_t* d, size_t n) {
    std::string out;
    out.reserve((n + 2) / 3 * 4);
    for (size_t i = 0; i < n; i += 3) {
        const uint32_t v = (static_cast<uint32_t>(d[i]) << 16) | (i + 1 < n ? static_cast<uint32_t>(d[i + 1]) << 8 : 0) |
                           (i + 2 < n ? d[i + 2] : 0);
        out.push_back(kB64[(v >> 18) & 63]);
        out.push_back(kB64[(v >> 12) & 63]);
        out.push_back(i + 1 < n ? kB64[(v >> 6) & 63] : '=');
        out.push_back(i + 2 < n ? kB64[v & 63] : '=');
    }
    return out;
}

static int b64v(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
}

bool base64_decode(const std::string& in, std::vector<uint8_t>& out) {
    out.clear();
    if (in.size() % 4) return false;
    for (size_t i = 0; i < in.size(); i += 4) {
        int v[4];
        int pad = 0;
        for (int k = 0; k < 4; ++k) {
            const char c = in[i + k];
            if (c == '=') {
                if (i + 4 != in.size() || k < 2) return false;
                v[k] = 0;
                ++pad;
            } else {
                if (pad) return false;
                v[k] = b64v(c);
                if (v[k] < 0) return false;
            }
        }
        const uint32_t w = (static_cast<uint32_t>(v[0]) << 18) | (static_cast<uint32_t>(v[1]) << 12) |
                           (static_cast<uint32_t>(v[2]) << 6) | static_cast<uint32_t>(v[3]);
        out.push_back(static_cast<uint8_t>(w >> 16));
        if (pad < 2) out.push_back(static_cast<uint8_t>(w >> 8));
        if (pad < 1) out.push_back(static_cast<uint8_t>(w));
    }
    return true;
}

uint32_t crc32(const uint8_t* d, size_t n, uint32_t prev) {
    uint32_t c = ~prev;
    for (size_t i = 0; i < n; ++i) {
        c ^= d[i];
        for (int k = 0; k < 8; ++k) c = (c >> 1) ^ (0xEDB88320u & (0u - (c & 1u)));
    }
    return ~c;
}

bool valid_sd_path(const std::string& p) {
    if (p.size() < 6 || p.size() > 96) return false;
    if (p.compare(0, 6, "/polpo") != 0) return false;
    if (p.size() > 6 && p[6] != '/') return false;
    if (p.find("..") != std::string::npos || p.find("//") != std::string::npos) return false;
    for (char c : p) {
        const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' ||
                        c == '-' || c == '.' || c == '/';
        if (!ok) return false;
    }
    return true;
}

bool is_sensitive_path(const std::string& p) { return p.compare(0, 14, "/polpo/badusb/") == 0; }

}  // namespace link
}  // namespace polpo

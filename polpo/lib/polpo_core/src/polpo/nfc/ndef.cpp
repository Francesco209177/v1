#include "polpo/nfc/ndef.h"

#include "polpo/util/strutil.h"

namespace polpo {
namespace {

// Tabella dei prefissi URI della specifica NFC Forum RTD URI.
const char* const kUriPrefixes[] = {
    "",           "http://www.", "https://www.", "http://",   "https://",  "tel:",      "mailto:",
    "ftp://anonymous:anonymous@", "ftp://ftp.", "ftps://",   "sftp://",   "smb://",    "nfs://",
    "ftp://",     "dav://",      "news:",       "telnet://", "imap:",     "rtsp://",   "urn:",
    "pop:",       "sip:",        "sips:",       "tftp:",     "btspp://",  "btl2cap://", "btgoep://",
    "tcpobex://", "irdaobex://", "file://",     "urn:epc:id:", "urn:epc:tag:", "urn:epc:pat:",
    "urn:epc:raw:", "urn:epc:",  "urn:nfc:",
};
constexpr size_t kUriPrefixCount = sizeof(kUriPrefixes) / sizeof(kUriPrefixes[0]);

std::vector<uint8_t> single_record(uint8_t tnf, const std::string& type, const std::vector<uint8_t>& payload) {
    std::vector<uint8_t> out;
    const bool sr = payload.size() <= 255;
    out.push_back(static_cast<uint8_t>(0x80 | 0x40 | (sr ? 0x10 : 0) | (tnf & 0x07)));  // MB|ME|SR|TNF
    out.push_back(static_cast<uint8_t>(type.size()));
    if (sr) {
        out.push_back(static_cast<uint8_t>(payload.size()));
    } else {
        const auto n = static_cast<uint32_t>(payload.size());
        out.push_back(static_cast<uint8_t>(n >> 24));
        out.push_back(static_cast<uint8_t>(n >> 16));
        out.push_back(static_cast<uint8_t>(n >> 8));
        out.push_back(static_cast<uint8_t>(n));
    }
    out.insert(out.end(), type.begin(), type.end());
    out.insert(out.end(), payload.begin(), payload.end());
    return out;
}

}  // namespace

std::vector<uint8_t> ndef_uri_message(const std::string& uri) {
    size_t best = 0, best_len = 0;
    for (size_t i = 1; i < kUriPrefixCount; ++i) {
        const std::string p = kUriPrefixes[i];
        if (p.size() > best_len && starts_with(uri, p)) {
            best = i;
            best_len = p.size();
        }
    }
    std::vector<uint8_t> payload;
    payload.push_back(static_cast<uint8_t>(best));
    payload.insert(payload.end(), uri.begin() + static_cast<long>(best_len), uri.end());
    return single_record(0x01, "U", payload);
}

std::vector<uint8_t> ndef_text_message(const std::string& text, const std::string& lang) {
    std::vector<uint8_t> payload;
    payload.push_back(static_cast<uint8_t>(lang.size() & 0x3F));  // UTF-8, lunghezza lingua
    payload.insert(payload.end(), lang.begin(), lang.end());
    payload.insert(payload.end(), text.begin(), text.end());
    return single_record(0x01, "T", payload);
}

std::vector<uint8_t> ndef_wrap_tlv(const std::vector<uint8_t>& message) {
    std::vector<uint8_t> out;
    out.push_back(0x03);
    if (message.size() < 0xFF) {
        out.push_back(static_cast<uint8_t>(message.size()));
    } else {
        out.push_back(0xFF);
        out.push_back(static_cast<uint8_t>(message.size() >> 8));
        out.push_back(static_cast<uint8_t>(message.size()));
    }
    out.insert(out.end(), message.begin(), message.end());
    out.push_back(0xFE);
    return out;
}

bool ndef_find_in_tlv(const uint8_t* mem, size_t len, std::vector<uint8_t>& message) {
    size_t i = 0;
    while (i < len) {
        const uint8_t t = mem[i++];
        if (t == 0x00) continue;  // NULL TLV
        if (t == 0xFE) return false;  // terminatore senza NDEF
        if (i >= len) return false;
        size_t l = mem[i++];
        if (l == 0xFF) {
            if (i + 2 > len) return false;
            l = (static_cast<size_t>(mem[i]) << 8) | mem[i + 1];
            i += 2;
        }
        if (i + l > len) return false;
        if (t == 0x03) {
            message.assign(mem + i, mem + i + l);
            return true;
        }
        i += l;  // Lock Control / Memory Control / proprietari: saltati
    }
    return false;
}

bool ndef_parse(const std::vector<uint8_t>& m, std::vector<NdefRecord>& out, std::string& err) {
    out.clear();
    size_t i = 0;
    if (m.empty()) {
        err = "messaggio NDEF vuoto";
        return false;
    }
    while (i < m.size()) {
        const uint8_t hdr = m[i++];
        const bool me = hdr & 0x40, cf = hdr & 0x20, sr = hdr & 0x10, il = hdr & 0x08;
        if (cf) {
            err = "record spezzati (chunked) non supportati";
            return false;
        }
        if (i >= m.size()) break;
        const uint8_t type_len = m[i++];
        uint32_t payload_len = 0;
        if (sr) {
            if (i >= m.size()) break;
            payload_len = m[i++];
        } else {
            if (i + 4 > m.size()) break;
            payload_len = (static_cast<uint32_t>(m[i]) << 24) | (static_cast<uint32_t>(m[i + 1]) << 16) |
                          (static_cast<uint32_t>(m[i + 2]) << 8) | m[i + 3];
            i += 4;
        }
        uint8_t id_len = 0;
        if (il) {
            if (i >= m.size()) break;
            id_len = m[i++];
        }
        if (i + type_len + id_len + static_cast<size_t>(payload_len) > m.size()) {
            err = "record troncato";
            return false;
        }
        NdefRecord r;
        r.tnf = hdr & 0x07;
        r.type.assign(m.begin() + static_cast<long>(i), m.begin() + static_cast<long>(i + type_len));
        i += type_len + id_len;
        r.payload.assign(m.begin() + static_cast<long>(i), m.begin() + static_cast<long>(i + payload_len));
        i += payload_len;
        if (r.tnf == 0x01 && r.type == "U" && !r.payload.empty()) {
            r.kind = NdefKind::Uri;
            const uint8_t code = r.payload[0];
            r.value = code < kUriPrefixCount ? kUriPrefixes[code] : "";
            r.value.append(r.payload.begin() + 1, r.payload.end());
        } else if (r.tnf == 0x01 && r.type == "T" && !r.payload.empty()) {
            r.kind = NdefKind::Text;
            const uint8_t status = r.payload[0];
            const size_t ll = status & 0x3F;
            if (1 + ll <= r.payload.size()) {
                r.lang.assign(r.payload.begin() + 1, r.payload.begin() + static_cast<long>(1 + ll));
                if (status & 0x80) {
                    r.value = "(testo UTF-16 non mostrato)";
                } else {
                    r.value.assign(r.payload.begin() + static_cast<long>(1 + ll), r.payload.end());
                }
            }
        }
        out.push_back(r);
        if (me) break;
    }
    if (out.empty()) {
        err = "nessun record leggibile";
        return false;
    }
    return true;
}

std::string ndef_describe(const NdefRecord& r) {
    switch (r.kind) {
        case NdefKind::Uri:
            return "Link: " + r.value;
        case NdefKind::Text:
            return "Testo (" + r.lang + "): " + r.value;
        default:
            break;
    }
    std::string t = r.type.empty() ? "?" : r.type;
    return "Record TNF " + std::to_string(r.tnf) + " tipo " + t + " (" + std::to_string(r.payload.size()) + " byte)";
}

}  // namespace polpo

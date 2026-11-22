#include "polpo/ir/ir_file.h"

#include "polpo/util/flipper_format.h"
#include "polpo/util/hex.h"
#include "polpo/util/strutil.h"

namespace polpo {

static uint32_t mask_bits(uint8_t bits) { return bits >= 32 ? 0xFFFFFFFFu : ((1u << bits) - 1u); }

bool ir_signal_validate(const IrSignal& s, std::string& why) {
    if (s.name.empty()) {
        why = "nome mancante";
        return false;
    }
    if (s.raw) {
        if (s.timings.empty()) {
            why = "nessun tempo nei dati RAW";
            return false;
        }
        if (s.timings.size() > kIrMaxRawTimings) {
            why = "troppi tempi (max 1024)";
            return false;
        }
        if (s.frequency < 10000 || s.frequency > 100000) {
            why = "frequenza portante fuori range (10-100 kHz)";
            return false;
        }
        if (!(s.duty > 0.0f && s.duty < 1.0f)) {
            why = "duty cycle non valido";
            return false;
        }
        uint64_t total = 0;
        for (uint32_t t : s.timings) {
            if (t == 0 || t > kIrMaxRawTimingUs) {
                why = "tempo RAW fuori range (max 100 ms)";
                return false;
            }
            total += t;
        }
        if (total > kIrMaxRawTotalUs) {
            why = "segnale RAW troppo lungo (max 2 s)";
            return false;
        }
        return true;
    }
    if (s.protocol == IrProtocol::Unknown) {
        why = "protocollo sconosciuto";
        return false;
    }
    const auto& info = ir_protocol_info(s.protocol);
    if (s.address & ~mask_bits(info.address_bits)) {
        why = "indirizzo troppo grande per " + std::string(info.name);
        return false;
    }
    if (s.command & ~mask_bits(info.command_bits)) {
        why = "comando troppo grande per " + std::string(info.name);
        return false;
    }
    return true;
}

static bool finish_signal(IrSignal& cur, bool& open, IrFile& out) {
    if (!open) return true;
    open = false;
    std::string why;
    if (ir_signal_validate(cur, why)) {
        out.signals.push_back(cur);
        return true;
    }
    out.warnings.push_back("\"" + cur.name + "\" saltato: " + why);
    return false;
}

bool ir_file_parse(const std::string& text, IrFile& out, std::string& err) {
    out = IrFile{};
    FfDoc doc;
    if (!ff_parse(text, doc, err)) return false;
    if (doc.filetype != "IR signals file" && doc.filetype != "IR library file") {
        err = "non è un file infrarossi (Filetype: " + doc.filetype + ")";
        return false;
    }
    out.filetype = doc.filetype;
    IrSignal cur;
    bool open = false;
    bool bad = false;  // segnale corrente già invalidato da un campo illeggibile
    for (const auto& l : doc.lines) {
        if (l.key == "name") {
            if (!bad) finish_signal(cur, open, out);
            cur = IrSignal{};
            cur.name = l.value;
            open = true;
            bad = false;
            continue;
        }
        if (!open || bad) continue;
        if (l.key == "type") {
            if (l.value == "raw") {
                cur.raw = true;
            } else if (l.value == "parsed") {
                cur.raw = false;
            } else {
                out.warnings.push_back("\"" + cur.name + "\" saltato: tipo " + l.value);
                bad = true;
                open = false;
            }
        } else if (l.key == "protocol") {
            cur.protocol = ir_protocol_from_name(l.value);
            if (cur.protocol == IrProtocol::Unknown) {
                out.warnings.push_back("\"" + cur.name + "\" saltato: protocollo " + l.value + " non supportato");
                bad = true;
                open = false;
            }
        } else if (l.key == "address" || l.key == "command") {
            std::vector<uint8_t> bytes;
            if (!parse_hex_bytes(l.value, bytes) || bytes.size() != 4) {
                out.warnings.push_back("\"" + cur.name + "\" saltato: " + l.key + " non valido");
                bad = true;
                open = false;
                continue;
            }
            (l.key == "address" ? cur.address : cur.command) = le32_from_bytes(bytes);
        } else if (l.key == "frequency") {
            if (!parse_u32(l.value, cur.frequency)) {
                out.warnings.push_back("\"" + cur.name + "\" saltato: frequenza non valida");
                bad = true;
                open = false;
            }
        } else if (l.key == "duty_cycle") {
            if (!parse_float(l.value, cur.duty)) {
                out.warnings.push_back("\"" + cur.name + "\" saltato: duty cycle non valido");
                bad = true;
                open = false;
            }
        } else if (l.key == "data") {
            // I file possono spezzare i dati su più righe "data:": si accodano.
            for (const auto& tok : split_ws(l.value)) {
                uint32_t t;
                if (!parse_u32(tok, t)) {
                    out.warnings.push_back("\"" + cur.name + "\" saltato: dato RAW non numerico");
                    bad = true;
                    open = false;
                    break;
                }
                cur.timings.push_back(t);
            }
        }
        // Chiavi sconosciute: ignorate (compatibilità in avanti).
    }
    if (!bad) finish_signal(cur, open, out);
    return true;
}

std::string ir_signal_block(const IrSignal& s) {
    IrFile one;
    one.signals.push_back(s);
    const std::string all = ir_file_serialize(one);
    // Tutto dopo l'intestazione ("Filetype"/"Version"), preceduto da una riga vuota.
    return "\n" + all.substr(all.find("#\n"));
}

std::string ir_file_serialize(const IrFile& file) {
    std::string out = ff_header(file.filetype, 1);
    for (const auto& s : file.signals) {
        out += "#\n";
        out += ff_line("name", s.name);
        if (s.raw) {
            out += ff_line("type", "raw");
            out += ff_line("frequency", std::to_string(s.frequency));
            out += ff_line("duty_cycle", format_float6(s.duty));
            std::string data;
            for (size_t i = 0; i < s.timings.size(); ++i) {
                if (i) data.push_back(' ');
                data += std::to_string(s.timings[i]);
            }
            out += ff_line("data", data);
        } else {
            out += ff_line("type", "parsed");
            out += ff_line("protocol", ir_protocol_info(s.protocol).name);
            out += ff_line("address", to_hex(le32_to_bytes(s.address)));
            out += ff_line("command", to_hex(le32_to_bytes(s.command)));
        }
    }
    return out;
}

}  // namespace polpo

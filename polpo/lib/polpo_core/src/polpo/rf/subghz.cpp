#include "polpo/rf/subghz.h"

#include <algorithm>
#include <cstdlib>

#include "polpo/util/flipper_format.h"
#include "polpo/util/hex.h"
#include "polpo/util/strutil.h"

namespace polpo {

static const char* kKeyType = "Flipper SubGhz Key File";
static const char* kRawType = "Flipper SubGhz RAW File";

std::string sub_serialize(const SubFile& f) {
    std::string out = ff_header(f.raw ? kRawType : kKeyType, 1);
    out += ff_line("Frequency", std::to_string(f.frequency));
    out += ff_line("Preset", f.preset);
    if (f.raw) {
        out += ff_line("Protocol", "RAW");
        for (size_t i = 0; i < f.raw_timings.size(); i += kSubRawMaxPerLine) {
            std::string line;
            const size_t end = std::min(f.raw_timings.size(), i + kSubRawMaxPerLine);
            for (size_t k = i; k < end; ++k) {
                if (k > i) line.push_back(' ');
                line += std::to_string(f.raw_timings[k]);
            }
            out += ff_line("RAW_Data", line);
        }
        return out;
    }
    // Protocollo 1 di rc-switch = PT2262/EV1527, che il formato chiama "Princeton".
    if (f.code.protocol == 1) {
        out += ff_line("Protocol", "Princeton");
    } else {
        out += ff_line("Protocol", "Polpo_RCSwitch");
        out += ff_line("RCS_Protocol", std::to_string(f.code.protocol));
    }
    out += ff_line("Bit", std::to_string(f.code.bits));
    out += ff_line("Key", to_hex(be_to_bytes(f.code.value, 8)));
    out += ff_line("TE", std::to_string(f.code.pulse_us));
    return out;
}

bool sub_raw_valid(const std::vector<int32_t>& t) {
    if (t.empty() || t[0] <= 0) return false;
    for (size_t i = 0; i < t.size(); ++i) {
        if (t[i] == 0) return false;
        if (i && ((t[i] > 0) == (t[i - 1] > 0))) return false;
    }
    return true;
}

bool sub_parse(const std::string& text, SubFile& out, std::string& err) {
    out = SubFile{};
    FfDoc doc;
    if (!ff_parse(text, doc, err)) return false;
    if (doc.filetype != kKeyType && doc.filetype != kRawType) {
        err = "non è un file radio .sub";
        return false;
    }
    std::string protocol;
    bool have_key = false;
    for (const auto& l : doc.lines) {
        if (l.key == "Frequency") {
            if (!parse_u32(l.value, out.frequency)) {
                err = "frequenza non valida";
                return false;
            }
        } else if (l.key == "Preset") {
            out.preset = l.value;
        } else if (l.key == "Protocol") {
            protocol = l.value;
        } else if (l.key == "RAW_Data") {
            for (const auto& tok : split_ws(l.value)) {
                int32_t v;
                if (!parse_i32(tok, v)) {
                    err = "dato RAW non valido";
                    return false;
                }
                if (out.raw_timings.size() >= kSubRawMaxTimings) {
                    err = "segnale RAW troppo lungo (max 4096 tempi)";
                    return false;
                }
                out.raw_timings.push_back(v);
            }
        } else if (l.key == "Bit") {
            uint32_t b;
            if (!parse_u32(l.value, b) || b == 0 || b > 32) {
                err = "Bit non valido (da 1 a 32)";
                return false;
            }
            out.code.bits = static_cast<uint8_t>(b);
        } else if (l.key == "Key") {
            std::vector<uint8_t> bytes;
            if (!parse_hex_bytes(l.value, bytes) || bytes.empty() || bytes.size() > 8) {
                err = "Key non valida";
                return false;
            }
            out.code.value = be_from_bytes(bytes);
            have_key = true;
        } else if (l.key == "TE") {
            uint32_t te;
            if (!parse_u32(l.value, te) || te < 50 || te > 5000) {
                err = "TE non valido";
                return false;
            }
            out.code.pulse_us = static_cast<uint16_t>(te);
        } else if (l.key == "RCS_Protocol") {
            uint32_t p;
            if (!parse_u32(l.value, p) || p == 0 || p > 12) {
                err = "RCS_Protocol non valido";
                return false;
            }
            out.code.protocol = static_cast<uint8_t>(p);
        }
    }
    if (protocol == "RAW") {
        out.raw = true;
        if (!sub_raw_valid(out.raw_timings)) {
            // Molte catture iniziano con una pausa: si scarta il primo valore negativo.
            if (!out.raw_timings.empty() && out.raw_timings[0] < 0) out.raw_timings.erase(out.raw_timings.begin());
            if (!sub_raw_valid(out.raw_timings)) {
                err = "dati RAW non alternati";
                return false;
            }
        }
        return true;
    }
    if (protocol == "Princeton") {
        out.code.protocol = 1;
    } else if (protocol != "Polpo_RCSwitch") {
        err = "protocollo " + protocol + " non supportato (solo codici fissi Princeton o RAW)";
        return false;
    }
    if (!have_key) {
        err = "manca il campo Key";
        return false;
    }
    if (out.code.bits < 64 && (out.code.value >> out.code.bits) != 0) {
        err = "Key più lunga dei bit dichiarati";
        return false;
    }
    return true;
}

PulseStats pulse_analyze(const std::vector<int32_t>& timings) {
    PulseStats st;
    std::vector<uint32_t> v;
    v.reserve(timings.size());
    for (int32_t t : timings) {
        const auto a = static_cast<uint32_t>(std::abs(static_cast<long>(t)));
        if (a >= 50 && a <= 20000) v.push_back(a);
    }
    st.count = v.size();
    if (v.empty()) return st;
    std::sort(v.begin(), v.end());
    st.min_us = v.front();
    st.max_us = v.back();
    // Raggruppa valori ordinati: nuovo gruppo quando il valore supera la media del gruppo di +40%.
    struct Cluster {
        uint64_t sum;
        uint32_t n;
        uint32_t mean() const { return static_cast<uint32_t>(sum / n); }
    };
    std::vector<Cluster> cl;
    for (uint32_t x : v) {
        if (cl.empty() || x > cl.back().mean() * 14 / 10) {
            cl.push_back({x, 1});
        } else {
            cl.back().sum += x;
            cl.back().n++;
        }
    }
    st.clusters = static_cast<uint8_t>(std::min<size_t>(cl.size(), 255));
    // I due gruppi più numerosi (rumore escluso): il più corto è il TE.
    std::vector<size_t> idx(cl.size());
    for (size_t i = 0; i < idx.size(); ++i) idx[i] = i;
    std::sort(idx.begin(), idx.end(), [&](size_t a, size_t b) { return cl[a].n > cl[b].n; });
    size_t a = idx[0];
    size_t b = idx.size() > 1 ? idx[1] : idx[0];
    if (cl[a].mean() > cl[b].mean()) std::swap(a, b);
    st.short_us = cl[a].mean();
    st.long_us = cl[b].mean();
    st.ratio = st.short_us ? static_cast<float>(st.long_us) / static_cast<float>(st.short_us) : 0.0f;
    return st;
}

uint64_t rcswitch_airtime_us(const RcCode& c, uint8_t repeats) {
    // Stessi valori della tabella dei protocolli di rc-switch 2.6.4:
    // {sincronismo alto, basso}, {zero alto, basso}, {uno alto, basso} in multipli dell'impulso.
    static const uint8_t kP[kRcSwitchProtocols][6] = {
        {1, 31, 1, 3, 3, 1},  {1, 10, 1, 2, 2, 1}, {30, 71, 4, 11, 9, 6}, {1, 6, 1, 3, 3, 1},
        {6, 14, 1, 2, 2, 1},  {23, 1, 1, 2, 2, 1}, {2, 62, 1, 6, 6, 1},   {3, 130, 7, 16, 3, 16},
        {130, 7, 16, 7, 16, 3}, {18, 1, 3, 1, 1, 3}, {36, 1, 1, 2, 2, 1},  {36, 1, 1, 2, 2, 1},
    };
    if (c.protocol < 1 || c.protocol > kRcSwitchProtocols || c.bits == 0 || c.bits > kRcMaxBits) return 0;
    const uint8_t* p = kP[c.protocol - 1];
    const uint32_t sync = p[0] + p[1];
    const uint32_t zero = p[2] + p[3], one = p[4] + p[5];
    const uint32_t per_bit = zero > one ? zero : one;  // stima prudente: il bit più lungo
    const uint64_t frame = (static_cast<uint64_t>(per_bit) * c.bits + sync) * c.pulse_us;
    return frame * repeats;
}

uint64_t rf_total_us(const std::vector<int32_t>& t) {
    uint64_t s = 0;
    for (int32_t x : t) s += static_cast<uint64_t>(std::abs(static_cast<long>(x)));
    return s;
}

uint64_t rf_on_us(const std::vector<int32_t>& t) {
    uint64_t s = 0;
    for (int32_t x : t)
        if (x > 0) s += static_cast<uint64_t>(x);
    return s;
}

void TxBudget::expire(uint32_t now_ms) {
    log_.erase(std::remove_if(log_.begin(), log_.end(),
                              [&](const Entry& e) { return static_cast<uint32_t>(now_ms - e.t) >= window_ms_; }),
               log_.end());
}

uint32_t TxBudget::used_ms(uint32_t now_ms) {
    expire(now_ms);
    uint32_t s = 0;
    for (const auto& e : log_) s += e.ms;
    return s;
}

bool TxBudget::try_consume(uint32_t now_ms, uint32_t on_ms) {
    if (used_ms(now_ms) + on_ms > limit_ms()) return false;
    if (log_.size() >= 256) {
        // Registro pieno: si somma all'ultima voce (scade più tardi = scelta prudente).
        log_.back().ms += on_ms;
        log_.back().t = now_ms;
    } else {
        log_.push_back({now_ms, on_ms});
    }
    return true;
}

}  // namespace polpo

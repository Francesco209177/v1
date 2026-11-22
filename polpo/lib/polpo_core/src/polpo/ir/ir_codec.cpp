#include "polpo/ir/ir_codec.h"

#include <cstdlib>

namespace polpo {
namespace {

// Costruisce una sequenza impulso/pausa fondendo i tratti consecutivi dello stesso livello.
class Builder {
public:
    explicit Builder(std::vector<uint32_t>& d) : d_(d) {}
    void mark(uint32_t us) { add(true, us); }
    void space(uint32_t us) { add(false, us); }

private:
    void add(bool m, uint32_t us) {
        if (us == 0) return;
        if (d_.empty()) {
            if (!m) return;  // la sequenza inizia sempre con un impulso
            d_.push_back(us);
            last_mark_ = true;
            return;
        }
        if (m == last_mark_) {
            d_.back() += us;
        } else {
            d_.push_back(us);
            last_mark_ = m;
        }
    }
    std::vector<uint32_t>& d_;
    bool last_mark_ = false;
};

struct PulseDistance {
    uint32_t hdr_mark, hdr_space, bit_mark, zero_space, one_space;
};

constexpr PulseDistance kNec{9000, 4500, 560, 560, 1690};
constexpr PulseDistance kSamsung{4500, 4500, 550, 550, 1650};
constexpr PulseDistance kKaseikyo{3456, 1728, 432, 432, 1296};
constexpr PulseDistance kRca{4000, 4000, 500, 1000, 2000};
constexpr PulseDistance kPioneer{8500, 4225, 500, 500, 1500};

// Bit inviati dal meno significativo (LSB first), poi impulso di stop.
void pd_frame(Builder& b, const PulseDistance& p, uint64_t bits, int n) {
    b.mark(p.hdr_mark);
    b.space(p.hdr_space);
    for (int i = 0; i < n; ++i) {
        b.mark(p.bit_mark);
        b.space(((bits >> i) & 1u) ? p.one_space : p.zero_space);
    }
    b.mark(p.bit_mark);
}

// Sony SIRC: modulazione a larghezza d'impulso, LSB first, nessuna pausa finale.
void sirc_frame(Builder& b, uint64_t bits, int n) {
    b.mark(2400);
    b.space(600);
    for (int i = 0; i < n; ++i) {
        b.mark(((bits >> i) & 1u) ? 1200 : 600);
        if (i + 1 < n) b.space(600);
    }
}

// Philips RC5: Manchester, mezzo bit 889 µs, MSB first. 1 = pausa+impulso, 0 = impulso+pausa.
void rc5_frame(Builder& b, uint32_t address, uint32_t command, bool rc5x, bool toggle) {
    uint32_t word = 0;
    int n = 0;
    auto push = [&](uint32_t bit) {
        word = (word << 1) | (bit & 1u);
        ++n;
    };
    push(1);                                       // S1
    push(rc5x ? ((~command >> 6) & 1u) : 1u);      // S2 (in RC5X è il 7° bit del comando, invertito)
    push(toggle ? 1 : 0);                          // T
    for (int i = 4; i >= 0; --i) push(address >> i);
    for (int i = 5; i >= 0; --i) push(command >> i);
    const uint32_t h = 889;
    for (int i = n - 1; i >= 0; --i) {
        if ((word >> i) & 1u) {
            b.space(h);
            b.mark(h);
        } else {
            b.mark(h);
            b.space(h);
        }
    }
}

// Philips RC6 modo 0: leader, start=1, modo 000, toggle a durata doppia, 8+8 bit MSB first.
// In RC6 1 = impulso+pausa, 0 = pausa+impulso.
void rc6_frame(Builder& b, uint32_t address, uint32_t command, bool toggle) {
    const uint32_t t = 444;
    auto bit = [&](bool one, uint32_t half) {
        if (one) {
            b.mark(half);
            b.space(half);
        } else {
            b.space(half);
            b.mark(half);
        }
    };
    b.mark(2666);
    b.space(889);
    bit(true, t);
    for (int i = 0; i < 3; ++i) bit(false, t);
    bit(toggle, 2 * t);
    for (int i = 7; i >= 0; --i) bit((address >> i) & 1u, t);
    for (int i = 7; i >= 0; --i) bit((command >> i) & 1u, t);
}

uint64_t kaseikyo_bits(uint32_t address, uint32_t command) {
    const uint8_t id = (address >> 24) & 3;
    const uint16_t vendor = (address >> 8) & 0xFFFF;
    const uint8_t genre1 = (address >> 4) & 0xF;
    const uint8_t genre2 = address & 0xF;
    uint8_t d[6];
    d[0] = vendor & 0xFF;
    d[1] = vendor >> 8;
    uint8_t vp = d[0] ^ d[1];
    vp = (vp & 0xF) ^ (vp >> 4);
    d[2] = (vp & 0xF) | (genre1 << 4);
    d[3] = (genre2 & 0xF) | ((command & 0xF) << 4);
    d[4] = (id << 6) | ((command >> 4) & 0x3F);
    d[5] = d[2] ^ d[3] ^ d[4];
    uint64_t bits = 0;
    for (int i = 0; i < 6; ++i) bits |= static_cast<uint64_t>(d[i]) << (8 * i);
    return bits;
}

bool encode_one_frame(const IrSignal& s, Builder& b, bool toggle) {
    const uint32_t a = s.address, c = s.command;
    switch (s.protocol) {
        case IrProtocol::NEC: {
            uint64_t v = (a & 0xFF) | ((~a & 0xFF) << 8) | ((c & 0xFF) << 16) | (static_cast<uint64_t>(~c & 0xFF) << 24);
            pd_frame(b, kNec, v, 32);
            return true;
        }
        case IrProtocol::NECext: {
            uint64_t v = (a & 0xFFFF) | (static_cast<uint64_t>(c & 0xFFFF) << 16);
            pd_frame(b, kNec, v, 32);
            return true;
        }
        case IrProtocol::NEC42: {
            uint64_t v = (a & 0x1FFFull) | ((~a & 0x1FFFull) << 13) | (static_cast<uint64_t>(c & 0xFF) << 26) |
                         (static_cast<uint64_t>(~c & 0xFF) << 34);
            pd_frame(b, kNec, v, 42);
            return true;
        }
        case IrProtocol::NEC42ext: {
            uint64_t v = (a & 0x3FFFFFFull) | (static_cast<uint64_t>(c & 0xFFFF) << 26);
            pd_frame(b, kNec, v, 42);
            return true;
        }
        case IrProtocol::Samsung32: {
            uint64_t v = (a & 0xFF) | ((a & 0xFF) << 8) | ((c & 0xFF) << 16) | (static_cast<uint64_t>(~c & 0xFF) << 24);
            pd_frame(b, kSamsung, v, 32);
            return true;
        }
        case IrProtocol::Kaseikyo:
            pd_frame(b, kKaseikyo, kaseikyo_bits(a, c), 48);
            return true;
        case IrProtocol::RCA: {
            uint64_t v = (a & 0xF) | ((c & 0xFF) << 4) | ((~a & 0xF) << 12) | ((~c & 0xFF) << 16);
            pd_frame(b, kRca, v, 24);
            return true;
        }
        case IrProtocol::Pioneer: {
            // 32 bit di dati più un bit 0 aggiuntivo, come nei file .ir di riferimento.
            uint64_t v = (a & 0xFF) | ((~a & 0xFF) << 8) | ((c & 0xFF) << 16) | (static_cast<uint64_t>(~c & 0xFF) << 24);
            pd_frame(b, kPioneer, v, 33);
            return true;
        }
        case IrProtocol::SIRC:
            sirc_frame(b, (c & 0x7F) | ((a & 0x1F) << 7), 12);
            return true;
        case IrProtocol::SIRC15:
            sirc_frame(b, (c & 0x7F) | ((a & 0xFF) << 7), 15);
            return true;
        case IrProtocol::SIRC20:
            sirc_frame(b, (c & 0x7F) | ((a & 0x1FFF) << 7), 20);
            return true;
        case IrProtocol::RC5:
            rc5_frame(b, a & 0x1F, c & 0x3F, false, toggle);
            return true;
        case IrProtocol::RC5X:
            rc5_frame(b, a & 0x1F, c & 0x7F, true, toggle);
            return true;
        case IrProtocol::RC6:
            rc6_frame(b, a & 0xFF, c & 0xFF, toggle);
            return true;
        default:
            return false;
    }
}

// ---- decodifica ----

bool near(uint32_t x, uint32_t target, uint32_t pct = 30, uint32_t min_abs = 150) {
    uint32_t tol = target * pct / 100;
    if (tol < min_abs) tol = min_abs;
    uint32_t diff = x > target ? x - target : target - x;
    return diff <= tol;
}

// Legge bit a distanza di impulso dopo l'intestazione. Restituisce il numero di bit o -1.
int pd_read(const std::vector<uint32_t>& d, const PulseDistance& p, uint64_t& bits, uint32_t hdr_pct) {
    bits = 0;
    if (d.size() < 4) return -1;
    if (!near(d[0], p.hdr_mark, hdr_pct, 200) || !near(d[1], p.hdr_space, hdr_pct, 200)) return -1;
    int n = 0;
    size_t i = 2;
    while (i < d.size()) {
        if (!near(d[i], p.bit_mark)) return -1;
        if (i + 1 >= d.size()) break;               // impulso di stop finale
        uint32_t sp = d[i + 1];
        if (near(sp, p.zero_space) && !near(sp, p.one_space)) {
        } else if (near(sp, p.one_space)) {
            if (n < 64) bits |= (1ull << n);
        } else {
            break;  // pausa lunga: fine frame (eventuali ripetizioni ignorate)
        }
        ++n;
        i += 2;
        if (n > 64) return -1;
    }
    return n;
}

}  // namespace

bool ir_encode(const IrSignal& sig, IrTimings& out, bool toggle) {
    out = IrTimings{};
    if (sig.raw) {
        if (sig.timings.empty() || sig.timings.size() > kIrMaxRawTimings) return false;
        uint64_t total = 0;
        for (uint32_t t : sig.timings) {
            if (t == 0 || t > kIrMaxRawTimingUs) return false;
            total += t;
        }
        if (total > kIrMaxRawTotalUs) return false;
        out.frequency = sig.frequency;
        out.duty = sig.duty;
        out.durations = sig.timings;
        return true;
    }
    const auto& info = ir_protocol_info(sig.protocol);
    if (sig.protocol == IrProtocol::Unknown) return false;
    out.frequency = info.frequency;
    out.duty = info.duty;
    Builder b(out.durations);
    for (uint8_t f = 0; f < info.min_frames; ++f) {
        if (f) b.space(info.frame_gap_us);
        if (!encode_one_frame(sig, b, toggle)) return false;
    }
    // La sequenza termina sempre con un impulso: una pausa finale non serve.
    if (!out.durations.empty() && out.durations.size() % 2 == 0) out.durations.pop_back();
    return !out.durations.empty();
}

bool ir_decode(const std::vector<uint32_t>& d, IrSignal& out) {
    uint64_t bits = 0;
    int n;
    // NEC e Pioneer hanno intestazioni simili: decide quella più vicina.
    if (d.size() >= 4 && d[0] > 7000 && d[0] < 10500) {
        const bool pioneer = d[0] < 8750;
        n = pd_read(d, pioneer ? kPioneer : kNec, bits, 15);
        if (pioneer && (n == 32 || n == 33)) {
            uint8_t a = bits & 0xFF, ai = (bits >> 8) & 0xFF, c = (bits >> 16) & 0xFF, ci = (bits >> 24) & 0xFF;
            if ((a ^ ai) == 0xFF && (c ^ ci) == 0xFF) {
                out.raw = false;
                out.protocol = IrProtocol::Pioneer;
                out.address = a;
                out.command = c;
                return true;
            }
        }
        if (!pioneer && n == 32) {
            uint8_t a = bits & 0xFF, ai = (bits >> 8) & 0xFF, c = (bits >> 16) & 0xFF, ci = (bits >> 24) & 0xFF;
            out.raw = false;
            if ((a ^ ai) == 0xFF && (c ^ ci) == 0xFF) {
                out.protocol = IrProtocol::NEC;
                out.address = a;
                out.command = c;
            } else {
                out.protocol = IrProtocol::NECext;
                out.address = bits & 0xFFFF;
                out.command = (bits >> 16) & 0xFFFF;
            }
            return true;
        }
        if (!pioneer && n == 42) {
            uint32_t a = bits & 0x1FFF, ai = (bits >> 13) & 0x1FFF;
            uint32_t c = (bits >> 26) & 0xFF, ci = (bits >> 34) & 0xFF;
            out.raw = false;
            if ((a ^ ai) == 0x1FFF && (c ^ ci) == 0xFF) {
                out.protocol = IrProtocol::NEC42;
                out.address = a;
                out.command = c;
            } else {
                out.protocol = IrProtocol::NEC42ext;
                out.address = bits & 0x3FFFFFF;
                out.command = (bits >> 26) & 0xFFFF;
            }
            return true;
        }
    }
    // Samsung32 (4500/4500) e RCA (4000/4000): li distinguono il numero di bit e i tempi.
    n = pd_read(d, kSamsung, bits, 12);
    if (n == 32) {
        uint8_t a = bits & 0xFF, a2 = (bits >> 8) & 0xFF, c = (bits >> 16) & 0xFF, ci = (bits >> 24) & 0xFF;
        if (a == a2 && (c ^ ci) == 0xFF) {
            out.raw = false;
            out.protocol = IrProtocol::Samsung32;
            out.address = a;
            out.command = c;
            return true;
        }
    }
    n = pd_read(d, kRca, bits, 12);
    if (n == 24) {
        uint32_t a = bits & 0xF, c = (bits >> 4) & 0xFF, ai = (bits >> 12) & 0xF, ci = (bits >> 16) & 0xFF;
        if ((a ^ ai) == 0xF && (c ^ ci) == 0xFF) {
            out.raw = false;
            out.protocol = IrProtocol::RCA;
            out.address = a;
            out.command = c;
            return true;
        }
    }
    n = pd_read(d, kKaseikyo, bits, 20);
    if (n == 48) {
        uint8_t b[6];
        for (int i = 0; i < 6; ++i) b[i] = (bits >> (8 * i)) & 0xFF;
        uint8_t vp = b[0] ^ b[1];
        vp = (vp & 0xF) ^ (vp >> 4);
        if ((b[2] & 0xF) == vp && b[5] == (b[2] ^ b[3] ^ b[4])) {
            const uint32_t vendor = b[0] | (b[1] << 8);
            const uint32_t genre1 = b[2] >> 4, genre2 = b[3] & 0xF;
            const uint32_t id = b[4] >> 6;
            out.raw = false;
            out.protocol = IrProtocol::Kaseikyo;
            out.address = (id << 24) | (vendor << 8) | (genre1 << 4) | genre2;
            out.command = (b[3] >> 4) | ((b[4] & 0x3F) << 4);
            return true;
        }
    }
    // Sony SIRC: intestazione 2400/600, bit codificati nella durata dell'impulso.
    if (d.size() >= 3 && near(d[0], 2400, 15, 200) && near(d[1], 600, 30, 150)) {
        bits = 0;
        n = 0;
        size_t i = 2;
        while (i < d.size() && n < 21) {
            if (near(d[i], 1200, 25, 150)) {
                bits |= (1ull << n);
            } else if (!near(d[i], 600, 30, 150)) {
                return false;
            }
            ++n;
            if (i + 1 >= d.size() || !near(d[i + 1], 600, 30, 150)) break;  // fine frame
            i += 2;
        }
        out.raw = false;
        if (n == 12) {
            out.protocol = IrProtocol::SIRC;
            out.command = bits & 0x7F;
            out.address = (bits >> 7) & 0x1F;
            return true;
        }
        if (n == 15) {
            out.protocol = IrProtocol::SIRC15;
            out.command = bits & 0x7F;
            out.address = (bits >> 7) & 0xFF;
            return true;
        }
        if (n == 20) {
            out.protocol = IrProtocol::SIRC20;
            out.command = bits & 0x7F;
            out.address = (bits >> 7) & 0x1FFF;
            return true;
        }
    }
    return false;
}

uint64_t ir_total_us(const std::vector<uint32_t>& d) {
    uint64_t t = 0;
    for (uint32_t x : d) t += x;
    return t;
}

std::vector<IrLevelDuration> ir_split_for_rmt(const std::vector<uint32_t>& d, uint16_t max_ticks) {
    std::vector<IrLevelDuration> out;
    if (max_ticks == 0) return out;
    for (size_t i = 0; i < d.size(); ++i) {
        const bool mark = (i % 2) == 0;
        uint32_t left = d[i];
        while (left > 0) {
            uint16_t chunk = left > max_ticks ? max_ticks : static_cast<uint16_t>(left);
            out.push_back({mark, chunk});
            left -= chunk;
        }
    }
    return out;
}

}  // namespace polpo

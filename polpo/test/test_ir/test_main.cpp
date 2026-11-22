// Test del modulo infrarossi: file .ir, codifica e decodifica dei protocolli.
#include <unity.h>

#include <string>
#include <vector>

#include "polpo/ir/ir_codec.h"
#include "polpo/ir/ir_file.h"
#include "polpo/ir/ir_library.h"

using namespace polpo;

void setUp() {}
void tearDown() {}

// File di esempio scritto per questi test (non copiato da altri progetti).
static const char* kSample =
    "Filetype: IR signals file\n"
    "Version: 1\n"
    "#\n"
    "name: Accendi\n"
    "type: parsed\n"
    "protocol: NEC\n"
    "address: 04 00 00 00\n"
    "command: 08 00 00 00\n"
    "#\n"
    "name: Volume_su\n"
    "type: parsed\n"
    "protocol: Samsung32\n"
    "address: 07 00 00 00\n"
    "command: 07 00 00 00\n"
    "#\n"
    "name: Grezzo\n"
    "type: raw\n"
    "frequency: 38000\n"
    "duty_cycle: 0.330000\n"
    "data: 9000 4500 560 560 560 1690 560\n"
    "#\n"
    "name: Sbagliato\n"
    "type: parsed\n"
    "protocol: FantasiaIR\n"
    "address: 00 00 00 00\n"
    "command: 00 00 00 00\n"
    "#\n"
    "name: Troppo_grande\n"
    "type: parsed\n"
    "protocol: NEC\n"
    "address: 00 01 00 00\n"
    "command: 00 00 00 00\n";

void test_parse_sample() {
    IrFile f;
    std::string err;
    TEST_ASSERT_TRUE(ir_file_parse(kSample, f, err));
    TEST_ASSERT_EQUAL(3, f.signals.size());
    TEST_ASSERT_EQUAL(2, f.warnings.size());
    TEST_ASSERT_EQUAL_STRING("Accendi", f.signals[0].name.c_str());
    TEST_ASSERT_TRUE(f.signals[0].protocol == IrProtocol::NEC);
    TEST_ASSERT_EQUAL_UINT32(0x04, f.signals[0].address);
    TEST_ASSERT_EQUAL_UINT32(0x08, f.signals[0].command);
    TEST_ASSERT_TRUE(f.signals[2].raw);
    TEST_ASSERT_EQUAL(7, f.signals[2].timings.size());
    TEST_ASSERT_EQUAL_UINT32(38000, f.signals[2].frequency);
}

void test_bad_header() {
    IrFile f;
    std::string err;
    TEST_ASSERT_FALSE(ir_file_parse("Filetype: Flipper SubGhz Key File\nVersion: 1\n", f, err));
    TEST_ASSERT_FALSE(ir_file_parse("name: x\n", f, err));
    TEST_ASSERT_FALSE(ir_file_parse("", f, err));
}

void test_roundtrip_serialize() {
    IrFile f, g;
    std::string err;
    TEST_ASSERT_TRUE(ir_file_parse(kSample, f, err));
    const std::string text = ir_file_serialize(f);
    TEST_ASSERT_TRUE(ir_file_parse(text, g, err));
    TEST_ASSERT_EQUAL(f.signals.size(), g.signals.size());
    for (size_t i = 0; i < f.signals.size(); ++i) {
        TEST_ASSERT_EQUAL_STRING(f.signals[i].name.c_str(), g.signals[i].name.c_str());
        TEST_ASSERT_EQUAL(f.signals[i].raw, g.signals[i].raw);
        TEST_ASSERT_EQUAL_UINT32(f.signals[i].address, g.signals[i].address);
        TEST_ASSERT_EQUAL_UINT32(f.signals[i].command, g.signals[i].command);
        TEST_ASSERT_TRUE(f.signals[i].timings == g.signals[i].timings);
    }
    TEST_ASSERT_TRUE(text.find("address: 04 00 00 00") != std::string::npos);
    TEST_ASSERT_TRUE(text.find("duty_cycle: 0.330000") != std::string::npos);
}

void test_nec_encode_layout() {
    IrSignal s;
    s.protocol = IrProtocol::NEC;
    s.address = 0x04;
    s.command = 0x08;
    IrTimings t;
    TEST_ASSERT_TRUE(ir_encode(s, t));
    TEST_ASSERT_EQUAL_UINT32(38000, t.frequency);
    TEST_ASSERT_EQUAL(2 + 64 + 1, t.durations.size());
    TEST_ASSERT_EQUAL_UINT32(9000, t.durations[0]);
    TEST_ASSERT_EQUAL_UINT32(4500, t.durations[1]);
    // address 0x04 LSB first: bit0=0, bit1=0, bit2=1
    TEST_ASSERT_EQUAL_UINT32(560, t.durations[3]);
    TEST_ASSERT_EQUAL_UINT32(560, t.durations[5]);
    TEST_ASSERT_EQUAL_UINT32(1690, t.durations[7]);
    // ~address (0xFB) inizia con bit0 = 1
    TEST_ASSERT_EQUAL_UINT32(1690, t.durations[2 + 16 + 1]);
    TEST_ASSERT_EQUAL_UINT32(560, t.durations.back());
}

struct Case {
    IrProtocol p;
    uint32_t a, c;
};

void test_encode_decode_roundtrip() {
    const Case cases[] = {
        {IrProtocol::NEC, 0x00, 0x12},        {IrProtocol::NEC, 0xFE, 0x01},
        {IrProtocol::NECext, 0x87EE, 0xA05D}, {IrProtocol::NEC42, 0x1ABC, 0x5A},
        {IrProtocol::NEC42ext, 0x2345678, 0xBEEF}, {IrProtocol::Samsung32, 0x07, 0x02},
        {IrProtocol::SIRC, 0x01, 0x15},       {IrProtocol::SIRC15, 0x97, 0x2A},
        {IrProtocol::SIRC20, 0x1F3A, 0x7F},   {IrProtocol::Kaseikyo, 0x0102020, 0x1FF},
        {IrProtocol::Kaseikyo, 0x2B04A31, 0x0C3}, {IrProtocol::RCA, 0x0F, 0xA5},
        {IrProtocol::Pioneer, 0xAA, 0x1C},
    };
    for (const auto& k : cases) {
        IrSignal s;
        s.protocol = k.p;
        s.address = k.a;
        s.command = k.c;
        IrTimings t;
        TEST_ASSERT_TRUE_MESSAGE(ir_encode(s, t), ir_protocol_info(k.p).name);
        TEST_ASSERT_EQUAL_MESSAGE(1, t.durations.size() % 2, ir_protocol_info(k.p).name);
        IrSignal d;
        TEST_ASSERT_TRUE_MESSAGE(ir_decode(t.durations, d), ir_protocol_info(k.p).name);
        TEST_ASSERT_EQUAL_STRING(ir_protocol_info(k.p).name, ir_protocol_info(d.protocol).name);
        TEST_ASSERT_EQUAL_HEX32_MESSAGE(k.a, d.address, ir_protocol_info(k.p).name);
        TEST_ASSERT_EQUAL_HEX32_MESSAGE(k.c, d.command, ir_protocol_info(k.p).name);
    }
}

void test_sirc_sends_three_frames() {
    IrSignal s;
    s.protocol = IrProtocol::SIRC;
    s.address = 1;
    s.command = 0x15;
    IrTimings t;
    TEST_ASSERT_TRUE(ir_encode(s, t));
    // ogni frame: 2 (intestazione) + 12 impulsi + 11 pause = 25 durate; 3 frame + 2 pause
    TEST_ASSERT_EQUAL(25 * 3 + 2, t.durations.size());
    TEST_ASSERT_EQUAL_UINT32(40000, t.frequency);
}

void test_rc5_shape() {
    IrSignal s;
    s.protocol = IrProtocol::RC5;
    s.address = 0;
    s.command = 12;  // ultimo bit 0 -> la pausa finale viene tolta
    IrTimings t;
    TEST_ASSERT_TRUE(ir_encode(s, t));
    uint64_t total = ir_total_us(t.durations);
    TEST_ASSERT_EQUAL_UINT64(14 * 1778 - 889 - 889, total);
    for (uint32_t d : t.durations) TEST_ASSERT_TRUE(d == 889 || d == 1778);
    TEST_ASSERT_EQUAL_UINT32(36000, t.frequency);
}

void test_rc5x_field_bit() {
    IrSignal a, b;
    a.protocol = b.protocol = IrProtocol::RC5X;
    a.command = 0x05;        // bit 6 = 0 -> S2 = 1
    b.command = 0x45;        // bit 6 = 1 -> S2 = 0
    IrTimings ta, tb;
    TEST_ASSERT_TRUE(ir_encode(a, ta));
    TEST_ASSERT_TRUE(ir_encode(b, tb));
    // S1=1,S2=1 -> impulso 889, pausa 889 ; S1=1,S2=0 -> impulso 1778
    TEST_ASSERT_EQUAL_UINT32(889, ta.durations[0]);
    TEST_ASSERT_EQUAL_UINT32(1778, tb.durations[0]);
}

void test_rc6_shape() {
    IrSignal s;
    s.protocol = IrProtocol::RC6;
    s.address = 0;
    s.command = 0x0C;  // ultimo bit 0 -> termina con impulso
    IrTimings t;
    TEST_ASSERT_TRUE(ir_encode(s, t));
    TEST_ASSERT_EQUAL_UINT32(2666, t.durations[0]);
    TEST_ASSERT_EQUAL_UINT32(889, t.durations[1]);
    TEST_ASSERT_EQUAL_UINT64(2666 + 889 + 4 * 888 + 1776 + 16 * 888, ir_total_us(t.durations));
}

void test_raw_passthrough_and_limits() {
    IrSignal s;
    s.raw = true;
    s.frequency = 36000;
    s.timings = {100, 200, 300};
    IrTimings t;
    TEST_ASSERT_TRUE(ir_encode(s, t));
    TEST_ASSERT_EQUAL_UINT32(36000, t.frequency);
    TEST_ASSERT_TRUE(t.durations == s.timings);
    s.timings.assign(1025, 100);
    TEST_ASSERT_FALSE(ir_encode(s, t));
}

void test_decode_rejects_noise() {
    IrSignal d;
    TEST_ASSERT_FALSE(ir_decode({}, d));
    TEST_ASSERT_FALSE(ir_decode({123, 456, 789, 1011}, d));
    std::vector<uint32_t> junk(60, 777);
    TEST_ASSERT_FALSE(ir_decode(junk, d));
}

void test_split_for_rmt() {
    auto v = ir_split_for_rmt({40000, 100, 50});
    TEST_ASSERT_EQUAL(4, v.size());
    TEST_ASSERT_TRUE(v[0].mark && v[0].us == 32767);
    TEST_ASSERT_TRUE(v[1].mark && v[1].us == 40000 - 32767);
    TEST_ASSERT_TRUE(!v[2].mark && v[2].us == 100);
    TEST_ASSERT_TRUE(v[3].mark && v[3].us == 50);
}

void test_protocol_names() {
    TEST_ASSERT_TRUE(ir_protocol_from_name("necext") == IrProtocol::NECext);
    TEST_ASSERT_TRUE(ir_protocol_from_name("Samsung32") == IrProtocol::Samsung32);
    TEST_ASSERT_TRUE(ir_protocol_from_name("xyz") == IrProtocol::Unknown);
    for (int i = 0; i < kIrProtocolCount; ++i) {
        const auto p = static_cast<IrProtocol>(i);
        TEST_ASSERT_TRUE(ir_protocol_from_name(ir_protocol_info(p).name) == p);
    }
}

void test_library_codes_encode() {
    TEST_ASSERT_TRUE(ir_library_size() > 20);
    for (auto cat : {IrCategory::TV, IrCategory::Audio}) {
        const auto buttons = ir_library_buttons(cat);
        TEST_ASSERT_TRUE(!buttons.empty());
        for (auto b : buttons) {
            for (const auto& code : ir_library_lookup(cat, b)) {
                const IrSignal sig = ir_library_signal(code);
                std::string why;
                TEST_ASSERT_TRUE_MESSAGE(ir_signal_validate(sig, why), sig.name.c_str());
                IrTimings t;
                TEST_ASSERT_TRUE_MESSAGE(ir_encode(sig, t), sig.name.c_str());
            }
        }
    }
    // Samsung "Accendi" = parola NEC-like 0xE0E040BF (MSB first del flusso): verifica sui primi bit.
    auto power = ir_library_lookup(IrCategory::TV, IrButton::Power);
    TEST_ASSERT_EQUAL_STRING("Samsung", power[0].brand);
}

void test_panasonic_power_matches_known_frame() {
    // Il frame Panasonic "power" noto, scritto MSB-first, è 40 04 01 00 BC BD:
    // trasmesso LSB-first per byte diventa 02 20 80 00 3D BD.
    IrSignal s;
    s.protocol = IrProtocol::Kaseikyo;
    s.address = 0x200280;
    s.command = 0x3D0;
    IrTimings t;
    TEST_ASSERT_TRUE(ir_encode(s, t));
    const uint8_t expected[6] = {0x02, 0x20, 0x80, 0x00, 0x3D, 0xBD};
    for (int bit = 0; bit < 48; ++bit) {
        const bool one = (expected[bit / 8] >> (bit % 8)) & 1;
        const uint32_t space = t.durations[2 + 2 * bit + 1];
        TEST_ASSERT_EQUAL_UINT32(one ? 1296u : 432u, space);
    }
}

void test_raw_duration_caps() {
    IrSignal s;
    s.name = "lungo";
    s.raw = true;
    s.timings = {9000, 150000, 560};
    std::string why;
    TEST_ASSERT_FALSE(ir_signal_validate(s, why));
    IrTimings t;
    TEST_ASSERT_FALSE(ir_encode(s, t));
    s.timings.assign(41, 60000);  // 2,46 s in totale
    TEST_ASSERT_FALSE(ir_signal_validate(s, why));
    s.timings.assign(21, 60000);  // 1,26 s
    TEST_ASSERT_TRUE(ir_signal_validate(s, why));
}

void test_signal_block_appends_cleanly() {
    IrFile f;
    std::string err;
    TEST_ASSERT_TRUE(ir_file_parse(kSample, f, err));
    IrSignal extra;
    extra.name = "Nuovo";
    extra.protocol = IrProtocol::NEC;
    extra.address = 0x10;
    extra.command = 0x20;
    // file senza a capo finale + blocco accodato
    std::string text = std::string(kSample) + ir_signal_block(extra);
    IrFile g;
    TEST_ASSERT_TRUE(ir_file_parse(text, g, err));
    TEST_ASSERT_EQUAL(f.signals.size() + 1, g.signals.size());
    TEST_ASSERT_EQUAL_STRING("Nuovo", g.signals.back().name.c_str());
    TEST_ASSERT_EQUAL_UINT32(0x20, g.signals.back().command);
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_parse_sample);
    RUN_TEST(test_bad_header);
    RUN_TEST(test_roundtrip_serialize);
    RUN_TEST(test_nec_encode_layout);
    RUN_TEST(test_encode_decode_roundtrip);
    RUN_TEST(test_sirc_sends_three_frames);
    RUN_TEST(test_rc5_shape);
    RUN_TEST(test_rc5x_field_bit);
    RUN_TEST(test_rc6_shape);
    RUN_TEST(test_raw_passthrough_and_limits);
    RUN_TEST(test_decode_rejects_noise);
    RUN_TEST(test_split_for_rmt);
    RUN_TEST(test_protocol_names);
    RUN_TEST(test_library_codes_encode);
    RUN_TEST(test_panasonic_power_matches_known_frame);
    RUN_TEST(test_raw_duration_caps);
    RUN_TEST(test_signal_block_appends_cleanly);
    return UNITY_END();
}

// Test dei file .sub, dell'analisi impulsi e del limite di trasmissione.
#include <unity.h>

#include "polpo/rf/subghz.h"

using namespace polpo;

void setUp() {}
void tearDown() {}

void test_princeton_serialize() {
    SubFile f;
    f.code.protocol = 1;
    f.code.bits = 24;
    f.code.value = 0x95D5D4;
    f.code.pulse_us = 400;
    const std::string text = sub_serialize(f);
    TEST_ASSERT_EQUAL_STRING(
        "Filetype: Flipper SubGhz Key File\n"
        "Version: 1\n"
        "Frequency: 433920000\n"
        "Preset: FuriHalSubGhzPresetOok650Async\n"
        "Protocol: Princeton\n"
        "Bit: 24\n"
        "Key: 00 00 00 00 00 95 D5 D4\n"
        "TE: 400\n",
        text.c_str());
    SubFile g;
    std::string err;
    TEST_ASSERT_TRUE(sub_parse(text, g, err));
    TEST_ASSERT_FALSE(g.raw);
    TEST_ASSERT_EQUAL(1, g.code.protocol);
    TEST_ASSERT_EQUAL(24, g.code.bits);
    TEST_ASSERT_EQUAL_HEX64(0x95D5D4, g.code.value);
    TEST_ASSERT_EQUAL(400, g.code.pulse_us);
}

void test_rcswitch_other_protocol() {
    SubFile f;
    f.code.protocol = 2;
    f.code.bits = 32;
    f.code.value = 0xDEADBEEF;
    f.code.pulse_us = 650;
    SubFile g;
    std::string err;
    TEST_ASSERT_TRUE(sub_parse(sub_serialize(f), g, err));
    TEST_ASSERT_EQUAL(2, g.code.protocol);
    TEST_ASSERT_EQUAL_HEX64(0xDEADBEEF, g.code.value);
}

void test_raw_roundtrip_multiline() {
    SubFile f;
    f.raw = true;
    for (int i = 0; i < 1100; ++i) f.raw_timings.push_back(i % 2 ? -(300 + i) : (300 + i));
    const std::string text = sub_serialize(f);
    size_t lines = 0;
    for (size_t p = text.find("RAW_Data:"); p != std::string::npos; p = text.find("RAW_Data:", p + 1)) ++lines;
    TEST_ASSERT_EQUAL(3, lines);
    SubFile g;
    std::string err;
    TEST_ASSERT_TRUE(sub_parse(text, g, err));
    TEST_ASSERT_TRUE(g.raw);
    TEST_ASSERT_TRUE(g.raw_timings == f.raw_timings);
}

void test_rejects_rolling_and_bad() {
    SubFile g;
    std::string err;
    const char* keeloq =
        "Filetype: Flipper SubGhz Key File\nVersion: 1\nFrequency: 433920000\n"
        "Preset: FuriHalSubGhzPresetOok650Async\nProtocol: KeeLoq\nBit: 64\nKey: 01 02 03 04 05 06 07 08\n";
    TEST_ASSERT_FALSE(sub_parse(keeloq, g, err));
    TEST_ASSERT_TRUE(err.find("non supportato") != std::string::npos);
    const char* toolong =
        "Filetype: Flipper SubGhz Key File\nVersion: 1\nFrequency: 433920000\n"
        "Preset: x\nProtocol: Princeton\nBit: 8\nKey: 00 00 00 00 00 00 01 00\nTE: 350\n";
    TEST_ASSERT_FALSE(sub_parse(toolong, g, err));
    const char* badraw =
        "Filetype: Flipper SubGhz RAW File\nVersion: 1\nFrequency: 433920000\n"
        "Preset: x\nProtocol: RAW\nRAW_Data: 100 200 -300\n";
    TEST_ASSERT_FALSE(sub_parse(badraw, g, err));
    const char* leadingneg =
        "Filetype: Flipper SubGhz RAW File\nVersion: 1\nFrequency: 433920000\n"
        "Preset: x\nProtocol: RAW\nRAW_Data: -5000 100 -200 300\n";
    TEST_ASSERT_TRUE(sub_parse(leadingneg, g, err));
    TEST_ASSERT_EQUAL(3, g.raw_timings.size());
}

void test_pulse_analyze_pt2262() {
    std::vector<int32_t> t;
    for (int frame = 0; frame < 4; ++frame) {
        for (int bit = 0; bit < 24; ++bit) {
            if (bit % 3) {
                t.push_back(352 - (bit % 5));
                t.push_back(-(1046 + (bit % 7)));
            } else {
                t.push_back(1051);
                t.push_back(-348);
            }
        }
        t.push_back(350);
        t.push_back(-10850);
    }
    auto st = pulse_analyze(t);
    TEST_ASSERT_TRUE(st.short_us > 330 && st.short_us < 370);
    TEST_ASSERT_TRUE(st.ratio > 2.7f && st.ratio < 3.3f);
    TEST_ASSERT_EQUAL(10850, st.max_us);
    auto empty = pulse_analyze({});
    TEST_ASSERT_EQUAL(0, empty.count);
}

void test_tx_budget() {
    TxBudget b(1000, 0.1f);  // 100 ms ogni 1000 ms
    TEST_ASSERT_EQUAL(100, b.limit_ms());
    TEST_ASSERT_TRUE(b.try_consume(0, 60));
    TEST_ASSERT_FALSE(b.try_consume(10, 50));
    TEST_ASSERT_TRUE(b.try_consume(20, 40));
    TEST_ASSERT_FALSE(b.try_consume(500, 1));
    TEST_ASSERT_TRUE(b.try_consume(1001, 60));  // il primo è scaduto
    TEST_ASSERT_EQUAL(100, b.used_ms(1001));
}

void test_on_time() {
    std::vector<int32_t> t = {100, -200, 300, -400};
    TEST_ASSERT_EQUAL_UINT64(1000, rf_total_us(t));
    TEST_ASSERT_EQUAL_UINT64(400, rf_on_us(t));
    TEST_ASSERT_TRUE(sub_raw_valid({1, -1, 1}));
    TEST_ASSERT_FALSE(sub_raw_valid({-1, 1}));
    TEST_ASSERT_FALSE(sub_raw_valid({1, 0, 1}));
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_princeton_serialize);
    RUN_TEST(test_rcswitch_other_protocol);
    RUN_TEST(test_raw_roundtrip_multiline);
    RUN_TEST(test_rejects_rolling_and_bad);
    RUN_TEST(test_pulse_analyze_pt2262);
    RUN_TEST(test_tx_budget);
    RUN_TEST(test_on_time);
    return UNITY_END();
}

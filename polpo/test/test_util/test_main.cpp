// Test di utilità: formato chiave/valore, esadecimali, UTF-8, Wi-Fi, menu.
#include <unity.h>

#include "polpo/ui_model/menu.h"
#include "polpo/util/flipper_format.h"
#include "polpo/util/hex.h"
#include "polpo/util/strutil.h"
#include "polpo/util/utf8.h"
#include "polpo/wifi/channels.h"

using namespace polpo;

void setUp() {}
void tearDown() {}

void test_ff_parse() {
    FfDoc d;
    std::string err;
    TEST_ASSERT_TRUE(ff_parse("Filetype: Prova\r\nVersion: 3\n# commento\n\nchiave:  valore con spazi  \nk2: v2", d, err));
    TEST_ASSERT_EQUAL_STRING("Prova", d.filetype.c_str());
    TEST_ASSERT_EQUAL(3, d.version);
    TEST_ASSERT_EQUAL(2, d.lines.size());
    TEST_ASSERT_EQUAL_STRING("valore con spazi", d.lines[0].value.c_str());
    TEST_ASSERT_EQUAL_STRING("v2", d.lines[1].value.c_str());
    TEST_ASSERT_FALSE(ff_parse("Version: 1\nFiletype: x\n", d, err));
    TEST_ASSERT_FALSE(ff_parse("Filetype: x\nVersion: uno\n", d, err));
    TEST_ASSERT_FALSE(ff_parse("Filetype: x\nVersion: 1\nsenza due punti\n", d, err));
}

void test_hex() {
    std::vector<uint8_t> b;
    TEST_ASSERT_TRUE(parse_hex_bytes("07 00 ab FF", b));
    TEST_ASSERT_EQUAL(4, b.size());
    TEST_ASSERT_EQUAL_HEX8(0xAB, b[2]);
    TEST_ASSERT_TRUE(parse_hex_bytes("0700", b));
    TEST_ASSERT_EQUAL(2, b.size());
    TEST_ASSERT_FALSE(parse_hex_bytes("0 7", b));
    TEST_ASSERT_FALSE(parse_hex_bytes("zz", b));
    TEST_ASSERT_EQUAL_STRING("07 00 AB FF", to_hex(std::vector<uint8_t>{7, 0, 0xAB, 0xFF}).c_str());
    TEST_ASSERT_EQUAL_HEX32(0x5DA0, le32_from_bytes({0xA0, 0x5D, 0, 0}));
    TEST_ASSERT_EQUAL_HEX64(0x95D5D4, be_from_bytes(be_to_bytes(0x95D5D4, 8)));
}

void test_numbers() {
    uint32_t u;
    int32_t i;
    float f;
    TEST_ASSERT_TRUE(parse_u32("4294967295", u));
    TEST_ASSERT_FALSE(parse_u32("4294967296", u));
    TEST_ASSERT_FALSE(parse_u32("-1", u));
    TEST_ASSERT_FALSE(parse_u32("", u));
    TEST_ASSERT_TRUE(parse_i32("-1050", i));
    TEST_ASSERT_EQUAL(-1050, i);
    TEST_ASSERT_TRUE(parse_float("0.330000", f));
    TEST_ASSERT_FLOAT_WITHIN(0.0001f, 0.33f, f);
    TEST_ASSERT_FALSE(parse_float("abc", f));
    TEST_ASSERT_EQUAL_STRING("0.330000", format_float6(0.33f).c_str());
}

void test_utf8() {
    TEST_ASSERT_TRUE(utf8_valid("città è più"));
    TEST_ASSERT_FALSE(utf8_valid("\xC3"));
    TEST_ASSERT_FALSE(utf8_valid("\xC0\x80"));  // forma troppo lunga
    TEST_ASSERT_EQUAL(11, utf8_length("città è più"));
    std::string s;
    utf8_append(s, 0x20AC);
    TEST_ASSERT_EQUAL_STRING("€", s.c_str());
    TEST_ASSERT_EQUAL('e', ascii_fallback(0xE8));
}

void test_safe_filename() {
    TEST_ASSERT_EQUAL_STRING("Telecomando_Sala_e", safe_filename("Telecomando Sala è").c_str());
    TEST_ASSERT_EQUAL_STRING("senza_nome", safe_filename("///").c_str());
    TEST_ASSERT_EQUAL_STRING("nascosto", safe_filename("..nascosto").c_str());
    TEST_ASSERT_EQUAL(32, safe_filename(std::string(100, 'a')).size());
    TEST_ASSERT_EQUAL_STRING("a..b", safe_filename("a/../b").c_str());
}

void test_wifi_channels() {
    std::vector<WifiSeen> nets = {{1, -40}, {1, -50}, {6, -45}, {6, -60}, {11, -90}};
    auto cl = wifi_channel_load(nets);
    TEST_ASSERT_EQUAL(11, cl.best);
    TEST_ASSERT_TRUE(cl.load[1] > cl.load[11]);
    TEST_ASSERT_TRUE(cl.load[3] > 0.0f);   // sovrapposizione dal canale 1
    TEST_ASSERT_TRUE(cl.load[9] == 0.0f ? false : true);
    auto empty = wifi_channel_load({});
    TEST_ASSERT_EQUAL(1, empty.best);
    TEST_ASSERT_EQUAL(4, rssi_bars(-40));
    TEST_ASSERT_EQUAL(0, rssi_bars(-95));
}

void test_menu() {
    MenuModel m;
    m.visible = 3;
    m.set_count(5);
    m.up();
    TEST_ASSERT_EQUAL(4, m.selected);
    TEST_ASSERT_EQUAL(2, m.top);
    m.down();
    TEST_ASSERT_EQUAL(0, m.selected);
    TEST_ASSERT_EQUAL(0, m.top);
    m.page_down();
    TEST_ASSERT_EQUAL(3, m.selected);
    TEST_ASSERT_EQUAL(1, m.top);
    m.set_count(2);
    TEST_ASSERT_EQUAL(1, m.selected);
    TEST_ASSERT_EQUAL(0, m.top);
    m.set_count(0);
    m.down();
    TEST_ASSERT_EQUAL(0, m.selected);
}

void test_key_repeat() {
    KeyRepeat r(400, 100);
    TEST_ASSERT_TRUE(r.update(true, 1000));
    TEST_ASSERT_FALSE(r.update(true, 1200));
    TEST_ASSERT_TRUE(r.update(true, 1400));
    TEST_ASSERT_FALSE(r.update(true, 1450));
    TEST_ASSERT_TRUE(r.update(true, 1500));
    TEST_ASSERT_FALSE(r.update(false, 1510));
    TEST_ASSERT_TRUE(r.update(true, 1520));
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_ff_parse);
    RUN_TEST(test_hex);
    RUN_TEST(test_numbers);
    RUN_TEST(test_utf8);
    RUN_TEST(test_safe_filename);
    RUN_TEST(test_wifi_channels);
    RUN_TEST(test_menu);
    RUN_TEST(test_key_repeat);
    return UNITY_END();
}

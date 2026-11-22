// Test di layout tastiera e interprete DuckyScript.
#include <unity.h>

#include "polpo/ducky/ducky.h"
#include "polpo/hid/hid_keys.h"

using namespace polpo;
using namespace polpo::hid;

void setUp() {}
void tearDown() {}

void test_layout_it() {
    KeyStroke k;
    TEST_ASSERT_TRUE(layout_lookup(KbLayout::IT, '@', k));
    TEST_ASSERT_EQUAL_HEX8(kModRAlt, k.modifiers);
    TEST_ASSERT_EQUAL_HEX8(kKeySemicolon, k.keycode);
    TEST_ASSERT_TRUE(layout_lookup(KbLayout::IT, '{', k));
    TEST_ASSERT_EQUAL_HEX8(kModRAlt | kModLShift, k.modifiers);
    TEST_ASSERT_EQUAL_HEX8(kKeyLeftBracket, k.keycode);
    TEST_ASSERT_TRUE(layout_lookup(KbLayout::IT, 0xE8, k));  // è
    TEST_ASSERT_EQUAL_HEX8(0, k.modifiers);
    TEST_ASSERT_EQUAL_HEX8(kKeyLeftBracket, k.keycode);
    TEST_ASSERT_TRUE(layout_lookup(KbLayout::IT, '-', k));
    TEST_ASSERT_EQUAL_HEX8(kKeySlash, k.keycode);
    TEST_ASSERT_TRUE(layout_lookup(KbLayout::IT, 'Q', k));
    TEST_ASSERT_EQUAL_HEX8(kModLShift, k.modifiers);
    TEST_ASSERT_FALSE(layout_lookup(KbLayout::IT, '`', k));
    TEST_ASSERT_FALSE(layout_lookup(KbLayout::IT, '~', k));
}

void test_layout_us() {
    KeyStroke k;
    TEST_ASSERT_TRUE(layout_lookup(KbLayout::US, '@', k));
    TEST_ASSERT_EQUAL_HEX8(kModLShift, k.modifiers);
    TEST_ASSERT_EQUAL_HEX8(0x1F, k.keycode);
    TEST_ASSERT_TRUE(layout_lookup(KbLayout::US, '~', k));
    TEST_ASSERT_FALSE(layout_lookup(KbLayout::US, 0xE8, k));  // è non esiste sul layout US
}

void test_every_ascii_on_us() {
    for (uint32_t c = 0x20; c < 0x7F; ++c) {
        KeyStroke k;
        TEST_ASSERT_TRUE_MESSAGE(layout_lookup(KbLayout::US, c, k), "carattere ASCII mancante");
        TEST_ASSERT_NOT_EQUAL(0, k.keycode);
    }
}

void test_every_ascii_on_it_except_two() {
    int missing = 0;
    for (uint32_t c = 0x20; c < 0x7F; ++c) {
        KeyStroke k;
        if (!layout_lookup(KbLayout::IT, c, k)) {
            ++missing;
            TEST_ASSERT_TRUE(c == '`' || c == '~');
        }
    }
    TEST_ASSERT_EQUAL(2, missing);
}

void test_basic_script() {
    const char* src =
        "REM apre il blocco note e scrive un saluto\n"
        "DELAY 500\n"
        "GUI r\n"
        "DELAY 300\n"
        "STRING notepad\n"
        "ENTER\n"
        "STRINGLN Ciao, è il Polpo!\n"
        "CTRL-ALT DELETE\n";
    auto s = ducky_parse(src, KbLayout::IT);
    TEST_ASSERT_TRUE(s.ok());
    TEST_ASSERT_EQUAL(8, s.line_count);
    TEST_ASSERT_EQUAL(8, s.actions.size());
    TEST_ASSERT_TRUE(s.actions[0].type == DuckyActionType::Delay);
    TEST_ASSERT_EQUAL_UINT32(500, s.actions[0].ms);
    TEST_ASSERT_TRUE(s.actions[1].type == DuckyActionType::Key);
    TEST_ASSERT_EQUAL_HEX8(kModLGui, s.actions[1].modifiers);
    TEST_ASSERT_EQUAL_HEX8(kKeyA + ('r' - 'a'), s.actions[1].keycode);
    TEST_ASSERT_TRUE(s.actions[3].type == DuckyActionType::Text);
    TEST_ASSERT_EQUAL_STRING("notepad", s.actions[3].text.c_str());
    TEST_ASSERT_TRUE(s.actions[6].type == DuckyActionType::Key);  // ENTER di STRINGLN
    TEST_ASSERT_EQUAL_HEX8(kModLCtrl | kModLAlt, s.actions[7].modifiers);
    TEST_ASSERT_EQUAL_HEX8(kKeyDelete, s.actions[7].keycode);
    TEST_ASSERT_EQUAL_UINT32(800, s.total_delay_ms);
    TEST_ASSERT_EQUAL_UINT32(7 + 17, s.total_chars);
}

void test_untypeable_char_is_error() {
    auto s = ducky_parse("STRING ls ~\n", KbLayout::IT);
    TEST_ASSERT_FALSE(s.ok());
    TEST_ASSERT_EQUAL(1, s.errors[0].line);
    auto u = ducky_parse("STRING ls ~\n", KbLayout::US);
    TEST_ASSERT_TRUE(u.ok());
}

void test_default_delay_and_repeat() {
    auto s = ducky_parse("DEFAULT_DELAY 100\nTAB\nREPEAT 3\nSTRING a\n", KbLayout::US);
    TEST_ASSERT_TRUE(s.ok());
    // TAB+delay, poi 3 volte (TAB+delay), poi STRING+delay
    TEST_ASSERT_EQUAL(2 + 6 + 2, s.actions.size());
    TEST_ASSERT_EQUAL_UINT32(500, s.total_delay_ms);
}

void test_errors() {
    auto s = ducky_parse("FOO BAR\nDELAY abc\nREPEAT 2\nDELAY 999999\nCTRL NOTAKEY\n", KbLayout::US);
    TEST_ASSERT_EQUAL(5, s.errors.size());
    TEST_ASSERT_EQUAL(1, s.errors[0].line);
    TEST_ASSERT_EQUAL(5, s.errors[4].line);
}

void test_function_and_named_keys() {
    auto s = ducky_parse("F5\nALT F4\nshift tab\nWINDOWS\nPRINTSCREEN\n", KbLayout::US);
    TEST_ASSERT_TRUE(s.ok());
    TEST_ASSERT_EQUAL_HEX8(kKeyF1 + 4, s.actions[0].keycode);
    TEST_ASSERT_EQUAL_HEX8(kModLAlt, s.actions[1].modifiers);
    TEST_ASSERT_EQUAL_HEX8(kKeyF1 + 3, s.actions[1].keycode);
    TEST_ASSERT_EQUAL_HEX8(kModLShift, s.actions[2].modifiers);
    TEST_ASSERT_EQUAL_HEX8(kKeyTab, s.actions[2].keycode);
    TEST_ASSERT_EQUAL_HEX8(kModLGui, s.actions[3].modifiers);
    TEST_ASSERT_EQUAL_HEX8(0, s.actions[3].keycode);
}

void test_limits() {
    std::string big(kDuckyMaxBytes + 1, 'a');
    TEST_ASSERT_FALSE(ducky_parse(big, KbLayout::US).ok());
    std::string many;
    for (int i = 0; i < 20; ++i) many += "TAB\nREPEAT 500\n";
    auto s = ducky_parse(many, KbLayout::US);
    TEST_ASSERT_FALSE(s.ok());
    TEST_ASSERT_TRUE(s.actions.size() <= kDuckyMaxActions);
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_layout_it);
    RUN_TEST(test_layout_us);
    RUN_TEST(test_every_ascii_on_us);
    RUN_TEST(test_every_ascii_on_it_except_two);
    RUN_TEST(test_basic_script);
    RUN_TEST(test_untypeable_char_is_error);
    RUN_TEST(test_default_delay_and_repeat);
    RUN_TEST(test_errors);
    RUN_TEST(test_function_and_named_keys);
    RUN_TEST(test_limits);
    return UNITY_END();
}

// Test NDEF e tag Type 2.
#include <unity.h>

#include <cstring>

#include "polpo/nfc/ndef.h"
#include "polpo/nfc/type2.h"

using namespace polpo;

void setUp() {}
void tearDown() {}

void test_uri_vector() {
    const auto tlv = ndef_wrap_tlv(ndef_uri_message("https://www.example.com"));
    const uint8_t expected[] = {0x03, 0x10, 0xD1, 0x01, 0x0C, 0x55, 0x02, 'e', 'x', 'a', 'm',
                                'p',  'l',  'e',  '.',  'c',  'o',  'm',  0xFE};
    TEST_ASSERT_EQUAL(sizeof expected, tlv.size());
    TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, tlv.data(), sizeof expected);
}

void test_uri_prefix_choice() {
    auto m = ndef_uri_message("tel:+390212345678");
    TEST_ASSERT_EQUAL_HEX8(0x05, m[4]);
    m = ndef_uri_message("https://example.com");
    TEST_ASSERT_EQUAL_HEX8(0x04, m[4]);
    m = ndef_uri_message("geo:45.46,9.19");
    TEST_ASSERT_EQUAL_HEX8(0x00, m[4]);
}

void test_text_vector() {
    const auto m = ndef_text_message("Ciao", "it");
    const uint8_t expected[] = {0xD1, 0x01, 0x07, 0x54, 0x02, 'i', 't', 'C', 'i', 'a', 'o'};
    TEST_ASSERT_EQUAL(sizeof expected, m.size());
    TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, m.data(), sizeof expected);
}

void test_parse_roundtrip() {
    std::vector<NdefRecord> recs;
    std::string err;
    TEST_ASSERT_TRUE(ndef_parse(ndef_uri_message("mailto:polpo@example.org"), recs, err));
    TEST_ASSERT_EQUAL(1, recs.size());
    TEST_ASSERT_TRUE(recs[0].kind == NdefKind::Uri);
    TEST_ASSERT_EQUAL_STRING("mailto:polpo@example.org", recs[0].value.c_str());
    TEST_ASSERT_TRUE(ndef_parse(ndef_text_message("Buongiorno è così", "it"), recs, err));
    TEST_ASSERT_TRUE(recs[0].kind == NdefKind::Text);
    TEST_ASSERT_EQUAL_STRING("it", recs[0].lang.c_str());
    TEST_ASSERT_EQUAL_STRING("Buongiorno è così", recs[0].value.c_str());
    TEST_ASSERT_EQUAL_STRING("Testo (it): Buongiorno è così", ndef_describe(recs[0]).c_str());
}

void test_long_record_and_tlv() {
    std::string longtext(300, 'x');
    const auto m = ndef_text_message(longtext, "en");
    TEST_ASSERT_EQUAL_HEX8(0xC1, m[0]);  // niente SR
    const auto tlv = ndef_wrap_tlv(m);
    TEST_ASSERT_EQUAL_HEX8(0xFF, tlv[1]);
    std::vector<uint8_t> found;
    TEST_ASSERT_TRUE(ndef_find_in_tlv(tlv.data(), tlv.size(), found));
    TEST_ASSERT_TRUE(found == m);
    std::vector<NdefRecord> recs;
    std::string err;
    TEST_ASSERT_TRUE(ndef_parse(found, recs, err));
    TEST_ASSERT_EQUAL(300, recs[0].value.size());
}

void test_find_skips_other_tlvs() {
    // Lock Control TLV, NULL, poi NDEF
    const uint8_t mem[] = {0x01, 0x03, 0xA0, 0x0C, 0x34, 0x00, 0x03, 0x03, 0xD0, 0x00, 0x00, 0xFE, 0x00};
    std::vector<uint8_t> msg;
    TEST_ASSERT_TRUE(ndef_find_in_tlv(mem, sizeof mem, msg));
    TEST_ASSERT_EQUAL(3, msg.size());
    const uint8_t empty[] = {0x03, 0x00, 0xFE};
    TEST_ASSERT_TRUE(ndef_find_in_tlv(empty, sizeof empty, msg));
    TEST_ASSERT_EQUAL(0, msg.size());
    const uint8_t none[] = {0x00, 0x00, 0xFE, 0x03};
    TEST_ASSERT_FALSE(ndef_find_in_tlv(none, sizeof none, msg));
    const uint8_t truncated[] = {0x03, 0x20, 0xD1};
    TEST_ASSERT_FALSE(ndef_find_in_tlv(truncated, sizeof truncated, msg));
}

void test_parse_rejects_truncated() {
    std::vector<NdefRecord> recs;
    std::string err;
    TEST_ASSERT_FALSE(ndef_parse({0xD1, 0x01, 0x20, 0x55, 0x01}, recs, err));
    TEST_ASSERT_FALSE(ndef_parse({}, recs, err));
}

void test_version_models() {
    const uint8_t v213[8] = {0x00, 0x04, 0x04, 0x02, 0x01, 0x00, 0x0F, 0x03};
    const uint8_t v215[8] = {0x00, 0x04, 0x04, 0x02, 0x01, 0x00, 0x11, 0x03};
    const uint8_t v216[8] = {0x00, 0x04, 0x04, 0x02, 0x01, 0x00, 0x13, 0x03};
    const uint8_t vul11[8] = {0x00, 0x04, 0x03, 0x01, 0x01, 0x00, 0x0B, 0x03};
    const uint8_t other[8] = {0x00, 0x53, 0x04, 0x02, 0x01, 0x00, 0x0F, 0x03};
    TEST_ASSERT_TRUE(type2_model_from_version(v213) == Type2Model::NTAG213);
    TEST_ASSERT_TRUE(type2_model_from_version(v215) == Type2Model::NTAG215);
    TEST_ASSERT_TRUE(type2_model_from_version(v216) == Type2Model::NTAG216);
    TEST_ASSERT_TRUE(type2_model_from_version(vul11) == Type2Model::UltralightEV1_11);
    TEST_ASSERT_TRUE(type2_model_from_version(other) == Type2Model::Unknown);
    TEST_ASSERT_EQUAL(39, type2_info(Type2Model::NTAG213).user_last);
    TEST_ASSERT_EQUAL(129, type2_info(Type2Model::NTAG215).user_last);
    TEST_ASSERT_EQUAL(225, type2_info(Type2Model::NTAG216).user_last);
}

void test_card_family() {
    TEST_ASSERT_TRUE(card_family(0x08, 0x0004).find("Classic 1K") != std::string::npos);
    TEST_ASSERT_TRUE(card_family(0x00, 0x0044).find("Type 2") != std::string::npos);
    TEST_ASSERT_TRUE(card_family(0x20, 0x0344).find("DESFire") != std::string::npos);
}

void test_write_plan_ok() {
    const auto& info = type2_info(Type2Model::NTAG213);
    const uint8_t p2[4] = {0x88, 0x44, 0x00, 0x00};
    const uint8_t p3[4] = {0xE1, 0x10, 0x12, 0x00};
    const uint8_t dyn[4] = {0x00, 0x00, 0x00, 0xBD};
    const auto tlv = ndef_wrap_tlv(ndef_uri_message("https://www.example.com"));  // 19 byte
    std::vector<PageWrite> plan;
    TEST_ASSERT_TRUE(type2_plan_ndef_write(info, p2, p3, dyn, tlv, plan) == WritePlanError::None);
    TEST_ASSERT_EQUAL(5, plan.size());
    TEST_ASSERT_EQUAL(4, plan[0].page);
    TEST_ASSERT_EQUAL(8, plan[4].page);
    TEST_ASSERT_EQUAL_HEX8(0x03, plan[0].data[0]);
    TEST_ASSERT_EQUAL_HEX8(0xFE, plan[4].data[2]);
    TEST_ASSERT_EQUAL_HEX8(0x00, plan[4].data[3]);
    for (const auto& w : plan) TEST_ASSERT_TRUE(w.page >= 4 && w.page <= 39);
}

void test_write_plan_refusals() {
    const auto& info = type2_info(Type2Model::NTAG213);
    const uint8_t p2ok[4] = {0, 0, 0, 0};
    const uint8_t p2locked[4] = {0, 0, 0x08, 0};
    const uint8_t p3ok[4] = {0xE1, 0x10, 0x12, 0x00};
    const uint8_t p3ro[4] = {0xE1, 0x10, 0x12, 0x0F};
    const uint8_t p3blank[4] = {0, 0, 0, 0};
    const uint8_t dynok[4] = {0, 0, 0, 0};
    const uint8_t dynlocked[4] = {0x01, 0, 0, 0};
    const auto small = ndef_wrap_tlv(ndef_text_message("ok"));
    const auto huge = ndef_wrap_tlv(ndef_text_message(std::string(200, 'x')));
    std::vector<PageWrite> plan;
    TEST_ASSERT_TRUE(type2_plan_ndef_write(info, p2ok, p3ro, dynok, small, plan) == WritePlanError::ReadOnly);
    TEST_ASSERT_TRUE(type2_plan_ndef_write(info, p2ok, p3blank, dynok, small, plan) == WritePlanError::NotNdefFormatted);
    TEST_ASSERT_TRUE(type2_plan_ndef_write(info, p2locked, p3ok, dynok, small, plan) == WritePlanError::StaticLocked);
    TEST_ASSERT_TRUE(type2_plan_ndef_write(info, p2ok, p3ok, dynlocked, small, plan) == WritePlanError::DynamicLocked);
    TEST_ASSERT_TRUE(type2_plan_ndef_write(info, p2ok, p3ok, nullptr, small, plan) == WritePlanError::DynamicLocked);
    TEST_ASSERT_TRUE(type2_plan_ndef_write(info, p2ok, p3ok, dynok, huge, plan) == WritePlanError::TooBig);
    TEST_ASSERT_TRUE(type2_plan_ndef_write(type2_info(Type2Model::Unknown), p2ok, p3ok, dynok, small, plan) ==
                     WritePlanError::UnknownModel);
    TEST_ASSERT_TRUE(plan.empty());
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_uri_vector);
    RUN_TEST(test_uri_prefix_choice);
    RUN_TEST(test_text_vector);
    RUN_TEST(test_parse_roundtrip);
    RUN_TEST(test_long_record_and_tlv);
    RUN_TEST(test_find_skips_other_tlvs);
    RUN_TEST(test_parse_rejects_truncated);
    RUN_TEST(test_version_models);
    RUN_TEST(test_card_family);
    RUN_TEST(test_write_plan_ok);
    RUN_TEST(test_write_plan_refusals);
    return UNITY_END();
}

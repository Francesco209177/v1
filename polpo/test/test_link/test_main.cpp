// Test del protocollo Polpo Link (parte pura) e dei casi "golden" condivisi con Polpo Studio.
#include <unity.h>

#include <fstream>
#include <string>

#include "polpo/link/link_proto.h"

using namespace polpo::link;

void setUp() {}
void tearDown() {}

static std::string read_golden() {
    for (const char* p : {"test/golden/link_pure.jsonl", "../test/golden/link_pure.jsonl"}) {
        std::ifstream f(p);
        if (f) return std::string((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    }
    return "";
}

void test_golden_cases() {
    const std::string all = read_golden();
    TEST_ASSERT_TRUE_MESSAGE(!all.empty(), "file golden non trovato");
    size_t pos = 0;
    int n = 0;
    while (pos < all.size()) {
        size_t nl = all.find('\n', pos);
        if (nl == std::string::npos) nl = all.size();
        const std::string line = all.substr(pos, nl - pos);
        pos = nl + 1;
        if (line.empty()) continue;
        JsonDocument c;
        TEST_ASSERT_FALSE(deserializeJson(c, line));
        Request r;
        const std::string got = preprocess(c["send"].as<std::string>(), c["session"], c["busy"], r);
        const std::string name = c["name"].as<std::string>();
        if (c["expect"].isNull()) {
            TEST_ASSERT_TRUE_MESSAGE(got.empty(), name.c_str());
            TEST_ASSERT_NOT_NULL_MESSAGE(r.spec, name.c_str());
        } else {
            std::string want;
            serializeJson(c["expect"], want);
            TEST_ASSERT_EQUAL_STRING_MESSAGE(want.c_str(), got.c_str(), name.c_str());
        }
        ++n;
    }
    TEST_ASSERT_TRUE(n >= 14);
}

void test_framer() {
    LineFramer f;
    std::string got;
    for (char c : std::string("{\"a\":1}\r\n")) {
        if (f.feed(c) == LineFramer::Result::Line) got = f.take();
    }
    TEST_ASSERT_EQUAL_STRING("{\"a\":1}", got.c_str());
    int overflows = 0, lines = 0;
    for (size_t i = 0; i < kMaxLine + 50; ++i)
        if (f.feed('x') == LineFramer::Result::Overflow) ++overflows;
    if (f.feed('\n') == LineFramer::Result::Line) ++lines;
    TEST_ASSERT_EQUAL(1, overflows);
    TEST_ASSERT_EQUAL(0, lines);
    for (char c : std::string("ok\n"))
        if (f.feed(c) == LineFramer::Result::Line) got = f.take();
    TEST_ASSERT_EQUAL_STRING("ok", got.c_str());
}

void test_base64_rfc4648() {
    const char* in[] = {"", "f", "fo", "foo", "foob", "fooba", "foobar"};
    const char* out[] = {"", "Zg==", "Zm8=", "Zm9v", "Zm9vYg==", "Zm9vYmE=", "Zm9vYmFy"};
    for (int i = 0; i < 7; ++i) {
        const std::string s = in[i];
        TEST_ASSERT_EQUAL_STRING(out[i], base64_encode(reinterpret_cast<const uint8_t*>(s.data()), s.size()).c_str());
        std::vector<uint8_t> back;
        TEST_ASSERT_TRUE(base64_decode(out[i], back));
        TEST_ASSERT_EQUAL_STRING(in[i], std::string(back.begin(), back.end()).c_str());
    }
    std::vector<uint8_t> v;
    TEST_ASSERT_FALSE(base64_decode("Zg=", v));
    TEST_ASSERT_FALSE(base64_decode("Z===", v));
    TEST_ASSERT_FALSE(base64_decode("Zm9v!A==", v));
}

void test_crc32() {
    const std::string s = "123456789";
    TEST_ASSERT_EQUAL_HEX32(0xCBF43926, crc32(reinterpret_cast<const uint8_t*>(s.data()), s.size()));
    // a blocchi = tutto insieme
    uint32_t c = crc32(reinterpret_cast<const uint8_t*>(s.data()), 4);
    c = crc32(reinterpret_cast<const uint8_t*>(s.data()) + 4, 5, c);
    TEST_ASSERT_EQUAL_HEX32(0xCBF43926, c);
}

void test_paths() {
    TEST_ASSERT_TRUE(valid_sd_path("/polpo"));
    TEST_ASSERT_TRUE(valid_sd_path("/polpo/ir/esempio_tv.ir"));
    TEST_ASSERT_FALSE(valid_sd_path("/polpox/a"));
    TEST_ASSERT_FALSE(valid_sd_path("/polpo/../boot"));
    TEST_ASSERT_FALSE(valid_sd_path("/etc/passwd"));
    TEST_ASSERT_FALSE(valid_sd_path("/polpo/a b"));
    TEST_ASSERT_FALSE(valid_sd_path("/polpo//x"));
    TEST_ASSERT_TRUE(is_sensitive_path("/polpo/badusb/x.txt"));
    TEST_ASSERT_FALSE(is_sensitive_path("/polpo/ir/x.ir"));
}

void test_responses() {
    TEST_ASSERT_EQUAL_STRING("{\"id\":3,\"ok\":true,\"data\":{}}", make_ok(3).c_str());
    JsonDocument d;
    d["x"] = 1;
    TEST_ASSERT_EQUAL_STRING("{\"ev\":\"rf.code\",\"data\":{\"x\":1}}", make_event("rf.code", d).c_str());
    TEST_ASSERT_TRUE(find_command("rf.tx")->sensitive);
    TEST_ASSERT_FALSE(find_command("hello")->needs_session);
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_golden_cases);
    RUN_TEST(test_framer);
    RUN_TEST(test_base64_rfc4648);
    RUN_TEST(test_crc32);
    RUN_TEST(test_paths);
    RUN_TEST(test_responses);
    return UNITY_END();
}

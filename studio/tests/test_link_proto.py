"""La copia Python del protocollo deve comportarsi come il firmware (stesso file golden)."""

import re

import pytest

from polpo_studio.protocols import link, ndef

from .conftest import REPO


def test_golden_cases_match_firmware(golden_cases):
    assert len(golden_cases) >= 14
    for case in golden_cases:
        resp, req = link.preprocess(case["send"], case["session"], case["busy"])
        assert resp == case["expect"], case["name"]
        if case["expect"] is None:
            assert req.spec is not None and req.cmd


def test_command_table_matches_firmware():
    src = (REPO / "polpo/lib/polpo_core/src/polpo/link/link_proto.cpp").read_text(encoding="utf-8")
    table = re.findall(r'\{"([a-z0-9_.]+)", (true|false), (true|false)\}', src)
    fw = {name: (s == "true", x == "true") for name, s, x in table}
    py = {c.name: (c.needs_session, c.sensitive) for c in link.COMMANDS.values()}
    assert fw == py


def test_constants_match_firmware():
    src = (REPO / "polpo/lib/polpo_core/src/polpo/link/link_proto.h").read_text(encoding="utf-8")
    assert f"kProtocolVersion = {link.PROTOCOL_VERSION};" in src
    assert f"kMaxLine = {link.MAX_LINE};" in src
    assert f"kMaxChunk = {link.MAX_CHUNK};" in src
    assert "kMaxFileSize = 256 * 1024;" in src and link.MAX_FILE_SIZE == 256 * 1024


def test_framer_lines_cr_and_split_chunks():
    f = link.LineFramer()
    assert f.feed(b'{"a":1}\r\n{"b"') == [b'{"a":1}']
    assert f.feed(b":2}\n\n") == [b'{"b":2}', b""]


def test_framer_overflow_reported_once_then_recovers():
    f = link.LineFramer(8)
    assert f.feed(b"12345678") == []
    assert f.feed(b"9") == [None]
    assert f.feed(b"more garbage") == []
    assert f.feed(b"\nok\n") == [b"ok"]
    g = link.LineFramer(8)
    assert g.feed(b"12345678\n") == [b"12345678"]  # esattamente al limite: accettata


def test_line_too_long_and_nesting():
    resp, _ = link.preprocess(b"x" * 2049, True, False)
    assert resp["error"]["code"] == "line_too_long"
    deep = '{"id":1,"cmd":"info","args":' + '{"a":' * 6 + "1" + "}" * 6 + "}"
    assert link.preprocess(deep, True, False)[0]["error"]["code"] == "bad_json"
    ok = '{"id":1,"cmd":"info","args":' + '{"a":' * 4 + "1" + "}" * 4 + "}"
    assert link.preprocess(ok, True, False)[0] is None


def test_ids_and_types():
    assert link.preprocess('{"id":true,"cmd":"ping"}', 0, 0)[0]["error"]["msg"] == "manca un id numerico"
    assert link.preprocess('{"id":1.5,"cmd":"ping"}', 0, 0)[0]["error"]["msg"] == "manca un id numerico"
    assert link.preprocess('{"id":4294967296,"cmd":"ping"}', 0, 0)[0]["error"]["msg"] == "manca un id numerico"
    assert link.preprocess('{"id":4294967295,"cmd":"ping"}', 0, 0)[0]["ok"] is True
    assert link.preprocess('{"id":2,"cmd":"info","args":null}', True, False)[0] is None
    assert link.preprocess('{"id":2,"cmd":"ping","x":NaN}', True, False)[0]["error"]["code"] == "bad_json"


def test_base64_and_crc():
    assert link.crc32(b"123456789") == 0xCBF43926
    for raw, enc in [(b"", ""), (b"f", "Zg=="), (b"fo", "Zm8="), (b"foo", "Zm9v"), (b"foobar", "Zm9vYmFy")]:
        assert link.b64encode(raw) == enc
        assert link.b64decode(enc) == raw
    for bad in ("Zg=", "Z===", "Zm9v!A==", "AB=C"):
        assert link.b64decode(bad) is None


@pytest.mark.parametrize(
    "path,ok",
    [
        ("/polpo", True),
        ("/polpo/ir/esempio_tv.ir", True),
        ("/polpox/a", False),
        ("/polpo/../boot", False),
        ("/etc/passwd", False),
        ("/polpo/a b", False),
        ("/polpo//x", False),
        ("/polpo/" + "a" * 90, False),
    ],
)
def test_sd_paths(path, ok):
    assert link.valid_sd_path(path) is ok


def test_sensitive_paths():
    assert link.is_sensitive_path("/polpo/badusb/x.txt")
    assert not link.is_sensitive_path("/polpo/ir/x.ir")


def test_encode_is_compact_utf8():
    assert link.encode({"id": 1, "cmd": "hello", "args": {"client": "Polpo è"}}) == '{"id":1,"cmd":"hello","args":{"client":"Polpo è"}}'.encode()


def test_ndef_roundtrip():
    m = ndef.uri_message("https://www.example.org/x")
    assert m[:4] == bytes([0xD1, 0x01, len(m) - 4, ord("U")]) and m[4] == 0x02
    tlv = ndef.wrap_tlv(m)
    assert tlv[0] == 0x03 and tlv[-1] == 0xFE
    recs = ndef.parse(ndef.find_in_tlv(b"\x00" + tlv + b"\x00" * 8))
    assert recs[0].kind == "uri" and recs[0].value == "https://www.example.org/x"
    t = ndef.parse(ndef.text_message("ciao", "it"))[0]
    assert (t.kind, t.lang, t.value) == ("text", "it", "ciao")
    with pytest.raises(ValueError):
        ndef.parse(b"\xd1\x01\x09U\x01ab")


def test_bundled_golden_copy_is_identical():
    """L'autodiagnosi del pacchetto usa una copia dei casi golden: deve restare uguale all'originale."""
    from .conftest import GOLDEN

    bundled = REPO / "studio/polpo_studio/resources/link_pure.jsonl"
    assert bundled.read_bytes() == GOLDEN.read_bytes()

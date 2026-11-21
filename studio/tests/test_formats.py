"""Formati .ir, .sub, Type 2: stesse regole del firmware."""

import pytest

from polpo_studio.devices.virtual_polpo import VirtualPolpo
from polpo_studio.protocols import flipper_format as ff
from polpo_studio.protocols import ir, link, subghz, type2

from .conftest import REPO


def test_ir_sample_from_sd_template_parses_and_roundtrips():
    text = (REPO / "polpo/sd_template/polpo/ir/esempio_tv.ir").read_text(encoding="utf-8")
    f = ir.parse(text)
    assert f.signals and not f.warnings
    again = ir.parse(ir.serialize(f))
    assert [(s.name, s.protocol, s.address, s.command, s.raw, s.timings) for s in again.signals] == [
        (s.name, s.protocol, s.address, s.command, s.raw, s.timings) for s in f.signals
    ]


def test_ir_validation_and_warnings():
    text = (
        "Filetype: IR signals file\nVersion: 1\n#\nname: ok\ntype: parsed\nprotocol: NEC\naddress: 04 00 00 00\ncommand: 08 00 00 00\n"
        "#\nname: grande\ntype: parsed\nprotocol: NEC\naddress: 00 01 00 00\ncommand: 08 00 00 00\n"
        "#\nname: ignoto\ntype: parsed\nprotocol: Boh\n"
        "#\nname: raw\ntype: raw\nfrequency: 38000\nduty_cycle: 0.330000\ndata: 9000 4500\ndata: 560 560\n"
    )
    f = ir.parse(text)
    assert [s.name for s in f.signals] == ["ok", "raw"]
    assert f.signals[1].timings == [9000, 4500, 560, 560]
    assert len(f.warnings) == 2 and "indirizzo troppo grande" in f.warnings[0]
    assert f.signals[0].link_args() == {"protocol": "NEC", "address": 4, "command": 8}
    with pytest.raises(ff.FormatError):
        ir.parse("Filetype: altro\nVersion: 1\n")
    assert ir.Signal("x", raw=True, timings=[200_000]).validate().startswith("tempo RAW")


def test_ir_library_matches_firmware_table():
    src = (REPO / "polpo/lib/polpo_core/src/polpo/ir/ir_library.cpp").read_text(encoding="utf-8")
    import re

    rows = re.findall(r"\{C::(\w+), \"([^\"]+)\", B::(\w+), P::(\w+), (0x[0-9A-Fa-f]+), (0x[0-9A-Fa-f]+)\}", src)
    btn = {"Power": "power", "VolUp": "vol_up", "VolDown": "vol_down", "Mute": "mute", "ChUp": "ch_up", "ChDown": "ch_down"}
    fw = [(c.lower(), b, btn[k], p, int(a, 16), int(cmd, 16)) for c, b, k, p, a, cmd in rows]
    py = [(c.category, c.brand, c.button, c.protocol, c.address, c.command) for c in ir.LIBRARY]
    assert fw == py
    for c in ir.LIBRARY:
        assert c.signal().validate() == "", c


def test_sub_roundtrip_and_rules():
    f = subghz.SubFile(code=subghz.RcCode(1, 24, 0x515A01, 350))
    text = subghz.serialize(f)
    assert "Protocol: Princeton" in text and "Key: 00 00 00 00 00 51 5A 01" in text
    g = subghz.parse(text)
    assert (g.code.protocol, g.code.bits, g.code.value, g.code.pulse_us) == (1, 24, 0x515A01, 350)
    assert subghz.check_transmittable(g) == ""
    g.frequency = 868_350_000
    assert "433,92" in subghz.check_transmittable(g)
    with pytest.raises(subghz.Unsupported):
        subghz.parse(text.replace("Princeton", "KeeLoq"))
    with pytest.raises(ff.FormatError):
        subghz.parse(text.replace("Bit: 24", "Bit: 8"))
    raw = subghz.SubFile(raw=True, raw_timings=[350, -1050] * 300)
    r = subghz.parse(subghz.serialize(raw))
    assert r.raw and r.raw_timings == raw.raw_timings
    assert subghz.parse(subghz.serialize(raw).replace("RAW_Data: 350", "RAW_Data: -5000 350", 1)).raw_timings[0] == 350


def test_virtual_samples_parse():
    dev = VirtualPolpo()
    try:
        ok = subghz.parse(dev.files["/polpo/rf433/presa_simulata.sub"].decode())
        out = subghz.parse(dev.files["/polpo/rf433/fuori_banda_simulato.sub"].decode())
    finally:
        dev.shutdown()
    assert subghz.check_transmittable(ok) == "" and subghz.check_transmittable(out) != ""


def test_pulse_analysis_like_firmware():
    t = []
    for i in range(24):
        t += [1050, -350] if i % 3 == 0 else [350, -1050]
    st = subghz.pulse_analyze(t + [350, -10850])
    assert (st.short_us, st.long_us, round(st.ratio, 1)) == (350, 1050, 3.0)
    assert "PT2262" in subghz.guess_protocol(st)
    assert subghz.pulse_analyze([]).count == 0
    assert subghz.rc_airtime_us(subghz.RcCode(1, 24, 0, 350), 1) == (4 * 24 + 32) * 350


def test_type2_analysis_of_virtual_tag():
    dev = VirtualPolpo()
    try:
        card = dev._card()
        card["pages"] = link.to_hex(bytes(dev.tag_pages[:130 * 4]))
    finally:
        dev.shutdown()
    a = type2.analyze(card)
    assert a.uid_ok and a.ndef_formatted and a.writable and not a.static_locked
    assert a.capacity == 0x3E * 8 and a.records[0].kind == "uri"
    assert any("password" in n for n in a.notes)
    assert type2.model_from_version(bytes.fromhex("0004040201001103")).name == "NTAG215"
    classic = type2.analyze({"uid": "11223344", "sak": 8, "atqa": 4})
    assert "MIFARE Classic" in classic.family and "per scelta" in classic.notes[0]

import pytest

from polpo_studio.devices.virtual_polpo import VirtualPolpo
from polpo_studio.protocols import link, ndef

from .conftest import REPO
from .helpers import LineCollector, send

FAST = dict(time_scale=0.01, latency=0.0, auto_confirm_delay=0.5)


@pytest.fixture
def dev():
    d = VirtualPolpo(**FAST)
    out = LineCollector()
    d.attach(out)
    d.out = out
    yield d
    d.shutdown()


def hello(dev, rid=1):
    send(dev, rid, "hello", {"client": "test"})
    r = dev.out.reply(rid)
    assert r["ok"], r
    return r["data"]


def test_golden_through_device(golden_cases):
    """Le risposte del dispositivo virtuale ai casi golden sono quelle del firmware."""
    for case in golden_cases:
        if case["expect"] is None or case["busy"]:
            continue
        d = VirtualPolpo(**FAST)
        out = LineCollector()
        d.attach(out)
        if case["session"]:
            d.session = True
        d.feed(case["send"].encode() + b"\n")
        exp = case["expect"]
        got = out.wait_for(lambda m: m.get("id") == exp["id"])
        assert got == exp, case["name"]
        d.shutdown()


def test_commands_need_hello(dev):
    send(dev, 5, "info")
    assert dev.out.reply(5)["error"]["code"] == "not_connected"
    info = hello(dev)
    assert info["board"] == "Polpo virtuale (SIMULATO)" and info["virtual"] is True
    assert set(info["modules"].values()) == {"simulated"}
    send(dev, 6, "info")
    assert dev.out.reply(6)["ok"]


def test_hello_denied_by_device_screen():
    d = VirtualPolpo(**FAST, confirm_handler=lambda title, body, respond: respond(False))
    out = LineCollector()
    d.attach(out)
    send(d, 1, "hello")
    assert out.reply(1)["error"] == {"code": "denied", "msg": "collegamento rifiutato sul Polpo"}
    assert not d.session
    d.shutdown()


def test_confirm_times_out_as_no():
    d = VirtualPolpo(**FAST, confirm_handler=lambda *a: None, confirm_timeout=20)
    out = LineCollector()
    d.attach(out)
    send(d, 1, "hello")
    assert out.reply(1, timeout=2)["error"]["code"] == "denied"  # 20 s * 0.01
    d.shutdown()


def test_busy_while_confirming():
    d = VirtualPolpo(**FAST, confirm_handler=lambda *a: None)
    out = LineCollector()
    d.attach(out)
    send(d, 1, "hello")
    send(d, 2, "hello")
    assert out.reply(2)["error"]["code"] == "busy"
    send(d, 3, "ping")
    assert out.reply(3)["data"] == {"pong": True, "proto": 1}
    d.shutdown()


def test_sd_seeded_from_template(dev):
    hello(dev)
    send(dev, 2, "fs.list", {"path": "/polpo"})
    names = {e["name"]: e for e in dev.out.reply(2)["data"]["entries"]}
    assert {"ir", "badusb", "rf433", "nfc", "logs", "LEGGIMI.txt"} <= set(names)
    assert names["ir"]["dir"] and not names["LEGGIMI.txt"]["dir"]
    template = (REPO / "polpo/sd_template/polpo/LEGGIMI.txt").read_bytes()
    assert names["LEGGIMI.txt"]["size"] == len(template)


def test_resources_match_firmware_template():
    src = REPO / "polpo/sd_template"
    dst = REPO / "studio/polpo_studio/resources/virtual_sd"
    for p in src.rglob("*"):
        if p.is_file():
            assert (dst / p.relative_to(src)).read_bytes() == p.read_bytes(), p


def test_fs_write_read_delete(dev):
    hello(dev)
    data = bytes(range(256)) * 4
    a = data[:768]
    send(dev, 2, "fs.write", {"path": "/polpo/logs/x.bin", "offset": 0, "data": link.b64encode(a), "crc32": link.crc32(a)})
    assert dev.out.reply(2)["data"] == {"written": 768, "final": False}
    assert "/polpo/logs/x.bin" not in dev.files  # ancora .part
    b = data[768:]
    send(dev, 3, "fs.write", {"path": "/polpo/logs/x.bin", "offset": 768, "data": link.b64encode(b), "crc32": link.crc32(b), "final": True})
    assert dev.out.reply(3)["ok"]
    assert dev.files["/polpo/logs/x.bin"] == data
    send(dev, 4, "fs.read", {"path": "/polpo/logs/x.bin", "offset": 1000})
    r = dev.out.reply(4)["data"]
    assert r["size"] == 1024 and r["eof"] and link.b64decode(r["data"]) == data[1000:]
    send(dev, 5, "fs.write", {"path": "/polpo/logs/y.bin", "offset": 10, "data": "", "crc32": 0})
    assert dev.out.reply(5)["error"]["msg"] == "offset non coerente: riparti da 0"
    send(dev, 6, "fs.write", {"path": "/polpo/logs/y.bin", "offset": 0, "data": "AAAA", "crc32": 1})
    assert dev.out.reply(6)["error"]["msg"] == "CRC32 diverso: blocco danneggiato"
    send(dev, 7, "fs.delete", {"path": "/polpo/logs/x.bin"})
    assert dev.out.reply(7)["ok"] and "/polpo/logs/x.bin" not in dev.files
    send(dev, 8, "fs.read", {"path": "/etc/passwd"})
    assert dev.out.reply(8)["error"]["code"] == "bad_args"


def test_badusb_write_needs_device_confirmation():
    asked = []
    d = VirtualPolpo(**FAST, confirm_handler=lambda t, b, respond: (asked.append(t), respond(t != "Script dal PC")))
    out = LineCollector()
    d.attach(out)
    send(d, 1, "hello")
    assert out.reply(1)["ok"]
    send(d, 2, "fs.write", {"path": "/polpo/badusb/s.txt", "offset": 0, "data": "", "crc32": 0, "final": True})
    assert out.reply(2)["error"]["code"] == "denied"
    assert asked == ["Collegare al PC?", "Script dal PC"]
    d.shutdown()


def test_rf_tx_rules(dev):
    hello(dev)
    send(dev, 2, "rf.tx", {"file": "/polpo/rf433/fuori_banda_simulato.sub"})
    assert dev.out.reply(2)["error"] == {"code": "unsupported", "msg": "il modulo RF433T trasmette solo a 433,92 MHz"}
    send(dev, 3, "rf.tx", {"file": "/polpo/rf433/presa_simulata.sub"})
    r = dev.out.reply(3)
    assert r["ok"] and r["data"]["budget_used_ms"] > 0 and r["data"]["simulated"]


def test_events_are_marked_simulated(dev):
    hello(dev)
    send(dev, 2, "rf.rx.start")
    assert dev.out.reply(2)["ok"]
    ev = dev.out.event("rf.code")
    assert ev["data"]["simulated"] and ev["data"]["bits"] == 24
    send(dev, 3, "ir.learn.start")
    dev.out.reply(3)
    assert dev.out.event("ir.learned")["data"]["simulated"]
    send(dev, 4, "wifi.scan")
    nets = dev.out.reply(4)["data"]["networks"]
    assert all("simulata" in n["ssid"] for n in nets)


def test_nfc_read_and_write(dev):
    hello(dev)
    send(dev, 2, "nfc.read")
    card = dev.out.reply(2)["data"]
    assert card["model"] == "NTAG215" and card["simulated"]
    pages = bytes.fromhex(card["pages"])
    assert len(pages) == 130 * 4 and pages[12] == 0xE1
    rec = ndef.parse(ndef.find_in_tlv(pages[16:]))[0]
    assert rec.value.startswith("https://example.org/")
    send(dev, 3, "nfc.write_ndef", {"kind": "text", "value": "ciao dal PC"})
    assert dev.out.reply(3)["ok"]
    rec = ndef.parse(ndef.find_in_tlv(bytes(dev.tag_pages[16:])))[0]
    assert (rec.kind, rec.value) == ("text", "ciao dal PC")


def test_bye_and_device_close_emit_link_closed(dev):
    hello(dev)
    send(dev, 2, "bye")
    assert dev.out.reply(2)["ok"]
    assert dev.out.event("link.closed")["data"] == {"reason": "closed_on_device"}
    hello(dev, 3)
    dev.close_on_device()
    dev.out.event("link.closed")
    assert not dev.session


def test_session_timeout():
    d = VirtualPolpo(**FAST, session_timeout=0.3)
    out = LineCollector()
    d.attach(out)
    send(d, 1, "hello")
    assert out.reply(1)["ok"]
    out.event("link.closed", timeout=3)
    d.shutdown()

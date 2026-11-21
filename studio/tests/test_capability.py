import json

from polpo_studio.core import i18n
from polpo_studio.core.capability import Capability, HardwareStatus, Presence, Route, Status, evaluate
from polpo_studio.core.catalog import MODULES, all_capabilities
from polpo_studio.core.hardware import HARDWARE, SPECS, HardwareState, hardware_names
from polpo_studio.core.i18n import T
from polpo_studio.core.settings import DEFAULTS, Settings
from polpo_studio.devices.virtual_polpo import VirtualPolpo


def states(**kw):
    return {k.replace("_", "."): HardwareStatus(v) for k, v in kw.items()}


def test_software_only_is_available():
    cap = Capability("x", T("a", "a"), T("b", "b"))
    assert evaluate(cap, {}).status == Status.AVAILABLE


def test_missing_hardware_is_never_available():
    cap = Capability("x", T("a", "a"), T("b", "b"), (Route(("polpo", "polpo.rf433")),))
    ev = evaluate(cap, states(polpo=Presence.DETECTED))
    assert ev.status == Status.NEEDS_HARDWARE and not ev.usable and ev.missing == ["polpo.rf433"]


def test_unverifiable_declared_simulated():
    cap = Capability("x", T("a", "a"), T("b", "b"), (Route(("polpo", "polpo.rf433")),))
    ev = evaluate(cap, states(polpo=Presence.DETECTED, polpo_rf433=Presence.UNVERIFIABLE))
    assert ev.status == Status.NEEDS_HARDWARE and ev.usable
    ev = evaluate(cap, states(polpo=Presence.DETECTED, polpo_rf433=Presence.DECLARED))
    assert ev.status == Status.AVAILABLE and "dichiarato" in ev.reason
    ev = evaluate(cap, states(polpo=Presence.SIMULATED, polpo_rf433=Presence.SIMULATED))
    assert ev.status == Status.SIMULATED


def test_best_route_and_experimental():
    cap = Capability("x", T("a", "a"), T("b", "b"), (Route(("polpo", "polpo.rfid2")), Route(("pc.pcsc",), experimental=True)))
    assert evaluate(cap, states(pc_pcsc=Presence.DETECTED)).status == Status.EXPERIMENTAL
    both = states(pc_pcsc=Presence.DETECTED, polpo=Presence.DETECTED, polpo_rfid2=Presence.DETECTED)
    assert evaluate(cap, both).status == Status.AVAILABLE
    sim = states(polpo=Presence.SIMULATED, polpo_rfid2=Presence.SIMULATED)
    assert evaluate(cap, sim).status == Status.SIMULATED


def test_unsupported():
    cap = Capability("x", T("a", "a"), T("b", "b"), (Route(("polpo",)),), unsupported=T("no", "no"))
    assert evaluate(cap, states(polpo=Presence.DETECTED)).status == Status.NOT_AVAILABLE


def test_catalog_is_consistent():
    ids = [c.id for _, c in all_capabilities()]
    assert len(ids) == len(set(ids))
    assert len({m.id for m in MODULES}) == len(MODULES)
    for m, c in all_capabilities():
        for r in c.routes:
            for h in r.hardware:
                assert h in SPECS, (c.id, h)
        for t in (c.title, c.description, m.title, m.summary):
            assert t.it.strip() and t.en.strip(), c.id
    for h in HARDWARE:
        assert h.name.it and h.name.en and h.how.it and h.how.en
    # i moduli richiesti dal progetto ci sono tutti
    assert {"radio", "nfc", "rfid125", "infrared", "gpio", "bluetooth", "usb", "ibutton", "files", "apps", "polpo"} <= {m.id for m in MODULES}


def test_without_hardware_nothing_needing_hardware_is_available():
    hw = HardwareState()
    hw.set_pc("pc.ble", HardwareStatus(Presence.ABSENT))
    hw.set_pc("pc.pcsc", HardwareStatus(Presence.ABSENT))
    snap = hw.snapshot()
    for _, c in all_capabilities():
        ev = evaluate(c, snap, hardware_names())
        needs_external = any(h.startswith(("polpo", "pc.ble", "pc.pcsc", "rfid125", "bridge")) for r in c.routes for h in r.hardware)
        if needs_external and all(any(h.startswith(("polpo", "pc.ble", "pc.pcsc", "rfid125", "bridge")) for h in r.hardware) for r in c.routes):
            assert ev.status in (Status.NEEDS_HARDWARE, Status.NOT_AVAILABLE), c.id


def test_virtual_polpo_makes_polpo_features_simulated():
    hw = HardwareState()
    dev = VirtualPolpo()
    hw.set_polpo(Presence.SIMULATED, dev.info()["modules"])
    dev.shutdown()
    snap = hw.snapshot()
    for _, c in all_capabilities():
        if c.routes and all(h.startswith("polpo") for h in c.routes[0].hardware) and c.unsupported is None:
            assert evaluate(c, snap).status == Status.SIMULATED, c.id


def test_real_polpo_report_maps_honestly():
    hw = HardwareState()
    hw.set_polpo(Presence.DETECTED, {"ir_tx": "available", "rfid2": "missing", "rf433": "unverifiable", "ir_unit": "unverifiable"})
    s = hw.snapshot()
    assert s["polpo.ir_tx"].presence == Presence.DETECTED
    assert s["polpo.rfid2"].presence == Presence.ABSENT
    assert s["polpo.rf433"].presence == Presence.UNVERIFIABLE
    hw.set_declared({"polpo.rf433": True, "polpo.rfid2": True})  # rfid2 non è dichiarabile: si rileva
    s = hw.snapshot()
    assert s["polpo.rf433"].presence == Presence.DECLARED and s["polpo.rfid2"].presence == Presence.ABSENT
    hw.set_polpo(Presence.ABSENT)
    assert hw.get("polpo.rf433").presence == Presence.ABSENT


def test_settings_defaults_persist_and_recover(tmp_path):
    p = tmp_path / "s.json"
    s = Settings(p)
    assert s.get("language") == "it" and s.get("theme") == "scuro"
    s.set("theme", "chiaro")
    s.set("declared_hardware", {"polpo.rf433": True})
    assert Settings(p).get("theme") == "chiaro"
    import pytest

    with pytest.raises(TypeError):
        s.set("ping_interval_s", "10")
    with pytest.raises(KeyError):
        s.set("nope", 1)
    p.write_text('{"theme": 5, "language": "fr", "ping_interval_s": 7}')
    s2 = Settings(p)
    assert s2.get("theme") == DEFAULTS["theme"] and s2.get("language") == "it" and s2.get("ping_interval_s") == 7
    p.write_text("{rotto")
    assert Settings(p).get("theme") == "scuro" and (tmp_path / "s.json.rotto").exists()
    json.dumps(DEFAULTS)


def test_language_switch():
    t = T("Collega", "Connect")
    assert str(t) == "Collega"
    i18n.set_language("en")
    assert str(t) == "Connect" and i18n.tr("a {x}", "b {x}", x=1) == "b 1"
    i18n.set_language("xx")
    assert i18n.language() == "it"

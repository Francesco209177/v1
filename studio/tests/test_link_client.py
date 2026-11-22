import os
import threading
import time

import pytest

from polpo_studio.devices.link_client import LinkError, PolpoLinkClient, State
from polpo_studio.devices.transport import SerialTransport, VirtualTransport
from polpo_studio.devices.virtual_polpo import VirtualPolpo
from polpo_studio.protocols import link

FAST = dict(time_scale=0.01, latency=0.0, auto_confirm_delay=0.5)


def make_client(**dev_kw):
    dev = VirtualPolpo(**{**FAST, **dev_kw})
    events, states = [], []
    c = PolpoLinkClient(
        VirtualTransport(dev),
        ping_interval=0.2,
        on_event=lambda ev, d: events.append((ev, d)),
        on_state=lambda st, why: states.append(st),
    )
    c.open()
    c.events, c.states, c.dev = events, states, dev
    return c


@pytest.fixture
def client():
    c = make_client()
    yield c
    c.close()


def test_probe_hello_info(client):
    assert client.probe() == {"pong": True, "proto": 1}
    info = client.hello()
    assert client.state == State.CONNECTED and info["firmware"].endswith("virtuale")
    assert client.simulated
    assert client.call("info")["board"] == "Polpo virtuale (SIMULATO)"
    assert client.states[:3] == [State.OPEN, State.WAITING, State.CONNECTED]


def test_errors_become_link_errors(client):
    client.hello()
    with pytest.raises(LinkError) as e:
        client.call("fs.read", {"path": "/etc/passwd"})
    assert e.value.code == "bad_args"
    with pytest.raises(LinkError) as e:
        client.call("ir.send", {"raw": True, "timings": [1000] * 500})
    assert e.value.code == "line_too_long"


@pytest.mark.parametrize("size", [0, 1, 767, 768, 769, 5000])
def test_file_roundtrip(client, size):
    client.hello()
    data = os.urandom(size)
    prog = []
    client.write_file("/polpo/logs/prova.bin", data, progress=lambda a, b: prog.append((a, b)))
    assert client.dev.files["/polpo/logs/prova.bin"] == data
    assert client.read_file("/polpo/logs/prova.bin") == data
    assert prog[-1] == (size, size)


def test_write_file_rejects_bad_path_and_size(client):
    client.hello()
    with pytest.raises(LinkError):
        client.write_file("/polpo/con spazio.txt", b"x")
    with pytest.raises(LinkError):
        client.write_file("/polpo/logs/big.bin", b"x" * (link.MAX_FILE_SIZE + 1))


def test_requests_are_serialised_and_busy_is_retried():
    c = make_client(confirm_handler=None)
    c.hello()
    f1 = c.request("wifi.scan")  # il Polpo resta occupato per ~0,02 s
    f2 = c.request("info")
    assert f1.result(timeout=3)["networks"] and f2.result(timeout=3)["proto"] == 1
    c.close()


def test_timeout_when_device_never_answers():
    c = make_client(confirm_handler=lambda *a: None, confirm_timeout=1000)
    with pytest.raises(LinkError) as e:
        c.hello(timeout=0.3)
    assert e.value.code == "timeout"
    assert c.state == State.OPEN
    c.close(send_bye=False)


def test_events_and_device_close(client):
    client.hello()
    client.call("rf.rx.start")
    deadline = time.monotonic() + 3
    while not client.events and time.monotonic() < deadline:
        time.sleep(0.01)
    ev, data = client.events[0]
    assert ev == "rf.code" and data["simulated"]
    client.dev.close_on_device()
    deadline = time.monotonic() + 3
    while client.state != State.OPEN and time.monotonic() < deadline:
        time.sleep(0.01)
    assert client.state == State.OPEN
    with pytest.raises(LinkError) as e:
        client.call("info")
    assert e.value.code == "not_connected"


def test_pings_keep_session_alive():
    c = make_client(session_timeout=0.5)
    c.hello()
    time.sleep(1.2)  # ping ogni 0,2 s: la sessione non scade
    assert c.state == State.CONNECTED and c.dev.session
    c.close()


def test_unplug_fails_pending_and_closes():
    c = make_client(confirm_handler=lambda *a: None, confirm_timeout=1000)
    fut = c.request("hello")
    c.transport.unplug()
    with pytest.raises(LinkError) as e:
        fut.result(timeout=2)
    assert e.value.code == "closed" and c.state == State.CLOSED


def test_serial_transport_refuses_1200_baud():
    with pytest.raises(ValueError):
        SerialTransport("/dev/ttyACM0", 1200)


def test_real_serial_stack_over_pty():
    """Il client passa per pyserial vero; dall'altra parte del pty c'è il Polpo virtuale."""
    master, slave = os.openpty()
    name = os.ttyname(slave)
    import termios
    import tty

    tty.setraw(slave)
    attrs = termios.tcgetattr(slave)
    attrs[3] &= ~termios.ECHO
    termios.tcsetattr(slave, termios.TCSANOW, attrs)
    dev = VirtualPolpo(**FAST)
    dev.attach(lambda line: os.write(master, line + b"\n"))
    stop = threading.Event()

    def pump():
        while not stop.is_set():
            try:
                data = os.read(master, 4096)
            except OSError:
                return
            if data:
                dev.feed(data)

    threading.Thread(target=pump, daemon=True).start()
    c = PolpoLinkClient(SerialTransport(name), ping_interval=0.3)
    c.open()
    try:
        assert c.probe()["pong"]
        assert c.hello()["board"].startswith("Polpo virtuale")
        data = os.urandom(3000)
        c.write_file("/polpo/logs/pty.bin", data)
        assert c.read_file("/polpo/logs/pty.bin") == data
        assert not c.simulated  # il trasporto è seriale: lo stato SIMULATO viene dalle info del Polpo
    finally:
        c.close()
        stop.set()
        dev.shutdown()
        os.close(master)
        os.close(slave)

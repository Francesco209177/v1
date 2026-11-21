import json
import threading
import time

from polpo_studio.protocols import link


class LineCollector:
    """Raccoglie le righe che il Polpo virtuale invia al PC."""

    def __init__(self):
        self.lines = []
        self.cond = threading.Condition()

    def __call__(self, line: bytes):
        with self.cond:
            self.lines.append(json.loads(line))
            self.cond.notify_all()

    def wait_for(self, pred, timeout=3.0):
        end = time.monotonic() + timeout
        with self.cond:
            while True:
                for m in self.lines:
                    if pred(m):
                        self.lines.remove(m)
                        return m
                left = end - time.monotonic()
                if left <= 0:
                    raise AssertionError(f"nessuna riga attesa; ricevute: {self.lines}")
                self.cond.wait(left)

    def reply(self, rid, timeout=3.0):
        return self.wait_for(lambda m: m.get("id") == rid, timeout)

    def event(self, ev, timeout=3.0):
        return self.wait_for(lambda m: m.get("ev") == ev, timeout)


def send(dev, rid, cmd, args=None):
    obj = {"id": rid, "cmd": cmd}
    if args is not None:
        obj["args"] = args
    dev.feed(link.encode(obj) + b"\n")

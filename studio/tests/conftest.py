import json
import os
from pathlib import Path

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

REPO = Path(__file__).resolve().parents[2]
GOLDEN = REPO / "polpo" / "test" / "golden" / "link_pure.jsonl"


@pytest.fixture(autouse=True)
def _data_home(tmp_path, monkeypatch):
    monkeypatch.setenv("POLPO_STUDIO_HOME", str(tmp_path / "dati"))
    from polpo_studio.core import i18n

    i18n.set_language("it")
    yield


@pytest.fixture
def golden_cases():
    return [json.loads(line) for line in GOLDEN.read_text(encoding="utf-8").splitlines() if line.strip()]

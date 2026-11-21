"""Strumenti dei moduli: ogni modulo registra qui il suo pannello di lavoro."""

from ..archive_page import ArchiveTools
from ..module_page import TOOL_FACTORIES
from .ir_tools import IrTools
from .nfc_tools import NfcTools
from .polpo_tools import PolpoTools
from .radio_tools import RadioTools

TOOL_FACTORIES.update(
    {
        "files": ArchiveTools,
        "polpo": PolpoTools,
        "radio": RadioTools,
        "infrared": IrTools,
        "nfc": NfcTools,
    }
)

"""Strumenti dei moduli: ogni modulo registra qui il suo pannello di lavoro."""

from ..archive_page import ArchiveTools
from ..module_page import TOOL_FACTORIES

TOOL_FACTORIES["files"] = ArchiveTools

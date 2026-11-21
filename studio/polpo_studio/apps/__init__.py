"""App integrate di Polpo Studio: ognuna espone MANIFEST (dict) e create(api) -> QWidget."""

from . import converter, crc_tool, ndef_app, radio_budget

BUILTIN = (converter, crc_tool, radio_budget, ndef_app)

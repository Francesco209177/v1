"""Strumenti dei moduli: ogni modulo registra qui il suo pannello di lavoro."""

from ..archive_page import ArchiveTools
from ..module_page import TOOL_FACTORIES
from .apps_tools import AppsTools
from .bluetooth_tools import BluetoothTools
from .gpio_tools import GpioTools
from .ibutton_tools import IButtonTools
from .ir_tools import IrTools
from .nfc_tools import NfcTools
from .polpo_tools import PolpoTools
from .radio_tools import RadioTools
from .rfid_tools import RfidTools
from .usb_tools import UsbTools

TOOL_FACTORIES.update(
    {
        "files": ArchiveTools,
        "polpo": PolpoTools,
        "radio": RadioTools,
        "infrared": IrTools,
        "nfc": NfcTools,
        "usb": UsbTools,
        "bluetooth": BluetoothTools,
        "gpio": GpioTools,
        "rfid125": RfidTools,
        "ibutton": IButtonTools,
        "apps": AppsTools,
    }
)

# PyInstaller (cartella unica, "onedir"): pyinstaller packaging/polpo_studio.spec  (dalla cartella studio/)
# Prima della build copia il firmware: polpo/release/polpo-cardputer-<ver>-app.bin -> polpo_studio/resources/firmware/
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

ROOT = Path(SPECPATH).parent  # noqa: F821 (definito da PyInstaller)

datas = [(str(ROOT / "polpo_studio" / "resources"), "polpo_studio/resources")]  # cartella intera, firmware compreso
datas += collect_data_files("esptool")
datas += collect_data_files("libusb_package")
binaries = collect_dynamic_libs("libusb_package")
hidden = collect_submodules("keyring.backends") + collect_submodules("bleak.backends") + collect_submodules("polpo_studio")
hidden += ["esptool", "serial.tools.list_ports"]

a = Analysis(  # noqa: F821
    [str(ROOT / "packaging" / "polpo_studio_entry.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
    excludes=["tkinter", "PySide6.QtWebEngineCore", "PySide6.Qt3DCore", "PySide6.QtMultimedia"],
    noarchive=False,
)
pyz = PYZ(a.pure)  # noqa: F821
exe = EXE(  # noqa: F821
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="PolpoStudio",
    console=sys.platform != "win32",  # su Windows niente finestra nera
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="PolpoStudio", upx=False)  # noqa: F821

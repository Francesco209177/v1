"""Catalogo dei moduli di Polpo Studio e delle loro funzioni.

Ogni funzione dichiara l'hardware che le serve: lo stato mostrato all'utente si calcola dal vivo
(``capability.evaluate``). Le funzioni escluse per sicurezza sono elencate apertamente come
"Non disponibile", con il motivo.
"""

from __future__ import annotations

from dataclasses import dataclass

from .capability import Capability, Route
from .i18n import T

POLPO = ("polpo",)
SAFETY = T(
    "Esclusa per scelta: Polpo Studio non include funzioni per entrare in sistemi altrui.",
    "Excluded by design: Polpo Studio has no features for breaking into other people's systems.",
)


@dataclass(frozen=True)
class ModuleSpec:
    id: str
    title: T
    summary: T
    icon: str  # chiave dell'icona disegnata in app/icons.py
    capabilities: tuple[Capability, ...]


def C(cid: str, it: str, en: str, dit: str, den: str, *routes: Route, **kw: object) -> Capability:
    return Capability(cid, T(it, en), T(dit, den), tuple(routes), **kw)  # type: ignore[arg-type]


def R(*hardware: str, experimental: bool = False) -> Route:
    return Route(tuple(hardware), experimental)


MODULES: tuple[ModuleSpec, ...] = (
    ModuleSpec(
        "polpo",
        T("Polpo", "Polpo"),
        T("Informazioni, diagnostica, microSD e aggiornamento del Polpo.", "Polpo info, diagnostics, microSD and updates."),
        "polpo",
        (
            C("polpo.info", "Informazioni e batteria", "Info and battery",
              "Versione del firmware, scheda, batteria, microSD e moduli rilevati.",
              "Firmware version, board, battery, microSD and detected modules.", R("polpo")),
            C("polpo.diag", "Diagnostica", "Diagnostics",
              "Prova di scrittura sulla microSD e scansione del bus I2C della porta Grove.",
              "microSD write test and Grove I2C bus scan.", R("polpo")),
            C("polpo.sd_backup", "Copia di sicurezza della microSD", "microSD backup",
              "Scarica sul PC i file della cartella /polpo (fino a 256 KB per file).",
              "Downloads the /polpo folder files to the PC (up to 256 KB per file).", R("polpo")),
            C("polpo.wifi_scan", "Reti Wi-Fi vicine (dal Polpo)", "Nearby Wi-Fi networks (from the Polpo)",
              "Elenco delle reti con canale, potenza e protezione. Solo ascolto.",
              "Lists networks with channel, strength and security. Listen only.", R("polpo", "polpo.wifi")),
            C("polpo.ble_scan", "Dispositivi Bluetooth vicini (dal Polpo)", "Nearby Bluetooth devices (from the Polpo)",
              "Scansione BLE passiva dal Polpo.", "Passive BLE scan from the Polpo.", R("polpo", "polpo.ble")),
            C("polpo.firmware", "Aggiornamento del firmware", "Firmware update",
              "Installa il firmware incluso (con impronta SHA-256 fissa) senza cancellare le impostazioni.",
              "Installs the bundled firmware (fixed SHA-256) without erasing settings.",
              R("polpo", "pc.serial", experimental=True), needs_lab=True),
        ),
    ),
    ModuleSpec(
        "radio",
        T("Radio 433 MHz", "433 MHz radio"),
        T(
            "Codici fissi a 433,92 MHz con i moduli RF433R/RF433T: ricezione, cattura RAW, analisi, archivio.",
            "Fixed codes at 433.92 MHz with the RF433R/RF433T units: receive, RAW capture, analysis, archive.",
        ),
        "radio",
        (
            C("radio.bands", "Frequenze e modulazioni supportate", "Supported frequencies and modulations",
              "Tabella onesta: solo 433,92 MHz in OOK/ASK, codici fissi.",
              "Honest table: only 433.92 MHz OOK/ASK, fixed codes."),
            C("radio.rx", "Ricezione di codici fissi dal vivo", "Live fixed-code reception",
              "Mostra i codici dei telecomandi tuoi (protocolli rc-switch) appena arrivano.",
              "Shows codes from your own remotes (rc-switch protocols) as they arrive.", R("polpo", "polpo.rf433")),
            C("radio.raw", "Cattura e grafico RAW", "RAW capture and plot",
              "Registra gli impulsi e li disegna su un grafico.", "Records pulses and plots them.", R("polpo", "polpo.rf433")),
            C("radio.analysis", "Analisi degli impulsi e riconoscimento del protocollo", "Pulse analysis and protocol detection",
              "Durate brevi/lunghe, rapporto, possibile protocollo. Funziona anche sui file salvati.",
              "Short/long timings, ratio, likely protocol. Also works on saved files."),
            C("radio.archive", "Archivio e registro dei dispositivi propri", "Archive and register of your own devices",
              "Ogni codice salvato è legato a un dispositivo che dichiari tuo.",
              "Each saved code is tied to a device you declare as yours."),
            C("radio.editor", "Editor di file .sub", "Editor for .sub files",
              "Apre e modifica file .sub; quelli fuori banda o con rolling code sono segnati \"Non supportato\".",
              "Opens and edits .sub files; out-of-band or rolling-code files are marked \"Not supported\"."),
            C("radio.tx", "Trasmissione di un codice salvato", "Transmit a saved code",
              "Solo verso dispositivi tuoi, in modalità laboratorio, con doppia conferma (PC e schermo del Polpo) e limite orario.",
              "Only to your own devices, in lab mode, with double confirmation (PC and Polpo screen) and an hourly limit.",
              R("polpo", "polpo.rf433"), needs_lab=True),
            C("radio.report", "Report", "Report", "Riepilogo stampabile di catture e analisi.", "Printable summary of captures and analysis."),
            Capability("radio.other_bands", T("315/868 MHz, FSK, rolling code", "315/868 MHz, FSK, rolling code"),
                       T("Altre bande e modulazioni.", "Other bands and modulations."),
                       unsupported=T("I moduli RF433 lavorano solo a 433,92 MHz in OOK. I rolling code sono esclusi per scelta.",
                                     "The RF433 units only work at 433.92 MHz OOK. Rolling codes are excluded by design.")),
            Capability("radio.jam", T("Disturbo (jamming) e prove a forza bruta", "Jamming and brute force"),
                       T("Disturbare o indovinare codici altrui.", "Jamming or guessing other people's codes."),
                       unsupported=T("Illegale e pericoloso: escluso per scelta.", "Illegal and dangerous: excluded by design.")),
        ),
    ),
    ModuleSpec(
        "nfc",
        T("NFC", "NFC"),
        T("Tag NFC a 13,56 MHz: rilevamento, lettura, NDEF, analisi, scrittura su tag tuoi.",
          "13.56 MHz NFC tags: detection, reading, NDEF, analysis, writing your own tags."),
        "nfc",
        (
            C("nfc.detect", "Rilevamento e tecnologia (UID, ATQA, SAK, ATR)", "Detection and technology (UID, ATQA, SAK, ATR)",
              "Riconosce la famiglia della carta.", "Recognises the card family.",
              R("polpo", "polpo.rfid2"), R("pc.pcsc", experimental=True)),
            C("nfc.read", "Lettura NTAG / MIFARE Ultralight", "Read NTAG / MIFARE Ultralight",
              "Legge la memoria dei tag Type 2 non protetti.", "Reads the memory of unprotected Type 2 tags.",
              R("polpo", "polpo.rfid2"), R("pc.pcsc", experimental=True)),
            C("nfc.analysis", "Metadati e analisi di sicurezza", "Metadata and security analysis",
              "Blocchi, password, protezioni e capacità, anche sui file salvati.",
              "Locks, passwords, protections and capacity, also on saved files."),
            C("nfc.ndef", "Analizzatore NDEF", "NDEF analyser", "Decodifica link, testi e altri record.", "Decodes links, text and other records."),
            C("nfc.archive", "Archivio e report", "Archive and report", "Salva letture e report nella cassaforte.", "Saves reads and reports in the vault."),
            C("nfc.write", "Scrittura NDEF su tag tuoi", "NDEF write to your own tags",
              "Link o testo su NTAG/Ultralight, con conferma sullo schermo del Polpo e verifica.",
              "Link or text on NTAG/Ultralight, confirmed on the Polpo screen and verified.",
              R("polpo", "polpo.rfid2"), needs_lab=True),
            Capability("nfc.emulate", T("Emulazione di carte", "Card emulation"), T("Fingersi una carta.", "Acting as a card."),
                       unsupported=T("L'RFID2 non emula carte; inoltre è esclusa per scelta.",
                                     "The RFID2 cannot emulate cards; it is also excluded by design.")),
            Capability("nfc.crack", T("Recupero chiavi MIFARE Classic e copie di badge", "MIFARE Classic key recovery and badge copies"),
                       T("Attacchi alle chiavi e duplicati.", "Key attacks and duplicates."), unsupported=SAFETY),
        ),
    ),
    ModuleSpec(
        "rfid125",
        T("RFID 125 kHz", "125 kHz RFID"),
        T("Lettura di tessere 125 kHz con un lettore USB economico o un modulo RDM6300.",
          "125 kHz tag reading with a cheap USB reader or an RDM6300 module."),
        "rfid",
        (
            C("rfid125.read", "Lettura del codice", "Read the code",
              "Lettore \"tipo tastiera\" (cattura veloce con controllo dei tempi) oppure RDM6300 seriale con checksum.",
              "\"Keyboard\" reader (fast capture with timing check) or serial RDM6300 with checksum.",
              R("rfid125.usb"), R("rfid125.rdm6300", "pc.serial")),
            C("rfid125.formats", "Formati e famiglie (EM4100, decimale, Wiegand 26)", "Formats and families (EM4100, decimal, Wiegand 26)",
              "Converte il codice tra i formati stampati sulle tessere.", "Converts the code between the formats printed on cards."),
            C("rfid125.archive", "Archivio, supporti di prova e report", "Archive, test media and report",
              "Tieni traccia delle tue tessere e dei portachiavi di prova.", "Keep track of your own cards and test fobs."),
            Capability("rfid125.write", T("Scrittura su T5577 e copia di tessere", "T5577 writing and card copies"),
                       T("Duplicare tessere.", "Duplicating cards."),
                       unsupported=T("I lettori previsti non scrivono; la copia di tessere è esclusa per scelta.",
                                     "The supported readers cannot write; card copying is excluded by design.")),
        ),
    ),
    ModuleSpec(
        "infrared",
        T("Infrarossi", "Infrared"),
        T("Telecomandi: libreria, profili personali, telecomando grafico, invio e apprendimento.",
          "Remotes: library, personal profiles, on-screen remote, send and learn."),
        "infrared",
        (
            C("ir.library", "Libreria per produttore e categoria", "Library by brand and category",
              "TV, climatizzatori, proiettori, audio.", "TVs, air conditioners, projectors, audio."),
            C("ir.import", "Importazione di file .ir", "Import .ir files", "Formato compatibile con i file .ir diffusi.", "Format compatible with common .ir files."),
            C("ir.profiles", "Profili personali", "Personal profiles", "I tuoi telecomandi, con i tasti che usi.", "Your remotes, with the buttons you use."),
            C("ir.send", "Telecomando grafico e invio", "On-screen remote and send",
              "Il Polpo trasmette con il suo LED IR integrato.", "The Polpo transmits with its built-in IR LED.", R("polpo", "polpo.ir_tx")),
            C("ir.learn", "Apprendimento da un telecomando", "Learn from a remote",
              "Il Polpo ascolta con l'IR Unit sulla porta Grove.", "The Polpo listens with the IR Unit on the Grove port.",
              R("polpo", "polpo.ir_unit")),
        ),
    ),
    ModuleSpec(
        "gpio",
        T("GPIO ed elettronica", "GPIO and electronics"),
        T("Porta Grove del Polpo, console seriale, schede Arduino/ESP32, calcolatori.",
          "Polpo Grove port, serial console, Arduino/ESP32 boards, calculators."),
        "gpio",
        (
            C("gpio.grove", "Pin della porta Grove e scansione I2C", "Grove pins and I2C scan",
              "Legge i due pin della porta Grove e cerca dispositivi I2C.", "Reads the two Grove pins and scans for I2C devices.", R("polpo")),
            C("gpio.console", "Console seriale", "Serial console",
              "Per Arduino/ESP32: velocità, fine riga, esadecimale, registro.", "For Arduino/ESP32: baud rate, line ending, hex, log.", R("pc.serial")),
            C("gpio.boards", "Riconoscimento delle schede", "Board recognition",
              "CH340, CP210x, FTDI, Espressif dai codici USB.", "CH340, CP210x, FTDI, Espressif from USB IDs.", R("pc.serial")),
            C("gpio.flash", "Programmazione di schede ESP32 (esptool)", "ESP32 flashing (esptool)",
              "Scrive un firmware su una scheda tua, con conferma.", "Writes firmware to your own board, with confirmation.",
              R("pc.serial"), needs_lab=True),
            C("gpio.calc", "Calcolatori", "Calculators",
              "Legge di Ohm, partitore, resistenza per LED, codice colori.", "Ohm's law, voltage divider, LED resistor, colour code."),
            C("gpio.bridge", "GPIO, I2C, SPI e ADC con il Polpo Bridge", "GPIO, I2C, SPI and ADC via Polpo Bridge",
              "Pin di una scheda Arduino/ESP32 comandati dal PC.", "Arduino/ESP32 board pins driven from the PC.",
              R("bridge", experimental=True), needs_lab=True),
        ),
    ),
    ModuleSpec(
        "bluetooth",
        T("Bluetooth", "Bluetooth"),
        T("Bluetooth Low Energy con l'adattatore del PC: scansione, servizi GATT, letture, notifiche.",
          "Bluetooth Low Energy with the PC adapter: scan, GATT services, reads, notifications."),
        "bluetooth",
        (
            C("ble.scan", "Scansione", "Scan", "Dispositivi vicini; le scansioni non si salvano se non lo chiedi (privacy).",
              "Nearby devices; scans are not saved unless you ask (privacy).", R("pc.ble"), R("polpo", "polpo.ble")),
            C("ble.gatt", "Servizi e caratteristiche GATT", "GATT services and characteristics",
              "Elenco dei servizi di un dispositivo tuo.", "Lists the services of your own device.", R("pc.ble")),
            C("ble.rw", "Lettura e notifiche", "Read and notifications", "Valori e notifiche dal vivo.", "Values and live notifications.", R("pc.ble")),
            C("ble.connect", "Connessione e disconnessione", "Connect and disconnect", "Solo con dispositivi autorizzati.", "Only with authorised devices.", R("pc.ble")),
            C("ble.authorized", "Dispositivi autorizzati e registro", "Authorised devices and log", "Elenco dei dispositivi tuoi.", "List of your own devices."),
            Capability("ble.spam", T("Annunci falsi e disturbo", "Fake advertising and disruption"),
                       T("Inondare di richieste i telefoni vicini.", "Flooding nearby phones with requests."), unsupported=SAFETY),
        ),
    ),
    ModuleSpec(
        "usb",
        T("USB", "USB"),
        T("Periferiche collegate, porte seriali, dispositivi HID, tester, editor DuckyScript.",
          "Connected devices, serial ports, HID devices, testers, DuckyScript editor."),
        "usb",
        (
            C("usb.devices", "Periferiche collegate", "Connected devices", "Con le descrizioni del sistema operativo.", "With the OS descriptions.", R("pc.usb")),
            C("usb.serial", "Porte seriali", "Serial ports", "Elenco con produttore e codici USB.", "List with manufacturer and USB IDs.", R("pc.serial")),
            C("usb.hid", "Dispositivi HID (solo elenco)", "HID devices (list only)", "Tastiere, mouse, controller.", "Keyboards, mice, controllers.", R("pc.hid")),
            C("usb.tester", "Tester di tastiera e mouse", "Keyboard and mouse tester", "Mostra tasti e clic ricevuti.", "Shows received keys and clicks."),
            C("usb.ducky", "Editor DuckyScript con validazione", "DuckyScript editor with validation",
              "Stesse regole del firmware: righe, ritardi, tasti permessi.", "Same rules as the firmware: lines, delays, allowed keys."),
            C("usb.ducky_copy", "Copia dello script sul Polpo", "Copy the script to the Polpo",
              "Lo script si salva sulla microSD e parte solo dal Polpo, dopo la sua conferma.",
              "The script is saved on the microSD and only runs from the Polpo, after its confirmation.", R("polpo")),
            Capability("usb.run", T("Esecuzione di script dal PC", "Running scripts from the PC"),
                       T("Far digitare il Polpo comandato dal PC.", "Making the Polpo type on command from the PC."),
                       unsupported=T("Per sicurezza gli script partono solo dal Polpo, con la sua conferma.",
                                     "For safety, scripts only start from the Polpo, with its confirmation.")),
        ),
    ),
    ModuleSpec(
        "ibutton",
        T("iButton", "iButton"),
        T("Chiavi 1-Wire (iButton) con il Polpo Bridge: ricerca ROM, famiglia, CRC8.",
          "1-Wire keys (iButton) with the Polpo Bridge: ROM search, family, CRC8."),
        "ibutton",
        (
            C("ib.read", "Ricerca ROM e presenza", "ROM search and presence", "Legge il codice della chiave appoggiata.", "Reads the code of the touching key.",
              R("bridge", "bridge.onewire", experimental=True)),
            C("ib.analysis", "Famiglia e controllo CRC8", "Family and CRC8 check",
              "Es. 0x01 = DS1990A. Funziona anche su codici scritti a mano.", "E.g. 0x01 = DS1990A. Also works on typed-in codes."),
            C("ib.archive", "Archivio e analisi del protocollo", "Archive and protocol analysis",
              "Salva le tue chiavi e spiega i campi.", "Saves your keys and explains the fields.", experimental=True),
            Capability("ib.emulate", T("Emulazione e scrittura di chiavi", "Key emulation and writing"),
                       T("Copiare chiavi.", "Copying keys."), unsupported=SAFETY),
        ),
    ),
    ModuleSpec(
        "files",
        T("Archivio file", "File archive"),
        T("Tutti i tuoi file per categoria, con ricerca, cronologia, import/export e sincronizzazione con la microSD.",
          "All your files by category, with search, history, import/export and microSD sync."),
        "files",
        (
            C("files.browse", "Categorie, metadati e ricerca", "Categories, metadata and search",
              "NFC, RFID, radio, IR, iButton, diagnostica, configurazioni, app, backup.",
              "NFC, RFID, radio, IR, iButton, diagnostics, settings, apps, backups."),
            C("files.io", "Importazione, esportazione e cronologia", "Import, export and history", "Con impronta SHA-256.", "With SHA-256 fingerprint."),
            C("files.sync", "Sincronizzazione con la microSD del Polpo", "Sync with the Polpo microSD",
              "Confronta e copia i file nei due sensi.", "Compares and copies files both ways.", R("polpo")),
            C("files.integrity", "Verifica di integrità", "Integrity check", "Controlla che nessun file sia stato alterato.", "Checks that no file was altered."),
        ),
    ),
    ModuleSpec(
        "apps",
        T("App", "Apps"),
        T("Catalogo di app integrate (calcolatori, convertitori, analizzatori) e app aggiuntive.",
          "Catalogue of built-in apps (calculators, converters, analysers) and add-on apps."),
        "apps",
        (
            C("apps.catalog", "Catalogo con permessi e compatibilità", "Catalogue with permissions and compatibility",
              "Nome, versione, autore, permessi e hardware richiesto di ogni app.", "Name, version, author, permissions and required hardware of each app."),
            C("apps.builtin", "App integrate", "Built-in apps", "Strumenti pronti all'uso.", "Ready-to-use tools."),
            C("apps.third_party", "App di terze parti", "Third-party apps",
              "Solo in modalità laboratorio. Non sono isolate: installa solo quelle di cui ti fidi.",
              "Lab mode only. They are not sandboxed: install only apps you trust.", experimental=True, needs_lab=True),
        ),
    ),
)

MODULE_IDS = {m.id: m for m in MODULES}


def all_capabilities() -> list[tuple[ModuleSpec, Capability]]:
    return [(m, c) for m in MODULES for c in m.capabilities]

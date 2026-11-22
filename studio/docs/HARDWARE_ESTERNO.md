# Hardware esterno per Polpo Studio

Tutti i componenti sono opzionali: ogni modulo dice cosa gli serve ("Cosa serve" in fondo alla pagina).

## Sul Polpo (porta Grove)

| Componente | Per | Rilevato? |
|---|---|---|
| M5Stack **RFID2** (WS1850S) | NFC: lettura e scrittura NDEF | Sì (bus I2C, indirizzo 0x28) |
| M5Stack **RF433R** / **RF433T** | Radio 433,92 MHz: ricezione / trasmissione | No: dichiaralo in Impostazioni › Hardware |
| M5Stack **IR Unit** | Infrarossi: apprendimento | No: dichiaralo |
| M5Stack **HUB** | Più unità insieme sulla porta Grove | — |

La porta Grove del Cardputer dà 5 V di alimentazione ma i segnali sono a **3,3 V**.

## Sul PC

| Componente | Per | Note |
|---|---|---|
| Adattatore **Bluetooth** 4.0+ | Modulo Bluetooth | Integrato nella maggior parte dei portatili. Linux: BlueZ |
| Lettore NFC **PC/SC** (es. ACR122U) | NFC dal PC (Sperimentale) | Pacchetto opzionale `pyscard`; su Linux anche `pcscd` |
| Lettore **RFID 125 kHz USB** "tipo tastiera" | RFID 125 kHz | Economico; scrive il codice come una tastiera. Dichiaralo |
| Modulo **RDM6300** + adattatore USB-seriale 5 V | RFID 125 kHz | TX del modulo → RX dell'adattatore, 9600 baud. Dichiaralo |
| Scheda **Arduino Uno/Nano** o **ESP32** | Polpo Bridge (GPIO, ADC, I2C, 1-Wire) | Carica lo sketch `studio/bridge/polpo_bridge` |
| Lettore **iButton** / sonda 1-Wire | iButton | Sul pin 4 del Bridge con resistenza di pull-up da 4,7 kΩ. Dichiaralo |

## Driver delle schede

| Chip | VID:PID | Driver |
|---|---|---|
| Espressif USB nativa (Polpo, ESP32-S3) | 303A:* | Integrato in Windows 10/11, Linux, macOS |
| WCH CH340 / CH9102 | 1A86:7523, 1A86:55D4 | Spesso serve il driver del produttore su Windows e macOS vecchi |
| Silicon Labs CP210x | 10C4:EA60 | Driver del produttore su Windows |
| FTDI | 0403:* | Integrato quasi ovunque |

Il modulo **USB › Porte seriali** avvisa se un chip è collegato ma la porta seriale non compare (driver mancante).

## Linux: permessi

Installa `packaging/linux/99-polpo-studio.rules` (lo fa `installa.sh` se rispondi sì) oppure aggiungi il tuo
utente al gruppo `dialout` e rientra. La regola dice anche a ModemManager di non toccare le porte del Polpo.

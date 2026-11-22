# Polpo Studio

Il programma per PC del **Polpo** (M5Stack Cardputer con il firmware Polpo). Comanda il Polpo via USB
e i lettori esterni economici: radio 433 MHz, NFC, RFID 125 kHz, infrarossi, GPIO, Bluetooth, USB, iButton.

Ogni funzione mostra, calcolato dal vivo, se è:

| Stato | Significato |
|---|---|
| **Disponibile** | l'hardware necessario è collegato e rilevato (o dichiarato da te), oppure non serve hardware |
| **Richiede hardware esterno** | manca un componente, oppure non si può rilevare da solo |
| **Simulato** | funziona con il Polpo virtuale: i dati sono inventati e non vanno mai al Polpo vero |
| **Sperimentale** | funziona, ma non è stato provato a fondo sull'hardware vero |
| **Non disponibile** | escluso per scelta di sicurezza o impossibile con questo hardware |

Polpo Studio non contiene funzioni per entrare in sistemi altrui (cancelli, veicoli, allarmi, carte di
altre persone): niente disturbo radio, forza bruta, rolling code, copie di badge o emulazione di carte.

## Sicurezza

* **Cassaforte cifrata** (AES-256-GCM): letture, file, backup e registro attività. La chiave dati è
  protetta dalla **frase di accesso** e dalla **chiave di recupero** (scrypt); senza una delle due
  nessuno può aprirla, nemmeno chi ha scritto il programma.
* **PIN** per sbloccare velocemente lo schermo dopo una pausa (5 errori = serve la frase) e
  **blocco automatico** dopo un tempo di inattività.
* **Registro attività** cifrato e protetto da una catena HMAC: righe cambiate, tolte o tagliate
  vengono scoperte da *Verifica integrità*.
* **Modalità laboratorio**: trasmissioni, scritture di tag, programmazione di schede e app di terze
  parti restano bloccate finché non la attivi (regole da accettare, PIN o frase, spegnimento
  automatico).
* **Backup `.polpobak`** cifrati con una password a parte, ripristinabili su un altro computer.
* "Ricorda su questo computer" usa il portachiavi del sistema: comodo, ma chi usa il tuo account
  del computer può aprire la cassaforte.

## Pacchetti

La build di GitHub Actions (`.github/workflows/polpo.yml`) produce l'installer e lo zip per **Windows** e
l'archivio per **Linux** (con `installa.sh`, regola udev e voce di menu), e su entrambi esegue
`PolpoStudio --self-test`. **macOS**: per ora da sorgente.

Build locale: `pip install pyinstaller==6.22.0`, copia `polpo/release/polpo-cardputer-<ver>-app.bin` in
`polpo_studio/resources/firmware/`, poi `pyinstaller packaging/polpo_studio.spec` (cartella `dist/PolpoStudio`).

## Documentazione

[Manuale](docs/MANUALE_STUDIO.md) · [Sicurezza](docs/SICUREZZA.md) · [Hardware esterno](docs/HARDWARE_ESTERNO.md) ·
[Protocollo Polpo Link](docs/PROTOCOLLO_POLPO_LINK.md) · [Architettura](docs/ARCHITETTURA.md) ·
[Polpo Bridge](bridge/LEGGIMI.md)

## Avvio da sorgente

```bash
cd studio
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m polpo_studio                # oppure: polpo-studio
python -m polpo_studio --virtuale     # parte subito con il Polpo virtuale (SIMULATO)
```

Opzioni: `--virtuale`, `--dati CARTELLA` (dove salvare impostazioni e cassaforte), `--lingua it|en`,
`--self-test` (autodiagnosi senza hardware), `--version`.

## Test

```bash
cd studio
QT_QPA_PLATFORM=offscreen python -m pytest
```

I test confrontano il protocollo Python con quello del firmware (`polpo/test/golden/link_pure.jsonl`
e la tabella dei comandi in `link_proto.cpp`), provano il client contro il Polpo virtuale anche
attraverso una vera porta seriale finta (pty) e aprono l'interfaccia in modalità offscreen.

## Struttura

```
polpo_studio/
  app/        finestra, dashboard, pagine dei moduli, impostazioni, temi, icone, mascotte
  core/       modello delle capacità, catalogo moduli e hardware, impostazioni, lingue, registro, eventi
  devices/    trasporto seriale, client Polpo Link, Polpo virtuale, gestore del collegamento
  protocols/  Polpo Link (copia del firmware), NDEF
  security/   cassaforte, registro con catena HMAC, modalità laboratorio, backup .polpobak
  resources/  file della microSD del Polpo virtuale (uguali al modello in polpo/sd_template)
```

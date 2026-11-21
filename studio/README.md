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

## Avvio da sorgente

```bash
cd studio
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m polpo_studio                # oppure: polpo-studio
python -m polpo_studio --virtuale     # parte subito con il Polpo virtuale (SIMULATO)
```

Opzioni: `--dati CARTELLA` (dove salvare impostazioni e registro), `--lingua it|en`, `--version`.

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
  resources/  file della microSD del Polpo virtuale (uguali al modello in polpo/sd_template)
```

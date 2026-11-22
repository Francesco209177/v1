# Polpo

Un multi-tool tascabile fai-da-te ispirato al Flipper Zero, costruito su **M5Stack Cardputer** con moduli a innesto, senza saldature.

Il firmware è scritto da zero, con interfaccia in italiano e una mascotte originale (un polpo).

| Funzione | Hardware |
|---|---|
| Infrarossi: telecomando universale, file `.ir`, apprendimento | LED integrato; apprendimento con IR Unit |
| Radio 433,92 MHz: codici fissi, registrazione RAW, ritrasmissione con limite di duty cycle | Unit RF433R / RF433T |
| NFC 13,56 MHz: identificazione carte, lettura NTAG/Ultralight, scrittura NDEF | Unit RFID2 |
| BadUSB: script DuckyScript con layout IT/US | USB-C integrato |
| Bluetooth: scansione, telecomando multimediale | integrato |
| Wi-Fi: scansione reti e grafico dei canali | integrato |
| GPIO: scanner I2C, monitor pin | porta Grove |

Esclusi di proposito:

- disturbo di frequenze;
- copia di rolling code;
- forza bruta;
- deauth Wi-Fi;
- spam Bluetooth.

## Polpo Studio (programma per PC)

Il Polpo si può comandare anche dal PC con **Polpo Studio** (cartella `studio/`): collegamento USB con
**Polpo Link** (il Polpo chiede conferma sul suo schermo), cassaforte cifrata, moduli Radio, NFC, RFID 125 kHz,
Infrarossi, GPIO, Bluetooth, USB, iButton, app e un Polpo virtuale segnato SIMULATO.
Vedi `studio/README.md` e `studio/docs/MANUALE_STUDIO.md`.

## Cartelle

| Percorso | Contenuto |
|---|---|
| `docs/MANUALE.md` | acquisto, installazione, uso di ogni funzione, limiti noti |
| `release/` | file `.bin` pronto da installare (indirizzo 0x0) |
| `web/` | pagina di installazione con un pulsante (ESP Web Tools) |
| `simulator/index.html` | simulatore nel browser con gli stessi menu, microSD virtuale e pannello per moduli e oggetti simulati (`scripts/sim_samples.py` copia dentro i file di `sd_template`) |
| `src/` | firmware: `core` interfaccia, `hal` driver, `apps` funzioni |
| `lib/polpo_core/` | logica pura testata sul PC (protocolli IR, DuckyScript, NDEF, `.sub`) |
| `test/` | test unitari (`pio test -e native`) |
| `sd_template/` | file di esempio copiati sulla microSD al primo avvio |

## Compilare

```
pip install platformio
pio test -e native      # test sul computer
pio run -e cardputer    # firmware + release/polpo-cardputer-<versione>.bin
```

## Stato

Il firmware compila e la logica pura supera i test automatici, ma non è ancora stato provato su un Cardputer reale.

Al primo avvio usa **Diagnostica** e leggi la sezione "Limiti noti" del manuale.

Usalo solo su dispositivi tuoi o con autorizzazione.

Licenza del codice Polpo: MIT.

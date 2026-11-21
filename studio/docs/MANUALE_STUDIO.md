# Polpo Studio — manuale

Polpo Studio è il programma per PC che accompagna il **Polpo** (M5Stack Cardputer con il firmware Polpo).
Comanda il Polpo via USB, usa i lettori esterni economici e conserva tutto in una cassaforte cifrata.

## 1. Installazione

| Sistema | Come |
|---|---|
| **Windows 10/11** | Scarica `PolpoStudio-<versione>-Windows-setup.exe` dagli artefatti della build e avvialo. In alternativa lo zip: estrai e avvia `PolpoStudio.exe`. |
| **Linux** (Ubuntu 22.04 o più recente) | Estrai `PolpoStudio-linux-x64.tar.gz` e lancia `./installa.sh`: copia il programma in `~/.local` e, se vuoi, installa la regola udev per le porte seriali. |
| **macOS** | Per ora solo da sorgente (vedi sotto): senza firma Apple il sistema bloccherebbe il programma e richiederebbe il permesso Bluetooth a ogni aggiornamento. |

**Da sorgente** (qualsiasi sistema con Python 3.11 o più recente):

```bash
cd studio
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m polpo_studio
```

Opzioni utili: `--virtuale` (parte con il Polpo virtuale), `--lingua en`, `--dati CARTELLA`, `--self-test`
(autodiagnosi senza hardware: deve dire "Tutto a posto.").

## 2. Prima apertura: la cassaforte

Alla prima apertura scegli una **frase di accesso** (almeno 12 caratteri; meglio quattro parole a caso) e
ricevi una **chiave di recupero** di 32 caratteri. **Scrivila su carta**: se dimentichi la frase è l'unico modo
per recuperare i dati. Poi puoi impostare un **PIN** per sbloccare velocemente lo schermo.
Dettagli in [SICUREZZA.md](SICUREZZA.md).

## 3. Gli stati delle funzioni

Ogni funzione di ogni modulo mostra uno stato calcolato dal vivo, sempre scritto a parole:

| Stato | Significato | Cosa fare |
|---|---|---|
| **Disponibile** | L'hardware è collegato e rilevato (o dichiarato da te), oppure non serve hardware | Usala |
| **Richiede hardware esterno** | Manca un componente, oppure non si può rilevare da solo | Guarda "Cosa serve" in fondo alla pagina del modulo |
| **Simulato** | Funziona col Polpo virtuale: dati inventati | Nulla: è una prova. Questi dati non vanno mai al Polpo vero |
| **Sperimentale** | Funziona ma non è stato provato a fondo sull'hardware vero | Usala con attenzione |
| **Non disponibile** | Esclusa per sicurezza o impossibile con questo hardware | — |

Alcuni componenti (unità RF433, IR Unit, lettore RFID USB "tipo tastiera", RDM6300, sonda 1-Wire) **non si possono
rilevare automaticamente**: se li hai collegati, dichiaralo in **Impostazioni › Hardware**.

## 4. Collegare il Polpo

1. Sul Cardputer deve esserci il firmware Polpo (versione con Polpo Link).
2. Collegalo con un cavo USB **dati** e premi **Home › Collega via USB…**, scegli la porta.
3. Sul Polpo compare **"Collegare al PC?"**: premi Sì. Il Polpo mostra "Collegato al PC" e chiude le altre app
   (la porta Grove è condivisa). Premendo Indietro sul Polpo il collegamento si chiude.

Senza hardware puoi usare **Home › Usa il Polpo virtuale**: tutto ciò che produce è segnato **SIMULATO**.

## 5. I moduli

| Modulo | Cosa fa | Serve |
|---|---|---|
| **Polpo** | Informazioni, diagnostica (microSD, I2C), file della microSD (sfoglia, scarica, carica, backup .zip), reti Wi-Fi e Bluetooth vicine (non salvate), aggiornamento firmware (Sperimentale) | Polpo |
| **Radio 433 MHz** | Ricezione di codici fissi, cattura RAW con grafico e analisi degli impulsi, archivio legato ai **tuoi** dispositivi, editor `.sub`, bande supportate, trasmissione (modalità laboratorio + doppia conferma), report | Polpo + RF433R/RF433T |
| **NFC** | Lettura di NTAG/Ultralight con analisi (UID, blocchi, CC, NDEF), analizzatore NDEF, scrittura su tag tuoi, archivio, report; lettore PC/SC Sperimentale | Polpo + RFID2, oppure lettore PC/SC |
| **RFID 125 kHz** | Lettura con lettore USB "tipo tastiera" (controlla la velocità di scrittura) o RDM6300, formati EM4100 / decimale / Wiegand 26, archivio | Lettore USB o RDM6300 |
| **Infrarossi** | Libreria di codici pubblici, telecomandi personali, import `.ir`, telecomando grafico, apprendimento | Polpo (+ IR Unit per imparare) |
| **GPIO ed elettronica** | Pin Grove e I2C del Polpo, console seriale, schede riconosciute, programmazione ESP32 (esptool), calcolatori, Polpo Bridge | PC, Polpo, schede Arduino/ESP32 |
| **Bluetooth** | Scansione, dispositivi autorizzati, servizi GATT, letture, notifiche | Adattatore Bluetooth del PC |
| **USB** | Periferiche, porte seriali (con avviso sui driver mancanti), HID (solo elenco), tester tastiera/mouse, editor DuckyScript | PC |
| **iButton** | Ricerca ROM, famiglia, CRC8, archivio (Sperimentale) | Polpo Bridge + sonda 1-Wire |
| **Archivio file** | Tutti i file della cassaforte: categorie, ricerca, note, import/export, verifica | — |
| **App** | App integrate e app di terze parti (solo in modalità laboratorio) | — |

## 6. Modalità laboratorio

Trasmettere a 433 MHz, scrivere tag NFC, programmare schede, pilotare uscite GPIO e usare app di terze parti
richiede la **modalità laboratorio** (Sicurezza › Modalità laboratorio): si accettano le regole d'uso, si conferma
con PIN o frase, e si spegne da sola dopo il tempo scelto, quando blocchi lo schermo e alla chiusura del programma.

## 7. Personalizzazione

In **Impostazioni**: lingua (italiano/inglese), tema scuro/chiaro/alto contrasto, colore principale, dimensione
del testo, stile delle icone, densità, barra laterale compatta, ordine e visibilità dei moduli, scorciatoie da
tastiera, schede della Home, notifiche, hardware dichiarato. In ogni modulo la stella ☆ lo aggiunge ai preferiti.

## 8. Problemi frequenti

| Problema | Soluzione |
|---|---|
| Nessuna porta seriale | Cavo solo di ricarica: usane uno dati. Su Linux installa la regola udev o entra nel gruppo `dialout`. |
| "La porta è già usata" | Chiudi il monitor seriale di Arduino IDE/PlatformIO o un altro Polpo Studio. |
| "Nessuna risposta: su questa porta non c'è un Polpo" | Porta sbagliata, oppure firmware senza Polpo Link: aggiornalo dalla pagina web del flasher. |
| "Rifiutato sullo schermo del Polpo" | Hai premuto No sul Polpo, o sono passati 20 secondi. |
| Bluetooth "Richiede hardware esterno" | Adattatore assente o spento; su Linux serve BlueZ attivo. |
| Funzione "Non verificabile" | Dichiara il componente in Impostazioni › Hardware. |

## 9. Limiti onesti

Polpo Studio è stato provato con test automatici, il Polpo virtuale e porte seriali simulate (pty), non con un
Polpo, adattatori Bluetooth, lettori NFC/125 kHz o schede Arduino veri. Le parti segnate **Sperimentali**
(aggiornamento firmware, lettore PC/SC, Polpo Bridge, iButton, app di terze parti) vanno provate con attenzione.

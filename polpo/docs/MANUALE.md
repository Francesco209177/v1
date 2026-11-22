# Polpo — manuale d'uso

Il Polpo è un multi-tool tascabile fai-da-te, ispirato al Flipper Zero, costruito su un **M5Stack Cardputer** con moduli a innesto. Non serve saldare.

Il firmware (il programma del dispositivo) è scritto da zero, con interfaccia in italiano.

> **Regola d'oro.** Usa il Polpo solo su dispositivi tuoi o con un permesso scritto. Copiare badge o telecomandi altrui, disturbare le frequenze o usare la tastiera USB su computer di altri è reato.

---

## 1. Cosa comprare (Amazon.it o negozio M5Stack)

| Pezzo | A cosa serve | Prezzo indicativo |
|---|---|---|
| **M5Stack Cardputer Adv** (oppure il vecchio Cardputer v1.1) | Il dispositivo: schermo, tastiera, batteria, LED infrarosso, Wi-Fi, Bluetooth, USB | 30–50 € |
| **microSD** da 4–32 GB | Salva telecomandi, segnali, script, letture | 5–8 € |
| M5Stack **Unit RFID2** (WS1850S) | NFC a 13,56 MHz | 5–10 € |
| M5Stack **Unit RF433R** e **Unit RF433T** | Ricevere e trasmettere a 433,92 MHz | 4–10 € l'uno |
| M5Stack **Unit HUB** (facoltativo) | Collegare RF433R e RF433T insieme | 3–6 € |
| M5Stack **IR Unit** (facoltativo) | *Imparare* i telecomandi a infrarossi | 4–8 € |

Ogni modulo M5Stack ha già il suo cavetto Grove a 4 fili.

Prima di comprare puoi provare tutti i menu nel **simulatore**: `polpo/simulator/index.html`.

Nel simulatore:

- il pannello **Porta Grove e oggetti** serve a collegare i moduli virtuali, appoggiare carte NFC e premere telecomandi a 433 MHz e a infrarossi;
- file, livello e impostazioni restano salvati nel browser.

---

## 2. Installare il firmware (una volta sola)

Ti servono:

- un computer con **Google Chrome** o **Microsoft Edge**;
- un cavo **USB-C dati** (alcuni cavi caricano soltanto).

1. Scarica il file del firmware `polpo-cardputer-0.1.0.bin` dalla cartella `polpo/release/`.
2. Metti il Cardputer in **modalità download**:
   - spegni il Cardputer con l'interruttore laterale;
   - tieni premuto il tasto **G0** (il tastino sul lato);
   - collega il cavo USB al computer;
   - rilascia G0.

   Lo schermo resta nero: è normale.
3. Apri <https://adafruit.github.io/Adafruit_WebSerial_ESPTool/> e:
   - premi **Connect**;
   - scegli la porta che compare (es. "USB JTAG/serial debug unit");
   - imposta l'indirizzo **0x0** nella prima riga e scegli il file `.bin`;
   - premi **Program** e aspetta la fine (circa 1 minuto).
4. Scollega il cavo, accendi il Cardputer: compare il polpo.

In alternativa puoi usare la pagina `polpo/web/index.html` (pulsante unico, sempre con Chrome o Edge) dopo averla pubblicata con GitHub Pages: vedi `polpo/web/LEGGIMI.md`.

**Se qualcosa va storto:** ripeti dal punto 2. La modalità download con G0 funziona sempre, anche se il firmware è rovinato. Per tornare al firmware originale M5Stack usa **M5Burner** sul computer.

---

## 3. Primo avvio

1. Inserisci la microSD, formattata **FAT32**, prima di accendere.

   Il Polpo crea la cartella `/polpo` con dentro dei file di esempio:
   - un telecomando TV;
   - tre script BadUSB innocui;
   - un `LEGGIMI.txt`.
2. Sul desktop vedi il polpo: il livello cresce quando usi le funzioni. Premi **OK** (Invio) per il menu.
3. Comandi:

| Tasto | Funzione |
|---|---|
| `;` `.` | su / giù (le frecce sono stampate sui tasti) |
| `,` `/` | sinistra / destra (pagina su / giù nei menu) |
| **Invio** | apri, conferma, invia |
| `` ` `` (ESC) o **del** | indietro |
| **G0** (tasto laterale) | indietro, anche nei campi di testo |

---

## 4. Le funzioni

### Infrarossi

- **Universale: televisori / audio.** Invia lo stesso tasto (accendi, volume, muto, canali) a tutte le marche della libreria integrata:
  - TV: Samsung, LG, Sony, Philips, Panasonic, Toshiba;
  - audio: Sony, Yamaha.

  Punta il LED sul lato e premi OK appena il dispositivo reagisce.
- **I miei telecomandi.** Apre i file `.ir` in `/polpo/ir/`.
  - Il formato è lo stesso delle grandi raccolte di telecomandi della community: puoi copiare lì i file scaricati.
  - Protocolli: NEC, NECext, NEC42, Samsung32, RC5, RC5X, RC6, SIRC (12/15/20), Kaseikyo, RCA, Pioneer e RAW.
  - File al massimo di 48 KB: dividi i telecomandi molto grandi in più file. I segnali RAW possono durare al massimo 2 secondi.
- **Impara un telecomando.** Serve la **IR Unit** sulla porta Grove: il Cardputer da solo non può ricevere infrarossi.
  - Punta il telecomando originale da 5–10 cm e premi un tasto.
  - Il Polpo riconosce il protocollo o salva il segnale grezzo (RAW) in `/polpo/ir/imparati.ir`. Ogni nuovo tasto viene aggiunto in fondo al file: quelli già salvati restano.
  - Con `t` provi il tasto, con `r` ascolti di nuovo.

### Radio 433 MHz

Collega **RF433R** (ricevitore) e/o **RF433T** (trasmettitore) alla porta Grove. Con la Unit HUB possono restare collegati insieme.

- **Ricevi codici fissi.** Mostra i codici dei telecomandi a codice fisso (PT2262/EV1527, come quelli di prese radiocomandate e campanelli economici). Da qui puoi salvarli o ritrasmetterli.
- **Registra RAW.** Tieni premuto il tuo telecomando e premi OK. Vedi:
  - la forma d'onda;
  - la durata minima e massima;
  - il rapporto tra impulsi (1:3 indica un codice fisso).
- **Segnali salvati.** File `.sub` in `/polpo/rf433/`. Sono compatibili con i file "Princeton" (fino a 32 bit) e RAW di altri strumenti, a 433,92 MHz.
- **Limite di trasmissione.** Il Polpo trasmette al massimo l'8% del tempo in un'ora (la legge europea consente il 10% a 10 mW), e ogni invio dura al massimo 2 secondi. Il conteggio resta salvato anche se spegni e riaccendi.

Cosa **non** fa:

- non copia i codici variabili (*rolling code*) di cancelli, garage e auto moderni;
- non prova codici a caso;
- non disturba le frequenze.

### NFC

Collega la **Unit RFID2** (indirizzo I2C 0x28).

- **Leggi carta o tag.** Mostra:
  - UID, ATQA, SAK e famiglia di qualsiasi carta ISO 14443-A;
  - per i tag NTAG/Ultralight, anche il modello, la memoria e il contenuto NDEF (link, testo).

  Con `s` salvi la lettura in `/polpo/nfc/`.
- **Scrivi un link / un testo.**
  - Scrive un messaggio NDEF su un tag NTAG213/215/216 **tuo**.
  - Il Polpo controlla prima che il tag sia formattato, scrivibile e senza blocchi, poi rilegge per verificare.
  - Un tag NTAG213 vuoto costa pochi centesimi.

Non emula carte, non legge carte crittografate (bancomat, badge moderni) e non lavora a 125 kHz.

### BadUSB

Il Cardputer collegato via USB al **tuo** computer si comporta come una tastiera e digita gli script `.txt` che trovi in `/polpo/badusb/`.

1. Scegli il layout **IT** o **US** uguale a quello del computer (Impostazioni o menu BadUSB).
2. Scegli lo script: il Polpo mostra righe, caratteri e attese, e chiede conferma.
3. Dopo 3 secondi di conto alla rovescia parte; **qualsiasi tasto lo ferma**.

Comandi supportati:

- `REM`, `DELAY`, `DEFAULT_DELAY`;
- `STRING`, `STRINGLN`, `REPEAT`;
- tasti speciali: `ENTER`, `TAB`, `ESC`, frecce, `F1`–`F12`;
- combinazioni come `GUI r` o `CTRL ALT DELETE`.

Limiti: 32 KB, 2000 righe e 1200 azioni (una riga `STRING` o un tasto = un'azione; `REPEAT` le moltiplica).

Con il layout IT i caratteri `` ` `` e `~` non esistono: lo script viene rifiutato con il numero di riga.

Nota: il computer vede sempre una "tastiera" quando colleghi il Polpo. Su macOS può comparire l'assistente tastiera: chiudilo.

### Bluetooth

- **Scansione dispositivi.** Elenca i dispositivi Bluetooth LE vicini con:
  - nome, segnale (dBm), produttore e indirizzo.

  Con `s` salvi un file CSV in `/polpo/logs/`.
- **Telecomando multimediale.** Abbina "Polpo Remote" al tuo telefono o PC. Poi:
  - `;` `.` regolano il volume;
  - `,` `/` cambiano brano;
  - OK fa play/pausa;
  - `m` toglie l'audio.

### Wi-Fi

- **Scansione reti.** Mostra nome, canale, segnale e sicurezza; le reti aperte o WEP sono evidenziate.
  - `c` apre il grafico dei canali, con il canale consigliato per il **tuo** router;
  - `s` salva un CSV.

### GPIO e I2C

- **Scanner I2C.** Elenca i moduli I2C collegati alla porta Grove e ne suggerisce il nome.
- **Monitor pin G1 / G2.** Mostra il livello dei due pin di segnale e quante volte cambia.

### File, Diagnostica, Impostazioni, Info

- **File.** Sfoglia `/polpo`, mostra i file di testo, elimina.
- **Diagnostica.** Usala la prima volta e quando qualcosa non va. Contiene:
  - test della tastiera;
  - test della microSD;
  - scansione I2C;
  - test del LED infrarosso (il LED si vede viola con la fotocamera del telefono);
  - contatore di segnali del ricevitore 433;
  - riepilogo.
- **Impostazioni.** Luminosità, suoni, layout BadUSB, ripetizioni IR e 433, ricrea cartelle SD.

---

## 5. Collegamenti della porta Grove

| Filo | Segnale | Usato da |
|---|---|---|
| Nero | GND | tutti |
| Rosso | 5 V | tutti |
| Giallo | G2 | SDA (RFID2), trasmettitore RF433T |
| Bianco | G1 | SCL (RFID2), ricevitore RF433R, ricevitore IR Unit |

- La porta è una sola: i moduli I2C (RFID2) e quelli a 433 MHz si alternano. Il ricevitore IR e l'RF433R usano lo stesso filo.
- Sul **Cardputer Adv** sposta l'interruttore vicino alla porta su **uscita 5 V**, altrimenti i moduli restano spenti.
- Collega e scollega i moduli a dispositivo spento.

---

## 6. Limiti noti (da leggere prima di usarlo)

Il firmware è stato **compilato e testato in automatico sul computer**, ma non è stato provato su un Cardputer reale. La schermata **Diagnostica** serve proprio a verificare tutto la prima volta.

Possibili problemi conosciuti:

- **Portata del trasmettitore 433 MHz.** Il modulo RF433T si aspetta un segnale a 5 V e il Cardputer ne dà 3,3. In genere funziona (lo usa anche l'esempio ufficiale M5Stack), ma la portata può essere ridotta: avvicinati al ricevitore.
- **Segnali IR molto lunghi** (alcuni condizionatori) possono essere troncati in apprendimento.
- I protocolli **Kaseikyo** (Panasonic) e **NEC42** sono implementati dalle specifiche pubbliche e verificati con un codice noto, ma non con un telecomando vero.
- La batteria del v1.1 è piccola: per i moduli usa preferibilmente il cavo USB collegato.

Se trovi un problema, annota il **Riepilogo** della diagnostica e cosa stavi facendo.

---

## 7. Per chi vuole modificarlo

```
cd polpo
pip install platformio
pio test -e native        # test della logica (IR, DuckyScript, NDEF, .sub...) sul computer
pio run -e cardputer      # compila e crea release/polpo-cardputer-<versione>.bin
pio run -e cardputer -t upload   # carica via USB (Cardputer collegato)
```

Struttura:

| Cartella | Contenuto |
|---|---|
| `lib/polpo_core` | logica pura testabile |
| `src/hal` | driver hardware |
| `src/core` | interfaccia |
| `src/apps` | app |
| `sd_template` | file di esempio della microSD |
| `simulator` | simulatore nel browser |

**Licenze.**

- Codice Polpo: MIT.
- Librerie usate (rc-switch e altre): ognuna con la sua licenza.
- I formati dei file `.ir` e `.sub` sono implementati dalle specifiche pubbliche; nessun codice del firmware Flipper è stato copiato.

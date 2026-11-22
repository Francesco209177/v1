# Polpo Link — protocollo tra Polpo e PC

Righe JSON in UTF-8 sulla porta seriale USB (CDC) del Polpo, terminate da `\n` (`\r` ignorato).
Implementazione: firmware `polpo/src/link/` e `polpo/lib/polpo_core/src/polpo/link/`; PC
`studio/polpo_studio/protocols/link.py` e `devices/link_client.py`. Entrambe sono verificate con
`polpo/test/golden/link_pure.jsonl`.

## Forma dei messaggi

```text
richiesta  {"id":7,"cmd":"ir.send","args":{...}}
risposta   {"id":7,"ok":true,"data":{...}}
errore     {"id":7,"ok":false,"error":{"code":"denied","msg":"rifiutato sul Polpo"}}
evento     {"ev":"rf.code","data":{...}}
```

* `id`: intero 0…4294967295 scelto dal PC; la risposta lo ripete. Gli errori di formato hanno `id` 0.
* Righe inviate al Polpo: **al massimo 2048 byte**; annidamento JSON massimo 6. Le risposte possono essere più lunghe.
* **Una richiesta alla volta**: mentre il Polpo aspetta una conferma o una scansione risponde `busy`
  (tranne a `ping`). Il client di Studio mette in coda e riprova.

## Apertura della porta

DTR attivo e RTS basso **prima** dell'apertura (alcune combinazioni riavviano l'ESP32-S3), accesso esclusivo,
**mai 1200 baud** (è il segnale per entrare nel bootloader; si usa solo di proposito per aggiornare il firmware).

## Sessione

1. `ping` funziona sempre: `{"pong":true,"proto":1}`. Serve a capire se sulla porta c'è un Polpo.
2. `hello {"client":"Polpo Studio"}` fa comparire **"Collegare al PC?"** sullo schermo. Con Sì la risposta
   contiene le stesse informazioni di `info`; con No o dopo 20 s: errore `denied`.
3. Tutti gli altri comandi richiedono la sessione (`not_connected` altrimenti).
4. Il PC invia `ping` ogni 10 s: dopo **120 s** di silenzio il Polpo chiude la sessione.
5. La sessione finisce con `bye`, con Indietro sulla schermata "Collegato al PC" o per inattività:
   il Polpo invia l'evento `link.closed {"reason":"closed_on_device"}`.

## Comandi

| Comando | Argomenti | Risposta / note |
|---|---|---|
| `ping` | — | `pong`, `proto` |
| `hello` | `client` | come `info`; conferma sul Polpo |
| `info` | — | `firmware`, `board`, `battery`, `charging`, `heap_free`, `uptime_s`, `sd{ok,total,used}`, `modules{ir_tx,wifi,ble,usb_hid,rfid2,rf433,ir_unit}` (`available`/`missing`/`unverifiable`), `rf_budget{used_ms,limit_ms}`, `level`, `layout` |
| `diag` | — | `info` + `sd_test`, `i2c` (indirizzi) |
| `bye` | — | chiude la sessione |
| `fs.list` | `path` | `entries[{name,dir,size}]` |
| `fs.read` | `path`, `offset`, `len` (≤768) | `size`, `offset`, `data` (base64), `crc32`, `eof` |
| `fs.write` | `path`, `offset`, `data` (base64, ≤768 byte), `crc32`, `final` | scrive in `path.part`, rinomina con `final`; `offset` deve essere uguale a quanto già scritto; file ≤256 KB; in `/polpo/badusb/` conferma sul Polpo |
| `fs.delete` | `path` | — |
| `ir.send` | `file`+`name`, oppure `raw`+`frequency`+`duty`+`timings`, oppure `protocol`+`address`+`command` | — |
| `ir.learn.start` / `stop` | — | eventi `ir.learned` |
| `rf.rx.start` / `stop` | — | eventi `rf.code {protocol,bits,value,pulse_us}` |
| `rf.raw.start` / `snapshot` / `stop` | — | `snapshot`: `count`, `timings` (≤300), `stats` |
| `rf.tx` | `file` (un `.sub` sulla microSD) | **conferma sul Polpo**; solo 433,05–434,79 MHz; errore `budget` oltre il limite orario |
| `nfc.read` | — | `present`, `uid`, `atqa`, `sak`, `family`, `model`, `version`, `pages` |
| `nfc.write_ndef` | `kind` (`uri`/`text`), `value` (≤400 byte), `lang` | **conferma sul Polpo**, poi 15 s per appoggiare il tag; scrittura verificata |
| `wifi.scan` | — | `networks[{ssid,bssid,rssi,channel,auth}]` (≤30) |
| `ble.scan` | `ms` (≤10000) | `devices[{name,addr,rssi,mfr_id,connectable}]` (≤40) |
| `gpio.i2c_scan` | — | `devices[{addr,name}]` |
| `gpio.pins` | — | `g1`, `g2` |

Percorsi: solo dentro `/polpo`, senza `..` né `//`, caratteri `A-Z a-z 0-9 _ - . /`, 6–96 caratteri.

Non esiste un comando per **eseguire** script BadUSB dal PC: gli script si copiano e partono solo dal Polpo.

## Codici di errore

`bad_json`, `bad_request`, `line_too_long`, `unknown_cmd`, `not_connected`, `busy`, `bad_args`, `io_error`,
`no_hardware`, `too_large`, `denied`, `timeout`, `unsupported`, `budget`.

## Polpo Bridge

Lo sketch `studio/bridge/polpo_bridge` usa lo stesso formato a 115200 baud, senza sessione né conferme:
`ping`, `hello`, `pin.mode`, `pin.read`, `pin.write`, `adc.read`, `i2c.scan`, `ow.reset`, `ow.search`.

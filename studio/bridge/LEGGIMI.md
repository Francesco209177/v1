# Polpo Bridge

Sketch per Arduino Uno/Nano, ESP32 ed ESP32-S3 che permette a **Polpo Studio** di usare pin digitali,
ADC, scansione I2C e bus 1-Wire (iButton, sensori) via USB. Stato in Polpo Studio: **Sperimentale**.

## Caricarlo

**Arduino IDE**: apri `polpo_bridge/polpo_bridge.ino`, installa dal Gestore librerie *ArduinoJson* (7.x,
Benoit Blanchon) e *OneWire* (Paul Stoffregen), scegli la scheda e premi Carica.

**PlatformIO** (da questa cartella): `pio run -e uno -t upload` oppure `-e nano`, `-e esp32dev`, `-e esp32s3`.

Lo sketch è stato compilato per Uno (RAM 59%), ESP32 ed ESP32-S3; non è stato provato qui su schede vere.

## Collegamenti per l'iButton

| Lettore iButton | Arduino Uno/Nano | ESP32 |
|---|---|---|
| Dati | pin 4 | GPIO 4 |
| Resistenza di pull-up 4,7 kΩ | tra pin 4 e 5 V | tra GPIO 4 e 3,3 V |
| Massa | GND | GND |

Attenzione: i pin dell'ESP32 lavorano a 3,3 V e non tollerano 5 V.

## Sicurezza

Sono utilizzabili solo i pin elencati nello sketch (esclusi seriale, memoria flash e pin di avvio). Un pin
scrive solo se prima è stato impostato come uscita, e le uscite partono spente. Polpo Studio chiede la
modalità laboratorio e una conferma prima di ogni uscita. Lo sketch non legge né scrive la memoria delle
chiavi iButton e non le emula: legge solo il codice ROM.

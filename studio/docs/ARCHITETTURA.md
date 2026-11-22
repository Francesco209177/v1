# Polpo Studio — architettura

```
polpo_studio/
  app/          interfaccia Qt (PySide6): finestra, Home, pagine dei moduli, impostazioni, sicurezza, temi, icone
    tools/      strumenti di ogni modulo (registrati in TOOL_FACTORIES)
  core/         modello delle capacità, catalogo moduli e hardware, impostazioni, lingue, registro, eventi, app
  devices/      trasporti (seriale, Polpo virtuale), client Polpo Link, gestore del Polpo, Polpo Bridge,
                Bluetooth (bleak), elenco USB/HID, PC/SC, console seriale, firmware/esptool
  protocols/    formati puri e testabili: Polpo Link, NDEF, Type 2, .ir, .sub, RFID 125 kHz, 1-Wire,
                DuckyScript, elettronica
  security/     crittografia, cassaforte, registro con catena HMAC, modalità laboratorio, backup
  apps/         app integrate
  resources/    microSD del Polpo virtuale, casi golden, manifest del firmware
bridge/         sketch Polpo Bridge (Arduino/ESP32)
packaging/      PyInstaller, Inno Setup, udev, .desktop
tests/          pytest e pytest-qt
```

## Flussi principali

* **Capacità.** Ogni funzione (`core/catalog.py`) dichiara una o più *strade* di hardware. `HardwareState`
  (`core/hardware.py`) tiene la presenza di ogni elemento (rilevato, dichiarato, simulato, non verificabile,
  assente); `capability.evaluate` calcola lo stato mostrato. Gli stati si aggiornano a ogni cambio di hardware.
* **Collegamento.** `DeviceManager` apre il trasporto, verifica con `ping`, chiede `hello` (conferma sul Polpo),
  aggiorna l'hardware con `info.modules` e pubblica eventi sul bus. `PolpoLinkClient` mette le richieste in coda,
  una alla volta, riprova su `busy`, manda `ping` ogni 10 s, trasferisce file a blocchi con CRC32.
* **Thread.** Lettura seriale e Polpo virtuale girano in thread propri; Bluetooth in un ciclo asyncio dedicato.
  `GuiBridge` riporta eventi e risultati nel thread di Qt (segnali in coda): i widget non si toccano mai da
  altri thread.
* **Polpo virtuale.** Usa lo stesso `preprocess` del firmware (copia Python verificata con i casi golden) e
  risponde a tutti i comandi con dati segnati come simulati.
* **Sicurezza.** `Vault` (cassaforte), `AuditLog` (registro), `LabMode` (permessi temporanei) vivono in
  `AppContext`; il registro attività resta in memoria finché la cassaforte non è aperta, poi viene scritto cifrato.

## Parità con il firmware

I test confrontano direttamente con i sorgenti del firmware: casi golden di Polpo Link, tabella dei comandi,
costanti, tabella della libreria IR, file della microSD di esempio, regole e layout DuckyScript, formati .ir/.sub.
Se una delle due parti cambia, i test se ne accorgono.

## Test

`QT_QPA_PLATFORM=offscreen python -m pytest` (oltre 130 test): protocolli, cifratura, registro, client contro
il Polpo virtuale anche attraverso una porta seriale finta (pty), Bridge finto su pty, Bluetooth con una libreria
bleak finta, interfaccia completa senza schermo. `--self-test` ripete i controlli essenziali sul programma
impacchettato.

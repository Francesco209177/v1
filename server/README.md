# Backup iPhone: server Debian con interfaccia web

Fa il **backup completo dell'iPhone** sul tuo server Debian, come Finder o iTunes:
- **tutte le chat WhatsApp**, iMessage/SMS, impostazioni, dati delle app, contatti e calendari;
- con la cifratura attiva, anche password, reti Wi-Fi e dati di Salute.

Lo comandi da una **pagina web**, che apri in Chrome da telefono o PC (`http://IP-del-server:8765`), anche fuori casa tramite Tailscale.

Con il backup puoi:
- **ripristinare tutto su un iPhone nuovo senza avere quello vecchio**;
- **leggere le chat WhatsApp dalla pagina web** anche senza nessun telefono.

> Foto e video: il protocollo Apple manda comunque al server anche il Rullino foto (se le foto stanno sul telefono). Restano nel backup, così il ripristino è completo e affidabile.

---

## Cosa serve

- Il server con **Debian 13** (va bene anche Debian 12 o Ubuntu recente) e una porta **USB libera**.
- Il **cavo** dell'iPhone. Serve due volte:
  - all'inizio, per l'associazione;
  - sul telefono nuovo, per il ripristino.

  Tutti gli altri backup passano dal **Wi-Fi**.
- Facoltativo: **Tailscale** sul server, per aprire la pagina da fuori casa.

## 1. Installazione (una volta)

Sul server:

```bash
git clone -b ccr-bad433ea-g45kob https://github.com/Francesco209177/v1.git iphone-backup
cd iphone-backup/server
sudo ./install.sh
```

Lo script:
1. installa Python, `usbmuxd` (il "driver" Apple per Linux) e `rsync`;
2. crea l'utente di sistema `iphonebackup`;
3. mette il programma in `/opt/iphone-backup` e i dati in `/var/lib/iphone-backup`;
4. avvia il servizio `iphone-backup`.

Alla fine stampa gli indirizzi da aprire in Chrome.

Opzioni:
- `--backup-dir /mnt/disco/iphone`: salva i backup su un altro disco. **Consigliato** se `/var` è piccolo: un backup può pesare quanto lo spazio usato sul telefono.
- `--port 9000`: usa un'altra porta.

Per **aggiornare**: `git pull` e di nuovo `sudo ./install.sh`. Impostazioni, associazione e backup restano.

## 2. Primo accesso e associazione

1. Apri `http://IP-del-server:8765` e scegli la **password della pagina**.
2. Collega l'iPhone al server con il cavo e sbloccalo.
3. Vai in **Home → Associa iPhone**, poi tocca **Cerca iPhone collegati** → **Associa**.
4. Sull'iPhone tocca **Autorizza** e inserisci il codice.
5. Imposta la **password dei backup**: attiva la cifratura, così il backup salva anche password e dati di Salute.
   **Scrivila da qualche parte**: senza questa password il backup non si può ripristinare.
6. Tocca **Esegui il primo backup**. Il primo è completo e può durare a lungo; i successivi sono più veloci.

Da qui in poi puoi staccare il cavo.

## 3. Backup automatici

Il server fa un backup **ogni 24 ore**, configurabile in Impostazioni. Se l'iPhone non risponde, riprova ogni 30 minuti.

- In casa l'iPhone viene trovato da solo sulla Wi-Fi (Bonjour). Funziona meglio se è **in carica**: di notte è perfetto.
- **Copia sicura**: dopo ogni backup riuscito il server aggiorna una seconda copia (`copia-sicura/`). Se un backup si interrompe a metà, la copia buona resta. Si disattiva nelle Impostazioni se lo spazio non basta.
- **Fuori casa (sperimentale)**: in Impostazioni metti l'IP Tailscale dell'iPhone (`100.x.y.z`). Funziona solo se iOS accetta la connessione attraverso Tailscale; in casa è sempre più affidabile.
- **Notifiche**: con un indirizzo [ntfy](https://ntfy.sh) ricevi un avviso sul telefono a ogni backup.

## 4. Leggere le chat WhatsApp (senza telefono)

Pagina **WhatsApp**:
1. scegli il backup e inserisci la sua password;
2. si apre l'elenco di tutte le chat, gruppi compresi (anche WhatsApp Business);
3. leggi i messaggi con foto e allegati, oppure **esporta** una chat in `.txt` o `.html`.

Il backup viene decifrato sul server in una cartella privata. La copia viene cancellata quando chiudi o dopo 30 minuti di inattività.

Nella pagina **Backup** c'è anche **Verifica password**: provala subito dopo il primo backup, per essere sicuro di ricordarla.

## 5. Ripristino sul nuovo iPhone (senza il vecchio)

1. Accendi il nuovo iPhone e segui la configurazione fino a **Trasferisci app e dati**, poi scegli **Da Mac o PC**.
   Se serve, aggiorna iOS: deve essere uguale o più recente di quello del backup.
2. Collega il nuovo iPhone al server con il cavo.
3. Nella pagina **Ripristina**:
   1. scegli il backup;
   2. tocca **Cerca iPhone collegati** e poi **Usa questo**;
   3. inserisci la password del backup;
   4. scrivi `RIPRISTINA` e conferma.
4. Non scollegare il cavo finché l'iPhone non si riavvia.

Dopo il riavvio l'iPhone riscarica le app. Apri WhatsApp, verifica il numero: le chat sono già lì.

**Alternativa senza server**: in **Backup → Scarica (.zip)** ottieni il backup nel formato di Finder e iTunes, da ripristinare da un Mac o PC. Le istruzioni sono nella pagina stessa.

## Checklist di prova (consigliata subito)

- [ ] `sudo ./install.sh` finisce con "Fatto!" e la pagina si apre in Chrome.
- [ ] Associazione via USB riuscita; cifratura attivata (l'iPhone chiede il codice).
- [ ] Il primo backup finisce con "Backup completato"; in **Backup** risulta *Completo* e *Cifrato*.
- [ ] **Verifica password** dice "Password corretta".
- [ ] Nella pagina **WhatsApp** vedi le tue chat.
- [ ] Stacca il cavo e premi **Verifica connessione** con l'iPhone sul Wi-Fi: deve dire "Raggiungibile · Wi-Fi di casa".
- [ ] Il giorno dopo, la Home mostra un backup automatico riuscito.

## Problemi comuni

| Messaggio | Cosa fare |
|---|---|
| Nessun iPhone collegato via USB | Usa un cavo dati (non solo ricarica), sblocca l'iPhone, prova un'altra porta. Controlla con `lsusb` che compaia "Apple". |
| iPhone non raggiungibile | Deve essere acceso, sbloccato almeno una volta dopo il riavvio e sulla stessa Wi-Fi del server. Meglio se in carica. Con ufw attivo: `sudo ufw allow 5353/udp`. |
| L'associazione non è più valida | Succede dopo "Ripristina impostazioni" sull'iPhone o se tocchi "Non autorizzare": rifai **Associa**. |
| Password del backup errata | È quella impostata in **Associa** (o in passato da iTunes/Finder). Se l'hai persa: sull'iPhone *Impostazioni → Generali → Trasferisci o inizializza → Inizializza → Ripristina impostazioni*, poi reimpostala. |
| Disattiva "Dov'è" | Al ripristino il telefono di destinazione deve avere "Dov'è" spento (su un telefono nuovo lo è già). |

Registro del servizio: `journalctl -u iphone-backup -f` · configurazione: `/etc/default/iphone-backup`.

## Sicurezza

- La pagina è protetta da password (hash scrypt). Non esporla su Internet aprendo porte nel router: da fuori casa usa **Tailscale**.
- I file di associazione (`/var/lib/iphone-backup/pairing/`) danno accesso al telefono: restano leggibili solo dall'utente `iphonebackup`.
- La password dei backup **non viene salvata** sul server: la chiede la pagina quando serve.

## Prova senza iPhone (modalità demo)

```bash
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m iphone_backup --demo --data /tmp/iphone-demo --port 8765
```

Apri `http://localhost:8765`: l'iPhone è simulato e c'è un backup di esempio con alcune chat WhatsApp.

## Disinstallare

```bash
sudo systemctl disable --now iphone-backup
sudo rm -rf /opt/iphone-backup /etc/systemd/system/iphone-backup.service /etc/default/iphone-backup
# I backup e i dati restano in /var/lib/iphone-backup (cancellali solo se non ti servono più).
```

## Come funziona (per chi vuole sapere)

- **Backup e ripristino:** [pymobiledevice3](https://github.com/doronz88/pymobiledevice3) parla con l'iPhone usando lo stesso protocollo di Finder e iTunes (`mobilebackup2`), via USB (usbmuxd) o via rete (porta 62078).
- **Decifratura:** [pyiosbackup](https://github.com/matan1008/pyiosbackup) decifra il backup per leggere il database di WhatsApp (`ChatStorage.sqlite`).
- **Pagina web:** FastAPI e Jinja2. Il codice è in `iphone_backup/`, i test in `tests/` (`python -m pytest`).

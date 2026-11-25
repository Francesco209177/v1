# Backup completo dell'iPhone dal NAS

L'app **Backup NAS** salva solo ciò che iOS lascia leggere a un'app: contatti, calendari, file e chat esportate.
Per un backup **completo e ripristinabile**, come quello di Finder o iTunes (chat WhatsApp, SMS e iMessage, impostazioni, dati delle app, portachiavi se cifrato), deve essere il NAS a chiederlo all'iPhone.
Questo container lo fa via rete con [pymobiledevice3](https://github.com/doronz88/pymobiledevice3).

> **Limiti, da sapere prima**
> - **In casa (Wi-Fi)** è il caso che funziona meglio.
> - **Fuori casa tramite Tailscale** è *sperimentale*: dipende da come iOS e Tailscale gestiscono le connessioni in ingresso verso l'iPhone. Il container prova gli indirizzi in ordine, quindi in casa funziona comunque.
> - Al primo backup (e a volte dopo un aggiornamento di iOS) l'iPhone può chiedere il **codice di sblocco**: tienilo a portata di mano.
> - Il backup completo include il **Rullino foto** se le foto stanno sul telefono (anche se usi Immich). Prevedi lo spazio sul NAS.
> - Non è stato possibile provarlo su un iPhone vero mentre veniva scritto: segui i passi e controlla i log.

## Cosa serve

- Un NAS con **Docker** (Synology: *Container Manager*; QNAP: *Container Station*; TrueNAS/Unraid: Docker o Compose).
- **Tailscale** installato sul NAS, se vuoi provare il backup da fuori casa.
- **Una volta sola**: un computer (Windows, Mac o Linux) con il cavo USB dell'iPhone e Python 3, per creare il "pairing" (l'autorizzazione "Autorizza questo computer").

## 1. Pairing e sincronizzazione via Wi-Fi (una volta sola, dal computer)

Collega l'iPhone al computer con il cavo, sbloccalo e poi:

```bash
python3 -m pip install pymobiledevice3
pymobiledevice3 lockdown pair                    # sull'iPhone tocca "Autorizza" e inserisci il codice
pymobiledevice3 lockdown wifi-connections on     # abilita le connessioni via Wi-Fi
pymobiledevice3 lockdown save-pair-record pairing.plist
```

Su Windows potrebbe servire iTunes (o "Apple Devices") installato per i driver USB.

Il file `pairing.plist` **dà accesso completo al telefono**: tienilo solo sul NAS, non condividerlo.

> **Hai già il pairing file di SideStore?** È lo stesso tipo di file (`*.mobiledevicepairing` o `.plist`).
> Puoi provare a usarlo al posto di `pairing.plist`, ma serve comunque che le connessioni Wi-Fi siano attive.
> Il comando `wifi-connections on` qui sopra lo fa; in alternativa basta spuntare "Mostra questo iPhone quando connesso a Wi-Fi" in Finder o iTunes.

## 2. Configura il container sul NAS

Copia questa cartella (`nas-full-backup/`) sul NAS, per esempio in `/volume1/docker/iphone-backup/`, poi:

1. Crea la sottocartella `config/` e mettici dentro `pairing.plist`.
2. Copia `.env.example` in `.env` e compila:
   - `IPHONE_HOSTS`: prima l'IP dell'iPhone in casa (meglio fissarlo nel router con una "prenotazione DHCP"), poi l'IP Tailscale dell'iPhone (`100.x.y.z`, lo vedi nell'app Tailscale);
   - `BACKUP_PASSWORD`: password per cifrare i backup (vedi il passo 3).
3. In `docker-compose.yml` cambia `/volume1/backup/iPhone-completo` con la cartella del NAS dove vuoi i backup.
4. Costruisci l'immagine e prova la connessione (iPhone sbloccato e sulla stessa Wi-Fi):

```bash
docker compose build
docker compose run --rm iphone-backup info
```

Deve mostrare nome, modello e versione di iOS, e "Sincronizzazione Wi-Fi: attiva".

## 3. Attiva la cifratura (consigliato)

Con la cifratura il backup contiene anche password, Wi-Fi, dati di Salute e cronologia.
Senza la password, però, **non si può ripristinare**.

```bash
docker compose run --rm iphone-backup encryption-on
```

Se la cifratura era già stata attivata in passato da Finder o iTunes, resta quella password.

## 4. Primo backup e avvio automatico

```bash
docker compose run --rm iphone-backup backup   # il primo è completo e può durare a lungo
docker compose up -d                           # poi un backup ogni INTERVAL_HOURS (predefinito: 24 ore)
docker compose logs -f                         # per seguire l'avanzamento
```

- Se l'iPhone non risponde, il container riprova ogni `RETRY_MINUTES` (predefinito: 30 minuti).
- I backup successivi sono **incrementali**.
- L'esito dell'ultimo tentativo è in `status.json`, dentro la cartella dei backup.
- Con `NOTIFY_URL` (per esempio un topic [ntfy](https://ntfy.sh)) ricevi una notifica alla fine di ogni backup.

Il backup finisce in `<cartella backup>/<UDID dell'iPhone>/`, nello stesso formato di Finder e iTunes.
Conviene attivare gli **snapshot** della cartella sul NAS (Btrfs su Synology, ZFS su TrueNAS) per conservare più versioni.

## Ripristino

- **Da un computer**: copia la cartella `<UDID>` in
  - `~/Library/Application Support/MobileSync/Backup/` (Mac);
  - `%APPDATA%\Apple Computer\MobileSync\Backup\` oppure `%USERPROFILE%\Apple\MobileSync\Backup\` (Windows).

  Poi usa "Ripristina backup…" in Finder, iTunes o Apple Devices.
- **Con pymobiledevice3**, iPhone collegato via USB: `pymobiledevice3 backup2 restore --system --password 'LA_TUA_PASSWORD' <cartella backup>`. Opzioni e dettagli sono in `pymobiledevice3 backup2 restore --help`.

## Problemi comuni

| Messaggio | Cosa fare |
|---|---|
| `Nessun host raggiungibile` | L'iPhone è sulla stessa rete o su Tailscale? L'IP è giusto? Lo schermo spento a lungo può addormentare la Wi-Fi: prova con il telefono in carica. |
| `non accetta il pairing file` | Rifai il passo 1 (il pairing si perde con "Ripristina impostazioni" o se tocchi "Non autorizzare"). |
| Il backup si ferma chiedendo il codice | Sblocca l'iPhone e inserisci il codice, poi rilancia `backup`. |

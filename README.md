# Backup iPhone sul server (WhatsApp compreso)

Un programma per il tuo **server Debian** che fa il backup completo dell'iPhone, come Finder o iTunes:
- **tutte le chat WhatsApp**, messaggi, impostazioni, app e contatti;
- con la cifratura attiva, anche password e dati di Salute.

Lo usi da una **pagina web** in Chrome (`http://IP-del-server:8765`), in casa o tramite Tailscale.

- 🔁 **Backup automatico** via Wi-Fi ogni giorno, con una copia di sicurezza dell'ultimo backup riuscito.
- 💬 **Chat WhatsApp leggibili dalla pagina web**, anche senza telefono, ed esportabili in .txt/.html.
- 📱 **Ripristino su un iPhone nuovo senza avere quello vecchio**: colleghi il nuovo iPhone al server e premi "Ripristina".
- ⬇️ **Download del backup** in formato Finder/iTunes, da usare anche su un Mac o PC.

👉 **Installazione e guida: [server/README.md](server/README.md)**

```bash
git clone -b ccr-bad433ea-g45kob https://github.com/Francesco209177/v1.git iphone-backup
cd iphone-backup/server && sudo ./install.sh
```

> Perché non un'app per iPhone? iOS non permette a nessuna app di leggere i dati di WhatsApp o di altre app.
> L'unico backup completo e ripristinabile è quello "da computer" di Apple: qui il "computer" è il tuo server.

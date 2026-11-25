# Backup NAS per iPhone

Due strumenti per fare il backup dell'iPhone sul tuo NAS, anche fuori casa tramite **Tailscale**. Foto e video sono esclusi, perché li gestisce Immich.

| | Cosa salva | Come |
|---|---|---|
| **App iOS "Backup NAS"** (`ios/`) | Contatti (.vcf), calendari e promemoria (.ics), cartelle dell'app File (anche iCloud Drive), file condivisi da altre app come le **chat WhatsApp esportate** | L'app copia i file via SMB sulla cartella condivisa del NAS |
| **Backup completo dal NAS** (`nas-full-backup/`) | Tutto, come Finder/iTunes: WhatsApp ripristinabile, SMS/iMessage, impostazioni, dati delle app | Un container Docker sul NAS chiede il backup all'iPhone via rete → [guida](nas-full-backup/README.md) |

> **Perché due strumenti?** iOS non permette a nessuna app di leggere i dati di WhatsApp, gli SMS o i dati di altre app.
> L'app salva ciò che è accessibile. Il backup completo (ripristinabile) lo può fare solo un "computer", in questo caso il NAS.

---

## 1. Installare l'app con SideStore

L'IPA **non firmata** viene compilata in automatico da GitHub Actions a ogni modifica di `ios/` e pubblicata nelle Release:

- **Ultima versione:** <https://github.com/Francesco209177/v1/releases/latest/download/BackupNAS.ipa>
- **Sorgente SideStore** (per ricevere gli aggiornamenti in SideStore): `https://github.com/Francesco209177/v1/releases/latest/download/source.json`

Sull'iPhone:

1. Apri il link dell'IPA in Safari e scaricala.
2. In SideStore tocca **+** (scheda Le mie app) e scegli `BackupNAS.ipa` da File. In alternativa, dall'app File: Condividi → SideStore.
3. Con un Apple ID gratuito l'app va **rinnovata ogni 7 giorni** da SideStore, come le altre app sideloaded (massimo 3 attive).

## 2. Preparare il NAS (SMB)

1. Crea una cartella condivisa, per esempio `backup`, e un utente con permesso di scrittura.
2. Attiva SMB (SMB2/SMB3: è attivo di default su Synology, QNAP, TrueNAS e Unraid).
3. Installa **Tailscale sul NAS** e sull'iPhone, con lo stesso account.

## 3. Configurare l'app

Scheda **Impostazioni**:

- **Indirizzo**: l'IP Tailscale del NAS (`100.x.y.z`) o il suo nome MagicDNS (`nas.tail1234.ts.net`). Funziona sia in casa sia fuori, purché Tailscale sia attivo sull'iPhone.
- **Condivisione**, **Utente**, **Password**. La password resta nel Portachiavi dell'iPhone.
- **Cartella base** (predefinita: `Backup iPhone`) e **Nome iPhone**.
- Tocca **Test connessione**: deve dire "Connesso" e "Scrittura riuscita".

Sul NAS i file finiscono così:

```
\\NAS\backup\Backup iPhone\iPhone\
├── Contatti\Contatti_2026-11-25_1030.vcf        (ultime N copie)
├── Calendari\2026-11-25_1030\Lavoro (iCloud).ics
├── Promemoria\2026-11-25_1030\Promemoria.ics
├── File\<cartella scelta>\...                   (solo file nuovi o modificati, mai cancellati)
├── WhatsApp\2026-11-25_1030 WhatsApp Chat - Mario.zip
└── Ricevuti\2026-11-25\<altri file condivisi>
```

## 4. Usare l'app

- **Backup**: scegli cosa salvare e tocca **Esegui backup ora**. Lascia l'app aperta: lo schermo resta acceso finché il backup non finisce.
- **Cartelle**: con **+** scegli una cartella dall'app File (iCloud Drive, Sul mio iPhone…). A ogni backup vengono copiati solo i file nuovi o modificati.
- **Chat WhatsApp**: in WhatsApp apri la chat, tocca il nome, poi **Esporta chat** e scegli **Backup NAS** nel menu Condividi. Il file viene caricato subito (o al primo backup se il NAS non è raggiungibile). Lo stesso vale per qualsiasi altro file, per esempio Salute → profilo → **Esporta tutti i dati sanitari**.
- **Automatico**:
  - iOS esegue il backup in background quando decide lui (di solito di notte, in carica).
  - Per un orario affidabile crea in **Comandi rapidi → Automazione** una regola, per esempio "Quando l'iPhone è collegato all'alimentazione", con l'azione **Esegui backup NAS**.

## 5. Checklist di prova (da fare la prima volta)

- [ ] Impostazioni → **Test connessione** con Tailscale attivo, sia in Wi-Fi a casa sia in rete mobile.
- [ ] **Esegui backup ora** → sul NAS compaiono `Contatti/…vcf`, `Calendari/<data>/…ics` e `Promemoria/<data>/…ics`.
- [ ] Apri un `.vcf` o un `.ics` sul computer e controlla che contenga i tuoi dati.
- [ ] Cartelle → **+** → scegli una cartella di prova → **Sincronizza ora** → i file sono in `File/<cartella>/`. Un secondo giro deve caricare "0 file nuovi".
- [ ] WhatsApp → Esporta chat → Backup NAS → il file compare in `WhatsApp/`.
- [ ] Spegni Tailscale e prova un backup: deve fallire con un messaggio chiaro, e i file condivisi restano "In attesa".

## Sicurezza

- Il codice è tutto in questo repository: niente server di terze parti, niente analytics.
- Il traffico viaggia nel tunnel cifrato di Tailscale (WireGuard): **non serve aprire porte** del NAS su Internet.
- La password SMB è nel Portachiavi dell'iPhone. I file restano sul telefono solo finché non sono sul NAS.
- Per il backup completo, il file di pairing dà accesso totale al telefono: tienilo solo sul NAS (vedi la [guida](nas-full-backup/README.md)).

## Per sviluppatori

- `ios/project.yml`: progetto [XcodeGen](https://github.com/yonaskolb/XcodeGen), SwiftUI, iOS 16+, dipendenza [AMSMB2](https://github.com/amosavian/AMSMB2) (libsmb2, LGPL 2.1, collegata dinamicamente).
- `.github/workflows/ios.yml`:
  1. genera il progetto;
  2. esegue i test sul simulatore;
  3. compila per iPhone senza firma (`CODE_SIGNING_ALLOWED=NO`);
  4. crea `Payload/BackupNAS.app` → `BackupNAS.ipa`;
  5. pubblica la Release.
- In locale, su un Mac: `brew install xcodegen && cd ios && xcodegen generate && open BackupNAS.xcodeproj`.

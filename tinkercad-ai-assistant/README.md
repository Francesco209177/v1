# Tinkercad AI Code Assistant

Estensione per **Google Chrome** e **Microsoft Edge** (Manifest V3) che aggiunge un pulsante **AI** dentro l'editor di
**Tinkercad Circuits**. Scrivi cosa deve fare il circuito, l'estensione acquisisce lo screenshot del circuito e il codice
già presente nell'editor, li invia a un modello AI tramite **OpenRouter** e copia negli appunti il codice Arduino generato.

```
Apri Tinkercad Circuits → clic su «AI» → scrivi la richiesta → screenshot del circuito
→ OpenRouter genera il codice → codice copiato negli appunti → il pulsante diventa verde
```

Il codice **non** viene inserito automaticamente nell'editor: lo incolli tu quando vuoi (Ctrl/⌘+V).

---

## Indice

1. [Struttura del progetto](#struttura-del-progetto)
2. [Requisiti](#requisiti)
3. [Installazione del backend](#installazione-del-backend)
4. [Installazione dell'estensione](#installazione-dellestensione)
5. [Uso su Tinkercad Circuits](#uso-su-tinkercad-circuits)
6. [Verifica del funzionamento](#verifica-del-funzionamento)
7. [Permessi richiesti e perché](#permessi-richiesti-e-perché)
8. [Sicurezza](#sicurezza)
9. [Diagnostica dei problemi](#diagnostica-dei-problemi)
10. [Come funziona l'integrazione con Tinkercad](#come-funziona-lintegrazione-con-tinkercad)
11. [Test automatici](#test-automatici)
12. [Limitazioni da verificare manualmente](#limitazioni-da-verificare-manualmente)
13. [Configurazione avanzata del backend](#configurazione-avanzata-del-backend)

---

## Struttura del progetto

```
tinkercad-ai-assistant/
├── extension/                 # Estensione da caricare in Chrome/Edge
│   ├── manifest.json
│   ├── background.js          # service worker: screenshot, ritaglio, chiamata al backend
│   ├── popup.html/.js/.css    # stato backend, impostazioni, permesso facoltativo
│   ├── content/
│   │   ├── hotkeys.js         # (document_start) scorciatoie Ctrl+Shift+A / Ctrl+Shift+Z
│   │   ├── page-bridge.js     # (MAIN world) legge il testo di CodeMirror, nient'altro
│   │   ├── tinkercad-dom.js   # selettori Tinkercad verificati, rettangolo del circuito, componenti
│   │   ├── ui.js              # pulsante + pannello in Shadow DOM
│   │   ├── content.js         # avvio, MutationObserver, flusso di generazione, appunti
│   │   └── panel.css
│   ├── shared/                # moduli testabili anche in Node
│   │   ├── extract-code.js    # estrazione del blocco ```cpp
│   │   ├── state-machine.js   # IDLE / GENERATING / SUCCESS / ERROR
│   │   ├── hotkeys.js         # regole delle scorciatoie (quando nascondere/mostrare)
│   │   └── crop.js            # calcolo del ritaglio dello screenshot
│   └── icons/
├── server/                    # Backend Node.js + Express (custodisce la chiave OpenRouter)
│   ├── server.js  openrouter.js  prompt.js  validate.js
│   ├── .env.example
│   ├── dev/mock-openrouter.js # finto OpenRouter per test e prove senza credito
│   └── test/
├── test/                      # test dei moduli dell'estensione e del manifest
├── e2e/run-e2e.js             # test end-to-end con Chromium su una pagina reale di Tinkercad
└── scripts/make-icons.js
```

## Requisiti

- **Node.js 22** o successivo (per il backend e i test).
- **Google Chrome 111+** o **Microsoft Edge 111+** (necessario per gli script nel "MAIN world").
- Un account **OpenRouter** con credito e una chiave API: <https://openrouter.ai/settings/keys>.

## Installazione del backend

Il backend è un piccolo server locale: riceve le richieste dall'estensione e chiama OpenRouter con la tua chiave,
che **non lascia mai il server**.

```bash
cd tinkercad-ai-assistant/server
npm install
cp .env.example .env        # su Windows: copy .env.example .env
```

Apri `server/.env` e compila:

```ini
OPENROUTER_API_KEY=la-tua-chiave-openrouter
OPENROUTER_MODEL=fornitore/nome-modello
```

### Scegliere `OPENROUTER_MODEL`

Il modello non è fissato nel codice: scegli tu lo slug su <https://openrouter.ai/models>.

- Serve un modello che accetti **immagini in input** (filtro *Input modalities → Image*). Non tutti i modelli lo fanno.
- All'avvio della prima richiesta il backend controlla il catalogo pubblico `GET /api/v1/models` e legge
  `architecture.input_modalities`:
  - se il modello **non** accetta immagini, lo screenshot non viene inviato e l'estensione mostra un avviso;
  - se il modello non è nel catalogo (es. router automatici), lo screenshot viene inviato comunque con un avviso.
- Il popup dell'estensione mostra il modello configurato e se accetta immagini.

Per i modelli con "ragionamento" lungo può servire aumentare `OPENROUTER_MAX_TOKENS` (default 8000).

### Avviare il server

```bash
npm start
```

Messaggio atteso: `Tinkercad AI backend in ascolto su http://127.0.0.1:3000 (modello: …)`.
Verifica rapida: apri <http://127.0.0.1:3000/health> → `{"ok":true,"model":"…","imageSupport":"yes",…}`.

Se manca la chiave o il modello, il server si ferma indicando cosa correggere (senza mai stampare la chiave).

## Installazione dell'estensione

1. Apri `chrome://extensions` (in Edge: `edge://extensions`).
2. Attiva **Modalità sviluppatore** (in alto a destra; in Edge nel menu a sinistra).
3. Clicca **Carica estensione non pacchettizzata** e seleziona la cartella `tinkercad-ai-assistant/extension`.
4. (Consigliato) Fissa l'icona dell'estensione nella barra degli strumenti (icona del puzzle → spilla).
5. (Consigliato) Copia l'**ID** dell'estensione mostrato nella scheda e inseriscilo nel file `.env` del server:
   `ALLOWED_EXTENSION_IDS=abcdefghijklmnopabcdefghijklmnop`, poi riavvia il server. Così il backend accetta richieste
   solo dalla tua estensione.
6. Clicca l'icona dell'estensione: nel popup la sezione **Backend** deve indicare «Connesso · modello …».
   Se il server non è su `http://localhost:3000`, modifica l'URL e premi **Salva**.

Dopo aver installato o ricaricato l'estensione, **ricarica le schede di Tinkercad già aperte**.

## Uso su Tinkercad Circuits

1. Apri un circuito nell'editor di Tinkercad Circuits (`https://www.tinkercad.com/things/…/editel`).
2. Compare un piccolo pulsante **AI**:
   - sotto il pulsante **Code** di Tinkercad quando il pannello del codice è chiuso;
   - a sinistra del pannello del codice quando è aperto.
   Se copre qualcosa, **trascinalo** dove preferisci (la posizione viene ricordata; si ripristina dal popup).
3. **Prima volta in una scheda**: Chrome consente lo screenshot solo dopo un gesto sull'estensione. Clicca l'icona
   dell'estensione nella barra (o premi **Alt+Shift+A**, che apre anche il pannello). In alternativa attiva
   «Screenshot senza clic aggiuntivi» nel popup (vedi [Permessi](#permessi-richiesti-e-perché)).
4. Clicca **AI**, scrivi la richiesta (es. *«Fai lampeggiare il LED collegato al pin 13 ogni secondo»*) e premi
   **Genera codice** oppure **Ctrl+Invio** (⌘+Invio su Mac).
5. Stati del pulsante:

   | Stato | Aspetto | Significato |
   |---|---|---|
   | IDLE | neutro | pronto |
   | GENERATING | spinner blu | screenshot e generazione in corso |
   | SUCCESS | **verde** | codice ricevuto, estratto **e** copiato negli appunti |
   | ERROR | **rosso** | errore di screenshot, backend, OpenRouter o copia (dettagli nel pannello) |

6. Nel pannello trovi l'anteprima del codice, eventuali avvisi e il pulsante **Copia codice** per copiarlo di nuovo.
7. Incolla il codice nell'editor di Tinkercad. Nota: se l'editor è in modalità **Blocchi**, per incollare testo devi
   passare a **Testo** dal menu a tendina del pannello codice (Tinkercad chiede conferma perché i blocchi vengono sostituiti).

Se il modello non restituisce un blocco di codice (ad esempio chiede un chiarimento perché un collegamento non è
visibile), la risposta viene mostrata come testo, **non** viene copiata e il pulsante non diventa verde.

### Scorciatoie da tastiera

| Tasti | Dove | Effetto |
|---|---|---|
| **Ctrl+Shift+A** | pagina di Tinkercad | nasconde pulsante AI e pannello. Prompt, codice generato, messaggi e colore del pulsante restano com'erano; gli appunti non vengono toccati |
| **Ctrl+Shift+Z** | pagina di Tinkercad, solo con l'assistente nascosto | lo mostra di nuovo esattamente come l'avevi lasciato |
| **Ctrl+Invio** (⌘+Invio su Mac) | nel prompt | genera il codice |
| **Esc** | nel pannello | chiude il pannello |
| **Alt+Shift+A** | ovunque in Chrome | apre/chiude il pannello (e lo rende visibile se era nascosto); autorizza anche lo screenshot |

Note:
- Lo stato «nascosto» viene ricordato anche dopo il ricaricamento della pagina e vale per tutte le schede di Tinkercad.
  Se dimentichi la scorciatoia, il pulsante **Mostra l'assistente** nel popup lo fa riapparire.
- Una generazione in corso continua anche mentre l'assistente è nascosto.
- Su Tinkercad **Ctrl+Shift+A** sostituisce la «Ricerca schede» di Chrome (che resta disponibile dal pulsante nella barra delle schede).
- **Ctrl+Shift+Z** viene usato dall'assistente solo quando è nascosto: con l'assistente visibile resta il «Ripeti» di
  Tinkercad. Per ripetere puoi comunque usare sempre **Ctrl+Y**.

## Verifica del funzionamento

Checklist manuale (richiede un account Tinkercad):

1. Server avviato, popup «Connesso».
2. Apri un circuito con Arduino e un LED, poi clicca l'icona dell'estensione (concede lo screenshot).
3. Pulsante **AI** visibile una sola volta; aprendo/chiudendo il pannello **Code** il pulsante lo segue.
4. Scrivi «Fai lampeggiare il LED collegato al pin 13 ogni secondo» → Ctrl+Invio.
5. Atteso: spinner → pulsante verde → messaggio «Codice generato e copiato negli appunti» → anteprima del codice.
6. Incolla (Ctrl+V) in un editor di testo: deve esserci solo il codice, senza ```` ``` ````.
7. Nel pannello, la riga sotto il codice indica il modello e «screenshot del circuito».

Per provare senza consumare credito puoi usare il finto OpenRouter incluso:

```bash
cd server
npm run mock                      # terminale 1: finto OpenRouter su http://127.0.0.1:4010
OPENROUTER_BASE_URL=http://127.0.0.1:4010/api/v1 OPENROUTER_API_KEY=finta OPENROUTER_MODEL=test/vision-model npm start   # terminale 2
```

## Permessi richiesti e perché

| Permesso | Tipo | Perché |
|---|---|---|
| `https://www.tinkercad.com/*` | host | inserire pulsante e pannello nelle pagine di Tinkercad |
| `http://localhost/*`, `http://127.0.0.1/*` | host | contattare il backend locale (qualsiasi porta) |
| `activeTab` | API, nessun avviso | screenshot della scheda **dopo** un clic sull'icona o la scorciatoia |
| `storage` | API | salvare URL del backend, token facoltativo, posizione del pulsante e stato «nascosto» |
| `<all_urls>` | **facoltativo**, solo su richiesta | screenshot direttamente dal pulsante AI, senza clic sull'icona |
| origine del backend remoto | **facoltativo**, solo su richiesta | solo se configuri un backend non locale (https) |

Perché esiste l'opzione `<all_urls>`: l'API `chrome.tabs.captureVisibleTab` funziona **solo** con `activeTab` o con
`<all_urls>`; il permesso host per tinkercad.com non basta (documentazione Chrome). `activeTab` viene concesso solo da un
gesto sull'estensione (icona, scorciatoia), non da un clic su un pulsante dentro la pagina. L'estensione chiede
`<all_urls>` solo se attivi l'interruttore nel popup, e puoi revocarlo in qualsiasi momento dallo stesso interruttore.
Chrome lo mostra come «Leggere e modificare tutti i dati sui siti web»: l'estensione lo usa solo per lo screenshot.

## Sicurezza

- La chiave OpenRouter sta **solo** in `server/.env` (escluso da git). Non è presente in `manifest.json`, negli script o
  in altri file dell'estensione (un test automatico lo verifica) e non viene mai restituita al browser né scritta nei log.
- Il server ascolta su `127.0.0.1` e accetta solo origini `chrome-extension://` (eventualmente solo gli ID in
  `ALLOWED_EXTENSION_IDS`): una pagina web non può usare il tuo server né il tuo credito. Con `ACCESS_TOKEN` puoi
  aggiungere un token condiviso (da inserire nel popup).
- Il backend valida i dati (lunghezze, formato e firma dell'immagine, campi ammessi), limita la dimensione del corpo
  (`MAX_BODY_MB`), il numero di richieste al minuto e quelle simultanee, applica un timeout alla chiamata OpenRouter e
  annulla la chiamata se l'estensione si disconnette.
- Prompt, codice e screenshot non vengono salvati: i log contengono solo metodo, percorso, stato e durata.
- La risposta del modello è trattata come **non attendibile**: viene mostrata solo come testo (`textContent`/`value`,
  mai `innerHTML`), non viene eseguita, e il progetto Tinkercad non viene modificato né salvato.
- L'estensione non aggira autenticazione o protezioni: legge solo ciò che la pagina già mostra all'utente.

## Diagnostica dei problemi

### Il pulsante AI non compare

- Ricarica la pagina di Tinkercad dopo aver installato o aggiornato l'estensione.
- Il pulsante appare solo nell'editor dei circuiti (elemento `.js-editor--circuit`), non nella dashboard o nell'editor 3D.
- Se Tinkercad ha cambiato la propria interfaccia, il pulsante usa comunque una posizione di ripiego in basso a destra
  dell'area di lavoro; se l'editor non viene più riconosciuto, apri la console (F12) e verifica che esista
  `document.querySelector('.js-editor--circuit')`.

### Errori di screenshot

| Messaggio | Soluzione |
|---|---|
| «Chrome non ha ancora autorizzato lo screenshot…» | clicca l'icona dell'estensione o premi Alt+Shift+A nella scheda, poi riprova; oppure attiva l'opzione nel popup; oppure usa **Genera senza screenshot** |
| «Porta la scheda di Tinkercad in primo piano…» | Chrome cattura solo la scheda visibile: non cambiare scheda durante la generazione |
| «Troppi screenshot ravvicinati» | limite di Chrome (2 al secondo): attendi un attimo |

L'autorizzazione `activeTab` è temporanea: decade quando chiudi la scheda o navighi altrove (a volte anche
ricaricando la pagina). Se ricompare il messaggio, ripeti il clic sull'icona. Se la scorciatoia non funziona, assegnala in `chrome://extensions/shortcuts`
(`edge://extensions/shortcuts`). Lo screenshot viene ritagliato sull'area del circuito (esclusi barra superiore e
pannello codice); se il ritaglio non è affidabile (es. zoom con pinch) viene inviata l'intera scheda e il modello viene
istruito a concentrarsi sul circuito.

### Errori del backend o di OpenRouter

| Messaggio / codice | Causa probabile |
|---|---|
| «Impossibile contattare il backend…» | server non avviato, porta o URL diversi da quelli nel popup |
| `UPSTREAM_AUTH` | `OPENROUTER_API_KEY` errata o disattivata |
| `INSUFFICIENT_CREDITS` | credito OpenRouter esaurito |
| `RATE_LIMITED` / `LOCAL_RATE_LIMITED` | troppe richieste (OpenRouter o limite locale `RATE_LIMIT_PER_MIN`): riprova dopo i secondi indicati |
| `MODEL_NOT_AVAILABLE`, `NO_PROVIDER`, `MODEL_UNAVAILABLE` | slug del modello errato o modello/provider non disponibile (anche per input immagine) |
| `UPSTREAM_TIMEOUT` | il modello ha impiegato più di `OPENROUTER_TIMEOUT_MS` |
| `EMPTY_RESPONSE` | il modello ha esaurito i token: aumenta `OPENROUTER_MAX_TOKENS` |
| `ORIGIN_NOT_ALLOWED` | l'ID dell'estensione non è in `ALLOWED_EXTENSION_IDS` |
| `UNAUTHORIZED` | `ACCESS_TOKEN` del server diverso da quello inserito nel popup |

La console del server mostra il codice dell'errore. Il service worker dell'estensione si ispeziona da
`chrome://extensions` → «Ispeziona viste: service worker».

### Errori degli appunti

- «la pagina non era in primo piano»: il browser copia solo se la scheda ha il focus. Resta sulla scheda durante la
  generazione, poi usa **Copia codice**.
- Se anche **Copia codice** fallisce, il codice viene selezionato nell'anteprima: premi Ctrl/⌘+C.
- Il pulsante diventa verde solo se la copia è riuscita davvero.

## Come funziona l'integrazione con Tinkercad

Analisi svolta sulla vista pubblica del simulatore (`https://www.tinkercad.com/embed/<id>`), che usa la stessa
interfaccia dell'editor ma è accessibile senza login:

- **Editor**: contenitore `.js-editor--circuit`; area di lavoro `.editor.js-root_container` sotto la barra `.js-sitemenu`.
- **Circuito**: disegnato in **SVG** (nessun canvas, nessun iframe). I componenti hanno classi `cgfx__<tipo>`
  (es. `cgfx__arduino-uno-r3`, `cgfx__resistor`) e gruppi `id_<istanza>_<livello>`: l'estensione ne ricava un elenco
  indicativo dei tipi, inviato al modello come «indizio non verificato». **I collegamenti non sono ricavabili in modo
  affidabile dal DOM** e quindi non vengono inviati: il modello li deduce dallo screenshot.
- **Pannello codice**: `.js-editor__sidebar`, che si apre da destra **sopra** il circuito (per questo il ritaglio lo esclude);
  pulsante «Code» `.js-toggle_code_panel`; modalità (Blocks/Text) e dispositivo nella barra del pannello.
- **Editor di testo**: **CodeMirror 5**. Il testo si legge con `CodeMirror.getValue()`, accessibile solo dal contesto
  JavaScript della pagina: per questo `page-bridge.js` gira nel "MAIN world" e risponde a richieste tramite eventi.
  Le righe nel DOM sono virtualizzate, quindi leggere il DOM darebbe un codice incompleto.
- Si usano le classi `js-*`, che Tinkercad usa come hook JavaScript (non classi generate). L'interfaccia vive in uno
  Shadow DOM separato: nessun nodo di Tinkercad viene modificato, e tasti/click nel pannello non raggiungono le
  scorciatoie di Tinkercad (es. Canc non elimina il componente selezionato mentre scrivi).
- Un `MutationObserver` (solo `childList`, con throttling: la simulazione anima l'SVG in continuo) rileva l'editor e
  reinserisce il pulsante se viene rimosso, senza duplicati.

## Test automatici

```bash
cd tinkercad-ai-assistant
npm install            # solo strumenti di sviluppo (ESLint)
npm --prefix server install
npm run lint           # ESLint (vieta anche innerHTML nell'estensione)
npm test               # test dei moduli dell'estensione + test del backend
```

Test end-to-end (Chromium reale con l'estensione caricata, pagina pubblica reale di Tinkercad, backend locale e finto
OpenRouter):

```bash
npm i --no-save playwright && npx playwright install chromium
npm run e2e            # screenshot dei passaggi in e2e/output/
```

L'E2E verifica: iniezione singola e reinserimento del pulsante, posizione accanto al pannello codice, isolamento della
tastiera, errore di screenshot non autorizzato e ripiego, lettura del codice CodeMirror, inventario dei componenti,
stato verde con codice negli appunti, risposta senza codice (niente copia), backend spento, popup, e — con `<all_urls>`
come dopo l'opt-in — cattura reale ritagliata sull'area del circuito. Usa la vista `/embed/` pubblica perché l'editor
`/editel` richiede login.

## Limitazioni da verificare manualmente

- **Editor autenticato** (`/things/…/editel`): non verificato in automatico perché richiede login. I selettori derivano
  dalla vista pubblica, che usa la stessa interfaccia; se nell'editor completo il pulsante si sovrappone ad altri
  elementi (es. pannello dei componenti), trascinalo.
- **Screenshot con `activeTab`**: Playwright non può cliccare l'icona dell'estensione; il percorso con `activeTab` va
  provato a mano (il percorso con `<all_urls>` e il ritaglio sono verificati).
- **Scorciatoia Alt+Shift+A**: Chrome non la assegna se è già usata da un'altra estensione.
- **Modalità Blocchi**: in modalità Blocks il codice letto è quello generato dai blocchi; per incollare il risultato
  bisogna passare alla modalità Testo.
- **Qualità del codice**: dipende dal modello e dalla leggibilità dello screenshot; il codice non viene compilato né
  testato dall'estensione: verificalo con la simulazione di Tinkercad.
- **Cambiamenti futuri di Tinkercad**: le classi usate non sono un'API pubblica e potrebbero cambiare.

## Configurazione avanzata del backend

| Variabile | Default | Descrizione |
|---|---|---|
| `OPENROUTER_API_KEY` | — | **obbligatoria**, chiave OpenRouter |
| `OPENROUTER_MODEL` | — | **obbligatoria**, slug del modello |
| `HOST` | `127.0.0.1` | interfaccia di ascolto (altri valori espongono il server: usa `ACCESS_TOKEN`) |
| `PORT` | `3000` | porta |
| `OPENROUTER_TIMEOUT_MS` | `90000` | timeout della chiamata a OpenRouter |
| `OPENROUTER_MAX_TOKENS` | `8000` | token massimi generati |
| `OPENROUTER_TEMPERATURE` | (modello) | temperatura 0–2 |
| `MAX_BODY_MB` | `8` | dimensione massima della richiesta |
| `RATE_LIMIT_PER_MIN` | `10` | richieste al minuto verso `/api/generate` |
| `ALLOWED_EXTENSION_IDS` | (tutte) | ID delle estensioni autorizzate, separati da virgola |
| `ACCESS_TOKEN` | (nessuno) | token condiviso richiesto nell'header `X-Access-Token` |
| `APP_URL`, `APP_TITLE` | — | header facoltativi di attribuzione per OpenRouter |

Formato della richiesta a OpenRouter: `POST https://openrouter.ai/api/v1/chat/completions` con messaggio di sistema e
messaggio utente multimodale `[{type:"text"}, {type:"image_url", image_url:{url:"data:image/jpeg;base64,…"}}]`
(testo prima dell'immagine, come raccomandato dalla documentazione OpenRouter).

Un backend remoto deve usare **https**: impostalo nel popup, che chiederà il permesso solo per quell'origine.

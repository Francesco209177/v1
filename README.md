# Marea Profonda

Gioco per iPhone, offline, in italiano: di giorno ci si immerge con l'arpione nel **Calderone**, il vulcano sommerso dell'isola di Pietrasale; la sera si serve il pescato all'**osteria di Nonna Ines**. Nativo in Swift e SpriteKit, tutta la grafica è generata dal codice.

È un gioco originale del genere "immersioni di giorno, ristorante la sera": personaggi, ambientazione, storia e grafica sono propri.

> **Stato del lavoro.** Tutte e sette le milestone sono nel repository e passano la CI (test, compilazione, avvio di ogni scena nel simulatore). Nessuno però ha ancora giocato su un iPhone vero: leggi [Che cosa non è stato verificato](#milestone) e la lista [Cosa provare](#cosa-provare) prima di giudicarlo.

## Scaricare e installare l'IPA

1. Apri la scheda **Actions** del repository e scegli l'ultima esecuzione riuscita di **Build IPA**.
2. In fondo alla pagina, sotto *Artifacts*, scarica **MareaProfonda-ipa**: è uno zip che contiene `MareaProfonda.ipa`.
3. Estrai lo zip sull'iPhone (app File) o sul computer.
4. In **SideStore** (o AltStore) tocca **+** nella scheda *My Apps* e scegli `MareaProfonda.ipa`.

L'IPA non è firmata: è SideStore a firmarla con il tuo Apple ID. Con un account gratuito la firma dura 7 giorni e va rinnovata da SideStore; i salvataggi restano finché non disinstalli l'app.

Per pubblicare una versione scaricabile dalla pagina *Releases*, crea un tag che comincia per `v` (per esempio `v0.3.0`): il workflow allega l'IPA alla Release.

## Avviare la build

La build parte da sola a ogni push. Per lanciarla a mano: **Actions → Build IPA → Run workflow**.

Il workflow (`.github/workflows/build-ipa.yml`) fa tre cose:

| Job | Che cosa fa |
|---|---|
| Logica pura | `swift test` su Linux: mappa, pesci, arpione, osteria, salvataggi |
| IPA non firmata | genera il progetto con XcodeGen, compila con `CODE_SIGNING_ALLOWED=NO`, crea `Payload/MareaProfonda.app` e lo zippa in `MareaProfonda.ipa` |
| Prova di avvio | avvia l'app nel simulatore con `-smoke`: l'app percorre da sola le scene, e il job fallisce se va in crash o se uno shader non compila; le schermate finiscono nell'artifact **smoke** |

Usa il runner `macos-26` con Xcode 26.6 (il runner `macos-14` è stato ritirato a novembre 2026).

Per compilare sul tuo Mac: `brew install xcodegen && xcodegen generate`, poi apri `MareaProfonda.xcodeproj`. Il progetto Xcode non è nel repository: lo genera `project.yml`.

## Comandi

**A schermo.** Il joystick compare dove appoggi il pollice sinistro. A destra: arpione (tieni premuto per mirare, trascina per scegliere la direzione, rilascia per tirare; con un pesce agganciato tieni premuto per recuperare e molla durante gli strattoni), azione (raccogli, respira alla campana d'aria, sali a bordo), scatto, pausa.

**Controller** (MFi, DualSense, Xbox). Levetta sinistra per muoversi, levetta destra per mirare, grilletto destro per l'arpione, A/croce per l'azione, B/cerchio per lo scatto, Menu per la pausa. Nei menu la levetta sposta la selezione e A conferma.

## Come si gioca

Ogni giornata ha quattro fasi: **mattina** e **pomeriggio** (un'immersione ciascuna), **sera** (il servizio all'osteria), **notte**.

- **Fiato.** È la salute di Tecla, che scende in apnea. Cala più in fretta in profondità e a ogni colpo subito; si riprende in superficie e alle campane d'aria. A zero Tecla sviene e può tenere un solo oggetto del bottino.
- **Sacca.** Ha un limite di peso: oltre, si nuota sempre più lenti.
- **Stelle.** Un pesce preso con un colpo pulito vale due stelle, uno crivellato una sola. Più stelle, prezzo più alto del piatto.
- **Pesci.** Alcuni scappano se arrivi di corsa ma tollerano un avvicinamento lento; la cernia difende la tana, il barracuda attacca a vista, lo scorfano punge chi lo tocca. Chi sta per caricare si ferma un attimo e mostra un punto esclamativo.
- **Osteria.** Scegli il menu con ciò che hai in dispensa, poi in sala: prendi gli ordini, porta i piatti dal passavivande, spilla il vino fermandoti nella fascia verde, pulisci i tavoli. Servire in fila fa salire la serie e le mance. La fama fa salire di rango l'osteria: più tavoli, più piatti in menu, prezzi più alti.
- **Cantiere e Giornale di bordo.** Dal porto si apre il Giornale di bordo: missioni, Quaderno del Mare, ricette, il cantiere di Zaira (nove potenziamenti e cinque armi secondarie), conti, carta del Calderone, opzioni. Rete e dardi soporiferi danno pesce vivo, a tre stelle.
- **Storia.** Cinque capitoli. Al porto, in alto, c'è sempre l'obiettivo del momento; le scene si mandano avanti con un tocco e si saltano con «Salta».
- **Boss.** Quando la storia ne propone uno, al porto compare «Affronta il boss» (di mattina o di pomeriggio, al posto dell'immersione). Si combatte in una sala chiusa: il Fiato cala piano e le due campane d'aria si ricaricano da sole. Ogni attacco è annunciato da una linea rossa o da un punto esclamativo; la barra in alto diventa gialla quando il punto debole è scoperto. Se svieni non perdi nulla, tranne la mezza giornata.

- **Paese.** Dal porto si apre anche la schermata del paese:
  - *Personale* (da 40 di fama): cameriera, sguattero, aiuto cuoca, cantiniere. Lavorano da soli ogni sera e si pagano a fine servizio.
  - *Orto* e *Vivaio* (dal secondo capitolo): semini e raccogli dopo qualche giorno; in vasca metti due pesci vivi della stessa specie e ogni mattina ne trovi di nuovi. Gli ortaggi insegnano sei ricette in più.
  - *Nasse* (dal secondo capitolo): le cali in una zona e ogni mattina rendono uno o due pesci piccoli di quella zona.
  - *Collezione*: dodici maioliche dei Nerei da trovare sul fondo (due per zona, brillano) e dieci cartoline che arrivano con i traguardi.
  - *Bar*: bocce contro Don Pinuccio (levetta per mirare, tieni premuto per la forza), il cabinato «Acchiappasarde», e nei giorni di sfida la gara a ritmo contro Chef Lustri (arpione = coltello, azione = padella).
- **Eventi.** Ogni sette giorni la sagra del pesce azzurro (più clienti, sarde, sgombri e tonni pagati la metà in più); il quarto giorno della settimana la sera del critico, che chiede un piatto preciso; il sesto la sfida di Lustri. L'avviso compare al porto.
- **Ricette a livelli.** Nel Giornale, alla voce Ricette, «Affina» porta una ricetta fino al livello 5: ogni livello la fa pagare l'8 % in più.

### I sei boss

| Boss | Dove | Come si batte |
|---|---|---|
| La Murena Baronessa | relitto delle anfore, 28 m | esce dalle tane a mordere: schiva l'allungo e colpiscile la testa finché resta fuori |
| La Granseola Corazzata | Secca delle Gorgonie, 92 m | la corazza para tutto: falla schiantare contro la parete o colpiscila al ventre quando si impenna |
| Lo Spadaccino | Parete Blu, 176 m | in guardia para; dopo l'affondo si scopre, e se la spada si pianta nella roccia il danno raddoppia |
| Sua Eccellenza il Polpo | Città Sommersa, 300 m | si ripara dietro le anfore: colpiscigli la testa mentre attacca, e sta' fuori dall'inchiostro |
| La Lanterna | Fumarole, 452 m | al buio si vede solo l'esca: colpiscila per stordirla, o mirale in bocca dopo il morso |
| La Talpa d'Acciaio | Santuario dei Nerei, 562 m | scafo blindato: mira alla valvola che brilla (cambia posto a ogni fase); le mine feriscono anche lei |

## Struttura del codice

```
project.yml                     progetto Xcode (XcodeGen)
Package.swift                   compila e testa la sola logica pura, anche su Linux
MareaProfonda/
  App/         avvio, controller della vista, prova automatica
  Core/        scena di base, comandi, controller, partita e salvataggi
    Model/     vettori, RNG con seme, stato di gioco, impostazioni, paese (personale, orto, nasse, eventi, collezione)
  Diving/      scena di immersione, terreno, parallasse, pesci, HUD
    Model/     mappa, generatore, nuoto, pesci, arpione, boss, simulazione dell'immersione
  Restaurant/  scena del servizio
    Model/     ricette, menu, simulazione del servizio, cameriere automatico
  Hub/         porto di Pietrasale, giochi del bar
    Model/     bocce, cabinato, sfida a ritmo (logica)
  Story/       riproduttore delle scene
    Model/     missioni, capitoli e tappe della storia, formato delle scene
  UI/          comandi a schermo, menu in SwiftUI, riepiloghi
  Art/         fucina degli sprite, shader, testi a pixel
    Model/     immagini in memoria, lettura dei file .spr, pittori di terreno e fondali
  Data/        JSON: zone, pesci, ricette, bilanciamento, potenziamenti, missioni, storia, scene, boss, paese
  Resources/   sprite (.spr), icona, catalogo delle stringhe
Tools/forge/   strumento Python che disegna gli sprite e ne fa le anteprime
Tools/preview/ anteprime su PNG di terreno e fondali
Tools/ci/      script della prova di avvio
Tests/         test della logica
```

Le cartelle `Model/` importano solo Foundation: per questo si compilano e si provano ovunque, senza simulatore. Le scene disegnano lo stato calcolato lì.

## Audio generato dal codice

Non c'è un solo file audio. `Audio/Synth/Synth.swift` (codice puro, provato dai test) contiene oscillatori, inviluppi e un filtro; con questi rende venti effetti e sette brani scritti come dati in `Data/music.json`: una riga di note per battuta, per esempio `"E5 . G5 E5 . C5"`. `Audio/AudioDirector.swift` li suona con `AVAudioEngine`: i buffer sono resi una volta sola fuori dal thread audio, la musica cambia con il luogo (porto, immersione, abissi, notte, osteria, boss, scene) e sott'acqua un passa-basso ovatta tutto. I volumi di musica ed effetti sono nelle Opzioni; l'audio rispetta l'interruttore del silenzioso.

## Grafica generata dal codice

- **Sprite.** Sono matrici di caratteri con palette indicizzata, nei file `MareaProfonda/Resources/Sprites/*.spr`. Il gioco le legge all'avvio, le impacchetta in atlanti e le conserva in cache. Si disegnano con `Tools/forge` (forme, toni, contorni, animazioni parametriche) e si rigenerano con `python3 Tools/forge/build.py`, che scrive anche i fogli di anteprima in `Tools/forge/out/`.
- **Roccia e fondali.** Dipinti pixel per pixel a runtime dal campo di densità della mappa (`TerrainPainter`, `BackdropPainter`).
- **Luce e acqua.** Shader: colore dell'acqua per profondità, raggi di luce, caustiche, buio degli abissi con torcia.
- **Scala intera.** Ogni pixel d'arte occupa un numero intero di pixel fisici su qualunque iPhone; l'interfaccia è a risoluzione nativa.

L'unico file immagine del repository è l'icona dell'app, generata anch'essa (`python3 Tools/forge/icon.py`).

## Aggiungere pesci e ricette

I dati di gioco stanno in `MareaProfonda/Data/`. I nomi sono dentro i JSON, per lingua (`"name": { "it": "Sardina" }`), così per tradurre basta aggiungere una chiave.

**Un pesce** (`fish.json`):

```json
{ "id": "sardina", "name": { "it": "Sardina" }, "note": { "it": "Viaggia in banchi fitti." },
  "behavior": "school", "depthMin": 2, "depthMax": 70, "night": false, "spawnWeight": 10,
  "schoolMin": 7, "schoolMax": 12, "speed": 34, "fleeSpeed": 92, "hp": 5, "weight": 0.2,
  "radius": 4, "sight": 46, "damage": 0, "pull": 0.0, "rarity": 1, "price": 4 }
```

`behavior` può essere `passive`, `shy`, `school`, `territorial`, `aggressive`, `ambush`. Servono anche gli sprite `<id>_swim_0..3`, `<id>_hurt_0`, `<id>_dead_0`: aggiungi la specie in `Tools/forge/fish.py` e rigenera.

**Una ricetta** (`recipes.json`):

```json
{ "id": "orata_sale", "name": { "it": "Orata al sale" }, "note": { "it": "La crosta si rompe al tavolo." },
  "ingredients": [ { "item": "orata", "count": 1 } ], "portions": 2, "price": 44, "taste": 4,
  "cookTime": 5.5, "plate": "salt", "unlock": "catch:orata" }
```

`unlock` è `start` oppure `catch:<specie>`. I test controllano che ogni ingrediente esista e che ogni specie abbia almeno una ricetta.

**Una scena** (`cutscenes.json`) è un luogo, gli attori presenti e un elenco di passi:

```json
{ "id": "s_duello", "place": "porto_sera", "actors": [ { "who": "tecla", "x": -40 }, { "who": "bianca", "x": 32, "left": true } ],
  "steps": [ { "do": "say", "who": "bianca", "mood": "calm", "text": { "it": "Sulla Parete c'è un pesce spada..." } },
             { "do": "move", "who": "tecla", "x": 0, "time": 1.2 }, { "do": "shake", "time": 0.8 } ] }
```

I passi sono `say`, `move`, `wait`, `shake`, `show`, `hide`, `face`, `pose`, `title`, `flash`, `place`; gli umori dei ritratti `calm`, `happy`, `angry`, `shock`, `sad`. Una scena si mostra quando una tappa di `story.json` la indica come `intro` o `outro`. Le tappe hanno un obiettivo con le stesse parole delle missioni (`catch`, `serve`, `depth`, `fame`, `earn`, `upgrade`, `boss`).

### Tabella di bilanciamento (estratto)

| Rango dell'osteria | Fama | Tavoli | Piatti in menu | Un cliente ogni | Prezzi |
|---|---|---|---|---|---|
| Bettola | 0 | 3 | 2 | 7,5 s | ×1,00 |
| Trattoria | 40 | 4 | 3 | 6,8 s | ×1,05 |
| Osteria di paese | 110 | 5 | 3 | 6,2 s | ×1,10 |
| Osteria rinomata | 230 | 6 | 4 | 5,6 s | ×1,16 |
| Vanto dell'isola | 400 | 7 | 5 | 5,1 s | ×1,22 |
| Leggenda del Tirreno | 650 | 8 | 6 | 4,6 s | ×1,30 |

| Specie | Vita | Peso | Resistenza alla lenza | Valore |
|---|---|---|---|---|
| Sardina | 5 | 0,2 kg | 0 | 4 |
| Orata | 16 | 1,6 kg | 0,25 | 28 |
| Dentice | 28 | 3,5 kg | 0,45 | 60 |
| Cernia bruna | 46 | 8 kg | 0,6 | 90 |

L'arpione di partenza fa 10 danni; Fiato 120, sacca 10 kg, muta fino a 110 m. Tutti i valori sono in `balance.json`, `fish.json`, `upgrades.json`, `bosses.json`.

**Quanto dura.** Un test (`EconomyTests`) gioca la storia giorno per giorno: due immersioni stimate dal carico della sacca, un servizio vero affidato a un cameriere automatico, acquisti nell'ordine che la storia richiede. Con questo giocatore, che non sbaglia un colpo e non perde un boss, la storia si chiude in una ventina di giornate di gioco: sono circa cinque ore. Una persona ci metterà di più (pesci mancati, boss da ritentare, missioni, orto, bar), ma è probabile che resti sotto le 10–15 ore chieste: se dopo le prime prove sarà così, si allunga alzando i costi in `upgrades.json` e le soglie in `story.json`, senza toccare il codice.

## Scelte di progetto

- **Identità originale.** Ambientazione mediterranea, osteria al posto di un altro tipo di locale, cast e trama propri. Le meccaniche di genere (immersione, ristorante, potenziamenti) ci sono; nomi, personaggi, livelli e aspetto no.
- **Fiato al posto dell'ossigeno.** Tecla è un'apneista: riprende fiato in superficie e alle campane d'aria. Il limite di un'immersione è il carico della sacca e la distanza dalla superficie.
- **Macchine a stati.** Ogni pesce ha una `GKStateMachine` di GameplayKit; le regole di passaggio e i movimenti sono in codice puro (`FishAI`), così i test li verificano senza simulatore. I banchi sono un'unica entità con membri leggeri.
- **Menu in SwiftUI, HUD in SpriteKit.** I menu hanno testo che segue la dimensione scelta nelle impostazioni di iOS; l'HUD di gioco resta dentro la scena.
- **Nomi dei dati nei JSON.** Le stringhe dell'interfaccia usano il catalogo `Localizable.xcstrings`; i nomi di pesci e ricette stanno accanto ai numeri, nei JSON.
- **Solo italiano.** Il gioco è in italiano, come chiesto. Il catalogo contiene tutti i testi dell'interfaccia (lo riempie `python3 Tools/l10n/sync.py` leggendoli dal codice) ed è pronto per aggiungere una lingua da Xcode; i dialoghi e i nomi nei JSON hanno già la forma `{ "it": "…" }`. Nessuna traduzione è inclusa.
- **Contatori di prestazioni.** L'opzione «Mostra fotogrammi al secondo» accende i contatori di SpriteKit (fotogrammi, nodi, disegni): servono a controllare i 60 fps sul telefono, cosa che da qui non si può misurare.
- **Boss in codice puro.** Ogni boss è una piccola macchina a stati (attesa, avviso, attacco, recupero, stordito) con tre fasi a due terzi e a un terzo della vita. La logica sta in `BossSim.swift` e non importa SpriteKit: un giocatore automatico nei test batte tutti e sei i boss, così si sa che ogni scontro è vincibile prima ancora di provarlo sul telefono.
- **Sale dei boss.** Lo scontro avviene nella mappa del giorno, in una camera scavata alla profondità del boss e sigillata: colori dell'acqua, roccia e buio sono quelli della zona.
- **Nasse per zona.** Il prompt chiedeva trappole «posizionabili»: qui una nassa si cala in una zona scelta dalla schermata del paese, non in un punto della mappa, perché la mappa cambia a ogni immersione e un punto preciso il giorno dopo non esisterebbe più.
- **Personale senza gestione.** Chi assumi non va comandato: ognuno fa una cosa sola (ordinazioni, tavoli, cucina, vino) dopo qualche secondo d'attesa, così chi è svelto in sala resta più bravo di loro.
- **Sfida a ritmo.** Il tempo lo danno cassa e rullante a ogni battito, la linea che pulsa e un tocco leggero: non c'è un brano sotto, perché tenere la musica allineata al gioco al millisecondo richiederebbe prove su un dispositivo vero.
- **Storia a tappe.** Una tappa è un obiettivo con una scena prima e una dopo. Gli obiettivi «a livello» (fama, profondità, potenziamenti) contano anche ciò che è già stato fatto, così chi è più avanti non deve rifare nulla.

## Milestone

| | Contenuto | Stato |
|---|---|---|
| M1 | progetto, CI, fucina degli sprite, immersione, parallasse, luce, comandi e controller | fatta |
| M2 | dodici specie con comportamento proprio, arpione con tiro alla lenza, Fiato, sacca, raccolta | fatta |
| M3 | osteria, menu, servizio, vino, fama, giornata completa, tre slot di salvataggio | fatta |
| M4 | potenziamenti, Giornale di bordo, Quaderno del Mare, missioni, zone profonde giocabili, notte | fatta |
| M5 | trama in cinque capitoli, diciannove scene, sei boss, cast con ritratti | fatta |
| M6 | personale, orto e vivaio, nasse, eventi, collezione, tre giochi del bar, ricette a livelli | fatta |
| M7 | audio sintetizzato (venti effetti, sette brani, filtro sott'acqua), simulazione dell'economia, istruzioni al primo avvio, catalogo delle stringhe, contatori di prestazioni | fatta |

**Che cosa non è stato verificato.** Il gioco è sviluppato senza un Mac e senza un iPhone: la compilazione e l'avvio di ogni scena sono controllati in CI nel simulatore, la logica dai test. La resa su un telefono vero, la sensazione dei comandi, le prestazioni su modelli vecchi e la difficoltà non sono state provate da nessuno finché non installi l'IPA. In particolare la difficoltà dei boss è tarata su un giocatore automatico che non sbaglia mai un colpo: per una persona saranno più lunghi e più duri, e i numeri (`bosses.json`) vanno aggiustati dopo le prime prove. La musica e gli effetti sono controllati solo nei numeri (durata, volume, assenza di scatti): nessuno li ha mai ascoltati, e il simulatore della CI non ha un'uscita audio.

## Cosa provare

Sul telefono, in quest'ordine: sono le cose che da qui non si possono giudicare.

1. **Comandi in immersione.** Il joystick compare sotto il pollice? La mira dell'arpione (tieni premuto, trascina, rilascia) è naturale? Il tiro alla lenza si capisce?
2. **Fluidità.** Accendi i contatori nelle Opzioni e scendi in una zona affollata: i fotogrammi restano a 60?
3. **Prima giornata.** La scena d'apertura, tre pesci, il menu, il primo servizio: si capisce che cosa fare senza leggere questo file?
4. **Servizio.** Con quattro o cinque tavoli si riesce a stare dietro ai clienti? Il vino si versa bene?
5. **Boss.** La Murena Baronessa: gli avvisi si vedono in tempo? È troppo facile o troppo dura con l'arpione di partenza?
6. **Audio.** I brani sono gradevoli o stancano? Gli effetti sono troppo forti rispetto alla musica? Sott'acqua il suono si ovatta?
7. **Paese.** Assumi qualcuno, semina, cala una nassa, gioca a bocce: i pulsanti piccoli si toccano bene?
8. **Controller.** Con un pad collegato si naviga in tutti i menu? La rimappatura nelle Opzioni funziona?
9. **Salvataggi.** Chiudi l'app a metà giornata e riaprila: riparte dalla fase giusta?

## Test

```
swift test                                   # logica pura: 92 test
python3 Tools/forge/build.py                 # rigenera sprite e anteprime
python3 Tools/l10n/sync.py                   # aggiorna il catalogo delle stringhe
swift run -c release -Xswiftc -enable-testing preview terrain Tools/forge/out
```

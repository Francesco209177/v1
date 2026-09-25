# FRONTE VOSTOK — Operazione Tempesta d'Acciaio

Sparatutto **open world** in prima persona, in stile militare moderno, scritto in **HTML + CSS + JavaScript** (rendering 3D WebGL con Three.js, incluso nella cartella `lib/`, quindi funziona anche offline).

## Come avviarlo

- **Più semplice:** apri `game/index.html` con doppio clic in Chrome, Edge o Firefox.
- **Consigliato** (evita blocchi del browser su file locali):
  ```bash
  cd game
  python3 -m http.server 8000
  # poi apri http://localhost:8000
  ```
Clicca **GIOCA**: il mouse viene catturato. Premi **Esc** per la pausa.

## Comandi

| A piedi | | Combattimento | |
|---|---|---|---|
| `W A S D` | Movimento | `Clic sinistro` | Fuoco |
| `Mouse` | Visuale | `Clic destro` | Mira di precisione |
| `Shift` | Scatto (stamina) | `R` | Ricarica |
| `Spazio` | Salto | `1`–`4` / rotella | Cambia arma |
| `C` / `Ctrl` | Accovacciati, **scivolata** se stai scattando | `B` | Modalità di fuoco (auto/singolo) |
| `E` | Interagisci / sali in auto / rifornisci munizioni | `G` | Granata |
| `F` | Torcia | `V` | Coltello |
| `M` | Mappa tattica (clic = waypoint) | `Shift` nel cannocchiale | Trattieni il respiro |
| `Tab` | Statistiche e obiettivi | `Esc` | Pausa |

**Veicoli:** `W/S` accelera/frena e retromarcia · `A/D` sterza · `Spazio` freno a mano (derapata) · `Shift` turbo · `H` clacson · `L` fari · `C` visuale esterna/interna · mouse ruota la telecamera · `E` scendi.

## Contenuti

- **Mappa 1,2 × 1,2 km**: città in guerra con palazzi, rovine e barricate; base militare nemica con muro, torri di guardia, hangar ed eliporto; villaggio con chiesa; avamposto alleato; stazione di servizio; torre radio in cima alla collina più alta; fattorie, posti di blocco, laghetti, foreste, linee elettriche.
- **Terreno procedurale** con colline e montagne ai bordi, strade che si adattano al paesaggio, acqua in cui si può nuotare.
- **4 armi**: M4A1, MP5, Barrett M82 (cannocchiale con oscillazione) e M1911, più granate e coltello. Rinculo, dispersione dinamica (movimento, salto, accovacciamento, fuoco continuo), mira di precisione, ricarica tattica/a vuoto, otturatore manuale, bossoli espulsi, traccianti, fori di proiettile, colpi alla testa, calo del danno con la distanza.
- **5 veicoli guidabili** (Jeep, Berlina, Pickup, Camion, Sportiva): fisica arcade con marce, pendenze, salti, sospensioni, derapate, aderenza diversa su strada e fuori strada, collisioni, danni, fumo, esplosioni e respawn.
- **Nemici con IA**: pattuglia, allerta sui rumori, linea di vista, raffiche, cecchini, coperture accovacciate, investimenti, munizioni lasciate a terra.
- **Missioni** a catena con marker su bussola, minimappa e schermo.
- **Ciclo giorno/notte** (un giorno = 24 minuti) con cielo dinamico, stelle, nuvole, finestre illuminate e lampioni di notte.
- **HUD**: bussola con gradi, minimappa rotante, salute con rigenerazione, stamina, indicatori direzionali dei danni, hitmarker, killfeed, punteggio, tachimetro, orologio, FPS.
- **Audio sintetizzato** (WebAudio): spari con eco ritardata dalla distanza, passi diversi per superficie, motore con marce, derapate, esplosioni, sibilo dei proiettili, battito cardiaco, grilli e uccelli.

## Impostazioni

Sensibilità del mouse (e separata in mira e per la telecamera del veicolo), inverti asse Y, FOV, **gravità** (m/s², regolabile da Luna a oltre la Terra), difficoltà, qualità grafica, ombre, ciclo giorno/notte e ora del giorno, oscillazione della visuale, hitmarker, colore del mirino, FPS e volume. Le impostazioni vengono salvate nel browser.

## Struttura

```
game/
  index.html        interfaccia, HUD e menu
  style.css         stile di HUD e menu
  lib/three.min.js  motore 3D (Three.js r149, licenza MIT)
  js/core.js        matematica, rumore, impostazioni, input
  js/audio.js       suoni sintetizzati
  js/textures.js    texture procedurali
  js/world.js       terreno, strade, edifici, vegetazione, cielo, collisioni
  js/fx.js          particelle, traccianti, esplosioni
  js/player.js      movimento del giocatore
  js/weapons.js     armi e danni
  js/vehicles.js    veicoli
  js/enemies.js     IA dei nemici
  js/missions.js    obiettivi
  js/hud.js         interfaccia di gioco
  js/main.js        ciclo di gioco, menu, impostazioni
```

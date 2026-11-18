# Claude Code – Motion Graphics (Reel 9:16, 30 s)

Reel verticale che racconta come si crea una motion graphics con Claude Code, realizzato interamente via codice:
animazioni in **Remotion + React + TypeScript** (three.js per il 3D), colonna sonora **sintetizzata in Python**, mux e verifica con **FFmpeg**.

**Output:** `claude_motion_graphics.mp4` — 1080×1920, 30 fps, 900 frame (30,000 s), H.264 + AAC 48 kHz stereo, −14 LUFS.

## Storyboard

| Scena | Frame | Contenuto | Testo |
|---|---|---|---|
| 1 · Intro | 0–119 | particelle che convergono nel simbolo di Claude | *Come si crea una motion graphics con Claude Code?* |
| 2 · L'idea | 120–269 | interfaccia Claude Code, il prompt si trasforma in codice | *Tutto parte da un semplice prompt.* |
| 3 · La creazione | 270–479 | il codice prende vita: forme, testi, particelle, storyboard | *Claude scrive il codice, genera animazioni e costruisce ogni scena.* |
| 4 · Il risultato | 480–719 | drop: testi cinetici, transizioni, 3D, luce, animazioni complesse | *Dall'idea al video, tutto attraverso il codice.* |
| 5 · Outro | 720–899 | tutto converge nel simbolo, logo e schermata finale | *Claude Code. Il tuo studio di motion graphics, alimentato dall'AI.* |

Tutto è agganciato a una griglia a 120 BPM (1 beat = 15 frame): tagli di scena e cue musicali condividono `src/timeline.ts`.

## Struttura

```
src/
  timeline.ts        durata, griglia ritmica, cue, pose dello spark ai tagli (match-cut)
  theme.ts           palette (nero, arancione Claude, bianco, grigi) e font
  Main.tsx           timeline completa: sfondo continuo + 5 scene + transizioni + audio
  components/        ClaudeSpark, Caption, TerminalWindow/CodeBlock, Background, Grain, TransitionFX, FrameCanvas
  lib/               easing e PRNG deterministico, geometria del simbolo, codice mostrato a schermo
  scenes/            Scene1Intro … Scene5Outro (+ sottocartelle con i moduli di ogni scena; scene4/ = 5 shot)
  entries/           entry isolati per scena/shot (anteprime veloci)
audio/
  synth.py           genera public/music.wav (dsp.py, instruments.py, arrangement.py)
  analyze.py         loudness, allineamento ai cue, bilanciamento spettrale
scripts/
  render.mjs         render Remotion + mux audio con FFmpeg
  still.mjs          frame singoli e contact sheet (Main, Scene1–5, Shot1–5)
  sheets.mjs         contact sheet dal video finale
  verify.mjs         verifica tecnica del file finale
  check-cuts.mjs     continuità dei match-cut tra le scene
workflows/           script di orchestrazione multi-agente usati per costruire e rivedere il reel
```

## Comandi

```bash
npm install
python3 audio/synth.py                 # colonna sonora → public/music.wav
node scripts/render.mjs --concurrency 3 # video + audio → claude_motion_graphics.mp4
node scripts/verify.mjs                 # durata, risoluzione, fps, codec, audio
npx remotion studio src/index.ts        # anteprima interattiva
```

## Voce narrante ed effetti con ElevenLabs

`audio/elevenlabs_plan.json` contiene il copione italiano (9 frasi, identiche alle caption, con inizio e limite in secondi)
e 16 effetti sonori (prompt, durata, cue e allineamento: `onset`, `peak` o `end`). Dopo aver generato i file con ElevenLabs
in `public/elevenlabs/` con i nomi indicati nel piano:

```bash
python3 audio/synth.py --bed                     # base musicale senza gli effetti sintetizzati → public/music_bed.wav
python3 audio/mix_final.py --require-all         # voce + effetti + ducking + master -14 LUFS → public/music_final.wav
node scripts/render.mjs --mux-only --audio public/music_final.wav
node scripts/verify.mjs
```

Ogni frame è funzione pura del numero di frame (nessun `Math.random`, timer o stato), quindi il render è deterministico anche in parallelo.
Il simbolo di Claude usa il tracciato vettoriale di Simple Icons (dati CC0); il marchio appartiene ad Anthropic.

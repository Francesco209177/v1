export const meta = {
  name: 'build-claude-reel',
  description: 'Build the 5 Remotion scenes (7 scene/shot authors) and the procedural soundtrack in parallel; every author iterates on its own rendered stills',
  phases: [
    { title: 'Build', detail: '7 scene/shot authors + 1 composer, each self-verifying on rendered frames' },
  ],
}

const ROOT = '/home/user/v1/claude-motion-graphics'

const COMMON = `
You are a senior motion designer + creative developer in a professional motion studio. The team is building a 30-second vertical Instagram Reel (1080x1920, 30 fps, 900 frames, H.264) with Remotion 4 + React 18 + TypeScript. Topic: how motion graphics are made with Claude Code. The protagonist is Claude's orange spark symbol (the client calls it "la nuvola arancione di Claude"): it is the narrator and visual guide in every scene. ALL on-screen text is ITALIAN. The result must look like the work of a professional studio: fluid real animation everywhere (never a slideshow of static images), designed transitions, clear visual hierarchy, short readable text, everything synchronised to the music grid.

PROJECT ROOT: ${ROOT} (already scaffolded; the render pipeline is verified and works).

READ FIRST (all short files): src/timeline.ts, src/theme.ts, src/lib/math.ts, src/lib/frame.tsx, src/lib/spark.ts, src/lib/canvas.ts, src/lib/code.ts, every file in src/components/, src/Kit.tsx, src/Main.tsx, src/isolated.tsx, scripts/still.mjs. Then LOOK at the reference board image ${ROOT}/out/stills/Kit/f0010.png (Read tool) to see the established look: shared ClaudeSpark, TerminalWindow + CodeBlock, Caption typography, background, and a working three.js canvas.

FULL STORYBOARD (absolute frames; 120 BPM, 1 beat = 15 frames, every cut is on a beat):
- Scene 1 INTRO      abs 0-119    black, orange particles converge and form the Claude spark. Title: "Come si crea una motion graphics con Claude Code?"
- Scene 2 L'IDEA     abs 120-269  the spark animates, a stylised Claude Code interface appears, prompt and instructions morph into code. "Tutto parte da un semplice prompt."
- Scene 3 CREAZIONE  abs 270-479  the code comes alive: shapes, animated text, particles, transitions; the spark interacts with them. "Claude scrive il codice, genera animazioni e costruisce ogni scena."
- Scene 4 RISULTATO  abs 480-719  the musical DROP: rapid showreel of 5 examples (kinetic type, dynamic transitions, 3D objects, light effects, complex animation). "Dall'idea al video, tutto attraverso il codice."
- Scene 5 OUTRO      abs 720-899  everything converges back into the spark; Claude Code logo lockup; clean end card. "Claude Code. Il tuo studio di motion graphics, alimentato dall'AI."
Shared music/visual cue frames are in CUES (src/timeline.ts). The soundtrack places an audible event on every cue, so put your key visual hits EXACTLY on those absolute frames, and put secondary hits on beat multiples (absolute frame % 15 === 0) or half beats.

ART DIRECTION (strict):
- Palette ONLY from COLORS in src/theme.ts: near-black background, Claude orange family (orange, orangeBright, orangeHot, orangeDeep), warm white, grays. No other hues (no blue, green, purple, pure saturated red).
- Cinematic glow: additive light, soft blooms, particles, gradients. Use textGlow()/boxGlow() from theme, drawGlow() sprites on a FrameCanvas with ctx.globalCompositeOperation = 'lighter' for particle fields. Never use ctx.shadowBlur per particle (too slow).
- Typography: FONTS.display (Space Grotesk) for all headline/caption text, FONTS.mono (JetBrains Mono) for code, labels and UI. Narrative captions MUST use the shared Caption component (same style across the reel). Secondary labels: mono, uppercase, 22-28px, letter-spacing 0.14em, gray. Nothing a viewer must read may be smaller than 24px. Italian spelling and accents must be perfect.
- Motion language: strong ease-out entrances (outQuint/outExpo), ease-in exits, small overshoot (outBack) used sparingly, staggered timing (2-4 frames between siblings), anticipation before big moves, secondary motion and slow ambient drift so no frame is ever static, fast moves get a stretch/blur along the motion direction. Depth through parallax, scale and brightness.
- Composition: one clear focal point at a time; generous negative space; stroke weights 3-4px; rounded corners 24-30px.
- Instagram safe zones (SAFE in timeline.ts): keep everything that must be read inside x 80..1000 and y 230..1500. Captions sit around y = CAPTION_Y (1350). Glows and decorative particles may bleed outside.
- The global Background (nebula, dot grid, dust, vignette), the film Grain and a global light flash on every scene cut (TransitionFX in Main, at abs 120, 270, 480, 720) are already rendered by the parent composition. Your scene root is transparent on top of that background. Do not re-render Background/Grain yourself.

HARD TECHNICAL RULES:
- Remotion renders frames out of order in several browser tabs. EVERYTHING must be a pure function of the frame number: no Math.random(), no Date, no timers, no requestAnimationFrame, no CSS transitions/animations, no accumulated state between frames, no R3F useFrame() animation. For randomness use seeded()/hash() from src/lib/math.ts (or random(seed) from remotion). Particle systems must be closed-form: position = f(particleIndex, frame).
- useCurrentFrame() inside your component gives the frame relative to your scene/shot (0-based). For anything that must lock to the music use useAbsFrame() from src/lib/frame.tsx (absolute timeline frame); ClaudeSpark already pulses on the beat by itself.
- Canvas drawing only through the shared FrameCanvas component (synchronous redraw each frame).
- Performance (software rendering, no GPU): keep any single frame under about 1.5 s. At most ~2000 sprites per frame, at most 2-3 large CSS blur() layers on screen at once, no full-screen SVG filters (feTurbulence, feGaussianBlur on huge areas).
- Available packages ONLY (do not npm install anything): remotion, @remotion/paths, @remotion/noise, @remotion/shapes, @remotion/layout-utils, @remotion/three + three + @react-three/fiber (WebGL works via software SwiftShader). No external assets, no network, no images/videos/fonts from URLs.
- TypeScript strict. Code comments in Italian, short and useful. Clean, modular, readable code: this project is a deliverable.

FILE OWNERSHIP (teammates are editing other scenes in parallel right now):
- You may create/modify ONLY the files listed under "YOUR FILES" below (plus private helper files inside the folder named there). Never edit shared files (src/timeline.ts, src/theme.ts, src/lib/*, src/components/*, src/Root.tsx, src/Main.tsx, src/isolated.tsx, src/entries/*, scripts/*, package.json, config) and never edit other people's scene files. If you believe a shared file has a bug or is missing something, work around it inside your own files and report it in sharedFileRequests.
- Do not run git commands that change state (no commit, no checkout, no stash). Do not run scripts/render.mjs (the full render is done later by the lead).

SCENE BOUNDARY CONTRACT (match-cuts): at a scene boundary the last frame of one scene and the first frame of the next must show the Claude spark in EXACTLY the pose given in SPARK_POSE (ClaudeSpark x/y/size from the pose, rotation 0, scale 1, opacity 1, default beat) so the cut is invisible on the protagonist. Everything else that belongs only to your scene must have fully animated out by your last frame, unless your brief says a specific element is carried across the cut. Entrances start from the boundary state on your first frame.

VERIFY LOOP (mandatory, this is how quality is achieved; you cannot play video, so judge motion from frame sequences):
  cd ${ROOT}
  node scripts/still.mjs <CompId> <frames> --scale 0.5 --sheet            (contact sheet at out/stills/<CompId>/sheet.png, frames as f0000.png)
  node scripts/still.mjs <CompId> 0-<last>:6 --scale 0.5 --sheet --cols 8   (overview of the whole piece)
  node scripts/still.mjs <CompId> 70-82:1 --scale 0.5 --sheet --out out/stills/<CompId>-seq   (consecutive frames to check a hit / handoff has no pop or jump)
  node scripts/still.mjs <CompId> 75 --scale 1 --out out/stills/<CompId>-full   (full-res frame to judge typography and detail)
  Frame spec syntax: "0,30,60" or "0-120:10" (start-end:step), comma-combinable. In your isolated composition frame 0 = your first frame. Use your own --out folders (prefix them with your CompId).
  Then use the Read tool on the PNGs and critique them like an art director: composition, legibility, glow quality, clutter, palette discipline, safe zones, text overflow/clipping, spelling, boundary poses, continuity between consecutive frames, whether each cue lands on its frame. Fix and re-render. Do at least THREE full look-and-fix iterations; keep going until you would be proud to put it in a studio showreel. Also check that no frame is accidentally empty or broken and that the first and last frames satisfy the boundary contract.
  Type-check your files: npx tsc --noEmit -p . 2>&1 | grep -i <your file name fragment>   (ignore errors in files you do not own). If the bundle fails because of a file you do not own, a teammate is mid-edit: continue with something else and retry a bit later.

WHEN DONE return the structured result: what you built, the list of files, a precise timeline of key moments (frames), an honest self-assessment, known issues, and any shared-file requests.
`

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'What was built, concretely' },
    files: { type: 'array', items: { type: 'string' } },
    timeline: { type: 'string', description: 'Key moments with frame numbers (local and absolute)' },
    selfAssessment: { type: 'string', description: 'Honest critique of the final frames you looked at' },
    knownIssues: { type: 'array', items: { type: 'string' } },
    sharedFileRequests: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files', 'timeline', 'selfAssessment', 'knownIssues', 'sharedFileRequests'],
}

const ITEMS = [
  {
    key: 'scene1-intro',
    prompt: `
YOUR ASSIGNMENT: SCENE 1 - INTRO (composition id "Scene1", local frames 0..119 = absolute 0..119, 4 seconds).
YOUR FILES: src/scenes/Scene1Intro.tsx (replace the placeholder; must keep exporting const Scene1Intro: React.FC), optional helpers in src/scenes/scene1/.

STORY: black screen. Small orange particles begin to appear and converge to the centre, forming Claude's spark symbol. Title question appears.

DIRECTION AND TIMING:
- 0 to ~20: TRUE black. The global Background already has ambient light, so add your own full-screen #050505 cover layer at the bottom of your scene: opacity 1 until about frame 8, easing to 0 by about frame 60, so the reel opens from real black and the room lights up as energy gathers. The very first particles appear from frame 2-3 (a handful), then the population grows quickly.
- 8 to 75: CONVERGENCE. 1100-1600 particles on a FrameCanvas (drawGlow sprites, additive). Each particle is a pure function of the frame: a start position spread over the whole frame (some beyond the edges), an individual appear time, then a curved/spiral trajectory (swirl around the centre plus a little noise wobble) to its own target point = sampleSparkPoints(n, seed) mapped onto SPARK_POSE.introEnd (px = pose.x + p.x * pose.size, py = pose.y + p.y * pose.size). Motion profile: slow weightless drift, then an accelerating pull, then a soft settle. Stagger arrivals so the symbol assembles from the hub outward (use point.r) and is COMPLETE exactly at frame 75 (CUES.sparkFormed, a musical impact). Add size variation, depth (z affects parallax, speed, brightness), twinkle, and short trails (draw 2-3 analytically computed earlier positions with lower alpha).
- 66 to 80: HANDOFF from the particle cloud to the solid ClaudeSpark: as particles lock onto the shape they tighten and fade while ClaudeSpark fades/reveals in (use its opacity and reveal props). On frame 75 exactly: impact - bright bloom at the spark, one or two thin expanding shockwave rings that fade by about frame 95, a burst of ~80 fast embers flying outward and fading, and a short camera punch on the whole scene (scale 1.045 easing back to 1).
- 75 to 119: the spark is alive (ClaudeSpark has a built-in beat pulse). Add a few orbiting motes and optionally very subtle slow rotating light rays behind it. All these extras fade out by frame 116.
- TITLE (hero caption), exact text "Come si crea una motion graphics con Claude Code?": use the shared Caption with text 'Come si crea una\\nmotion graphics\\ncon Claude Code?', highlight ['Claude', 'Code?'], y about 1230, size about 92, weight 700, inAt about 26, stagger about 4, outAt about 106 so it is fully gone by frame 118. Reading time matters: all words must be in by about frame 66. Check that no line overflows the 900px max width and nothing collides with the spark (bottom edge at y 880).
- BOUNDARY END (frame 119): ONLY ClaudeSpark at SPARK_POSE.introEnd (x 540, y 700, size 360, rotation 0, scale 1, glow 1, opacity 1). No caption, no particles, no rings, no cover layer. Scene 2 starts with the identical spark.
Verify specifically: frame 0 is black; the particle shape just before the handoff really reads as the Claude spark; consecutive frames 64..84 have no pop; frame 119 matches the boundary.
`,
  },
  {
    key: 'scene2-idea',
    prompt: `
YOUR ASSIGNMENT: SCENE 2 - L'IDEA (composition id "Scene2", local frames 0..149 = absolute 120..269, 5 seconds).
YOUR FILES: src/scenes/Scene2Idea.tsx (replace the placeholder; must keep exporting const Scene2Idea: React.FC), optional helpers in src/scenes/scene2/.

STORY: the spark comes alive and a stylised Claude Code interface appears. We see a prompt and instructions being typed and then progressively TRANSFORMING into code. Caption: "Tutto parte da un semplice prompt."

DIRECTION AND TIMING (local frames; absolute = local + 120):
- Local 0: ClaudeSpark exactly at SPARK_POSE.introEnd (540, 700, size 360). Local 0-26: the spark comes alive: a small anticipation (scale dip to ~0.94), then it travels up to SPARK_POSE.ideaEnd (540, 350, size 180) on a slightly arced path with one full 360-degree spin (the symbol is not rotationally symmetric, so it must land at exactly rotation 0), overshoot and settle, with a glow surge. From then on it is the narrator: it pulses/flares whenever something happens below.
- Local 6-26: a line of light is drawn beneath the spark and unfolds into the shared TerminalWindow at WINDOW_RECT (for example a clip/scaleY reveal from a thin bright line plus opacity; a subtle 3D tilt is allowed if it settles perfectly flat). Inside, before any code: a prompt area with an orange mono ">" and the user's text being typed with an orange block cursor.
- Local 15-75 (absolute 135-195 = CUES.typingStart..typingEnd; the soundtrack plays typing ticks there): the prompt PROMPT_TEXT from src/lib/code.ts ('Crea un reel di 30 secondi sulla motion graphics') is typed character by character with a human, slightly irregular but deterministic rhythm. Then two or three short instruction lines appear beneath it so the brief gets richer (for example '• formato verticale 9:16', '• particelle, forme, testi animati', '• musica elettronica'), typed quickly or popping in as chips, all done by about local 84. Use mono text of at least 26px; check that nothing overflows the window (inner width about 870px; JetBrains Mono advances 0.6em per character).
- Local 90 (absolute 210 = CUES.promptToCode, a musical hit = the Enter key): SUBMIT. Flash on the prompt, the spark above pulses hard and sends a stream of light particles down into the window. Optionally a status line such as '● Claude sta scrivendo il codice…' with animated dots.
- Local 90-134: the prompt and instruction characters TRANSFORM progressively into code. Characters scramble through random glyphs (deterministic, from a mono charset such as {}<>/=;()[]$#*+01) and reflow to become CODE_LINES, line by line from top to bottom, each line resolving left to right behind a bright leading edge; syntax colours (TOKEN_COLORS) fade in as each token resolves. Line numbers appear as lines resolve. This morph is the heart of the scene: make it legible as "words becoming code", not as a hard swap.
- FINAL HOLD local 138-149, the boundary state carried into Scene 3: EXACTLY <TerminalWindow><CodeBlock /></TerminalWindow> with default props at WINDOW_RECT plus ClaudeSpark at SPARK_POSE.ideaEnd (rotation 0, scale 1, glow 1). Nothing else: no caption, no cursor, no status line, no extra glow on the window. Scene 3 starts from this identical picture, so the safest implementation is to literally render those shared components for local >= 138 and make your animated version converge onto them before that (same metrics from CODE_METRICS / placeTokens so nothing shifts by even a pixel). Compare your last frame with the Kit reference board (same window and code, no caption and no 3D object).
- Caption: shared Caption, text 'Tutto parte da un\\nsemplice prompt.', highlight ['prompt.'], inAt about 22, outAt about 130 (fully gone by 140), default y (CAPTION_Y).
- Keep the interface elegant and minimal: this is a stylised Claude Code terminal, not a busy IDE.
Verify specifically: local 0 matches the Scene 1 boundary (only the big spark); the typing is readable; consecutive frames 88..100 and 130..140 have no pops; local 149 is exactly the boundary state.
`,
  },
  {
    key: 'scene3-creation',
    prompt: `
YOUR ASSIGNMENT: SCENE 3 - LA CREAZIONE (composition id "Scene3", local frames 0..209 = absolute 270..479, 7 seconds).
YOUR FILES: src/scenes/Scene3Creation.tsx (replace the placeholder; must keep exporting const Scene3Creation: React.FC), helpers in src/scenes/scene3/ (split the scene into several component files: it is big).

STORY: the code comes alive. Graphic elements, geometric shapes, animated text, particles and transitions appear. The Claude spark interacts visually with the elements. Caption in three beats: "Claude scrive il codice, genera animazioni e costruisce ogni scena."

DIRECTION AND TIMING (local frames; absolute = local + 270; the music has a big impact at absolute 270, a full groove until 420, then a riser/build from absolute 420 = local 150 to the DROP at absolute 480 = the cut to Scene 4):
- Local 0 must be IDENTICAL to Scene 2's last frame: ClaudeSpark at SPARK_POSE.ideaEnd plus <TerminalWindow><CodeBlock /></TerminalWindow> with default props at WINDOW_RECT. Start from exactly that picture.
- PHASE A, "il codice prende vita" (local 0-70): code lines light up one after another (a scanning highlight on the beat), and tokens DETACH from the code and fly out on arcs, turning into what they describe. Use placeTokens() from src/lib/code.ts for exact token positions inside the window, hide the originals through CodeBlock's hideTokens prop, and draw your own flying copies. '<Particelle colore="#D97757" />' bursts into particles; '<Forma tipo="cerchio" ... />' becomes a circle (stroke draws, then fills) joined by a triangle, a square and a hexagon outline; '<Testo animato>Ciao!</Testo>' becomes big animated text; '<Transizione tipo="glow" />' becomes a glow sweep. Meanwhile the window recedes (shrinks, tilts back, sinks or dissolves into light) so the stage is free by about local 70.
- PHASE B, "genera animazioni" (local 70-140): the stage (centre of the frame, roughly y 420..1150) fills with living motion design: shapes morphing, rotating, bouncing with overshoot; animated type; particle trails; paths and graph lines drawing themselves; everything choreographed on the beat (new elements pop on absolute frames that are multiples of 15, secondary motion on the off-beats). The spark is the CONDUCTOR: it leaves the top and flies between elements on arcs with a short trailing glow, and every element it touches ignites (flash, ripple, gray outline filling with orange).
- PHASE C, "costruisce ogni scena" (local 140-195, on the musical build): the elements organise into SCENES: for example five small 9:16 scene cards / storyboard frames (numbered 01-05, mono labels) assemble in a row or a fan, each containing one of the living elements, with a timeline strip and a playhead running beneath. Energy rises with the riser: faster motion, growing glow, tighter rhythm.
- Local 195-209: everything is pulled into the spark (implosion with motion streaks). The spark arrives at SPARK_POSE.creationEnd (540, 800, size 260) and charges up.
- BOUNDARY END (local 209): ONLY ClaudeSpark at SPARK_POSE.creationEnd with rotation 0, scale 1, opacity 1 and glow exactly 1.6 (Scene 4 starts from glow 1.6 and releases it on the drop). Nothing else on screen.
- Caption: one shared Caption with text 'Claude scrive il codice,\\ngenera animazioni\\ne costruisce ogni scena.', highlight ['codice,', 'animazioni', 'scena.'], and the wordAt prop so each line arrives with its phase (line 1 from about local 8, line 2 from about local 74, line 3 from about local 144), outAt about 190 (gone by 200). Three lines: choose size about 66-70 and verify no line overflows 900px. Keep the stage content clear of the caption zone (y 1230..1470).
- Do not let the scene become clutter: at every moment there is ONE focal point; older elements dim, shrink or drift back to make room. The spark must always be clearly visible and readable as the protagonist.
Verify specifically: local 0 equals the Kit reference board minus caption and 3D object; the token-to-element transformations read clearly in consecutive frames; each phase has a distinct look; local 209 is exactly the boundary.
`,
  },
  {
    key: 'scene4-shell-shots12',
    prompt: `
YOUR ASSIGNMENT: SCENE 4 - IL RISULTATO: the scene SHELL plus SHOT 1 and SHOT 2 (composition ids "Scene4", "Shot1", "Shot2"; Scene 4 = local 0..239 = absolute 480..719, 8 seconds).
YOUR FILES: src/scenes/Scene4Result.tsx, src/scenes/scene4/Shot1Kinetic.tsx, src/scenes/scene4/Shot2Transitions.tsx, plus private helpers named src/scenes/scene4/shell-*.tsx or shot1-*/shot2-* files. Keep the exported names (Scene4Result, Shot1Kinetic, Shot2Transitions). Do NOT edit src/scenes/scene4/stage.ts, Shot3ThreeD.tsx, Shot4Light.tsx, Shot5Complex.tsx: two teammates are building shots 3, 4 and 5 in those files right now (they are placeholders until they finish; your shell must simply mount them).

STORY: the musical DROP. A rapid showreel of five examples of motion graphics made with code, cut on the beat (SHOTS in src/scenes/scene4/stage.ts: local starts 0, 45, 90, 135, 180; lengths 45, 45, 45, 45, 60): kinetic text, dynamic transitions, 3D objects, light effects, complex animations. Caption: "Dall'idea al video, tutto attraverso il codice."

SHELL DUTIES (Scene4Result.tsx):
1. SPARK. Local 0: ClaudeSpark exactly at SPARK_POSE.creationEnd (540, 800, size 260) with glow 1.6 (that is how Scene 3 ends). On the drop it releases: shockwave ring and embers from its position, and it snaps to the narrator position SPARK_POSE.resultEnd (540, 330, size 120) by about local 10 (fast: outQuint or a small outBack), glow easing to 1. It stays there for the whole scene and reacts on every shot change (local 45, 90, 135, 180): a quick pulse, a rotation kick that returns to exactly 0, a small glow burst, maybe a thin light beam towards the stage. At local 239: exactly SPARK_POSE.resultEnd, rotation 0, scale 1, glow 1.
2. Mount the five shots with <Sequence from={start} durationInFrames={len} layout="none"> (the placeholder shell already does this; each shot component draws in absolute 1080x1920 coordinates centred on STAGE and reads its own local frame with useCurrentFrame()).
3. HUD. For each shot an index and label such as '01 — TESTI CINETICI' (labels from SHOTS; JetBrains Mono 500, about 26px, letter-spacing 0.16em, gray with an orange index), changing with a quick masked slide on every cut, plus a five-segment story-style progress bar whose current segment fills in orange over the shot's duration. Place the HUD where it does not fight the stage, the spark or the caption (for example label just above the stage around y 418 and the progress bar just below the stage around y 1212). Minimal and elegant.
4. CUT ACCENTS. On each shot change add a 4-6 frame accent over the stage (for example a horizontal light-streak whip plus a tiny scale punch) so the cuts feel designed.
5. CAPTION. Shared Caption, text 'Dall\\'idea al video,\\ntutto attraverso il codice.', highlight ['codice.'], with wordAt so line 1 arrives from about local 10 and line 2 from about local 96; outAt about 222 (gone by 232); default y (CAPTION_Y).
6. END. By local 232-239 the HUD and progress bar have animated out; only the spark remains at resultEnd (Shot 5 handles its own exit).

SHOT 1 "TESTI CINETICI" (Shot1Kinetic.tsx, 45 frames, absolute 480..524, the first shot of the drop: maximum punch): kinetic typography filling the stage. A tight sequence of short bold uppercase Italian words slamming in on a rhythm of about 7-8 frames (for example 'IDEE' / 'IN' / 'MOVIMENTO', or a similar strong phrase), Space Grotesk 700, sizes 150-300px, tight tracking. Use several real kinetic-type techniques: scale-from-huge with directional blur, vertical mask reveals, letter-by-letter stagger, outlined (WebkitTextStroke) versus filled duplicates with offset, tracking expansion, a word that stretches on scaleX and snaps back, a marquee band of repeated outlined text scrolling behind. Orange, white, gray only.

SHOT 2 "TRANSIZIONI DINAMICHE" (Shot2Transitions.tsx, 45 frames, absolute 525..569): a rapid chain of four or five different transition styles between simple bold panels (solid orange, warm white, dark gray; each panel carries a big number or a simple shape): for example a diagonal wipe with trailing stripes, a circular iris from the centre, staggered slice/blinds, a push/whip with motion blur, a zoom-through. Clip the panels inside a rounded-rect "screen" (about 900x700, centred on the STAGE centre) so the spark above and the caption below stay readable.

EVERY SHOT: intro of at most 4 frames; the last 3-4 frames are a designed exit (the Sequence unmounts the shot after its last frame); main content inside the stage band y 430..1190 (soft glow may spill slightly, but nothing bright above y 400 or below y 1230).
Verify specifically: Scene4 local 0 matches the Scene 3 boundary (spark at 540,800 size 260, glow 1.6); the whole-scene overview with placeholders for shots 3-5 still looks organised; HUD/caption legibility over busy shots; local 239 is exactly the boundary. Render Shot1 and Shot2 frame by frame (0-44:1) at least once to check the rhythm.
`,
  },
  {
    key: 'scene4-shots34',
    prompt: `
YOUR ASSIGNMENT: SCENE 4, SHOT 3 "OGGETTI 3D" and SHOT 4 "EFFETTI LUMINOSI" (composition ids "Shot3" and "Shot4", 45 frames each; Shot 3 = absolute 570..614, Shot 4 = absolute 615..659).
YOUR FILES: src/scenes/scene4/Shot3ThreeD.tsx and src/scenes/scene4/Shot4Light.tsx (replace the placeholders; keep the exported names Shot3ThreeD and Shot4Light, React.FC without props), plus private helpers named src/scenes/scene4/shot3-* and shot4-*. Do NOT edit stage.ts, Scene4Result.tsx or the other shot files (teammates own them).

CONTEXT: Scene 4 is the musical DROP: a rapid showreel of five examples of motion graphics made with code, cut on the beat. A teammate builds the shell (spark as a small narrator at (540, 330) size 120 at the top, a mono label and progress HUD, the caption at y about 1350) and mounts your components inside a Sequence, so useCurrentFrame() in your component is the frame relative to your shot (0..44). You draw in absolute 1080x1920 coordinates centred on STAGE (src/scenes/scene4/stage.ts: centre 540, 810; band y 430..1190, full width). Your isolated compositions Shot3 / Shot4 show only the background and your shot.

SHOT 3 "OGGETTI 3D": real 3D with @remotion/three (ThreeCanvas; src/Kit.tsx has a minimal working example; WebGL runs on software SwiftShader here, so keep geometry moderate, dpr 1, canvas no larger than 1080x760, no post-processing passes, no shadow maps). Design a hero object with satellites: for example a glossy orange torus-knot or a faceted icosahedron cluster rotating at the centre, with white/gray secondary primitives (spheres, cubes, rings, a thin wireframe shell) orbiting around it; a strong key light plus an orange rim light on a dark environment; a camera dolly or orbit; objects scale in with overshoot on the first frames; a subtle perspective grid floor or wireframe accents fading into darkness for a tech feel. Fake the bloom cheaply (a radial CSS glow behind the canvas, emissive materials, additive sprites over the highlights) rather than rendering the canvas twice. Everything must be deterministic from useCurrentFrame(): never animate with R3F useFrame(); compute rotations/positions from the frame and pass them as props. Make sure the canvas background is transparent so the global background shows through. Musical beats inside this shot: local 0 (entrance hit) and local 15, 30 (give each a visible accent: a spin kick, a scale pulse, a light sweep).
SHOT 4 "EFFETTI LUMINOSI": light effects in 2D canvas/CSS, for example light-painting ribbons (several glowing Lissajous/spiral trails drawn with additive sprites, head brighter than tail), anamorphic lens-flare streaks, volumetric god rays from a point (rotating conic gradient with a radial mask), neon rings pulsing on the beat, soft bokeh discs. Build to a climax flash on local 30 and exit. Pure light on black: this shot should feel like the most luminous moment of the reel while staying inside the orange/white palette.
BOTH SHOTS: intro of at most 4 frames; the last 3-4 frames are a designed exit (the Sequence unmounts you after your last frame); main content inside y 430..1190 (soft glow may spill slightly, but nothing bright above y 400 or below y 1230, the spark and the caption live there); keep render time per frame reasonable (measure it: the still script prints as it goes).
Verify specifically: render each shot frame by frame (0-44:1 with --sheet --cols 9) to check rhythm and smoothness; view a couple of full-res frames to judge the 3D shading and the glow quality; make sure nothing is clipped by a hard rectangular canvas edge (fade or mask the edges of the 3D canvas if needed).
`,
  },
  {
    key: 'scene4-shot5',
    prompt: `
YOUR ASSIGNMENT: SCENE 4, SHOT 5 "ANIMAZIONI COMPLESSE" (composition id "Shot5", 60 frames = absolute 660..719, the last four beats of the drop and the climax of the showreel).
YOUR FILES: src/scenes/scene4/Shot5Complex.tsx (replace the placeholder; keep the exported name Shot5Complex, React.FC without props), plus private helpers named src/scenes/scene4/shot5-*. Do NOT edit stage.ts, Scene4Result.tsx or the other shot files (teammates own them).

CONTEXT: Scene 4 is the musical DROP: a rapid showreel of five examples of motion graphics made with code (kinetic text, dynamic transitions, 3D objects, light effects, and yours: complex animations), cut on the beat. A teammate builds the shell (the spark as a small narrator at (540, 330) size 120 at the top, a mono label and progress HUD, the caption at y about 1350) and mounts your component inside a Sequence, so useCurrentFrame() in your component is the frame relative to your shot (0..59). You draw in absolute 1080x1920 coordinates centred on STAGE (src/scenes/scene4/stage.ts: centre 540, 810; band y 430..1190, full width). Your isolated composition Shot5 shows only the background and your shot.

DIRECTION: show complexity under perfect control: a layered, choreographed PROCEDURAL system. Pick ONE strong concept with two or three layers and execute it flawlessly rather than many weak ideas. Directions you may take (choose or combine wisely): a particle morph where a few thousand additive sprites form a shape and re-form into the next (ring -> hexagonal lattice -> wave surface in pseudo-3D -> the Claude spark silhouette via sampleSparkPoints), with curl-like flowing transitions; a mandala/grid of dozens of elements (dots, arcs, squares, lines) driven by a travelling wave with rotation offsets; counter-rotating orbital rings with satellites and connective plexus lines; pseudo-3D rotation of the whole point cloud for depth. There are beats at local 0, 15, 30, 45: make a visible change of state on each beat (new morph target, a pulse, a rotation kick), with continuous flowing motion in between. Depth, parallax, glow, and a clear silhouette at every moment. Palette strictly orange family / white / gray.
EXIT: in the last 8-10 frames (local ~50-59) the system bursts OUTWARD past the stage edges in all directions (fast, motion-streaked, fading) so that nothing is left by local 59. (Scene 5 then pulls everything back in from the edges towards the spark, so an outward scatter here sets up that reconvergence. Do not collapse into the spark yourself.)
RULES: intro of at most 4 frames (the shot should erupt on its first beat); main content inside y 430..1190 while the system is formed (soft glow may spill slightly, but nothing bright above y 400 or below y 1230 except during the final outward burst, where fast-fading particles may cross those zones); closed-form particle positions (pure function of index and frame); at most about 2500 sprites per frame; keep render time per frame reasonable.
Verify specifically: render the shot frame by frame (0-59:1 with --sheet --cols 10) to check that the morphs flow without pops; view full-res frames at each formed state to judge glow and silhouette quality; check the last frame is essentially empty.
`,
  },
  {
    key: 'scene5-outro',
    prompt: `
YOUR ASSIGNMENT: SCENE 5 - OUTRO (composition id "Scene5", local frames 0..179 = absolute 720..899, 6 seconds). This is the final image people remember: it must be immaculate.
YOUR FILES: src/scenes/Scene5Outro.tsx (replace the placeholder; must keep exporting const Scene5Outro: React.FC), optional helpers in src/scenes/scene5/.

STORY: all the elements converge again into Claude's orange spark. The stylised Claude Code logo appears on a clean end card. Final text: "Claude Code. Il tuo studio di motion graphics, alimentato dall'AI."

DIRECTION AND TIMING (local frames; absolute = local + 720; music: impact at absolute 720, a reverse swell building to the FINAL HIT at absolute 780 = local 60 = CUES.lockup, then a calm tail fading out from absolute 870 = local 150):
- Local 0: ONLY ClaudeSpark at SPARK_POSE.resultEnd (540, 330, size 120), glow 1 (that is how Scene 4 ends; its last shot has just scattered outward past the frame edges).
- Local 0-60: CONVERGENCE. Echoes of everything seen in the reel stream in from beyond all four edges towards the spark: real code tokens from CODE_LINES (mono, syntax coloured), geometric outlines (circle, triangle, square, hexagon), a few kinetic-type fragments, light streaks, and hundreds of particles. Trajectories are spirals/arcs with acceleration, so they whip into the spark; each element shrinks and brightens as it is absorbed and leaves a short motion streak; each absorption gives the spark a micro pulse. Meanwhile the spark travels to SPARK_POSE.lockup (540, 690, size 300) and grows as it absorbs (ease in-out, arriving by about local 54), optionally with a spin that lands at exactly rotation 0, glow charging up with the swell.
- Local 60 (absolute 780, the final musical hit): the implosion completes: a flash, one thin shockwave ring, a short burst of embers, then calm. The LOGO LOCKUP resolves:
   * ClaudeSpark at SPARK_POSE.lockup.
   * The wordmark 'Claude Code' (Space Grotesk 700, about 124px, warm white, letter-spacing about -0.03em) centred at about y 990, revealed with a masked rise or a letter stagger over local ~62-80, immediately followed by a small orange block cursor (a nod to the terminal) sitting on the baseline right after the wordmark and blinking on the beat (driven by the absolute frame, period 15 or 30 frames). Spark + wordmark + cursor together are the stylised Claude Code logo. Keep the wordmark+cursor group optically centred.
   * A thin horizontal divider (orange fading to transparent at both ends, about 240px wide) at about y 1085, drawing out from the centre over local ~78-92.
   * The tagline, the rest of the required final text: 'Il tuo studio di motion graphics,\\nalimentato dall\\'AI.' in the shared Caption: y about 1215, size about 56, weight 500, scrim false, highlight ["dall'AI."], inAt about 84, stagger 3, outAt 9999 (it never exits). Verify the two lines fit comfortably inside x 80..1000.
- Local 100-179: a clean hold with subtle life: slow ambient particles rising, the spark's beat pulse, ONE elegant light sweep across the wordmark (about local 100-125), the cursor blinking. From local 150 (the music fades) gently reduce the spark's beat amplitude (beat prop towards 0.3) but keep the frame fully lit: NO fade to black. The final frame (local 179) is the clean, perfectly composed end card.
- All lockup content inside the safe zone (y 230..1500, x 80..1000), with generous breathing room; the three text levels (wordmark, divider, tagline) must have a clear hierarchy. Check the Italian carefully: "Il tuo studio di motion graphics, alimentato dall'AI." (straight or typographic apostrophe is fine, but be consistent).
Verify specifically: local 0 matches the Scene 4 boundary (only the small spark at the top); the convergence reads as "everything returns to Claude"; consecutive frames 54..70 have no pop; view the end card at full resolution (several frames between 110 and 179) and polish spacing, alignment and glow until it is flawless.
`,
  },
  {
    key: 'soundtrack',
    prompt: `
YOUR ASSIGNMENT: THE SOUNDTRACK. Compose and render, entirely procedurally in Python (numpy + scipy are installed; nothing else, no samples, no network), a 30-second modern technological ELECTRONIC background track with integrated sound design, locked to the video's cue sheet.
YOUR FILES: ${ROOT}/audio/synth.py (and helper modules inside ${ROOT}/audio/ if you want to split: e.g. audio/dsp.py, audio/instruments.py, audio/arrangement.py), output ${ROOT}/public/music.wav (it currently holds 30 s of silence as a placeholder: overwrite it). Running "python3 audio/synth.py" from the project root must regenerate the file deterministically (fixed random seeds). Read src/timeline.ts for the cue sheet (you only need that file and this brief; you do not need the rest of the code).

FORMAT: WAV PCM 16-bit (or 24-bit), 48000 Hz, stereo, EXACTLY 30.000 s = 1,440,000 samples per channel. Loudness about -14 LUFS integrated (Instagram's normalisation target), true peak <= -1.0 dBTP, no clipping, no DC offset, no clicks (every voice has short fade in/out; the file starts from digital silence and ends in digital silence).

MUSIC: 120 BPM, 4/4, one beat = 0.5 s, one bar = 2 s (15 bars). Choose a minor key (for example F minor or A minor) with a simple emotive progression, proper voice leading, and a memorable arpeggio/lead motif. Genre: clean, premium tech-product electronic (melodic techno / future-garage / synthwave-tinted), confident and uplifting rather than dark or aggressive. Instruments to synthesise: punchy kick (pitch-swept sine + click), sub bass with sidechain pumping from the kick, closed/open hats and shakers (filtered noise), clap/snare (noise burst + body), a plucked arp (saw/square through an enveloped low-pass, with ping-pong delay), warm detuned-saw pad with slow filter motion, a supersaw-ish lead for the drop, plus FX: risers (filtered noise sweep + rising tone), downlifters, impacts (sub boom + noise burst + long reverb), reverse swells, shimmer/sparkle textures. Give it space with a synthesised reverb (convolution with an exponentially decaying filtered-noise impulse via scipy.signal.fftconvolve) and tempo-synced delays. Stereo width on pads/arps/FX; kick, sub and bass in mono centre. Master bus: gentle saturation, low cut at about 25-30 Hz, a soft limiter. Humanise velocities slightly; keep it musical.

ARRANGEMENT AND CUE SHEET (time in seconds = frame / 30; these events MUST be audible exactly on these times, the picture hits on them):
- 0.00-2.50  Intro from silence: a dark evolving pad/drone fading in, sparse high sparkle/tinkles that get denser (particles converging on screen), a subtle rising tension into 2.5 s.
- 2.50  IMPACT 1 (the Claude symbol forms): soft but clear boom + shimmer bloom with a long tail, establishes the tonic chord.
- 2.50-4.00  the chord rings, a gentle riser/whoosh leads into 4.0.
- 4.00  Scene 2 starts: soft whoosh; a light groove begins (filtered kick or heartbeat pulse, simple bass note, arp motif introduced quietly).
- 4.50-6.50  TYPING: soft, dry, slightly randomised keyboard-like ticks (short filtered clicks at irregular 32nd/16th-note positions, varied velocity and pan, quiet in the mix but present).
- 7.00  IMPACT 2 ("Enter": the prompt turns into code): a distinct confirm sound (short tonal blip going up + small sub hit), then for 7.0-9.0 a bubbling fast arpeggio / data-stream texture rising in pitch and brightness (code being written), ending in a short fill into 9.0.
- 9.00  Scene 3 starts: IMPACT 3 + crash; the FULL groove enters: four-on-the-floor kick, off-beat hats, clap on beats 2 and 4, sidechained bass line, the arp fully open, pad chords.
- 9.00-14.00  groove continues and develops (add elements every 2 bars: shaker, counter melody).
- 14.00-16.00  BUILD: snare roll accelerating (8ths -> 16ths -> 32nds), noise riser and rising pitch, low-end filtered out progressively, a short silence/suck-back in the last ~1/8 note before the drop.
- 16.00  THE DROP (Scene 4): the biggest moment: big impact, the lead motif enters, the strongest bass and widest mix. The picture cuts five rapid shots at 16.00, 17.50, 19.00, 20.50 and 22.00 (a 3+3+3+3+4 beat phrasing): put a clear accent on each of those times (extra kick/crash/sub hit, lead phrase restart or a stab) so every cut is felt, while the 4/4 groove continues underneath.
- 23.50-24.00  a short fill / reverse cymbal into 24.0.
- 24.00  Scene 5 starts: IMPACT 4, then a BREAKDOWN: drums drop out, pad + arp only, and a REVERSE SWELL (reverse reverb/cymbal + rising filtered pad) growing from 24.0 to 26.0 (everything on screen is being sucked into the Claude symbol).
- 26.00  FINAL HIT (the Claude Code logo appears): the most satisfying resolved impact of the piece: sub boom, bright shimmer chord on the tonic, a signature three- or four-note motif as the audio logo, long lush tail.
- 26.00-29.00  calm, warm tail: pad + sparse arp echoes of the motif, slowly dying away.
- 29.00-30.00  fade to complete digital silence (last samples exactly 0).
Dynamics: intro quiet, scene 2 medium-low, scene 3 medium-high, build rising, drop loudest, outro resolving. Keep the low end tight and the mix clean; it is BACKGROUND music for text-driven video: no element should be harsh or fatiguing (tame 2-5 kHz on the lead and the hats).

VERIFY LOOP (mandatory; you cannot listen, so measure and look):
  cd ${ROOT} && python3 audio/synth.py
  ffprobe -v error -show_entries stream=sample_rate,channels,duration,duration_ts,bits_per_sample -of default=nw=1 public/music.wav
  ffmpeg -hide_banner -nostats -i public/music.wav -af ebur128=peak=true -f null - 2>&1 | tail -15          (integrated loudness, loudness range, true peak)
  ffmpeg -hide_banner -loglevel error -y -i public/music.wav -lavfi "showspectrumpic=s=1800x700:legend=1:scale=log" out/audio/spectrum.png   then Read the PNG
  ffmpeg -hide_banner -loglevel error -y -i public/music.wav -lavfi "showwavespic=s=1800x400:split_channels=1" out/audio/wave.png            then Read the PNG
  (create out/audio first). Also write a small analysis in Python (inside audio/analyze.py) that prints: sample count, peak, RMS per second, short-term energy onsets and their distance in milliseconds from each cue time (2.5, 4.0, 7.0, 9.0, 16.0, 17.5, 19.0, 20.5, 22.0, 24.0, 26.0), spectral balance per section (energy share below 120 Hz, 120-2000 Hz, 2-8 kHz, above 8 kHz), stereo correlation, DC offset, and whether the first and last 10 ms are silent. Every cue must have a transient within +-10 ms. Check the spectrogram for the intended structure (sparse intro, groove from 9 s, riser to 16 s, densest block 16-24 s, breakdown, final hit at 26 s, fade), for harsh resonances and for unintended full-band clicks. Iterate at least THREE times on arrangement and mix: check the musical content too (print the note names/chords you actually generate per bar and sanity-check that melody notes belong to the scale and chords). Do not stop at the first version that merely works.
Do not edit any file outside audio/ and public/music.wav. No git state changes.

WHEN DONE return the structured result (summary: key, chords, instruments, mix chain; timeline: the cue alignment table with measured offsets and the final LUFS / true peak; selfAssessment; knownIssues; sharedFileRequests normally empty).
`,
    audio: true,
  },
]

const KEYS = Array.isArray(args) && args.length ? args : ITEMS.map((i) => i.key)
const SELECTED = ITEMS.filter((i) => KEYS.includes(i.key))
const RESUME_NOTE = {
  'scene1-intro': '\nNOTE: a teammate already started this scene and was interrupted. src/scenes/Scene1Intro.tsx and src/scenes/scene1/* contain their work in progress. Render it first, review it critically, keep what is good and finish/polish it to the standard of this brief rather than restarting from scratch.\n',
}
phase('Build')
log('Launching ' + SELECTED.length + ' authors: ' + SELECTED.map((i) => i.key).join(', '))
const results = await parallel(
  SELECTED.map((item) => () =>
    agent((item.audio ? '' : COMMON) + '\n' + item.prompt + (RESUME_NOTE[item.key] || ''), {
      label: 'build:' + item.key,
      phase: 'Build',
      schema: RESULT_SCHEMA,
    }).then((r) => ({ key: item.key, ...r }))
  )
)
const done = results.filter(Boolean)
log(done.length + '/' + SELECTED.length + ' authors returned')
const missing = SELECTED.filter((it) => !done.find((d) => d.key === it.key)).map((it) => it.key)
if (missing.length) log('MISSING (agent failed or skipped): ' + missing.join(', '))
return { done, missing }

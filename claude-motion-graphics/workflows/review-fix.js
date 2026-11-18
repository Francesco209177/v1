export const meta = {
  name: 'review-fix-claude-reel',
  description: 'Fresh-eyes art-director review of the rendered reel per scene, then a fixer applies the verified notes',
  phases: [
    { title: 'Review', detail: 'independent reviewer per scene, judging the FINAL rendered video frames' },
    { title: 'Fix', detail: 'fixer per scene applies the review notes and re-verifies' },
  ],
}

const ROOT = '/home/user/v1/claude-motion-graphics'
const ctx = args || {}
const SELECT = Array.isArray(ctx.keys) && ctx.keys.length ? ctx.keys : null
const AUTHOR_NOTES = ctx.authorNotes || {}

const COMMON = `
CONTEXT: a 30-second vertical Instagram Reel (1080x1920, 30 fps, 900 frames, H.264 + AAC) built with Remotion 4 + React + TypeScript in ${ROOT}. Topic (Italian on-screen text): how motion graphics are made with Claude Code. Protagonist: Claude's orange spark symbol, narrator in every scene. Storyboard (absolute frames, 120 BPM, 1 beat = 15 frames):
- Scene 1 INTRO 0-119: black, orange particles converge into the Claude spark. "Come si crea una motion graphics con Claude Code?"
- Scene 2 L'IDEA 120-269: stylised Claude Code interface, a prompt is typed and morphs into code. "Tutto parte da un semplice prompt."
- Scene 3 CREAZIONE 270-479: code comes alive: shapes, animated text, particles, transitions; the spark conducts. "Claude scrive il codice, genera animazioni e costruisce ogni scena."
- Scene 4 RISULTATO 480-719: musical drop, 5 rapid shots (kinetic type, transitions, 3D, light, complex animation) cut at 480/525/570/615/660. "Dall'idea al video, tutto attraverso il codice."
- Scene 5 OUTRO 720-899: everything converges into the spark, Claude Code logo lockup, end card. "Claude Code. Il tuo studio di motion graphics, alimentato dall'AI."
Read src/timeline.ts (CUES, SPARK_POSE, SAFE zones) and src/theme.ts first. The full first render is ${ROOT}/claude_motion_graphics.mp4 and the soundtrack is public/music.wav.

TOOLS:
- Contact sheet from the FINAL video (fast, absolute frame numbers burnt in):  cd ${ROOT} && node scripts/sheets.mjs --from 100 --to 140 --step 2 --cols 7 --width 300 --out out/review/<you>/x.png   then Read the PNG.
- Full-res single frame from the final video: ffmpeg -hide_banner -loglevel error -y -i claude_motion_graphics.mp4 -vf "select=eq(n\\,FRAME)" -fps_mode vfr -frames:v 1 out/review/<you>/fFRAME.png
- Isolated renders of the CURRENT source (reflects edits immediately, no full re-render needed): node scripts/still.mjs <Scene1..Scene5|Shot1..Shot5> <frames> --scale 0.5 --sheet --out out/review/<you>/... (frames relative to the scene/shot). Main composition (absolute frames, all scenes + transitions) also works: node scripts/still.mjs Main 470-490:1 --scale 0.5 --sheet --out out/review/<you>/main-cut
- Match-cut check: node scripts/check-cuts.mjs
- Always use your own out/review/<you>/ folder. 4 CPUs are shared with other agents: keep renders targeted (use --scale 0.5, sensible frame steps).
`

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', description: 'One paragraph: overall quality vs a professional studio reel' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          frames: { type: 'string', description: 'absolute frame(s) where visible' },
          problem: { type: 'string' },
          fix: { type: 'string', description: 'concrete fix: which file, what to change' },
        },
        required: ['severity', 'frames', 'problem', 'fix'],
      },
    },
  },
  required: ['verdict', 'issues'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    notFixed: { type: 'array', items: { type: 'string' }, description: 'issues skipped or rejected, with reason' },
    files: { type: 'array', items: { type: 'string' } },
    selfCheck: { type: 'string', description: 'what you rendered and looked at to verify, and the result' },
  },
  required: ['fixed', 'notFixed', 'files', 'selfCheck'],
}

const SCENES = [
  {
    key: 'scene1', comp: 'Scene1', range: '0-119', files: 'src/scenes/Scene1Intro.tsx, src/scenes/scene1/*',
    focus: 'opening from true black, particle convergence reading as the Claude spark, the impact on frame 75, title readability and timing, clean handoff into scene 2 at the 119/120 cut.',
  },
  {
    key: 'scene2', comp: 'Scene2', range: '120-269', files: 'src/scenes/Scene2Idea.tsx, src/scenes/scene2/*',
    focus: 'the 119/120 match-cut, the spark move to the top, the Claude Code window reveal, prompt typing legibility (frames 135-195), the Enter hit at 210, the words-to-code morph, and the 269/270 boundary (must equal the plain window + code + spark).',
  },
  {
    key: 'scene3', comp: 'Scene3', range: '270-479', files: 'src/scenes/Scene3Creation.tsx, src/scenes/scene3/*',
    focus: 'the 269/270 match-cut, tokens detaching and becoming elements, clutter vs one focal point, the spark as conductor, the storyboard/scene-cards phase, the build to the drop, and the 479/480 boundary.',
  },
  {
    key: 'scene4', comp: 'Scene4', range: '480-719', files: 'src/scenes/Scene4Result.tsx, src/scenes/scene4/* (shell + all five shots)',
    focus: 'the drop at 480, each shot (480 kinetic type, 525 transitions, 570 3D, 615 light, 660 complex) for quality and readability, cut accents, HUD/caption legibility over busy shots, nothing bright leaking into the spark zone or caption zone, the 719/720 boundary.',
  },
  {
    key: 'scene5', comp: 'Scene5', range: '720-899', files: 'src/scenes/Scene5Outro.tsx, src/scenes/scene5/*',
    focus: 'the 719/720 match-cut, the convergence reading as "everything returns to Claude", the final hit at 780, the logo lockup (spark + "Claude Code" wordmark + cursor), tagline hierarchy and spelling, the end card being immaculate and lit until the last frame.',
  },
]

const reviewPrompt = (s) => `${COMMON}
YOU ARE: an exacting senior art director reviewing ${s.key.toUpperCase()} (absolute frames ${s.range}) of this reel with FRESH EYES. You did not build it. Your job is to find what keeps it from looking like a professional studio piece, and to say concretely how to fix it. Do NOT edit any file.
FOCUS: ${s.focus}
ALSO CHECK: palette discipline (orange family / white / grays only), typography (Space Grotesk headlines via the shared Caption, JetBrains Mono for code/labels, nothing readable under 24px, perfect Italian spelling and accents), Instagram safe zones (readable content inside x 80..1000, y 230..1500), text overflow or clipping, visual clutter, hard edges / banding / aliasing / broken frames, any static stretch with no motion, motion continuity between consecutive frames (pops, jumps, flicker), whether key hits land on the cue frames in src/timeline.ts, and the spark always reading as the protagonist.
METHOD: overview sheet of your whole range from the final video at step 4-6, then consecutive-frame sheets (step 1) around every cut, cue and transition, then 3-5 full-res frames at the key moments. Look carefully at each image. Report only real, visible problems (with frame numbers) and concrete fixes, ranked by severity. Do not pad the list; a short list of real issues is worth more than a long list of nitpicks. If the author left known issues, verify them: ${'${AUTHOR}'}
FILES THAT IMPLEMENT THIS SCENE (read them to make your fix suggestions concrete): ${s.files}`

const fixPrompt = (s, review) => `${COMMON}
YOU ARE: the senior motion designer responsible for polishing ${s.key.toUpperCase()} (absolute frames ${s.range}, composition id ${s.comp}). An independent art director reviewed the FIRST FULL RENDER and wrote the notes below. Apply them.
YOUR FILES (edit only these): ${s.files}. Never edit shared files (src/timeline.ts, src/theme.ts, src/lib/*, src/components/*, src/Root.tsx, src/Main.tsx, src/isolated.tsx, src/entries/*, scripts/*) or other scenes' files; other fixers are editing those right now. No git state changes. Do not run scripts/render.mjs.
RULES (unchanged from the build): everything is a pure function of the frame (no Math.random, no Date, no timers, no CSS animations, no R3F useFrame); deterministic randomness via seeded()/hash(); keep the scene boundary poses from SPARK_POSE exact on your first and last frames; palette from COLORS only; nothing readable under 24px; keep per-frame render time reasonable.
REVIEW VERDICT: ${review.verdict}
REVIEW NOTES (JSON): ${JSON.stringify(review.issues, null, 1)}
METHOD: fix every blocker and major; fix minors when cheap and safe. If a note is wrong (you verify on rendered frames that it is not a problem) or would break something else, skip it and say why. After editing, verify with isolated renders of the current source (node scripts/still.mjs ${s.comp} ... and Main for cuts at the boundaries), looking at consecutive frames around each change and full-res frames at the key moments. Type-check: npx tsc --noEmit -p . 2>&1 | grep -i <fragment of your files>. Iterate until the notes are resolved and nothing regressed.`

const all = SCENES.filter((s) => !SELECT || SELECT.includes(s.key))
phase('Review')
log('Reviewing + fixing: ' + all.map((s) => s.key).join(', '))
const out = await pipeline(
  all,
  (s) => agent(reviewPrompt(s).replace('${AUTHOR}', AUTHOR_NOTES[s.key] || 'none reported'), { label: 'review:' + s.key, phase: 'Review', schema: REVIEW_SCHEMA }),
  (review, s) => {
    if (!review) return null
    const real = (review.issues || []).filter((i) => i.severity !== 'minor' || (review.issues || []).length <= 8)
    if (!real.length) return { key: s.key, review, fix: { fixed: [], notFixed: [], files: [], selfCheck: 'no issues to fix' } }
    return agent(fixPrompt(s, { ...review, issues: real }), { label: 'fix:' + s.key, phase: 'Fix', schema: FIX_SCHEMA }).then((fix) => ({ key: s.key, review, fix }))
  }
)
return out.filter(Boolean)

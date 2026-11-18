import {drawGlow} from '../../lib/canvas';
import {CODE_LINES, TOKEN_COLORS, TokenType} from '../../lib/code';
import {clamp, hit, lerp, seeded, TAU} from '../../lib/math';
import {COLORS, FONTS} from '../../theme';
import {mix} from './color';
import {T} from './motion';
import {Flight, flightAt, FlightState, makeFlight} from './vortex';

/**
 * ECHI — tutto ciò che si è visto nel reel torna a Claude: frammenti del codice reale
 * (CODE_LINES, con i colori della sintassi), forme geometriche a filo e parole cinetiche.
 * Disegnati su canvas con motion blur a campioni sub-frame, scia e alone; composite 'lighter'.
 */
type Segment = {text: string; color: string};
type ShapeKind = 'circle' | 'triangle' | 'square' | 'hexagon';

type EchoBase = {flight: Flight; tilt: number; spin: number; scale: number; color: string};
type TokenEcho = EchoBase & {kind: 'token'; segments: Segment[]; chars: number};
type ShapeEcho = EchoBase & {kind: 'shape'; shape: ShapeKind; radius: number};
type WordEcho = EchoBase & {kind: 'word'; text: string; outline: boolean};
export type Echo = TokenEcho | ShapeEcho | WordEcho;

// ───────────────────────────── contenuti ─────────────────────────────

/** Tipo di sintassi di ogni token reale del codice del reel (testo senza spazi → tipo). */
const TOKEN_TYPES: Map<string, TokenType> = (() => {
	const map = new Map<string, TokenType>();
	for (const line of CODE_LINES) for (const [type, text] of line) if (text.trim() && !map.has(text.trim())) map.set(text.trim(), type);
	return map;
})();

const segment = (text: string): Segment => ({text, color: TOKEN_COLORS[TOKEN_TYPES.get(text.trim()) ?? 'punct']});

/** Frammenti presi dal codice che Claude ha scritto nelle scene 2–3. */
const FRAGMENTS: string[][] = [
	['export const ', 'Reel'],
	['<', 'Scena', '>'],
	['useCurrentFrame', '()'],
	['<', 'Particelle', ' />'],
	['colore', '=', '"#D97757"'],
	['const ', 'frame'],
	['<', 'Forma', ' />'],
	['tipo', '=', '"cerchio"'],
	['spring', '()'],
	['<', 'Testo', '>'],
	['fps', '={', '30', '}'],
	['Ciao!'],
	['<', 'Transizione', ' />'],
	['tipo', '=', '"glow"'],
	['const ', 'scala'],
	['durata', '={', '30', '}'],
	['return', ' ('],
	['</', 'Scena', '>'],
];

const SHAPES: ShapeKind[] = ['circle', 'triangle', 'square', 'hexagon', 'triangle', 'circle', 'hexagon', 'square'];
/** Parole cinetiche: il percorso del reel, dall'idea al video. */
const WORDS = ['IDEA', 'PROMPT', 'CODICE', 'MOTION', 'VIDEO'];
const SHAPE_COLORS = [COLORS.orange, COLORS.orangeBright, COLORS.white, COLORS.orange];

const TOKEN_PX = 40;
const WORD_PX = 92;
const TOKEN_FONT = `500 ${TOKEN_PX}px ${FONTS.mono}`;
const WORD_FONT = `700 ${WORD_PX}px ${FONTS.display}`;

/** Posti riservati (nell'ordine di arrivo) a forme e parole; il resto sono token. */
const SHAPE_SLOTS = new Set([1, 5, 8, 12, 16, 20, 24, 28]);
const WORD_SLOTS = new Set([3, 10, 15, 22, 27]);
const FIRST_ABSORB = 15;

export const buildEchoes = (seed = 77): Echo[] => {
	const rnd = seeded(seed);
	const total = FRAGMENTS.length + SHAPES.length + WORDS.length;
	const out: Echo[] = [];
	let ti = 0;
	let si = 0;
	let wi = 0;
	for (let i = 0; i < total; i++) {
		// accelerando: gli assorbimenti si infittiscono verso il colpo finale
		const s = i / (total - 1);
		const t1 = FIRST_ABSORB + (T.lastAbsorb - FIRST_ABSORB) * (1 - Math.pow(1 - s, 1.6));
		const dur = 20 + rnd() * 9;
		const t0 = Math.max(rnd() * 1.5, t1 - dur);
		// ingressi distribuiti sul perimetro con il rapporto aureo: mai due vicini di seguito
		const flight = makeFlight(0.07 + i * 0.6180339, 120, t0, t1, 1.3 + rnd() * 1.1);
		const base = {flight, tilt: (rnd() - 0.5) * 0.44, spin: (rnd() - 0.5) * 0.16, scale: 1 + rnd() * 0.4};
		if (WORD_SLOTS.has(i) && wi < WORDS.length) {
			const outline = wi % 2 === 1;
			out.push({...base, kind: 'word', text: WORDS[wi++], outline, color: outline ? COLORS.orangeBright : COLORS.white});
		} else if (SHAPE_SLOTS.has(i) && si < SHAPES.length) {
			out.push({...base, kind: 'shape', shape: SHAPES[si], radius: 46 + rnd() * 26, color: SHAPE_COLORS[si++ % SHAPE_COLORS.length]});
		} else {
			const segments = FRAGMENTS[ti++ % FRAGMENTS.length].map(segment);
			const chars = segments.reduce((n, sg) => n + sg.text.length, 0);
			// i frammenti lunghi non superano ~440 px di larghezza
			const scale = Math.min(base.scale, 440 / (chars * TOKEN_PX * 0.6));
			out.push({...base, scale, kind: 'token', segments, chars, color: COLORS.orange});
		}
	}
	return out;
};

/** Micro-impulsi dello spark: uno per ogni elemento assorbito (somma di decadimenti brevi). */
export const absorbPulse = (echoes: Echo[], f: number): number => {
	let sum = 0;
	for (const e of echoes) sum += hit(f, e.flight.t1, 3.2);
	return Math.min(1.6, sum);
};

// ───────────────────────────── disegno ─────────────────────────────

const SHUTTER = 0.6; // frazione di frame "esposta" dietro la testa: la coda cresce con la velocità
const GHOSTS = 9; // campioni sub-frame della coda (motion blur direzionale)
const TRAIL_FRAMES = 4.5;
const TRAIL_STEPS = 7;

/** Scala lungo il volo: grande entrando (vicino alla camera), minuscolo quando viene assorbito. */
const sizeAt = (e: Echo, u: number): number => e.scale * lerp(1, 0.14, Math.pow(u, 2.2));

const polygon = (ctx: CanvasRenderingContext2D, sides: number, r: number): void => {
	ctx.beginPath();
	for (let i = 0; i < sides; i++) {
		const a = -Math.PI / 2 + (i * TAU) / sides;
		const x = Math.cos(a) * r;
		const y = Math.sin(a) * r;
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.closePath();
};

/** Disegna il contenuto dell'eco centrato nell'origine (trasformazione già applicata). `warm` 0..1 = quanto è incandescente. */
const paint = (ctx: CanvasRenderingContext2D, e: Echo, warm: number, a: number, scale: number): void => {
	if (e.kind === 'token') {
		ctx.font = TOKEN_FONT;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		const cw = TOKEN_PX * 0.6;
		let x = (-e.chars * cw) / 2;
		for (const sg of e.segments) {
			ctx.fillStyle = mix(sg.color, COLORS.orangeHot, warm, a);
			ctx.fillText(sg.text, x, 0);
			x += sg.text.length * cw;
		}
		return;
	}
	if (e.kind === 'word') {
		ctx.font = WORD_FONT;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		if (e.outline) {
			ctx.lineJoin = 'round';
			ctx.lineWidth = Math.min(8, 3 / scale);
			ctx.strokeStyle = mix(e.color, COLORS.orangeHot, warm, a);
			ctx.strokeText(e.text, 0, 0);
		} else {
			ctx.fillStyle = mix(e.color, COLORS.orangeHot, warm, a);
			ctx.fillText(e.text, 0, 0);
		}
		return;
	}
	ctx.lineJoin = 'round';
	ctx.lineWidth = Math.min(9, 3.5 / scale); // spessore costante a schermo
	ctx.strokeStyle = mix(e.color, COLORS.orangeHot, warm, a);
	if (e.shape === 'circle') {
		ctx.beginPath();
		ctx.arc(0, 0, e.radius, 0, TAU);
	} else {
		polygon(ctx, e.shape === 'triangle' ? 3 : e.shape === 'square' ? 4 : 6, e.radius * (e.shape === 'triangle' ? 1.12 : 1));
	}
	ctx.stroke();
};

export const drawEchoes = (ctx: CanvasRenderingContext2D, echoes: Echo[], f: number): void => {
	for (const e of echoes) {
		const fl = e.flight;
		if (f <= fl.t0 || f >= fl.t1) continue;
		const now = flightAt(fl, f);
		if (now.near <= 0.005) continue;
		const before = flightAt(fl, f - 0.5);
		const speed = Math.hypot(now.x - before.x, now.y - before.y) * 2; // px/frame
		const fade = Math.min(1, (f - fl.t0) / 3) * now.near;

		// scia breve lungo il percorso reale, dal colore dell'elemento
		ctx.lineCap = 'round';
		let px = now.x;
		let py = now.y;
		for (let j = 1; j <= TRAIL_STEPS; j++) {
			const p = flightAt(fl, Math.max(fl.t0, f - (TRAIL_FRAMES * j) / TRAIL_STEPS));
			const k = 1 - (j - 1) / TRAIL_STEPS;
			ctx.strokeStyle = mix(e.color, COLORS.orangeHot, now.u * now.u, fade * 0.34 * k * k);
			ctx.lineWidth = lerp(1, 3.2, k);
			ctx.beginPath();
			ctx.moveTo(px, py);
			ctx.lineTo(p.x, p.y);
			ctx.stroke();
			px = p.x;
			py = p.y;
		}

		// alone che si accende mentre viene assorbito
		drawGlow(ctx, now.x, now.y, 6 + 20 * sizeAt(e, now.u), COLORS.orange, fade * (0.16 + 0.55 * now.u ** 3), COLORS.orangeHot);

		const place = (st: FlightState, a: number) => {
			const scale = sizeAt(e, st.u);
			const swing = st.u ** 1.5 * fl.swirl * 0.3; // si inclina seguendo la curva
			const rot = e.kind === 'shape' ? e.tilt * 4 + e.spin * (f - fl.t0) * 1.6 + swing : e.tilt + swing;
			ctx.save();
			ctx.translate(st.x, st.y);
			ctx.rotate(rot);
			ctx.scale(scale, scale);
			paint(ctx, e, Math.pow(st.u, 2.4), a, scale);
			ctx.restore();
		};
		// coda sfumata: copie sub-frame fitte e tenui dietro la testa, più lunghe quanto più è veloce
		const ghosts = clamp(Math.ceil((speed * SHUTTER) / 4), 0, GHOSTS);
		for (let k = ghosts; k >= 1; k--) {
			place(flightAt(fl, f - (SHUTTER * k) / ghosts), fade * 0.2 * (1 - k / (ghosts + 1)));
		}
		// testa nitida: il frammento resta leggibile in ogni fotogramma
		place(now, fade * (0.86 + 0.14 * now.u));
	}
	ctx.globalAlpha = 1;
};

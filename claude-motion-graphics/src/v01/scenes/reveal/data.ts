import {clamp, ease, hit, lerp, prog, seeded} from '../../../lib/math';
import {V1_CUES, V1_NET_AT_270, V1_SCENES} from '../../timeline';

/** REVEAL — scaletta (frame RELATIVI: 0 = assoluto 690). */
const S0 = V1_SCENES.reveal.start;
export const R = {
	training: V1_CUES.training - S0, // 0 · flusso di testo nella rete
	condense: 76, //                     il flusso si condensa nella rete
	title: V1_CUES.title - S0, //       90 · "NON PENSA."
	prevede: 105, //                     abs 795 (beat) · "PREVEDE." si blocca
	caveat: V1_CUES.caveat - S0, //    150 · può sbagliare
	endCard: 180, //                     abs 870 · cartolina finale
	end: V1_SCENES.reveal.length, //   210
};

export const LAYOUT = {labelY: 268, titleY1: 798, titleY2: 972, sepY: 1092, caveatY1: 1138, caveatY2: 1198};

/** Camera della rete neurale condivisa: nasce dal punto di luce, cresce assorbendo testo, si condensa, poi sale dietro al titolo. */
export const netPose = (f: number) => {
	const grow = prog(f, 0, 40, ease.outCubic);
	const absorb = prog(f, 10, R.condense - 10, ease.inOutSine);
	const suck = f < R.title ? prog(f, R.condense - 4, R.title - R.condense + 4, ease.inCubic) : 0;
	const settle = prog(f, R.title, 26, ease.outBack);
	const settleY = prog(f, R.title, 22, ease.outCubic);
	let scale = lerp(0.5, 0.9, grow) + 0.07 * absorb;
	let cy = lerp(760, 700, grow);
	scale = lerp(scale, 0.42, suck);
	cy = lerp(cy, 680, suck);
	if (f >= R.title) {
		scale = lerp(0.42, 0.6, settle);
		cy = lerp(680, 452, settleY);
	}
	// deriva lenta nella cartolina finale
	const drift = prog(f, R.title + 20, 60, ease.inOutSine);
	cy += Math.sin((f - R.title) / 34) * 5 * drift;
	scale += 0.02 * prog(f, R.title + 30, R.end - R.title - 30, ease.inOutSine);
	const reveal = prog(f, 0, 22, ease.outCubic);
	const activity = f < R.title ? clamp(0.35 + 0.65 * absorb) : lerp(1, 0.32, prog(f, R.title, 30));
	const brightness = f < R.title ? 0.72 + 0.28 * absorb : lerp(1, 0.8, prog(f, R.title, 40));
	const flash = clamp(0.5 * absorb * 0.6 + 0.9 * suck + hit(f, R.title, 16) + 0.5 * hit(f, R.prevede, 12));
	return {cx: 540, cy, scale, reveal, activity, brightness, flash, pitch: V1_NET_AT_270.pitch, dist: V1_NET_AT_270.dist, absorb, suck};
};

/* ---------------- frammenti di testo (illustrativi, generici) ---------------- */
const SNIPPETS = [
	"c'era una volta",
	'def main():',
	'la fotosintesi è',
	'2 + 2 = 4',
	'il 1492',
	'once upon a time',
	'Roma è la capitale',
	'E = mc²',
	'ciao, come stai?',
	'the quick brown fox',
	'return x * 2',
	'capitolo 1',
	'200 g di farina',
	'<div class="card">',
	'nel mezzo del cammin',
	'il cuore pompa',
	'SELECT * FROM libri',
	'la Terra gira',
	'for i in range(10):',
	'Caro diario,',
	'perché il cielo è blu?',
	'H2O',
	'#include <stdio.h>',
	'articolo 1',
	'la mitosi',
	'pi = 3,14159',
	'buongiorno a tutti',
	'hello world',
	'il sole sorge a est',
	'if (x > 0) {',
	'oggi a Milano',
	'1 + 1 = 2',
	'la Gioconda',
	'printf("ciao");',
	'a² + b² = c²',
	'in conclusione,',
	'Dear Sir or Madam',
	'il verbo essere',
	'const x = [];',
	'le Alpi',
	'ricetta del pesto',
	'mille grazie!',
	'la Divina Commedia',
	'import numpy',
	'il DNA è',
	'per esempio',
	'C’era una volta un re',
	'the answer is',
	'lezione 3',
	'la pizza margherita',
	'x = y + 1',
	'Napoleone',
	'il teorema di Pitagora',
	'secondo gli esperti',
	'buonanotte',
	'how are you?',
	'la luna',
	'vero o falso?',
	'Gentile cliente,',
	'il 25 aprile',
];
/** Frammenti di feedback umano (le risposte migliori vengono preferite). */
const FEEDBACK = ['A > B', 'preferita: A', '✓ utile', 'risposta B ✓', '✗ da migliorare', 'più chiara: A', '✓ corretta', 'B > A'];
const GLYPHS = 'aeiounrstlcdm0123456789{};=<>/.,?!()'.split('');

export type Frag = {
	text: string;
	mono: boolean;
	layer: 0 | 1 | 2; // 0 = vicino (sfocato), 1 = medio (leggibile), 2 = lontano
	fb: boolean;
	arm: number;
	birth: number;
	life: number;
	a0: number;
	R0: number;
	swirl: number;
	size: number;
};

/** Bracci del vortice: il testo scorre in "fiumi" che spiraleggiano dentro la rete (stesso verso per tutti). */
export const ARMS = 7;
export const SWIRL = 1.15;
export const armAngle = (k: number): number => (k / ARMS) * Math.PI * 2 + 0.35;
export const ARM_R = 1050;

export const FRAGS: Frag[] = (() => {
	const rnd = seeded(7031);
	const out: Frag[] = [];
	const total = 250;
	for (let i = 0; i < total; i++) {
		const u = rnd();
		const layer: 0 | 1 | 2 = u < 0.1 ? 0 : u < 0.6 ? 1 : 2;
		const birth = -52 + (i / total) * 124 + (rnd() - 0.5) * 6;
		const life = layer === 0 ? 30 + rnd() * 14 : layer === 1 ? 46 + rnd() * 22 : 52 + rnd() * 24;
		const size = layer === 0 ? 74 + rnd() * 56 : layer === 1 ? 30 + rnd() * 14 : 20 + rnd() * 6;
		const arm = i % ARMS;
		out.push({
			text: SNIPPETS[Math.floor(rnd() * SNIPPETS.length)],
			mono: rnd() < 0.78,
			layer,
			fb: false,
			arm,
			birth,
			life,
			a0: armAngle(arm) + (rnd() - 0.5) * (layer === 0 ? 0.7 : 0.42),
			R0: (layer === 0 ? 860 : 700) + rnd() * 420,
			swirl: SWIRL * (0.85 + rnd() * 0.3),
			size,
		});
	}
	// feedback umano: arriva nella seconda metà del flusso
	FEEDBACK.forEach((t, k) => {
		const arm = (k * 3) % ARMS;
		out.push({
			text: t,
			mono: true,
			layer: 1,
			fb: true,
			arm,
			birth: 22 + k * 6.5 + rnd() * 3,
			life: 44 + rnd() * 12,
			a0: armAngle(arm) + (rnd() - 0.5) * 0.3,
			R0: 700 + rnd() * 360,
			swirl: SWIRL * (0.9 + rnd() * 0.2),
			size: 32 + rnd() * 6,
		});
	});
	return out;
})();

export type Dust = {ch: string; birth: number; life: number; a0: number; R0: number; swirl: number; size: number};
export const DUST: Dust[] = (() => {
	const rnd = seeded(911);
	return Array.from({length: 340}, (_, i) => ({
		ch: GLYPHS[Math.floor(rnd() * GLYPHS.length)],
		birth: -40 + (i / 340) * 114 + rnd() * 4,
		life: 26 + rnd() * 26,
		a0: armAngle(i % ARMS) + (rnd() - 0.5) * 0.8,
		R0: 420 + rnd() * 700,
		swirl: SWIRL * (0.8 + rnd() * 0.4),
		size: 20 + rnd() * 8,
	}));
})();

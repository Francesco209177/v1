import {Vec2, bezier2, clamp, ease, hit, lerp, tween} from '../../lib/math';
import {SPARK_POSE} from '../../timeline';
import {lastKeyBefore, ROWS} from './layout';
import {settle, T} from './timing';

export type SparkState = {x: number; y: number; size: number; rotation: number; scale: number; glow: number};

const FROM = SPARK_POSE.introEnd;
const TO = SPARK_POSE.ideaEnd;

/** outBack con overshoot regolabile (s = 1.2 → ~5%). */
const backOut = (u: number, s = 1.2): number => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);

/**
 * Posa dello spark in funzione del frame (accetta frame frazionari: serve alle scie di movimento).
 *  0–5   anticipazione: si contrae, scende di poco e "carica" la rotazione all'indietro
 *  5–20  volo ad arco verso l'alto con un giro completo, overshoot e assestamento
 *  15    atterra sul beat con un bagliore (primo tasto del prompt)
 *  poi   narratore: reagisce a ogni tasto, alle istruzioni, all'INVIO e alla scrittura del codice
 * A frame 0 vale ESATTAMENTE introEnd; da T.calm in poi ESATTAMENTE ideaEnd (rotazione 0, scala 1, glow 1).
 */
export const sparkState = (f: number): SparkState => {
	// ── entrata
	const k = ease.inOutSine(clamp(f / T.anticEnd));
	let pos: Vec2 = {x: FROM.x, y: FROM.y + 12 * k};
	let size: number = FROM.size;
	let rotation = -14 * k;
	let scale = 1 - 0.06 * k;
	if (f > T.anticEnd) {
		const u = clamp((f - T.anticEnd) / T.flightLen);
		const travel = backOut(Math.pow(u, 1.3));
		pos = bezier2({x: FROM.x, y: FROM.y + 12}, {x: FROM.x + 150, y: 520}, TO, travel);
		size = lerp(FROM.size, TO.size, ease.outQuart(clamp((f - T.anticEnd) / 12)));
		const spin = clamp((f - T.anticEnd) / (T.spinEnd - T.anticEnd));
		rotation = f >= T.spinEnd ? 0 : lerp(-14, 360, 1 - Math.pow(1 - Math.pow(spin, 1.5), 3));
		scale = f < T.land ? tween(f, T.anticEnd, T.land, 0.94, 1.1, ease.outCubic) : tween(f, T.land, T.land + 11, 1.1, 1, ease.outCubic);
	}
	let glow = 1 + 0.5 * Math.sin(Math.PI * clamp((f - T.anticEnd) / 14)) + 1.2 * hit(f, T.land, 10);

	// ── narratore: reazioni a ciò che succede nella finestra
	if (f >= T.land) {
		// tasti del prompt: un guizzo di luce a ogni battuta
		const flick = f < T.submit ? Math.exp(-(f - lastKeyBefore(f)) / 2.2) : 0;
		glow += 0.22 * flick;
		scale += 0.012 * flick;
		// istruzioni: piccoli impulsi
		for (const b of T.bullets) {
			scale += 0.045 * hit(f, b, 6);
			glow += 0.4 * hit(f, b, 7);
		}
		// INVIO: anticipazione (si contrae) e colpo forte sul cue
		if (f < T.submit) scale -= 0.07 * ease.inCubic(clamp((f - (T.submit - 6)) / 6));
		const s = settle(f);
		scale += 0.26 * hit(f, T.submit, 11) * s;
		glow += 1.5 * hit(f, T.submit, 14) * s;
		rotation += -16 * hit(f, T.submit, 9) * Math.cos((f - T.submit) * 0.55) * s;
		// scrittura del codice: resta "acceso" e pulsa a ogni riga che parte
		if (f > T.submit) {
			const work = clamp((f - T.submit) / 6) * s;
			let rowPulse = 0;
			for (const r of ROWS) rowPulse = Math.max(rowPulse, hit(f, r.start, 4));
			glow += work * (0.3 + 0.25 * rowPulse);
			scale += work * 0.022 * rowPulse;
		}
	}
	if (f >= T.calm) return {x: TO.x, y: TO.y, size: TO.size, rotation: 0, scale: 1, glow: 1};
	return {x: pos.x, y: pos.y, size, rotation, scale, glow};
};

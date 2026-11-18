import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {bezier2, clamp, ease, hash, hit, prog, TAU} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {exitPos, flightEase, flightPath} from './AnswerArea';
import {ANSWER, ANSWER_SLOTS, appendAt, C, CTX, EXIT, FLY, HUB, landAt, LIFT, loopDur, loopFrom, PANEL, PICK, pointOnLoop, rowY, SHOW} from './data';

/**
 * Luce della scena PREDICT (un solo canvas additivo):
 * esplosione d'ingresso dal punto del taglio, scie dei token in volo, impatti,
 * impulsi lungo l'anello e sul connettore, accento del ciclo (600), collasso finale nel punto di luce (690).
 */
export const PredictFX: React.FC<{f: number}> = ({f}) => {
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';

		// 1) esplosione d'ingresso dal punto di luce (540, 760)
		if (f < 24) {
			const p = prog(f, 0, 16, ease.outCubic);
			drawGlow(ctx, HUB.x, HUB.y, 26 + 30 * (1 - p), COLORS.orange, (1 - p) * 0.9, COLORS.orangeHot);
			drawGlow(ctx, HUB.x, HUB.y, 8 + 10 * (1 - p), COLORS.orangeHot, 1 - p, COLORS.white);
			// anello d'urto
			const rr = 30 + 980 * ease.outExpo(clamp(f / 18));
			ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.55 * (1 - clamp(f / 18)) ** 1.5);
			ctx.lineWidth = 3 + 6 * (1 - clamp(f / 18));
			ctx.beginPath();
			ctx.ellipse(HUB.x, HUB.y, rr, rr * 0.92, 0, 0, TAU);
			ctx.stroke();
			// scie radiali
			for (let i = 0; i < 90; i++) {
				const a = hash(i, 11) * TAU;
				const life = 9 + hash(i, 12) * 12;
				const q = clamp(f / life);
				if (q >= 1) continue;
				const sp = 380 + hash(i, 13) * 900;
				const r1 = 10 + sp * ease.outCubic(q);
				const len = (40 + 220 * hash(i, 14)) * (1 - q);
				const x1 = HUB.x + Math.cos(a) * r1;
				const y1 = HUB.y + Math.sin(a) * r1;
				const x0 = HUB.x + Math.cos(a) * Math.max(0, r1 - len);
				const y0 = HUB.y + Math.sin(a) * Math.max(0, r1 - len);
				const g = ctx.createLinearGradient(x0, y0, x1, y1);
				g.addColorStop(0, withAlpha(COLORS.orange, 0));
				g.addColorStop(1, withAlpha(COLORS.orangeHot, 0.85 * (1 - q)));
				ctx.strokeStyle = g;
				ctx.lineWidth = 1.4 + 2 * hash(i, 15);
				ctx.beginPath();
				ctx.moveTo(x0, y0);
				ctx.lineTo(x1, y1);
				ctx.stroke();
			}
		}

		ANSWER.forEach((_, s) => {
			const P = PICK[s];
			const slow = s < 2;
			// 2) lampo della scelta sulla barra vincente + anello sul chip
			const fl = hit(f, P, slow ? 10 : 5);
			if (fl > 0.01) {
				const {a} = flightPath(s);
				const y = rowY(0);
				for (let k = 0; k < 8; k++) {
					const x = PANEL.trackX + (k / 7) * PANEL.trackW * 0.62;
					drawGlow(ctx, x, y, 8 + 6 * fl, COLORS.orange, 0.45 * fl, COLORS.orangeHot);
				}
				const rr = 34 + (slow ? 70 : 40) * (1 - fl);
				ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.7 * fl);
				ctx.lineWidth = 1.5 + 2.5 * fl;
				ctx.beginPath();
				ctx.ellipse(a.x, a.y + 10, rr * 1.25, rr * 0.62, 0, 0, TAU);
				ctx.stroke();
				drawGlow(ctx, a.x, a.y + 10, 16 + 16 * fl, COLORS.orange, 0.45 * fl, COLORS.orangeHot);
			}
			// 3) scia del volo
			const start = P + LIFT(s);
			const end = landAt(s);
			if (f >= start - 1 && f <= end + 4) {
				const {a, c, b} = flightPath(s);
				const head = clamp((f - start) / FLY(s));
				const tail = clamp((f - start - (slow ? 5 : 3)) / FLY(s));
				const n = 18;
				for (let k = 0; k <= n; k++) {
					const tt = tail + ((head - tail) * k) / n;
					const pt = bezier2(a, c, b, flightEase(s)(tt));
					const w = k / n;
					drawGlow(ctx, pt.x, pt.y, 3 + 9 * w, COLORS.orange, 0.5 * w * (1 - prog(f, end, 4)), COLORS.orangeHot);
				}
				// scintille che si staccano
				for (let k = 0; k < 10; k++) {
					const tt = clamp(head - 0.08 - hash(s, k) * 0.35);
					const pt = bezier2(a, c, b, flightEase(s)(tt));
					const off = (f - start) * (1.5 + 3 * hash(k, s + 3));
					const ang = hash(k, s + 7) * TAU;
					drawGlow(ctx, pt.x + Math.cos(ang) * off * 3, pt.y + Math.sin(ang) * off * 3, 2 + 2 * hash(k, 9), COLORS.orangeBright, 0.7 * (1 - prog(f, end - 2, 6)), COLORS.white);
				}
			}
			// 4) impatto sullo slot della risposta
			const L = landAt(s);
			const im = hit(f, L, slow ? 12 : 7);
			if (im > 0.01) {
				const sl = ANSWER_SLOTS[s];
				drawGlow(ctx, sl.x, sl.y, 26 + 30 * im, COLORS.orange, 0.7 * im, COLORS.orangeHot);
				const rr = 50 + (slow ? 140 : 80) * (1 - im);
				ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.6 * im);
				ctx.lineWidth = 2 + 2 * im;
				ctx.beginPath();
				ctx.ellipse(sl.x, sl.y, rr * 1.3, rr * 0.55, 0, 0, TAU);
				ctx.stroke();
			}
			// 5) impulso lungo l'anello (il token rientra nel contesto)
			const t0 = loopFrom(s);
			const D = loopDur(s);
			if (f >= t0 - 1 && f <= t0 + D + 6) {
				const head = clamp((f - t0) / D);
				const tl = clamp((f - t0 - 3) / D);
				const fade = 1 - prog(f, t0 + D, 6);
				const n = 16;
				for (let k = 0; k <= n; k++) {
					const tt = tl + ((head - tl) * k) / n;
					const p = pointOnLoop(ease.inOutSine(tt));
					drawGlow(ctx, p.x, p.y, 3 + 8 * (k / n), COLORS.orange, (0.25 + 0.6 * (k / n)) * fade, COLORS.orangeHot);
				}
				const hp = pointOnLoop(ease.inOutSine(head));
				drawGlow(ctx, hp.x, hp.y, 14, COLORS.orangeHot, 0.95 * fade, COLORS.white);
			}
			// arrivo nel contesto
			const ar = hit(f, appendAt(s), 10);
			if (ar > 0.01) {
				drawGlow(ctx, CTX.right - 10, CTX.y, 22 + 26 * ar, COLORS.orange, 0.7 * ar, COLORS.orangeHot);
			}
		});

		// 6) impulsi sul connettore contesto → pannello (prima di ogni nuova distribuzione)
		SHOW.forEach((at, s) => {
			if (s === 0) return;
			const q = (f - (at - 5)) / 5;
			if (q < 0 || q > 1.2) return;
			const y = CTX.y + 26 + (PANEL.top - CTX.y - 28) * clamp(q);
			drawGlow(ctx, 540, y, 10, COLORS.orangeHot, 0.9 * (1 - clamp((q - 1) / 0.2)), COLORS.white);
		});

		// 7) accento del ciclo (600 = relativo 120): una luce percorre tutto l'anello, il contesto si accende
		const acc = hit(f, C.loop, 18);
		if (f >= C.loop && f < C.loop + 22) {
			const q = ease.outCubic(clamp((f - C.loop) / 9));
			for (let k = 0; k < 26; k++) {
				const tt = q - k * 0.012;
				if (tt < 0) break;
				const p = pointOnLoop(tt);
				drawGlow(ctx, p.x, p.y, 9 - k * 0.25, COLORS.orangeHot, 0.9 * acc * (1 - k / 26), COLORS.white);
			}
			// ondata lungo la riga del contesto
			for (let k = 0; k < 14; k++) {
				const x = CTX.right - ((f - C.loop) / 14) * 900 - k * 14;
				if (x < CTX.left) continue;
				drawGlow(ctx, x, CTX.y, 12 - k * 0.6, COLORS.orange, 0.5 * acc * (1 - k / 14), COLORS.orangeHot);
			}
		}

		// 8a) la risposta si stira in linee di luce che corrono al centro
		if (f >= EXIT) {
			ANSWER.forEach((t, s) => {
				const {ex, x, y} = exitPos(f, s);
				if (ex <= 0.02 || ex >= 0.995) return;
				const w = 40 + 30 * t.length;
				const len = w * (0.6 + 5 * ex);
				const dir = x < HUB.x ? -1 : 1;
				const g = ctx.createLinearGradient(x + dir * len, y, x, y);
				g.addColorStop(0, withAlpha(COLORS.orange, 0));
				g.addColorStop(0.75, withAlpha(COLORS.orangeBright, 0.5 * Math.min(1, ex * 2)));
				g.addColorStop(1, withAlpha(COLORS.orangeHot, 0.95 * Math.min(1, ex * 2)));
				ctx.strokeStyle = g;
				// alone morbido + filo luminoso
				ctx.lineWidth = 14 * (1 - 0.6 * ex);
				ctx.globalAlpha = 0.35;
				ctx.beginPath();
				ctx.moveTo(x + dir * len, y);
				ctx.lineTo(x, y);
				ctx.stroke();
				ctx.globalAlpha = 1;
				ctx.lineWidth = 3;
				ctx.stroke();
				drawGlow(ctx, x, y, 10 + 10 * ex, COLORS.orangeHot, 0.8 * ex, COLORS.white);
			});
		}
		// 8) uscita: scie che convergono nel punto di luce del taglio (690)
		const from = EXIT - 4;
		if (f >= from) {
			const N = 110;
			for (let i = 0; i < N; i++) {
				const st = from + Math.sqrt(hash(i, 21)) * (C.end - from - 3);
				const life = 5 + hash(i, 22) * 5;
				const q = (f - st) / life;
				if (q < 0 || q > 1) continue;
				const a = hash(i, 23) * TAU;
				const R = 520 + hash(i, 24) * 520;
				const p = ease.inCubic(q);
				const r = R * (1 - p);
				const len = 30 + 240 * p;
				const x = HUB.x + Math.cos(a) * r;
				const y = HUB.y + Math.sin(a) * r * 0.92;
				const xb = HUB.x + Math.cos(a) * (r + len);
				const yb = HUB.y + Math.sin(a) * (r + len) * 0.92;
				const al = Math.sin(Math.PI * q) * (0.4 + 0.6 * prog(f, from, C.end - from));
				const g = ctx.createLinearGradient(xb, yb, x, y);
				g.addColorStop(0, withAlpha(COLORS.orange, 0));
				g.addColorStop(1, withAlpha(COLORS.orangeHot, 0.8 * al));
				ctx.strokeStyle = g;
				ctx.lineWidth = 1.6 + 1.6 * hash(i, 25) + 1.5 * p;
				ctx.beginPath();
				ctx.moveTo(xb, yb);
				ctx.lineTo(x, y);
				ctx.stroke();
			}
			const k = prog(f, EXIT + 4, C.end - EXIT - 4, ease.inQuad);
			if (k > 0) {
				drawGlow(ctx, HUB.x, HUB.y, 10 + 34 * k, COLORS.orange, 0.5 + 0.5 * k, COLORS.orangeHot);
				drawGlow(ctx, HUB.x, HUB.y, 4 + 12 * k, COLORS.orangeHot, clamp(0.6 + k), COLORS.white);
				const w = 120 + 700 * k;
				const g = ctx.createLinearGradient(HUB.x - w, HUB.y, HUB.x + w, HUB.y);
				g.addColorStop(0, withAlpha(COLORS.orange, 0));
				g.addColorStop(0.5, withAlpha(COLORS.orangeHot, 0.85 * k));
				g.addColorStop(1, withAlpha(COLORS.orange, 0));
				ctx.fillStyle = g;
				ctx.fillRect(HUB.x - w, HUB.y - 1.5 - 2 * k, w * 2, 3 + 4 * k);
			}
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={f} additive draw={draw} />;
};

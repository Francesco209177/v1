import React, {useMemo} from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hash, invLerp} from '../../../lib/math';
import {COLORS} from '../../../theme';
import {VP} from './timing';

/**
 * Pulviscolo 3D che scorre verso la camera, condiviso da HOOK e TOKENS (funzione del frame ASSOLUTO:
 * continuo sul taglio 89|90). Veloce nel tuffo dentro lo schermo, poi deriva lenta, di nuovo veloce
 * quando i token entrano nella rete; spento entro 258.
 */
const speed = (a: number): number => {
	if (a < 72) return 0;
	if (a < 90) return 0.07 * ease.inQuad(invLerp(72, 90, a));
	let v = 0.0045 + 0.0655 * Math.exp(-(a - 90) / 8);
	v += 0.03 * ease.inOutSine(invLerp(214, 232, a)) * (1 - ease.inOutSine(invLerp(238, 256, a)));
	return v;
};

/** Spostamento cumulativo della camera (somma esatta frame per frame: funzione pura). */
const travel = (a: number): number => {
	const n = Math.floor(a);
	let z = 0;
	for (let i = 0; i < n; i++) z += speed(i);
	return z + (a - n) * speed(n);
};

/** Intensità globale del pulviscolo. */
const level = (a: number): number => {
	const inHook = ease.inOutSine(invLerp(78, 88, a));
	const calm = 1 - 0.45 * ease.inOutSine(invLerp(104, 124, a)) + 0.45 * ease.inOutSine(invLerp(212, 226, a));
	const out = 1 - ease.inOutSine(invLerp(236, 258, a));
	return inHook * calm * out;
};

const FOC = 230;

export const DiveDust: React.FC<{abs: number}> = ({abs}) => {
	const pts = useMemo(
		() =>
			Array.from({length: 240}, (_, i) => ({
				x: (hash(i, 71) - 0.5) * 4.6,
				y: (hash(i, 72) - 0.5) * 7.4,
				z: hash(i, 73),
				hot: hash(i, 74) > 0.72,
				sz: 0.6 + hash(i, 75) * 0.9,
			})),
		[],
	);
	const lv = level(abs);
	if (lv <= 0.003) return null;
	const Z = travel(abs);
	const Zp = travel(abs - 0.9); // otturatore: scia lunga quanto lo spostamento di ~1 frame
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';
		ctx.lineCap = 'round';
		for (const p of pts) {
			const u = (((p.z - Z) % 1) + 1) % 1;
			const up = (((p.z - Zp) % 1) + 1) % 1;
			const z = 0.035 + 0.965 * u;
			const zp = 0.035 + 0.965 * up;
			const x = VP.x + (p.x * FOC) / z;
			const y = VP.y + (p.y * FOC) / z;
			if (x < -200 || x > 1280 || y < -200 || y > 2120) continue;
			const near = 1 - z;
			const a = lv * Math.pow(near, 1.4) * clamp((1 - z) / 0.18) * (0.35 + 0.65 * p.sz);
			if (a < 0.01) continue;
			const col = p.hot ? COLORS.orangeHot : COLORS.orangeBright;
			if (zp > z) {
				// scia (motion blur) dalla posizione di un frame prima
				const x0 = VP.x + (p.x * FOC) / zp;
				const y0 = VP.y + (p.y * FOC) / zp;
				const len = Math.hypot(x - x0, y - y0);
				if (len > 1.5) {
					ctx.strokeStyle = withAlpha(col, Math.min(1, a * 0.75));
					ctx.lineWidth = (0.7 + 3.2 * near * near) * p.sz;
					ctx.beginPath();
					ctx.moveTo(x0, y0);
					ctx.lineTo(x, y);
					ctx.stroke();
				}
			}
			drawGlow(ctx, x, y, (0.8 + 3.4 * near * near) * p.sz, col, a, COLORS.white);
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={abs} draw={draw} />;
};

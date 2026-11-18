import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hash, invLerp, TAU} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {baseToGroup, hookPose, LaptopPose, PORT_LOCAL, projectLaptop} from './pose';
import {plugOut, UNPLUG} from './timing';

const pt = (pose: LaptopPose, bx: number, by: number, lift = 0) => projectLaptop(pose, baseToGroup(bx, by, lift));

/** Contorno del connettore RJ45 (corpo chiaro) sul piano della scrivania, proiettato. */
const plugPoly = (pose: LaptopPose, out: number) => {
	const x0 = PORT_LOCAL.x - 4 + out;
	const y0 = PORT_LOCAL.y - 17;
	return [pt(pose, x0, y0, 4), pt(pose, x0 + 48, y0, 4), pt(pose, x0 + 48, y0 + 34, 4), pt(pose, x0, y0 + 34, 4)];
};

/**
 * Effetti dello strappo (canvas, coordinate del frame): scie di movimento del connettore,
 * scintille con gravità, onda d'urto ellittica sul piano della scrivania, lampo alla porta.
 */
export const UnplugFX: React.FC<{f: number}> = ({f}) => {
	const g = f - UNPLUG;
	if (g < -1 || g > 26) return null;
	const pose = hookPose(f);
	const draw = (ctx: CanvasRenderingContext2D): void => {
		ctx.globalCompositeOperation = 'lighter';
		const port = pt(pose, PORT_LOCAL.x, PORT_LOCAL.y, 6);
		const s = pose.scale;

		// 1) motion blur del connettore: copie fantasma tra la posizione precedente e l'attuale
		if (g >= 0 && g < 5) {
			const a = plugOut(f - 1);
			const b = plugOut(f);
			const n = 8;
			for (let i = 0; i < n; i++) {
				const poly = plugPoly(pose, a + ((b - a) * i) / n);
				ctx.fillStyle = withAlpha(COLORS.orangeHot, 0.07 * (1 - g / 5));
				ctx.beginPath();
				poly.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
				ctx.closePath();
				ctx.fill();
			}
			// scia luminosa lungo la scrivania
			const tip = pt(pose, PORT_LOCAL.x + b, PORT_LOCAL.y, 6);
			const grad = ctx.createLinearGradient(port.x, port.y, tip.x, tip.y);
			grad.addColorStop(0, withAlpha(COLORS.white, 0.9 * (1 - g / 5)));
			grad.addColorStop(1, withAlpha(COLORS.orange, 0));
			ctx.strokeStyle = grad;
			ctx.lineCap = 'round';
			ctx.lineWidth = 10 * s * (1 - g / 6);
			ctx.beginPath();
			ctx.moveTo(port.x, port.y);
			ctx.lineTo(tip.x, tip.y);
			ctx.stroke();
		}

		// 2) onda d'urto sul piano della scrivania
		if (g >= 0 && g < 14) {
			const t = ease.outCubic(g / 14);
			for (const [r0, w, a0] of [
				[20, 3, 0.9],
				[8, 1.6, 0.6],
			] as const) {
				const r = r0 + 150 * t;
				ctx.strokeStyle = withAlpha(COLORS.orangeBright, a0 * (1 - t));
				ctx.lineWidth = w * s;
				ctx.beginPath();
				for (let k = 0; k <= 40; k++) {
					const an = (k / 40) * TAU;
					const p = pt(pose, PORT_LOCAL.x + Math.cos(an) * r, PORT_LOCAL.y + Math.sin(an) * r, 2);
					if (k) ctx.lineTo(p.x, p.y);
					else ctx.moveTo(p.x, p.y);
				}
				ctx.stroke();
			}
		}

		// 3) lampo alla porta
		if (g >= 0) {
			const k = Math.exp(-g / 2.6);
			drawGlow(ctx, port.x, port.y, 26 * s * k, COLORS.orangeHot, k, COLORS.white);
			drawGlow(ctx, port.x, port.y, 70 * s * k, COLORS.orange, 0.5 * k, COLORS.orangeHot);
		}

		// 4) scintille (allungate in direzione del moto)
		ctx.lineCap = 'round';
		for (let i = 0; i < 48; i++) {
			const delay = hash(i, 1) * 2.5;
			const t = g - delay;
			const life = 8 + hash(i, 2) * 14;
			if (t <= 0 || t > life) continue;
			const ang = -Math.PI / 2 + 0.25 + (hash(i, 3) - 0.5) * 2.9;
			const sp = (8 + hash(i, 4) * 28) * s;
			const tau = 5;
			const pos = (tt: number) => {
				const d = sp * tau * (1 - Math.exp(-tt / tau));
				return {x: port.x + Math.cos(ang) * d, y: port.y + Math.sin(ang) * d + 0.55 * s * tt * tt};
			};
			const p1 = pos(t);
			const p0 = pos(Math.max(0, t - 1.6));
			const fade = 1 - t / life;
			ctx.strokeStyle = withAlpha(hash(i, 5) > 0.5 ? COLORS.orangeHot : COLORS.orangeBright, 0.95 * fade);
			ctx.lineWidth = (1.2 + 2 * hash(i, 6)) * s * (0.5 + 0.5 * fade);
			ctx.beginPath();
			ctx.moveTo(p0.x, p0.y);
			ctx.lineTo(p1.x, p1.y);
			ctx.stroke();
			drawGlow(ctx, p1.x, p1.y, 2.2 * s * fade, COLORS.orangeBright, 0.8 * fade, COLORS.white);
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	return <FrameCanvas frame={f} draw={draw} />;
};

/** Badge "NESSUNA CONNESSIONE": lampeggia a scatti allo strappo, collegato alla porta da una linea. */
export const OfflineBadge: React.FC<{f: number}> = ({f}) => {
	const g = f - UNPLUG;
	if (g < 1 || g > 34) return null;
	const pose = hookPose(f);
	const port = pt(pose, PORT_LOCAL.x, PORT_LOCAL.y, 6);
	const flicker = g < 6 ? [1, 0.25, 1, 0.55, 1][g - 1] : 1;
	const inP = ease.outBack(clamp((g - 1) / 5));
	const out = ease.inCubic(invLerp(26, 34, g));
	// badge a sinistra della porta, collegato da una linea a gomito
	const bx = port.x - 300;
	const by = port.y + 70;
	return (
		<div style={{position: 'absolute', inset: 0, opacity: flicker * (1 - out)}}>
			<svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0}}>
				<path
					d={`M ${port.x} ${port.y + 12} L ${port.x - 40} ${by} L ${bx + 20} ${by}`}
					stroke={alpha(COLORS.orangeBright, 0.75)}
					strokeWidth={2.5}
					fill="none"
					strokeDasharray={600}
					strokeDashoffset={600 * (1 - ease.outCubic(clamp((g - 1) / 6)))}
				/>
				<circle cx={port.x} cy={port.y} r={9} fill="none" stroke={COLORS.orangeHot} strokeWidth={2.5} />
			</svg>
			<div
				style={{
					position: 'absolute',
					left: bx - 30,
					top: by,
					transform: `translate(-50%, -50%) scale(${0.7 + 0.3 * inP})`,
					transformOrigin: '100% 50%',
					display: 'flex',
					alignItems: 'center',
					gap: 14,
					padding: '14px 22px',
					borderRadius: 12,
					background: 'rgba(10,9,8,0.88)',
					border: `2px solid ${COLORS.orange}`,
					boxShadow: `0 0 30px ${alpha(COLORS.orange, 0.45)}`,
					fontFamily: FONTS.mono,
					fontWeight: 700,
					fontSize: 26,
					letterSpacing: '0.14em',
					color: COLORS.orangeHot,
					whiteSpace: 'nowrap',
				}}
			>
				<svg width={30} height={30} viewBox="0 0 30 30">
					<rect x={5} y={9} width={20} height={15} rx={2.5} fill="none" stroke={COLORS.orangeHot} strokeWidth={2.4} />
					<path d="M10 9 V5 M15 9 V5 M20 9 V5" stroke={COLORS.orangeHot} strokeWidth={2.4} strokeLinecap="round" />
					<path d="M3 27 L27 3" stroke={COLORS.white} strokeWidth={2.8} strokeLinecap="round" />
				</svg>
				NESSUNA CONNESSIONE
			</div>
		</div>
	);
};

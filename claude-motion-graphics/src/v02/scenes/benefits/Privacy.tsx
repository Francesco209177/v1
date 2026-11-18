import React, {useMemo} from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow, withAlpha} from '../../../lib/canvas';
import {clamp, ease, hash, hit, prog, TAU} from '../../../lib/math';
import {alpha, COLORS} from '../../../theme';
import {Keyword} from './Keyword';
import {CX} from './layout';
import {ellipsePath, GlowFilter, roundRectPath, Stroke} from './svg';

/** Geometria dell'illustrazione PRIVACY (coordinate del frame). */
const G = {
	ring: {cx: CX, cy: 632, rx: 418, ry: 244},
	screen: {x: CX - 212, y: 452, w: 424, h: 272},
	lock: {cx: CX, top: 602, w: 126, h: 96, shackleR: 35, legs: 26},
} as const;
const SNAP = 30; // il lucchetto si chiude sul beat (assoluto 540)
const LIFT = 46;

/** Arco del lucchetto: sollevato prima del beat (anticipo verso l'alto), poi scatta giù con un piccolo rimbalzo. */
const shackleLift = (f: number): number => {
	if (f < 21) return LIFT;
	if (f < 26) return LIFT + 8 * ease.outCubic((f - 21) / 5);
	if (f < SNAP) return (LIFT + 8) * (1 - ease.inQuad((f - 26) / (SNAP - 26)));
	const d = f - SNAP;
	return -6 * Math.exp(-d / 2.2) * Math.sin(d * 1.7);
};

/** Particelle "dati": orbitano dentro l'ellisse e rimbalzano sul bordo (onda triangolare sul raggio). */
type Datum = {th: number; w: number; per: number; ph: number; rMin: number; size: number; hot: boolean};

const tri = (u: number): number => 1 - Math.abs(2 * (u - Math.floor(u)) - 1);

export const PrivacyIcon: React.FC<{f: number}> = ({f}) => {
	const data = useMemo<Datum[]>(
		() =>
			Array.from({length: 54}, (_, i) => ({
				th: hash(i, 11) * TAU,
				w: (0.008 + 0.018 * hash(i, 12)) * (hash(i, 13) > 0.35 ? 1 : -1),
				per: 22 + 30 * hash(i, 14),
				ph: hash(i, 15),
				rMin: 0.5 + 0.32 * hash(i, 16),
				size: 1.6 + 2.6 * hash(i, 17),
				hot: hash(i, 18) > 0.7,
			})),
		[],
	);
	const {ring, screen, lock} = G;
	const draw = prog(f, -4, 16, ease.outCubic);
	const ringIn = prog(f, -3, 12, ease.outQuart);
	const entry = hit(f, 0, 10);
	const snap = hit(f, SNAP, 14);
	const locked = f >= SNAP ? 1 : 0;
	const lift = shackleLift(f);
	const beat = Math.max(hit(f, 45, 10), hit(f, 60, 10)) * 0.5;
	const ringScale = 0.72 + 0.28 * ringIn;
	const ringGlow = 0.55 + 0.25 * locked + 0.9 * entry + 1.1 * snap + 0.4 * beat;
	const pulse = prog(f, SNAP, 16, ease.outCubic); // onda che parte dal bordo alla chiusura
	const bodyIn = prog(f, 1, 9, ease.outBack);

	const ringD = ellipsePath(ring.cx, ring.cy, ring.rx, ring.ry);
	const screenD = roundRectPath(screen.x, screen.y, screen.w, screen.h, 18);
	const innerD = roundRectPath(screen.x + 14, screen.y + 14, screen.w - 28, screen.h - 28, 8);
	const baseY = screen.y + screen.h + 10;
	const baseD = `M ${CX - 262} ${baseY} H ${CX + 262} L ${CX + 282} ${baseY + 22} Q ${CX + 284} ${baseY + 30} ${CX + 272} ${baseY + 30} H ${CX - 272} Q ${CX - 284} ${baseY + 30} ${CX - 282} ${baseY + 22} Z`;
	const notchD = `M ${CX - 44} ${baseY + 1} Q ${CX - 40} ${baseY + 9} ${CX - 30} ${baseY + 9} H ${CX + 30} Q ${CX + 40} ${baseY + 9} ${CX + 44} ${baseY + 1}`;
	const L = lock;
	const bodyX = L.cx - L.w / 2;
	const shackleD = `M ${L.cx - L.shackleR} ${L.top + 4} V ${L.top - L.legs} A ${L.shackleR} ${L.shackleR} 0 0 1 ${L.cx + L.shackleR} ${L.top - L.legs} V ${L.top + 4}`;
	const keyD = `M ${L.cx} ${L.top + 38} m -12 0 a 12 12 0 1 1 24 0 a 12 12 0 1 1 -24 0 M ${L.cx} ${L.top + 50} V ${L.top + 70}`;
	const lockHot = 0.35 + 0.65 * locked;

	const lines = (mode: 'glow' | 'core') => {
		const g = mode === 'glow';
		const k = g ? 2.6 : 1;
		const c = g ? COLORS.orange : COLORS.orangeHot;
		return (
			<>
				<Stroke d={screenD} w={4 * k} color={g ? COLORS.orange : COLORS.white} draw={draw} opacity={g ? 0.55 : 0.9} />
				<Stroke d={innerD} w={1.6 * k} color={c} draw={draw} opacity={g ? 0.25 : 0.35} />
				<Stroke d={baseD} w={4 * k} color={g ? COLORS.orange : COLORS.white} draw={prog(f, 0, 12, ease.outCubic)} opacity={g ? 0.5 : 0.85} />
				<Stroke d={notchD} w={2 * k} color={c} draw={prog(f, 8, 8)} opacity={0.6} />
				{/* lucchetto */}
				<g opacity={bodyIn} transform={`translate(${L.cx} ${L.top + L.h / 2}) scale(${0.6 + 0.4 * bodyIn}) translate(${-L.cx} ${-(L.top + L.h / 2)})`}>
					<g transform={`translate(0 ${-lift})`}>
						<Stroke d={shackleD} w={(g ? 14 : 9) * (g ? 1.6 : 1)} color={g ? COLORS.orange : COLORS.orangeHot} opacity={g ? 0.5 + 0.8 * snap : 1} />
					</g>
					<path
						d={roundRectPath(bodyX, L.top, L.w, L.h, 16)}
						fill={g ? alpha(COLORS.orange, 0.35 * lockHot + 0.5 * snap) : locked ? '#3B2118' : '#21150F'}
						stroke={g ? COLORS.orange : COLORS.orangeHot}
						strokeWidth={g ? 14 : 5}
						opacity={g ? 0.4 + 0.9 * snap : 1}
					/>
					{!g ? <Stroke d={keyD} w={6} color={locked ? COLORS.white : COLORS.orangeBright} opacity={0.6 + 0.4 * locked} /> : null}
				</g>
				{/* confine luminoso */}
				<g transform={`translate(${ring.cx} ${ring.cy}) scale(${ringScale}) translate(${-ring.cx} ${-ring.cy})`}>
					<Stroke d={ringD} w={(g ? 10 : 3.2) * (1 + 0.5 * snap)} color={g ? COLORS.orange : COLORS.orangeHot} opacity={clamp(g ? 0.45 * ringGlow : 0.75 + 0.25 * ringGlow) * ringIn} />
					{!g ? (
						<path
							d={ellipsePath(ring.cx, ring.cy, ring.rx + 22, ring.ry + 22)}
							fill="none"
							stroke={alpha(COLORS.orangeBright, 0.45)}
							strokeWidth={2}
							strokeDasharray="3 15"
							strokeDashoffset={-f * 1.6}
							opacity={ringIn * (0.5 + 0.5 * locked)}
						/>
					) : null}
				</g>
			</>
		);
	};

	return (
		<>
			<svg width={1080} height={900} viewBox="0 200 1080 900" style={{position: 'absolute', left: 0, top: 200, overflow: 'visible'}}>
				<defs>
					<GlowFilter id="bp-glow" sd={9} />
					<radialGradient id="bp-fill" cx="50%" cy="50%" r="50%">
						<stop offset="0%" stopColor={COLORS.orange} stopOpacity={0.16 + 0.22 * snap + 0.12 * entry} />
						<stop offset="70%" stopColor={COLORS.orangeDeep} stopOpacity={0.05 + 0.06 * locked} />
						<stop offset="100%" stopColor={COLORS.orangeDeep} stopOpacity={0} />
					</radialGradient>
				</defs>
				{/* campo protetto (riempimento morbido dentro il confine) */}
				<ellipse cx={ring.cx} cy={ring.cy} rx={ring.rx * ringScale} ry={ring.ry * ringScale} fill="url(#bp-fill)" opacity={ringIn} />
				{/* onda d'urto alla chiusura */}
				{pulse > 0 && pulse < 1 ? (
					<ellipse
						cx={ring.cx}
						cy={ring.cy}
						rx={ring.rx * (1 + 0.16 * pulse)}
						ry={ring.ry * (1 + 0.24 * pulse)}
						fill="none"
						stroke={COLORS.orangeBright}
						strokeWidth={6 * (1 - pulse) + 1}
						opacity={0.85 * (1 - pulse)}
					/>
				) : null}
				<g filter="url(#bp-glow)">{lines('glow')}</g>
				<g>{lines('core')}</g>
			</svg>
			<DataParticles f={f} data={data} />
		</>
	);
};

/** Canvas locale (ritagliato attorno all'ellisse) con le particelle dati e i lampi di contatto sul bordo. */
const DataParticles: React.FC<{f: number; data: Datum[]}> = ({f, data}) => {
	const {ring} = G;
	const ox = ring.cx - ring.rx - 60;
	const oy = ring.cy - ring.ry - 60;
	const W = ring.rx * 2 + 120;
	const H = ring.ry * 2 + 120;
	const locked = f >= SNAP;
	return (
		<FrameCanvas
			frame={f}
			width={W}
			height={H}
			additive
			style={{left: ox, top: oy}}
			draw={(ctx) => {
				ctx.globalCompositeOperation = 'lighter';
				const rx = ring.rx - 8;
				const ry = ring.ry - 8;
				const pos = (d: Datum, t: number) => {
					const th = d.th + d.w * t;
					const r = d.rMin + (1 - d.rMin) * tri(t / d.per + d.ph);
					return {x: ring.cx - ox + rx * r * Math.cos(th), y: ring.cy - oy + ry * r * Math.sin(th), th};
				};
				data.forEach((d, i) => {
					const vis = prog(f, 2 + (i % 12) * 0.6, 7, ease.outCubic);
					if (vis <= 0) return;
					const color = d.hot ? COLORS.orangeHot : COLORS.orangeBright;
					// scia
					for (let k = 3; k >= 1; k--) {
						const p = pos(d, f - k * 1.2);
						drawGlow(ctx, p.x, p.y, d.size * (1 - k * 0.18), COLORS.orange, (0.34 - k * 0.08) * vis, COLORS.orangeBright);
					}
					const p = pos(d, f);
					drawGlow(ctx, p.x, p.y, d.size, color, 0.95 * vis, COLORS.white);
					// contatto col bordo: lampo + arco acceso sul confine
					const u = f / d.per + d.ph - 0.5;
					const since = (u - Math.floor(u)) * d.per;
					if (since < 9) {
						const tc = f - since;
						const th = d.th + d.w * tc;
						const k = (1 - since / 9) * vis * (locked ? 1 : 0.6);
						const bx = ring.cx - ox + ring.rx * Math.cos(th);
						const by = ring.cy - oy + ring.ry * Math.sin(th);
						drawGlow(ctx, bx, by, 5 + 5 * k, COLORS.orangeBright, 0.8 * k, COLORS.white);
						ctx.strokeStyle = withAlpha(COLORS.orangeHot, 0.55 * k);
						ctx.lineWidth = 3;
						ctx.beginPath();
						ctx.ellipse(ring.cx - ox, ring.cy - oy, ring.rx, ring.ry, 0, th - 0.12, th + 0.12);
						ctx.stroke();
					}
				});
				ctx.globalCompositeOperation = 'source-over';
			}}
		/>
	);
};

/** Sequenza 01 · PRIVACY (f = frame relativo, 0 = assoluto 510). */
export const PrivacySeq: React.FC<{f: number}> = ({f}) => (
	<>
		<div style={{position: 'absolute', inset: 0, transform: `translateY(${-f * 0.12}px)`}}>
			<PrivacyIcon f={f} />
		</div>
		<Keyword f={f} word="PRIVACY" qualifier="i dati possono restare sul dispositivo" highlight={['sul', 'dispositivo']} />
	</>
);

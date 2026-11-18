import React from 'react';
import {clamp, ease, hit, lerp, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {Keyword} from './Keyword';
import {CX, SLASH} from './layout';
import {arcPath, GlowFilter, Stroke} from './svg';

/** Geometria del simbolo Wi‑Fi: punto + tre archi a ventaglio (90°) verso l'alto. */
const W = {cx: CX, cy: 772, radii: [92, 178, 264], dot: 24, stroke: 30} as const;
/** Spegnimento degli archi (dall'esterno verso l'interno). Il primo cade sul beat (assoluto 600). */
const OFF_AT = [15, 20, 25] as const;
const SLASH_AT = 30; // la barra arriva sul beat (assoluto 615)
const FLICKER = [1, 0.15, 0.85, 0.05, 0.45, 0];

const lit = (f: number, at: number): number => {
	const d = f - at;
	if (d < 0) return 1;
	if (d >= FLICKER.length) return 0;
	return FLICKER[d];
};

/** Bolla di chat: prima "sta scrivendo", poi la risposta continua ad arrivare anche dopo lo stacco. */
const BUBBLE = {x: 92, y: 752, w: 372, h: 124} as const;
const LINES = ['Nessun problema:', 'rispondo in locale.'];
const TYPE_AT = 32;
const CPS = 1.25; // caratteri per frame

const ChatBubble: React.FC<{f: number}> = ({f}) => {
	const pop = prog(f, 8, 9, ease.outBack);
	if (pop <= 0) return null;
	const typed = Math.max(0, Math.floor((f - TYPE_AT) * CPS));
	let left = typed;
	const shown = LINES.map((l) => {
		const s = l.slice(0, Math.max(0, left));
		left -= l.length;
		return s;
	});
	const done = typed >= LINES.join('').length;
	const caretOn = Math.floor(f / 6) % 2 === 0 || !done;
	const thinking = f < TYPE_AT;
	// la bolla nasce compatta (solo i tre puntini) e si allarga/alza mentre la risposta arriva
	const line2At = TYPE_AT + LINES[0].length / CPS;
	const w = lerp(132, BUBBLE.w, prog(f, TYPE_AT - 1, 8, ease.outCubic));
	const h = lerp(82, BUBBLE.h, prog(f, line2At - 1, 6, ease.outCubic));
	return (
		<div
			style={{
				position: 'absolute',
				left: BUBBLE.x,
				top: BUBBLE.y + BUBBLE.h - h,
				width: w,
				height: h,
				transformOrigin: '0% 100%',
				transform: `scale(${0.4 + 0.6 * pop})`,
				opacity: clamp(pop * 2),
			}}
		>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: '28px 28px 28px 8px',
					background: `linear-gradient(160deg, ${COLORS.surface2}, ${COLORS.surface})`,
					boxShadow: `inset 0 0 0 1.5px ${alpha(COLORS.orange, 0.45)}, 0 0 40px ${alpha(COLORS.orange, 0.18)}, 0 18px 40px rgba(0,0,0,0.5)`,
				}}
			/>
			<div style={{position: 'absolute', left: 26, top: 20, width: w - 40, height: h - 40, overflow: 'hidden', whiteSpace: 'nowrap', fontFamily: FONTS.body, fontWeight: 500, fontSize: 30, lineHeight: '42px', color: COLORS.white}}>
				{thinking ? (
					<div style={{display: 'flex', gap: 12, height: 42, alignItems: 'center'}}>
						{[0, 1, 2].map((i) => {
							const b = Math.max(0, Math.sin((f - i * 3) / 3.2));
							return <div key={i} style={{width: 14, height: 14, borderRadius: 7, background: COLORS.orangeBright, opacity: 0.35 + 0.65 * b, transform: `translateY(${-7 * b}px)`}} />;
						})}
					</div>
				) : (
					shown.map((s, i) => {
						// il cursore sta sulla riga in corso di scrittura (o sull'ultima, a risposta completa)
						const active = shown.findIndex((x, j) => x.length < LINES[j].length);
						const caretLine = active === -1 ? LINES.length - 1 : active;
						return (
							<div key={i} style={{height: 42, whiteSpace: 'pre'}}>
								{s}
								{i === caretLine ? (
									<span style={{display: 'inline-block', width: 3, height: 32, marginLeft: 3, verticalAlign: '-5px', background: COLORS.orange, opacity: caretOn ? 1 : 0}} />
								) : null}
							</div>
						);
					})
				)}
			</div>
		</div>
	);
};

export const OfflineIcon: React.FC<{f: number}> = ({f}) => {
	const slashDraw = prog(f, SLASH_AT - 3, 3, ease.inQuad);
	const slashHit = hit(f, SLASH_AT, 12);
	const entry = hit(f, 0, 10);
	const shake = 7 * slashHit * Math.sin(f * 2.7);
	const dotLit = lit(f, OFF_AT[2]);
	const p1 = {x: SLASH.c.x - SLASH.d.x * SLASH.half, y: SLASH.c.y - SLASH.d.y * SLASH.half};
	const p2 = {x: SLASH.c.x + SLASH.d.x * SLASH.half, y: SLASH.c.y + SLASH.d.y * SLASH.half};
	const slashD = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;

	const arcs = (mode: 'glow' | 'core') => {
		const g = mode === 'glow';
		return (
			<>
				{W.radii.map((r, i) => {
					const on = lit(f, OFF_AT[2 - i]); // l'arco esterno (i = 2) si spegne per primo
					const draw = prog(f, -3 + i * 2, 7, ease.outCubic);
					const d = arcPath(W.cx, W.cy, r, -135, -45);
					return g ? (
						<Stroke key={i} d={d} w={W.stroke * 1.9} color={COLORS.orange} draw={draw} opacity={on * (0.7 + 0.8 * entry)} />
					) : (
						<g key={i}>
							<Stroke d={d} w={W.stroke} color={COLORS.grayDark} draw={draw} opacity={1 - on} />
							<Stroke d={d} w={W.stroke} color={COLORS.orangeBright} draw={draw} opacity={on} />
							<Stroke d={d} w={W.stroke * 0.35} color={COLORS.orangeHot} draw={draw} opacity={on * 0.9} />
						</g>
					);
				})}
				{g ? (
					<circle cx={W.cx} cy={W.cy} r={W.dot * 1.6} fill={COLORS.orange} opacity={0.7 * dotLit} />
				) : (
					<>
						<circle cx={W.cx} cy={W.cy} r={W.dot} fill={COLORS.grayDark} />
						<circle cx={W.cx} cy={W.cy} r={W.dot} fill={COLORS.orangeBright} opacity={dotLit} />
					</>
				)}
				{/* barra di "spento": prima un solco scuro che taglia gli archi, poi la linea arancione */}
				{g ? (
					<Stroke d={slashD} w={26} color={COLORS.orange} draw={slashDraw} opacity={0.8 + 1.2 * slashHit} />
				) : (
					<>
						<Stroke d={slashD} w={58} color={COLORS.black} draw={slashDraw} />
						<Stroke d={slashD} w={22} color={COLORS.orangeBright} draw={slashDraw} />
						<Stroke d={slashD} w={8} color={COLORS.white} draw={slashDraw} opacity={0.5 + 0.5 * slashHit} />
					</>
				)}
			</>
		);
	};

	return (
		<>
			<svg width={1080} height={900} viewBox="0 200 1080 900" style={{position: 'absolute', left: 0, top: 200, overflow: 'visible', transform: `translateX(${shake}px)`}}>
				<defs>
					<GlowFilter id="bo-glow" sd={11} />
				</defs>
				<g filter="url(#bo-glow)">{arcs('glow')}</g>
				<g>{arcs('core')}</g>
			</svg>
			<ChatBubble f={f} />
		</>
	);
};

/** Sequenza 02 · OFFLINE (f = frame relativo, 0 = assoluto 585). */
export const OfflineSeq: React.FC<{f: number}> = ({f}) => (
	<>
		<div style={{position: 'absolute', inset: 0, transform: `translateY(${-f * 0.12}px)`}}>
			<OfflineIcon f={f} />
		</div>
		<Keyword
			f={f}
			word="OFFLINE"
			qualifier="dopo il download iniziale del modello"
			highlight={['download', 'iniziale']}
			note="alcune funzioni online, es. ricerca web, non sono disponibili"
			noteAt={36}
		/>
	</>
);

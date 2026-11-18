import React from 'react';
import {bezier2, clamp, ease, hit, lerp, prog, Vec2} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {TokenChip, tokenWidth} from '../../components/TokenChip';
import {ANS, ANSWER, ANSWER_SLOTS, chipCenterInRow, EXIT, FLY, HUB, landAt, LIFT, PANEL, PICK, rowY} from './data';

/** Traiettoria del token scelto: dal pannello allo slot della risposta (arco morbido). */
export const flightPath = (s: number): {a: Vec2; c: Vec2; b: Vec2} => {
	const a = {x: chipCenterInRow(ANSWER[s]), y: rowY(0) - 10};
	const b = ANSWER_SLOTS[s];
	// l'arco esce a sinistra del pannello: il chip non attraversa le altre righe
	const c = {x: Math.min(a.x, b.x) - 250, y: lerp(a.y, b.y, 0.42)};
	return {a, c, b};
};

/** Lenti: partenza e arrivo morbidi. Veloci: stacco immediato dal pannello, atterraggio frenato. */
export const flightEase = (s: number): ((t: number) => number) => (s < 2 ? ease.inOutCubic : ease.outQuad);

/** Posizione/velocità del chip in volo al frame f (null se non in volo). */
export const flightAt = (f: number, s: number): {p: Vec2; t: number; lift: number; speed: number; dir: number} | null => {
	const P = PICK[s];
	const end = landAt(s);
	if (f < P || f >= end) return null;
	const lift = prog(f, P, LIFT(s), ease.outCubic);
	const raw = clamp((f - P - LIFT(s)) / FLY(s));
	const t = flightEase(s)(raw);
	const {a, c, b} = flightPath(s);
	const p = bezier2(a, c, b, t);
	const p2 = bezier2(a, c, b, flightEase(s)(clamp(raw + 0.04)));
	const speed = Math.hypot(p2.x - p.x, p2.y - p.y) / 0.04 / FLY(s);
	const dir = Math.atan2(p2.y - p.y, p2.x - p.x);
	return {p: {x: p.x, y: p.y - 10 * lift * (1 - t)}, t, lift, speed, dir};
};

/** Uscita: i token della risposta corrono verso il punto di luce (le scie sono nel canvas). */
export const exitPos = (f: number, s: number): {ex: number; x: number; y: number} => {
	const ex = prog(f, EXIT + (s % 4) * 0.6, 9, ease.inExpo);
	const slot = ANSWER_SLOTS[s];
	return {ex, x: lerp(slot.x, HUB.x, ex), y: lerp(slot.y, HUB.y, ease.inCubic(clamp(ex * 1.1)))};
};

/** Area RISPOSTA: cornice, token già scelti, cursore. */
export const AnswerArea: React.FC<{f: number; enter: number; exit: number}> = ({f, enter, exit}) => {
	const landed = ANSWER.map((_, s) => f >= landAt(s));
	const nLanded = landed.filter(Boolean).length;
	const done = nLanded === ANSWER.length;
	const doneHit = hit(f, landAt(ANSWER.length - 1), 18);
	// lama di luce sulla risposta completa (sul beat assoluto 660 = relativo 180)
	const sweep = prog(f, 178, 16, ease.inOutSine);
	const h = ANS.bottom - ANS.top;
	// cursore dopo l'ultimo token atterrato
	const last = nLanded > 0 ? ANSWER_SLOTS[nLanded - 1] : null;
	const caret = done
		? {x: (last?.x ?? 0) + tokenWidth(ANSWER[ANSWER.length - 1], ANS.size) / 2 + 16, y: last?.y ?? 0}
		: last
			? {x: last.x + tokenWidth(ANSWER[nLanded - 1], ANS.size) / 2 + 16, y: last.y}
			: {x: ANSWER_SLOTS[0].x - tokenWidth(ANSWER[0], ANS.size) / 2 + 4, y: ANSWER_SLOTS[0].y};
	const blink = Math.floor(f / 8) % 2 === 0 ? 1 : 0.15;

	return (
		<>
			{/* cornice */}
			<div
				style={{
					position: 'absolute',
					left: ANS.x,
					top: ANS.top,
					width: ANS.w,
					height: h,
					borderRadius: 30,
					opacity: enter * (1 - exit),
					background: `linear-gradient(180deg, ${alpha(COLORS.surface, 0.78)} 0%, ${alpha(COLORS.bgSoft, 0.86)} 100%)`,
					border: `1px solid ${alpha(COLORS.orange, 0.22 + 0.5 * doneHit)}`,
					boxShadow: `0 24px 70px rgba(0,0,0,0.6), 0 0 ${30 + 60 * doneHit}px ${alpha(COLORS.orange, 0.08 + 0.3 * doneHit)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: ANS.x + 36,
					top: ANS.labelY - 16,
					height: 32,
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					fontFamily: FONTS.mono,
					fontSize: 24,
					fontWeight: 500,
					letterSpacing: '0.14em',
					color: alpha(COLORS.gray, 0.95),
					opacity: enter * (1 - exit),
				}}
			>
				<span style={{width: 10, height: 10, borderRadius: 3, background: COLORS.orange, boxShadow: `0 0 10px ${COLORS.orange}`}} />
				RISPOSTA
				<span style={{marginLeft: 8, letterSpacing: '0.02em', color: alpha(COLORS.orangeBright, 0.85)}}>
					{nLanded > 0 ? `· ${nLanded} token` : ''}
				</span>
			</div>

			{/* token atterrati */}
			{ANSWER.map((t, s) => {
				if (!landed[s]) return null;
				const L = landAt(s);
				const pop = hit(f, L, s < 2 ? 10 : 6);
				const fresh = s === nLanded - 1 && !done ? 1 : 0;
				const slot = ANSWER_SLOTS[s];
				// uscita: i token corrono verso il centro stirandosi in una linea di luce
				const {ex, x, y} = exitPos(f, s);
				const sw = 1 + 4 * ex;
				const sh = 1 - 0.88 * ex;
				const lit = sweep > 0 && sweep < 1 ? Math.exp(-(((slot.x - lerp(40, 1040, sweep)) / 120) ** 2)) : 0;
				return (
					<div
						key={s}
						style={{
							position: 'absolute',
							left: 0,
							top: 0,
							width: 1080,
							height: 1920,
							transformOrigin: `${x}px ${y}px`,
							transform: ex > 0 ? `scale(${sw}, ${sh})` : undefined,
							opacity: 1 - prog(ex, 0.12, 0.3),
						}}
					>
						<TokenChip
							text={t}
							x={x}
							y={y}
							size={ANS.size}
							glow={0.85 + 0.9 * pop + 0.4 * fresh + 0.8 * doneHit + 1.2 * lit + 1.5 * ex}
							scale={1 + 0.14 * pop}
							active={fresh > 0 || pop > 0.3 || lit > 0.3}
						/>
					</div>
				);
			})}

			{/* cursore */}
			{f >= 30 && f < EXIT ? (
				<div
					style={{
						position: 'absolute',
						left: caret.x - 2,
						top: caret.y - 26,
						width: 4,
						height: 52,
						borderRadius: 2,
						background: COLORS.orangeHot,
						boxShadow: `0 0 12px ${COLORS.orange}`,
						opacity: blink * prog(f, 30, 6) * (done ? 1 - prog(f, 186, 8) : 1),
					}}
				/>
			) : null}
		</>
	);
};

/** Token in volo: sopra al canvas delle luci, così la scia resta dietro al chip. */
export const FlyingChips: React.FC<{f: number}> = ({f}) => (
	<>
		{ANSWER.map((t, s) => {
			const fl = flightAt(f, s);
			if (!fl) return null;
			const stretch = clamp(fl.speed / 200, 0, 1);
			const sc = lerp((PANEL.chipSize / ANS.size) * (1 + 0.32 * fl.lift), 1.06, ease.outCubic(fl.t));
			const deg = (fl.dir * 180) / Math.PI;
			return (
				<div
					key={`fly-${s}`}
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						width: 1080,
						height: 1920,
						transformOrigin: `${fl.p.x}px ${fl.p.y}px`,
						transform: `rotate(${deg}deg) scale(${1 + 0.18 * stretch}, ${1 - 0.06 * stretch}) rotate(${-deg}deg)`,
					}}
				>
					<TokenChip text={t} x={fl.p.x} y={fl.p.y} size={ANS.size} glow={1.6} scale={sc} active />
				</div>
			);
		})}
	</>
);

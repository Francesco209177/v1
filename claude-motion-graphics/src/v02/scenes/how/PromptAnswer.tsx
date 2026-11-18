import React from 'react';
import {clamp, ease, hit, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {ANSWER_FONT, ANSWER_LABEL, ANSWER_LEFT, ANSWER_TEXT_Y, ANSWER_TOKENS, answerSlot, PROMPT_TEXT} from './answer';
import {BOX} from './layout';
import {T} from './timing';

/** Richiesta: compare, si digita, viene "inviata" nella rete (i caratteri si dissolvono in token luminosi). */
export const PromptChip: React.FC<{f: number}> = ({f}) => {
	const b = BOX.prompt;
	const pop = prog(f, T.promptIn, 8, ease.outBack);
	if (pop <= 0) return null;
	const typed = Math.ceil(clamp((f - T.promptIn - 3) / 9) * PROMPT_TEXT.length);
	const send = hit(f, T.promptSend, 10);
	const gone = prog(f, T.promptSend, 8, ease.inCubic); // il testo parte verso la rete
	const ghost = 1 - 0.55 * prog(f, T.promptSend + 6, 10) - 0.45 * prog(f, T.answer - 6, 10);
	const caret = f < T.promptSend && Math.floor(f / 4) % 2 === 0;
	return (
		<div
			style={{
				position: 'absolute',
				left: b.x - b.w / 2,
				top: b.y - b.h / 2,
				width: b.w,
				height: b.h,
				borderRadius: b.h / 2,
				background: alpha(COLORS.surface, 0.92),
				border: `1px solid ${alpha(COLORS.orange, 0.35 + 0.6 * send)}`,
				boxShadow: `0 10px 30px rgba(0,0,0,0.6), 0 0 ${20 + 40 * send}px ${alpha(COLORS.orange, 0.18 + 0.5 * send)}`,
				opacity: clamp(pop * 1.5) * ghost,
				transform: `translateY(${(1 - clamp(pop)) * -14}px) scale(${0.85 + 0.15 * pop - 0.05 * gone})`,
				display: 'flex',
				alignItems: 'center',
				padding: '0 20px',
				gap: 10,
				fontFamily: FONTS.mono,
				fontSize: 24,
				color: COLORS.white,
				whiteSpace: 'nowrap',
			}}
		>
			<span style={{color: COLORS.orange, fontWeight: 700}}>›</span>
			<span>
				{PROMPT_TEXT.split('').map((ch, i) => {
					const vis = i < typed ? 1 : 0;
					// dissoluzione da sinistra a destra all'invio
					const d = clamp((f - T.promptSend - i * 0.35) / 4);
					return (
						<span key={i} style={{opacity: vis * (1 - 0.8 * d), color: d > 0 && d < 1 ? COLORS.orangeHot : undefined}}>
							{ch}
						</span>
					);
				})}
				<span style={{display: 'inline-block', width: 12, height: 26, marginLeft: 2, verticalAlign: -5, background: COLORS.orange, opacity: caret ? 0.9 : 0}} />
			</span>
		</div>
	);
};

/** Risposta: il fumetto si apre sul colpo (frame 150) e i token atterrano uno dopo l'altro. */
export const AnswerBubble: React.FC<{f: number}> = ({f}) => {
	const b = BOX.answer;
	const pop = prog(f, T.answer - 1, 9, ease.outBack);
	if (f < T.answer - 1) return null;
	const flash = hit(f, T.answer, 12);
	const lastLand = answerSlot(ANSWER_TOKENS.length - 1).land;
	const caret = f > lastLand && Math.floor(f / 5) % 2 === 0;
	return (
		<div
			style={{
				position: 'absolute',
				left: b.x - b.w / 2,
				top: b.y - b.h / 2,
				width: b.w,
				height: b.h,
				transformOrigin: '50% 0%',
				transform: `scale(${0.7 + 0.3 * pop}, ${0.5 + 0.5 * pop})`,
				opacity: clamp(pop * 2),
			}}
		>
			{/* codina verso l'uscita della rete */}
			<div style={{position: 'absolute', left: b.w / 2 - 11, top: -10, width: 22, height: 22, transform: 'rotate(45deg)', background: COLORS.surface, borderLeft: `1px solid ${alpha(COLORS.orange, 0.5 + 0.5 * flash)}`, borderTop: `1px solid ${alpha(COLORS.orange, 0.5 + 0.5 * flash)}`}} />
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: 24,
					background: `linear-gradient(180deg, ${alpha(COLORS.surface2, 0.96)} 0%, ${alpha(COLORS.surface, 0.96)} 100%)`,
					border: `1px solid ${alpha(COLORS.orange, 0.45 + 0.55 * flash)}`,
					boxShadow: `0 20px 50px rgba(0,0,0,0.65), 0 0 ${30 + 70 * flash}px ${alpha(COLORS.orange, 0.22 + 0.5 * flash)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
				}}
			/>
			{/* lampo bianco caldo sull'apertura */}
			<div style={{position: 'absolute', inset: 0, borderRadius: 24, background: alpha(COLORS.orangeHot, 0.35 * flash)}} />
			<div
				style={{
					position: 'absolute',
					left: ANSWER_LEFT - (b.x - b.w / 2),
					top: 22,
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					fontFamily: FONTS.mono,
					fontSize: 24,
					fontWeight: 500,
					letterSpacing: '0.14em',
					color: COLORS.orange,
					opacity: prog(f, T.answer, 6),
				}}
			>
				<span style={{width: 10, height: 10, borderRadius: 5, background: COLORS.orange, boxShadow: `0 0 10px ${COLORS.orange}`}} />
				{ANSWER_LABEL}
			</div>
			<div
				style={{
					position: 'absolute',
					left: ANSWER_LEFT - (b.x - b.w / 2),
					top: ANSWER_TEXT_Y - (b.y - b.h / 2) - ANSWER_FONT * 0.62,
					fontFamily: FONTS.body,
					fontSize: ANSWER_FONT,
					fontWeight: 500,
					color: COLORS.white,
					whiteSpace: 'pre',
					letterSpacing: '-0.005em',
				}}
			>
				{ANSWER_TOKENS.map((tok, i) => {
					const s = answerSlot(i);
					const k = prog(f, s.land - 1, 4, ease.outCubic);
					const glow = hit(f, s.land, 6);
					return (
						<span
							key={i}
							style={{
								display: 'inline-block',
								opacity: k,
								transform: `translateY(${(1 - k) * 10}px)`,
								color: glow > 0.3 ? COLORS.orangeHot : COLORS.white,
								textShadow: glow > 0.02 ? `0 0 ${16 * glow}px ${alpha(COLORS.orange, 0.9 * glow)}` : undefined,
							}}
						>
							{tok}
						</span>
					);
				})}
				<span style={{display: 'inline-block', width: 3, height: ANSWER_FONT, marginLeft: 4, verticalAlign: -6, background: COLORS.orange, opacity: caret ? 0.9 : 0}} />
			</div>
		</div>
	);
};

/** Stato del caricamento sotto l'anello: percentuale, poi "modello in memoria" sul beat 105. */
export const LoadStatus: React.FC<{f: number; lp: number}> = ({f, lp}) => {
	const on = prog(f, T.loadStart, 8, ease.outCubic) * (1 - prog(f, T.promptIn + 4, 8, ease.inCubic));
	if (on <= 0.001) return null;
	const done = f >= T.loadEnd;
	const flash = hit(f, T.loadEnd, 12);
	const y = BOX.answer.y - BOX.answer.h / 2 - 34;
	return (
		<div
			style={{
				position: 'absolute',
				left: BOX.answer.x - 260,
				top: y - 24,
				width: 520,
				height: 48,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				opacity: on,
				transform: `translateY(${(1 - on) * 10}px) scale(${1 + 0.06 * flash})`,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					height: 46,
					padding: '0 20px',
					borderRadius: 23,
					background: alpha(COLORS.surface, 0.85),
					border: `1px solid ${alpha(COLORS.orange, 0.25 + 0.6 * flash)}`,
					boxShadow: `0 0 ${10 + 40 * flash}px ${alpha(COLORS.orange, 0.15 + 0.5 * flash)}`,
					fontFamily: FONTS.mono,
					fontSize: 24,
					fontWeight: 500,
					letterSpacing: '0.12em',
					color: done ? COLORS.white : COLORS.gray,
					whiteSpace: 'nowrap',
				}}
			>
				<span style={{width: 10, height: 10, borderRadius: 5, background: COLORS.orange, boxShadow: `0 0 ${8 + 10 * flash}px ${COLORS.orange}`}} />
				{done ? (
					<span>MODELLO IN MEMORIA</span>
				) : (
					<span>
						CARICAMENTO <span style={{color: COLORS.orangeBright}}>{String(Math.round(lp * 100)).padStart(3, '\u2007')}%</span>
					</span>
				)}
			</div>
		</div>
	);
};

import React from 'react';
import {clamp} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';

/**
 * Schermo del laptop nel finale (740×470): stessa interfaccia chat dell'apertura (header con avatar,
 * pillola "Offline", bolla dell'utente arancione, avatar dell'assistente, campo di input), nuova domanda
 * e risposta che continua ad arrivare parola per parola a cavo staccato. Testi ≥ 29 px: sul laptop scalato restano leggibili.
 */
const QUESTION = 'Funzioni anche senza Internet?';
const ANSWER: string[][] = [
	['Sì:', 'il', 'modello', 'è', 'installato'],
	['su', 'questo', 'computer,', 'quindi'],
	['posso', 'rispondere', 'anche', 'offline.'],
];
const WORDS = ANSWER.flat();
const PUNCH_FROM = WORDS.length - 2;
const FONT = 30;
const LINE_H = 43;
const ANSWER_X = 74;
const ANSWER_Y = 160;

/** Frame di comparsa di ogni parola (relativi alla scena): alcune già scritte a inizio scena. */
const wordAt = (i: number): number => -11 + i * 4.4;

export const ScreenChat: React.FC<{f: number}> = ({f}) => {
	let last = -1;
	WORDS.forEach((_, i) => {
		if (f >= wordAt(i)) last = i;
	});
	const streaming = last < WORDS.length - 1;
	const caretOn = streaming || Math.floor(f / 7) % 2 === 0;
	let j = 0;
	return (
		<div style={{position: 'absolute', inset: 0, fontFamily: FONTS.body, color: COLORS.white}}>
			{/* header */}
			<div style={{position: 'absolute', left: 0, top: 0, right: 0, height: 66, borderBottom: `1.5px solid ${alpha(COLORS.white, 0.08)}`, background: alpha(COLORS.white, 0.025)}}>
				<div
					style={{
						position: 'absolute',
						left: 24,
						top: 16,
						width: 34,
						height: 34,
						borderRadius: 17,
						background: `radial-gradient(circle at 35% 30%, ${COLORS.orangeHot} 0%, ${COLORS.orange} 45%, ${COLORS.orangeDeep} 100%)`,
						boxShadow: `0 0 14px ${alpha(COLORS.orange, 0.6)}`,
					}}
				>
					<div style={{position: 'absolute', left: 10, top: 10, width: 14, height: 14, borderRadius: 7, border: `2.5px solid ${alpha(COLORS.white, 0.9)}`, boxSizing: 'border-box'}} />
				</div>
				<div style={{position: 'absolute', left: 72, top: 0, height: 66, display: 'flex', alignItems: 'center', fontWeight: 600, fontSize: 29, letterSpacing: '-0.01em'}}>Assistente AI</div>
				{/* pillola di stato: anello vuoto = nessuna connessione */}
				<div
					style={{
						position: 'absolute',
						right: 24,
						top: 10,
						height: 46,
						padding: '0 18px 0 14px',
						borderRadius: 23,
						display: 'flex',
						alignItems: 'center',
						gap: 11,
						background: alpha(COLORS.white, 0.05),
						border: `1.5px solid ${alpha(COLORS.white, 0.28)}`,
						fontWeight: 600,
						fontSize: 29,
						color: alpha(COLORS.white, 0.86),
						whiteSpace: 'nowrap',
					}}
				>
					<div style={{width: 15, height: 15, borderRadius: 8, boxSizing: 'border-box', border: `2.5px solid ${COLORS.gray}`}} />
					Offline
				</div>
			</div>

			{/* messaggio dell'utente */}
			<div
				style={{
					position: 'absolute',
					right: 24,
					top: 86,
					height: 54,
					padding: '0 22px',
					borderRadius: '22px 22px 6px 22px',
					display: 'flex',
					alignItems: 'center',
					background: `linear-gradient(180deg, ${alpha(COLORS.orange, 0.26)}, ${alpha(COLORS.orangeDeep, 0.22)})`,
					border: `1.5px solid ${alpha(COLORS.orange, 0.4)}`,
					fontWeight: 500,
					fontSize: 29,
					whiteSpace: 'nowrap',
				}}
			>
				{QUESTION}
			</div>

			{/* avatar dell'assistente */}
			<div style={{position: 'absolute', left: 26, top: ANSWER_Y + 6, width: 30, height: 30, borderRadius: 15, border: `2px solid ${alpha(COLORS.orange, 0.8)}`, boxSizing: 'border-box'}}>
				<div style={{position: 'absolute', left: 7, top: 7, width: 12, height: 12, borderRadius: 6, background: COLORS.orangeBright, boxShadow: `0 0 10px ${COLORS.orange}`}} />
			</div>

			{/* risposta in streaming */}
			{ANSWER.map((line, li) => (
				<div
					key={li}
					style={{
						position: 'absolute',
						left: ANSWER_X,
						top: ANSWER_Y + li * LINE_H,
						height: LINE_H,
						display: 'flex',
						alignItems: 'center',
						gap: FONT * 0.28,
						whiteSpace: 'nowrap',
						fontSize: FONT,
						lineHeight: `${LINE_H}px`,
					}}
				>
					{line.map((w) => {
						const i = j++;
						const vis = clamp((f - wordAt(i) + 1) / 3);
						if (vis <= 0) return null;
						const punch = i >= PUNCH_FROM;
						return (
							<span
								key={i}
								style={{
									position: 'relative',
									display: 'inline-block',
									fontWeight: punch ? 600 : 400,
									color: punch ? COLORS.orangeBright : alpha(COLORS.white, 0.93),
									textShadow: punch ? `0 0 18px ${alpha(COLORS.orange, 0.55)}` : undefined,
									opacity: vis,
									transform: `translateY(${(1 - vis) * 6}px)`,
									filter: vis < 1 ? `blur(${(1 - vis) * 4}px)` : undefined,
								}}
							>
								{w}
								{i === last ? (
									<span
										style={{
											position: 'absolute',
											left: '100%',
											top: '50%',
											marginLeft: 10,
											marginTop: -7,
											width: 14,
											height: 14,
											borderRadius: 7,
											background: COLORS.orangeBright,
											boxShadow: `0 0 12px ${COLORS.orange}`,
											opacity: caretOn ? 1 : 0.25,
										}}
									/>
								) : null}
							</span>
						);
					})}
				</div>
			))}

			{/* campo di input */}
			<div
				style={{
					position: 'absolute',
					left: 22,
					right: 22,
					top: 394,
					height: 56,
					borderRadius: 28,
					border: `1.5px solid ${alpha(COLORS.white, 0.12)}`,
					background: alpha(COLORS.white, 0.03),
					display: 'flex',
					alignItems: 'center',
					padding: '0 10px 0 24px',
					fontSize: 27,
					color: alpha(COLORS.white, 0.42),
				}}
			>
				<div style={{flex: 1}}>Scrivi un messaggio…</div>
				<div style={{width: 40, height: 40, borderRadius: 20, background: alpha(COLORS.orange, 0.85), display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
					<svg width={20} height={20} viewBox="0 0 20 20">
						<path d="M10 16 V4 M4.5 9.5 L10 4 L15.5 9.5" stroke={COLORS.white} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				</div>
			</div>
		</div>
	);
};

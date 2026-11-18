import React from 'react';
import {clamp, ease, hash, invLerp} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {LAPTOP} from '../../components/Laptop';
import {ANSWER, DIVE, PUNCH_FROM, QUESTION, UNPLUG, wordAt} from './timing';

/** Metriche del layout dello schermo (740×470): servono anche alle particelle del tuffo. */
export const CHAT = {
	answerX: 74,
	answerY: 160,
	lineH: 40,
	font: 28,
	charW: 28 * 0.5,
	spaceW: 28 * 0.28,
} as const;

/** Suddivisione "da tokenizer" di alcune parole (solo estetica nel momento del tuffo). */
const SPLIT: Record<string, string[]> = {
	modello: ['model', 'lo'],
	installato: ['install', 'ato'],
	'computer:': ['comp', 'uter:'],
	hardware: ['hard', 'ware'],
	generare: ['gener', 'are'],
	'risposta,': ['rispost', 'a,'],
	'connessione.': ['conn', 'essione.'],
};

/** Centro approssimato (coordinate schermo) di ogni parola della risposta. */
export const wordBoxes = (): {x: number; y: number; w: number; h: number; i: number}[] => {
	const out: {x: number; y: number; w: number; h: number; i: number}[] = [];
	let i = 0;
	ANSWER.forEach((line, li) => {
		let x = CHAT.answerX;
		for (const w of line) {
			const width = w.length * CHAT.charW * (i >= PUNCH_FROM ? 1.04 : 1);
			out.push({x, y: CHAT.answerY + li * CHAT.lineH + 6, w: width, h: CHAT.lineH - 12, i});
			x += width + CHAT.spaceW;
			i++;
		}
	});
	return out;
};

const StatusPill: React.FC<{f: number}> = ({f}) => {
	const off = f >= UNPLUG;
	const g = f - UNPLUG;
	// micro glitch: spostamenti a scatti per ~7 frame
	const glitch = off && g < 8 ? 1 - g / 8 : 0;
	const jx = glitch > 0 ? (hash(f, 3) - 0.5) * 18 * glitch : 0;
	const pulse = 0.5 + 0.5 * Math.sin(f / 4);
	const pill = (dx: number, color: string | null, op: number): React.ReactNode => (
		<div
			style={{
				position: 'absolute',
				right: 0,
				top: 0,
				height: 44,
				padding: '0 18px 0 14px',
				borderRadius: 22,
				display: 'flex',
				alignItems: 'center',
				gap: 11,
				transform: `translateX(${dx}px)`,
				opacity: op,
				background: color ? 'transparent' : off ? alpha(COLORS.white, 0.05) : alpha(COLORS.orange, 0.16),
				border: `1.5px solid ${color ?? (off ? alpha(COLORS.white, 0.28) : alpha(COLORS.orange, 0.6))}`,
				fontFamily: FONTS.body,
				fontWeight: 600,
				fontSize: 27,
				letterSpacing: '0.01em',
				color: color ?? (off ? alpha(COLORS.white, 0.86) : COLORS.orangeHot),
				whiteSpace: 'nowrap',
			}}
		>
			<div
				style={{
					width: 14,
					height: 14,
					borderRadius: 7,
					boxSizing: 'border-box',
					background: off ? 'transparent' : COLORS.orangeBright,
					border: off ? `2.5px solid ${color ?? COLORS.gray}` : 'none',
					boxShadow: off ? 'none' : `0 0 ${8 + 8 * pulse}px ${COLORS.orange}`,
				}}
			/>
			{off ? 'Offline' : 'Online'}
		</div>
	);
	return (
		<div style={{position: 'absolute', right: 24, top: 11, width: 170, height: 44}}>
			{glitch > 0 ? pill(-jx * 1.6 - 6 * glitch, alpha(COLORS.orange, 0.9), 0.6 * glitch) : null}
			{glitch > 0 ? pill(jx * 1.2 + 5 * glitch, alpha(COLORS.white, 0.7), 0.45 * glitch) : null}
			{pill(jx, null, glitch > 0 && g % 3 === 1 ? 0.35 : 1)}
		</div>
	);
};

/** Interfaccia chat (contenuto dello schermo del laptop): streaming parola per parola, offline, tuffo. */
export const ChatScreen: React.FC<{f: number}> = ({f}) => {
	const W = LAPTOP.screenW;
	const H = LAPTOP.screenH;
	// tuffo: tokenizzazione (70–90), poi esplosione verso la camera (90–104)
	const tok = (j: number) => ease.outCubic(clamp((f - 70 - j * 0.55) / 5));
	const boom = (j: number) => ease.inCubic(clamp((f - DIVE - j * 0.22) / 13));
	const uiOut = ease.inCubic(invLerp(DIVE - 2, DIVE + 8, f));
	const light = ease.inOutSine(invLerp(DIVE, 101, f));
	// glitch dello schermo allo strappo
	const g = f - UNPLUG;
	const flick = g >= 0 && g < 6 ? [0.32, 0, 0.18, 0.05, 0.12, 0][g] : 0;
	const tearY = 60 + hash(f, 9) * 340;

	const boxes = wordBoxes();
	let lastVisible = -1;
	boxes.forEach((b) => {
		if (f >= wordAt(b.i)) lastVisible = b.i;
	});
	const streaming = lastVisible < boxes.length - 1;
	const caretOn = streaming || Math.floor(f / 7) % 2 === 0;

	let j = 0;
	return (
		<div style={{position: 'absolute', inset: 0, fontFamily: FONTS.body, color: COLORS.white}}>
			{/* header */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: W,
					height: 66,
					borderBottom: `1.5px solid ${alpha(COLORS.white, 0.08)}`,
					background: alpha(COLORS.white, 0.025),
					transform: `translateY(${-90 * uiOut}px)`,
					opacity: 1 - uiOut,
				}}
			>
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
				<div style={{position: 'absolute', left: 72, top: 0, height: 66, display: 'flex', alignItems: 'center', fontWeight: 600, fontSize: 27, letterSpacing: '-0.01em'}}>
					Assistente AI
				</div>
				<StatusPill f={f} />
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
					fontSize: 27,
					whiteSpace: 'nowrap',
					transform: `translate(${60 * uiOut}px, ${-40 * uiOut}px) scale(${1 + 0.3 * uiOut})`,
					opacity: 1 - uiOut,
				}}
			>
				{QUESTION}
			</div>

			{/* avatar dell'assistente */}
			<div
				style={{
					position: 'absolute',
					left: 26,
					top: CHAT.answerY + 4,
					width: 30,
					height: 30,
					borderRadius: 15,
					border: `2px solid ${alpha(COLORS.orange, 0.8)}`,
					boxSizing: 'border-box',
					opacity: 1 - uiOut,
				}}
			>
				<div style={{position: 'absolute', left: 7, top: 7, width: 12, height: 12, borderRadius: 6, background: COLORS.orangeBright, boxShadow: `0 0 10px ${COLORS.orange}`}} />
			</div>

			{/* risposta in streaming */}
			{ANSWER.map((line, li) => (
				<div
					key={li}
					style={{
						position: 'absolute',
						left: CHAT.answerX,
						top: CHAT.answerY + li * CHAT.lineH,
						height: CHAT.lineH,
						display: 'flex',
						alignItems: 'center',
						gap: CHAT.spaceW,
						whiteSpace: 'nowrap',
						fontSize: CHAT.font,
						lineHeight: `${CHAT.lineH}px`,
					}}
				>
					{line.map((w) => {
						const i = j++;
						const at = wordAt(i);
						const vis = clamp((f - at + 1) / 3);
						const punch = i >= PUNCH_FROM;
						const t = tok(i);
						const b = boom(i);
						const box = boxes[i];
						const dx = box.x + box.w / 2 - W / 2;
						const dy = box.y + box.h / 2 - H / 2;
						const len = Math.hypot(dx, dy) || 1;
						const push = 40 + 520 * b;
						const tokens = SPLIT[w] ?? [w];
						return (
							<span
								key={i}
								style={{
									position: 'relative',
									display: 'inline-block',
									fontWeight: punch ? 600 : 400,
									color: punch ? COLORS.orangeBright : alpha(COLORS.white, 0.93),
									textShadow: punch ? `0 0 18px ${alpha(COLORS.orange, 0.55)}` : undefined,
									opacity: vis * (1 - clamp(b * 2.6)),
									transform: `translate(${(dx / len) * push * b + (1 - vis) * 0}px, ${(dy / len) * push * b + (1 - vis) * 6}px) scale(${1 + 0.9 * b})`,
									filter: vis < 1 ? `blur(${(1 - vis) * 4}px)` : undefined,
								}}
							>
								{tokens.map((tk, k) => (
									<span
										key={k}
										style={{
											display: 'inline-block',
											padding: '0 2px',
											margin: '0 -2px',
											borderRadius: 7,
											background: t > 0 ? alpha((i + k) % 2 ? COLORS.orange : COLORS.orangeBright, (0.16 + 0.1 * ((i + k) % 2)) * t + 0.2 * b) : undefined,
											boxShadow: t > 0 ? `inset 0 0 0 1.5px ${alpha(COLORS.orangeBright, 0.6 * t)}, 0 0 ${16 * t}px ${alpha(COLORS.orange, 0.35 * t)}` : undefined,
										}}
									>
										{tk}
									</span>
								))}
								{i === lastVisible && f < DIVE - 4 ? (
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
					fontSize: 26,
					color: alpha(COLORS.white, 0.38),
					transform: `translateY(${90 * uiOut}px)`,
					opacity: 1 - uiOut,
				}}
			>
				<div style={{flex: 1}}>Scrivi un messaggio…</div>
				<div style={{width: 40, height: 40, borderRadius: 20, background: alpha(COLORS.orange, 0.85), display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
					<svg width={20} height={20} viewBox="0 0 20 20">
						<path d="M10 16 V4 M4.5 9.5 L10 4 L15.5 9.5" stroke={COLORS.white} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				</div>
			</div>

			{/* glitch allo strappo: flicker + linea di strappo */}
			{flick > 0 ? <div style={{position: 'absolute', inset: 0, background: `rgba(5,5,5,${flick})`}} /> : null}
			{g >= 0 && g < 5 ? (
				<div
					style={{
						position: 'absolute',
						left: 0,
						width: W,
						top: tearY,
						height: 10 + hash(f, 4) * 18,
						background: `linear-gradient(90deg, ${alpha(COLORS.orangeHot, 0)}, ${alpha(COLORS.orangeHot, 0.22)}, ${alpha(COLORS.white, 0.1)}, ${alpha(COLORS.orangeHot, 0)})`,
						transform: `translateX(${(hash(f, 5) - 0.5) * 60}px)`,
					}}
				/>
			) : null}

			{/* luce del tuffo: lo schermo diventa luce */}
			{light > 0 ? (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						background: `radial-gradient(${30 + 60 * light}% ${30 + 70 * light}% at 50% 50%, rgba(255,246,238,${light}) 0%, rgba(255,214,190,${0.95 * light}) 40%, rgba(240,147,111,${0.9 * light}) 75%, rgba(217,119,87,${0.7 * light}) 100%)`,
					}}
				/>
			) : null}
		</div>
	);
};

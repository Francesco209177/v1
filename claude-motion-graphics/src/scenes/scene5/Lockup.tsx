import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Caption} from '../../components/Caption';
import {useAbsFrame} from '../../lib/frame';
import {clamp, ease, prog} from '../../lib/math';
import {alpha, COLORS, FONTS} from '../../theme';
import {CUES, WIDTH} from '../../timeline';
import {T} from './motion';

/**
 * LOCKUP — il logo stilizzato "Claude Code": wordmark + cursore a blocco (omaggio al terminale),
 * filetto e payoff. Lo spark sopra completa il marchio (vedi Scene5Outro).
 */
const WORD = 'Claude Code';
const SIZE = 124;
const WORD_Y = 990; // centro dell'altezza delle maiuscole
const DIVIDER_Y = 1092;
const TAGLINE_Y = 1215;
const CURSOR = {w: 44, h: Math.round(SIZE * 0.7), gap: 20}; // alto quanto le maiuscole, poggia sulla linea di base
/** Compensazione ottica: il cursore pesa meno delle lettere, quindi il gruppo si sposta un filo a destra. */
const OPTICAL_SHIFT = 5;

const LETTER_STAGGER = 0.8;
const LETTER_RISE = 11;
const REVEAL_END = T.wordIn + (WORD.length - 1) * LETTER_STAGGER + LETTER_RISE;

/** Il cursore si spegne e si riaccende ESATTAMENTE sui beat (periodo 30 frame), con dissolvenza di 2 frame. */
const BLINK_FROM = CUES.lockup + 30; // primo spegnimento: assoluto 810 (beat)
const GHOST = 0.16; // da "spento" resta un'ombra: il logo non perde equilibrio
const cursorLevel = (abs: number): number => {
	if (abs < BLINK_FROM) return 1;
	const ph = (abs - BLINK_FROM) % 30;
	const on = ph < 15 ? 1 - clamp((ph + 1) / 2) : clamp((ph - 14) / 2);
	return GHOST + (1 - GHOST) * on;
};

const lineStyle: React.CSSProperties = {
	position: 'absolute',
	left: 0,
	width: WIDTH,
	top: WORD_Y - SIZE / 2,
	height: SIZE,
	lineHeight: `${SIZE}px`,
	textAlign: 'center',
	whiteSpace: 'pre',
	fontFamily: FONTS.display,
	fontWeight: 700,
	fontSize: SIZE,
	letterSpacing: '-0.03em',
	transform: `translateX(${OPTICAL_SHIFT}px)`,
};

/** Segnaposto invisibile del cursore: tiene identico l'allineamento dei livelli sovrapposti. */
const cursorBox: React.CSSProperties = {
	display: 'inline-block',
	width: CURSOR.w,
	height: CURSOR.h,
	marginLeft: CURSOR.gap,
	verticalAlign: 'baseline',
	borderRadius: 6,
};

const Wordmark: React.FC = () => {
	const frame = useCurrentFrame();
	const abs = useAbsFrame();
	if (frame < T.wordIn) return null;

	const revealing = frame < REVEAL_END + 1;
	const cursorIn = prog(frame, T.cursorIn, 7, ease.outBack);
	const level = cursorLevel(abs) * clamp((frame - T.cursorIn) / 2);

	// passaggio di luce: una banda calda attraversa le lettere da sinistra a destra
	const sweeping = frame >= T.sweepIn && frame <= T.sweepOut;
	const band = -220 + (WIDTH + 440) * ease.inOutSine(clamp((frame - T.sweepIn) / (T.sweepOut - T.sweepIn)));
	const bandMask = (half: number) =>
		`linear-gradient(100deg, transparent ${band - half}px, #000 ${band}px, transparent ${band + half}px)`;
	// il cursore prende luce quando la banda lo raggiunge
	const glint = sweeping ? Math.exp(-(((band - 960) / 120) ** 2)) : 0;

	return (
		<>
			<div style={{...lineStyle, color: COLORS.white, textShadow: `0 2px 30px rgba(0,0,0,0.6), 0 0 70px ${alpha(COLORS.orange, 0.2)}`}}>
				{/* maschera: le lettere salgono da sotto la linea di base (clip-path non altera la baseline) */}
				<span style={{display: 'inline-block', clipPath: revealing ? 'inset(-40px -40px 0px -40px)' : undefined}}>
					{WORD.split('').map((ch, i) => {
						const p = prog(frame, T.wordIn + i * LETTER_STAGGER, LETTER_RISE, ease.outQuint);
						return (
							<span key={i} style={{position: 'relative', top: (1 - p) * SIZE * 0.98, opacity: clamp(p * 3)}}>
								{ch}
							</span>
						);
					})}
				</span>
				<span
					style={{
						...cursorBox,
						background: COLORS.orange,
						opacity: level,
						transform: `scaleY(${cursorIn})`,
						transformOrigin: '50% 100%',
						boxShadow: `0 0 ${16 + 20 * glint}px ${alpha(COLORS.orange, 0.55 * level)}, 0 0 54px ${alpha(COLORS.orange, (0.3 + 0.3 * glint) * level)}`,
						filter: glint > 0.01 ? `brightness(${1 + 0.35 * glint})` : undefined,
					}}
				/>
			</div>
			{sweeping ? (
				<>
					{/* alone della banda di luce */}
					<div style={{...lineStyle, color: COLORS.orange, filter: 'blur(14px)', opacity: 0.9, WebkitMaskImage: bandMask(210), maskImage: bandMask(210)}}>
						{WORD}
						<span style={cursorBox} />
					</div>
					{/* le lettere si tingono di arancio chiaro dove passa la luce */}
					<div style={{...lineStyle, color: COLORS.orangeHot, WebkitMaskImage: bandMask(120), maskImage: bandMask(120)}}>
						{WORD}
						<span style={cursorBox} />
					</div>
				</>
			) : null}
		</>
	);
};

/** Filetto sottile: nasce dal centro e si apre verso i lati. */
const Divider: React.FC = () => {
	const frame = useCurrentFrame();
	const p = prog(frame, T.dividerIn, 14, ease.outQuint);
	if (p <= 0) return null;
	const w = 240 * p;
	return (
		<>
			<div
				style={{
					position: 'absolute',
					left: WIDTH / 2 - w * 0.9,
					top: DIVIDER_Y - 14,
					width: w * 1.8,
					height: 28,
					background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.2 * p)} 0%, ${alpha(COLORS.orange, 0)} 100%)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: WIDTH / 2 - w / 2,
					top: DIVIDER_Y - 1.5,
					width: w,
					height: 3,
					borderRadius: 2,
					background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0)} 0%, ${COLORS.orange} 32%, ${COLORS.orangeBright} 50%, ${COLORS.orange} 68%, ${alpha(COLORS.orange, 0)} 100%)`,
					opacity: clamp(p * 2),
				}}
			/>
		</>
	);
};

export const Lockup: React.FC = () => (
	<>
		<Wordmark />
		<Divider />
		<Caption
			text={"Il tuo studio di motion graphics,\nalimentato dall'AI."}
			highlight={["dall'AI."]}
			y={TAGLINE_Y}
			size={52}
			weight={500}
			scrim={false}
			inAt={T.taglineIn}
			stagger={3}
			outAt={9999}
		/>
	</>
);

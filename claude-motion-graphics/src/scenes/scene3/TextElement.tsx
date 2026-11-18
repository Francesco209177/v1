import React from 'react';
import {clamp, ease, hit, prog} from '../../lib/math';
import {alpha, COLORS, FONTS, textGlow} from '../../theme';
import {beatStep, BORN, IGNITE} from './timing';

const LETTERS = ['C', 'i', 'a', 'o', '!'];
export const TEXT_SIZE = 188;

/**
 * <Testo animato>Ciao!</Testo> — tipografia cinetica. Nascita: le lettere scattano in posa sfalsate.
 * Dopo il tocco dello spark si accendono di arancione una a una, saltano sul beat,
 * compaiono gli "echi" a contorno e la sottolineatura si traccia da sola.
 */
export const TextElement: React.FC<{frame: number; lit: number; tempo: number}> = ({frame: f, lit, tempo}) => {
	const born = BORN.T;
	const every = tempo > 1 ? 7.5 : 15;
	const step = f >= IGNITE.T ? beatStep(f, tempo > 1 ? 150 : IGNITE.T, every) : null;
	// eco: si apre sul beat e si richiude
	const echo = step ? Math.sin(Math.PI * clamp(step.t / (every * 0.8))) : 0;

	const word = (style: React.CSSProperties, letter: (i: number) => React.CSSProperties, key: string) => (
		<div
			key={key}
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				transform: 'translate(-50%, -50%)',
				display: 'flex',
				alignItems: 'baseline',
				whiteSpace: 'nowrap',
				fontFamily: FONTS.display,
				fontWeight: 700,
				fontSize: TEXT_SIZE,
				lineHeight: 1,
				letterSpacing: '-0.03em',
				...style,
			}}
		>
			{LETTERS.map((ch, i) => (
				<span key={i} style={{display: 'inline-block', ...letter(i)}}>
					{ch}
				</span>
			))}
		</div>
	);

	const motion = (i: number): {y: number; rot: number; s: number} => {
		// entrata: scatto dal basso con overshoot, 2 frame tra una lettera e l'altra
		const p = clamp((f - born - i * 1.6) / 10);
		const pop = ease.outBack(p);
		let y = (1 - pop) * 70 + 5 * Math.sin(f / 9 + i * 0.8);
		let rot = (1 - pop) * (i % 2 === 0 ? -9 : 9);
		let s = 0.55 + 0.45 * pop;
		if (step) {
			// salto sul beat, a onda
			const t = clamp((step.t - i * 1.1) / (every * 0.6));
			const jump = Math.sin(Math.PI * t);
			y -= 46 * jump;
			rot += (i % 2 === 0 ? 5 : -5) * jump;
			s *= 1 + 0.08 * jump;
		}
		return {y, rot, s};
	};

	const underline = prog(f, IGNITE.T + 2, 12, ease.outQuint);
	return (
		<>
			{/* echi a contorno (solo da acceso) */}
			{lit > 0.01
				? [2, 1].map((e) =>
						word(
							{color: 'transparent', WebkitTextStroke: `2.5px ${alpha(COLORS.orange, 0.5 / e)}`, opacity: lit},
							(i) => {
								const m = motion(i);
								return {transform: `translateY(${m.y + e * 30 * echo}px) rotate(${m.rot}deg) scale(${m.s})`};
							},
							`echo${e}`,
						),
					)
				: null}
			{word(
				{},
				(i) => {
					const m = motion(i);
					const li = prog(f, IGNITE.T + i * 1.6, 5, ease.outCubic);
					const flash = hit(f, IGNITE.T + i * 1.6, 7);
					return {
						transform: `translateY(${m.y}px) rotate(${m.rot}deg) scale(${m.s})`,
						opacity: clamp(((f - born - i * 1.6) / 10) * 3),
						color: li > 0.5 ? (flash > 0.45 ? COLORS.orangeHot : COLORS.orange) : COLORS.white,
						textShadow: li > 0.5 ? textGlow(COLORS.orange, 0.9 + flash) : '0 4px 40px rgba(0,0,0,0.6)',
					};
				},
				'main',
			)}
			{/* sottolineatura che si traccia */}
			<div
				style={{
					position: 'absolute',
					left: -210,
					top: 92,
					width: 420,
					height: 12,
					borderRadius: 6,
					background: `linear-gradient(90deg, ${COLORS.orange}, ${COLORS.orangeBright})`,
					transformOrigin: '0% 50%',
					transform: `scaleX(${underline})`,
					opacity: lit,
					boxShadow: `0 0 26px ${alpha(COLORS.orange, 0.6)}`,
				}}
			/>
		</>
	);
};

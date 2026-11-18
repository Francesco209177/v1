import React from 'react';
import {clamp, ease, lerp, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {CH, condenseP, rowY, T} from './layout';

const LABEL_Y = 272;

/** Freccia disegnata (il glifo → non è nel sottoinsieme latino di JetBrains Mono). */
const Arrow: React.FC<{color: string}> = ({color}) => (
	<svg width={34} height={18} viewBox="0 0 34 18" style={{display: 'block'}}>
		<path d="M2 9 H30 M22 2.5 L30 9 L22 15.5" stroke={color} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

/** Etichetta HUD mono: entra con una tendina da sinistra, esce verso l'alto. */
const HudLabel: React.FC<{y: number; inAt: number; outAt: number; f: number; beatHit: number; children: React.ReactNode}> = ({
	y,
	inAt,
	outAt,
	f,
	beatHit,
	children,
}) => {
	const inP = prog(f, inAt, 12, ease.outCubic);
	const outP = prog(f, outAt, 8, ease.inCubic);
	if (inP <= 0 || outP >= 1) return null;
	return (
		<div
			style={{
				position: 'absolute',
				left: 60,
				right: 60,
				top: y - 22,
				height: 44,
				display: 'flex',
				justifyContent: 'center',
				opacity: clamp(inP * 2) * (1 - outP),
				transform: `translateY(${(1 - inP) * 12 - outP * 16}px)`,
				filter: outP > 0 ? `blur(${outP * 6}px)` : undefined,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 14,
					fontFamily: FONTS.mono,
					fontSize: 26,
					fontWeight: 500,
					letterSpacing: '0.14em',
					textTransform: 'uppercase',
					color: COLORS.white,
					whiteSpace: 'nowrap',
					clipPath: `inset(-20px ${(1 - inP) * 100}% -20px -20px)`,
				}}
			>
				<span
					style={{
						width: 12,
						height: 12,
						borderRadius: 2,
						background: COLORS.orange,
						boxShadow: `0 0 ${10 + 16 * beatHit}px ${alpha(COLORS.orange, 0.6 + 0.4 * beatHit)}`,
					}}
				/>
				{children}
			</div>
		</div>
	);
};

const Dot: React.FC = () => <span style={{color: COLORS.grayDim}}>·</span>;

/** Etichette dei due momenti + nota "esempio illustrativo" (numeri e pesi non sono di un modello reale). */
export const Labels: React.FC<{f: number; beat: number}> = ({f, beat}) => {
	const noteIn = prog(f, 56, 10, ease.outCubic);
	const noteOut = prog(f, T.process, 8, ease.inCubic);
	const noteY = rowY(f, 1) + CH / 2 + lerp(306, 66, condenseP(f));
	return (
		<>
			<HudLabel y={LABEL_Y} inAt={T.vectors - 1} outAt={T.condense + 1} f={f} beatHit={beat}>
				<span style={{color: COLORS.orangeBright}}>Embedding</span>
				<Dot />
				<span>ogni token</span>
				<Arrow color={COLORS.orangeBright} />
				<span>numeri</span>
			</HudLabel>
			<HudLabel y={LABEL_Y} inAt={T.attention - 1} outAt={T.process} f={f} beatHit={beat}>
				<span style={{color: COLORS.orangeBright}}>Attenzione</span>
				<Dot />
				<span>quali parole contano di più</span>
			</HudLabel>
			{noteIn > 0 && noteOut < 1 ? (
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: noteY - 16,
						height: 32,
						textAlign: 'center',
						fontFamily: FONTS.mono,
						fontSize: 24,
						letterSpacing: '0.14em',
						textTransform: 'uppercase',
						color: alpha(COLORS.gray, 0.8),
						opacity: noteIn * (1 - noteOut),
					}}
				>
					esempio illustrativo
				</div>
			) : null}
		</>
	);
};

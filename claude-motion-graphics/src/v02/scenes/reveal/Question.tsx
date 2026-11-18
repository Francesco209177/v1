import React from 'react';
import {useAbsFrame} from '../../../lib/frame';
import {beatPulse, clamp, ease, hit, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS, textGlow} from '../../../theme';
import {WIDTH} from '../../../timeline';
import {LAYOUT, R} from './timing';

const WORDS = ['Tu', 'la', 'useresti?'];
const SIZE = 118;

/**
 * Domanda finale "Tu la useresti?" (cue assoluto 855): parole che salgono da una maschera,
 * bagliore caldo che pulsa sul beat e cursore arancione lampeggiante (invito a rispondere nei commenti).
 * Resta a schermo fino all'ultimo frame: cartello finale composto, senza dissolvenza al nero.
 */
export const Question: React.FC<{f: number}> = ({f}) => {
	const abs = useAbsFrame();
	const d = f - R.question;
	if (d < -8) return null;
	const flash = hit(f, R.question, 14);
	const pulse = beatPulse(abs, 4);
	const H = SIZE * 1.3;
	const breathe = 1 + 0.015 * clamp(d / 45);
	const lastIn = prog(d, 4, 12, ease.outQuint);
	// cursore: acceso 9 frame su 15, a tempo con il beat (dopo che la parola è atterrata)
	const caretOn = d >= 10 && ((abs % 15) + 15) % 15 < 9;
	return (
		<div style={{position: 'absolute', left: 0, top: 0, width: WIDTH, height: 1920, transformOrigin: `540px ${LAYOUT.questionY}px`, transform: `scale(${breathe})`}}>
			{/* alone caldo che respira sul beat */}
			<div
				style={{
					position: 'absolute',
					left: 60,
					width: WIDTH - 120,
					top: LAYOUT.questionY - 190,
					height: 380,
					background: `radial-gradient(closest-side, ${alpha(COLORS.orange, (0.14 + 0.06 * pulse + 0.3 * flash) * prog(d, -2, 8))}, ${alpha(COLORS.orangeDeep, 0)})`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: 0,
					width: WIDTH,
					top: LAYOUT.questionY - H / 2,
					height: H,
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					gap: `0 ${SIZE * 0.24}px`,
					fontFamily: FONTS.display,
					fontWeight: 700,
					fontSize: SIZE,
					lineHeight: `${H}px`,
					letterSpacing: '-0.025em',
					whiteSpace: 'nowrap',
				}}
			>
				{WORDS.map((w, i) => {
					const p = prog(d, -7 + i * 3, 12, ease.outQuint);
					const last = i === WORDS.length - 1;
					return (
						<span key={i} style={{display: 'inline-block', overflow: p < 1 ? 'hidden' : 'visible', height: H, padding: '0 0.04em', margin: '0 -0.04em'}}>
							<span
								style={{
									display: 'inline-block',
									transform: `translateY(${(1 - p) * H * 0.9}px)`,
									color: COLORS.white,
									textShadow: `0 4px 30px rgba(0,0,0,0.6), ${textGlow(COLORS.orange, 0.3 + 0.9 * flash + 0.12 * pulse)}`,
								}}
							>
								{last ? (
									<>
										{w.slice(0, -1)}
										<span style={{color: COLORS.orange, textShadow: textGlow(COLORS.orange, 0.9 + 0.4 * pulse)}}>?</span>
									</>
								) : (
									w
								)}
							</span>
						</span>
					);
				})}
				<span
					style={{
						display: 'inline-block',
						width: SIZE * 0.085,
						height: SIZE * 0.82,
						marginLeft: SIZE * -0.1,
						borderRadius: 4,
						background: COLORS.orange,
						boxShadow: `0 0 18px ${COLORS.orange}, 0 0 44px ${alpha(COLORS.orange, 0.5)}`,
						opacity: caretOn ? lastIn : 0,
					}}
				/>
			</div>
		</div>
	);
};

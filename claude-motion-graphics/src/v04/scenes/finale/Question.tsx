import React from 'react';
import {useAbsFrame} from '../../../lib/frame';
import {beatPulse, clamp, ease, hit, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4, glow4} from '../../theme';
import {F, FL} from './timing';

const SIZE = 122;
type QLine = {words: {t: string; accent?: boolean}[]};
const QLINES: QLine[] = [{words: [{t: 'Tu'}, {t: 'avresti'}]}, {words: [{t: 'riconosciuto'}]}, {words: [{t: 'la'}, {t: 'truffa?', accent: true}]}];

/**
 * Domanda finale "Tu avresti riconosciuto la truffa?" (cue 840): tre righe che salgono da una maschera
 * (la prima atterra esattamente sul cue), "truffa?" in verde con bagliore e cursore lampeggiante sul beat.
 * Resta fino all'ultimo frame: cartello finale composto, senza dissolvenza al nero.
 */
export const Question: React.FC<{f: number}> = ({f}) => {
	const abs = useAbsFrame();
	const d = f - F.question;
	if (d < -10) return null;
	const beat = beatPulse(abs, 4);
	const flash = hit(f, F.question, 14);
	const H = SIZE * 1.24;
	const breathe = 1 + 0.014 * ease.inOutSine(clamp((d - 10) / 50));
	const caretOn = d >= 8 && ((abs % 15) + 15) % 15 < 9;
	const midY = FL.questionY[1];
	return (
		<div style={{position: 'absolute', inset: 0, transformOrigin: `540px ${midY}px`, transform: `scale(${breathe})`}}>
			{/* scrim + alone che respira sul beat */}
			<div style={{position: 'absolute', left: 0, width: 1080, top: midY - 330, height: 660, background: 'radial-gradient(closest-side, rgba(4,5,6,0.62), rgba(4,5,6,0))', opacity: prog(d, -6, 8)}} />
			<div
				style={{
					position: 'absolute',
					left: 120,
					width: 840,
					top: FL.questionY[2] - 150,
					height: 300,
					background: `radial-gradient(closest-side, ${a4(C4.green, (0.13 + 0.05 * beat + 0.25 * flash) * prog(d, 2, 8))}, ${a4(C4.greenDeep, 0)})`,
				}}
			/>
			{QLINES.map((line, li) => {
				const land = F.question + li * 2;
				const p = prog(f, land - 9, 9, ease.outQuint);
				const lf = hit(f, land, 8);
				const isLast = li === QLINES.length - 1;
				return (
					<div key={li} style={{position: 'absolute', left: 0, width: 1080, top: FL.questionY[li] - H / 2, height: H, overflow: p < 1 ? 'hidden' : 'visible'}}>
						<div
							style={{
								position: 'absolute',
								inset: 0,
								display: 'flex',
								justifyContent: 'center',
								alignItems: 'center',
								gap: '0.26em',
								fontFamily: FONTS.display,
								fontWeight: 700,
								fontSize: SIZE,
								letterSpacing: '-0.025em',
								transform: `translateY(${(1 - p) * H}px) rotate(${(1 - p) * 4}deg)`,
								whiteSpace: 'nowrap',
							}}
						>
							{line.words.map((w, wi) => (
								<span
									key={wi}
									style={{
										color: w.accent ? C4.green : C4.white,
										textShadow: w.accent ? glow4(C4.green, 1 + 0.6 * lf + 0.25 * beat) : `0 6px 40px rgba(0,0,0,0.7), 0 0 ${36 * lf}px ${a4(C4.white, 0.5 * lf)}`,
									}}
								>
									{w.t}
								</span>
							))}
							{isLast ? (
								<span
									style={{
										display: 'inline-block',
										width: 14,
										height: SIZE * 0.78,
										marginLeft: -12,
										borderRadius: 3,
										background: C4.greenBright,
										boxShadow: `0 0 18px ${a4(C4.green, 0.9)}`,
										opacity: caretOn ? 1 : 0,
										transform: 'translateY(4px)',
									}}
								/>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
};

const NOTE = 'Esempio fittizio a scopo educativo';

/** Nota finale (mono 24 px, grigio): si scrive a macchina sotto la domanda. */
export const Footnote: React.FC<{f: number}> = ({f}) => {
	const d = f - F.note;
	if (d < 0) return null;
	const typed = Math.floor(clamp(d / 18) * NOTE.length);
	const caret = typed < NOTE.length || Math.floor(d / 8) % 2 === 0;
	return (
		<div style={{position: 'absolute', left: 0, width: 1080, top: FL.noteY, display: 'flex', justifyContent: 'center', fontFamily: FONTS.mono, fontSize: 24, letterSpacing: '0.06em', color: a4(C4.gray, 0.9), whiteSpace: 'pre'}}>
			<div style={{position: 'relative'}}>
				<span style={{visibility: 'hidden'}}>{NOTE}</span>
				<span style={{position: 'absolute', left: 0, top: 0}}>
					{NOTE.slice(0, typed)}
					<span style={{color: C4.green, opacity: caret && typed < NOTE.length ? 1 : 0}}>▍</span>
				</span>
			</div>
		</div>
	);
};

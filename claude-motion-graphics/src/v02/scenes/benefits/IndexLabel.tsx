import React from 'react';
import {clamp, ease, hit, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS, textGlow} from '../../../theme';
import {WIDTH} from '../../../timeline';
import {T, TR, Y} from './layout';

const STARTS = [T.privacy, T.offline, T.control];
const ENDS = [T.offline, T.control, TR.implode];
const H = 40;

/**
 * Indice "01 / 03" fisso (ancora visiva delle tre sequenze): la cifra rotola verso l'alto
 * in una maschera e atterra sul cue; sotto, tre segmenti che si riempiono durante ogni sequenza.
 */
export const IndexLabel: React.FC<{f: number}> = ({f}) => {
	const out = prog(f, TR.implode, 8, ease.inCubic);
	const appear = prog(f, 0, 8, ease.outQuint);
	return (
		<div style={{position: 'absolute', left: 0, top: Y.index - H / 2, width: WIDTH, opacity: 1 - out}}>
			<div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: H, fontFamily: FONTS.mono, fontWeight: 500, fontSize: 28, letterSpacing: '0.14em', lineHeight: `${H}px`}}>
				<div style={{position: 'relative', width: '1.5em', height: H, overflow: 'hidden'}}>
					{STARTS.map((s, i) => {
						const inP = i === 0 ? appear : prog(f, s - 3, 7, ease.outQuint);
						const outP = i === 2 ? 0 : prog(f, ENDS[i] - 3, 7, ease.outQuint);
						if (inP <= 0 || outP >= 1) return null;
						const flash = hit(f, s, 10);
						return (
							<div
								key={i}
								style={{
									position: 'absolute',
									right: 0,
									top: 0,
									transform: `translateY(${(1 - inP) * H - outP * H}px)`,
									color: COLORS.orangeBright,
									textShadow: textGlow(COLORS.orange, 0.4 + flash),
								}}
							>
								{String(i + 1).padStart(2, '0')}
							</div>
						);
					})}
				</div>
				<div style={{color: COLORS.grayDim, opacity: appear, transform: `translateY(${(1 - appear) * 20}px)`}}>&nbsp;/ 03</div>
			</div>
			<div style={{display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10}}>
				{STARTS.map((s, i) => {
					const fill = clamp((f - s) / (ENDS[i] - s));
					const grow = prog(f, i * 2, 9, ease.outQuint);
					return (
						<div key={i} style={{width: 56 * grow, height: 4, borderRadius: 2, background: alpha(COLORS.white, 0.12), overflow: 'hidden'}}>
							<div style={{width: `${fill * 100}%`, height: '100%', background: COLORS.orange, boxShadow: `0 0 10px ${COLORS.orange}`}} />
						</div>
					);
				})}
			</div>
		</div>
	);
};

import React from 'react';
import {clamp, ease, hit, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4} from '../../theme';
import {V4_FAKE} from '../../timeline';
import {STACK} from './timing';

const H = 72;
const PILL_W = 452;

/**
 * "Non aprire link sospetti": il collegamento sospetto (pillola rossa) viene barrato da una lama verde e
 * bloccato (divieto rosso), poi una freccia porta all'alternativa sicura: l'app ufficiale, aperta da te.
 */
export const LinkBlock: React.FC<{f: number; at: number; top: number}> = ({f, at, top}) => {
	const pillIn = prog(f, at + 1, 6, ease.outCubic);
	const strike = prog(f, at + 9, 5, ease.inOutCubic);
	const strikeHit = hit(f, at + 14, 9);
	const blocked = clamp((f - (at + 14)) / 5);
	const shake = f >= at + 14 && f < at + 19 ? Math.sin((f - at) * 2.6) * 7 * (1 - (f - at - 14) / 5) : 0;
	const arrow = prog(f, at + 18, 6, ease.outCubic);
	const app = prog(f, at + 21, 7, ease.outCubic);
	const appHit = hit(f, at + 24, 10);
	return (
		<div style={{position: 'absolute', left: STACK.pad, top, width: STACK.width - STACK.pad * 2, height: H}}>
			{/* pillola del collegamento sospetto */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: PILL_W,
					height: H,
					borderRadius: H / 2,
					background: a4(C4.red, 0.12 - 0.06 * blocked),
					border: `2px solid ${a4(C4.red, 0.7 - 0.35 * blocked)}`,
					boxShadow: `0 0 ${24 * (1 - blocked)}px ${a4(C4.red, 0.35)}`,
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					paddingLeft: 22,
					fontFamily: FONTS.mono,
					fontSize: 28,
					fontWeight: 500,
					color: blocked > 0.5 ? a4(C4.redHot, 0.55) : C4.redHot,
					whiteSpace: 'nowrap',
					transform: `translateX(${(1 - pillIn) * -40 + shake}px)`,
					opacity: pillIn,
				}}
			>
				<svg width={30} height={30} viewBox="0 0 30 30" style={{flex: 'none'}}>
					<g fill="none" stroke={C4.redBright} strokeWidth="2.6" strokeLinecap="round" transform="rotate(-45 15 15)">
						<rect x="3" y="11" width="13" height="8" rx="4" />
						<rect x="14" y="11" width="13" height="8" rx="4" />
					</g>
				</svg>
				{V4_FAKE.phishDomain}
			</div>
			{/* lama verde che barra il collegamento */}
			{strike > 0 ? (
				<div
					style={{
						position: 'absolute',
						left: 6,
						top: H / 2 - 3,
						width: (PILL_W - 12) * strike,
						height: 6,
						borderRadius: 3,
						background: C4.greenBright,
						boxShadow: `0 0 ${12 + 18 * strikeHit}px ${a4(C4.green, 0.95)}, 0 0 4px ${C4.greenHot}`,
						transform: 'rotate(-4deg)',
						transformOrigin: '0 50%',
					}}
				/>
			) : null}
			{/* divieto */}
			{blocked > 0 ? (
				<svg
					width={64}
					height={64}
					viewBox="0 0 64 64"
					style={{position: 'absolute', left: PILL_W - 40, top: -22, overflow: 'visible', transform: `scale(${(0.5 + 0.5 * ease.outBack(blocked)) * (1 + 0.2 * strikeHit)})`, filter: `drop-shadow(0 0 12px ${a4(C4.red, 0.8)})`}}
				>
					<circle cx="32" cy="32" r="26" fill={C4.black} stroke={C4.red} strokeWidth="7" />
					<path d="M14 14 L50 50" stroke={C4.red} strokeWidth="7" strokeLinecap="round" />
				</svg>
			) : null}
			{/* freccia verso l'alternativa sicura */}
			<svg width={70} height={H} viewBox={`0 0 70 ${H}`} style={{position: 'absolute', left: PILL_W + 34, top: 0, overflow: 'visible', opacity: arrow}}>
				<path d={`M4 ${H / 2} H${4 + 54 * arrow}`} stroke={C4.greenBright} strokeWidth="4" strokeLinecap="round" />
				<path d={`M${46 * arrow - 4} ${H / 2 - 12} L${58 * arrow} ${H / 2} L${46 * arrow - 4} ${H / 2 + 12}`} fill="none" stroke={C4.greenBright} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
			{/* app ufficiale (aperta da te) */}
			<div
				style={{
					position: 'absolute',
					left: PILL_W + 120,
					top: 0,
					height: H,
					display: 'flex',
					alignItems: 'center',
					gap: 14,
					padding: '0 22px 0 12px',
					borderRadius: 20,
					background: a4(C4.green, 0.1 + 0.08 * appHit),
					border: `2px solid ${a4(C4.green, 0.6 + 0.3 * appHit)}`,
					boxShadow: `0 0 ${18 + 24 * appHit}px ${a4(C4.green, 0.25 + 0.3 * appHit)}`,
					fontFamily: FONTS.body,
					fontWeight: 600,
					fontSize: 27,
					color: C4.white,
					whiteSpace: 'nowrap',
					transform: `translateX(${(1 - app) * 30}px) scale(${0.9 + 0.1 * app})`,
					opacity: app,
				}}
			>
				<svg width={46} height={46} viewBox="0 0 46 46">
					<rect x="1.5" y="1.5" width="43" height="43" rx="12" fill={a4(C4.green, 0.16)} stroke={C4.greenBright} strokeWidth="2.4" />
					<g fill="none" stroke={C4.greenBright} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
						<rect x="14" y="21" width="18" height="13" rx="3" />
						<path d="M18 21 V17.5 a5 5 0 0 1 10 0 V21" />
					</g>
				</svg>
				app ufficiale
			</div>
		</div>
	);
};

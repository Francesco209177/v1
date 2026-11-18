import React from 'react';
import {clamp, ease, lerp, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {TokenChip} from '../../components/TokenChip';
import {chipState} from './chips';
import {DIMS, embValue, flickerValue, fmtVal, KEY_TOKENS, N_TOK, TOKENS} from './data';
import {heatColor} from './geom';
import {CH, CHIP_W, SIZE, slot, T} from './layout';

/** I token (chip condivisi del video): riemergono dalla rete, si accendono con l'attenzione, si scansionano. */
export const Tokens: React.FC<{f: number; beat: number}> = ({f, beat}) => (
	<>
		{TOKENS.map((t, i) => {
			const s = chipState(f, i, beat);
			return <TokenChip key={i} text={t} x={s.x} y={s.y} size={SIZE} glow={s.glow} opacity={s.opacity} scale={s.scale} active={s.active} />;
		})}
	</>
);

// ------------------------------------------------------------------ EMBEDDING

const ROW_H = 32;
const NUM_W = 80;
const COL_TOP = CH / 2 + 22; // dal centro del chip all'inizio della colonna
const valueStart = (i: number, j: number): number => T.vectors - 1 + i * 2 + j * 2.2;
const SETTLE = 8;

/**
 * Ogni token "srotola" sotto di sé una colonna di numeri (vettore): numeri completi per 4 token chiave,
 * barre di calore per gli altri. I numeri sfarfallano come un calcolo e poi si stabilizzano.
 * Dal frame 79 ogni colonna si compatta in una striscia sotto il token (il token ora "porta" il suo vettore).
 */
export const Embeddings: React.FC<{f: number; beat: number}> = ({f, beat}) => {
	if (f < T.vectors - 1) return null;
	const els: React.ReactNode[] = [];
	const bWindow = 1 - prog(f, T.condense, 8);
	const energy = prog(f, T.process, T.collapse - T.process, ease.inQuad);
	for (let i = 0; i < N_TOK; i++) {
		const {x, y} = slot(f, i);
		const isKey = KEY_TOKENS.includes(i);
		const unfold = prog(f, valueStart(i, 0) - 1, DIMS * 2.2 + 4, ease.outCubic);
		const colH = DIMS * ROW_H + 8;
		const top = y + COL_TOP;
		const fold = prog(f, T.condense + i * 0.4, 8, ease.inCubic);
		// colonna: staffe (token chiave) o filo sottile (altri)
		if (unfold > 0 && fold < 1) {
			const h = colH * unfold;
			const o = 1 - fold;
			if (isKey) {
				const bw = 136;
				for (const side of [-1, 1]) {
					els.push(
						<div
							key={`br${i}${side}`}
							style={{
								position: 'absolute',
								left: side < 0 ? x - bw / 2 - 8 : x + bw / 2 - 2,
								top: top - 6,
								width: 10,
								height: h,
								// niente valori undefined: React li tradurrebbe in '' cancellando lo shorthand
								borderTop: `2px solid ${alpha(COLORS.orange, 0.55 * o)}`,
								borderBottom: `2px solid ${alpha(COLORS.orange, 0.55 * o)}`,
								borderLeft: side < 0 ? `2px solid ${alpha(COLORS.orange, 0.55 * o)}` : 'none',
								borderRight: side > 0 ? `2px solid ${alpha(COLORS.orange, 0.55 * o)}` : 'none',
								borderRadius: side < 0 ? '4px 0 0 4px' : '0 4px 4px 0',
							}}
						/>,
					);
				}
				// ⋮ : il vettore vero continua (migliaia di valori)
				for (let d = 0; d < 3; d++) {
					els.push(
						<div
							key={`dot${i}${d}`}
							style={{
								position: 'absolute',
								left: x - bw / 2 + NUM_W / 2 + 2,
								top: top + colH + 6 + d * 9,
								width: 5,
								height: 5,
								borderRadius: 3,
								background: alpha(COLORS.gray, 0.7 * o * prog(f, valueStart(i, DIMS - 1) + 4, 6)),
							}}
						/>,
					);
				}
			} else {
				els.push(
					<div
						key={`sp${i}`}
						style={{
							position: 'absolute',
							left: x - 0.5,
							top: top - 14,
							width: 1,
							height: h + 10,
							background: `linear-gradient(180deg, ${alpha(COLORS.orange, 0.45 * o)}, ${alpha(COLORS.orange, 0.06 * o)})`,
						}}
					/>,
				);
			}
		}
		for (let j = 0; j < DIMS; j++) {
			const st = valueStart(i, j);
			const a = prog(f, st, 5, ease.outCubic);
			if (a <= 0) continue;
			const settled = f >= st + SETTLE;
			const v = embValue(i, j);
			const shown = settled ? v : flickerValue(i, j, f);
			const settleHit = settled ? Math.exp(-(f - st - SETTLE) / 4) : 0;
			const c = prog(f, T.condense + i * 0.4 + (DIMS - 1 - j) * 0.45, 10, ease.inOutCubic);
			const rowCy = top + j * ROW_H + ROW_H / 2;
			const pulse = settled ? beat * bWindow : 0;
			// cella (barra di calore) → striscia compatta sotto il chip
			const bx = isKey ? x - 64 + NUM_W + 8 : x - 8;
			const bwB = isKey ? 4 + Math.abs(shown) * 34 : 16;
			const bhB = isKey ? 10 : 20;
			const stripW = Math.min(8, (CHIP_W[i] - 10) / DIMS - 3);
			const sx = x - (DIMS * (stripW + 3) - 3) / 2 + j * (stripW + 3);
			const sy = y + CH / 2 + 7;
			const scan = Math.exp(-(((f - (T.process + i * 1.3)) / 5) ** 2));
			const heatA = clamp((0.45 + 0.55 * Math.abs(shown)) * (settled ? 1 : 0.8) + 0.5 * pulse + 0.6 * scan + 0.3 * energy);
			els.push(
				<div
					key={`c${i}-${j}`}
					style={{
						position: 'absolute',
						left: lerp(bx, sx, c),
						top: lerp(rowCy - bhB / 2, sy, c),
						width: lerp(bwB, stripW, c),
						height: lerp(bhB, 6, c),
						borderRadius: lerp(isKey ? 3 : 4, 2, c),
						opacity: a,
						background: settled ? heatColor(v, heatA) : alpha(COLORS.orangeHot, 0.55),
						boxShadow: `0 0 ${6 + 10 * (settleHit + pulse + scan)}px ${heatColor(v, 0.35 * (0.5 + settleHit + pulse + scan))}`,
					}}
				/>,
			);
			if (isKey) {
				const numO = a * (1 - prog(f, T.condense + i * 0.4, 6, ease.inCubic));
				if (numO > 0.01) {
					els.push(
						<div
							key={`n${i}-${j}`}
							style={{
								position: 'absolute',
								left: x - 64,
								top: rowCy - ROW_H / 2 - 1,
								width: NUM_W,
								height: ROW_H,
								lineHeight: `${ROW_H}px`,
								textAlign: 'right',
								fontFamily: FONTS.mono,
								fontWeight: 500,
								fontSize: 26,
								whiteSpace: 'pre',
								opacity: numO,
								transform: `translateY(${(1 - a) * -8}px)`,
								color: settled ? (v < 0 ? alpha(COLORS.gray, 0.95) : COLORS.white) : COLORS.orangeHot,
								textShadow: settled
									? `0 0 ${10 + 16 * (settleHit + pulse)}px ${alpha(COLORS.orange, 0.25 + 0.5 * (settleHit + pulse))}`
									: `0 0 12px ${alpha(COLORS.orange, 0.7)}`,
							}}
						>
							{fmtVal(shown)}
						</div>,
					);
				}
			}
		}
	}
	return <>{els}</>;
};

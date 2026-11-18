import React from 'react';
import {CodeBlock} from '../../components/TerminalWindow';
import {CODE_METRICS} from '../../lib/code';
import {clamp} from '../../lib/math';
import {COLORS, alpha} from '../../theme';
import {mixHex} from './color';
import {GLYPH_BASE} from './GlyphLayer';
import {CELLS, CW, GUTTERS, LAST_RESOLVE, LH, ROWS, resolvedCols} from './layout';
import {T} from './timing';

const M = CODE_METRICS;
const HOT = mixHex(COLORS.white, COLORS.orangeHot, 0.4);

const cellStyle = (col: number, row: number, chars: number, opacity: number, color: string, glow: number): React.CSSProperties => ({
	position: 'absolute',
	left: M.padX + (M.gutterChars + col) * CW,
	top: M.padY + row * LH,
	width: CW * chars,
	height: LH,
	lineHeight: `${LH}px`,
	color,
	opacity,
	textShadow: glow > 0.02 ? `0 0 ${12 * glow}px ${alpha(COLORS.orange, 0.9)}, 0 0 ${30 * glow}px ${alpha(COLORS.orange, 0.5)}` : undefined,
});

/**
 * Il codice finale è da subito il VERO <CodeBlock> condiviso, scoperto riga per riga da una maschera
 * che segue il fronte luminoso: così a fine morph il quadro è identico al pixel allo stato di confine.
 * Sopra, ogni carattere appena risolto lampeggia bianco caldo e sfuma => il colore di sintassi "affiora".
 */
export const CodeReveal: React.FC<{frame: number}> = ({frame}) => {
	if (frame < GUTTERS[0].g) return null;
	const done = frame >= LAST_RESOLVE;
	let d = '';
	if (!done) {
		for (const r of ROWS) {
			if (frame < GUTTERS[r.index].g) continue;
			const n = resolvedCols(r, frame);
			// numero di riga sempre scoperto; il codice fino all'ultima colonna risolta
			const x1 = M.padX + (n > 0 ? M.gutterChars + r.indent + n : 2.5) * CW;
			const y0 = M.padY + r.index * LH;
			d += `M0 ${y0}H${x1.toFixed(2)}V${y0 + LH}H0Z`;
		}
	}
	const flashes: React.ReactNode[] = [];
	if (frame < LAST_RESOLVE + T.flashLen + 3) {
		CELLS.forEach((c, j) => {
			const age = frame - c.e;
			if (age < 0 || age >= T.flashLen) return;
			const k = 1 - age / T.flashLen;
			flashes.push(
				<span key={j} style={cellStyle(c.col, c.row, 1, Math.pow(k, 1.4), HOT, clamp(1 - age / 3))}>
					{c.ch}
				</span>,
			);
		});
		// i numeri di riga si accendono un attimo prima che la riga parta
		for (const g of GUTTERS) {
			const age = frame - g.g;
			if (age < 0 || age >= T.flashLen + 3) continue;
			const k = 1 - age / (T.flashLen + 3);
			flashes.push(
				<span key={`g${g.row}`} style={cellStyle(2 - g.text.length - M.gutterChars, g.row, g.text.length, Math.pow(k, 1.2), COLORS.orangeBright, clamp(1 - age / 4))}>
					{g.text}
				</span>,
			);
		}
	}
	return (
		<>
			<div style={{position: 'absolute', inset: 0, clipPath: done ? undefined : `path("${d}")`}}>
				<CodeBlock />
			</div>
			{flashes.length > 0 ? <div style={GLYPH_BASE}>{flashes}</div> : null}
		</>
	);
};

import React from 'react';
import {CODE_METRICS} from '../../lib/code';
import {clamp, ease, hash, hit, lerp} from '../../lib/math';
import {COLORS, FONTS, alpha} from '../../theme';
import {mixHex} from './color';
import {CELLS, CW, GUTTERS, LH, SOURCES, flightPose, scrambleChar} from './layout';
import {T} from './timing';

/** Contenitore: stessa tipografia di <CodeBlock>, così i glifi atterrano identici al codice finale. */
export const GLYPH_BASE: React.CSSProperties = {
	position: 'absolute',
	inset: 0,
	fontFamily: FONTS.mono,
	fontSize: CODE_METRICS.fontSize,
	fontWeight: 500,
	whiteSpace: 'pre',
	fontVariantLigatures: 'none',
};

/** Stile di un glifo centrato in (cx, cy) con scala `s` (1 = corpo del codice). */
export const glyphStyle = (cx: number, cy: number, s: number, color: string, opacity: number, shadow?: string): React.CSSProperties => ({
	position: 'absolute',
	left: 0,
	top: 0,
	width: CW,
	height: LH,
	lineHeight: `${LH}px`,
	textAlign: 'center',
	transform: `translate(${(cx - CW / 2).toFixed(2)}px, ${(cy - LH / 2).toFixed(2)}px) scale(${s.toFixed(4)})`,
	color,
	opacity,
	textShadow: shadow,
});

const softGlow = (k: number): string => `0 0 ${10 * k}px ${alpha(COLORS.orange, 0.85)}, 0 0 ${26 * k}px ${alpha(COLORS.orange, 0.45)}`;

/** Marcatori (">" / "•") che non hanno una riga di destinazione: svaniscono dopo l'invio. */
const TARGETED = new Set(GUTTERS.map((g) => g.mark).filter((i) => i >= 0));

/**
 * Tutti i caratteri "vivi" della scena:
 *  · prima dell'INVIO  → il prompt e le istruzioni digitati carattere per carattere;
 *  · dopo l'INVIO      → gli stessi caratteri si rimescolano, decollano e si ri-impaginano sulla griglia
 *    del codice (ognuno si sdoppia in più celle), restando glifi casuali finché il fronte non li risolve.
 * I caratteri risolti non sono più qui: li mostra <CodeReveal> (il vero <CodeBlock>).
 */
export const GlyphLayer: React.FC<{frame: number}> = ({frame}) => {
	const out: React.ReactNode[] = [];

	if (frame < T.submit) {
		SOURCES.forEach((s, i) => {
			if (frame < s.at) return;
			const age = frame - s.at;
			if (s.mark) {
				const pop = ease.outBack(clamp(age / 6));
				out.push(
					<span key={i} style={glyphStyle(s.cx, s.cy, s.scale * pop, s.color, clamp(age / 2 + 0.4), softGlow(0.8))}>
						{s.ch}
					</span>,
				);
				return;
			}
			// ogni tasto: il carattere sale di qualche px e si raffredda da bianco caldo al suo colore
			const pop = ease.outCubic(clamp((age + 1) / 3));
			const heat = 1 - clamp(age / 5);
			out.push(
				<span
					key={i}
					style={glyphStyle(s.cx, s.cy + (1 - pop) * 7 * s.scale, s.scale, mixHex(s.color, COLORS.orangeHot, heat), 1, heat > 0.05 ? softGlow(heat) : undefined)}
				>
					{s.ch}
				</span>,
			);
		});
		return <div style={GLYPH_BASE}>{out}</div>;
	}

	const flash = hit(frame, T.submit, 5);

	// ── marcatori: ">" e "•" volano nel margine e diventano numeri di riga
	SOURCES.forEach((s, i) => {
		if (!s.mark || TARGETED.has(i)) return;
		const gone = clamp((frame - T.submit) / 7);
		if (gone < 1) out.push(<span key={`m${i}`} style={glyphStyle(s.cx, s.cy, s.scale * (1 - 0.4 * gone), s.color, 1 - gone)}>{s.ch}</span>);
	});
	for (const g of GUTTERS) {
		if (g.mark < 0 || frame >= g.g) continue;
		const s = SOURCES[g.mark];
		const p = flightPose(frame, s, g, g.d, g.a);
		out.push(
			<span key={`g${g.row}`} style={glyphStyle(p.x, p.y, p.s, mixHex(s.color, COLORS.orangeHot, flash), 1, softGlow(0.8))}>
				{p.w > 0.55 ? scrambleChar(900 + g.row, frame, 1) : s.ch}
			</span>,
		);
	}

	// ── celle del codice non ancora risolte
	CELLS.forEach((c, j) => {
		if (frame >= c.e) return;
		if (!c.primary && frame <= c.d) return;
		const s = SOURCES[c.src];
		const p = flightPose(frame, s, c, c.d, c.a);
		const landed = frame >= c.a;
		// probabilità di essere già "rimescolato": cresce dall'invio fino a metà volo
		const mid = c.d + (c.a - c.d) * 0.5;
		const m = clamp((frame - T.submit - 1) / Math.max(3, mid - T.submit - 1));
		const scrambled = !c.primary || hash(j * 3 + 1, Math.floor(frame / 2)) < m;
		const ch = scrambled ? scrambleChar(j, frame + (j % 3), landed ? 3 : 2) : s.ch;
		// si scalda quando il fronte luminoso è a un paio di celle
		const heat = clamp(1 - (c.e - frame) / 3.5);
		const color = mixHex(mixHex(s.color, COLORS.orange, clamp(m * 0.5 + p.w)), COLORS.orangeHot, Math.max(flash * 0.85, heat));
		const born = c.primary ? 1 : clamp((frame - c.d) / ((c.a - c.d) * 0.6));
		const dim = landed ? lerp(1, 0.5, clamp((frame - c.a) / 4) * (1 - heat)) : 1;
		out.push(
			<span key={j} style={glyphStyle(p.x, p.y, p.s, color, born * dim, heat > 0.3 || flash > 0.25 ? softGlow(Math.max(heat, flash)) : undefined)}>
				{ch}
			</span>,
		);
	});
	return <div style={GLYPH_BASE}>{out}</div>;
};

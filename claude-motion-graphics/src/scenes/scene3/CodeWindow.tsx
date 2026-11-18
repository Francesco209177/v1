import React, {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {CodeBlock, TerminalWindow} from '../../components/TerminalWindow';
import {CODE_LINES, CODE_METRICS, placeTokens} from '../../lib/code';
import {clamp, ease, hit, invLerp, lerp, prog} from '../../lib/math';
import {COLORS, FONTS, textGlow} from '../../theme';
import {WINDOW_RECT} from '../../timeline';
import {CODE_BIRTHS, LIFT, T} from './timing';
import {sweepX, windowState, windowTransform} from './windowMath';

const M = CODE_METRICS;
const LAST_LIFT = CODE_BIRTHS[CODE_BIRTHS.length - 1].at - LIFT;

/** Frame in cui i token della riga `line` si staccano (Infinity se la riga resta nel codice). */
const liftAt = (line: number): number => {
	const b = CODE_BIRTHS.find((x) => x.line === line);
	return b ? b.at - LIFT : Infinity;
};

/** Luminosità extra della riga (0..1): cascata iniziale, attesa prima del distacco, coda finale. */
const lineGlow = (line: number, f: number): number => {
	const lift = liftAt(line);
	if (lift !== Infinity) {
		if (f >= lift) return 0;
		return prog(f, lift - 4, 3, ease.outCubic);
	}
	if (line < CODE_BIRTHS[0].line) return hit(f, 1 + line * 0.8, 11);
	return hit(f, LAST_LIFT + 2 + (line - 10) * 1.4, 9);
};

/** Riga (frazionaria) su cui si trova la banda di scansione. */
const scanLine = (f: number): number => {
	const first = CODE_BIRTHS[0].line;
	let l = lerp(0, first, clamp((f - 1) / (liftAt(first) - 2)));
	for (let i = 1; i < CODE_BIRTHS.length; i++) {
		const arrive = liftAt(CODE_BIRTHS[i].line) - 4;
		l += ease.inOutCubic(invLerp(arrive - 3, arrive, f));
	}
	l += 3 * ease.inOutCubic(invLerp(LAST_LIFT + 2, LAST_LIFT + 7, f));
	return l;
};

/**
 * Fase A — la finestra di Claude Code: il codice si accende riga per riga, i token delle righe JSX
 * spariscono (li ridisegna FlyingTokens) e la finestra arretra fuori fuoco finché la spazzata la cancella.
 * A f=0 è ESATTAMENTE <TerminalWindow><CodeBlock /></TerminalWindow> (match-cut con la scena 2).
 */
export const CodeWindow: React.FC = () => {
	const f = useCurrentFrame();
	const tokens = useMemo(() => placeTokens(), []);

	const hidden = useMemo(() => {
		const set = new Set<number>();
		for (const t of tokens) if (f >= liftAt(t.line)) set.add(t.index);
		return set;
	}, [f, tokens]);

	if (f > T.sweepEnd) return null;
	if (f <= 0) {
		return (
			<TerminalWindow>
				<CodeBlock />
			</TerminalWindow>
		);
	}

	const st = windowState(f);
	// la spazzata cancella la finestra da sinistra a destra (maschera nel sistema locale della finestra)
	const sweeping = f >= T.sweepStart;
	const edge = ((sweepX(f) + 40 - (WINDOW_RECT.x + 60)) / (WINDOW_RECT.w - 120)) * 100;
	const mask = sweeping ? `linear-gradient(104deg, transparent ${edge - 7}%, #000 ${edge + 7}%)` : undefined;

	const line = scanLine(f);
	const bandIn = prog(f, 1, 2) * (1 - prog(f, LAST_LIFT + 6, 4));
	// la banda pulsa quando una riga sta per staccarsi
	const waiting = Math.max(...CODE_BIRTHS.map((b) => prog(f, b.at - LIFT - 4, 3) * (1 - prog(f, b.at - LIFT, 4))));

	return (
		<TerminalWindow
			glow={1 + 0.9 * (f / 3) * Math.exp(1 - f / 3)}
			style={{
				transformOrigin: '50% 50%',
				transform: windowTransform(st),
				opacity: st.opacity,
				filter: st.blur > 0.05 ? `blur(${st.blur}px)` : undefined,
				WebkitMaskImage: mask,
				maskImage: mask,
			}}
		>
			{/* banda di scansione */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: M.padY + line * M.lineHeight,
					height: M.lineHeight,
					opacity: bandIn * (0.6 + 0.4 * waiting),
					background: `linear-gradient(90deg, rgba(217,119,87,0.34) 0%, rgba(217,119,87,0.14) 55%, rgba(217,119,87,0) 100%)`,
					borderLeft: `5px solid ${COLORS.orangeBright}`,
					boxShadow: `-6px 0 34px rgba(217,119,87,${0.55 * bandIn})`,
				}}
			/>
			<CodeBlock hideTokens={hidden} opacity={1 - 0.2 * st.r} />
			{/* righe accese: copia chiara e luminosa sopra al codice */}
			{CODE_LINES.map((_, li) => {
				const g = lineGlow(li, f);
				if (g < 0.02) return null;
				return tokens
					.filter((t) => t.line === li)
					.map((t) => (
						<span
							key={t.index}
							style={{
								position: 'absolute',
								left: t.x,
								top: t.y - M.titleBar,
								fontFamily: FONTS.mono,
								fontSize: M.fontSize,
								lineHeight: `${M.lineHeight}px`,
								fontWeight: 500,
								whiteSpace: 'pre',
								fontVariantLigatures: 'none',
								color: COLORS.white,
								opacity: 0.8 * g,
								textShadow: textGlow(COLORS.orange, 0.8),
							}}
						>
							{t.text}
						</span>
					));
			})}
		</TerminalWindow>
	);
};

import React from 'react';
import {clamp, ease, hit, lerp, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {TokenChip} from '../../components/TokenChip';
import {ANSWER, appendAt, CTX, ctxW, HUB, QUESTION} from './data';

/**
 * Il CONTESTO: la domanda come riga compatta di token (piccoli, attenuati). Ogni token scelto
 * rientra a destra (arrivando dall'anello) e la riga scorre a sinistra: i più vecchi sfumano.
 */
export const ContextRow: React.FC<{f: number; enter: (delay: number) => number; loopLabel: number; accent: number}> = ({f, enter, loopLabel, accent}) => {
	// avanzamento (0..1) dell'ingresso di ogni token della risposta nel contesto
	const add = ANSWER.map((_, j) => prog(f, appendAt(j) - 1, 8, ease.outCubic));
	const items = [
		...QUESTION.map((t, i) => ({t, k: 1, fresh: 0, i, q: true})),
		...ANSWER.map((t, j) => ({t, k: add[j], fresh: hit(f, appendAt(j) - 1, 16), i: QUESTION.length + j, q: false})),
	];
	const total = items.reduce((n, it) => n + (ctxW(it.t) + CTX.gap) * it.k, 0) - CTX.gap;
	const x0 = CTX.right - total;
	const scrolled = clamp((CTX.left + 10 - x0) / 120);
	let x = x0;
	const chips = items.map((it) => {
		const w = ctxW(it.t);
		const cx = x + (w * it.k) / 2;
		x += (w + CTX.gap) * it.k;
		return {...it, cx};
	});
	const mask = scrolled > 0 ? `linear-gradient(90deg, rgba(0,0,0,${1 - scrolled}) ${CTX.left - 20}px, #000 ${CTX.left + 150 * scrolled}px)` : undefined;

	return (
		<>
			{/* etichette */}
			<div
				style={{
					position: 'absolute',
					left: CTX.left,
					top: CTX.labelY - 16,
					height: 32,
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					fontFamily: FONTS.mono,
					fontSize: 24,
					fontWeight: 500,
					letterSpacing: '0.14em',
					color: alpha(COLORS.gray, 0.95),
					opacity: enter(2),
					transform: `translateY(${(1 - enter(2)) * 14}px)`,
				}}
			>
				<span style={{width: 10, height: 10, borderRadius: 3, background: COLORS.orange, boxShadow: `0 0 10px ${COLORS.orange}`}} />
				CONTESTO
			</div>
			<div
				style={{
					position: 'absolute',
					right: 1080 - CTX.right,
					top: CTX.labelY - 16,
					height: 32,
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					fontFamily: FONTS.mono,
					fontSize: 24,
					color: accent > 0.05 ? COLORS.orangeHot : alpha(COLORS.orangeBright, 0.92),
					textShadow: `0 0 ${10 + 24 * accent}px ${alpha(COLORS.orange, 0.35 + 0.5 * accent)}`,
					opacity: loopLabel,
					transform: `translateX(${(1 - loopLabel) * 24}px)`,
					whiteSpace: 'nowrap',
				}}
			>
				il token scelto rientra come input
				<svg width={26} height={26} viewBox="0 0 26 26" style={{transform: `rotate(${-f * 6}deg)`}}>
					<path d="M21 13a8 8 0 1 1-3.2-6.4" fill="none" stroke={COLORS.orangeBright} strokeWidth={2.4} strokeLinecap="round" />
					<path d="M18.6 2.6l-0.4 4.6l-4.6-0.6" fill="none" stroke={COLORS.orangeBright} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</div>
			{/* la riga dei token */}
			<div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 420, WebkitMaskImage: mask, maskImage: mask}}>
				{chips.map((c) => {
					if (c.k <= 0.001) return null;
					const e = c.q ? enter(1 + c.i * 0.9) : 1;
					const px = lerp(HUB.x, c.cx, e);
					const py = lerp(HUB.y, CTX.y, e);
					return (
						<TokenChip
							key={c.i}
							text={c.t}
							x={px}
							y={py}
							size={CTX.size}
							glow={0.35 + 1.1 * c.fresh}
							opacity={(c.q ? 0.62 : 0.66 + 0.34 * c.fresh) * clamp(c.k * 1.3) * clamp(e * 1.4)}
							scale={(0.55 + 0.45 * c.k) * lerp(0.4, 1, e) * (1 + 0.18 * c.fresh)}
							active={c.fresh > 0.25}
						/>
					);
				})}
			</div>
		</>
	);
};

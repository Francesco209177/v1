import React from 'react';
import {hash} from '../../../lib/math';

/** Bande orizzontali casuali (deterministiche) come un unico poligono di clip. */
const bands = (seed: number, n: number): string => {
	const list = Array.from({length: n}, (_, i) => {
		const y = hash(seed, i * 2 + 1) * 92;
		const h = 2 + hash(seed, i * 2 + 2) * 9;
		return [y, Math.min(100, y + h)] as const;
	}).sort((a, b) => a[0] - b[0]);
	return `polygon(${list.map(([a, b]) => `0% ${a}%, 100% ${a}%, 100% ${b}%, 0% ${b}%`).join(', ')})`;
};

/**
 * Glitch controllato: due copie del contenuto (rossa e bianca) spostate in orizzontale e ritagliate a bande,
 * sommate in "screen". Il contenuto base resta intatto (il testo rimane leggibile). Attivo solo se amount > 0.03.
 */
export const Glitch: React.FC<{amount: number; seed: number; w: number; h: number; children: React.ReactNode}> = ({amount, seed, w, h, children}) => {
	const on = amount > 0.03;
	const dx = 26 * amount;
	const s = seed * 31 + Math.floor(amount * 7);
	const base = hash(s, 99) > 0.5 ? 1 : -1;
	return (
		<div style={{position: 'relative', width: w, height: h}}>
			<div style={{position: 'absolute', inset: 0, transform: on ? `translateX(${base * dx * 0.18}px)` : undefined}}>{children}</div>
			{on ? (
				<>
					<div
						style={{
							position: 'absolute',
							inset: 0,
							transform: `translateX(${base * dx}px)`,
							clipPath: bands(s, 5),
							mixBlendMode: 'screen',
							opacity: Math.min(1, 0.95 * amount + 0.2),
							filter: 'brightness(0.9) sepia(1) saturate(9) hue-rotate(-38deg)',
						}}
					>
						{children}
					</div>
					<div
						style={{
							position: 'absolute',
							inset: 0,
							transform: `translateX(${-base * dx * 0.7}px)`,
							clipPath: bands(s + 17, 4),
							mixBlendMode: 'screen',
							opacity: Math.min(1, 0.7 * amount + 0.1),
							filter: 'grayscale(1) brightness(1.5)',
						}}
					>
						{children}
					</div>
				</>
			) : null}
		</div>
	);
};

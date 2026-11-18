import React from 'react';
import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {TokenChip, tokenWidth} from '../v01/components/TokenChip';
import {V1_TOKEN_IDS, V1_TOKENS} from '../v01/timeline';

/** Tavola di prova dei token del video 01 (non fa parte del video). */
const Test: React.FC = () => {
	const gap = 14;
	const rows = [V1_TOKENS.slice(0, 6), V1_TOKENS.slice(6)];
	return (
		<>
			{rows.map((row, ri) => {
				const total = row.reduce((w, t) => w + tokenWidth(t) + gap, -gap);
				let x = 540 - total / 2;
				return row.map((t, i) => {
					const w = tokenWidth(t);
					const cx = x + w / 2;
					x += w + gap;
					const idx = ri * 6 + i;
					return <TokenChip key={idx} text={t} x={cx} y={700 + ri * 170} id={V1_TOKEN_IDS[idx]} active={idx === 3} />;
				});
			})}
		</>
	);
};
registerRoot(isolatedRoot('V01Test', Test, 0, 30));

import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {useAbsFrame} from '../lib/frame';
import {hash, seeded} from '../lib/math';

let tile: string | null = null;
const noiseTile = (): string => {
	if (tile) return tile;
	const size = 256;
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(size, size);
	const rnd = seeded(20241118);
	for (let i = 0; i < size * size; i++) {
		const v = Math.floor(rnd() * 255);
		img.data[i * 4] = v;
		img.data[i * 4 + 1] = v;
		img.data[i * 4 + 2] = v;
		img.data[i * 4 + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	tile = c.toDataURL('image/png');
	return tile;
};

/** Grana cinematografica finissima sopra a tutto: dà materia e previene il banding dei gradienti scuri in H.264. */
export const Grain: React.FC<{opacity?: number}> = ({opacity = 0.055}) => {
	const f = useAbsFrame();
	const url = useMemo(() => noiseTile(), []);
	return (
		<AbsoluteFill
			style={{
				backgroundImage: `url(${url})`,
				backgroundSize: '256px 256px',
				backgroundPosition: `${Math.floor(hash(f, 11) * 256)}px ${Math.floor(hash(f, 12) * 256)}px`,
				opacity,
				mixBlendMode: 'overlay',
				pointerEvents: 'none',
			}}
		/>
	);
};

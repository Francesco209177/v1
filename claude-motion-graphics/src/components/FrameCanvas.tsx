import React, {useLayoutEffect, useRef} from 'react';
import {useCurrentFrame} from 'remotion';
import {HEIGHT, WIDTH} from '../timeline';

export type DrawFn = (ctx: CanvasRenderingContext2D, info: {frame: number; width: number; height: number}) => void;

/**
 * Canvas 2D a tutto schermo ridisegnato in modo SINCRONO a ogni frame (useLayoutEffect),
 * quindi sicuro per il render Remotion. `draw` deve essere una funzione pura del frame:
 * nessuno stato accumulato tra frame (i frame vengono renderizzati in ordine sparso).
 * `frame` passato a draw = prop `frame` se fornita, altrimenti useCurrentFrame().
 */
export const FrameCanvas: React.FC<{
	draw: DrawFn;
	frame?: number;
	width?: number;
	height?: number;
	additive?: boolean; // mix-blend-mode: screen sul layer (per luce/particelle)
	style?: React.CSSProperties;
}> = ({draw, frame: frameProp, width = WIDTH, height = HEIGHT, additive = false, style}) => {
	const ref = useRef<HTMLCanvasElement>(null);
	const current = useCurrentFrame();
	const frame = frameProp ?? current;
	useLayoutEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.clearRect(0, 0, width, height);
		ctx.save();
		draw(ctx, {frame, width, height});
		ctx.restore();
	});
	return (
		<canvas
			ref={ref}
			width={width}
			height={height}
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width,
				height,
				pointerEvents: 'none',
				mixBlendMode: additive ? 'screen' : undefined,
				...style,
			}}
		/>
	);
};

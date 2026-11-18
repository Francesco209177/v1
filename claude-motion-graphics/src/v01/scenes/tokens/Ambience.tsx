import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow} from '../../../lib/canvas';
import {ease, hash, invLerp} from '../../../lib/math';
import {alpha, COLORS} from '../../../theme';
import {CENTER, T} from './layout';
import {layerXf} from './motion';

/** Presenza della frase nello spazio: bagliore caldo alle sue spalle (spento prima della rete). */
const poolLevel = (abs: number): number => ease.inOutSine(invLerp(96, 122, abs)) * (1 - ease.inOutSine(invLerp(T.intoNet - 4, 238, abs)));

/** Bokeh: grandi sfere di luce fuori fuoco in primo piano che scivolano lentamente verso i bordi (parallasse). */
const ORBS = Array.from({length: 8}, (_, i) => ({
	a: hash(i, 201) * Math.PI * 2,
	r: 260 + hash(i, 202) * 420,
	size: 50 + hash(i, 203) * 90,
	sp: 0.6 + hash(i, 204) * 0.8,
	deep: hash(i, 205) > 0.5,
}));

export const Ambience: React.FC<{abs: number}> = ({abs}) => {
	const pool = poolLevel(abs);
	const L = layerXf(abs);
	const orbLv = ease.inOutSine(invLerp(100, 130, abs)) * (1 - ease.inOutSine(invLerp(T.intoNet - 6, 236, abs)));
	return (
		<>
			{pool > 0.003 ? (
				<div
					style={{
						position: 'absolute',
						left: CENTER.x - 620,
						top: CENTER.y + L.dy - 460,
						width: 1240,
						height: 920,
						borderRadius: '50%',
						opacity: pool,
						background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.11)} 0%, ${alpha(COLORS.orangeDeep, 0.05)} 50%, ${alpha(COLORS.orangeDeep, 0)} 100%)`,
					}}
				/>
			) : null}
			{orbLv > 0.003 ? (
				<FrameCanvas
					frame={abs}
					draw={(ctx) => {
						ctx.globalCompositeOperation = 'lighter';
						const t = (abs - T.start) / 150;
						for (const o of ORBS) {
							const r = o.r * (1 + 0.35 * t * o.sp);
							const x = CENTER.x + Math.cos(o.a + 0.08 * t) * r * 0.9;
							const y = CENTER.y + Math.sin(o.a + 0.08 * t) * r * 1.5;
							drawGlow(ctx, x, y, o.size * (1 + 0.3 * t), o.deep ? COLORS.orangeDeep : COLORS.orange, (o.deep ? 0.12 : 0.08) * orbLv, o.deep ? COLORS.orange : COLORS.orangeBright);
						}
						ctx.globalCompositeOperation = 'source-over';
					}}
				/>
			) : null}
		</>
	);
};

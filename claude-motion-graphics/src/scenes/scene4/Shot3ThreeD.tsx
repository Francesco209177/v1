import React from 'react';
import {useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {alpha, COLORS} from '../../theme';
import {WIDTH} from '../../timeline';
import {shot3State} from './shot3-motion';
import {Shot3Scene} from './shot3-scene';
import {STAGE} from './stage';

/** Fascia dello shot: il palco più un margine in cui i bagliori sfumano a zero (spark sopra, caption sotto). */
const BAND = {top: 384, height: 862};
const CY = STAGE.cy - BAND.top; // centro del palco in coordinate della fascia
const FADE = `linear-gradient(to bottom, transparent 0px, #000 64px, #000 ${BAND.height - 64}px, transparent ${BAND.height}px)`;
const SIDE_FADE = 'linear-gradient(to right, transparent 0%, #000 7%, #000 93%, transparent 100%)';
// il canvas 3D sfuma a zero sui quattro lati: nessun bordo rettangolare visibile
const EDGE_FADE = 'linear-gradient(to bottom, transparent 0%, #000 6%, #000 90%, transparent 100%)';

/** Disco di luce radiale centrato sul palco. */
const Bloom: React.FC<{size: number; height?: number; stops: string; opacity?: number; screen?: boolean}> = ({size, height = size, stops, opacity = 1, screen = false}) => (
	<div
		style={{
			position: 'absolute',
			left: STAGE.cx - size / 2,
			top: CY - height / 2,
			width: size,
			height,
			opacity,
			background: `radial-gradient(closest-side, ${stops})`,
			mixBlendMode: screen ? 'screen' : undefined,
		}}
	/>
);

/**
 * SCENA 4 · SHOT 3 — "OGGETTI 3D" (45 frame).
 * Nodo torico laccato arancione con anelli giroscopici, satelliti e griglia prospettica: vero WebGL
 * (three.js via @remotion/three), deterministico dal frame. Il bloom è finto: aloni CSS dietro e
 * davanti al canvas, sprite additivi nella scena. Uscita: tutto collassa in un punto di luce.
 */
export const Shot3ThreeD: React.FC = () => {
	const frame = useCurrentFrame();
	const state = shot3State(frame);
	const {fx} = state;
	const core = fx.core;
	return (
		<div style={{position: 'absolute', left: 0, top: BAND.top, width: WIDTH, height: BAND.height, WebkitMaskImage: FADE, maskImage: FADE}}>
			{/* bloom dietro l'oggetto: il nodo ne ritaglia la silhouette (controluce) */}
			<Bloom
				size={1040}
				height={820}
				opacity={Math.min(1, fx.backGlow)}
				stops={`${alpha(COLORS.orangeBright, 0.5)} 0%, ${alpha(COLORS.orange, 0.26)} 32%, ${alpha(COLORS.orangeDeep, 0.1)} 62%, ${alpha(COLORS.orangeDeep, 0)} 100%`}
			/>
			{/* flare anamorfico orizzontale dietro l'oggetto */}
			<Bloom
				size={1500}
				height={26 + 30 * fx.streak}
				opacity={Math.min(1, fx.streak)}
				stops={`${alpha(COLORS.orangeHot, 0.85)} 0%, ${alpha(COLORS.orangeBright, 0.4)} 28%, ${alpha(COLORS.orange, 0)} 100%`}
			/>

			<div style={{position: 'absolute', left: 0, top: STAGE.y - BAND.top, width: STAGE.w, height: STAGE.h, WebkitMaskImage: SIDE_FADE, maskImage: SIDE_FADE}}>
				<div style={{position: 'absolute', inset: 0, WebkitMaskImage: EDGE_FADE, maskImage: EDGE_FADE}}>
				<ThreeCanvas
					width={STAGE.w}
					height={STAGE.h}
					dpr={1}
					gl={{antialias: true, alpha: true, powerPreference: 'default'}}
					camera={{fov: 34, near: 0.1, far: 60, position: [0, 1.5, 9]}}
					style={{position: 'absolute', left: 0, top: 0}}
				>
					<Shot3Scene state={state} />
				</ThreeCanvas>
				</div>
			</div>

			{/* velo di bloom davanti: i riflessi "sbordano" leggermente sull'oggetto */}
			<Bloom
				size={760}
				opacity={Math.min(1, fx.veil * (1 - fx.collapse))}
				screen
				stops={`${alpha(COLORS.orangeHot, 1)} 0%, ${alpha(COLORS.orangeBright, 0.45)} 40%, ${alpha(COLORS.orange, 0)} 100%`}
			/>

			{/* uscita: punto di luce + flare che lo shot successivo fa esplodere */}
			{core > 0.001 ? (
				<>
					<Bloom
						size={620 - 300 * core}
						opacity={Math.min(1, core * 1.1)}
						screen
						stops={`${alpha(COLORS.white, 1)} 0%, ${alpha(COLORS.orangeHot, 0.9)} ${6 + 6 * core}%, ${alpha(COLORS.orangeBright, 0.42)} 26%, ${alpha(COLORS.orange, 0.12)} 58%, ${alpha(COLORS.orange, 0)} 100%`}
					/>
					<Bloom
						size={300 + 1300 * core}
						height={14 + 20 * core}
						opacity={Math.min(1, core * 1.2)}
						screen
						stops={`${alpha(COLORS.white, 1)} 0%, ${alpha(COLORS.orangeHot, 0.75)} 22%, ${alpha(COLORS.orange, 0)} 100%`}
					/>
				</>
			) : null}
		</div>
	);
};

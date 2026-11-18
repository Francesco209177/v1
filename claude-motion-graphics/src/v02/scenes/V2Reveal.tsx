import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {beatPulse, clamp, ease} from '../../lib/math';
import {alpha, COLORS} from '../../theme';
import {Laptop} from '../components/Laptop';
import {Embers} from './reveal/Embers';
import {Question} from './reveal/Question';
import {ScreenChat} from './reveal/ScreenChat';
import {laptopPose} from './reveal/timing';
import {Footnote, Title} from './reveal/Title';

/** Cavo staccato sulla scrivania: connettore fermo a ~180 px dalla porta (stessa scrivania dell'apertura). */
const PLUG_OUT = 180;

/**
 * SCENA 5 · REVEAL (assoluto 720–899, locale 0–179).
 *   0   la camera esce dallo schermo e arretra sul laptop dell'apertura: cavo staccato, LED spento,
 *       chat ancora attiva con la pillola "Offline" e la risposta che continua ad arrivare;
 *   30  titolo "LA TUA AI. / SUL TUO COMPUTER." (cue assoluto 750);
 *   60  nota di accuratezza (hardware · download iniziale);
 *   135 la domanda "Tu la useresti?" prende il posto del titolo (cue assoluto 855) → cartello finale.
 */
export const V2Reveal: React.FC = () => {
	const f = useCurrentFrame();
	const abs = useAbsFrame();
	const pose = laptopPose(f);
	const pull = 1 - ease.outCubic(clamp(f / 30));
	const glow = 1.05 + 0.12 * beatPulse(abs, 5) + 0.25 * pull;
	return (
		<AbsoluteFill>
			{/* luce calda della scrivania dietro al laptop */}
			<div
				style={{
					position: 'absolute',
					left: pose.x - 700,
					top: pose.y - 560,
					width: 1400,
					height: 1120,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.2)}, ${alpha(COLORS.orangeDeep, 0.08)} 55%, ${alpha(COLORS.orangeDeep, 0)})`,
				}}
			/>
			<Embers f={f} layer="back" push={pull * 0.5} />
			{/* lo zoom della camera è un 2D esterno al contesto 3D (evita il ritaglio dei layer 3D molto grandi in Chrome) */}
			<div style={{position: 'absolute', inset: 0, transformOrigin: `${pose.x}px ${pose.y}px`, transform: `scale(${pose.zoom})`}}>
				<Laptop x={pose.x} y={pose.y} scale={pose.scale} rotX={f === 2 ? 14 : pose.rotX} rotY={f === 3 ? -14 : pose.rotY} screenGlow={glow} plugOut={f === 0 ? null : PLUG_OUT} spark={0} linkLed={0}>
					{f === 1 ? null : <ScreenChat f={f} />}
				</Laptop>
			</div>
			<Embers f={f} layer="front" push={pull * 0.8} />
			<Title f={f} />
			<Footnote f={f} />
			<Question f={f} />
		</AbsoluteFill>
	);
};

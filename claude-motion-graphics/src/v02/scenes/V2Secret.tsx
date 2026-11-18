import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {clamp, ease, invLerp} from '../../lib/math';
import {alpha, COLORS} from '../../theme';
import {NeuralNet} from '../components/NeuralNet';
import {DiveVeil, WarpStreaks} from './hook/DiveFX';
import {Circuits} from './secret/Circuits';
import {Drive, SSD} from './secret/Drive';
import {LOADED, secretNet, T} from './secret/timing';

/** Lampo dell'innesto a LOADED (assoluto 210): bagliore ellittico sulla fessura + anello + flare orizzontale. */
const LockFlash: React.FC<{L: number}> = ({L}) => {
	const d = L - LOADED;
	if (d < 0 || d > 24) return null;
	const k = Math.exp(-d / 5);
	const ring = ease.outCubic(clamp(d / 18));
	return (
		<AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
			<div
				style={{
					position: 'absolute',
					left: SSD.cx - 520,
					top: SSD.top - 160,
					width: 1040,
					height: 320,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, rgba(255,240,228,${0.75 * k}) 0%, rgba(240,147,111,${0.35 * k}) 40%, rgba(217,119,87,0) 100%)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: SSD.cx - 70 - 520 * ring,
					top: SSD.top - 22 - 80 * ring,
					width: 140 + 1040 * ring,
					height: 44 + 160 * ring,
					borderRadius: '50%',
					border: `${3 * (1 - ring) + 1}px solid ${alpha(COLORS.orangeHot, 0.8 * (1 - ring))}`,
				}}
			/>
			<div style={{position: 'absolute', left: -100, right: -100, top: SSD.top - 3, height: 6, background: `linear-gradient(90deg, rgba(255,225,205,0), rgba(255,235,220,${0.9 * k}), rgba(255,225,205,0))`}} />
		</AbsoluteFill>
	);
};

/**
 * SECRET (105–269): siamo "dentro il computer". La luce del tuffo si posa, il circuito si disegna attorno
 * a una camera dove la rete neurale si assembla; il file del modello si innesta nell'SSD e a 210 è
 * INSTALLATO IN LOCALE. Negli ultimi 30 frame tutto esce e la rete converge esattamente su V2_NET_AT_270.
 */
export const V2Secret: React.FC = () => {
	const L = useCurrentFrame();
	const abs = useAbsFrame();
	const net = secretNet(L, abs);
	const out = ease.inCubic(invLerp(T.exitStart, 158, L));
	const circOp = clamp(L / 6) * (1 - out);
	const chamber = clamp(L / 20) * (1 - out) * (0.7 + 0.5 * (L >= LOADED ? Math.exp(-(L - LOADED) / 10) : 0));
	return (
		<AbsoluteFill>
			{/* luce della camera dietro la rete */}
			<div
				style={{
					position: 'absolute',
					left: net.camera.cx - 520,
					top: net.camera.cy - 520,
					width: 1040,
					height: 1040,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.2 * chamber)} 0%, ${alpha(COLORS.orangeDeep, 0.08 * chamber)} 55%, ${alpha(COLORS.orangeDeep, 0)} 100%)`,
				}}
			/>
			<Circuits L={L} opacity={circOp} />
			<NeuralNet frame={abs} camera={net.camera} reveal={net.reveal} activity={net.activity} flash={net.flash} />
			<Drive L={L} />
			<LockFlash L={L} />
			<DiveVeil abs={abs} />
			<WarpStreaks abs={abs} />
		</AbsoluteFill>
	);
};

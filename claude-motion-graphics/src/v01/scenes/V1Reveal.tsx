import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {beatPulse, clamp, ease, prog} from '../../lib/math';
import {alpha, COLORS, FONTS} from '../../theme';
import {NeuralNet} from '../../v02/components/NeuralNet';
import {v1NetYaw} from '../timeline';
import {Caveat} from './reveal/Caveat';
import {LAYOUT, netPose, R} from './reveal/data';
import {RevealFX} from './reveal/RevealFX';
import {TextStream} from './reveal/TextStream';
import {Title} from './reveal/Title';

/**
 * SCENA 5 — REVEAL (assoluto 690–899).
 * 690: dal punto di luce nasce la rete; un fiume di frammenti di testo (illustrativi) la attraversa e la accende
 * ("Ha imparato da enormi quantità di testo", + feedback umano). 780: il flusso si condensa, "NON PENSA." sbatte dentro,
 * 795 "PREVEDE." si blocca in arancione. 840: "Può sbagliare: verifica le informazioni importanti."
 * 870–899: cartolina finale composta, la rete piccola e calma in alto, deriva lenta (nessuna dissolvenza al nero).
 */
export const V1Reveal: React.FC = () => {
	const f = useCurrentFrame();
	const abs = useAbsFrame();
	const beat = beatPulse(abs, 5);
	const net = netPose(f);
	const labelIn = prog(f, 6, 12, ease.outCubic) * (1 - prog(f, R.condense, 10, ease.inCubic));
	const aura = (0.18 + 0.5 * net.absorb + 0.6 * net.flash) * (f < R.title ? 1 : 0.55);

	return (
		<AbsoluteFill>
			{/* alone della rete: cresce con l'assorbimento */}
			<div
				style={{
					position: 'absolute',
					left: net.cx - 640 * net.scale - 120,
					top: net.cy - 640 * net.scale - 120,
					width: 1280 * net.scale + 240,
					height: 1280 * net.scale + 240,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, ${alpha(COLORS.orange, clamp(0.3 * aura + 0.05 * beat))} 0%, ${alpha(COLORS.orangeDeep, 0.1 * aura)} 50%, rgba(0,0,0,0) 100%)`,
				}}
			/>
			<NeuralNet
				frame={abs}
				camera={{cx: net.cx, cy: net.cy, scale: net.scale, yaw: v1NetYaw(abs), pitch: net.pitch, dist: net.dist}}
				reveal={net.reveal}
				activity={net.activity}
				opacity={net.brightness}
				flash={clamp(net.flash + 0.25 * beat * (f < R.title ? net.absorb : 0.4))}
			/>
			<TextStream f={f} cx={net.cx} cy={net.cy} netScale={net.scale} />

			{/* etichetta dell'addestramento */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					width: 1080,
					top: LAYOUT.labelY - 20,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 8,
					fontFamily: FONTS.mono,
					opacity: labelIn,
					transform: `translateY(${(1 - prog(f, 6, 12, ease.outCubic)) * 16}px)`,
					whiteSpace: 'nowrap',
				}}
			>
				<div style={{position: 'absolute', left: 140, right: 140, top: -40, bottom: -40, background: 'radial-gradient(closest-side, rgba(5,5,5,0.75), rgba(5,5,5,0))'}} />
				<div style={{position: 'relative', display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, fontWeight: 700, letterSpacing: '0.14em', color: COLORS.orange, textShadow: `0 0 18px ${alpha(COLORS.orange, 0.5)}`}}>
					<span style={{width: 12, height: 12, borderRadius: 3, background: COLORS.orange, boxShadow: `0 0 12px ${COLORS.orange}`}} />
					ADDESTRAMENTO
				</div>
				<div style={{position: 'relative', fontSize: 25, color: alpha(COLORS.white, 0.82), letterSpacing: '0.02em'}}>enormi quantità di testo + feedback umano</div>
			</div>

			<RevealFX f={f} />
			<Title f={f} />
			<Caveat f={f} />
		</AbsoluteFill>
	);
};

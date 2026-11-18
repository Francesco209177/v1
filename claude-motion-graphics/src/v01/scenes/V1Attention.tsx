import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {beatPulse, ease, prog} from '../../lib/math';
import {alpha, COLORS} from '../../theme';
import {NeuralNet} from '../../v02/components/NeuralNet';
import {V1_NET_AT_270, v1NetYaw} from '../timeline';
import {ArcsCanvas, WeightPills} from './attention/Arcs';
import {FxCanvas} from './attention/Fx';
import {Labels} from './attention/Labels';
import {collapseP, CUT_POINT, layerScale, netAt, T} from './attention/layout';
import {Embeddings, Tokens} from './attention/Tokens';

/**
 * SCENA 3 — ATTENTION (abs 270–479). "Ogni token diventa una lista di numeri, e la rete calcola quali parole contano di più nel contesto."
 * f 0: la rete del taglio, identica a V1_NET_AT_270 · 0–30 la rete arretra e i token riemergono in due righe
 * · 30 EMBEDDING: colonne di numeri · 90 ATTENZIONE: archi pesati (fuoco su "·sap", poi su "·cose" a 135)
 * · 150 i token entrano nella rete strato dopo strato · 197–209 collasso in un punto di luce (taglio a 480, y 760).
 */
export const V1Attention: React.FC = () => {
	const f = useCurrentFrame();
	const abs = useAbsFrame();
	const beat = beatPulse(abs, 5);
	const net = netAt(f, beat);
	const col = collapseP(f);
	const energy = prog(f, T.process, T.collapse - T.process, ease.inQuad);
	// spinta lenta della camera nell'elaborazione, poi tutto si stringe nel punto di luce
	const s = layerScale(f);
	const layer: React.CSSProperties = {
		position: 'absolute',
		left: 0,
		top: 0,
		width: 1080,
		height: 1920,
		transformOrigin: `${CUT_POINT.x}px ${CUT_POINT.y}px`,
		transform: `scale(${s})`,
		opacity: 1 - prog(f, T.end - 5, 5, ease.inQuad),
	};
	const aura = (0.15 + 0.85 * energy) * prog(f, T.process, 20) * (1 - col) + 0.25 * beat * energy;

	return (
		<AbsoluteFill>
			{/* alone caldo dietro la rete durante l'elaborazione */}
			{aura > 0.01 ? (
				<div
					style={{
						position: 'absolute',
						left: net.cx - 560,
						top: net.cy - 560,
						width: 1120,
						height: 1120,
						borderRadius: '50%',
						background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.3 * aura)} 0%, ${alpha(COLORS.orangeDeep, 0.12 * aura)} 45%, rgba(0,0,0,0) 100%)`,
					}}
				/>
			) : null}
			<NeuralNet
				frame={abs}
				camera={{cx: net.cx, cy: net.cy, scale: net.scale, yaw: v1NetYaw(abs), pitch: net.pitch, dist: net.dist}}
				reveal={V1_NET_AT_270.reveal}
				activity={net.activity}
				opacity={net.opacity}
				flash={net.flash}
				focusLayer={net.focusLayer}
			/>
			<div style={layer}>
				<ArcsCanvas f={f} beat={beat} />
			</div>
			<FxCanvas f={f} abs={abs} />
			<div style={layer}>
				<Embeddings f={f} beat={beat} />
				<Tokens f={f} beat={beat} />
				<WeightPills f={f} />
				<Labels f={f} beat={beat} />
			</div>
		</AbsoluteFill>
	);
};

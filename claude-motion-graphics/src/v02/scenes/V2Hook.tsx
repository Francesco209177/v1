import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {clamp, ease, invLerp} from '../../lib/math';
import {Laptop} from '../components/Laptop';
import {ChatScreen} from './hook/ChatScreen';
import {DiveVeil, WarpStreaks} from './hook/DiveFX';
import {hookPose, zoomSpeed} from './hook/pose';
import {TextPixels} from './hook/TextPixels';
import {linkLed, plugOut, UNPLUG} from './hook/timing';
import {OfflineBadge, UnplugFX} from './hook/UnplugFX';

/**
 * HOOK (0–104): chat con un'AI sul laptop. A 30 il cavo Ethernet viene strappato (scintilla, LED spento,
 * "Offline"), ma la risposta CONTINUA ad arrivare. Da 90 la camera si tuffa nello schermo, il testo si
 * scioglie in token luminosi e a 104 lo schermo è diventato luce: si prosegue "dentro" in V2Secret.
 */
export const V2Hook: React.FC = () => {
	const f = useCurrentFrame();
	const abs = useAbsFrame();
	const pose = hookPose(f);
	const blur = Math.min(7, zoomSpeed(f) * 16);
	const spark = f >= UNPLUG ? Math.exp(-(f - UNPLUG) / 3) : 0;
	const glow = 1 + 0.15 * Math.exp(-Math.max(0, f - UNPLUG) / 4) * (f >= UNPLUG ? 1 : 0) + 0.5 * ease.inQuad(invLerp(84, 104, f));
	return (
		<AbsoluteFill>
			<div style={{position: 'absolute', inset: 0, filter: blur > 0.3 ? `blur(${blur}px)` : undefined}}>
				<Laptop {...pose} screenGlow={glow} plugOut={plugOut(f)} spark={spark} linkLed={linkLed(f)}>
					<ChatScreen f={f} />
				</Laptop>
			</div>
			<UnplugFX f={f} />
			<OfflineBadge f={f} />
			<TextPixels f={f} />
			<DiveVeil abs={abs} />
			<WarpStreaks abs={abs} />
			{/* vignettatura extra durante il tuffo: concentra lo sguardo al centro */}
			<AbsoluteFill style={{pointerEvents: 'none', background: `radial-gradient(75% 60% at 50% 35%, rgba(5,5,5,0) 55%, rgba(5,5,5,${0.5 * clamp(invLerp(88, 98, f))}) 100%)`}} />
		</AbsoluteFill>
	);
};

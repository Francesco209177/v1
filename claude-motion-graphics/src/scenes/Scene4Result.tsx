import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {ClaudeSpark} from '../components/ClaudeSpark';
import {clamp, ease, lerp} from '../lib/math';
import {SPARK_POSE} from '../timeline';
import {Shot1Kinetic} from './scene4/Shot1Kinetic';
import {Shot2Transitions} from './scene4/Shot2Transitions';
import {Shot3ThreeD} from './scene4/Shot3ThreeD';
import {Shot4Light} from './scene4/Shot4Light';
import {Shot5Complex} from './scene4/Shot5Complex';
import {SHOTS} from './scene4/stage';

const COMPONENTS = [Shot1Kinetic, Shot2Transitions, Shot3ThreeD, Shot4Light, Shot5Complex];

/** SEGNAPOSTO — shell della scena 4: monta i 5 shot in sequenza + spark narratore. */
export const Scene4Result: React.FC = () => {
	const frame = useCurrentFrame();
	const t = ease.outQuint(clamp(frame / 12));
	const a = SPARK_POSE.creationEnd;
	const b = SPARK_POSE.resultEnd;
	return (
		<AbsoluteFill>
			{SHOTS.map((s, i) => {
				const Shot = COMPONENTS[i];
				return (
					<Sequence key={s.id} from={s.start} durationInFrames={s.len} layout="none">
						<Shot />
					</Sequence>
				);
			})}
			<ClaudeSpark x={lerp(a.x, b.x, t)} y={lerp(a.y, b.y, t)} size={lerp(a.size, b.size, t)} />
		</AbsoluteFill>
	);
};

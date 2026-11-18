import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ClaudeSpark} from '../components/ClaudeSpark';
import {lerp, ease, clamp} from '../lib/math';
import {SCENES, SPARK_POSE} from '../timeline';

/** SEGNAPOSTO — da sostituire. Interpola lo spark tra le pose di confine. */
export const Scene3Creation: React.FC = () => {
	const frame = useCurrentFrame();
	const t = ease.inOutCubic(clamp(frame / (SCENES.creation.length - 1)));
	const a = SPARK_POSE.ideaEnd;
	const b = SPARK_POSE.creationEnd;
	return (
		<AbsoluteFill>
			<ClaudeSpark x={lerp(a.x, b.x, t)} y={lerp(a.y, b.y, t)} size={lerp(a.size, b.size, t)} />
		</AbsoluteFill>
	);
};

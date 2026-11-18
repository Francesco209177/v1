import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {FONTS} from '../../theme';
import {C4} from '../theme';

/** SEGNAPOSTO — da sostituire. useCurrentFrame() = frame relativo alla scena. */
export const V4Hook: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.mono, fontSize: 40, color: C4.grayDim}}>
			V4Hook · {frame}
		</AbsoluteFill>
	);
};

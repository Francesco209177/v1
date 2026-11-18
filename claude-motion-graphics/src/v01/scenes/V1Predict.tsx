import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {COLORS, FONTS} from '../../theme';

/** SEGNAPOSTO — da sostituire. useCurrentFrame() = frame relativo alla scena. */
export const V1Predict: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.mono, fontSize: 40, color: COLORS.grayDim}}>
			V1Predict · {frame}
		</AbsoluteFill>
	);
};

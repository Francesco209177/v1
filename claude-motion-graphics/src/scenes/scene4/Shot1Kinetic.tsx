import React from 'react';
import {useCurrentFrame} from 'remotion';
import {COLORS, FONTS} from '../../theme';
import {STAGE} from './stage';

/** SEGNAPOSTO — da sostituire. useCurrentFrame() = frame relativo allo shot (0..len-1). */
export const Shot1Kinetic: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<div style={{position: 'absolute', left: STAGE.x, top: STAGE.y, width: STAGE.w, height: STAGE.h, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.mono, fontSize: 40, color: COLORS.grayDim}}>
			Shot1Kinetic · {frame}
		</div>
	);
};

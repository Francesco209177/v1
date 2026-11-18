// File TEMPORANEO di verifica (da cancellare): riferimento "solo ClaudeSpark alla posa di confine".
import React from 'react';
import {AbsoluteFill, Composition, registerRoot} from 'remotion';
import {Background} from '../../components/Background';
import {ClaudeSpark} from '../../components/ClaudeSpark';
import {Grain} from '../../components/Grain';
import {loadFonts} from '../../fonts';
import {AbsFrameProvider} from '../../lib/frame';
import {FPS, HEIGHT, SPARK_POSE, WIDTH} from '../../timeline';

loadFonts();
const P = SPARK_POSE.introEnd;
const Ref: React.FC = () => (
	<AbsFrameProvider offset={0}>
		<AbsoluteFill style={{backgroundColor: '#050505'}}>
			<Background />
			<ClaudeSpark x={P.x} y={P.y} size={P.size} />
			<Grain />
		</AbsoluteFill>
	</AbsFrameProvider>
);
registerRoot(() => <Composition id="Ref" component={Ref} durationInFrames={120} fps={FPS} width={WIDTH} height={HEIGHT} />);

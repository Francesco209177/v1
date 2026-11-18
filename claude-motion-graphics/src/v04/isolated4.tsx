import React from 'react';
import {AbsoluteFill, Composition} from 'remotion';
import {Grain} from '../components/Grain';
import {loadFonts} from '../fonts';
import {AbsFrameProvider} from '../lib/frame';
import {FPS, HEIGHT, WIDTH} from '../timeline';
import {Background04} from './components/Background04';
import {C4} from './theme';

/** Scena del video 04 isolata, con lo stesso sfondo cyber del Main (`offset` = frame assoluto di inizio). */
export const isolated4 = (Scene: React.FC, offset: number, threat = 0.5): React.FC => {
	const Isolated: React.FC = () => (
		<AbsFrameProvider offset={offset}>
			<AbsoluteFill style={{backgroundColor: C4.black}}>
				<Background04 threat={threat} />
				<Scene />
				<Grain />
			</AbsoluteFill>
		</AbsFrameProvider>
	);
	return Isolated;
};

export const isolated4Root = (id: string, Scene: React.FC, offset: number, duration: number, threat = 0.5): React.FC => {
	loadFonts();
	const Comp = isolated4(Scene, offset, threat);
	const R: React.FC = () => <Composition id={id} component={Comp} durationInFrames={duration} fps={FPS} width={WIDTH} height={HEIGHT} />;
	return R;
};

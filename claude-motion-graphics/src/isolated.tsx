import React from 'react';
import {AbsoluteFill, Composition} from 'remotion';
import {Background} from './components/Background';
import {Grain} from './components/Grain';
import {loadFonts} from './fonts';
import {AbsFrameProvider} from './lib/frame';
import {FPS, HEIGHT, WIDTH} from './timeline';

/** Avvolge una scena con lo stesso sfondo/grana del Main: `offset` = frame assoluto di inizio. */
export const isolated = (Scene: React.FC, offset: number): React.FC => {
	const Isolated: React.FC = () => (
		<AbsFrameProvider offset={offset}>
			<AbsoluteFill style={{backgroundColor: '#050505'}}>
				<Background />
				<Scene />
				<Grain />
			</AbsoluteFill>
		</AbsFrameProvider>
	);
	return Isolated;
};

/** Root con UNA sola composition: usata dagli entry in src/entries per anteprime indipendenti. */
export const isolatedRoot = (id: string, Scene: React.FC, offset: number, duration: number): React.FC => {
	loadFonts();
	const Comp = isolated(Scene, offset);
	const R: React.FC = () => (
		<Composition id={id} component={Comp} durationInFrames={duration} fps={FPS} width={WIDTH} height={HEIGHT} />
	);
	return R;
};

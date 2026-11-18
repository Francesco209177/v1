import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {Background} from './components/Background';
import {Grain} from './components/Grain';
import {TransitionFX} from './components/TransitionFX';
import {AbsFrameProvider} from './lib/frame';
import {Scene1Intro} from './scenes/Scene1Intro';
import {Scene2Idea} from './scenes/Scene2Idea';
import {Scene3Creation} from './scenes/Scene3Creation';
import {Scene4Result} from './scenes/Scene4Result';
import {Scene5Outro} from './scenes/Scene5Outro';
import {SCENES} from './timeline';

/** Timeline completa del reel: 5 scene in sequenza su uno sfondo continuo + musica. */
export const Main: React.FC = () => {
	const seq = (name: keyof typeof SCENES, Scene: React.FC) => (
		<Sequence from={SCENES[name].start} durationInFrames={SCENES[name].length} name={name} layout="none">
			<Scene />
		</Sequence>
	);
	return (
		<AbsFrameProvider>
			<AbsoluteFill style={{backgroundColor: '#050505'}}>
				<Background />
				{seq('intro', Scene1Intro)}
				{seq('idea', Scene2Idea)}
				{seq('creation', Scene3Creation)}
				{seq('result', Scene4Result)}
				{seq('outro', Scene5Outro)}
				<TransitionFX />
				<Grain />
				<Audio src={staticFile('music.wav')} />
			</AbsoluteFill>
		</AbsFrameProvider>
	);
};

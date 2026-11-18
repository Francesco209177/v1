import React from 'react';
import {Composition} from 'remotion';
import {loadFonts} from './fonts';
import {isolated} from './isolated';
import {Kit} from './Kit';
import {Main} from './Main';
import {Scene1Intro} from './scenes/Scene1Intro';
import {Scene2Idea} from './scenes/Scene2Idea';
import {Scene3Creation} from './scenes/Scene3Creation';
import {Scene4Result} from './scenes/Scene4Result';
import {Scene5Outro} from './scenes/Scene5Outro';
import {DURATION, FPS, HEIGHT, SCENES, WIDTH} from './timeline';

loadFonts();

const S1 = isolated(Scene1Intro, SCENES.intro.start);
const S2 = isolated(Scene2Idea, SCENES.idea.start);
const S3 = isolated(Scene3Creation, SCENES.creation.start);
const S4 = isolated(Scene4Result, SCENES.result.start);
const S5 = isolated(Scene5Outro, SCENES.outro.start);

export const Root: React.FC = () => {
	const common = {fps: FPS, width: WIDTH, height: HEIGHT};
	return (
		<>
			<Composition id="Main" component={Main} durationInFrames={DURATION} {...common} />
			<Composition id="Kit" component={Kit} durationInFrames={30} {...common} />
			<Composition id="Scene1" component={S1} durationInFrames={SCENES.intro.length} {...common} />
			<Composition id="Scene2" component={S2} durationInFrames={SCENES.idea.length} {...common} />
			<Composition id="Scene3" component={S3} durationInFrames={SCENES.creation.length} {...common} />
			<Composition id="Scene4" component={S4} durationInFrames={SCENES.result.length} {...common} />
			<Composition id="Scene5" component={S5} durationInFrames={SCENES.outro.length} {...common} />
		</>
	);
};

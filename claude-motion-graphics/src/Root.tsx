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
import {V1Main, V1_SCENE_COMPONENTS} from './v01/Main';
import {V1_DURATION, V1_SCENES} from './v01/timeline';
import {V2Main, V2_SCENE_COMPONENTS} from './v02/Main';
import {isolated4} from './v04/isolated4';
import {V4Main, V4_SCENE_COMPONENTS} from './v04/Main';
import {V4_DURATION, V4_SCENES} from './v04/timeline';
import {V2_DURATION, V2_SCENES} from './v02/timeline';

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
			{/* VIDEO 01 — Come funziona davvero ChatGPT? */}
			<Composition id="V01" component={V1Main} durationInFrames={V1_DURATION} {...common} />
			{(Object.keys(V1_SCENES) as (keyof typeof V1_SCENES)[]).map((k, i) => (
				<Composition key={k} id={`V01S${i + 1}`} component={isolated(V1_SCENE_COMPONENTS[k], V1_SCENES[k].start)} durationInFrames={V1_SCENES[k].length} {...common} />
			))}
			{/* VIDEO 02 — Un'intelligenza artificiale senza Internet? */}
			<Composition id="V02" component={V2Main} durationInFrames={V2_DURATION} {...common} />
			{(Object.keys(V2_SCENES) as (keyof typeof V2_SCENES)[]).map((k, i) => (
				<Composition key={k} id={`V02S${i + 1}`} component={isolated(V2_SCENE_COMPONENTS[k], V2_SCENES[k].start)} durationInFrames={V2_SCENES[k].length} {...common} />
			))}
			{/* VIDEO 04 — Phishing: come possono rubarti le credenziali? */}
			<Composition id="V04" component={V4Main} durationInFrames={V4_DURATION} {...common} />
			{(Object.keys(V4_SCENES) as (keyof typeof V4_SCENES)[]).map((k, i) => (
				<Composition key={k} id={`V04S${i + 1}`} component={isolated4(V4_SCENE_COMPONENTS[k], V4_SCENES[k].start, i < 3 ? 0.85 : 0.1)} durationInFrames={V4_SCENES[k].length} {...common} />
			))}
		</>
	);
};

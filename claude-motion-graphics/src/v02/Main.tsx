import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {Background} from '../components/Background';
import {Grain} from '../components/Grain';
import {AbsFrameProvider} from '../lib/frame';
import {CutFlash} from './components/CutFlash';
import {Subtitles} from './components/Subtitles';
import {V2Benefits} from './scenes/V2Benefits';
import {V2Hook} from './scenes/V2Hook';
import {V2How} from './scenes/V2How';
import {V2Reveal} from './scenes/V2Reveal';
import {V2Secret} from './scenes/V2Secret';
import {V2_CUES, V2_SCENES} from './timeline';

export const V2_SCENE_COMPONENTS: Record<keyof typeof V2_SCENES, React.FC> = {
	hook: V2Hook,
	secret: V2Secret,
	how: V2How,
	benefits: V2Benefits,
	reveal: V2Reveal,
};

/** Video 02 completo: sfondo continuo, 5 scene, sottotitoli della voce, audio (musica + voce già mixate). */
export const V2Main: React.FC<{withAudio?: boolean}> = ({withAudio = false}) => (
	<AbsFrameProvider>
		<AbsoluteFill style={{backgroundColor: '#050505'}}>
			<Background />
			{(Object.keys(V2_SCENES) as (keyof typeof V2_SCENES)[]).map((k) => {
				const S = V2_SCENE_COMPONENTS[k];
				return (
					<Sequence key={k} from={V2_SCENES[k].start} durationInFrames={V2_SCENES[k].length} name={k} layout="none">
						<S />
					</Sequence>
				);
			})}
			<CutFlash />
			{/* da 28,5 s la domanda finale è già a tutto schermo: niente sottotitolo doppione */}
			<Subtitles hidden={(f) => f >= V2_CUES.question - 3} />
			<Grain />
			{withAudio ? <Audio src={staticFile('v02/audio_final.wav')} /> : null}
		</AbsoluteFill>
	</AbsFrameProvider>
);

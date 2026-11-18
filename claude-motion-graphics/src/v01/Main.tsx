import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {Background} from '../components/Background';
import {Grain} from '../components/Grain';
import {AbsFrameProvider} from '../lib/frame';
import {CutFlash} from '../v02/components/CutFlash';
import {Subtitles} from '../v02/components/Subtitles';
import {V1Attention} from './scenes/V1Attention';
import {V1Hook} from './scenes/V1Hook';
import {V1Predict} from './scenes/V1Predict';
import {V1Reveal} from './scenes/V1Reveal';
import {V1Tokens} from './scenes/V1Tokens';
import {V1_SCENES, V1_SUB_Y, V1_VO} from './timeline';

export const V1_SCENE_COMPONENTS: Record<keyof typeof V1_SCENES, React.FC> = {
	hook: V1Hook,
	tokens: V1Tokens,
	attention: V1Attention,
	predict: V1Predict,
	reveal: V1Reveal,
};

/** Colpi di luce sui tagli principali (il taglio 90 è un tuffo continuo nello schermo: niente lampo). */
const CUTS = [
	{at: V1_SCENES.attention.start, power: 0.8, y: 760},
	{at: V1_SCENES.predict.start, power: 0.85, y: 760},
	{at: V1_SCENES.reveal.start, power: 0.8, y: 760},
];

/** Video 01 completo: sfondo continuo, 5 scene, lampi sui tagli, sottotitoli della voce. L'audio è unito dopo il render. */
export const V1Main: React.FC = () => (
	<AbsFrameProvider>
		<AbsoluteFill style={{backgroundColor: '#050505'}}>
			<Background />
			{(Object.keys(V1_SCENES) as (keyof typeof V1_SCENES)[]).map((k) => {
				const S = V1_SCENE_COMPONENTS[k];
				return (
					<Sequence key={k} from={V1_SCENES[k].start} durationInFrames={V1_SCENES[k].length} name={k} layout="none">
						<S />
					</Sequence>
				);
			})}
			<CutFlash cuts={CUTS} />
			<Subtitles lines={V1_VO} y={V1_SUB_Y} />
			<Grain />
		</AbsoluteFill>
	</AbsFrameProvider>
);

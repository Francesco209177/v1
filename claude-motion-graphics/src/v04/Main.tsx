import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {Grain} from '../components/Grain';
import {AbsFrameProvider, useAbsFrame} from '../lib/frame';
import {clamp} from '../lib/math';
import {CutFlash} from '../v02/components/CutFlash';
import {Subtitles} from '../v02/components/Subtitles';
import {Background04} from './components/Background04';
import {V4Defend} from './scenes/V4Defend';
import {V4Finale} from './scenes/V4Finale';
import {V4Hook} from './scenes/V4Hook';
import {V4How} from './scenes/V4How';
import {V4Trap} from './scenes/V4Trap';
import {C4} from './theme';
import {V4_CUES, V4_SCENES, V4_SUB_Y, V4_VO} from './timeline';

export const V4_SCENE_COMPONENTS: Record<keyof typeof V4_SCENES, React.FC> = {
	hook: V4Hook,
	trap: V4Trap,
	how: V4How,
	defend: V4Defend,
	finale: V4Finale,
};

/** Equilibrio delle luci ambientali: minaccia (rosso) nella prima metà, difesa (verde) dalla seconda. */
const threatAt = (f: number): number => clamp(1 - (f - 500) / 40) * 0.85 + 0.15 * clamp(1 - (f - 700) / 60);

const Ambient: React.FC = () => <Background04 threat={threatAt(useAbsFrame())} />;

/** Lampi sui tagli: rossi nella parte "minaccia", verdi da quando arriva lo scudo. */
const RED_CUTS = [
	{at: V4_SCENES.trap.start, power: 0.6, y: 760},
	{at: V4_SCENES.how.start, power: 0.8, y: 760},
];
const GREEN_CUTS = [
	{at: V4_SCENES.defend.start, power: 0.9, y: 760},
	{at: V4_SCENES.finale.start, power: 0.8, y: 760},
];

/** Video 04 completo: sfondo cyber continuo, 5 scene, lampi sui tagli, sottotitoli. L'audio è unito dopo il render. */
export const V4Main: React.FC = () => (
	<AbsFrameProvider>
		<AbsoluteFill style={{backgroundColor: C4.black}}>
			<Ambient />
			{(Object.keys(V4_SCENES) as (keyof typeof V4_SCENES)[]).map((k) => {
				const S = V4_SCENE_COMPONENTS[k];
				return (
					<Sequence key={k} from={V4_SCENES[k].start} durationInFrames={V4_SCENES[k].length} name={k} layout="none">
						<S />
					</Sequence>
				);
			})}
			<CutFlash cuts={RED_CUTS} core="255,170,172" mid="240,53,59" edge="255,205,206" />
			<CutFlash cuts={GREEN_CUTS} core="190,255,220" mid="34,212,122" edge="210,255,230" />
			{/* da 28 s la domanda finale è già a tutto schermo: niente sottotitolo doppione */}
			<Subtitles lines={V4_VO} y={V4_SUB_Y} accent={C4.green} hidden={(f) => f >= V4_CUES.question - 14} />
			<Grain />
		</AbsoluteFill>
	</AbsFrameProvider>
);

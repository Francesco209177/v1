import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {Caption} from '../components/Caption';
import {CutAccent} from './scene4/shell-accents';
import {ProgressBar, ShotLabel} from './scene4/shell-hud';
import {NarratorSpark, ShellFX} from './scene4/shell-spark';
import {HUD_OUT} from './scene4/shell-timing';
import {Shot1Kinetic} from './scene4/Shot1Kinetic';
import {Shot2Transitions} from './scene4/Shot2Transitions';
import {Shot3ThreeD} from './scene4/Shot3ThreeD';
import {Shot4Light} from './scene4/Shot4Light';
import {Shot5Complex} from './scene4/Shot5Complex';
import {SHOTS} from './scene4/stage';

const COMPONENTS = [Shot1Kinetic, Shot2Transitions, Shot3ThreeD, Shot4Light, Shot5Complex];

/**
 * SCENA 4 · IL RISULTATO (f 480–719, il DROP): showreel di cinque esempi tagliati sul beat.
 * Questa shell tiene insieme la sequenza:
 *   - lo spark si sgancia dal centro (posa di fine scena 3) e diventa narratore sopra il palco,
 *     reagendo a ogni cambio shot;
 *   - i cinque shot montati in sequenza sul palco condiviso (vedi scene4/stage.ts);
 *   - accento di luce sui tagli, etichetta dello shot, barra di avanzamento, caption.
 * Dal frame 232 resta solo lo spark in SPARK_POSE.resultEnd => match-cut con la scena 5.
 */
export const Scene4Result: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill>
			{SHOTS.map((shot, i) => {
				const Shot = COMPONENTS[i];
				return (
					<Sequence key={shot.id} from={shot.start} durationInFrames={shot.len} name={shot.label} layout="none">
						<Shot />
					</Sequence>
				);
			})}
			<CutAccent frame={frame} />
			<ShellFX frame={frame} />
			<Caption
				text={"Dall'idea al video,\ntutto attraverso il codice."}
				highlight={['codice.']}
				inAt={10}
				wordAt={[10, 13, 16, 96, 99, 102, 105]}
				outAt={HUD_OUT}
			/>
			<ShotLabel frame={frame} />
			<ProgressBar frame={frame} />
			<NarratorSpark frame={frame} />
		</AbsoluteFill>
	);
};

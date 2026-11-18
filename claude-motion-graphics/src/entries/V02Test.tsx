import React from 'react';
import {registerRoot} from 'remotion';
import {useCurrentFrame} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Laptop} from '../v02/components/Laptop';
import {NeuralNet} from '../v02/components/NeuralNet';
import {COLORS, FONTS} from '../theme';

/** Tavola di prova dei componenti del video 02 (non fa parte del video). */
const Test: React.FC = () => {
	const f = useCurrentFrame();
	return (
		<>
			<NeuralNet frame={f} camera={{cy: 1450, scale: 0.85, yaw: f / 40}} activity={0.7} />
			<Laptop x={540} y={620} scale={0.95} plugOut={f > 15 ? (f - 15) * 14 : 0} spark={f > 15 && f < 25 ? 1 - (f - 15) / 10 : 0} linkLed={f > 15 ? 0 : 1}>
				<div style={{padding: 30, color: COLORS.white, fontFamily: FONTS.display, fontSize: 30}}>Ciao! Come posso aiutarti?</div>
			</Laptop>
		</>
	);
};
registerRoot(isolatedRoot('V02Test', Test, 0, 60));

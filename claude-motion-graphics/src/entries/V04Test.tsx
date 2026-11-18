import React from 'react';
import {registerRoot} from 'remotion';
import {FakeMessage} from '../v04/components/FakeMessage';
import {Phone} from '../v04/components/Phone';
import {Shield} from '../v04/components/Shield';
import {isolated4Root} from '../v04/isolated4';

/** Tavola di prova dei componenti del video 04 (non fa parte del video). */
const Test: React.FC = () => (
	<>
		<Phone x={300} y={560} scale={0.75} alarm={0}>
			<div style={{padding: '120px 26px', color: '#F2F6F4', fontSize: 30}}>Schermata di blocco</div>
		</Phone>
		<Shield x={820} y={480} size={360} />
		<FakeMessage x={540} y={1260} width={820} linkReveal={1} suspicious={1} />
	</>
);
registerRoot(isolated4Root('V04Test', Test, 0, 30, 0.6));

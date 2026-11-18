import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Background} from './components/Background';
import {Caption} from './components/Caption';
import {ClaudeSpark} from './components/ClaudeSpark';
import {Grain} from './components/Grain';
import {CodeBlock, TerminalWindow} from './components/TerminalWindow';
import {AbsFrameProvider} from './lib/frame';
import {COLORS} from './theme';
import {SPARK_POSE} from './timeline';

/** Tavola di riferimento del kit condiviso (spark, finestra codice, caption) + test WebGL. */
export const Kit: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsFrameProvider offset={269}>
			<AbsoluteFill style={{backgroundColor: '#050505'}}>
				<Background />
				<ClaudeSpark {...SPARK_POSE.ideaEnd} />
				<TerminalWindow>
					<CodeBlock />
				</TerminalWindow>
				<Caption text={'Tutto parte da un\nsemplice prompt.'} highlight={['prompt']} inAt={-40} outAt={999} />
				<div style={{position: 'absolute', left: 390, top: 1480, width: 300, height: 300}}>
					<ThreeCanvas width={300} height={300} camera={{position: [0, 0, 4], fov: 40}}>
						<ambientLight intensity={0.4} />
						<pointLight position={[3, 3, 4]} intensity={60} color={COLORS.orangeHot} />
						<mesh rotation={[0.5 + frame / 30, 0.7 + frame / 20, 0]}>
							<torusKnotGeometry args={[0.8, 0.28, 128, 24]} />
							<meshStandardMaterial color={COLORS.orange} roughness={0.3} metalness={0.6} />
						</mesh>
					</ThreeCanvas>
				</div>
				<Grain />
			</AbsoluteFill>
		</AbsFrameProvider>
	);
};

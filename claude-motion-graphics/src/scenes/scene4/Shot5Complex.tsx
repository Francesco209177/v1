import React, {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {FrameCanvas} from '../../components/FrameCanvas';
import {drawSystem} from './shot5-draw';
import {buildSystem} from './shot5-system';

/**
 * SCENA 4 · SHOT 5 — "ANIMAZIONI COMPLESSE" (60 frame, assoluti 660..719).
 * Un unico sistema procedurale di ~1800 particelle additive in pseudo-3D che, a ogni beat,
 * si ricompone in una nuova forma: orbite → reticolo esagonale → onda → spark di Claude,
 * per poi esplodere oltre i bordi del palco (la scena 5 richiama tutto verso lo spark).
 * Tutto è funzione pura del frame: vedi shot5-system.ts (forme e traiettorie),
 * shot5-timing.ts (tempi e camera) e shot5-draw.ts (resa su canvas).
 */
export const Shot5Complex: React.FC = () => {
	const frame = useCurrentFrame();
	const system = useMemo(() => buildSystem(), []);
	return <FrameCanvas frame={frame} additive draw={(ctx) => drawSystem(ctx, system, frame)} />;
};

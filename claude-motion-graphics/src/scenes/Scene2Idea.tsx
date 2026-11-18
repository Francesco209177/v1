import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Caption} from '../components/Caption';
import {ClaudeSpark} from '../components/ClaudeSpark';
import {FrameCanvas} from '../components/FrameCanvas';
import {CodeBlock, TerminalWindow} from '../components/TerminalWindow';
import {useAbsFrame} from '../lib/frame';
import {ease, prog} from '../lib/math';
import {SPARK_POSE} from '../timeline';
import {CodeReveal} from './scene2/CodeReveal';
import {Composer} from './scene2/Composer';
import {GlyphLayer} from './scene2/GlyphLayer';
import {drawLight} from './scene2/light';
import {sparkState} from './scene2/spark';
import {StatusLine} from './scene2/StatusLine';
import {T} from './scene2/timing';
import {WindowStage} from './scene2/WindowStage';

/** Scie di movimento dello spark durante il volo: copie a frazioni di frame precedenti. */
const GHOSTS = [
	{dt: 0.25, opacity: 0.34},
	{dt: 0.5, opacity: 0.24},
	{dt: 0.75, opacity: 0.15},
	{dt: 1, opacity: 0.08},
];

/**
 * SCENA 2 · L'IDEA (locale 0–149 = assoluto 120–269).
 * Lo spark prende vita e sale a fare da narratore; sotto di lui una linea di luce si apre nella
 * finestra di Claude Code; il prompt viene digitato, arricchito di istruzioni e, sull'INVIO (cue 210),
 * i suoi caratteri si rimescolano e si ri-impaginano fino a diventare codice.
 * Livelli, dal basso: spark (a riposo) → finestra e contenuto → luce additiva → spark in volo → caption.
 */
export const Scene2Idea: React.FC = () => {
	const frame = useCurrentFrame();
	const abs = useAbsFrame();

	// stato di confine letterale, consegnato identico alla scena 3
	if (frame >= T.hold) {
		return (
			<AbsoluteFill>
				<ClaudeSpark {...SPARK_POSE.ideaEnd} />
				<TerminalWindow>
					<CodeBlock />
				</TerminalWindow>
			</AbsoluteFill>
		);
	}

	const s = sparkState(frame);
	const flying = frame > T.anticEnd && frame < T.spinEnd;
	// durante il volo lo spark passa SOPRA la finestra; poi torna sotto (come nello stato di confine)
	const over = 1 - prog(frame, T.spinEnd, 10, ease.inOutSine);

	return (
		<AbsoluteFill>
			{frame >= T.spinEnd ? <ClaudeSpark x={s.x} y={s.y} size={s.size} rotation={s.rotation} scale={s.scale} glow={s.glow} /> : null}

			<WindowStage frame={frame}>
				<CodeReveal frame={frame} />
				<Composer frame={frame} beat={abs} />
				<GlyphLayer frame={frame} />
				<StatusLine frame={frame} />
			</WindowStage>

			{frame >= T.land && frame < T.calm ? <FrameCanvas additive draw={(ctx) => drawLight(ctx, frame)} /> : null}

			{flying
				? GHOSTS.map((g) => {
						const p = sparkState(frame - g.dt);
						return <ClaudeSpark key={g.dt} x={p.x} y={p.y} size={p.size} rotation={p.rotation} scale={p.scale} opacity={g.opacity} glow={0} halo={false} />;
					})
				: null}
			{over > 0 ? <ClaudeSpark x={s.x} y={s.y} size={s.size} rotation={s.rotation} scale={s.scale} glow={s.glow} opacity={over} /> : null}

			<Caption text={'Tutto parte da un\nsemplice prompt.'} highlight={['prompt.']} inAt={T.captionIn} outAt={T.captionOut} />
		</AbsoluteFill>
	);
};

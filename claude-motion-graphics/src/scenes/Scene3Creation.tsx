import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Caption} from '../components/Caption';
import {ClaudeSpark} from '../components/ClaudeSpark';
import {FrameCanvas} from '../components/FrameCanvas';
import {clamp} from '../lib/math';
import {CodeWindow} from './scene3/CodeWindow';
import {CurveElement} from './scene3/CurveElement';
import {FlyingTokens} from './scene3/FlyingTokens';
import {drawBack, drawFront} from './scene3/fx';
import {GlowSweep} from './scene3/GlowSweep';
import {elementPose, gatherK} from './scene3/layout';
import {ShapesElement} from './scene3/ShapesElement';
import {sparkState} from './scene3/sparkPath';
import {Storyboard} from './scene3/Storyboard';
import {TextElement} from './scene3/TextElement';
import {CARD_ORDER, ElementId, T} from './scene3/timing';
import {WipeElement} from './scene3/WipeElement';

/** Contenitore di un elemento vivente: applica la posa (posizione, scala, luminosità) del frame. */
const Living: React.FC<{id: ElementId; children: (p: {lit: number; weight: number; tempo: number; gather: number}) => React.ReactNode}> = ({id, children}) => {
	const f = useCurrentFrame();
	const pose = elementPose(id, f);
	if (!pose.visible || pose.alpha <= 0.003 || pose.scale <= 0.003) return null;
	return (
		<div
			style={{
				position: 'absolute',
				left: pose.x,
				top: pose.y,
				width: 0,
				height: 0,
				transform: `rotate(${pose.rot}deg) scale(${pose.scale})`,
				opacity: pose.alpha,
			}}
		>
			{children({
				lit: pose.lit,
				// i tratti restano leggibili anche quando l'elemento è rimpicciolito nella card
				weight: 1 / clamp(pose.scale, 0.58, 1.2),
				tempo: f >= T.lock ? 2 : 1,
				gather: gatherK(CARD_ORDER.indexOf(id), f),
			})}
		</div>
	);
};

/**
 * SCENA 3 — LA CREAZIONE (abs 270–479).
 *  A · 0–70    il codice prende vita: i token si staccano e diventano ciò che descrivono
 *  B · 70–140  genera animazioni: lo spark vola da un elemento all'altro e li accende sul beat
 *  C · 140–195 costruisce ogni scena: storyboard di 5 card + timeline, lo spark è il playhead
 *  195–209     implosione nello spark, che si carica sulla posa di confine (glow 1.6)
 */
export const Scene3Creation: React.FC = () => {
	const f = useCurrentFrame();
	const spark = sparkState(f);
	// ghost di movimento: copie piatte dello spark lungo la traiettoria appena percorsa
	const blur = clamp((spark.speed - 14) / 40);
	return (
		<AbsoluteFill>
			<CodeWindow />
			<Storyboard />
			<FrameCanvas additive draw={(ctx, {frame}) => drawBack(ctx, frame)} />

			<Living id="G">{(p) => <WipeElement frame={f} lit={p.lit} weight={p.weight} tempo={p.tempo} />}</Living>
			<Living id="C">{(p) => <CurveElement frame={f} weight={p.weight} tempo={p.tempo} label={1 - p.gather} />}</Living>
			<Living id="S">{(p) => <ShapesElement frame={f} lit={p.lit} weight={p.weight} tempo={p.tempo} />}</Living>
			<Living id="T">{(p) => <TextElement frame={f} lit={p.lit} tempo={p.tempo} />}</Living>

			<GlowSweep />
			<FlyingTokens />

			{blur > 0.02
				? [3, 2, 1].map((k) => {
						const g = sparkState(f - k * 0.5);
						return <ClaudeSpark key={k} x={g.x} y={g.y} size={g.size} rotation={g.rotation} glow={0} halo={false} opacity={blur * (0.34 - k * 0.08)} />;
					})
				: null}
			<ClaudeSpark x={spark.x} y={spark.y} size={spark.size} rotation={spark.rotation} glow={spark.glow} />

			<FrameCanvas additive draw={(ctx, {frame}) => drawFront(ctx, frame)} />

			<Caption
				text={'Claude scrive il codice,\ngenera animazioni\ne costruisce ogni scena.'}
				highlight={['codice,', 'animazioni', 'scena.']}
				inAt={8}
				outAt={T.captionOut}
				wordAt={[8, 11, 14, 17, 74, 77, 144, 147, 150, 153]}
				size={68}
			/>
		</AbsoluteFill>
	);
};

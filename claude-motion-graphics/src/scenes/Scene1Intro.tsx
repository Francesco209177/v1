import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Caption} from '../components/Caption';
import {ClaudeSpark} from '../components/ClaudeSpark';
import {FrameCanvas} from '../components/FrameCanvas';
import {useAbsFrame} from '../lib/frame';
import {ease, invLerp, lerp, tween} from '../lib/math';
import {SPARK_VIEWBOX} from '../lib/spark';
import {COLORS} from '../theme';
import {buildEmbers, buildMotes, drawEmbers, drawImplosion, drawMotes, drawRings, drawRipples} from './scene1/impact';
import {CoreGlow, ImpactBloom, LightRays} from './scene1/Light';
import {cameraScale, cameraShake, flash, heat, HUB, POSE, sparkBreath, sparkPop, T} from './scene1/motion';
import {buildSwarm, drawSwarm} from './scene1/swarm';

const PARTICLES = 1400;
const EMBERS = 80;
const MOTES = 14;
/** Raggio (viewBox) a cui la maschera `reveal` di ClaudeSpark è completamente aperta. */
const REVEAL_FULL = 17.5 / SPARK_VIEWBOX;

/**
 * SCENA 1 · INTRO (0–119) — dal nero, particelle arancioni convergono a spirale e compongono
 * il simbolo di Claude; sul cue (f 75) impatto di luce e il simbolo prende vita.
 * Livelli, dal basso: velo nero → raggi → anelli e orbite (dietro) → luce → spark → particelle/braci → bloom → titolo.
 */
export const Scene1Intro: React.FC = () => {
	const frame = useCurrentFrame();
	const abs = useAbsFrame();

	const swarm = useMemo(() => buildSwarm(PARTICLES, 7), []);
	const embers = useMemo(() => buildEmbers(EMBERS, 23), []);
	const motes = useMemo(() => buildMotes(MOTES, 5), []);

	// apertura dal nero vero: il velo copre lo sfondo globale, poi la stanza si accende
	const cover = tween(frame, T.coverHold, T.coverGone, 1, 0, ease.inOutSine);

	// scala del simbolo (respiro sul beat × colpo): la stessa per particelle, braci e ClaudeSpark
	const pop = sparkPop(frame);
	const k = pop * sparkBreath(abs);

	// handoff particelle → spark solido: affiora dal mozzo seguendo il fronte di arrivo delle particelle
	const formed = frame >= T.formed;
	const sparkOpacity = tween(frame, T.handoff, T.formed, 0, 1, ease.inQuad);
	const reveal = formed ? 1 : lerp(0.1, (swarm.rMax / REVEAL_FULL) * 1.02, invLerp(T.formed - 16, T.formed, frame));
	const hot = heat(frame);

	const post = frame >= T.formed && frame < T.extrasGone;
	const swarmOn = frame > 0 && frame < T.swarmGone;
	const backOn = frame >= T.implode && frame < T.extrasGone;
	const cam = cameraScale(frame);
	const shake = cameraShake(frame);
	const titleDrift = lerp(8, -8, invLerp(T.titleIn, T.titleOut + 8, frame));

	return (
		<AbsoluteFill>
			{cover > 0 ? <AbsoluteFill style={{backgroundColor: COLORS.black, opacity: cover}} /> : null}

			<AbsoluteFill
				style={{
					transform: cam !== 1 || shake !== 0 ? `translateY(${shake}px) scale(${cam})` : undefined,
					transformOrigin: `${HUB.x}px ${HUB.y}px`,
				}}
			>
				<LightRays />
				{/* dietro al simbolo: archi di anticipazione, onde d'urto, metà lontana delle orbite */}
				{backOn ? (
					<FrameCanvas
						additive
						draw={(ctx) => {
							ctx.globalCompositeOperation = 'lighter';
							drawImplosion(ctx, frame);
							drawRings(ctx, frame);
							drawRipples(ctx, frame);
							drawMotes(ctx, motes, frame, false);
						}}
					/>
				) : null}
				<CoreGlow />

				{sparkOpacity > 0 ? (
					<ClaudeSpark
						x={POSE.x}
						y={POSE.y}
						size={POSE.size}
						scale={pop}
						opacity={sparkOpacity}
						reveal={reveal}
						glow={1 + 0.75 * (formed ? flash(frame) : 0)}
					/>
				) : null}
				{/* simbolo incandescente che si raffredda dopo l'impatto */}
				{hot > 0.003 ? (
					<ClaudeSpark
						x={POSE.x}
						y={POSE.y}
						size={POSE.size}
						scale={pop}
						opacity={hot}
						reveal={reveal}
						glow={0}
						color={COLORS.orangeHot}
					/>
				) : null}

				{/* davanti al simbolo: sciame, braci dell'impatto, metà vicina delle orbite */}
				{swarmOn || post ? (
					<FrameCanvas
						additive
						draw={(ctx) => {
							ctx.globalCompositeOperation = 'lighter';
							if (swarmOn) drawSwarm(ctx, swarm, frame, k, abs);
							if (post) {
								drawEmbers(ctx, embers, frame, k);
								drawMotes(ctx, motes, frame, true);
							}
						}}
					/>
				) : null}
				<ImpactBloom />

				{/* titolo: deriva lentissima verso l'alto, così non è mai fermo mentre lo si legge */}
				<div style={{position: 'absolute', inset: 0, transform: `translateY(${titleDrift}px)`}}>
					<Caption
						text={'Come si crea una\nmotion graphics\ncon Claude Code?'}
						highlight={['Claude', 'Code?']}
						y={1230}
						size={92}
						weight={700}
						inAt={T.titleIn}
						// tre frasi: "motion" e "Code?" atterrano sui beat 3 e 4 (f 45 e 60)
						wordAt={[26, 29, 32, 35, 41, 45, 50, 53, 56]}
						outAt={T.titleOut}
					/>
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ClaudeSpark} from '../components/ClaudeSpark';
import {FrameCanvas} from '../components/FrameCanvas';
import {COLORS} from '../theme';
import {absorbPulse, buildEchoes, drawEchoes} from './scene5/echoes';
import {buildEmbers, buildMotes, drawCall, drawCore, drawEmbers, drawImplosion, drawMotes, drawShockwave} from './scene5/impact';
import {Backlight, HitFlash} from './scene5/Light';
import {Lockup} from './scene5/Lockup';
import {beatAmp, cameraShake, heat, sparkGlow, sparkPop, sparkPose, T} from './scene5/motion';
import {buildStream, drawStream} from './scene5/stream';

const DUST = 460;
const COMETS = 18;
const EMBERS = 70;
const MOTES = 46;

/**
 * SCENA 5 · OUTRO (720–899) — tutto ciò che si è visto nel reel rientra a spirale nello spark,
 * che scende, cresce e si carica; sul cue (f 60) l'implosione si chiude in un lampo e si compone
 * il logo "Claude Code" con il payoff. Poi una end card pulita, viva ma calma, senza dissolvenza.
 * Livelli, dal basso: controluce → spark → convergenza → colpo/pulviscolo → lampo → lockup.
 */
export const Scene5Outro: React.FC = () => {
	const frame = useCurrentFrame();

	const echoes = useMemo(() => buildEchoes(), []);
	const stream = useMemo(() => buildStream(DUST, COMETS), []);
	const embers = useMemo(() => buildEmbers(EMBERS), []);
	const motes = useMemo(() => buildMotes(MOTES), []);

	const pose = sparkPose(frame);
	// micro-impulso a ogni elemento assorbito: lo spark "sente" ciò che rientra
	const pulse = frame < T.hit ? absorbPulse(echoes, frame) : 0;
	const scale = sparkPop(frame) * (1 + 0.028 * pulse);
	const glow = sparkGlow(frame) + 0.16 * pulse;
	const hot = heat(frame) + 0.1 * pulse;
	const beat = beatAmp(frame);
	const shake = cameraShake(frame);

	const converging = frame > 0 && frame < T.hit;
	const impact = frame >= 40;

	return (
		// isolation: i livelli additivi si fondono sempre allo stesso modo, con o senza scossa
		<AbsoluteFill style={{isolation: 'isolate', transform: shake !== 0 ? `translateY(${shake}px)` : undefined}}>
			<Backlight />

			<ClaudeSpark x={pose.x} y={pose.y} size={pose.size} rotation={pose.rotation} scale={scale} glow={glow} beat={beat} />
			{/* simbolo incandescente: si scalda assorbendo, si raffredda dopo il colpo */}
			{hot > 0.003 ? (
				<ClaudeSpark
					x={pose.x}
					y={pose.y}
					size={pose.size}
					rotation={pose.rotation}
					scale={scale}
					opacity={Math.min(1, hot)}
					glow={0}
					beat={beat}
					color={COLORS.orangeHot}
				/>
			) : null}

			{converging ? (
				<FrameCanvas
					additive
					draw={(ctx) => {
						ctx.globalCompositeOperation = 'lighter';
						drawCall(ctx, frame);
						drawStream(ctx, stream, frame);
						drawEchoes(ctx, echoes, frame);
						drawCore(ctx, frame, pulse);
					}}
				/>
			) : null}

			{impact ? (
				<FrameCanvas
					additive
					draw={(ctx) => {
						ctx.globalCompositeOperation = 'lighter';
						drawImplosion(ctx, frame);
						drawShockwave(ctx, frame);
						drawEmbers(ctx, embers, frame);
						drawMotes(ctx, motes, frame);
					}}
				/>
			) : null}

			<HitFlash />
			<Lockup />
		</AbsoluteFill>
	);
};

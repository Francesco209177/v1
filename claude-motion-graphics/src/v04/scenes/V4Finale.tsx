import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {clamp, ease, hit} from '../../lib/math';
import {HexField, type Wave} from './defend/HexField';
import {ShieldRig} from './defend/ShieldRig';
import {IMPACT, mixPose, type Pose, SHIELD_HIT} from './finale/handoff';
import {Footnote, Question} from './finale/Question';
import {Shatter} from './finale/Shatter';
import {F, FL} from './finale/timing';
import {takeover, Title} from './finale/Title';

/** Scudo: schiacciato dal colpo sul cue 720, rimbalza in alto, resta piccolo e calmo sopra il titolo, poi sale nel cartello. */
const shieldPose = (f: number): Pose => {
	const squash = hit(f, F.impact, 5);
	const hitPose: Pose = {...SHIELD_HIT, sx: 1 + 0.14 * squash, sy: 1 - 0.16 * squash};
	let p = mixPose(hitPose, FL.shieldRest, ease.outBack(clamp((f - 2) / 22)));
	p = mixPose(p, FL.shieldEnd, takeover(f));
	const breathe = 1 + 0.012 * Math.sin(f / 11);
	const kick = 0.07 * hit(f, F.title, 8) + 0.1 * hit(f, F.pensa, 10) + 0.08 * hit(f, F.question, 10);
	return {...p, s: p.s * (breathe + kick)};
};

/**
 * FINALE (24–30 s, assoluti 720–899): sul cue 720 lo scudo digitale colpisce il messaggio fraudolento, che va in
 * frantumi (schegge rosse, pixel che si dissolvono, onda d'urto verde). Sul cue 750 "PRIMA DI CLICCARE," e sul
 * beat 765 "PENSA." in verde; sul cue 840 la domanda "Tu avresti riconosciuto la truffa?" prende il posto del
 * titolo, che sale e si attenua. Cartello finale composto fino all'ultimo frame, nessuna dissolvenza al nero.
 */
export const V4Finale: React.FC = () => {
	const f = useCurrentFrame();
	const pose = shieldPose(f);
	const pulse = hit(f, F.impact, 10) + 0.6 * hit(f, F.title, 10) + 0.9 * hit(f, F.pensa, 12) + 0.6 * hit(f, F.question, 12);
	const waves: Wave[] = [
		{at: F.impact, x: IMPACT.x, y: IMPACT.y, power: 0.85, dur: 30, maxR: 1500},
		{at: F.pensa, x: 540, y: 1088, power: 0.4, dur: 26, maxR: 900},
		{at: F.question, x: 540, y: FL.questionY[1], power: 0.3, dur: 26, maxR: 900},
	];
	return (
		<AbsoluteFill>
			<HexField f={f} cx={pose.x} cy={pose.y} base={0.08 + 0.05 * pulse} radius={300} waves={waves} rings={false} />
			<Shatter f={f} />
			<ShieldRig id="finale-shield" pose={pose} glow={1 + 0.8 * pulse} pulse={clamp(pulse)} scan={f < 40 ? (f - 30) / 9 : f >= F.question && f < F.question + 10 ? (f - F.question) / 9 : -1} trail={clamp(1 - f / 3) * 0.6} trailDir={1} />
			<Title f={f} />
			<Question f={f} />
			<Footnote f={f} />
		</AbsoluteFill>
	);
};

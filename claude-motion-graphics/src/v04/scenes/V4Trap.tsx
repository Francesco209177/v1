import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {invLerp, lerp, prog} from '../../lib/math';
import {MailWindow} from './trap/MailWindow';
import {RevealPlate} from './trap/RevealPlate';
import {exitP, L, projectWin, revealP, T, WIN, winPose} from './trap/timing';
import {CodeDust, ExitWipe, IntroVeil, ShockRing, Spotlight} from './trap/TrapFX';

const TIP_C = {x: L.tip.x + L.tip.w / 2, y: L.tip.y + L.tip.h / 2};

/**
 * TRAP (90–269): il messaggio falso arriva dalla profondità come finestra e-mail 3D e "atterra" a 105: sembra
 * davvero di Orbyx (icona, marchio, tono). Lenta orbita; da 120 la camera va sul pulsante, il puntatore ci passa
 * sopra e compare l'indirizzo reale; a 180 l'indirizzo si stacca grande (zero evidenziato, dominio diverso).
 * Poi i segnali d'allarme (urgenza, mittente) e da 240 la finestra si inclina via, la scena si svuota.
 */
export const V4Trap: React.FC = () => {
	const a = useAbsFrame();
	const pose = winPose(a);
	const center = projectWin(pose, WIN.w / 2, WIN.h / 2);
	const tipC = projectWin(pose, TIP_C.x, TIP_C.y);
	const from = projectWin(winPose(T.reveal - 1), TIP_C.x, TIP_C.y);
	const back = projectWin(winPose(T.retract + 12), TIP_C.x, TIP_C.y);
	const rv = revealP(a);
	const blur = a < T.start + 10 ? 9 * (1 - invLerp(T.start, T.start + 10, a)) : 4 * exitP(a);
	const dust = prog(a, T.start, 12) * (1 - exitP(a));
	return (
		<AbsoluteFill>
			<CodeDust a={a} k={dust} />
			<ShockRing a={a} x={center.x} y={center.y} />
			<AbsoluteFill style={{filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined}}>
				<MailWindow a={a} pose={pose} />
			</AbsoluteFill>
			<Spotlight a={a} x={lerp(tipC.x, 540, rv)} y={lerp(tipC.y, 700, rv)} extra={0.6 * rv} />
			<RevealPlate a={a} from={from} back={back} />
			<ExitWipe a={a} />
			<IntroVeil a={a} />
		</AbsoluteFill>
	);
};

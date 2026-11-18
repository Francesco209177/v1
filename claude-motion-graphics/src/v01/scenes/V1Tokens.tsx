import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {NeuralNet} from '../../v02/components/NeuralNet';
import {DiveDust} from './hook/Dust';
import {Chips} from './tokens/Chips';
import {Labels} from './tokens/Labels';
import {T} from './tokens/layout';
import {TokenLight} from './tokens/Light';
import {netState} from './tokens/net';
import {Question} from './tokens/Question';

/**
 * TOKENS (90–269): prosegue il tuffo; la domanda si ricompone come testo luminoso nello spazio buio.
 * Al cue 180 si spezza in TokenChip (V1_TOKENS, sotto-parole incluse) con gli ID illustrativi; da 225 i token
 * volano in fila dentro la rete neurale condivisa e la camera li segue; a 269 resta SOLO la rete nella posa
 * V1_NET_AT_270 (yaw = v1NetYaw(269)): ATTENTION riparte da quell'immagine esatta.
 */
export const V1Tokens: React.FC = () => {
	const abs = useAbsFrame();
	const net = abs >= T.intoNet - 2 ? netState(abs) : null;
	return (
		<AbsoluteFill>
			<DiveDust abs={abs} />
			{net ? <NeuralNet frame={abs} camera={net.cam} reveal={net.reveal} activity={net.activity} opacity={net.opacity} /> : null}
			<Labels />
			<Question />
			<Chips />
			<TokenLight abs={abs} />
		</AbsoluteFill>
	);
};

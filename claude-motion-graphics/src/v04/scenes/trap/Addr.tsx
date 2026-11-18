import React from 'react';
import {a4, C4} from '../../theme';
import {V4_FAKE} from '../../timeline';

/** Lo "0" (zero) del dominio truffa, evidenziato in rosso con intensità k (0..1). */
export const Zero: React.FC<{k: number; pad?: number}> = ({k, pad = 0.08}) => (
	<span
		style={{
			position: 'relative',
			display: 'inline-block',
			color: k > 0.01 ? C4.redBright : 'inherit',
			textShadow: k > 0.01 ? `0 0 ${0.4 * k}em ${a4(C4.red, 0.85 * k)}` : 'none',
			background: k > 0.01 ? a4(C4.red, 0.2 * k) : 'transparent',
			borderRadius: '0.14em',
			padding: `0 ${pad}em`,
			margin: `0 -${pad}em`,
		}}
	>
		0
	</span>
);

/** Dominio truffa con lo zero evidenziabile: "0rbyx-verifica.example". */
export const PhishDomain: React.FC<{k: number; color?: string}> = ({k, color}) => (
	<span style={{color}}>
		<Zero k={k} />
		{V4_FAKE.phishDomain.slice(1)}
	</span>
);

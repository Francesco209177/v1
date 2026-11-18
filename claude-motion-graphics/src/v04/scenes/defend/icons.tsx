import React from 'react';
import {clamp, ease, hit} from '../../../lib/math';
import {a4, C4} from '../../theme';

/** Riquadro icona 64 px (linee verdi su vetro scuro). `lit` 0..1 = bagliore d'ingresso. */
const Tile: React.FC<{lit?: number; children: React.ReactNode}> = ({lit = 0, children}) => (
	<svg width={64} height={64} viewBox="0 0 64 64" style={{overflow: 'visible', filter: `drop-shadow(0 0 ${6 + 10 * lit}px ${a4(C4.green, 0.35 + 0.4 * lit)})`}}>
		<rect x="1.5" y="1.5" width="61" height="61" rx="16" fill={a4(C4.green, 0.1 + 0.12 * lit)} stroke={a4(C4.green, 0.5 + 0.4 * lit)} strokeWidth="2" />
		<g fill="none" stroke={C4.greenBright} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
			{children}
		</g>
	</svg>
);

/** Barra degli indirizzi + lente: "controlla il dominio". */
export const IconDomain: React.FC<{lit?: number}> = ({lit}) => (
	<Tile lit={lit}>
		<rect x="11" y="17" width="34" height="15" rx="7.5" />
		<path d="M17 24.5 H31" strokeWidth="2.4" opacity="0.7" />
		<circle cx="38" cy="38" r="9" />
		<path d="M44.5 44.5 L52 52" />
	</Tile>
);

/** Collegamento barrato: "non aprire link sospetti". */
export const IconLinkOff: React.FC<{lit?: number}> = ({lit}) => (
	<Tile lit={lit}>
		<g transform="rotate(-45 32 32)">
			<rect x="13" y="26" width="20" height="12" rx="6" />
			<rect x="31" y="26" width="20" height="12" rx="6" />
		</g>
		<path d="M16 16 L48 48" stroke={C4.surface} strokeWidth="9" />
		<path d="M16 16 L48 48" />
	</Tile>
);

/** Telefono con codice: "autenticazione a più fattori". */
export const IconMfa: React.FC<{lit?: number}> = ({lit}) => (
	<Tile lit={lit}>
		<rect x="19" y="10" width="26" height="44" rx="6" />
		<path d="M28 15 H36" strokeWidth="2.4" />
		<circle cx="26" cy="32" r="1.6" fill={C4.greenBright} />
		<circle cx="32" cy="32" r="1.6" fill={C4.greenBright} />
		<circle cx="38" cy="32" r="1.6" fill={C4.greenBright} />
		<path d="M27 44 L30.5 47.5 L37.5 40" strokeWidth="2.6" />
	</Tile>
);

/**
 * Casella di spunta 52 px: anello grigio in attesa, poi (sul beat `at`) si riempie di verde con un pop
 * e la spunta si disegna; anello d'onda che si allarga. `glowAll` = bagliore extra (scudo al 100%).
 */
export const CheckBadge: React.FC<{f: number; at: number; size?: number; glowAll?: number}> = ({f, at, size = 52, glowAll = 0}) => {
	const on = f >= at;
	const draw = ease.outCubic(clamp((f - (at - 2)) / 6));
	const pop = hit(f, at, 7);
	const ring = clamp((f - at) / 12);
	const s = on ? 1 + 0.28 * pop : 1 - 0.06 * clamp((f - (at - 4)) / 4);
	return (
		<div style={{position: 'relative', width: size, height: size}}>
			{on && ring < 1 ? (
				<div
					style={{
						position: 'absolute',
						left: size / 2 - (size / 2) * (1 + ring * 1.6),
						top: size / 2 - (size / 2) * (1 + ring * 1.6),
						width: size * (1 + ring * 1.6),
						height: size * (1 + ring * 1.6),
						borderRadius: '50%',
						border: `3px solid ${a4(C4.greenBright, 0.8 * (1 - ring))}`,
					}}
				/>
			) : null}
			<svg width={size} height={size} viewBox="0 0 52 52" style={{position: 'absolute', inset: 0, overflow: 'visible', transform: `scale(${s})`}}>
				<circle
					cx="26"
					cy="26"
					r="23"
					fill={on ? C4.green : a4(C4.white, 0.03)}
					stroke={on ? C4.greenBright : a4(C4.white, 0.28)}
					strokeWidth="2.5"
					strokeDasharray={on ? undefined : '5 5'}
					style={{filter: on ? `drop-shadow(0 0 ${10 + 14 * (pop + glowAll)}px ${a4(C4.green, 0.85)})` : undefined}}
				/>
				{draw > 0.01 ? (
					<path d="M15 27 L23 35 L38 18" fill="none" stroke={on ? C4.black : C4.greenBright} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
				) : null}
			</svg>
		</div>
	);
};

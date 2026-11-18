import React from 'react';
import {useCurrentFrame} from 'remotion';
import {CODE_METRICS} from '../../lib/code';
import {bezier2, clamp, ease, invLerp, lerp} from '../../lib/math';
import {COLORS, FONTS, textGlow} from '../../theme';
import {LIFT} from './timing';
import {flightEase, groupConverge, tokenGroups} from './tokenFlight';
import {windowState} from './windowMath';

/** Dimensione finale (px) del token "Ciao!" quando diventa il testo animato. */
export const HERO_SIZE = 150;

/**
 * Fase A — i token staccati dal codice: copie nitide che volano su un arco,
 * si condensano in una goccia di luce e sul beat diventano l'elemento che descrivono.
 * "Ciao!" è l'eroe della sua riga: non si condensa, cresce fino a diventare il testo animato.
 */
export const FlyingTokens: React.FC = () => {
	const f = useCurrentFrame();
	const groups = tokenGroups();
	return (
		<>
			{groups.map((g) => {
				if (f < g.t0 || f >= g.at) return null;
				const u = (f - g.t0) / LIFT;
				const n = g.tokens.length;
				const lagTotal = 0.035 * (n - 1);
				const conv = groupConverge(g, f);
				// messa a fuoco: al distacco la copia eredita la sfocatura della finestra e poi diventa nitida
				const blur = windowState(g.t0).blur * (1 - clamp(u * 3.5));
				return g.tokens.map((ft, j) => {
					const uj = clamp(u * (1 + lagTotal) - 0.035 * j);
					const e = flightEase(uj);
					const c = bezier2(g.origin, g.ctrl, g.target, e);
					const lift = Math.sin(Math.PI * clamp(u * 2.2)) * 5; // piccolo "peel" iniziale
					const spread = (1 + 0.22 * e) * (ft.hero ? 1 - e : 1 - conv);
					const x = c.x + (ft.start.x - g.origin.x) * spread;
					const y = c.y + (ft.start.y - g.origin.y) * spread - lift;
					const size = ft.hero
						? lerp(CODE_METRICS.fontSize * ft.k0, HERO_SIZE, ease.inCubic(uj))
						: CODE_METRICS.fontSize * ft.k0 * lerp(1, 1.32, e) * (1 - 0.45 * conv);
					const opacity = ft.hero ? 1 : 1 - ease.inQuad(invLerp(0.62, 0.98, u));
					const squash = lerp(ft.squash, 1, clamp(u * 4));
					return (
						<span
							key={`${g.id}-${ft.token.index}`}
							style={{
								position: 'absolute',
								left: x,
								top: y,
								transform: `translate(-50%, -50%) scaleY(${squash})`,
								fontFamily: FONTS.mono,
								fontSize: size,
								lineHeight: 1.5,
								fontWeight: 500,
								whiteSpace: 'pre',
								fontVariantLigatures: 'none',
								color: ft.hero ? COLORS.white : ft.token.color,
								opacity,
								filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
								textShadow: textGlow(COLORS.orange, 0.7 + 0.6 * conv),
							}}
						>
							{ft.token.text}
						</span>
					);
				});
			})}
		</>
	);
};

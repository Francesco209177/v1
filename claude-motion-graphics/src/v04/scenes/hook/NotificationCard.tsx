import React from 'react';
import {clamp, ease, hit, invLerp, lerp, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {OrbyxIcon} from '../../components/FakeMessage';
import {a4, C4} from '../../theme';
import {V4_FAKE} from '../../timeline';
import {WarnGlyph} from './glyphs';
import {H, LS} from './pose';

/** Caduta con rimbalzo smorzato (molla): 0 = a riposo. Prima della partenza la card è fuori schermo. */
const dropOffset = (f: number): number => {
	const t = f - (H.notif - 1);
	if (t <= 0) return -600;
	return -560 * Math.exp(-t / 2.3) * Math.cos(0.42 * t);
};

/** Tensione sul pulsante: battiti sui beat 30 e 45, poi carica continua fino al tocco. */
export const tensionAt = (f: number): number =>
	f >= H.tap ? 0 : 0.45 * hit(f, 30, 10) + 0.7 * hit(f, 45, 10) + 0.9 * ease.inQuad(invLerp(H.press - 2, H.tap, f));

/**
 * Notifica fittizia "Orbyx · Sicurezza" nella schermata di blocco: cade dall'alto con rimbalzo (6),
 * si espande sul beat (15) mostrando il pulsante rosso "Verifica subito", pulsa di tensione, viene premuta (60).
 */
export const NotificationCard: React.FC<{f: number; alarm: number}> = ({f, alarm}) => {
	if (f < H.notif) return null;
	const y = LS.cardY + dropOffset(f);
	const ex = prog(f, H.expand - 1, 9, ease.outCubic);
	const h = lerp(LS.cardHCollapsed, LS.cardHExpanded, ex);
	const arrive = Math.exp(-Math.max(0, f - H.notif) / 5); // lampo di arrivo sul bordo
	const tension = tensionAt(f);
	const pressed = f >= H.tap ? Math.max(0.55, Math.exp(-(f - H.tap) / 5)) : 0;
	const btnGlow = 0.35 + 0.65 * tension + 0.6 * pressed;
	const red = clamp(alarm);
	return (
		<div
			style={{
				position: 'absolute',
				left: LS.cardX,
				top: y,
				width: LS.cardW,
				height: h,
				borderRadius: 28,
				background: `linear-gradient(180deg, rgba(36,42,44,0.94) 0%, rgba(22,26,28,0.96) 100%)`,
				border: `1.5px solid ${a4(red > 0.02 ? C4.redBright : C4.white, 0.14 + 0.5 * arrive + 0.45 * red)}`,
				boxShadow: `0 18px 50px rgba(0,0,0,0.55), 0 0 ${30 + 40 * arrive}px ${a4(C4.white, 0.1 * arrive)}, inset 0 1px 0 rgba(255,255,255,0.09)`,
				fontFamily: FONTS.body,
				color: C4.white,
			}}
		>
			{/* intestazione */}
			<div style={{position: 'absolute', left: 20, top: 18, right: 20, height: 42, display: 'flex', alignItems: 'center', gap: 12}}>
				<OrbyxIcon size={40} />
				<div style={{flex: 1, fontWeight: 600, fontSize: 22, letterSpacing: '0.005em'}}>{V4_FAKE.notifTitle}</div>
				<div style={{fontSize: 21, color: C4.gray}}>ora</div>
			</div>
			{/* testo urgente */}
			<div style={{position: 'absolute', left: 20, top: 72, right: 18, fontWeight: 600, fontSize: 25, lineHeight: 1.28}}>
				<span style={{display: 'inline-block', verticalAlign: '-3px', marginRight: 8}}>
					<WarnGlyph size={24} color={C4.redBright} stroke={2.8} />
				</span>
				{V4_FAKE.notifText}
			</div>
			{/* pulsante d'azione: entra con l'espansione */}
			<div style={{position: 'absolute', left: 20, right: 20, top: LS.btnTop, height: LS.btnH, opacity: ex, transform: `translateY(${(1 - ex) * -10}px)`}}>
				{/* anelli di tensione */}
				{[30, 45].map((b, i) => {
					const t = f - b;
					if (t < 0 || t > 16 || f >= H.tap) return null;
					const u = t / 16;
					return (
						<div
							key={b}
							style={{
								position: 'absolute',
								inset: 0,
								borderRadius: 16,
								border: `2px solid ${a4(C4.redBright, (1 - u) * (0.55 + 0.25 * i))}`,
								transform: `scale(${1 + 0.07 * ease.outCubic(u)}, ${1 + 0.32 * ease.outCubic(u)})`,
							}}
						/>
					);
				})}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: 16,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontWeight: 600,
						fontSize: 24,
						letterSpacing: '0.01em',
						background: `linear-gradient(180deg, ${a4(C4.redBright, 0.95 - 0.2 * pressed)} 0%, ${a4(C4.red, 0.95)} 55%, ${a4(C4.redDeep, 0.98)} 100%)`,
						boxShadow: `0 0 ${18 + 34 * btnGlow}px ${a4(C4.red, 0.25 + 0.4 * btnGlow)}, inset 0 1px 0 rgba(255,255,255,${0.25 - 0.15 * pressed})`,
						transform: `scale(${1 + 0.025 * tension - 0.035 * pressed})`,
					}}
				>
					{V4_FAKE.cta}
				</div>
			</div>
		</div>
	);
};

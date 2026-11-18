import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {clamp, ease, hit, lerp, prog} from '../../lib/math';
import {FONTS} from '../../theme';
import {a4, C4} from '../theme';
import {DomainCheck} from './defend/DomainCheck';
import {HexField, type Wave} from './defend/HexField';
import {IconDomain, IconLinkOff, IconMfa} from './defend/icons';
import {LinkBlock} from './defend/LinkBlock';
import {MfaCode} from './defend/MfaCode';
import {ShieldRig} from './defend/ShieldRig';
import {Threat} from './defend/Threat';
import {D, SHIELD_POSE, STACK, ZONE} from './defend/timing';
import {TipCard, visualTop} from './defend/TipCard';
import {mixPose, type Pose, SHIELD_HIT, SHIELD_SIZE} from './finale/handoff';

const CHECKS: number[] = [D.check1, D.check2, D.check3];

/** Altezze delle card espanse (intestazione + qualificatore + area visiva + margine). */
const H1 = visualTop(1, 1) + 140 + STACK.pad;
const H2 = visualTop(1, 1) + 72 + STACK.pad;
const H3 = visualTop(1, 2) + 140 + STACK.pad;

const HEAD_BOX = SHIELD_SIZE * SHIELD_POSE.headS; // altezza dello scudo "testata"
const METER_GAP = 22; // scudo → etichetta
const STACK_GAP = 92; // scudo → prima card

/**
 * Impaginazione del gruppo scudo + etichetta + checklist: centrato nella zona utile, si riassesta in modo fluido
 * quando una card si comprime e arriva la successiva (lo scudo sale man mano che la pila cresce).
 */
const layout = (f: number) => {
	const c1 = ease.inOutCubic(clamp((f - (D.tip2 - 10)) / 10));
	const c2 = ease.inOutCubic(clamp((f - (D.tip3 - 10)) / 10));
	const h1 = lerp(H1, STACK.rowH, c1);
	const h2 = lerp(H2, STACK.rowH, c2);
	const stackH = h1 + c1 * (STACK.gap + h2) + c2 * (STACK.gap + H3);
	const groupH = HEAD_BOX + STACK_GAP + stackH;
	const top = Math.max(ZONE.top, ZONE.top + (ZONE.bottom - ZONE.top - groupH) / 2);
	const stackTop = top + HEAD_BOX + STACK_GAP;
	return {c1, c2, h1, h2, shieldY: top + HEAD_BOX / 2, meterY: top + HEAD_BOX + METER_GAP, top1: stackTop, top2: stackTop + h1 + STACK.gap, top3: stackTop + h1 + STACK.gap + h2 + STACK.gap};
};

/** Posa dello scudo: grande al centro sul cue, poi "testata" del gruppo, impulsi sulle spunte, carica e colpo finale. */
const shieldPose = (f: number, headY: number): Pose => {
	const pop = 0.84 + 0.16 * ease.outBack(clamp((f + 1) / 9));
	let p = mixPose({...SHIELD_POSE.intro, s: pop}, {x: 540, y: headY, s: SHIELD_POSE.headS}, ease.inOutCubic(clamp((f - 6) / 12)));
	const pk = CHECKS.reduce((n, c) => n + hit(f, c, 8), 0) + 1.5 * hit(f, D.all, 10) + 0.8 * hit(f, D.absorb + 12, 8);
	p = {...p, s: p.s * (1 + 0.06 * pk)};
	p = mixPose(p, SHIELD_POSE.wind, ease.inOutCubic(clamp((f - (D.strike - 12)) / 12)));
	const st = clamp((f - D.strike) / (D.end - D.strike));
	if (st > 0) p = mixPose(p, {...SHIELD_HIT, sx: 0.94, sy: 1.12}, ease.inCubic(st));
	return p;
};

/** Etichetta sotto lo scudo: "DIFESE ATTIVE" con tre tacche che si accendono a ogni spunta. */
const DefenseMeter: React.FC<{f: number; y: number}> = ({f, y}) => {
	const a = prog(f, 16, 8) * (1 - prog(f, D.absorb, 8, ease.inCubic));
	if (a <= 0.01) return null;
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				width: 1080,
				top: y,
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				gap: 16,
				fontFamily: FONTS.mono,
				fontSize: 24,
				fontWeight: 700,
				letterSpacing: '0.14em',
				color: C4.greenBright,
				opacity: a,
				textShadow: `0 0 14px ${a4(C4.green, 0.6)}`,
			}}
		>
			DIFESE ATTIVE
			<div style={{display: 'flex', gap: 8}}>
				{CHECKS.map((c, i) => {
					const on = f >= c;
					const h = hit(f, c, 10) + hit(f, D.all, 12);
					return (
						<div
							key={i}
							style={{
								width: 26,
								height: 12,
								borderRadius: 4,
								background: on ? C4.greenBright : a4(C4.green, 0.12),
								border: `1.5px solid ${a4(C4.green, on ? 1 : 0.45)}`,
								boxShadow: on ? `0 0 ${8 + 14 * h}px ${a4(C4.green, 0.9)}` : 'none',
							}}
						/>
					);
				})}
			</div>
		</div>
	);
};

/**
 * DIFESA (17–24 s, assoluti 510–719): la scena passa dal rosso al VERDE. Lo scudo digitale si disegna sul cue 510
 * con un'onda protettiva sulla griglia esagonale; poi tre comportamenti entrano sui loro cue (525, 570, 630) e si
 * impilano come checklist, ciascuno con la sua spunta sul beat (555, 600, 660) e un impulso dello scudo.
 * Chiusura: le card vengono assorbite dallo scudo, il messaggio fraudolento rientra, il mirino lo aggancia (705)
 * e lo scudo carica il colpo che lo distrugge sul taglio 720 (inizio del FINALE).
 */
export const V4Defend: React.FC = () => {
	const f = useCurrentFrame();
	const L = layout(f);
	const pose = shieldPose(f, L.shieldY);
	const checksDone = CHECKS.reduce((n, c) => n + ease.outCubic(clamp((f - c) / 8)), 0);
	const fill = 0.25 * ease.outCubic(clamp((f - 2) / 10)) + 0.25 * checksDone;
	const pulse = hit(f, D.shield, 14) + CHECKS.reduce((n, c) => n + hit(f, c, 10), 0) + 1.3 * hit(f, D.all, 12) + 0.8 * hit(f, D.absorb + 12, 10);
	const charge = clamp((f - (D.strike - 12)) / 18);
	const scan = f < 18 ? (f - 1) / 14 : [...CHECKS, D.all].reduce((s, c) => (f >= c && f < c + 10 ? (f - c) / 9 : s), -1);
	const allGlow = hit(f, D.all, 14);
	const headY = layout(D.all).shieldY;

	const waves: Wave[] = [
		{at: 0, x: 540, y: 520, power: 0.9, dur: 34, maxR: 1500},
		{at: 4, x: 540, y: 520, power: 0.45, dur: 30, maxR: 1100},
		...CHECKS.map((c) => ({at: c, x: 540, y: layout(c).shieldY, power: 0.42, dur: 24, maxR: 820})),
		{at: D.all, x: 540, y: headY, power: 0.75, dur: 30, maxR: 1300},
	];

	const absorb = (i: number): number => clamp((f - (D.absorb + i * 3)) / 9);
	const to = {x: 540, y: headY};

	// luce di scansione a tutto schermo sul cue dello scudo
	const sweep = prog(f, 0, 24, ease.inOutSine);
	return (
		<AbsoluteFill>
			<HexField f={f} cx={pose.x} cy={pose.y} base={0.1 + 0.05 * pulse} radius={340} waves={waves} />
			{sweep > 0 && sweep < 1 ? (
				<div
					style={{
						position: 'absolute',
						left: 0,
						width: 1080,
						top: lerp(120, 1500, sweep) - 260,
						height: 260,
						background: `linear-gradient(180deg, ${a4(C4.green, 0)} 0%, ${a4(C4.green, 0.07)} 70%, ${a4(C4.greenBright, 0.5)} 98%, ${a4(C4.greenHot, 0)} 100%)`,
						mixBlendMode: 'screen',
						opacity: 1 - sweep * 0.6,
					}}
				/>
			) : null}

			<DefenseMeter f={f} y={L.meterY} />

			<TipCard
				f={f}
				at={D.tip1}
				checkAt={D.check1}
				icon={(lit) => <IconDomain lit={lit} />}
				title="Controlla il dominio del sito"
				qualifier="lettere scambiate, parole in più, dominio diverso"
				top={L.top1}
				height={L.h1}
				collapse={L.c1}
				absorb={absorb(0)}
				absorbTo={to}
				glowAll={allGlow}
			>
				<DomainCheck f={f} at={D.tip1} top={visualTop(1, 1)} />
			</TipCard>
			<TipCard
				f={f}
				at={D.tip2}
				checkAt={D.check2}
				icon={(lit) => <IconLinkOff lit={lit} />}
				title="Non aprire link sospetti"
				qualifier="apri tu l'app o il sito ufficiale"
				top={L.top2}
				height={L.h2}
				collapse={L.c2}
				absorb={absorb(1)}
				absorbTo={to}
				glowAll={allGlow}
			>
				<LinkBlock f={f} at={D.tip2} top={visualTop(1, 1)} />
			</TipCard>
			<TipCard
				f={f}
				at={D.tip3}
				checkAt={D.check3}
				icon={(lit) => <IconMfa lit={lit} />}
				title="Attiva l'autenticazione a più fattori"
				qualifier={'anche con la password rubata,\nserve un secondo codice'}
				qualLines={2}
				top={L.top3}
				height={H3}
				collapse={0}
				absorb={absorb(2)}
				absorbTo={to}
				glowAll={allGlow}
			>
				<MfaCode f={f} at={D.tip3} top={visualTop(1, 2)} />
			</TipCard>

			<Threat f={f} />

			<ShieldRig
				id="defend-shield"
				pose={pose}
				draw={ease.outQuart(clamp((f + 1) / 9))}
				fill={fill}
				check={ease.outCubic(clamp((f - 4) / 6))}
				glow={1 + 0.7 * pulse + 0.8 * charge}
				pulse={clamp(pulse + 0.6 * charge)}
				scan={scan}
				trail={clamp((f - D.strike) / (D.end - D.strike - 1))}
				trailDir={1}
			/>
		</AbsoluteFill>
	);
};

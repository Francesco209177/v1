import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {beatPulse, bezier2, clamp, ease, hit, lerp, prog, Vec2} from '../../lib/math';
import {Phone, PHONE_SCREEN} from '../components/Phone';
import {a4, C4} from '../theme';
import {V4_FAKE} from '../timeline';
import {ATK, Attacker} from './how/Attacker';
import {BAR, BH, Browser, BW, EMAIL_TXT, PW_TXT} from './how/Browser';
import {DataChip, DataStream, Path} from './how/DataStream';
import {Glitch} from './how/Glitch';
import {LockScreen, TAP_PHONE, TouchPoint} from './how/LockScreen';
import {Stepper} from './how/Stepper';
import {ATK_C, Cam, camAt, camSpeed, SC, T, toScreen, WIN_C} from './how/timing';

/** Scala del telefono al momento del tocco (per calcolare il punto toccato sullo schermo). */
const PHONE_S_TAP = 0.8;
/** Passo 2: zoom sulla barra dell'indirizzo e sua posizione verticale sullo schermo. */
const ADDR_Z = 1.24;
const ADDR_Y = 516;
const TAP: Vec2 = {x: SC.x + (TAP_PHONE.x - PHONE_SCREEN.w / 2) * PHONE_S_TAP, y: SC.y + (TAP_PHONE.y - PHONE_SCREEN.h / 2) * PHONE_S_TAP};

/**
 * Trasformazione della finestra del browser al frame f: centro sullo schermo, scala, opacità.
 * Passo 2: si apre dal punto toccato già "inquadrata" sulla barra dell'indirizzo (zoom); sul cue 90 la camera
 * arretra e mostra la pagina intera; dal cue 180 si allontana e si spegne.
 */
const winAt = (f: number, cam: Cam): {x: number; y: number; s: number; op: number; em: number; back: number; leave: number} => {
	const em = prog(f, T.tap, T.emerge, ease.outExpo);
	const back = prog(f, T.page - 7, 7, ease.inOutCubic);
	const leave = prog(f, T.steal + 1, 11, ease.inOutSine);
	const wc = toScreen(cam, WIN_C.x, WIN_C.y);
	const barFrame = {x: SC.x, y: ADDR_Y + (BH / 2 - BAR / 2) * ADDR_Z};
	return {
		x: lerp(TAP.x, lerp(barFrame.x, wc.x, back), em),
		y: lerp(TAP.y, lerp(barFrame.y, wc.y, back), em) - 90 * leave,
		s: cam.z * lerp(lerp(0.08, ADDR_Z, em), 1, back) * (1 + 0.03 * hit(f, T.page, 8)) * (1 - 0.24 * leave),
		op: clamp(em * 4) * (1 - 0.85 * leave),
		em,
		back,
		leave,
	};
};

/** Stato di un pacchetto (0 = email, 1 = password) al frame f: parte dal campo (che sale con la pagina) e,
 *  girando largo attorno alla sagoma, scende nel suo slot del pannello dell'attaccante. */
const chipAt = (f: number, k: 0 | 1): {pos: Vec2; path: Path; fly: number; lift: number; scale: number} => {
	const cam = camAt(f);
	const w = winAt(f, cam);
	const src = k === 0 ? EMAIL_TXT : PW_TXT;
	const a0 = {x: w.x + (src.x - BW / 2) * w.s, y: w.y + (src.y - BH / 2) * w.s};
	const b = toScreen(cam, ATK_C.x, ATK_C.y + (k === 0 ? ATK.slot1 : ATK.slot2));
	const lift = prog(f, T.steal, 4, ease.outCubic);
	const fly = prog(f, T.steal + 2 + 3 * k, 14, ease.inOutSine);
	const a = {x: a0.x, y: a0.y - 30 * lift - 16 * k * lift};
	const c = {x: SC.x + (k === 0 ? 470 : -470), y: b.y - 140};
	const path = {a, c, b};
	return {pos: bezier2(a, c, b, fly), path, fly, lift, scale: lerp(w.s, cam.z, fly) * (1 + 0.1 * lift * (1 - fly))};
};

/**
 * SCENA 3 — COME FUNZIONA (abs 270–509, locale 0–239). "Ti porta su un sito contraffatto, dove inserisci password…"
 * 5 passi sui cue 0/45/90/135/180: notifica sul telefono → tocco e apertura del collegamento → pagina di accesso
 * contraffatta (glitch) → credenziali digitate (password solo a puntini) → i dati volano all'attaccante (glitch).
 * HUD in alto con i 5 nodi e la linea rossa di avanzamento; alla fine tutto collassa nel nero (taglio verde a 240).
 */
export const V4How: React.FC = () => {
	const f = useCurrentFrame();
	const abs = useAbsFrame();
	const beat = beatPulse(abs, 5);
	const cam = camAt(f);
	const speed = camSpeed(f);

	// ---------- 1 · il telefono riceve la notifica ----------
	const arrive = prog(f, -3, 9, ease.outBack);
	const buzz = hit(f, 0, 12) + 0.6 * hit(f, 15, 9);
	const ring = clamp(hit(f, 0, 16) + 0.55 * hit(f, 15, 10) + hit(f, T.tap, 10));
	const phoneOut = prog(f, T.tap, 14, ease.inCubic);
	const phoneS = lerp(0.76, PHONE_S_TAP, prog(f, 0, T.tap, ease.outQuad)) * (1 - 0.42 * phoneOut);
	const phoneOp = 1 - prog(f, T.tap, 6, ease.outQuad);
	const tapPress = prog(f, T.tap - 1, 2) * (1 - prog(f, T.tap + 3, 8));

	// dito: entra, si posa, preme sul cue 45, poi si solleva
	const tIn = prog(f, T.touchIn, 16, ease.inOutCubic);
	const touch = {
		x: lerp(1010, TAP.x + 8, tIn),
		y: lerp(1170, TAP.y + 6, tIn),
		scale: lerp(1.35, 1.08, tIn) - 0.28 * prog(f, T.tap - 2, 2) * (1 - prog(f, T.tap + 2, 6)),
		opacity: prog(f, T.touchIn, 6) * (1 - prog(f, T.tap + 1, 6)),
	};

	// ---------- 2–4 · la finestra del browser ----------
	const win = winAt(f, cam);
	const {em, back, leave} = win;
	const push = prog(f, T.pushStart, T.pushEnd - T.pushStart, ease.inOutCubic);
	const winRotX = lerp(26, 4, em) - 2.5 * back + 10 * leave;
	const winRotY = -3 + 1.2 * Math.sin(f / 40) - 1.5 * back;
	const winBlur = (f < T.tap + 8 ? 7 * (1 - em) : 0) + clamp((speed - 35) / 28, 0, 5);
	const glitch = (f >= T.page && f < T.page + 8 ? 0.9 * hit(f, T.page, 6) : 0) + (f >= T.steal && f < T.steal + 9 ? hit(f, T.steal, 7) : 0);

	const emailN = f < T.pushEnd ? 0 : 1 + Math.floor((V4_FAKE.email.length - 1) * prog(f, T.pushEnd, T.emailEnd - T.pushEnd, ease.linear));
	const dots = f < T.pwFocus ? 0 : 1 + Math.floor(7 * prog(f, T.pwFocus, T.pwEnd - T.pwFocus, ease.linear));
	const focus: 0 | 1 | 2 = f >= T.pushEnd && f < T.pwFocus ? 1 : f >= T.pwFocus && f < T.press - 1 ? 2 : 0;
	const load = f < T.loadStart ? 0 : 0.18 * prog(f, T.loadStart, 5) + 0.5 * prog(f, 57, 18, ease.inOutSine) + 0.32 * prog(f, 78, T.loadEnd - 78, ease.inCubic);

	// ---------- 5 · i dati volano all'attaccante ----------
	const c0 = chipAt(f, 0);
	const c1 = chipAt(f, 1);
	const p0 = chipAt(f - 1, 0).pos;
	const p1 = chipAt(f - 1, 1).pos;
	const v0 = {x: c0.pos.x - p0.x, y: c0.pos.y - p0.y};
	const v1 = {x: c1.pos.x - p1.x, y: c1.pos.y - p1.y};
	const ac = toScreen(cam, ATK_C.x, ATK_C.y);
	const atkShow = prog(f, T.travelStart + 1, 8);
	const atkHit = clamp(hit(f, T.travelEnd, 14) + 0.7 * hit(f, T.pulse, 12));
	const dark = prog(f, 190, 16, ease.inOutSine);
	const docked = (f >= T.travelEnd + 1 ? 0.5 : 0) + (f >= T.travelEnd + 4 ? 0.5 : 0);
	const shake = hit(f, T.steal, 7);
	const stealFlash = hit(f, T.steal, 9);

	// ---------- collasso finale ----------
	const k1 = prog(f, T.collapse, 8, ease.inQuart);
	const k2 = prog(f, T.collapse + 7, 6, ease.inCubic);
	const sy = lerp(1, 0.006, k1);
	const sx = lerp(1, 0.02, k2);
	const black = 0.93 * prog(f, T.collapse + 3, T.end - T.collapse - 3, ease.inQuad);

	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<AbsoluteFill style={{transform: `translate(${Math.sin(f * 3.1) * 10 * shake}px, ${Math.cos(f * 2.3) * 6 * shake}px) scale(${sx}, ${sy})`, transformOrigin: `${SC.x}px ${SC.y}px`}}>
				{/* luce focale rossa dietro la vignetta attiva */}
				<div
					style={{
						position: 'absolute',
						left: SC.x - 620,
						top: SC.y - 620,
						width: 1240,
						height: 1240,
						borderRadius: '50%',
						background: `radial-gradient(closest-side, ${a4(C4.red, 0.13 + 0.05 * beat + 0.12 * stealFlash)} 0%, ${a4(C4.redDeep, 0.06)} 50%, ${a4(C4.redDeep, 0)} 100%)`,
					}}
				/>
				{/* PALCO: tutto ciò che si muove con la camera, sfumato sopra (HUD) e sotto (sottotitoli) */}
				<AbsoluteFill
					style={{
						WebkitMaskImage: 'linear-gradient(180deg, transparent 0px, transparent 376px, #000 414px, #000 1232px, transparent 1282px)',
						maskImage: 'linear-gradient(180deg, transparent 0px, transparent 376px, #000 414px, #000 1232px, transparent 1282px)',
					}}
				>
					{phoneOp > 0.01 ? (
						<div style={{filter: phoneOut > 0.05 ? `blur(${6 * phoneOut}px)` : undefined}}>
							<Phone
								x={SC.x}
								y={SC.y + 40 * phoneOut}
								scale={phoneS}
								rotX={5 + 12 * phoneOut}
								rotY={lerp(-8, -4, prog(f, 0, T.tap, ease.inOutSine)) - 10 * phoneOut}
								rotZ={Math.sin(f * 2.4) * 2.2 * buzz}
								opacity={phoneOp}
								alarm={0.75 * hit(f, T.tap, 9)}
								glow={0.8 + 0.6 * ring}
								glowColor={C4.red}
							>
								<LockScreen arrive={arrive} press={tapPress} ring={ring} drift={-6 * prog(f, 0, 45)} />
							</Phone>
						</div>
					) : null}
					{/* onde del tocco */}
					{[0, 1, 2].map((i) => {
						const t = prog(f, T.tap + i * 3, 15, ease.outCubic);
						if (f < T.tap + i * 3 || t >= 1) return null;
						const r = 24 + 190 * t;
						return (
							<div
								key={i}
								style={{
									position: 'absolute',
									left: TAP.x - r,
									top: TAP.y - r,
									width: r * 2,
									height: r * 2,
									borderRadius: '50%',
									border: `${3 - i}px solid ${a4(i === 0 ? C4.white : C4.redBright, 0.9 * (1 - t))}`,
									boxShadow: `0 0 24px ${a4(C4.red, 0.5 * (1 - t))}`,
								}}
							/>
						);
					})}
					{/* finestra del browser: caricamento → pagina falsa → modulo */}
					{f >= T.tap && win.op > 0.01 ? (
						<div style={{position: 'absolute', left: win.x, top: win.y, width: 0, height: 0, perspective: 2400, opacity: win.op, filter: winBlur > 0.3 ? `blur(${winBlur}px)` : undefined}}>
							<div style={{position: 'absolute', left: -BW / 2, top: -BH / 2, width: BW, height: BH, transform: `scale(${win.s}) rotateX(${winRotX}deg) rotateY(${winRotY}deg)`}}>
								<Glitch amount={glitch} seed={f < T.steal ? 3 : 9} w={BW} h={BH}>
									<Browser
										f={f}
										addr={prog(f, T.addrIn, 10, ease.linear)}
										load={load}
										loadFade={prog(f, T.loadEnd + 1, 5)}
										pf={f - T.page}
										tag={prog(f, T.tag, 7, ease.outBack)}
										alert={clamp(0.35 * prog(f, T.page, 10) + 0.65 * hit(f, T.tag + 1, 12) + 0.3 * beat * (f >= T.page ? 1 : 0))}
										header={1 - 0.62 * push}
										emailN={emailN}
										dots={dots}
										focus={focus}
										press={prog(f, T.press - 2, 2) * (1 - prog(f, T.press + 1, 6))}
										busy={f >= T.busy ? 1 : 0}
										stolen={prog(f, T.steal, 3)}
									/>
								</Glitch>
							</div>
						</div>
					) : null}
					{/* l'attaccante */}
					<Attacker f={f} x={ac.x} y={ac.y} z={cam.z} show={atkShow} hitK={atkHit} dark={dark} docked={docked} />
					{/* scia dei dati */}
					{f >= T.steal && f < T.travelEnd + 16 ? (
						<DataStream frame={f} paths={[c0.path, c1.path]} p={[c0.fly, c1.fly]} fade={1 - prog(f, T.travelEnd + 2, 13)} line={1} />
					) : null}
					{/* pacchetti: email e password (solo puntini) */}
					{f >= T.steal
						? ([
								[c0, v0, 'email', V4_FAKE.email, T.travelEnd + 1],
								[c1, v1, 'pw', '••••••••', T.travelEnd + 4],
							] as const).map(([c, v, kind, text, at]) => (
								<DataChip
									key={kind}
									kind={kind}
									text={text}
									x={c.pos.x}
									y={c.pos.y}
									scale={c.scale}
									lift={c.lift}
									rot={clamp(v.x * 0.1, -12, 12) * (1 - c.fly * c.fly)}
									blur={clamp((Math.hypot(v.x, v.y) - 24) / 22, 0, 4)}
									glow={hit(f, at, 12) + 0.25 * beat}
								/>
							))
						: null}
					<TouchPoint {...touch} />
				</AbsoluteFill>
				{/* HUD: nodi e etichetta del passo */}
				<Stepper f={f} abs={abs} />
				{/* accento scuro e lampo rosso del furto */}
				{dark > 0.01 ? (
					<AbsoluteFill style={{background: `radial-gradient(62% 40% at 50% ${(ac.y / 1920) * 100 - 2}%, rgba(0,0,0,0) 35%, rgba(0,0,0,${0.72 * dark}) 100%)`}} />
				) : null}
				{stealFlash > 0.01 ? (
					<AbsoluteFill style={{mixBlendMode: 'screen', background: `radial-gradient(70% 45% at 50% 45%, ${a4(C4.red, 0.38 * stealFlash)} 0%, ${a4(C4.redDeep, 0.2 * stealFlash)} 55%, rgba(0,0,0,0) 100%)`}} />
				) : null}
			</AbsoluteFill>
			{/* chiusura: nero e linea "CRT" */}
			{black > 0.005 ? <AbsoluteFill style={{background: C4.black, opacity: black}} /> : null}
			{k1 > 0.01 ? (
				<div
					style={{
						position: 'absolute',
						left: SC.x - 540 * sx,
						top: SC.y - 3,
						width: 1080 * sx,
						height: 6,
						borderRadius: 3,
						opacity: k1 * (1 - 0.7 * k2),
						background: `linear-gradient(90deg, ${a4(C4.red, 0)}, ${C4.redHot} 50%, ${a4(C4.red, 0)})`,
						boxShadow: `0 0 30px ${a4(C4.red, 0.9)}`,
					}}
				/>
			) : null}
		</AbsoluteFill>
	);
};

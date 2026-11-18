import React from 'react';
import {useAbsFrame} from '../../../lib/frame';
import {bezier2, clamp, ease, hash, invLerp, lerp} from '../../../lib/math';
import {TokenChip} from '../../components/TokenChip';
import {SIZE, SLOTS, SUBWORD, T} from './layout';
import {departAt, FLIGHT, layerXf, popAt, Pt, slotPos, toScreen} from './motion';
import {netState, PATHS, projectNet} from './net';

/** Inizio dello scorrimento dell'ID del token i. */
export const idAt = (i: number): number => T.ids + i * 1.5;
const TICK = 7;

/** ID mostrato: cifre che scorrono (stesso numero di cifre) e poi si fermano sul valore illustrativo. */
const shownId = (i: number, abs: number): number | null => {
	const t = idAt(i);
	if (abs < t) return null;
	const id = SLOTS[i].id;
	if (abs >= t + TICK) return id;
	const d = String(id).length;
	const lo = Math.pow(10, d - 1);
	return Math.floor(lo + hash(i * 97 + Math.floor(abs), 77) * 9 * lo);
};

/** Traiettoria del volo verso il nodo d'ingresso (coordinate schermo): imbuto comune, poi dentro la rete. */
export const flightPos = (i: number, abs: number, u: number): Pt => {
	const from = toScreen(abs, slotPos(i, abs));
	const proj = projectNet(netState(abs).cam);
	const to = proj[PATHS[i][0]];
	const ctrl = {x: lerp(from.x, to.x, 0.35), y: lerp(from.y, to.y, 0.75) - 30};
	return bezier2(from, ctrl, to, u);
};
export const flightU = (i: number, abs: number): number => ease.inOutSine(clamp((abs - departAt(i)) / FLIGHT));

/**
 * I blocchi TokenChip: compaiono al cue 180 con uno sfasamento di 1–2 frame (pop + lampo), gli ID scorrono
 * sotto ciascuno; da 225 partono in fila verso la rete, rimpicciolendo e allungandosi nella direzione del volo.
 */
export const Chips: React.FC = () => {
	const abs = useAbsFrame();
	const L = layerXf(abs);
	const idsOut = 1 - ease.inCubic(invLerp(214, 223, abs));
	const ant = ease.inOutSine(invLerp(214, T.intoNet, abs));
	return (
		<>
			{SLOTS.map((s) => {
				const t0 = popAt(s.i);
				if (abs < t0) return null;
				const u = clamp((abs - departAt(s.i)) / FLIGHT);
				if (u >= 1) return null;
				const e = flightU(s.i, abs);
				const age = abs - t0;
				const pop = 1 + 0.1 * Math.exp(-age / 2.5);
				const glow = 1 + 1.8 * Math.exp(-age / 4) + 0.5 * ant;
				const p = slotPos(s.i, abs);
				let c: Pt = toScreen(abs, p);
				let sc = L.s * pop;
				let rot = p.rot;
				let stretch = 0;
				let ang = 0;
				let op = 1;
				if (u > 0) {
					c = flightPos(s.i, abs, e);
					const prev = flightPos(s.i, abs, flightU(s.i, abs - 1));
					const v = Math.hypot(c.x - prev.x, c.y - prev.y);
					ang = Math.atan2(c.y - prev.y, c.x - prev.x);
					stretch = clamp(v / 110, 0, 0.35);
					sc *= lerp(1, 0.12, e);
					rot = lerp(rot, 0, clamp(u * 4));
					op = 1 - ease.inQuad(clamp((u - 0.55) / 0.4));
				}
				const active = age < 3 || (SUBWORD.has(s.i) && abs >= 199 && abs < T.intoNet);
				const chip = (
					<TokenChip
						text={s.text}
						x={c.x}
						y={c.y}
						size={SIZE}
						scale={sc}
						rotate={rot}
						glow={glow}
						opacity={op}
						active={active}
						id={u > 0 ? null : shownId(s.i, abs)}
						idOpacity={clamp((abs - idAt(s.i)) / 3) * idsOut}
					/>
				);
				if (stretch < 0.02) return <React.Fragment key={s.i}>{chip}</React.Fragment>;
				const deg = (ang * 180) / Math.PI;
				return (
					<div
						key={s.i}
						style={{
							position: 'absolute',
							left: 0,
							top: 0,
							width: 1080,
							height: 1920,
							transformOrigin: `${c.x}px ${c.y}px`,
							transform: `rotate(${deg}deg) scaleX(${1 + stretch}) rotate(${-deg}deg)`,
						}}
					>
						{chip}
					</div>
				);
			})}
		</>
	);
};

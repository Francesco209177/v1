import React from 'react';
import {useAbsFrame} from '../../../lib/frame';
import {clamp, ease, hash, invLerp, lerp} from '../../../lib/math';
import {TokenChip} from '../../components/TokenChip';
import {SIZE, SLOTS, SUBWORD, T} from './layout';
import {flightPos, flightU} from './flight';
import {departAt, FLIGHT, layerXf, popAt, Pt, slotPos, toScreen} from './motion';

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

/**
 * I blocchi TokenChip: compaiono al cue 180 con uno sfasamento di 1–2 frame (pop + lampo), gli ID scorrono
 * sotto ciascuno; da 225 partono in fila (ordine di lettura) e spiraleggiano dentro l'anello d'ingresso della rete.
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
				let op = 1;
				if (u > 0) {
					c = flightPos(s.i, abs, e);
					sc *= lerp(1, 0.12, e);
					rot = lerp(rot, 0, clamp(u * 4)) + 38 * e;
					op = 1 - ease.inQuad(clamp((u - 0.55) / 0.4));
				}
				const active = age < 3 || (SUBWORD.has(s.i) && abs >= 199 && abs < T.intoNet);
				return (
					<TokenChip
						key={s.i}
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
			})}
		</>
	);
};

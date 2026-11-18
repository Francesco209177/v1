import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {beatPulse, clamp, ease, hit, lerp, prog} from '../../lib/math';
import {alpha, COLORS, FONTS} from '../../theme';
import {AnswerArea, FlyingChips} from './predict/AnswerArea';
import {ContextRow} from './predict/ContextRow';
import {C, EXIT, HUB, landAt, loopFrom, NOTE_Y, PANEL, PICK, SHOW} from './predict/data';
import {Connector, LoopLine} from './predict/LoopLine';
import {PredictFX} from './predict/PredictFX';
import {ProbPanel} from './predict/ProbPanel';

/**
 * SCENA 4 — PREDICT (assoluto 480–689). "Poi prevede il token più probabile, uno alla volta, fino a comporre la risposta."
 * Dal punto di luce del taglio esplode lo schema: CONTESTO (la domanda in token) → pannello delle probabilità
 * del token successivo → RISPOSTA. 525: scelto "Ho" (decolla e vola nella risposta). Ogni token scelto rientra
 * nel contesto lungo l'anello; 600: il ciclo accelera. ~650 risposta completa, poi tutto collassa nel punto di luce (690).
 */
export const V1Predict: React.FC = () => {
	const f = useCurrentFrame();
	const abs = useAbsFrame();
	const beat = beatPulse(abs, 5);

	// ingresso: tutto nasce dal punto di luce (540, 760) con sfalsamenti brevi
	const enter = (delay: number) => prog(f, delay, 14, ease.outExpo);
	const panelIn = enter(3);
	const ansIn = enter(6);
	// uscita
	const exit = prog(f, EXIT, C.end - EXIT, ease.inCubic);
	const exitFast = prog(f, EXIT, 9, ease.inQuad);

	// camera: deriva lenta + micro-spinta sui colpi; l'origine è il punto di luce (così il collasso resta centrato)
	const punch = 0.012 * hit(f, C.pick, 14) + 0.016 * hit(f, C.loop, 16) + 0.004 * hit(f, PICK[1], 10);
	const camS = lerp(0.985, 1.02, ease.inOutSine(clamp(f / C.end))) + punch + 0.1 * exit;
	const camY = Math.sin(f / 40) * 6 * (1 - exit);

	// anello: si traccia prima che "Ho" rientri nel contesto
	const loopDraw = prog(f, loopFrom(0) - 12, 12, ease.inOutCubic);
	const accent = hit(f, C.loop, 18);
	const loopTravel = Math.max(...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => (f >= loopFrom(s) && f <= loopFrom(s) + 10 ? 1 - (f - loopFrom(s)) / 10 : 0)));
	const loopGlow = clamp(0.25 * loopTravel + accent + (f > C.loop && f < landAt(8) + 8 ? 0.25 : 0));
	const loopLabel = prog(f, loopFrom(0) - 2, 10, ease.outCubic);
	const connPulse = Math.max(0, ...SHOW.slice(1).map((at) => hit(f, at, 6)));

	return (
		<AbsoluteFill>
			{/* alone caldo dietro il pannello */}
			<div
				style={{
					position: 'absolute',
					left: 540 - 620,
					top: 640 - 560,
					width: 1240,
					height: 1120,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.13 + 0.06 * beat + 0.12 * accent)} 0%, ${alpha(COLORS.orangeDeep, 0.06)} 50%, rgba(0,0,0,0) 100%)`,
					opacity: panelIn * (1 - exit),
				}}
			/>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					transformOrigin: `${HUB.x}px ${HUB.y}px`,
					transform: `translateY(${camY}px) scale(${camS})`,
				}}
			>
				{/* contesto + connettore + anello: si dissolvono per primi in uscita */}
				<div style={{position: 'absolute', inset: 0, opacity: 1 - exitFast, filter: exitFast > 0 ? `blur(${exitFast * 8}px)` : undefined}}>
					<ContextRow f={f} enter={enter} loopLabel={loopLabel} accent={accent} />
					<Connector f={f} on={prog(f, 8, 12, ease.outCubic)} pulse={connPulse} />
					<LoopLine f={f} draw={loopDraw} glow={loopGlow} opacity={1} />
				</div>

				{/* pannello delle probabilità: nasce dal punto di luce */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						transformOrigin: `${HUB.x}px ${HUB.y}px`,
						transform: `scale(${lerp(0.35, 1, panelIn) * (1 - 0.5 * exitFast)})`,
						opacity: clamp(panelIn * 1.5) * (1 - exitFast),
						filter: panelIn < 1 || exitFast > 0 ? `blur(${(1 - panelIn) * 10 + exitFast * 8}px)` : undefined,
					}}
				>
					<ProbPanel f={f} enter={panelIn} beat={beat * 0.5} />
					{/* nota sulla casualità */}
					<div
						style={{
							position: 'absolute',
							left: PANEL.x + 8,
							top: NOTE_Y - 16,
							height: 32,
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							fontFamily: FONTS.mono,
							fontSize: 24,
							color: alpha(COLORS.gray, 0.9),
							opacity: prog(f, C.pick + 8, 10, ease.outCubic),
							transform: `translateY(${(1 - prog(f, C.pick + 8, 10, ease.outCubic)) * 12}px)`,
							whiteSpace: 'nowrap',
						}}
					>
						<span style={{color: COLORS.orangeBright, fontWeight: 700}}>~</span>
						spesso con un pizzico di casualità
					</div>
				</div>

				{/* risposta */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						transformOrigin: `${HUB.x}px ${HUB.y}px`,
						transform: `scale(${lerp(0.4, 1, ansIn)})`,
						opacity: clamp(ansIn * 1.5),
						filter: ansIn < 1 ? `blur(${(1 - ansIn) * 10}px)` : undefined,
					}}
				>
					<AnswerArea f={f} enter={ansIn} exit={exitFast} />
				</div>

				<PredictFX f={f} />
				<FlyingChips f={f} />
			</div>
		</AbsoluteFill>
	);
};

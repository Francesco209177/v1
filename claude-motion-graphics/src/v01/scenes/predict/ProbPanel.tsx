import React from 'react';
import {clamp, ease, hit, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {TokenChip, tokenWidth} from '../../components/TokenChip';
import {chipCenterInRow, FAST, GROW, landAt, N, PANEL, PICK, rowY, SHOW, stepAt, STEPS} from './data';

/**
 * Pannello "PROSSIMO TOKEN?": 4 candidati + "altro" come barre orizzontali.
 * A ogni passo le barre crescono, il vincitore (riga 0) viene evidenziato, lampeggia e decolla;
 * le altre barre collassano finché il contesto aggiornato non produce la distribuzione successiva.
 */
const slow = (s: number) => s < 2;

/** Stato di una riga al frame f per il passo s. */
const rowState = (f: number, s: number, i: number) => {
	const {stagger, dur} = GROW(s);
	const g = prog(f, SHOW[s] + i * stagger, dur, ease.outQuart);
	const label = prog(f, SHOW[s] + i * stagger - 1, Math.max(3, dur * 0.6), ease.outCubic);
	// l'ultimo passo non collassa: resta visibile (attenuato) mentre la risposta è completa
	const c = s === N - 1 && i > 0 ? 0 : prog(f, PICK[s] + (slow(s) ? 3 : 1), slow(s) ? 9 : 2, ease.inCubic);
	return {g, label, c};
};

export const ProbPanel: React.FC<{f: number; enter: number; beat: number}> = ({f, enter, beat}) => {
	const s = stepAt(f);
	const cands = STEPS[s];
	const rest = Math.max(0, 1 - cands.reduce((n, c) => n + c.p, 0));
	const rows = [...cands, {t: 'altro', p: rest}];
	const P = PICK[s];
	const sl = slow(s);
	// anticipazione → selezione → lampo
	const sel = prog(f, P - (sl ? 8 : 3), sl ? 7 : 2, ease.outCubic) * (1 - prog(f, P + (sl ? 4 : 1), sl ? 8 : 2));
	const flash = hit(f, P, sl ? 9 : 5);
	const launched = f >= P;
	const sweep = ((f - SHOW[s]) / 26) % 1;
	const h = PANEL.bottom - PANEL.top;

	return (
		<div style={{position: 'absolute', left: PANEL.x, top: PANEL.top, width: PANEL.w, height: h, opacity: 1 - 0.5 * prog(f, landAt(N - 1), 12, ease.inOutSine)}}>
			{/* vetro scuro */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: 30,
					background: `linear-gradient(180deg, ${alpha(COLORS.surface2, 0.92)} 0%, ${alpha(COLORS.bgSoft, 0.94)} 100%)`,
					border: `1px solid ${alpha(COLORS.orange, 0.26 + 0.3 * beat + 0.4 * flash)}`,
					boxShadow: `0 30px 80px rgba(0,0,0,0.65), 0 0 ${36 + 60 * (beat + flash)}px ${alpha(COLORS.orange, 0.1 + 0.18 * beat + 0.25 * flash)}, inset 0 1px 0 rgba(255,255,255,0.07)`,
				}}
			/>
			{/* filo luminoso superiore */}
			<div
				style={{
					position: 'absolute',
					left: 40,
					right: 40,
					top: 0,
					height: 2,
					opacity: enter,
					background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0)} 0%, ${alpha(COLORS.orange, 0.4)} ${sweep * 100 - 22}%, ${COLORS.orangeHot} ${sweep * 100}%, ${alpha(COLORS.orange, 0.4)} ${sweep * 100 + 22}%, ${alpha(COLORS.orange, 0)} 100%)`,
				}}
			/>
			{/* intestazione */}
			<div
				style={{
					position: 'absolute',
					left: 36,
					right: 36,
					top: PANEL.headerY - PANEL.top - 18,
					height: 36,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					fontFamily: FONTS.mono,
					whiteSpace: 'nowrap',
				}}
			>
				<div style={{display: 'flex', alignItems: 'center', gap: 14, fontSize: 27, fontWeight: 700, letterSpacing: '0.14em', color: COLORS.orange}}>
					<span style={{width: 12, height: 12, borderRadius: 3, background: COLORS.orange, boxShadow: `0 0 12px ${COLORS.orange}`}} />
					PROSSIMO TOKEN?
				</div>
				<div style={{fontSize: 24, color: alpha(COLORS.gray, 0.85), letterSpacing: '0.02em'}}>probabilità illustrative</div>
			</div>
			<div style={{position: 'absolute', left: 36, right: 36, top: PANEL.divY - PANEL.top, height: 1, background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0.5)}, ${alpha(COLORS.white, 0.1)})`}} />

			{/* cornice di selezione sulla riga vincente */}
			{sel > 0.01 ? (
				<div
					style={{
						position: 'absolute',
						left: 18 - 6 * (1 - sel),
						right: 18 - 6 * (1 - sel),
						top: rowY(0) - PANEL.top - 31,
						height: 62,
						borderRadius: 16,
						opacity: sel,
						border: `2px solid ${alpha(COLORS.orangeHot, 0.85)}`,
						background: alpha(COLORS.orange, 0.1 + 0.25 * flash),
						boxShadow: `0 0 ${24 + 40 * flash}px ${alpha(COLORS.orange, 0.45 + 0.4 * flash)}`,
					}}
				/>
			) : null}

			{rows.map((r, i) => {
				const {g, label, c} = rowState(f, s, i);
				const other = i > 0 ? 1 - 0.55 * sel : 1;
				const vis = (1 - c) * other;
				const isAltro = i === rows.length - 1;
				const y = rowY(i) - PANEL.top;
				const win = i === 0;
				const barW = PANEL.trackW * r.p * g * (1 - c);
				const pct = FAST(s) ? Math.round(r.p * 100) : Math.round(r.p * 100 * clamp(g * 1.05));
				const fl = win ? flash : 0;
				return (
					<React.Fragment key={`${s}-${i}`}>
						{/* etichetta: chip del token (o "altro") */}
						{isAltro ? (
							<div
								style={{
									position: 'absolute',
									left: PANEL.chipLeft - PANEL.x + 6,
									top: y - 20,
									height: 40,
									lineHeight: '40px',
									fontFamily: FONTS.mono,
									fontSize: 28,
									color: alpha(COLORS.gray, 0.9),
									opacity: label * vis,
									transform: `translateY(${(1 - label) * 16}px)`,
								}}
							>
								altro
							</div>
						) : win && launched ? (
							// il chip è decollato: resta il suo contorno
							<div
								style={{
									position: 'absolute',
									left: PANEL.chipLeft - PANEL.x - 4,
									top: y - 27,
									width: tokenWidth(r.t, PANEL.chipSize) + 8,
									height: 54,
									borderRadius: 13,
									border: `2px dashed ${alpha(COLORS.orange, 0.55 * (1 - c))}`,
								}}
							/>
						) : (
							<div style={{position: 'absolute', left: -PANEL.x, top: -PANEL.top, transform: `translateY(${(1 - label) * 18}px)`}}>
								<TokenChip
									text={r.t}
									x={chipCenterInRow(r.t)}
									y={rowY(i)}
									size={PANEL.chipSize}
									glow={win ? 0.7 + 0.8 * sel : 0.45}
									active={win && sel > 0.3}
									opacity={label * vis}
								/>
							</div>
						)}
						{/* binario + barra */}
						<div
							style={{
								position: 'absolute',
								left: PANEL.trackX - PANEL.x,
								top: y - 7,
								width: PANEL.trackW,
								height: 14,
								borderRadius: 7,
								background: alpha(COLORS.white, 0.07),
								overflow: 'hidden',
								opacity: enter,
							}}
						>
							<div
								style={{
									position: 'absolute',
									left: 0,
									top: 0,
									bottom: 0,
									width: barW,
									borderRadius: 7,
									overflow: 'hidden',
									opacity: other,
									background: isAltro
										? `linear-gradient(90deg, ${alpha(COLORS.grayDim, 0.7)}, ${alpha(COLORS.gray, 0.8)})`
										: fl > 0.02
											? `linear-gradient(90deg, ${COLORS.orange} 0%, ${COLORS.orangeHot} 55%, ${COLORS.white} 100%)`
											: `linear-gradient(90deg, ${COLORS.orangeDeep} 0%, ${COLORS.orange} 60%, ${win ? COLORS.orangeHot : COLORS.orangeBright} 100%)`,
								}}
							>
								{/* riflesso che scorre sulla barra */}
								{!isAltro && g > 0.9 && c < 0.05 ? (
									<div
										style={{
											position: 'absolute',
											top: 0,
											bottom: 0,
											left: barW * ((((f - SHOW[s]) / 24 + i * 0.17) % 1) * 1.6 - 0.3),
											width: 44,
											background: `linear-gradient(90deg, ${alpha(COLORS.white, 0)}, ${alpha(COLORS.white, 0.5)}, ${alpha(COLORS.white, 0)})`,
										}}
									/>
								) : null}
							</div>
						</div>
						{/* bagliore della barra vincente */}
						{win && (sel > 0.01 || fl > 0.01) ? (
							<div
								style={{
									position: 'absolute',
									left: PANEL.trackX - PANEL.x - 10,
									top: y - 20,
									width: barW + 20,
									height: 40,
									borderRadius: 20,
									background: `radial-gradient(closest-side, ${alpha(COLORS.orangeHot, 0.35 * sel + 0.6 * fl)}, ${alpha(COLORS.orange, 0)})`,
								}}
							/>
						) : null}
						{/* percentuale */}
						<div
							style={{
								position: 'absolute',
								left: PANEL.pctRight - PANEL.x - 120,
								width: 120,
								top: y - 20,
								height: 40,
								lineHeight: '40px',
								textAlign: 'right',
								fontFamily: FONTS.mono,
								fontSize: win ? 32 : 28,
								fontWeight: win ? 700 : 500,
								color: isAltro ? alpha(COLORS.gray, 0.9) : win ? (fl > 0.3 ? COLORS.white : COLORS.orangeHot) : COLORS.white,
								textShadow: win ? `0 0 ${12 + 20 * fl}px ${alpha(COLORS.orange, 0.6 + 0.4 * fl)}` : undefined,
								opacity: clamp(label * 1.3) * vis,
							}}
						>
							{pct}%
						</div>
					</React.Fragment>
				);
			})}
		</div>
	);
};

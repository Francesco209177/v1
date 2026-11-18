import React from 'react';
import {clamp, ease, hit, invLerp, lerp, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {OrbyxIcon} from '../../components/FakeMessage';
import {a4, C4} from '../../theme';
import {V4_FAKE} from '../../timeline';
import {WarnGlyph} from '../hook/glyphs';
import {PhishDomain} from './Addr';
import {L, PERSP, revealP, T, WIN, type WinPose, zoomP} from './timing';

const MONO_LABEL: React.CSSProperties = {fontFamily: FONTS.mono, fontSize: 25, letterSpacing: '0.14em', textTransform: 'uppercase'};

/** Etichetta rossa di "segnale d'allarme" (pill in mono maiuscolo). */
const Flag: React.FC<{k: number; children: React.ReactNode; style?: React.CSSProperties}> = ({k, children, style}) =>
	k <= 0.001 ? null : (
		<div
			style={{
				position: 'absolute',
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				padding: '9px 16px 9px 12px',
				borderRadius: 999,
				background: `linear-gradient(180deg, ${a4(C4.red, 0.95)}, ${a4(C4.redDeep, 0.95)})`,
				boxShadow: `0 0 ${24 + 30 * k}px ${a4(C4.red, 0.55)}, inset 0 1px 0 rgba(255,255,255,0.25)`,
				color: C4.white,
				fontFamily: FONTS.mono,
				fontWeight: 700,
				fontSize: 24,
				letterSpacing: '0.12em',
				whiteSpace: 'nowrap',
				opacity: clamp(k * 1.6),
				transform: `scale(${0.6 + 0.4 * k})`,
				transformOrigin: '100% 50%',
				...style,
			}}
		>
			<WarnGlyph size={24} color={C4.white} stroke={2.6} fill={a4(C4.white, 0.15)} />
			{children}
		</div>
	);

/** Puntatore del mouse (generico). */
const Cursor: React.FC<{x: number; y: number; opacity: number}> = ({x, y, opacity}) =>
	opacity <= 0.001 ? null : (
		<svg width="44" height="58" viewBox="0 0 22 29" style={{position: 'absolute', left: x - 3, top: y - 2, opacity, overflow: 'visible', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.6))'}}>
			<path d="M1.5 1.5 L1.5 22 L6.6 17.4 L10.2 26 L13.8 24.4 L10.3 16 L17.3 16 Z" fill="#F2F6F4" stroke="#0A0C0D" strokeWidth="1.4" strokeLinejoin="round" />
		</svg>
	);

/** Mirino: quattro angoli che agganciano il rettangolo dato. */
const Brackets: React.FC<{x: number; y: number; w: number; h: number; k: number; color: string}> = ({x, y, w, h, k, color}) => {
	if (k <= 0.001) return null;
	const s = 1 + 0.3 * (1 - k);
	const arm = 30;
	const corner = (sx: number, sy: number) => (
		<path
			d={`M ${sx * arm} 0 L 0 0 L 0 ${sy * arm}`}
			transform={`translate(${sx < 0 ? w : 0} ${sy < 0 ? h : 0})`}
			fill="none"
			stroke={color}
			strokeWidth="4"
			strokeLinecap="round"
		/>
	);
	return (
		<svg width={w} height={h} style={{position: 'absolute', left: x, top: y, overflow: 'visible', opacity: clamp(k * 1.5), transform: `scale(${s})`, filter: `drop-shadow(0 0 8px ${a4(color, 0.7)})`}}>
			{corner(1, 1)}
			{corner(-1, 1)}
			{corner(1, -1)}
			{corner(-1, -1)}
		</svg>
	);
};

/**
 * Finestra e-mail FITTIZIA in 3D: sembra arrivare da "Orbyx Sicurezza" (icona, marchio, tono urgente), ma il
 * mittente e il collegamento puntano a 0rbyx-verifica.example (dominio riservato, irraggiungibile).
 * Contiene puntatore, suggerimento con l'indirizzo reale, mirino e i segnali d'allarme (urgenza, mittente, link).
 */
export const MailWindow: React.FC<{a: number; pose: WinPose}> = ({a, pose}) => {
	const land = hit(a, T.message, 9);
	const sheen = invLerp(T.message - 1, T.message + 13, a);
	// puntatore e hover
	const cIn = ease.outCubic(invLerp(T.cursorFrom, T.hover, a));
	const cx = lerp(830, L.cursorRest.x, cIn) + (a > T.hover ? Math.sin((a - T.hover) / 9) * 3 : 0);
	const cy = lerp(860, L.cursorRest.y, cIn) + (a > T.hover ? Math.cos((a - T.hover) / 11) * 2 : 0);
	const cOp = prog(a, T.cursorFrom, 4) * (1 - prog(a, T.reveal - 3, 6));
	const hover = prog(a, T.hover - 1, 4);
	// suggerimento con l'indirizzo reale
	const tipIn = prog(a, T.tooltip, 7, ease.outCubic);
	const dock = prog(a, T.retract + 6, 8, ease.outCubic);
	const lock = prog(a, T.lock, 7, ease.outCubic) * (1 - prog(a, T.reveal + 1, 5));
	const lockRed = prog(a, T.reveal - 6, 5);
	// segnali d'allarme
	const fU = prog(a, T.flagUrgency, 8, ease.outBack);
	const fS = prog(a, T.flagSender, 8, ease.outBack);
	const fUb = prog(a, T.flagUrgency - 1, 9, ease.outCubic);
	const dim = 0.86 * revealP(a);
	const zf = zoomP(a); // messa a fuoco: il resto della finestra si scurisce
	const warnEdge = Math.max(dock, fUb);
	return (
		<div style={{position: 'absolute', left: pose.x, top: pose.y, width: 0, height: 0, perspective: PERSP, opacity: pose.opacity}}>
			<div
				style={{
					position: 'absolute',
					left: -WIN.w / 2,
					top: -WIN.h / 2,
					width: WIN.w,
					height: WIN.h,
					transform: `scale(${pose.scale}) rotateX(${pose.rotX}deg) rotateY(${pose.rotY}deg)`,
					transformStyle: 'preserve-3d',
				}}
			>
				{/* lastre di profondità dietro la finestra */}
				{[1, 2].map((i) => (
					<div
						key={i}
						style={{
							position: 'absolute',
							inset: 0,
							borderRadius: 34,
							border: `2px solid ${a4(C4.red, 0.2 / i)}`,
							background: a4(C4.redDeep, 0.06 / i),
							transform: `translateZ(${-38 * i}px)`,
						}}
					/>
				))}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: 34,
						overflow: 'hidden',
						background: 'linear-gradient(180deg, rgba(30,35,37,0.98) 0%, rgba(17,20,22,0.99) 100%)',
						border: `2px solid ${land > 0.02 ? `rgba(255,255,255,${0.12 + 0.6 * land})` : a4(warnEdge > 0.01 ? C4.red : C4.white, 0.12 + 0.45 * warnEdge)}`,
						boxShadow: `0 50px 140px rgba(0,0,0,0.75), 0 0 ${60 + 80 * land}px ${a4(C4.red, 0.14 + 0.35 * land + 0.2 * warnEdge)}, inset 0 1px 0 rgba(255,255,255,0.08)`,
						fontFamily: FONTS.body,
						color: C4.white,
					}}
				>
					{/* barra della finestra */}
					<div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 68, background: 'rgba(255,255,255,0.03)', borderBottom: `1.5px solid ${C4.line}`}} />
					<div style={{position: 'absolute', left: 38, top: 21, display: 'flex', alignItems: 'center', gap: 14, ...MONO_LABEL, color: C4.gray}}>
						<svg width="30" height="22" viewBox="0 0 30 22">
							<rect x="1.5" y="1.5" width="27" height="19" rx="3" fill="none" stroke={C4.gray} strokeWidth="2" />
							<path d="M2.5 3 L15 12 L27.5 3" fill="none" stroke={C4.gray} strokeWidth="2" />
						</svg>
						Posta in arrivo
					</div>
					<div style={{position: 'absolute', right: 38, top: 21, ...MONO_LABEL, letterSpacing: '0.06em', color: C4.grayDim, opacity: 1 - clamp(fS * 3)}}>09:41</div>
					{/* intestazione: mittente e oggetto */}
					<div style={{position: 'absolute', left: 40, top: 98, ...MONO_LABEL, letterSpacing: '0.04em', textTransform: 'none', color: C4.gray}}>Da:</div>
					<div style={{position: 'absolute', left: 176, top: 88, display: 'flex', alignItems: 'center', gap: 12}}>
						<OrbyxIcon size={44} />
						<span style={{fontWeight: 600, fontSize: 30}}>Orbyx Sicurezza</span>
					</div>
					<div style={{position: 'absolute', left: 176, top: 143, fontFamily: FONTS.mono, fontSize: 25, color: fS > 0.02 ? C4.redHot : C4.gray, whiteSpace: 'nowrap'}}>
						{'<no-reply@'}
						<PhishDomain k={fS} color={fS > 0.02 ? C4.redBright : undefined} />
						{'>'}
						{fS > 0.01 ? <div style={{position: 'absolute', left: 0, right: 0, bottom: -4, height: 3, borderRadius: 2, background: C4.red, transformOrigin: '0 50%', transform: `scaleX(${clamp(fS)})`, boxShadow: `0 0 10px ${a4(C4.red, 0.8)}`}} /> : null}
					</div>
					<div style={{position: 'absolute', left: 40, top: 199, ...MONO_LABEL, letterSpacing: '0.04em', textTransform: 'none', color: C4.gray}}>Oggetto:</div>
					<div style={{position: 'absolute', left: 176, top: 194, fontWeight: 600, fontSize: 29}}>Azione richiesta: account sospeso</div>
					<div style={{position: 'absolute', left: 40, right: 40, top: 254, height: 1.5, background: C4.line}} />
					{/* marchio (fittizio) */}
					<div style={{position: 'absolute', left: 40, top: 282, display: 'flex', alignItems: 'center', gap: 16}}>
						<OrbyxIcon size={60} />
						<span style={{fontFamily: FONTS.display, fontWeight: 600, fontSize: 44, letterSpacing: '-0.01em'}}>{V4_FAKE.service}</span>
					</div>
					{/* titolo urgente (+ evidenziazione del segnale) */}
					{fUb > 0.01 ? (
						<div
							style={{
								position: 'absolute',
								left: L.title.x - 14,
								top: L.title.y - 6,
								height: L.title.h + 10,
								width: (L.title.w - 50) * fUb,
								borderRadius: 10,
								background: a4(C4.red, 0.2),
								borderLeft: `4px solid ${C4.red}`,
								boxShadow: `0 0 30px ${a4(C4.red, 0.25)}`,
							}}
						/>
					) : null}
					<div style={{position: 'absolute', left: L.title.x, top: L.title.y, fontFamily: FONTS.display, fontWeight: 600, fontSize: 44, lineHeight: `${L.title.h}px`, letterSpacing: '-0.01em', color: fUb > 0.3 ? C4.redHot : C4.white}}>
						Il tuo account verrà sospeso!
					</div>
					<div style={{position: 'absolute', left: 40, right: 40, top: 446, fontSize: 28, lineHeight: 1.42, color: '#C9D1CD'}}>
						Abbiamo rilevato un accesso insolito. Verifica subito i tuoi dati entro 24 ore per evitare la sospensione.
					</div>
					{/* pulsante (il collegamento) */}
					<div
						style={{
							position: 'absolute',
							left: L.btn.x,
							top: L.btn.y,
							width: L.btn.w,
							height: L.btn.h,
							borderRadius: 20,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontWeight: 600,
							fontSize: 32,
							background: `linear-gradient(180deg, ${a4(C4.redBright, 0.95)} 0%, ${a4(C4.red, 0.95)} 55%, ${a4(C4.redDeep, 0.98)} 100%)`,
							boxShadow: `0 0 ${30 + 30 * hover}px ${a4(C4.red, 0.35 + 0.25 * hover)}, inset 0 1px 0 rgba(255,255,255,0.28), inset 0 0 0 ${2 * hover}px rgba(255,255,255,${0.55 * hover})`,
						}}
					>
						{V4_FAKE.cta}
					</div>
					{/* suggerimento al passaggio del puntatore: l'indirizzo reale del collegamento */}
					{tipIn > 0.001 ? (
						<div
							style={{
								position: 'absolute',
								left: L.tip.x,
								top: L.tip.y,
								width: L.tip.w,
								height: L.tip.h,
								opacity: tipIn,
								transform: `translateY(${(1 - tipIn) * -10}px) scaleY(${0.7 + 0.3 * tipIn})`,
								transformOrigin: '50% 0%',
								borderRadius: 14,
								background: '#0A0D0E',
								border: `1.5px solid ${a4(dock > 0.01 ? C4.red : C4.white, 0.2 + 0.5 * dock)}`,
								boxShadow: `0 14px 30px rgba(0,0,0,0.6)${dock > 0.01 ? `, 0 0 ${30 * dock}px ${a4(C4.red, 0.5 * dock)}` : ''}`,
								fontFamily: FONTS.mono,
								fontSize: 24,
								lineHeight: '34px',
								padding: '13px 20px',
								boxSizing: 'border-box',
								color: '#C9D1CD',
								whiteSpace: 'nowrap',
							}}
						>
							<div style={{position: 'absolute', left: L.cursorRest.x - L.tip.x - 10, top: -9, width: 16, height: 16, background: '#0A0D0E', borderLeft: `1.5px solid ${a4(dock > 0.01 ? C4.red : C4.white, 0.2 + 0.5 * dock)}`, borderTop: `1.5px solid ${a4(dock > 0.01 ? C4.red : C4.white, 0.2 + 0.5 * dock)}`, transform: 'rotate(45deg)'}} />
							<div style={{opacity: 1 - revealP(a)}}>
								<div>
									https://
									<PhishDomain k={dock} color={dock > 0.02 ? C4.redBright : C4.white} />
								</div>
								<div style={{color: C4.gray}}>{V4_FAKE.phishPath}</div>
							</div>
						</div>
					) : null}
					<Brackets x={L.tip.x - 16} y={L.tip.y - 16} w={L.tip.w + 32} h={L.tip.h + 32} k={lock} color={lockRed > 0.5 ? C4.redBright : C4.white} />
					{/* piè di pagina */}
					<div style={{position: 'absolute', left: 40, top: 838, fontSize: 25, color: C4.grayDim}}>Team Sicurezza Orbyx · non rispondere</div>
					{/* segnali d'allarme */}
					<Flag k={fU} style={{right: 40, top: 290}}>
						URGENZA
					</Flag>
					<Flag k={fS} style={{right: 34, top: 11}}>
						MITTENTE SOSPETTO
					</Flag>
					{/* riflesso che attraversa il vetro all'impatto */}
					{sheen > 0 && sheen < 1 ? (
						<div
							style={{
								position: 'absolute',
								top: -200,
								bottom: -200,
								width: 260,
								left: lerp(-400, WIN.w + 140, ease.inOutCubic(sheen)),
								transform: 'rotate(18deg)',
								background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0) 100%)',
							}}
						/>
					) : null}
					{zf > 0.01 ? (
						<div style={{position: 'absolute', inset: 0, background: `radial-gradient(62% 22% at 50% 78%, rgba(4,5,6,0) 0%, rgba(4,5,6,0) 55%, rgba(4,5,6,${0.72 * zf}) 100%)`}} />
					) : null}
					<Cursor x={cx} y={cy} opacity={cOp} />
					{/* la finestra si scurisce quando la targa è in primo piano */}
					{dim > 0.003 ? <div style={{position: 'absolute', inset: 0, background: `rgba(4,5,6,${dim})`}} /> : null}
				</div>
			</div>
		</div>
	);
};

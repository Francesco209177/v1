import React from 'react';
import {FONTS} from '../../theme';
import {V4_FAKE} from '../timeline';
import {a4, C4} from '../theme';

/** Icona del servizio fittizio "Orbyx": anello con punto (nessun marchio reale). */
export const OrbyxIcon: React.FC<{size?: number; color?: string}> = ({size = 48, color = C4.white}) => (
	<svg width={size} height={size} viewBox="0 0 48 48">
		<rect x="1" y="1" width="46" height="46" rx="12" fill={a4(color, 0.08)} stroke={a4(color, 0.4)} strokeWidth="2" />
		<circle cx="24" cy="24" r="11" fill="none" stroke={color} strokeWidth="4" />
		<circle cx="33" cy="15" r="4" fill={C4.red} />
	</svg>
);

/**
 * Messaggio fraudolento FITTIZIO (stile e-mail/SMS di sicurezza): mittente "Orbyx · Sicurezza", testo urgente,
 * pulsante e riga del collegamento. Nessun indirizzo reale: il link usa il dominio riservato ".example".
 * - linkReveal 0..1: il collegamento passa da "Verifica subito" all'indirizzo reale sospetto, evidenziato in rosso.
 * - suspicious 0..1: accende i segnali d'allarme (urgenza, mittente, dominio).
 * - pressed 0..1: pulsante premuto.
 */
export const FakeMessage: React.FC<{
	x: number;
	y: number;
	width?: number;
	scale?: number;
	rotX?: number;
	rotY?: number;
	opacity?: number;
	linkReveal?: number;
	suspicious?: number;
	pressed?: number;
	compact?: boolean;
}> = ({x, y, width = 760, scale = 1, rotX = 0, rotY = 0, opacity = 1, linkReveal = 0, suspicious = 0, pressed = 0, compact = false}) => {
	const W = width;
	const pad = compact ? 26 : 36;
	const fs = compact ? 30 : 36;
	const warn = suspicious;
	return (
		<div style={{position: 'absolute', left: x, top: y, width: 0, height: 0, perspective: 2000, opacity}}>
			<div
				style={{
					position: 'absolute',
					left: -W / 2,
					top: 0,
					width: W,
					transform: `translateY(-50%) scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
					borderRadius: 34,
					padding: pad,
					background: 'linear-gradient(180deg, rgba(28,33,35,0.97) 0%, rgba(16,19,21,0.98) 100%)',
					border: `2px solid ${a4(warn > 0.01 ? C4.red : C4.white, 0.12 + 0.5 * warn)}`,
					boxShadow: `0 40px 120px rgba(0,0,0,0.7), 0 0 ${70 * (0.4 + warn)}px ${a4(C4.red, 0.12 + 0.3 * warn)}, inset 0 1px 0 rgba(255,255,255,0.08)`,
					fontFamily: FONTS.body,
					color: C4.white,
				}}
			>
				{/* mittente */}
				<div style={{display: 'flex', alignItems: 'center', gap: 18}}>
					<OrbyxIcon size={compact ? 46 : 56} />
					<div style={{flex: 1}}>
						<div style={{fontWeight: 600, fontSize: fs * 0.9}}>{V4_FAKE.notifTitle}</div>
						<div style={{fontFamily: FONTS.mono, fontSize: Math.max(24, fs * 0.66), color: warn > 0.5 ? C4.redBright : C4.gray}}>
							{warn > 0.5 ? 'no-reply@0rbyx-verifica.example' : 'ora · messaggio'}
						</div>
					</div>
				</div>
				{/* testo urgente */}
				<div style={{marginTop: compact ? 18 : 26, fontSize: fs * 1.05, fontWeight: 600, lineHeight: 1.25}}>
					<span style={{color: warn > 0.3 ? C4.redBright : C4.white, textShadow: warn > 0.3 ? `0 0 18px ${a4(C4.red, 0.6 * warn)}` : 'none'}}>⚠ </span>
					{V4_FAKE.notifText}
				</div>
				{/* pulsante */}
				<div
					style={{
						marginTop: compact ? 22 : 30,
						height: compact ? 70 : 84,
						borderRadius: 18,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontWeight: 600,
						fontSize: fs * 0.95,
						background: `linear-gradient(180deg, ${a4(C4.red, 0.92 - 0.25 * pressed)}, ${a4(C4.redDeep, 0.95)})`,
						boxShadow: `0 0 ${30 + 40 * pressed}px ${a4(C4.red, 0.35 + 0.4 * pressed)}`,
						transform: `scale(${1 - 0.04 * pressed})`,
					}}
				>
					{V4_FAKE.cta}
				</div>
				{/* riga del collegamento */}
				{!compact ? (
					<div
						style={{
							marginTop: 24,
							padding: '14px 18px',
							borderRadius: 14,
							fontFamily: FONTS.mono,
							fontSize: 28,
							background: a4(linkReveal > 0.5 ? C4.red : C4.white, 0.06 + 0.08 * linkReveal),
							border: `1.5px solid ${a4(linkReveal > 0.5 ? C4.red : C4.white, 0.12 + 0.5 * linkReveal)}`,
							color: linkReveal > 0.5 ? C4.redHot : C4.gray,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
						}}
					>
						{linkReveal > 0.5 ? (
							<>
								<span style={{color: C4.gray}}>https://</span>
								<span style={{color: C4.redBright, textShadow: `0 0 14px ${a4(C4.red, 0.7)}`}}>{V4_FAKE.phishDomain}</span>
								<span style={{color: C4.grayDim}}>{V4_FAKE.phishPath}</span>
							</>
						) : (
							<span>🔗 {V4_FAKE.service.toLowerCase()} · verifica account</span>
						)}
					</div>
				) : null}
			</div>
		</div>
	);
};

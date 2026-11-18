import React from 'react';
import {clamp, ease, hash, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {OrbyxIcon} from '../../components/FakeMessage';
import {a4, C4} from '../../theme';
import {V4_FAKE} from '../../timeline';
import {IconBack, IconReload, IconWarn, Spinner} from './icons';

/** Finestra del browser (px, prima della scala) e geometria del modulo (coordinate della finestra). */
export const BW = 860;
export const BH = 840;
export const BAR = 104;
export const FORM = {x: 130, w: 600, h: 76, emailY: 420, pwY: 548, btnY: 664, btnH: 80, textX: 26} as const;
/** Centri del testo digitato (coordinate finestra) da cui partono i "pacchetti" di dati. */
export const EMAIL_TXT = {x: FORM.x + FORM.textX + 196, y: FORM.emailY + FORM.h / 2} as const;
export const PW_TXT = {x: FORM.x + FORM.textX + 110, y: FORM.pwY + FORM.h / 2} as const;

const SCRAMBLE = '0123456789abcdef-./';

export type BrowserState = {
	f: number;
	addr: number; //    0..1 comparsa dell'indirizzo
	load: number; //    0..1 barra di caricamento
	loadFade: number; // 0..1 la barra sparisce
	pf: number; //      frame dalla resa della pagina (< 0 = scheletro)
	tag: number; //     0..1 etichetta "PAGINA FALSA"
	alert: number; //   0..1 pulsazione della barra indirizzo
	header: number; // 1 = intestazione piena, < 1 attenuata (spinta sul modulo)
	emailN: number;
	dots: number;
	focus: 0 | 1 | 2;
	press: number;
	busy: number;
	stolen: number; //  0..1 i valori si staccano dai campi
};

/** Elemento della pagina che entra con un piccolo sfalsamento. */
const inAt = (pf: number, d: number): {opacity: number; transform: string} => {
	const p = prog(pf, d, 8, ease.outCubic);
	return {opacity: p, transform: `translateY(${22 * (1 - p)}px)`};
};

const Field: React.FC<{
	y: number;
	label: string;
	value: React.ReactNode;
	placeholder: string;
	focus: boolean;
	f: number;
	typing: boolean;
	show: {opacity: number; transform: string};
	stolen: number;
	valueOpacity: number;
}> = ({y, label, value, placeholder, focus, f, typing, show, stolen, valueOpacity}) => {
	const caret = focus && (typing || Math.floor(f / 8) % 2 === 0);
	const red = stolen > 0.01;
	return (
		<div style={{position: 'absolute', left: FORM.x, top: y - 34, width: FORM.w, ...show}}>
			<div style={{fontFamily: FONTS.body, fontSize: 26, fontWeight: 500, color: C4.gray, height: 34}}>{label}</div>
			<div
				style={{
					position: 'relative',
					height: FORM.h,
					borderRadius: 14,
					background: red ? a4(C4.red, 0.1 * stolen) : 'rgba(255,255,255,0.035)',
					border: `2px solid ${red ? a4(C4.red, 0.4 + 0.5 * stolen) : focus ? a4(C4.white, 0.75) : a4(C4.white, 0.16)}`,
					boxShadow: focus ? `0 0 0 5px ${a4(C4.white, 0.08)}` : red ? `0 0 26px ${a4(C4.red, 0.4 * stolen)}` : 'none',
					display: 'flex',
					alignItems: 'center',
					paddingLeft: FORM.textX - 2,
					fontFamily: FONTS.body,
					fontSize: 30,
					color: C4.white,
					whiteSpace: 'nowrap',
					overflow: 'hidden',
				}}
			>
				{value ? <span style={{opacity: valueOpacity}}>{value}</span> : focus ? null : <span style={{color: C4.grayDim}}>{placeholder}</span>}
				{caret ? <span style={{display: 'inline-block', width: 3, height: 36, marginLeft: 3, background: C4.white}} /> : null}
			</div>
		</div>
	);
};

/**
 * Pagina di accesso CONTRAFFATTA del servizio fittizio "Orbyx", dentro una finestra di browser:
 * barra con l'indirizzo truffa (rosso, dominio .example), caricamento, scheletro → pagina, modulo, "Accedi".
 * Nessun marchio reale; la password è mostrata solo come puntini.
 */
export const Browser: React.FC<BrowserState> = (s) => {
	const {f, pf} = s;
	const domain = V4_FAKE.phishDomain;
	const nDom = Math.floor(domain.length * clamp(s.addr * 1.25));
	const scr = Array.from({length: Math.min(3, domain.length - nDom)}, (_, i) => SCRAMBLE[Math.floor(hash(i + nDom, f) * SCRAMBLE.length)]).join('');
	const pathOn = clamp((s.addr - 0.8) * 5);
	const skel = 1 - prog(pf, 0, 4);
	const shimmer = ((f * 26) % 1400) - 300;
	const H = s.header;
	const logo = inAt(pf, 0);
	const title = inAt(pf, 2);
	const sub = inAt(pf, 4);
	const em = inAt(pf, 6);
	const pw = inAt(pf, 8);
	const btn = inAt(pf, 10);
	const forgot = inAt(pf, 12);
	const pageOn = pf >= 0;
	const email = V4_FAKE.email.slice(0, s.emailN);
	const dots = '•'.repeat(s.dots);
	const tagS = s.tag;

	const skelBlock = (x: number, y: number, w: number, h: number, r = 12): React.ReactNode => (
		<div
			key={`${x}-${y}`}
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width: w,
				height: h,
				borderRadius: r,
				background: `linear-gradient(100deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) ${shimmer - x}px, rgba(255,255,255,0.13) ${shimmer - x + 90}px, rgba(255,255,255,0.05) ${shimmer - x + 180}px)`,
			}}
		/>
	);

	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width: BW,
				height: BH,
				borderRadius: 30,
				overflow: 'hidden',
				background: 'linear-gradient(180deg, #131719 0%, #0D1012 100%)',
				border: `2px solid ${a4(C4.white, 0.12)}`,
				boxShadow: `0 50px 140px rgba(0,0,0,0.75), 0 0 90px ${a4(C4.red, 0.16 + 0.12 * s.alert)}, inset 0 1px 0 rgba(255,255,255,0.08)`,
				fontFamily: FONTS.body,
				color: C4.white,
			}}
		>
			{/* barra del browser */}
			<div style={{position: 'absolute', left: 0, top: 0, width: BW, height: BAR, background: 'linear-gradient(180deg, #1C2123 0%, #15191B 100%)', borderBottom: `1px solid ${a4(C4.white, 0.08)}`}}>
				<div style={{position: 'absolute', left: 28, top: 37}}>
					<IconBack size={30} color={C4.grayDim} />
				</div>
				<div
					style={{
						position: 'absolute',
						left: 78,
						top: 20,
						width: 700,
						height: 64,
						borderRadius: 32,
						background: '#0A0D0E',
						border: `2px solid ${a4(C4.red, 0.3 + 0.45 * s.alert)}`,
						boxShadow: `0 0 ${18 + 30 * s.alert}px ${a4(C4.red, 0.15 + 0.35 * s.alert)}`,
						display: 'flex',
						alignItems: 'center',
						paddingLeft: 20,
						gap: 14,
						overflow: 'hidden',
						whiteSpace: 'nowrap',
						fontFamily: FONTS.mono,
						fontSize: 30,
						WebkitMaskImage: 'linear-gradient(90deg, #000 86%, transparent 99%)',
						maskImage: 'linear-gradient(90deg, #000 86%, transparent 99%)',
					}}
				>
					<IconWarn size={28} color={C4.redBright} />
					<span>
						<span style={{color: C4.redBright, textShadow: `0 0 14px ${a4(C4.red, 0.55 + 0.3 * s.alert)}`}}>{domain.slice(0, nDom)}</span>
						<span style={{color: a4(C4.red, 0.6)}}>{nDom < domain.length && s.addr > 0 ? scr : ''}</span>
						<span style={{color: C4.grayDim, opacity: pathOn}}>{V4_FAKE.phishPath}</span>
					</span>
				</div>
				<div style={{position: 'absolute', right: 26, top: 37}}>
					{s.load > 0 && s.loadFade < 1 ? <Spinner size={30} color={C4.redBright} angle={f * 24} /> : <IconReload size={30} color={C4.grayDim} />}
				</div>
			</div>
			{/* barra di caricamento */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: BAR - 2,
					width: BW * s.load,
					height: 5,
					opacity: 1 - s.loadFade,
					background: `linear-gradient(90deg, ${a4(C4.red, 0.5)}, ${C4.redBright})`,
					boxShadow: `0 0 16px ${a4(C4.red, 0.9)}`,
				}}
			/>
			{/* scheletro durante il caricamento */}
			{skel > 0.01 ? (
				<div style={{position: 'absolute', inset: 0, opacity: skel}}>
					{skelBlock(300, 152, 76, 76, 20)}
					{skelBlock(392, 172, 168, 38)}
					{skelBlock(190, 266, 480, 40)}
					{skelBlock(250, 324, 360, 26)}
					{skelBlock(FORM.x, FORM.emailY, FORM.w, FORM.h, 14)}
					{skelBlock(FORM.x, FORM.pwY, FORM.w, FORM.h, 14)}
					{skelBlock(FORM.x, FORM.btnY, FORM.w, FORM.btnH, 16)}
				</div>
			) : null}
			{/* pagina falsa */}
			{pageOn ? (
				<>
					<div style={{position: 'absolute', left: 0, width: BW, top: 150, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, ...logo, opacity: logo.opacity * H}}>
						<OrbyxIcon size={76} />
						<div style={{fontFamily: FONTS.display, fontWeight: 600, fontSize: 52, letterSpacing: '-0.01em'}}>{V4_FAKE.service}</div>
					</div>
					<div style={{position: 'absolute', left: 0, width: BW, top: 256, textAlign: 'center', fontFamily: FONTS.display, fontWeight: 600, fontSize: 46, ...title, opacity: title.opacity * (0.35 + 0.65 * H)}}>
						Accedi al tuo account
					</div>
					<div style={{position: 'absolute', left: 0, width: BW, top: 320, textAlign: 'center', fontSize: 28, color: C4.gray, ...sub, opacity: sub.opacity * H}}>
						Sessione scaduta: accedi di nuovo.
					</div>
					<Field
						y={FORM.emailY}
						label="Email"
						value={email}
						placeholder="nome@email.example"
						focus={s.focus === 1}
						typing={s.emailN > 0 && s.emailN < V4_FAKE.email.length}
						f={f}
						show={em}
						stolen={s.stolen}
						valueOpacity={1 - s.stolen}
					/>
					<Field
						y={FORM.pwY}
						label="Password"
						value={dots ? <span style={{fontSize: 34, letterSpacing: '0.12em'}}>{dots}</span> : ''}
						placeholder="Password"
						focus={s.focus === 2}
						typing={s.dots > 0 && s.dots < 8}
						f={f}
						show={pw}
						stolen={s.stolen}
						valueOpacity={1 - s.stolen}
					/>
					<div
						style={{
							position: 'absolute',
							left: FORM.x,
							top: FORM.btnY,
							width: FORM.w,
							height: FORM.btnH,
							borderRadius: 16,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 16,
							fontWeight: 600,
							fontSize: s.busy > 0.5 ? 30 : 32,
							color: '#0B0E0F',
							background: s.busy > 0.5 ? 'linear-gradient(180deg, #C9D1CE, #AEB7B3)' : `linear-gradient(180deg, ${C4.white}, #D5DCD9)`,
							boxShadow: `0 10px 30px rgba(0,0,0,0.45), 0 0 ${30 * s.press}px ${a4(C4.white, 0.5 * s.press)}`,
							...btn,
							transform: `${btn.transform} scale(${1 - 0.045 * s.press})`,
						}}
					>
						{s.busy > 0.5 ? (
							<>
								<Spinner size={32} color="#0B0E0F" angle={f * 22} />
								<span>Accesso in corso…</span>
							</>
						) : (
							'Accedi'
						)}
					</div>
					<div style={{position: 'absolute', left: 0, width: BW, top: FORM.btnY + FORM.btnH + 22, textAlign: 'center', fontSize: 26, color: C4.gray, ...forgot, opacity: forgot.opacity * H}}>
						Password dimenticata?
					</div>
				</>
			) : null}
			{/* etichetta "pagina falsa", appesa sotto il dominio */}
			{tagS > 0.01 ? (
				<div style={{position: 'absolute', left: 120, top: BAR - 6, opacity: clamp(tagS * 2), transform: `scale(${0.7 + 0.3 * tagS})`, transformOrigin: '20px 0px'}}>
					<div style={{position: 'absolute', left: 18, top: 0, width: 2, height: 16, background: C4.redBright}} />
					<div
						style={{
							position: 'absolute',
							left: 0,
							top: 14,
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							padding: '7px 16px 7px 12px',
							borderRadius: 10,
							whiteSpace: 'nowrap',
							background: a4(C4.redDeep, 0.85),
							border: `2px solid ${C4.redBright}`,
							boxShadow: `0 0 24px ${a4(C4.red, 0.6)}`,
							fontFamily: FONTS.mono,
							fontWeight: 700,
							fontSize: 24,
							letterSpacing: '0.14em',
							color: C4.redHot,
						}}
					>
						<IconWarn size={24} color={C4.redHot} ink={C4.redDeep} />
						PAGINA FALSA
					</div>
				</div>
			) : null}
		</div>
	);
};

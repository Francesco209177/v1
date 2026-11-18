import React from 'react';
import {clamp} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';

const QUESTION = 'Funzioni anche senza Internet?';
const ANSWER = 'Sì: il modello è installato su questo computer, quindi posso rispondere anche offline.';
const WORDS = ANSWER.split(' ');
/** Parole già scritte a inizio scena e ritmo dello streaming (parole per frame). */
const W0 = 3;
const WPF = 0.15;

/**
 * Schermo del laptop (740×470): chat con l'AI, stato "Offline", la risposta continua ad arrivare
 * parola per parola (streaming) anche a cavo staccato. Testi ≥ 30 px: sullo schermo scalato restano leggibili.
 */
export const ScreenChat: React.FC<{f: number}> = ({f}) => {
	const shownF = W0 + f * WPF;
	const shown = Math.min(WORDS.length, Math.floor(shownF));
	const newest = clamp(shownF - Math.floor(shownF));
	const done = shown >= WORDS.length;
	const caretOn = !done || Math.floor(f / 8) % 2 === 0;
	return (
		<div style={{position: 'absolute', inset: 0, fontFamily: FONTS.body, color: COLORS.white}}>
			{/* barra superiore */}
			<div style={{position: 'absolute', left: 0, top: 0, right: 0, height: 70, borderBottom: `1.5px solid ${COLORS.line}`, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14}}>
				<div style={{width: 18, height: 18, borderRadius: 9, background: COLORS.orange, boxShadow: `0 0 14px ${COLORS.orange}`}} />
				<div style={{fontWeight: 600, fontSize: 30, letterSpacing: '-0.01em', color: alpha(COLORS.white, 0.92)}}>Assistente AI</div>
				<div style={{flex: 1}} />
				{/* pillola di stato: anello vuoto = nessuna connessione */}
				<div style={{display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 18px 0 14px', borderRadius: 23, boxShadow: `inset 0 0 0 2px ${alpha(COLORS.gray, 0.55)}`, background: alpha(COLORS.white, 0.04)}}>
					<div style={{width: 16, height: 16, borderRadius: 8, boxShadow: `inset 0 0 0 2.5px ${COLORS.gray}`}} />
					<div style={{fontWeight: 600, fontSize: 30, color: COLORS.gray}}>Offline</div>
				</div>
			</div>
			{/* domanda dell'utente */}
			<div style={{position: 'absolute', right: 24, top: 92, maxWidth: 560, padding: '12px 22px', borderRadius: '24px 24px 6px 24px', background: '#2B2623', fontSize: 30, lineHeight: '40px', color: alpha(COLORS.white, 0.95)}}>
				{QUESTION}
			</div>
			{/* risposta in streaming */}
			<div style={{position: 'absolute', left: 24, top: 172, width: 690, display: 'flex', gap: 16}}>
				<div style={{flex: 'none', marginTop: 8, width: 30, height: 30, borderRadius: 15, background: `radial-gradient(circle at 40% 35%, ${COLORS.orangeHot}, ${COLORS.orange} 55%, ${COLORS.orangeDeep})`, boxShadow: `0 0 16px ${alpha(COLORS.orange, 0.8)}`}} />
				<div style={{fontSize: 31, lineHeight: '45px', color: alpha(COLORS.white, 0.94)}}>
					{WORDS.slice(0, shown).map((w, i) => (
						<span key={i} style={{opacity: i === shown - 1 && !done ? 0.55 + 0.45 * newest : 1}}>
							{w}{' '}
						</span>
					))}
					<span style={{display: 'inline-block', width: 4, height: 34, marginLeft: 2, verticalAlign: '-6px', background: COLORS.orange, boxShadow: `0 0 10px ${COLORS.orange}`, opacity: caretOn ? 1 : 0}} />
				</div>
			</div>
			{/* campo di input */}
			<div style={{position: 'absolute', left: 24, right: 24, bottom: 22, height: 62, borderRadius: 20, background: alpha(COLORS.white, 0.05), boxShadow: `inset 0 0 0 1.5px ${COLORS.line}`, display: 'flex', alignItems: 'center', padding: '0 12px 0 22px'}}>
				<div style={{fontSize: 28, color: alpha(COLORS.gray, 0.7)}}>Scrivi un messaggio…</div>
				<div style={{flex: 1}} />
				<div style={{width: 42, height: 42, borderRadius: 13, background: alpha(COLORS.orange, 0.85), display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
					<svg width={20} height={20} viewBox="0 0 20 20">
						<path d="M10 16 V4 M4.5 9.5 L10 4 L15.5 9.5" fill="none" stroke={COLORS.black} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				</div>
			</div>
		</div>
	);
};

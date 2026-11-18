import React from 'react';
import {useAbsFrame} from '../../../lib/frame';
import {clamp, ease, hash, invLerp} from '../../../lib/math';
import {alpha, COLORS, FONTS} from '../../../theme';
import {ROW_Y, T} from './layout';
import {layerXf} from './motion';

const OLD = 'LA TUA DOMANDA';
const NEW = 'TOKEN = PEZZO DI TESTO';
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%=/<>';
const DECODE = T.split + 2;

/** Colore di ogni carattere dell'etichetta finale: "TOKEN" arancione, "=" grigio, il resto bianco caldo. */
const colorAt = (k: number): string => (k < 5 ? COLORS.orangeBright : k < 8 ? COLORS.grayDim : COLORS.white);

/**
 * Etichette HUD (mono, maiuscole): sopra la frase "LA TUA DOMANDA" (continuità con l'input del HOOK) che,
 * dopo la scomposizione, si decodifica in "TOKEN = PEZZO DI TESTO"; sotto, la nota sugli ID illustrativi.
 */
export const Labels: React.FC = () => {
	const abs = useAbsFrame();
	const L = layerXf(abs);
	const inA = ease.outCubic(invLerp(122, 134, abs));
	const out = ease.inCubic(invLerp(214, 222, abs));
	const op = inA * (1 - out);
	const y = 548 - 128 + L.dy;
	const decoding = abs >= DECODE;
	const len = decoding ? NEW.length : OLD.length;
	const chars: React.ReactNode[] = [];
	for (let k = 0; k < len; k++) {
		let ch: string;
		let col: string;
		if (!decoding) {
			ch = OLD[k];
			col = COLORS.gray;
		} else {
			const res = DECODE + 2 + k * 0.45;
			if (abs >= res) {
				ch = NEW[k];
				col = colorAt(k);
			} else {
				ch = NEW[k] === ' ' ? ' ' : GLYPHS[Math.floor(hash(k * 31 + Math.floor(abs), 91) * GLYPHS.length)];
				col = alpha(COLORS.orange, 0.8);
			}
		}
		chars.push(
			<span key={k} style={{color: col}}>
				{ch}
			</span>,
		);
	}
	const flash = decoding ? Math.exp(-(abs - DECODE) / 6) : 0;
	const lineW = 70 + 40 * (decoding ? ease.outCubic(clamp((abs - DECODE) / 10)) : 0);
	const noteIn = ease.outCubic(invLerp(196, 205, abs));
	const noteOp = noteIn * (1 - out);
	return (
		<>
			{op > 0.003 ? (
				<div
					style={{
						position: 'absolute',
						left: 0,
						width: 1080,
						top: y - 18,
						height: 36,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 20,
						opacity: op,
						transform: `translateY(${(1 - inA) * 14}px)`,
						fontFamily: FONTS.mono,
						fontWeight: 500,
						fontSize: 26,
						letterSpacing: '0.14em',
						whiteSpace: 'pre',
					}}
				>
					<div style={{width: lineW, height: 2, background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0)}, ${alpha(COLORS.orange, 0.7)})`}} />
					<span
						style={{
							width: 10,
							height: 10,
							borderRadius: 5,
							background: COLORS.orange,
							boxShadow: `0 0 ${10 + 20 * flash}px ${COLORS.orange}`,
						}}
					/>
					<span style={{textShadow: `0 0 ${16 + 20 * flash}px ${alpha(COLORS.orange, 0.35 + 0.4 * flash)}`}}>{chars}</span>
					<div style={{width: lineW, height: 2, background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0.7)}, ${alpha(COLORS.orange, 0)})`}} />
				</div>
			) : null}
			{noteOp > 0.003 ? (
				<div
					style={{
						position: 'absolute',
						left: 0,
						width: 1080,
						top: ROW_Y[2] + 150 + L.dy,
						textAlign: 'center',
						opacity: noteOp,
						transform: `translateY(${(1 - noteIn) * 10}px)`,
						fontFamily: FONTS.mono,
						fontSize: 24,
						letterSpacing: '0.14em',
						color: alpha(COLORS.gray, 0.8),
						whiteSpace: 'pre',
					}}
				>
					ID NUMERICI · ESEMPIO ILLUSTRATIVO
				</div>
			) : null}
		</>
	);
};

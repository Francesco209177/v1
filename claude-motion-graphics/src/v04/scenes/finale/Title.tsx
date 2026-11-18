import React from 'react';
import {useAbsFrame} from '../../../lib/frame';
import {beatPulse, clamp, ease, hash, hit, lerp, prog} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4, glow4} from '../../theme';
import {F, FL} from './timing';

type Line = {text: string; size: number; y: number; at: number; accent?: boolean};
const LINES: Line[] = [
	{text: 'PRIMA DI', size: 126, y: 772, at: F.title},
	{text: 'CLICCARE,', size: 152, y: 912, at: F.title},
	{text: 'PENSA.', size: 220, y: 1088, at: F.pensa, accent: true},
];

/** Passaggio alla domanda finale: il titolo sale, si rimpicciolisce e si attenua. */
export const takeover = (f: number): number => ease.inOutCubic(clamp((f - F.takeover) / 14));

/**
 * Una riga del titolo con "slam": arriva da grande e sfocata, con il tracking larghissimo che si chiude e si
 * BLOCCA esattamente sul frame `at` (lampo bianco, rimbalzo), poi il tracking si apre lentissimo.
 */
const SlamLine: React.FC<{f: number; line: Line}> = ({f, line}) => {
	const d = f - line.at;
	if (d < -5) return null;
	const pre = clamp((d + 5) / 5);
	const pin = ease.inQuart(pre);
	const landed = d >= 0;
	const scale = landed ? 1 - 0.045 * Math.sin(clamp(d / 7) * Math.PI) : lerp(1.85, 1, pin);
	const track = landed ? lerp(-0.02, 0.012, ease.outCubic(clamp(d / 90))) : lerp(0.38, -0.02, pin);
	const blur = landed ? 0 : (1 - pin) * 7;
	const flash = landed ? hit(d, 0, 6) : 0;
	const sweep = prog(f, F.sweep + (line.accent ? 6 : 0), 22, ease.inOutSine);
	const col = line.accent ? C4.green : C4.white;
	const base: React.CSSProperties = {
		position: 'absolute',
		left: -200,
		width: 1480,
		top: line.y - line.size * 0.6,
		height: line.size * 1.2,
		lineHeight: `${line.size * 1.2}px`,
		textAlign: 'center',
		fontFamily: FONTS.display,
		fontWeight: 700,
		fontSize: line.size,
		letterSpacing: `${track}em`,
		paddingLeft: `${track}em`,
		whiteSpace: 'nowrap',
	};
	return (
		<div style={{position: 'absolute', inset: 0, transformOrigin: `540px ${line.y}px`, transform: `scale(${scale})`, opacity: clamp(pre * 2.5), filter: blur > 0.3 ? `blur(${blur}px)` : undefined}}>
			<div
				style={{
					...base,
					color: col,
					textShadow: line.accent ? glow4(C4.green, 1.15 + 0.8 * flash) : `0 6px 40px rgba(0,0,0,0.7), 0 0 ${30 * flash}px ${a4(C4.white, 0.6 * flash)}`,
				}}
			>
				{line.text}
			</div>
			{/* lampo d'impatto: copia bianca incandescente */}
			{flash > 0.02 ? <div style={{...base, color: C4.white, opacity: flash, textShadow: `0 0 10px ${C4.white}, 0 0 40px ${line.accent ? C4.greenBright : C4.white}`}}>{line.text}</div> : null}
			{/* lama di luce che attraversa le lettere */}
			{sweep > 0 && sweep < 1 ? (
				<div
					style={{
						...base,
						color: C4.white,
						textShadow: `0 0 18px ${a4(line.accent ? C4.greenHot : C4.white, 0.9)}`,
						WebkitMaskImage: `linear-gradient(105deg, transparent ${sweep * 160 - 48}%, #000 ${sweep * 160 - 30}%, transparent ${sweep * 160 - 12}%)`,
						maskImage: `linear-gradient(105deg, transparent ${sweep * 160 - 48}%, #000 ${sweep * 160 - 30}%, transparent ${sweep * 160 - 12}%)`,
					}}
				>
					{line.text}
				</div>
			) : null}
		</div>
	);
};

/** "PRIMA DI CLICCARE," (cue 750) + "PENSA." (beat 765): colpi cinetici con scossa, bagliore verde su PENSA. */
export const Title: React.FC<{f: number}> = ({f}) => {
	const abs = useAbsFrame();
	if (f < F.title - 6) return null;
	const q = takeover(f);
	const shakeK = hit(f, F.title, 5) + hit(f, F.pensa, 5);
	const sx = (hash(f, 1) - 0.5) * 2 * 16 * shakeK;
	const sy = (hash(f, 2) - 0.5) * 2 * 12 * shakeK;
	const pensa = hit(f, F.pensa, 16);
	const beat = beatPulse(abs, 4);
	const flare = hit(f, F.title, 10);
	const scale = lerp(1, FL.titleEndScale, q);
	const dy = lerp(0, FL.titleEnd - FL.titleCenter, q);
	return (
		<div style={{position: 'absolute', inset: 0, transformOrigin: `540px ${FL.titleCenter}px`, transform: `translate(${sx}px, ${dy + sy}px) scale(${scale})`, opacity: 1 - 0.38 * q}}>
			{/* scrim per la leggibilità + alone verde dietro PENSA. */}
			<div style={{position: 'absolute', left: 0, width: 1080, top: FL.titleCenter - 330, height: 660, background: 'radial-gradient(closest-side, rgba(4,5,6,0.6), rgba(4,5,6,0))', opacity: prog(f, F.title - 4, 6)}} />
			{f >= F.pensa - 2 ? (
				<div
					style={{
						position: 'absolute',
						left: 40,
						width: 1000,
						top: 1088 - 200,
						height: 400,
						background: `radial-gradient(closest-side, ${a4(C4.green, (0.16 + 0.06 * beat + 0.3 * pensa) * prog(f, F.pensa - 2, 4))}, ${a4(C4.greenDeep, 0)})`,
					}}
				/>
			) : null}
			{/* flare orizzontale sul primo colpo */}
			{flare > 0.02 ? (
				<div style={{position: 'absolute', left: -100, width: 1280, top: 846 - 4, height: 8, background: `linear-gradient(90deg, ${a4(C4.green, 0)}, ${a4(C4.greenHot, 0.85 * flare)}, ${a4(C4.green, 0)})`, transform: `scaleX(${0.4 + 0.8 * (1 - flare)})`, mixBlendMode: 'screen'}} />
			) : null}
			{pensa > 0.02 ? (
				<div style={{position: 'absolute', left: -100, width: 1280, top: 1186 - 5, height: 10, background: `linear-gradient(90deg, ${a4(C4.green, 0)}, ${a4(C4.greenHot, 0.9 * pensa)}, ${a4(C4.green, 0)})`, transform: `scaleX(${0.4 + 0.9 * (1 - pensa)})`, mixBlendMode: 'screen'}} />
			) : null}
			{LINES.map((l, i) => (
				<SlamLine key={i} f={f} line={l} />
			))}
		</div>
	);
};

import React from 'react';
import {clamp, ease, hit, lerp, prog} from '../../../lib/math';
import {alpha, COLORS, FONTS, textGlow} from '../../../theme';
import {WIDTH} from '../../../timeline';
import {LAYOUT, R} from './timing';

type Line = {words: string[]; accent: string; size: number; y: number; at: number};
const LINES: Line[] = [
	{words: ['LA', 'TUA', 'AI.'], accent: 'TUA', size: 150, y: LAYOUT.titleY1, at: R.title},
	{words: ['SUL', 'TUO', 'COMPUTER.'], accent: 'TUO', size: 79, y: LAYOUT.titleY2, at: R.title + 4},
];
const CENTER = (LAYOUT.titleY1 + LAYOUT.titleY2) / 2;

/** Progresso del passaggio alla domanda finale: il titolo sale, si rimpicciolisce e si attenua. */
export const takeover = (f: number): number => ease.inOutCubic(clamp((f - (R.question - 5)) / 20));

/** Una riga del titolo: lettere che salgono da una maschera (1 frame di sfalsamento), tracking che si apre piano, lama di luce. */
const TitleLine: React.FC<{f: number; line: Line}> = ({f, line}) => {
	const d = f - line.at;
	if (d < -1) return null;
	const track = lerp(-0.045, 0.02, ease.outCubic(clamp(d / 105)));
	const sweep = prog(f, line.at + 9, 17, ease.inOutCubic);
	const H = line.size * 1.32;
	let ci = 0;
	const masked = d < 16;
	const render = (overlay: boolean) =>
		line.words.map((w, wi) => {
			const isAccent = w === line.accent;
			return (
				<span key={wi} style={{display: 'inline-block', whiteSpace: 'nowrap', marginRight: wi < line.words.length - 1 ? '0.26em' : 0}}>
					{w.split('').map((ch) => {
						const i = ci++;
						const p = prog(d, i * 0.9, 12, ease.outQuint);
						return (
							<span
								key={i}
								style={{
									display: 'inline-block',
									transform: overlay ? undefined : `translateY(${(1 - p) * H * 0.95}px) rotate(${(1 - p) * 6}deg)`,
									color: overlay ? COLORS.white : isAccent ? COLORS.orange : COLORS.white,
									textShadow: overlay ? textGlow(COLORS.orangeHot, 0.9) : isAccent ? textGlow(COLORS.orange, 0.8) : '0 4px 30px rgba(0,0,0,0.6)',
								}}
							>
								{ch}
							</span>
						);
					})}
				</span>
			);
		});
	const base: React.CSSProperties = {
		position: 'absolute',
		left: 0,
		top: 0,
		width: WIDTH,
		height: H,
		lineHeight: `${H}px`,
		textAlign: 'center',
		fontFamily: FONTS.display,
		fontWeight: 700,
		fontSize: line.size,
		letterSpacing: `${track}em`,
		paddingLeft: `${track}em`,
		whiteSpace: 'nowrap',
	};
	ci = 0;
	const main = render(false);
	return (
		<div style={{position: 'absolute', left: 0, top: line.y - H / 2, width: WIDTH, height: H, overflow: masked ? 'hidden' : 'visible'}}>
			<div style={base}>{main}</div>
			{sweep > 0 && sweep < 1 ? (
				<div
					style={{
						...base,
						mixBlendMode: 'screen',
						WebkitMaskImage: `linear-gradient(105deg, transparent ${sweep * 150 - 40}%, #000 ${sweep * 150 - 25}%, transparent ${sweep * 150 - 10}%)`,
						maskImage: `linear-gradient(105deg, transparent ${sweep * 150 - 40}%, #000 ${sweep * 150 - 25}%, transparent ${sweep * 150 - 10}%)`,
					}}
				>
					{(() => {
						ci = 0;
						return render(true);
					})()}
				</div>
			) : null}
		</div>
	);
};

/** "LA TUA AI. / SUL TUO COMPUTER." — entra sul cue (assoluto 750) con un colpo di luce anamorfico. */
export const Title: React.FC<{f: number}> = ({f}) => {
	if (f < R.title - 1) return null;
	const q = takeover(f);
	const flash = hit(f, R.title, 14);
	const scale = lerp(1, 0.5, q);
	const dy = lerp(0, LAYOUT.endTitleY - CENTER, q);
	return (
		<div style={{position: 'absolute', inset: 0, transformOrigin: `540px ${CENTER}px`, transform: `translateY(${dy}px) scale(${scale})`, opacity: 1 - 0.45 * q}}>
			{/* bagliore + flare orizzontale sul colpo */}
			<div
				style={{
					position: 'absolute',
					left: -100,
					width: WIDTH + 200,
					top: LAYOUT.titleY1 - 6,
					height: 12,
					background: `linear-gradient(90deg, ${alpha(COLORS.orange, 0)}, ${alpha(COLORS.orangeHot, 0.85 * flash)}, ${alpha(COLORS.orange, 0)})`,
					transform: `scaleX(${0.4 + 0.8 * (1 - flash)})`,
					mixBlendMode: 'screen',
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: 40,
					width: WIDTH - 80,
					top: CENTER - 220,
					height: 440,
					background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.16 + 0.3 * flash)}, ${alpha(COLORS.orangeDeep, 0.06)} 60%, ${alpha(COLORS.orangeDeep, 0)})`,
				}}
			/>
			{/* scrim per la leggibilità sul laptop / particelle */}
			<div style={{position: 'absolute', left: 0, width: WIDTH, top: CENTER - 170, height: 340, background: 'radial-gradient(closest-side, rgba(5,5,5,0.55), rgba(5,5,5,0))'}} />
			{LINES.map((l, i) => (
				<TitleLine key={i} f={f} line={l} />
			))}
		</div>
	);
};

const NOTE = ["Prestazioni e modelli dipendono dall'hardware", 'Download iniziale del modello necessario'];

/** Nota di accuratezza (mono 24 px): si scrive a macchina dopo il titolo, poi scende sotto la domanda. */
export const Footnote: React.FC<{f: number}> = ({f}) => {
	const d = f - R.note;
	if (d < 0) return null;
	const q = takeover(f);
	const total = NOTE.join('').length;
	const typed = Math.floor(clamp(d / 22) * total);
	let left = typed;
	const y = lerp(LAYOUT.noteY, LAYOUT.endNoteY, q);
	const line = prog(d, 0, 14, ease.outQuart);
	return (
		<div style={{position: 'absolute', left: 0, width: WIDTH, top: y, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4}}>
			<div style={{width: 64 * line, height: 2, marginBottom: 10, background: alpha(COLORS.orange, 0.7)}} />
			{NOTE.map((t, i) => {
				const s = t.slice(0, Math.max(0, left));
				left -= t.length;
				return (
					<div key={i} style={{position: 'relative', fontFamily: FONTS.mono, fontSize: 24, lineHeight: '31px', color: alpha(COLORS.gray, 0.82), whiteSpace: 'pre'}}>
						<span style={{visibility: 'hidden'}}>{t}</span>
						<span style={{position: 'absolute', left: 0, top: 0}}>{s}</span>
					</div>
				);
			})}
		</div>
	);
};

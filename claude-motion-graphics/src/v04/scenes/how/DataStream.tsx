import React from 'react';
import {FrameCanvas} from '../../../components/FrameCanvas';
import {drawGlow} from '../../../lib/canvas';
import {bezier2, clamp, hash, Vec2} from '../../../lib/math';
import {FONTS} from '../../../theme';
import {a4, C4} from '../../theme';
import {IconKey, IconMail} from './icons';

/** Traiettoria di un pacchetto: partenza, controllo (curva), arrivo. */
export type Path = {a: Vec2; c: Vec2; b: Vec2};

/**
 * Pacchetto di dati che si stacca dal campo: pillola rossa luminosa con icona e valore (password solo a puntini).
 * (x, y) = centro; scale; lift 0..1 = comparsa del fondo; rot = inclinazione in volo; blur = scia.
 */
export const DataChip: React.FC<{kind: 'email' | 'pw'; text: string; x: number; y: number; scale: number; lift: number; rot: number; blur: number; glow: number}> = ({
	kind,
	text,
	x,
	y,
	scale,
	lift,
	rot,
	blur,
	glow,
}) => (
	<div style={{position: 'absolute', left: x, top: y, width: 0, height: 0}}>
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`,
				display: 'flex',
				alignItems: 'center',
				gap: 14,
				height: 70,
				padding: '0 26px 0 20px',
				borderRadius: 16,
				whiteSpace: 'nowrap',
				background: `linear-gradient(180deg, ${a4(C4.red, 0.32 * lift)}, ${a4(C4.redDeep, 0.6 * lift)})`,
				border: `2px solid ${a4(C4.redBright, 0.9 * lift)}`,
				boxShadow: `0 0 ${30 + 30 * glow}px ${a4(C4.red, (0.45 + 0.4 * glow) * lift)}, 0 16px 40px rgba(0,0,0,${0.5 * lift})`,
				filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
				fontFamily: FONTS.mono,
				fontWeight: 700,
				fontSize: kind === 'pw' ? 32 : 28,
				letterSpacing: kind === 'pw' ? '0.12em' : '0.02em',
				color: C4.white,
				textShadow: `0 0 12px ${a4(C4.red, 0.8)}`,
			}}
		>
			<div style={{opacity: lift}}>{kind === 'email' ? <IconMail size={34} color={C4.redHot} /> : <IconKey size={34} color={C4.redHot} />}</div>
			<span>{text}</span>
		</div>
	</div>
);

/**
 * Scia di particelle rosse lungo le traiettorie (canvas, sprite pre-renderizzati) + filo luminoso del "percorso".
 * p = progresso del pacchetto 0..1 per ogni traiettoria; fade = dissolvenza globale della scia.
 */
export const DataStream: React.FC<{frame: number; paths: Path[]; p: number[]; fade: number; line: number}> = ({frame, paths, p, fade, line}) => (
	<FrameCanvas
		frame={frame}
		additive
		draw={(ctx) => {
			if (fade <= 0.01) return;
			ctx.globalCompositeOperation = 'lighter';
			paths.forEach((path, k) => {
				const pk = p[k];
				// filo del percorso: alone largo + linea sottile, fino alla testa del pacchetto
				const N = 36;
				const head = Math.max(0.001, pk);
				for (const [w, a] of [
					[16, 0.08],
					[5, 0.28],
					[2, 0.65],
				] as const) {
					ctx.beginPath();
					for (let i = 0; i <= N; i++) {
						const q = bezier2(path.a, path.c, path.b, (i / N) * head);
						if (i === 0) ctx.moveTo(q.x, q.y);
						else ctx.lineTo(q.x, q.y);
					}
					ctx.strokeStyle = `rgba(240,53,59,${a * fade * line})`;
					ctx.lineWidth = w;
					ctx.lineCap = 'round';
					ctx.stroke();
				}
				// particelle che inseguono il pacchetto
				for (let i = 0; i < 46; i++) {
					const lag = hash(i, k + 3) * 0.42;
					const t = pk - lag;
					if (t <= 0 || t > 1) continue;
					const q = bezier2(path.a, path.c, path.b, t);
					const ph = hash(i, k + 11) * 6.28;
					const off = (hash(i, k + 7) - 0.5) * 34 * (0.4 + lag * 2);
					const x = q.x + Math.sin(frame * 0.5 + ph) * 4 + off;
					const y = q.y + Math.cos(frame * 0.4 + ph) * 4 + off * 0.4;
					const near = clamp(1 - lag / 0.42);
					drawGlow(ctx, x, y, 1.6 + 3.2 * near * hash(i, k + 5), C4.red, (0.35 + 0.65 * near) * fade, C4.redHot);
				}
				// testa del pacchetto
				if (pk > 0 && pk < 1) {
					const q = bezier2(path.a, path.c, path.b, pk);
					drawGlow(ctx, q.x, q.y, 16, C4.red, 0.5 * fade, C4.redHot);
				}
			});
		}}
	/>
);

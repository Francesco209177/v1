import React from 'react';
import {useCurrentFrame} from 'remotion';
import {useAbsFrame} from '../../lib/frame';
import {clamp, ease, hit, prog} from '../../lib/math';
import {alpha, boxGlow, COLORS, FONTS} from '../../theme';
import {FPS} from '../../timeline';
import {cardState} from './layout';
import {CARD, cardActive, energy, PLAY_Y, playheadX, SLOT_X, T, TRACK} from './timing';

const LABEL: React.CSSProperties = {
	position: 'absolute',
	fontFamily: FONTS.mono,
	fontSize: 24,
	fontWeight: 500,
	letterSpacing: '0.14em',
	textTransform: 'uppercase',
	color: COLORS.gray,
	whiteSpace: 'nowrap',
};

/**
 * Fase C — "costruisce ogni scena": cinque card 9:16 numerate (le cornici: il contenuto vivo
 * è disegnato sopra dagli elementi), una timeline con le clip e il playhead.
 * La card sotto il playhead si accende e si solleva.
 */
export const Storyboard: React.FC = () => {
	const f = useCurrentFrame();
	const abs = useAbsFrame();
	if (f < T.gather || f > T.arrive + 1) return null;
	const en = energy(f);
	const lock = f >= T.lock ? hit(f, T.lock, 10) : 0;
	const out = prog(f, T.implode, 6, ease.inCubic);
	const labels = prog(f, T.gather + 8, 9, ease.outCubic) * (1 - prog(f, T.implode - 3, 5));
	const px = playheadX(f);

	// timecode vivo: mm:ss:ff del reel
	const sec = Math.floor(abs / FPS);
	const timecode = `00:${String(sec).padStart(2, '0')}:${String(abs % FPS).padStart(2, '0')}`;

	// timeline: si apre dal centro poco prima del lock, viene risucchiata verso lo spark alla fine
	const trackIn = prog(f, T.gather + 6, 9, ease.outQuint);
	const trackScale = trackIn * (1 - out);
	const originX = ((px - TRACK.x) / TRACK.w) * 100;

	return (
		<>
			{/* intestazione */}
			<div style={{...LABEL, left: 80, top: 452, opacity: labels, transform: `translateY(${(1 - labels) * 14}px)`}}>Storyboard</div>
			<div style={{...LABEL, right: 80, top: 452, opacity: labels, color: COLORS.orange, transform: `translateY(${(1 - labels) * 14}px)`}}>{timecode}</div>

			{/* cornici delle card */}
			{SLOT_X.map((_, i) => {
				const c = cardState(i, f);
				if (c.alpha <= 0.004) return null;
				const hot = clamp(c.active + lock);
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: c.x - CARD.w / 2,
							top: c.y - CARD.h / 2,
							width: CARD.w,
							height: CARD.h,
							borderRadius: CARD.radius,
							transform: `rotate(${c.rot}deg) scale(${c.scale})`,
							opacity: c.alpha,
							zIndex: c.active > 0.5 ? 2 : 1,
							background: `linear-gradient(180deg, rgba(30,26,23,${0.9}) 0%, rgba(13,12,11,0.94) 100%)`,
							border: `3px solid ${hot > 0.4 ? alpha(COLORS.orange, 0.5 + 0.5 * hot) : COLORS.lineStrong}`,
							boxShadow: hot > 0.05 ? boxGlow(COLORS.orange, (0.5 + 0.7 * en) * hot) : '0 24px 60px rgba(0,0,0,0.55)',
						}}
					>
						<div
							style={{
								position: 'absolute',
								left: 16,
								top: 10,
								fontFamily: FONTS.mono,
								fontSize: 26,
								fontWeight: 700,
								letterSpacing: '0.06em',
								color: c.active > 0.5 ? COLORS.white : COLORS.gray,
							}}
						>
							{`0${i + 1}`}
						</div>
						{/* barra di avanzamento della scena */}
						<div style={{position: 'absolute', left: 16, right: 16, bottom: 16, height: 5, borderRadius: 3, background: COLORS.line}}>
							<div
								style={{
									width: `${clamp((px - (SLOT_X[i] - CARD.w / 2)) / CARD.w) * 100}%`,
									height: '100%',
									borderRadius: 3,
									background: COLORS.orange,
									opacity: 0.35 + 0.65 * c.active,
								}}
							/>
						</div>
					</div>
				);
			})}

			{/* timeline */}
			<div
				style={{
					position: 'absolute',
					left: TRACK.x,
					top: TRACK.y - 22,
					width: TRACK.w,
					height: TRACK.h + 22,
					transformOrigin: `${f >= T.implode ? originX : 50}% 50%`,
					transform: `scaleX(${trackScale}) scaleY(${1 - out})`,
					opacity: trackIn * (1 - out),
				}}
			>
				{/* righello */}
				<div
					style={{
						position: 'absolute',
						left: 6,
						right: 6,
						top: 0,
						height: 12,
						backgroundImage: `repeating-linear-gradient(90deg, ${alpha(COLORS.white, 0.3)} 0px, ${alpha(COLORS.white, 0.3)} 2px, transparent 2px, transparent 23.375px)`,
					}}
				/>
				{/* traccia */}
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 22,
						height: TRACK.h,
						borderRadius: 20,
						background: 'rgba(250,249,245,0.035)',
						border: `2px solid ${COLORS.line}`,
					}}
				/>
				{/* clip: una per scena, con i "keyframe" */}
				{SLOT_X.map((sx, i) => {
					const a = cardActive(i, f);
					const pop = ease.outBack(clamp((f - (T.gather + 9 + i)) / 8));
					return (
						<div
							key={i}
							style={{
								position: 'absolute',
								left: sx - TRACK.x - CARD.w / 2 + 7,
								top: 22 + 8,
								width: CARD.w - 14,
								height: TRACK.h - 16,
								borderRadius: 13,
								transform: `scaleY(${pop})`,
								background: `linear-gradient(180deg, ${alpha(COLORS.orange, 0.26 + 0.6 * a)} 0%, ${alpha(COLORS.orangeDeep, 0.22 + 0.55 * a)} 100%)`,
								border: `2px solid ${alpha(COLORS.orange, 0.55 + 0.45 * a)}`,
								boxShadow: a > 0.05 ? boxGlow(COLORS.orange, 0.55 * a) : undefined,
							}}
						>
							{[0.2, 0.5, 0.8].map((k) => (
								<div
									key={k}
									style={{
										position: 'absolute',
										left: `${k * 100}%`,
										top: '50%',
										width: 9,
										height: 9,
										margin: '-4.5px 0 0 -4.5px',
										transform: 'rotate(45deg)',
										background: a > 0.5 ? COLORS.white : alpha(COLORS.white, 0.6),
									}}
								/>
							))}
						</div>
					);
				})}
			</div>

			{/* playhead: la linea scende dallo spark attraverso la timeline */}
			{f >= T.lock - 1 && f < T.implode + 3 ? (
				<div
					style={{
						position: 'absolute',
						left: px - 2,
						top: PLAY_Y + 30,
						width: 4,
						height: TRACK.y + TRACK.h + 14 - (PLAY_Y + 30),
						borderRadius: 2,
						background: `linear-gradient(180deg, ${alpha(COLORS.orangeHot, 0)} 0%, ${COLORS.orangeHot} 35%, ${COLORS.white} 100%)`,
						boxShadow: boxGlow(COLORS.orange, 0.6 + 0.5 * en),
						transformOrigin: '50% 0%',
						transform: `scaleY(${prog(f, T.lock - 1, 4, ease.outQuint) * (1 - prog(f, T.implode, 3))})`,
					}}
				/>
			) : null}
		</>
	);
};

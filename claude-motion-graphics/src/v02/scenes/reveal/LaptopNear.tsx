/**
 * COPIA LOCALE di src/v02/components/Laptop.tsx (identica tranne UNA riga, vedi "FIX" più sotto), usata solo
 * nei primi frame del REVEAL, quando il laptop è più grande dell'inquadratura.
 * Motivo: nel componente condiviso l'alone dello schermo sta a translateZ(-40px), quasi parallelo al coperchio;
 * con il laptop più grande del frame Chrome (ordinamento BSP dei piani 3D) perde la parte destra del coperchio
 * (schermo tagliato verticalmente). Senza translateZ il difetto sparisce. Da segnalare al lead per il componente condiviso.
 */
import React from 'react';
import {alpha, COLORS, FONTS} from '../../../theme';

/** Dimensioni (px, prima della scala). Lo schermo è 16:10. */
const LAPTOP = {
	lidW: 780,
	lidH: 510,
	bezel: 20,
	screenW: 740,
	screenH: 470,
	baseW: 820,
	baseD: 540, // profondità della base (piano della scrivania)
	baseTilt: 64, // gradi: inclinazione della base rispetto allo schermo
} as const;

type LaptopProps = {
	/** Centro dello SCHERMO in px (coordinate del frame 1080×1920). */
	x: number;
	y: number;
	scale?: number;
	/** Rotazioni della camera attorno al laptop (gradi). */
	rotX?: number;
	rotY?: number;
	opacity?: number;
	/** Luce emessa dallo schermo (0..1.5). */
	screenGlow?: number;
	/** Cavo Ethernet: 0 = inserito; >0 = connettore estratto di tanti px lungo la scrivania. null = nessun cavo. */
	plugOut?: number | null;
	/** Scintilla sulla porta (0..1) nel momento in cui il cavo si stacca. */
	spark?: number;
	/** LED di rete accanto alla porta: 1 = acceso (connesso), 0 = spento. */
	linkLed?: number;
	/** Contenuto dello schermo (740×470, origine in alto a sinistra). */
	children?: React.ReactNode;
};

/** Connettore RJ45 visto dall'alto (lunghezza lungo x). */
const Rj45: React.FC = () => (
	<div style={{position: 'absolute', left: 0, top: -17, width: 64, height: 34}}>
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width: 48,
				height: 34,
				borderRadius: 5,
				background: 'linear-gradient(180deg, rgba(245,240,232,0.92), rgba(205,198,188,0.85))',
				boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.4), 0 4px 10px rgba(0,0,0,0.5)',
			}}
		/>
		{/* contatti dorati */}
		{Array.from({length: 8}, (_, i) => (
			<div key={i} style={{position: 'absolute', left: 3, top: 4 + i * 3.4, width: 10, height: 1.6, background: '#C9A46A'}} />
		))}
		{/* gommino */}
		<div style={{position: 'absolute', left: 46, top: 5, width: 20, height: 24, borderRadius: '3px 8px 8px 3px', background: '#2A2724'}} />
	</div>
);

/**
 * Laptop 3D in CSS (prospettiva reale): coperchio con schermo, base inclinata con tastiera,
 * porta Ethernet sul bordo destro della base e cavo appoggiato sul piano della scrivania.
 * Lo schermo accetta qualsiasi contenuto React (chat, interfacce, ecc.).
 */
export const LaptopNear: React.FC<LaptopProps> = ({
	x,
	y,
	scale = 1,
	rotX = 14,
	rotY = -14,
	opacity = 1,
	screenGlow = 1,
	plugOut = 0,
	spark = 0,
	linkLed = 1,
	children,
}) => {
	const L = LAPTOP;
	const g = screenGlow;
	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width: 0,
				height: 0,
				perspective: 2400,
				perspectiveOrigin: '50% 30%',
				opacity,
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					transformStyle: 'preserve-3d',
					transform: `scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
				}}
			>
				{/* alone dello schermo sulla scena */}
				<div
					style={{
						position: 'absolute',
						left: -L.lidW,
						top: -L.lidH * 0.9,
						width: L.lidW * 2,
						height: L.lidH * 1.8,
						borderRadius: '50%',
						background: `radial-gradient(closest-side, ${alpha(COLORS.orange, 0.2 * g)} 0%, ${alpha(COLORS.orangeDeep, 0.07 * g)} 50%, ${alpha(COLORS.orangeDeep, 0)} 100%)`,
						// FIX: nessun translateZ(-40px) (vedi sopra)
					}}
				/>

				{/* BASE (piano della scrivania), incernierata al bordo inferiore del coperchio */}
				<div
					style={{
						position: 'absolute',
						left: -L.baseW / 2,
						top: L.lidH / 2 - 6,
						width: L.baseW,
						height: L.baseD,
						transformOrigin: '50% 0%',
						transform: `rotateX(${L.baseTilt}deg)`,
						transformStyle: 'preserve-3d',
					}}
				>
					{/* ombra sulla scrivania */}
					<div
						style={{
							position: 'absolute',
							left: -120,
							top: -40,
							width: L.baseW + 240,
							height: L.baseD + 160,
							borderRadius: '50%',
							background: 'radial-gradient(closest-side, rgba(0,0,0,0.55), rgba(0,0,0,0))',
							transform: 'translateZ(-3px)',
						}}
					/>
					{/* scocca */}
					<div
						style={{
							position: 'absolute',
							inset: 0,
							borderRadius: 26,
							background: `linear-gradient(180deg, #3A3430 0%, #2A2522 45%, #1E1B19 100%)`,
							boxShadow: `inset 0 0 0 2px rgba(250,249,245,0.12), inset 0 -3px 0 ${alpha(COLORS.orangeBright, 0.35 * g)}, inset 0 40px 80px ${alpha(COLORS.orange, 0.1 * g)}, 0 0 ${60 * g}px ${alpha(COLORS.orange, 0.12 * g)}`,
						}}
					/>
					{/* tastiera */}
					<div
						style={{
							position: 'absolute',
							left: 70,
							top: 46,
							width: L.baseW - 140,
							height: 250,
							borderRadius: 10,
							background:
								'repeating-linear-gradient(90deg, rgba(10,9,8,0.0) 0px, rgba(10,9,8,0.0) 46px, rgba(250,249,245,0.05) 46px, rgba(250,249,245,0.05) 50px),' +
								'repeating-linear-gradient(0deg, rgba(10,9,8,0.0) 0px, rgba(10,9,8,0.0) 46px, rgba(250,249,245,0.05) 46px, rgba(250,249,245,0.05) 50px),' +
								'linear-gradient(180deg, #0F0E0D, #0C0B0A)',
							boxShadow: `inset 0 0 0 1px rgba(250,249,245,0.06), 0 0 ${30 * g}px ${alpha(COLORS.orange, 0.06 * g)}`,
						}}
					/>
					{/* trackpad */}
					<div
						style={{
							position: 'absolute',
							left: L.baseW / 2 - 140,
							top: 330,
							width: 280,
							height: 170,
							borderRadius: 14,
							background: 'linear-gradient(180deg, #23201D, #1B1917)',
							boxShadow: 'inset 0 0 0 1px rgba(250,249,245,0.07)',
						}}
					/>
					{/* porta Ethernet sul bordo destro + LED */}
					<div style={{position: 'absolute', left: L.baseW - 10, top: 150, width: 16, height: 44, borderRadius: 3, background: '#050505', boxShadow: `inset 0 0 0 2px rgba(250,249,245,0.25), 0 0 10px ${alpha(COLORS.orange, 0.3 * g)}`}} />
					<div
						style={{
							position: 'absolute',
							left: L.baseW - 34,
							top: 206,
							width: 10,
							height: 10,
							borderRadius: 5,
							background: linkLed > 0.5 ? COLORS.orangeBright : '#2A2724',
							boxShadow: linkLed > 0.5 ? `0 0 14px ${COLORS.orange}` : 'none',
							opacity: 0.3 + 0.7 * linkLed,
						}}
					/>
					{/* cavo + connettore sul piano della scrivania */}
					{plugOut !== null ? (
						<div style={{position: 'absolute', left: L.baseW - 6 + plugOut, top: 172}}>
							<Rj45 />
							<div
								style={{
									position: 'absolute',
									left: 62,
									top: -10,
									width: 900,
									height: 20,
									borderRadius: 10,
									background: `linear-gradient(180deg, #6A615B 0%, #3A3532 30%, #24211F 70%, ${alpha(COLORS.orange, 0.35)} 100%)`,
									boxShadow: '0 6px 12px rgba(0,0,0,0.5)',
								}}
							/>
						</div>
					) : null}
					{/* scintilla alla porta */}
					{spark > 0.01 ? (
						<div
							style={{
								position: 'absolute',
								left: L.baseW - 60,
								top: 120,
								width: 120,
								height: 104,
								borderRadius: '50%',
								background: `radial-gradient(closest-side, ${alpha(COLORS.white, 0.95 * spark)} 0%, ${alpha(COLORS.orangeHot, 0.7 * spark)} 22%, ${alpha(COLORS.orange, 0.25 * spark)} 55%, ${alpha(COLORS.orange, 0)} 100%)`,
								transform: `scale(${0.6 + 0.8 * spark})`,
							}}
						/>
					) : null}
				</div>

				{/* COPERCHIO */}
				<div
					style={{
						position: 'absolute',
						left: -L.lidW / 2,
						top: -L.lidH / 2,
						width: L.lidW,
						height: L.lidH,
						borderRadius: 26,
						background: 'linear-gradient(180deg, #2B2724, #1A1816)',
						boxShadow: `inset 0 0 0 2px rgba(250,249,245,0.14), inset 0 2px 0 rgba(255,255,255,0.12), 0 30px 90px rgba(0,0,0,0.6), 0 0 ${110 * g}px ${alpha(COLORS.orange, 0.2 * g)}, 0 0 ${24 * g}px ${alpha(COLORS.orange, 0.25 * g)}`,
					}}
				>
					{/* schermo */}
					<div
						style={{
							position: 'absolute',
							left: L.bezel,
							top: L.bezel,
							width: L.screenW,
							height: L.screenH,
							borderRadius: 10,
							overflow: 'hidden',
							background: `radial-gradient(120% 90% at 50% 0%, #1A1715 0%, #0D0C0B 60%, #090807 100%)`,
							fontFamily: FONTS.body,
						}}
					>
						{children}
						{/* riflesso del vetro */}
						<div style={{position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.0) 38%)', pointerEvents: 'none'}} />
					</div>
					{/* webcam */}
					<div style={{position: 'absolute', left: L.lidW / 2 - 4, top: 7, width: 8, height: 8, borderRadius: 4, background: '#0A0908', boxShadow: 'inset 0 0 0 1px rgba(250,249,245,0.12)'}} />
				</div>
			</div>
		</div>
	);
};

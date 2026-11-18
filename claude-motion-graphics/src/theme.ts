/** Direzione artistica: nero profondo, arancione Claude, bianco caldo e grigi. */
export const COLORS = {
	black: '#050505',
	bg: '#0A0908',
	bgSoft: '#12100F',
	surface: '#171513',
	surface2: '#211E1B',
	line: 'rgba(250,249,245,0.09)',
	lineStrong: 'rgba(250,249,245,0.18)',

	orange: '#D97757', // arancione Claude (colore ufficiale del simbolo)
	orangeBright: '#F0936F', // highlight
	orangeHot: '#FFC3A0', // nucleo dei glow
	orangeDeep: '#A8502F', // ombre / profondità

	white: '#FAF9F5',
	gray: '#B0AEA5',
	grayDim: '#6E6B65',
	grayDark: '#3A3835',
} as const;

export const FONTS = {
	display: "'Space Grotesk', 'Inter Display', 'Inter', system-ui, sans-serif",
	body: "'Inter', system-ui, sans-serif",
	mono: "'JetBrains Mono', 'DejaVu Sans Mono', monospace",
} as const;

/** rgba() da hex + alpha. */
export const alpha = (hex: string, a: number): string => {
	const h = hex.replace('#', '');
	const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** text-shadow a più strati per un glow morbido e cinematografico. */
export const textGlow = (color: string = COLORS.orange, strength = 1): string =>
	[
		`0 0 ${12 * strength}px ${alpha(color, 0.55)}`,
		`0 0 ${36 * strength}px ${alpha(color, 0.35)}`,
		`0 0 ${90 * strength}px ${alpha(color, 0.22)}`,
	].join(', ');

/** box-shadow glow. */
export const boxGlow = (color: string = COLORS.orange, strength = 1): string =>
	[
		`0 0 ${18 * strength}px ${alpha(color, 0.5)}`,
		`0 0 ${60 * strength}px ${alpha(color, 0.28)}`,
		`0 0 ${140 * strength}px ${alpha(color, 0.16)}`,
	].join(', ');

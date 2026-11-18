/**
 * VIDEO 04 — palette "cybersecurity cinematografica": nero, rosso (pericolo), verde (sicurezza), bianco e grigi.
 * Stessi font del resto della serie (Space Grotesk, Inter, JetBrains Mono): vedi src/theme.ts → FONTS.
 */
export const C4 = {
	black: '#040506',
	bg: '#07090A',
	surface: '#101315',
	surface2: '#171B1E',
	line: 'rgba(235,242,238,0.10)',
	lineStrong: 'rgba(235,242,238,0.20)',

	red: '#F0353B', // pericolo, truffa, allarme
	redBright: '#FF5C61',
	redHot: '#FFB3B5',
	redDeep: '#7A1418',

	green: '#22D47A', // sicurezza, difesa, scudo
	greenBright: '#5CF2A6',
	greenHot: '#C9FFE2',
	greenDeep: '#0E6B3C',

	white: '#F2F6F4',
	gray: '#9AA5A0',
	grayDim: '#5E6763',
	grayDark: '#323936',
} as const;

/** rgba() da hex + alpha. */
export const a4 = (hex: string, a: number): string => {
	const n = parseInt(hex.replace('#', ''), 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Glow per testo e box nel colore dato. */
export const glow4 = (color: string, k = 1): string =>
	[`0 0 ${12 * k}px ${a4(color, 0.55)}`, `0 0 ${34 * k}px ${a4(color, 0.32)}`, `0 0 ${80 * k}px ${a4(color, 0.18)}`].join(', ');
export const boxGlow4 = (color: string, k = 1): string =>
	[`0 0 ${16 * k}px ${a4(color, 0.45)}`, `0 0 ${54 * k}px ${a4(color, 0.25)}`, `0 0 ${120 * k}px ${a4(color, 0.14)}`].join(', ');

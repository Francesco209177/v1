/** Interpolazione tra due colori esadecimali (solo palette del tema) -> stringa rgb(). */
const cache = new Map<string, [number, number, number]>();

const parse = (hex: string): [number, number, number] => {
	const hit = cache.get(hex);
	if (hit) return hit;
	const n = parseInt(hex.replace('#', ''), 16);
	const v: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	cache.set(hex, v);
	return v;
};

export const mixHex = (a: string, b: string, t: number): string => {
	const k = Math.min(1, Math.max(0, t));
	if (k <= 0) return a;
	if (k >= 1) return b;
	const [r1, g1, b1] = parse(a);
	const [r2, g2, b2] = parse(b);
	return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
};

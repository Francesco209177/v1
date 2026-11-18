/** Miscela di colori hex per il canvas (i token si "scaldano" verso l'arancio chiaro mentre vengono assorbiti). */
const cache = new Map<string, [number, number, number]>();

const rgb = (hex: string): [number, number, number] => {
	const hit = cache.get(hex);
	if (hit) return hit;
	const n = parseInt(hex.replace('#', ''), 16);
	const v: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	cache.set(hex, v);
	return v;
};

/** Interpola fra due hex (#RRGGBB) e restituisce una stringa rgba(). */
export const mix = (a: string, b: string, t: number, alpha = 1): string => {
	const p = rgb(a);
	const q = rgb(b);
	const k = Math.min(1, Math.max(0, t));
	const c = (i: 0 | 1 | 2) => Math.round(p[i] + (q[i] - p[i]) * k);
	return `rgba(${c(0)},${c(1)},${c(2)},${Math.min(1, Math.max(0, alpha))})`;
};

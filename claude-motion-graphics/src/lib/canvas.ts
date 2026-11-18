/** Utility Canvas 2D per particelle e glow (sprite pre-renderizzati: niente shadowBlur per-particella). */
const spriteCache = new Map<string, HTMLCanvasElement>();

/** Sprite radiale morbido (nucleo chiaro + alone colorato). Disegnalo con ctx.globalCompositeOperation='lighter'. */
export const glowSprite = (color: string, core = '#FFFFFF', size = 128): HTMLCanvasElement => {
	const key = `${color}|${core}|${size}`;
	const cached = spriteCache.get(key);
	if (cached) return cached;
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const g = c.getContext('2d')!;
	const r = size / 2;
	const grad = g.createRadialGradient(r, r, 0, r, r, r);
	grad.addColorStop(0, core);
	grad.addColorStop(0.12, color);
	grad.addColorStop(0.4, withAlpha(color, 0.35));
	grad.addColorStop(1, withAlpha(color, 0));
	g.fillStyle = grad;
	g.fillRect(0, 0, size, size);
	spriteCache.set(key, c);
	return c;
};

/** Disegna un punto luminoso di raggio visivo `radius` (px) con alpha. */
export const drawGlow = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
	color: string,
	a = 1,
	core = '#FFFFFF',
): void => {
	if (a <= 0.002 || radius <= 0.05) return;
	const s = glowSprite(color, core);
	const d = radius * 6; // lo sprite include l'alone: il nucleo è ~1/6 del lato
	ctx.globalAlpha = Math.min(1, a);
	ctx.drawImage(s, x - d / 2, y - d / 2, d, d);
	ctx.globalAlpha = 1;
};

export const withAlpha = (hex: string, a: number): string => {
	const h = hex.replace('#', '');
	const n = parseInt(h, 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

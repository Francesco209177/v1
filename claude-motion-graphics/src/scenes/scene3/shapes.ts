import {lerp, TAU, Vec2} from '../../lib/math';

/** Forme unitarie campionate con lo stesso numero di punti => morph per interpolazione lineare. */
export const SHAPE_SAMPLES = 60;
export type ShapeKind = 0 | 1 | 2 | 3; // cerchio · triangolo · quadrato · esagono

/** Campiona `n` punti equidistanti (in lunghezza d'arco) lungo un poligono chiuso. */
const samplePolygon = (verts: Vec2[], n: number): Vec2[] => {
	const segs = verts.map((a, i) => {
		const b = verts[(i + 1) % verts.length];
		return {a, b, len: Math.hypot(b.x - a.x, b.y - a.y)};
	});
	const total = segs.reduce((s, x) => s + x.len, 0);
	const out: Vec2[] = [];
	let si = 0;
	let acc = 0;
	for (let i = 0; i < n; i++) {
		const d = (i / n) * total;
		while (si < segs.length - 1 && d > acc + segs[si].len) {
			acc += segs[si].len;
			si++;
		}
		const t = segs[si].len === 0 ? 0 : (d - acc) / segs[si].len;
		out.push({x: lerp(segs[si].a.x, segs[si].b.x, t), y: lerp(segs[si].a.y, segs[si].b.y, t)});
	}
	return out;
};

const regular = (sides: number, r: number): Vec2[] =>
	Array.from({length: sides}, (_, i) => {
		const a = -Math.PI / 2 + (i / sides) * TAU;
		return {x: Math.cos(a) * r, y: Math.sin(a) * r};
	});

const h = 0.86;
const UNIT: Vec2[][] = [
	regular(SHAPE_SAMPLES, 1), // cerchio
	samplePolygon(regular(3, 1.24).map((p) => ({x: p.x, y: p.y + 0.16})), SHAPE_SAMPLES),
	// il quadrato parte dal centro del lato alto: stessa "fase" degli altri (primo punto in alto)
	samplePolygon([{x: 0, y: -h}, {x: h, y: -h}, {x: h, y: h}, {x: -h, y: h}, {x: -h, y: -h}], SHAPE_SAMPLES),
	samplePolygon(regular(6, 1.06), SHAPE_SAMPLES),
];

/** Path SVG del morph tra due forme (m può uscire da 0..1 per l'overshoot), raggio in px. */
export const morphPath = (from: number, to: number, m: number, radius: number): string => {
	const a = UNIT[((from % 4) + 4) % 4];
	const b = UNIT[((to % 4) + 4) % 4];
	let d = '';
	for (let i = 0; i < SHAPE_SAMPLES; i++) {
		const x = lerp(a[i].x, b[i].x, m) * radius;
		const y = lerp(a[i].y, b[i].y, m) * radius;
		d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
	}
	return d + 'Z';
};

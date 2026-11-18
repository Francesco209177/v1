/**
 * Controllo automatico dei match-cut: confronta l'ultimo frame di ogni scena con il primo della successiva
 * nel video finale (differenza media per pixel, intera immagine e zona dello spark).
 *   node scripts/check-cuts.mjs [--file claude_motion_graphics.mp4]
 */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {arg, ROOT} from './common.mjs';

const file = path.resolve(ROOT, String(arg('file', 'claude_motion_graphics.mp4')));
const CUTS = [
	{at: 120, spark: {x: 540, y: 700, size: 360}},
	{at: 270, spark: {x: 540, y: 350, size: 180}},
	{at: 480, spark: {x: 540, y: 800, size: 260}},
	{at: 720, spark: {x: 540, y: 330, size: 120}},
];

const grab = (frame, crop) => {
	const vf = `select=eq(n\\,${frame})${crop ? `,crop=${crop}` : ''},format=gray`;
	return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', vf, '-fps_mode', 'vfr', '-frames:v', '1', '-f', 'rawvideo', '-']);
};
const diff = (a, b) => {
	let s = 0;
	for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
	return s / a.length;
};
for (const c of CUTS) {
	const half = Math.round(c.spark.size * 0.75);
	const crop = `${half * 2}:${half * 2}:${c.spark.x - half}:${c.spark.y - half}`;
	const full = diff(grab(c.at - 1), grab(c.at));
	const sp = diff(grab(c.at - 1, crop), grab(c.at, crop));
	const ref = diff(grab(c.at - 2, crop), grab(c.at - 1, crop));
	console.log(`taglio ${c.at}: diff intera=${full.toFixed(2)}  diff spark=${sp.toFixed(2)}  (riferimento ${c.at - 2}->${c.at - 1}: ${ref.toFixed(2)})`);
}

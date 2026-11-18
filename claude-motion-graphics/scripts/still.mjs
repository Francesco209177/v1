/**
 * Still e contact sheet per il controllo visivo.
 *   node scripts/still.mjs <CompId> <frames> [--scale 0.5] [--out out/stills/<nome>] [--sheet] [--cols 6]
 *   es.  node scripts/still.mjs Scene2 0-149:10 --scale 0.5 --sheet
 * CompId: Main | Kit | Scene1..Scene5 | Shot1..Shot5 (nelle scene/shot isolati i frame sono relativi).
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {arg, browserExecutable, chromiumOptions, makeBundle, parseFrames, ROOT} from './common.mjs';

const [compId, frameSpec] = process.argv.slice(2);
if (!compId || !frameSpec) {
	console.error('Uso: node scripts/still.mjs <CompId> <frames> [--scale 0.5] [--out dir] [--sheet] [--cols 6]');
	process.exit(1);
}
const frames = parseFrames(frameSpec);
const scale = Number(arg('scale', 1));
const outDir = path.resolve(ROOT, String(arg('out', path.join('out', 'stills', compId))));
const sheet = arg('sheet', false);
const cols = Number(arg('cols', Math.min(6, frames.length)));
fs.mkdirSync(outDir, {recursive: true});

const {serveUrl, cleanup} = await makeBundle(compId);
const browser = await openBrowser('chrome', {browserExecutable, chromiumOptions});
try {
	const composition = await selectComposition({serveUrl, id: compId, puppeteerInstance: browser, browserExecutable, chromiumOptions});
	const files = [];
	for (const frame of frames) {
		if (frame >= composition.durationInFrames) continue;
		const output = path.join(outDir, `f${String(frame).padStart(4, '0')}.png`);
		await renderStill({composition, serveUrl, output, frame, scale, puppeteerInstance: browser, browserExecutable, chromiumOptions, imageFormat: 'png', overwrite: true});
		files.push(output);
		console.log(output);
	}
	if (sheet && files.length > 1) {
		const sheetPath = path.join(outDir, 'sheet.png');
		const tileW = Math.round(1080 * scale) > 400 ? 360 : Math.round(1080 * scale);
		execFileSync('montage', [
			...files.flatMap((f) => ['-label', path.basename(f, '.png'), f]),
			'-tile', `${cols}x`, '-geometry', `${tileW}x+6+6`, '-background', '#1a1a1a', '-fill', '#ffffff', '-pointsize', '20', sheetPath,
		]);
		console.log('SHEET', sheetPath);
	}
} finally {
	await browser.close({silent: true});
	cleanup();
}

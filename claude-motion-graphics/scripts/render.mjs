/**
 * Render finale: Remotion (H.264, 1080x1920, 30 fps) + mux della colonna sonora con FFmpeg.
 *   node scripts/render.mjs [--frames 0-899] [--concurrency 4] [--crf 15] [--out claude_motion_graphics.mp4]
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {arg, browserExecutable, chromiumOptions, makeBundle, ROOT} from './common.mjs';

const outFile = path.resolve(ROOT, String(arg('out', 'claude_motion_graphics.mp4')));
const concurrency = Number(arg('concurrency', 4));
const crf = Number(arg('crf', 15));
const frameArg = arg('frames', null);
const frameRange = frameArg ? String(frameArg).split('-').map(Number) : null;
const silent = path.join(ROOT, 'out', 'video_silent.mp4');
fs.mkdirSync(path.dirname(silent), {recursive: true});

const t0 = Date.now();
const {serveUrl, cleanup} = await makeBundle();
try {
	const composition = await selectComposition({serveUrl, id: 'Main', browserExecutable, chromiumOptions});
	let last = -1;
	await renderMedia({
		composition,
		serveUrl,
		codec: 'h264',
		outputLocation: silent,
		imageFormat: 'png',
		pixelFormat: 'yuv420p',
		colorSpace: 'bt709',
		crf,
		x264Preset: 'slow',
		muted: true,
		concurrency,
		frameRange,
		browserExecutable,
		chromiumOptions,
		overwrite: true,
		onProgress: ({renderedFrames, encodedFrames}) => {
			const pct = Math.floor((renderedFrames / (frameRange ? frameRange[1] - frameRange[0] + 1 : composition.durationInFrames)) * 10);
			if (pct !== last) {
				last = pct;
				console.log(`render ${renderedFrames} frame · encode ${encodedFrames}`);
			}
		},
	});
} finally {
	cleanup();
}

const fps = 30;
const start = frameRange ? frameRange[0] / fps : 0;
const dur = frameRange ? (frameRange[1] - frameRange[0] + 1) / fps : 30;
execFileSync(
	'ffmpeg',
	[
		'-hide_banner', '-loglevel', 'error', '-y',
		'-i', silent,
		'-ss', String(start), '-t', String(dur), '-i', path.join(ROOT, 'public', 'music.wav'),
		'-map', '0:v:0', '-map', '1:a:0',
		'-c:v', 'copy',
		'-af', 'volume=-0.3dB', // margine per l'overshoot della codifica AAC
		'-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
		'-t', String(dur),
		'-movflags', '+faststart',
		outFile,
	],
	{stdio: 'inherit'},
);
console.log(`OK ${outFile} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

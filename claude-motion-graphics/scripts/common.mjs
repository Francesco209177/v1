import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENTRY = path.join(ROOT, 'src', 'index.ts');

// Chromium preinstallato nel container cloud; altrove si lascia scegliere a Remotion.
const LOCAL_CHROME =
	'/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
export const browserExecutable = fs.existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined;
export const chromiumOptions = {gl: 'swangle'};

/** Bundle webpack in una cartella temporanea univoca (sicuro con più processi in parallelo). */
export const makeBundle = async (compId) => {
	// Entry dedicato per scena/shot (src/entries/<CompId>.tsx): bundle indipendente dalle altre scene.
	const own = compId ? path.join(ROOT, 'src', 'entries', `${compId}.tsx`) : null;
	const entryPoint = own && fs.existsSync(own) ? own : ENTRY;
	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmg-bundle-'));
	const serveUrl = await bundle({
		entryPoint,
		outDir,
		enableCaching: false,
		publicDir: path.join(ROOT, 'public'),
	});
	return {serveUrl, cleanup: () => fs.rmSync(outDir, {recursive: true, force: true})};
};

/** "0,30,60" | "0-120:10" | "45" | combinazioni separate da virgola. */
export const parseFrames = (spec) => {
	const out = [];
	for (const part of String(spec).split(',')) {
		const m = part.trim().match(/^(\d+)(?:-(\d+))?(?::(\d+))?$/);
		if (!m) throw new Error(`Frame spec non valida: ${part}`);
		const a = Number(m[1]);
		const b = m[2] === undefined ? a : Number(m[2]);
		const step = m[3] === undefined ? 1 : Number(m[3]);
		for (let f = a; f <= b; f += step) out.push(f);
	}
	return out;
};

export const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	if (i === -1) return fallback;
	const v = process.argv[i + 1];
	return v === undefined || v.startsWith('--') ? true : v;
};

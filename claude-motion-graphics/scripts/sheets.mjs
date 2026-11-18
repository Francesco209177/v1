/**
 * Contact sheet dai frame del video FINALE (via FFmpeg, veloce): utile per la revisione di tagli e sync.
 *   node scripts/sheets.mjs --from 112 --to 128 [--step 1] [--cols 6] [--width 360] [--file claude_motion_graphics.mp4] [--out out/review/cut120.png]
 * Ogni riquadro riporta il numero di frame assoluto.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {arg, ROOT} from './common.mjs';

const file = path.resolve(ROOT, String(arg('file', 'claude_motion_graphics.mp4')));
const from = Number(arg('from', 0));
const to = Number(arg('to', 899));
const step = Number(arg('step', 1));
const width = Number(arg('width', 360));
const count = Math.floor((to - from) / step) + 1;
const cols = Number(arg('cols', Math.min(6, count)));
const rows = Math.ceil(count / cols);
const out = path.resolve(ROOT, String(arg('out', path.join('out', 'review', `sheet_${from}_${to}_${step}.png`))));
fs.mkdirSync(path.dirname(out), {recursive: true});
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const label = fs.existsSync(font)
	? `drawtext=fontfile=${font}:text='%{n}':x=24:y=24:fontsize=64:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=12,`
	: '';
const vf = `${label}select='between(n\\,${from}\\,${to})*not(mod(n-${from}\\,${step}))',scale=${width}:-1,tile=${cols}x${rows}:padding=6:margin=6:color=0x1a1a1a`;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vf', vf, '-fps_mode', 'vfr', '-frames:v', '1', out], {stdio: 'inherit'});
console.log(out);

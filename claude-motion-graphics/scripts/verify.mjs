/** Verifica tecnica del file finale: durata, risoluzione, fps, codec, audio. */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {arg, ROOT} from './common.mjs';

const file = path.resolve(ROOT, String(arg('file', 'claude_motion_graphics.mp4')));
const probe = JSON.parse(
	execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_format', '-show_streams', '-of', 'json', file]).toString(),
);
const v = probe.streams.find((s) => s.codec_type === 'video');
const a = probe.streams.find((s) => s.codec_type === 'audio');
const checks = [
	['codec video H.264', v?.codec_name === 'h264', v?.codec_name],
	['risoluzione 1080x1920', v?.width === 1080 && v?.height === 1920, `${v?.width}x${v?.height}`],
	['frame rate 30 fps', v?.r_frame_rate === '30/1' && v?.avg_frame_rate === '30/1', `${v?.r_frame_rate} (avg ${v?.avg_frame_rate})`],
	['900 frame', Number(v?.nb_read_frames) === 900, v?.nb_read_frames],
	['durata video 30.000 s', Math.abs(Number(v?.duration) - 30) < 0.0005, v?.duration],
	['durata contenitore 30 s', Math.abs(Number(probe.format.duration) - 30) < 0.012, probe.format.duration],
	['pixel format yuv420p', v?.pix_fmt === 'yuv420p', v?.pix_fmt],
	['audio AAC stereo 48 kHz', a?.codec_name === 'aac' && Number(a?.channels) === 2 && a?.sample_rate === '48000', `${a?.codec_name} ${a?.channels}ch ${a?.sample_rate}`],
	['durata audio ~30 s', a ? Math.abs(Number(a.duration) - 30) < 0.03 : false, a?.duration],
	['contenitore MP4', /mp4/.test(probe.format.format_name), probe.format.format_name],
];
let ok = true;
for (const [name, pass, value] of checks) {
	ok &&= pass;
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  →  ${value}`);
}
console.log(`dimensione: ${(Number(probe.format.size) / 1e6).toFixed(2)} MB · bitrate: ${(Number(probe.format.bit_rate) / 1e6).toFixed(2)} Mb/s`);
process.exit(ok ? 0 : 1);

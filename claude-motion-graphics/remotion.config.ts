import fs from 'node:fs';
import {Config} from '@remotion/cli/config';

// Chromium preinstallato nel container cloud; altrove Remotion usa il proprio browser.
const LOCAL_CHROME =
	'/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
if (fs.existsSync(LOCAL_CHROME)) {
	Config.setBrowserExecutable(LOCAL_CHROME);
}

Config.setVideoImageFormat('png');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(15);
Config.setChromiumOpenGlRenderer('swangle');
Config.setOverwriteOutput(true);

import {continueRender, delayRender} from 'remotion';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';

const FACES = [
	"400 40px 'Space Grotesk'",
	"500 40px 'Space Grotesk'",
	"600 40px 'Space Grotesk'",
	"700 40px 'Space Grotesk'",
	"400 40px 'Inter'",
	"500 40px 'Inter'",
	"600 40px 'Inter'",
	"400 40px 'JetBrains Mono'",
	"500 40px 'JetBrains Mono'",
	"700 40px 'JetBrains Mono'",
];

let started = false;
/** Blocca il render finché tutti i font (bundle locale, nessuna rete) non sono pronti. */
export const loadFonts = (): void => {
	if (started || typeof document === 'undefined') return;
	started = true;
	const handle = delayRender('Caricamento font');
	Promise.all(FACES.map((f) => document.fonts.load(f, 'AaÀàèé0123 {}<>/=')))
		.then(() => document.fonts.ready)
		.then(() => continueRender(handle))
		.catch(() => continueRender(handle));
};

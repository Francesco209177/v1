import {COLORS} from '../theme';

/** Il codice che Claude "scrive" nel reel: una mini-composition di motion graphics. */
export type TokenType = 'kw' | 'fn' | 'tag' | 'attr' | 'str' | 'num' | 'punct' | 'plain';
export type Token = [TokenType, string];

export const TOKEN_COLORS: Record<TokenType, string> = {
	kw: COLORS.orange,
	fn: COLORS.white,
	tag: COLORS.orangeBright,
	attr: COLORS.gray,
	str: '#EBCDB4',
	num: COLORS.orangeHot,
	punct: COLORS.grayDim,
	plain: COLORS.white,
};

const k = (s: string): Token => ['kw', s];
const f = (s: string): Token => ['fn', s];
const t = (s: string): Token => ['tag', s];
const a = (s: string): Token => ['attr', s];
const s = (v: string): Token => ['str', v];
const n = (v: string): Token => ['num', v];
const p = (v: string): Token => ['punct', v];
const w = (v: string): Token => ['plain', v];

export const CODE_LINES: Token[][] = [
	[k('export const '), f('Reel'), p(' = () => {')],
	[w('  '), k('const '), w('frame'), p(' = '), f('useCurrentFrame'), p('();')],
	[w('  '), k('const '), w('scala'), p(' = '), f('spring'), p('({ '), w('frame'), p(', '), w('fps'), p(' });')],
	[],
	[w('  '), k('return'), p(' (')],
	[w('    '), p('<'), t('Scena'), a(' durata'), p('={'), n('30'), p('}'), a(' fps'), p('={'), n('30'), p('}>')],
	[w('      '), p('<'), t('Particelle'), a(' colore'), p('='), s('"#D97757"'), p(' />')],
	[w('      '), p('<'), t('Forma'), a(' tipo'), p('='), s('"cerchio"'), a(' scala'), p('={'), w('scala'), p('} />')],
	[w('      '), p('<'), t('Testo'), a(' animato'), p('>'), w('Ciao!'), p('</'), t('Testo'), p('>')],
	[w('      '), p('<'), t('Transizione'), a(' tipo'), p('='), s('"glow"'), p(' />')],
	[w('    '), p('</'), t('Scena'), p('>')],
	[w('  '), p(');')],
	[p('};')],
];

/** Prompt che l'utente digita nella scena 2. */
export const PROMPT_TEXT = 'Crea un reel di 30 secondi sulla motion graphics';

/** Metriche fisse del blocco codice (JetBrains Mono: avanzamento = 0.6 em esatti). */
export const CODE_METRICS = {
	fontSize: 28,
	lineHeight: 42,
	charWidth: 28 * 0.6,
	gutterChars: 4, // numeri di riga: 2 cifre + 2 spazi
	titleBar: 64,
	padX: 34,
	padY: 30,
} as const;

export type PlacedToken = {line: number; col: number; x: number; y: number; w: number; text: string; type: TokenType; color: string; index: number};

/**
 * Posizione di ogni token RELATIVA all'angolo alto-sinistra della FINESTRA (TerminalWindow rect),
 * con y = baseline-top della riga. Serve a "staccare" i token dal codice e animarli (scena 3).
 */
export const placeTokens = (lines: Token[][] = CODE_LINES): PlacedToken[] => {
	const m = CODE_METRICS;
	const out: PlacedToken[] = [];
	let index = 0;
	lines.forEach((line, li) => {
		let col = 0;
		for (const [type, text] of line) {
			const lead = text.length - text.trimStart().length;
			const body = text.trim();
			if (body.length > 0) {
				out.push({
					line: li,
					col: col + lead,
					x: m.padX + (m.gutterChars + col + lead) * m.charWidth,
					y: m.titleBar + m.padY + li * m.lineHeight,
					w: body.length * m.charWidth,
					text: body,
					type,
					color: TOKEN_COLORS[type],
					index: index++,
				});
			}
			col += text.length;
		}
	});
	return out;
};

export const CODE_CHAR_COUNT = CODE_LINES.reduce((sum, l) => sum + l.reduce((c, [, tx]) => c + tx.length, 0), 0);

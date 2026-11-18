import {tokenWidth} from '../../components/TokenChip';
import {V1_CUES, V1_SCENES, V1_TOKEN_IDS, V1_TOKENS} from '../../timeline';

/** Frame ASSOLUTI chiave della scena TOKENS. */
export const T = {
	start: V1_SCENES.tokens.start, // 90
	settle: 118, // la domanda si è ricomposta
	scan: 165, // il "tokenizer" scorre la frase
	split: V1_CUES.split, // 180
	ids: 187, // gli ID iniziano a scorrere
	intoNet: V1_CUES.intoNet, // 225
	end: V1_SCENES.tokens.end - 1, // 269
} as const;

/** Dimensione dei token (JetBrains Mono: avanzamento 0,6 em). */
export const SIZE = 56;
export const CW = SIZE * 0.6;
export const GAP = 18;

/** Tre righe con a-capo naturali: "Come fa ChatGPT" / "a sapere" / "tutte queste cose?". */
export const ROWS: number[][] = [
	[0, 1, 2, 3],
	[4, 5, 6],
	[7, 8, 9, 10],
];
/** Righe a frase intera (compatte) e a token separati (spazio per gli ID). */
export const ROW_YP = [612, 722, 832];
export const ROW_Y = [548, 722, 896];
export const CENTER = {x: 540, y: 722} as const;

export type TokenSlot = {
	i: number;
	text: string;
	id: number;
	row: number;
	/** Centro del testo quando la frase è intera (token attaccati). */
	px: number;
	/** Centro del blocco quando la frase è spezzata. */
	sx: number;
	/** y della riga: frase intera / token separati. */
	py: number;
	y: number;
	/** Confine sinistro (x) del token nella frase intera: lì nasce la crepa di luce. */
	leftEdge: number;
	first: boolean;
};

export const SLOTS: TokenSlot[] = (() => {
	const out: TokenSlot[] = [];
	ROWS.forEach((row, r) => {
		const texts = row.map((i) => V1_TOKENS[i] as string);
		const lead = texts[0].startsWith(' ') ? 1 : 0; // lo spazio iniziale di riga non conta per la centratura
		const chars = texts.reduce((n, t) => n + t.length, 0);
		const pLeft = CENTER.x - ((chars - lead) * CW) / 2 - lead * CW;
		const widths = texts.map((t) => tokenWidth(t, SIZE));
		const total = widths.reduce((a, b) => a + b, 0) + GAP * (row.length - 1);
		let sLeft = CENTER.x - total / 2;
		let off = 0;
		row.forEach((i, k) => {
			const t = texts[k];
			out[i] = {
				i,
				text: t,
				id: V1_TOKEN_IDS[i],
				row: r,
				px: pLeft + (off + t.length / 2) * CW,
				sx: sLeft + widths[k] / 2,
				py: ROW_YP[r],
				y: ROW_Y[r],
				leftEdge: pLeft + off * CW,
				first: k === 0,
			};
			off += t.length;
			sLeft += widths[k] + GAP;
		});
	});
	return out;
})();

/** Coppie di token che erano una sola parola (sotto-parole). */
export const SUBWORD = new Set([2, 3, 5, 6]);

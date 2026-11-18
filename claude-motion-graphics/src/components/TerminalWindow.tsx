import React from 'react';
import {CODE_LINES, CODE_METRICS, TOKEN_COLORS, Token} from '../lib/code';
import {SPARK_PATH} from '../lib/spark';
import {COLORS, FONTS} from '../theme';
import {WINDOW_RECT} from '../timeline';

type Rect = {x: number; y: number; w: number; h: number};

/**
 * Finestra stilizzata di Claude Code (interfaccia da terminale, look premium scuro).
 * Il contenuto (children) parte sotto la title bar; usa <CodeBlock> per il codice.
 */
export const TerminalWindow: React.FC<{
	rect?: Rect;
	title?: string;
	opacity?: number;
	scale?: number;
	glow?: number;
	style?: React.CSSProperties;
	children?: React.ReactNode;
}> = ({rect = WINDOW_RECT, title = 'Claude Code', opacity = 1, scale = 1, glow = 1, style, children}) => {
	const m = CODE_METRICS;
	return (
		<div
			style={{
				position: 'absolute',
				left: rect.x,
				top: rect.y,
				width: rect.w,
				height: rect.h,
				opacity,
				transform: `scale(${scale})`,
				borderRadius: 30,
				background: 'linear-gradient(180deg, rgba(27,24,22,0.96) 0%, rgba(14,13,12,0.97) 100%)',
				border: `1.5px solid ${COLORS.line}`,
				boxShadow: `0 50px 140px rgba(0,0,0,0.7), 0 0 ${90 * glow}px rgba(217,119,87,${0.16 * glow}), inset 0 1px 0 rgba(255,255,255,0.07)`,
				overflow: 'hidden',
				...style,
			}}
		>
			<div
				style={{
					height: m.titleBar,
					display: 'flex',
					alignItems: 'center',
					padding: '0 26px',
					borderBottom: `1.5px solid ${COLORS.line}`,
					background: 'rgba(255,255,255,0.025)',
				}}
			>
				<div style={{display: 'flex', gap: 10}}>
					{[COLORS.orange, COLORS.grayDark, COLORS.grayDark].map((c, i) => (
						<div key={i} style={{width: 14, height: 14, borderRadius: 7, background: c}} />
					))}
				</div>
				<div
					style={{
						flex: 1,
						display: 'flex',
						justifyContent: 'center',
						alignItems: 'center',
						gap: 12,
						marginRight: 62,
						fontFamily: FONTS.mono,
						fontSize: 23,
						fontWeight: 500,
						color: COLORS.gray,
						letterSpacing: '0.02em',
					}}
				>
					<svg viewBox="0 0 24 24" width={22} height={22}>
						<path d={SPARK_PATH} fill={COLORS.orange} />
					</svg>
					{title}
				</div>
			</div>
			<div style={{position: 'absolute', left: 0, right: 0, top: m.titleBar, bottom: 0}}>{children}</div>
		</div>
	);
};

/**
 * Blocco di codice con syntax highlight a metrica fissa (vedi CODE_METRICS / placeTokens).
 * - chars: quanti caratteri sono già "scritti" (default: tutti). Mostra il cursore se `cursor`.
 * - hideTokens: indici di token (placeTokens().index) da nascondere (es. quando volano via).
 */
export const CodeBlock: React.FC<{
	lines?: Token[][];
	chars?: number;
	cursor?: boolean;
	opacity?: number;
	hideTokens?: Set<number>;
	dimGutter?: boolean;
}> = ({lines = CODE_LINES, chars = Infinity, cursor = false, opacity = 1, hideTokens}) => {
	const m = CODE_METRICS;
	let consumed = 0;
	let tokenIndex = 0;
	let cursorDrawn = false;
	return (
		<div
			style={{
				position: 'absolute',
				left: m.padX,
				top: m.padY,
				fontFamily: FONTS.mono,
				fontSize: m.fontSize,
				lineHeight: `${m.lineHeight}px`,
				fontWeight: 500,
				whiteSpace: 'pre',
				opacity,
				fontVariantLigatures: 'none',
			}}
		>
			{lines.map((line, li) => {
				const lineStart = consumed;
				const visibleLine = chars > lineStart || (chars === lineStart && li === 0);
				const parts = line.map(([type, text], ti) => {
					const start = consumed;
					consumed += text.length;
					const hasBody = text.trim().length > 0;
					const idx = hasBody ? tokenIndex++ : -1;
					const shown = Math.max(0, Math.min(text.length, chars - start));
					const hidden = idx >= 0 && hideTokens?.has(idx);
					return (
						<span key={ti} style={{color: TOKEN_COLORS[type], visibility: hidden ? 'hidden' : 'visible'}}>
							{text.slice(0, shown)}
							<span style={{visibility: 'hidden'}}>{text.slice(shown)}</span>
						</span>
					);
				});
				const lineLen = consumed - lineStart;
				const showCursor = cursor && !cursorDrawn && chars >= lineStart && chars <= consumed && chars < Infinity;
				if (showCursor) cursorDrawn = true;
				return (
					<div key={li} style={{height: m.lineHeight, position: 'relative'}}>
						<span style={{color: COLORS.grayDark, opacity: visibleLine ? 1 : 0}}>{String(li + 1).padStart(2, ' ')}{'  '}</span>
						{parts}
						{showCursor ? (
							<span
								style={{
									position: 'absolute',
									left: (m.gutterChars + Math.min(lineLen, chars - lineStart)) * m.charWidth,
									top: 6,
									width: m.charWidth * 0.62,
									height: m.lineHeight - 12,
									background: COLORS.orange,
									boxShadow: `0 0 18px ${COLORS.orange}`,
								}}
							/>
						) : null}
					</div>
				);
			})}
		</div>
	);
};

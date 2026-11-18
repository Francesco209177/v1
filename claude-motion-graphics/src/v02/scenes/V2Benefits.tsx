import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ControlSeq} from './benefits/Control';
import {IndexLabel} from './benefits/IndexLabel';
import {T, TR} from './benefits/layout';
import {OfflineSeq} from './benefits/Offline';
import {PrivacySeq} from './benefits/Privacy';
import {GroupFx, halfFx, ImplodeFlare, implodeFx, slitClip, SplitFX, whipInFx, whipOutFx, WhipStreaks} from './benefits/Transitions';

const Layer: React.FC<{fx?: GroupFx | React.CSSProperties; children: React.ReactNode}> = ({fx, children}) => (
	<AbsoluteFill style={{transformOrigin: '540px 760px', ...(fx as React.CSSProperties)}}>{children}</AbsoluteFill>
);

/**
 * SCENA 4 · BENEFITS (assoluto 510–719, locale 0–209): tre sequenze rapide con lo stesso impianto
 * (indice · icona animata a y≈650 · parola chiave a y≈1000 · qualificatore a y≈1090).
 *   0   PRIVACY   → lucchetto che scatta sul beat (30), dati che rimbalzano dentro il confine
 *   75  OFFLINE   → archi Wi‑Fi che si spengono (90/95/100), barra sul beat (105), la chat continua a scrivere
 *   150 CONTROLLO → selettore di modelli, clic sul beat (165)
 * Transizioni: frusta orizzontale (66–78), la barra del Wi‑Fi apre una fenditura diagonale (136–156),
 * implosione finale in un punto di luce sul CutFlash globale di 720.
 */
export const V2Benefits: React.FC = () => {
	const f = useCurrentFrame();
	const splitting = f >= TR.split && f < TR.split + TR.splitDur;
	return (
		<AbsoluteFill>
			{/* 01 · PRIVACY */}
			{f < TR.whipOutEnd ? (
				<Layer fx={whipOutFx(f)}>
					<PrivacySeq f={f - T.privacy} />
				</Layer>
			) : null}

			{/* 02 · OFFLINE: entra a frusta, poi viene tagliato in due lungo la diagonale */}
			{f >= TR.whipIn && f < TR.split ? (
				<Layer fx={whipInFx(f)}>
					<OfflineSeq f={f - T.offline} />
				</Layer>
			) : null}
			{splitting ? (
				<>
					<Layer fx={halfFx(f, 1)}>
						<OfflineSeq f={f - T.offline} />
					</Layer>
					<Layer fx={halfFx(f, -1)}>
						<OfflineSeq f={f - T.offline} />
					</Layer>
				</>
			) : null}

			{/* 03 · CONTROLLO: rivelato dentro la fenditura, esce implodendo */}
			{f >= T.control ? (
				<Layer fx={implodeFx(f)}>
					<AbsoluteFill style={{clipPath: slitClip(f)}}>
						<ControlSeq f={f - T.control} />
					</AbsoluteFill>
				</Layer>
			) : null}

			<WhipStreaks f={f} />
			<SplitFX f={f} />
			<ImplodeFlare f={f} />
			<IndexLabel f={f} />
		</AbsoluteFill>
	);
};

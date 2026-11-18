import React, {createContext, useContext} from 'react';
import {useCurrentFrame} from 'remotion';

const AbsFrameContext = createContext<number | null>(null);

/**
 * Fornisce il frame ASSOLUTO della timeline (0..899) a tutto l'albero.
 * Va montato alla radice della composition, FUORI da ogni <Sequence>.
 * `offset` = frame di inizio scena quando la scena è renderizzata in isolamento.
 */
export const AbsFrameProvider: React.FC<{offset?: number; children: React.ReactNode}> = ({offset = 0, children}) => {
	const frame = useCurrentFrame();
	return <AbsFrameContext.Provider value={frame + offset}>{children}</AbsFrameContext.Provider>;
};

/** Frame assoluto della timeline: usalo per tutto ciò che deve essere in sync con la musica. */
export const useAbsFrame = (): number => {
	const v = useContext(AbsFrameContext);
	const local = useCurrentFrame();
	return v ?? local;
};

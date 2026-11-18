import {registerRoot} from 'remotion';
import {isolated4Root} from '../v04/isolated4';
import {V4Finale} from '../v04/scenes/V4Finale';
import {V4_SCENES} from '../v04/timeline';

registerRoot(isolated4Root('V04S5', V4Finale, V4_SCENES.finale.start, V4_SCENES.finale.length, 0.1));

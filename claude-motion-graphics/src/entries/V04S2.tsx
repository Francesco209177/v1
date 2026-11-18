import {registerRoot} from 'remotion';
import {isolated4Root} from '../v04/isolated4';
import {V4Trap} from '../v04/scenes/V4Trap';
import {V4_SCENES} from '../v04/timeline';

registerRoot(isolated4Root('V04S2', V4Trap, V4_SCENES.trap.start, V4_SCENES.trap.length, 0.85));

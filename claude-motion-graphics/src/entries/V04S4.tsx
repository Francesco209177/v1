import {registerRoot} from 'remotion';
import {isolated4Root} from '../v04/isolated4';
import {V4Defend} from '../v04/scenes/V4Defend';
import {V4_SCENES} from '../v04/timeline';

registerRoot(isolated4Root('V04S4', V4Defend, V4_SCENES.defend.start, V4_SCENES.defend.length, 0.1));

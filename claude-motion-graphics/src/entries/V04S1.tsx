import {registerRoot} from 'remotion';
import {isolated4Root} from '../v04/isolated4';
import {V4Hook} from '../v04/scenes/V4Hook';
import {V4_SCENES} from '../v04/timeline';

registerRoot(isolated4Root('V04S1', V4Hook, V4_SCENES.hook.start, V4_SCENES.hook.length, 0.85));

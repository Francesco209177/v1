import {registerRoot} from 'remotion';
import {isolated4Root} from '../v04/isolated4';
import {V4How} from '../v04/scenes/V4How';
import {V4_SCENES} from '../v04/timeline';

registerRoot(isolated4Root('V04S3', V4How, V4_SCENES.how.start, V4_SCENES.how.length, 0.85));

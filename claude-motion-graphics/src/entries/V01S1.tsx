import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {V1Hook} from '../v01/scenes/V1Hook';
import {V1_SCENES} from '../v01/timeline';

registerRoot(isolatedRoot('V01S1', V1Hook, V1_SCENES.hook.start, V1_SCENES.hook.length));

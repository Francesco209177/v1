import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {V2Secret} from '../v02/scenes/V2Secret';
import {V2_SCENES} from '../v02/timeline';

registerRoot(isolatedRoot('V02S2', V2Secret, V2_SCENES.secret.start, V2_SCENES.secret.length));

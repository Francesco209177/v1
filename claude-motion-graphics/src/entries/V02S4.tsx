import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {V2Benefits} from '../v02/scenes/V2Benefits';
import {V2_SCENES} from '../v02/timeline';

registerRoot(isolatedRoot('V02S4', V2Benefits, V2_SCENES.benefits.start, V2_SCENES.benefits.length));

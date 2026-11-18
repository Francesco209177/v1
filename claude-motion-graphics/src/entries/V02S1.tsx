import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {V2Hook} from '../v02/scenes/V2Hook';
import {V2_SCENES} from '../v02/timeline';

registerRoot(isolatedRoot('V02S1', V2Hook, V2_SCENES.hook.start, V2_SCENES.hook.length));

import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Shot2Transitions} from '../scenes/scene4/Shot2Transitions';
import {SHOTS} from '../scenes/scene4/stage';
import {SCENES} from '../timeline';

const shot = SHOTS[1];
registerRoot(isolatedRoot('Shot2', Shot2Transitions, SCENES.result.start + shot.start, shot.len));

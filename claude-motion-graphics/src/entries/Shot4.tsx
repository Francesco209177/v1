import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Shot4Light} from '../scenes/scene4/Shot4Light';
import {SHOTS} from '../scenes/scene4/stage';
import {SCENES} from '../timeline';

const shot = SHOTS[3];
registerRoot(isolatedRoot('Shot4', Shot4Light, SCENES.result.start + shot.start, shot.len));

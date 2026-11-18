import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Shot1Kinetic} from '../scenes/scene4/Shot1Kinetic';
import {SHOTS} from '../scenes/scene4/stage';
import {SCENES} from '../timeline';

const shot = SHOTS[0];
registerRoot(isolatedRoot('Shot1', Shot1Kinetic, SCENES.result.start + shot.start, shot.len));

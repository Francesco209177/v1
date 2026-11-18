import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Shot3ThreeD} from '../scenes/scene4/Shot3ThreeD';
import {SHOTS} from '../scenes/scene4/stage';
import {SCENES} from '../timeline';

const shot = SHOTS[2];
registerRoot(isolatedRoot('Shot3', Shot3ThreeD, SCENES.result.start + shot.start, shot.len));

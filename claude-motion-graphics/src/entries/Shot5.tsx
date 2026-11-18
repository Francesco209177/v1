import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Shot5Complex} from '../scenes/scene4/Shot5Complex';
import {SHOTS} from '../scenes/scene4/stage';
import {SCENES} from '../timeline';

const shot = SHOTS[4];
registerRoot(isolatedRoot('Shot5', Shot5Complex, SCENES.result.start + shot.start, shot.len));

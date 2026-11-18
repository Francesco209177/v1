import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Scene3Creation} from '../scenes/Scene3Creation';
import {SCENES} from '../timeline';

registerRoot(isolatedRoot('Scene3', Scene3Creation, SCENES.creation.start, SCENES.creation.length));

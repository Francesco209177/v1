import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Scene5Outro} from '../scenes/Scene5Outro';
import {SCENES} from '../timeline';

registerRoot(isolatedRoot('Scene5', Scene5Outro, SCENES.outro.start, SCENES.outro.length));

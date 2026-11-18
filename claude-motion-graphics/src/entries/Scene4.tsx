import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Scene4Result} from '../scenes/Scene4Result';
import {SCENES} from '../timeline';

registerRoot(isolatedRoot('Scene4', Scene4Result, SCENES.result.start, SCENES.result.length));

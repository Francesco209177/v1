import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Scene2Idea} from '../scenes/Scene2Idea';
import {SCENES} from '../timeline';

registerRoot(isolatedRoot('Scene2', Scene2Idea, SCENES.idea.start, SCENES.idea.length));

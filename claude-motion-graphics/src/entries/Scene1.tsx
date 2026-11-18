import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {Scene1Intro} from '../scenes/Scene1Intro';
import {SCENES} from '../timeline';

registerRoot(isolatedRoot('Scene1', Scene1Intro, SCENES.intro.start, SCENES.intro.length));

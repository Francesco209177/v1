import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {V2How} from '../v02/scenes/V2How';
import {V2_SCENES} from '../v02/timeline';

registerRoot(isolatedRoot('V02S3', V2How, V2_SCENES.how.start, V2_SCENES.how.length));

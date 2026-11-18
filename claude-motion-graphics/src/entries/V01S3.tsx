import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {V1Attention} from '../v01/scenes/V1Attention';
import {V1_SCENES} from '../v01/timeline';

registerRoot(isolatedRoot('V01S3', V1Attention, V1_SCENES.attention.start, V1_SCENES.attention.length));

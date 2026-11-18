import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {V1Predict} from '../v01/scenes/V1Predict';
import {V1_SCENES} from '../v01/timeline';

registerRoot(isolatedRoot('V01S4', V1Predict, V1_SCENES.predict.start, V1_SCENES.predict.length));

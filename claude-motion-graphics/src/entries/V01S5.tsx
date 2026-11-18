import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {V1Reveal} from '../v01/scenes/V1Reveal';
import {V1_SCENES} from '../v01/timeline';

registerRoot(isolatedRoot('V01S5', V1Reveal, V1_SCENES.reveal.start, V1_SCENES.reveal.length));

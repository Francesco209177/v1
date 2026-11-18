import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {V2Reveal} from '../v02/scenes/V2Reveal';
import {V2_SCENES} from '../v02/timeline';

registerRoot(isolatedRoot('V02S5', V2Reveal, V2_SCENES.reveal.start, V2_SCENES.reveal.length));

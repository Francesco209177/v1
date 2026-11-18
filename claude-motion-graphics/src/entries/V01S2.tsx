import {registerRoot} from 'remotion';
import {isolatedRoot} from '../isolated';
import {V1Tokens} from '../v01/scenes/V1Tokens';
import {V1_SCENES} from '../v01/timeline';

registerRoot(isolatedRoot('V01S2', V1Tokens, V1_SCENES.tokens.start, V1_SCENES.tokens.length));

import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {loadFonts} from '../fonts';
import {FPS, HEIGHT, WIDTH} from '../timeline';
import {V4Main} from '../v04/Main';
import {V4_DURATION} from '../v04/timeline';

loadFonts();
const R: React.FC = () => <Composition id="V04" component={V4Main} durationInFrames={V4_DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />;
registerRoot(R);

import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {loadFonts} from '../fonts';
import {FPS, HEIGHT, WIDTH} from '../timeline';
import {V1Main} from '../v01/Main';
import {V1_DURATION} from '../v01/timeline';

loadFonts();
const R: React.FC = () => <Composition id="V01" component={V1Main} durationInFrames={V1_DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />;
registerRoot(R);

import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {loadFonts} from '../fonts';
import {FPS, HEIGHT, WIDTH} from '../timeline';
import {V2Main} from '../v02/Main';
import {V2_DURATION} from '../v02/timeline';

loadFonts();
const R: React.FC = () => <Composition id="V02" component={V2Main} durationInFrames={V2_DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />;
registerRoot(R);

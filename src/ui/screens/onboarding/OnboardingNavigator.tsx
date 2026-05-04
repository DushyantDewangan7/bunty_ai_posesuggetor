import { useState } from 'react';

import type { FaceShape } from '../../../types/userProfile';
import { CompletionScreen } from './CompletionScreen';
import { FaceCaptureScreen } from './FaceCaptureScreen';
import { GenderScreen } from './GenderScreen';
import { HeightScreen } from './HeightScreen';
import { WelcomeScreen } from './WelcomeScreen';

type Step = 'welcome' | 'gender' | 'height' | 'face' | 'complete';

interface Props {
  onDone: () => void;
}

export function OnboardingNavigator({ onDone }: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>('welcome');

  switch (step) {
    case 'welcome':
      return <WelcomeScreen onStart={() => setStep('gender')} />;
    case 'gender':
      return <GenderScreen onAdvance={() => setStep('height')} />;
    case 'height':
      return <HeightScreen onAdvance={() => setStep('face')} />;
    case 'face':
      return <FaceCaptureScreen onCaptured={(_shape: FaceShape) => setStep('complete')} />;
    case 'complete':
      return <CompletionScreen onContinue={onDone} />;
  }
}

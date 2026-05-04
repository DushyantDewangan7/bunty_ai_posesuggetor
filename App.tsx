import { StatusBar } from 'expo-status-bar';

import { useUserProfile } from './src/state/userProfile';
import { CameraScreen } from './src/ui/screens/CameraScreen';
import { OnboardingNavigator } from './src/ui/screens/onboarding/OnboardingNavigator';

export default function App(): React.JSX.Element {
  const onboardingComplete = useUserProfile((s) => s.profile.onboardingComplete);

  return (
    <>
      <StatusBar style="light" />
      {onboardingComplete ? (
        <CameraScreen />
      ) : (
        <OnboardingNavigator
          onDone={() => {
            // Profile completion is persisted by CompletionScreen via the
            // store's completeOnboarding(); the conditional above will pick
            // up the change on next render.
          }}
        />
      )}
    </>
  );
}

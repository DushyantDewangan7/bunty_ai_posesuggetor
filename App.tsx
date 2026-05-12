import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useUserProfile } from './src/state/userProfile';
import { CameraScreen } from './src/ui/screens/CameraScreen';
import { OnboardingNavigator } from './src/ui/screens/onboarding/OnboardingNavigator';

if (Platform.OS === 'android') {
  // Hide the navigation bar entirely (immersive mode)
  NavigationBar.setVisibilityAsync('hidden');
  // When swiped up, it overlays temporarily instead of pushing content up
  NavigationBar.setBehaviorAsync('overlay-swipe');
}

export default function App(): React.JSX.Element {
  const onboardingComplete = useUserProfile((s) => s.profile.onboardingComplete);

  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}

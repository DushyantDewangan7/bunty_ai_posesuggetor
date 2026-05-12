import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useUserProfile } from './src/state/userProfile';
import { CameraScreen } from './src/ui/screens/CameraScreen';
import { OnboardingNavigator } from './src/ui/screens/onboarding/OnboardingNavigator';

if (Platform.OS === 'android') {
  // Hide the navigation bar (immersive mode). Dynamic require + try/catch so
  // a debug APK built before expo-navigation-bar was autolinked still boots —
  // the JS package is in node_modules but the native half only lands in the
  // APK after a fresh `gradlew assembleDebug`. On properly-built APKs both
  // calls succeed and behavior is unchanged.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const NavigationBar = require('expo-navigation-bar') as typeof import('expo-navigation-bar');
    NavigationBar.setVisibilityAsync('hidden')?.catch(() => {});
    // When swiped up, the nav bar overlays temporarily instead of pushing content up.
    NavigationBar.setBehaviorAsync('overlay-swipe')?.catch(() => {});
  } catch {
    // Native module missing — app boots with the nav bar visible.
  }
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

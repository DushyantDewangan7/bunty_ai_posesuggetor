import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useCurrentScreen } from './src/state/screen';
import { useUserProfile } from './src/state/userProfile';
import { CameraScreen } from './src/ui/screens/CameraScreen';
import { MarketplaceScreen } from './src/ui/screens/MarketplaceScreen';
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
  const screen = useCurrentScreen();

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {onboardingComplete ? (
        // Inactive screen is unmounted (not display:none) so the camera releases
        // resources when the user navigates away. ~1-2s re-init on return is
        // acceptable for v1; revisit if it becomes painful.
        screen === 'camera' ? (
          <CameraScreen />
        ) : (
          <MarketplaceScreen />
        )
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

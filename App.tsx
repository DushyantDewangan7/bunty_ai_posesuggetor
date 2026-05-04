import { StatusBar } from 'expo-status-bar';

import { CameraScreen } from './src/ui/screens/CameraScreen';

export default function App(): React.JSX.Element {
  return (
    <>
      <StatusBar style="light" />
      <CameraScreen />
    </>
  );
}

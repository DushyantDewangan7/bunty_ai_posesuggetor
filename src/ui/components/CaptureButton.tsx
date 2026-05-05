import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { validateForCapture } from '../../ml/poseValidation';
import { usePoseStream } from '../../state/poseStream';
import { CaptureNameDialog } from './CaptureNameDialog';

// Native side drops frames silently when MediaPipe finds no person (see
// HybridPoseLandmarkerOutput.kt) so latestFrame can stay non-null forever
// after the user leaves frame. Treat a frame older than this as "no pose".
const STALE_FRAME_MS = 500;

export function CaptureButton(): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const latestFrame = usePoseStream((s) => s.latestFrame);
  const latestNormalized = usePoseStream((s) => s.latestNormalized);

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);

  const isStale = !latestFrame || now - latestFrame.timestamp > STALE_FRAME_MS;
  const validation = isStale ? null : validateForCapture(latestFrame);
  const canCapture =
    validation?.valid === true &&
    latestFrame?.landmarks != null &&
    latestNormalized?.landmarks != null;

  const handlePress = (): void => {
    if (!canCapture) return;
    setDialogOpen(true);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={handlePress}
        disabled={!canCapture}
        style={[styles.button, !canCapture && styles.buttonDisabled]}
      >
        <Text style={styles.icon}>📌</Text>
        <Text style={styles.label}>Capture</Text>
      </Pressable>
      {dialogOpen &&
      canCapture &&
      latestFrame?.landmarks != null &&
      latestNormalized?.landmarks != null ? (
        <CaptureNameDialog
          imageLandmarks={latestFrame.landmarks}
          normalizedLandmarks={latestNormalized.landmarks}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -36,
  },
  button: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF6B35',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(80, 80, 80, 0.6)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  icon: {
    fontSize: 22,
    lineHeight: 26,
  },
  label: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.4,
  },
});

import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { openSettings } from 'react-native-permissions';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

import { usePoseLandmarkerOutput } from '../../camera/usePoseLandmarkerOutput';
import { matchPose } from '../../recommendation/poseMatch';
import { useAiMode } from '../../state/aiMode';
import { usePoseStream } from '../../state/poseStream';
import { usePoseTarget } from '../../state/poseTarget';
import { CaptureButton } from '../components/CaptureButton';
import { MatchFeedback } from '../components/MatchFeedback';
import { MockPoseControls } from '../components/MockPoseControls';
import { PoseSelector } from '../components/PoseSelector';
import { PoseTargetOverlay } from '../components/PoseTargetOverlay';
import { SettingsButton } from '../components/SettingsButton';
import { SmartSuggestionsButton } from '../components/SmartSuggestionsButton';
import { FaceCaptureScreen } from './onboarding/FaceCaptureScreen';
import { SettingsModal } from './SettingsModal';

const CAMERA_RATIONALE =
  'AI Pose Suggestor needs camera access to suggest poses based on your body and surroundings. Your camera frames never leave your device.';

const handleOpenSettings = (): void => {
  openSettings().catch(() => {
    Linking.openSettings().catch(() => {
      // Best effort; nothing further to do if both paths fail.
    });
  });
};

export function CameraScreen(): React.JSX.Element {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  // Output-attached MediaPipe pose detector. Inference runs on the analyzer
  // thread inside HybridPoseLandmarkerOutput (no worklet, no JSI host-function
  // dispatch from the worklet runtime). Per ADR-001 G14, 2026-05-03.
  const poseOutput = usePoseLandmarkerOutput();

  // Phase 4-B G22: photo output for SmartSuggestions. capturePhoto returns
  // an in-memory Photo we decode + resize via Skia (see captureFrame.ts).
  // Sized down so the still capture fits the same negotiation as pose preview.
  const photoOutput = usePhotoOutput({
    targetResolution: { width: 1280, height: 720 },
    qualityPrioritization: 'speed',
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recapturing, setRecapturing] = useState(false);
  const aiMode = useAiMode();

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Continuous match scoring: every time a new normalized frame arrives,
  // score it against the currently-selected target (if any) and push the
  // result into the poseTarget store for MatchFeedback to render.
  useEffect(() => {
    const unsub = usePoseStream.subscribe((state, prev) => {
      if (state.latestNormalized === prev.latestNormalized) return;
      const target = usePoseTarget.getState().selected;
      if (!target) return;
      if (!state.latestNormalized) {
        usePoseTarget.getState().setMatchResult(null);
        return;
      }
      const result = matchPose(target.referenceLandmarks, state.latestNormalized);
      usePoseTarget.getState().setMatchResult(result);
    });
    return unsub;
  }, []);

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Permission required</Text>
        <Text style={styles.body}>{CAMERA_RATIONALE}</Text>
        <Pressable style={styles.button} onPress={handleOpenSettings}>
          <Text style={styles.buttonLabel}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No camera available</Text>
        <Text style={styles.body}>
          This device does not expose a back camera. Try running on a physical Android device.
        </Text>
      </View>
    );
  }

  // Re-capture face flow: unmount the back-camera pose preview entirely so the
  // front-camera FaceCaptureScreen owns the device. On capture or cancel,
  // return to the SettingsModal opened.
  if (recapturing) {
    return (
      <FaceCaptureScreen
        mode="recapture"
        onCaptured={() => {
          setRecapturing(false);
          setSettingsOpen(true);
        }}
        onCancel={() => {
          setRecapturing(false);
          setSettingsOpen(true);
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        outputs={[poseOutput, photoOutput]}
      />
      <PoseTargetOverlay mirrored={false} />
      <MatchFeedback />
      <PoseSelector />
      <CaptureButton />
      {aiMode && <SmartSuggestionsButton photoOutput={photoOutput} />}
      <MockPoseControls />
      <DebugOverlay />
      <SettingsButton onPress={() => setSettingsOpen(true)} />
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onRequestRecapture={() => {
          setSettingsOpen(false);
          setRecapturing(true);
        }}
      />
    </View>
  );
}

function DebugOverlay(): React.JSX.Element {
  const isDetecting = usePoseStream((s) => s.isDetecting);
  const fps = usePoseStream((s) => s.fps);
  const latestFrame = usePoseStream((s) => s.latestFrame);

  const inferenceMs = latestFrame?.inferenceMs ?? 0;
  const nose = latestFrame?.landmarks?.[0];

  return (
    <View style={styles.debug} pointerEvents="none">
      <Text style={styles.debugLine}>{isDetecting ? 'Detecting' : 'No person'}</Text>
      <Text style={styles.debugLine}>fps : {fps.toFixed(1)}</Text>
      <Text style={styles.debugLine}>infer : {inferenceMs.toFixed(1)} ms</Text>
      {nose ? (
        <Text style={styles.debugLine}>
          nose : x={nose.x.toFixed(2)} y={nose.y.toFixed(2)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: '#ddd',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  buttonLabel: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  debug: {
    position: 'absolute',
    top: 48,
    left: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 4,
  },
  debugLine: {
    color: '#fff',
    fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo' }),
    fontSize: 12,
    lineHeight: 16,
  },
});

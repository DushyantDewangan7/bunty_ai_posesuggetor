import { Canvas, Oval } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Dimensions, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { openSettings } from 'react-native-permissions';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

import { useFaceLandmarkerOutput } from '../../../camera/useFaceLandmarkerOutput';
import { deriveFaceShape } from '../../../ml/faceShape';
import { useFaceCapture } from '../../../state/faceCapture';
import { useUserProfile } from '../../../state/userProfile';
import type { FaceShape } from '../../../types/userProfile';
import { COLORS, RADII, SPACING } from './theme';

const CAMERA_RATIONALE =
  'We use the front camera once to detect your face shape — frames stay on the device and are never uploaded.';

type Mode = 'onboarding' | 'recapture';

interface Props {
  onCaptured: (shape: FaceShape) => void;
  mode?: Mode;
  onCancel?: () => void;
}

export function FaceCaptureScreen({
  onCaptured,
  mode = 'onboarding',
  onCancel,
}: Props): React.JSX.Element {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.permissionRoot}>
        <Text style={styles.title}>Camera permission needed</Text>
        <Text style={styles.body}>{CAMERA_RATIONALE}</Text>
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={handleOpenSettings}
        >
          <Text style={styles.ctaLabel}>Open Settings</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (device == null) {
    return (
      <SafeAreaView style={styles.permissionRoot}>
        <Text style={styles.title}>No front camera</Text>
        <Text style={styles.body}>
          This device does not expose a front camera, which is required for the face-shape step.
        </Text>
      </SafeAreaView>
    );
  }

  return <CapturePreview device={device} onCaptured={onCaptured} mode={mode} onCancel={onCancel} />;
}

interface PreviewProps {
  device: NonNullable<ReturnType<typeof useCameraDevice>>;
  onCaptured: (shape: FaceShape) => void;
  mode: Mode;
  onCancel: (() => void) | undefined;
}

function CapturePreview({ device, onCaptured, mode, onCancel }: PreviewProps): React.JSX.Element {
  const faceOutput = useFaceLandmarkerOutput();
  const setFaceShape = useUserProfile((s) => s.setFaceShape);
  const isCentered = useFaceCapture((s) => s.isCentered);
  const [busy, setBusy] = useState(false);

  const handleCapture = (): void => {
    if (busy) return;
    const latest = useFaceCapture.getState().latest;
    if (!latest) return;
    setBusy(true);
    const shape = deriveFaceShape(latest.landmarks);
    setFaceShape(shape);
    onCaptured(shape);
  };

  return (
    <View style={styles.cameraRoot}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        outputs={[faceOutput]}
      />
      <FaceGuide isCentered={isCentered} />
      <SafeAreaView style={styles.overlayChrome} pointerEvents="box-none">
        <View style={styles.header}>
          {mode === 'onboarding' ? (
            <Text style={styles.step}>3 of 3</Text>
          ) : (
            <Text style={styles.step}>Re-capture face</Text>
          )}
          <Text style={styles.title}>Position your face inside the oval</Text>
          <Text style={styles.subtitle}>
            {isCentered ? 'Looking good — tap Capture.' : 'Move closer or recenter your face.'}
          </Text>
        </View>
        <View style={styles.footer}>
          {mode === 'recapture' && onCancel ? (
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelPressed]}
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
          ) : null}
          <Pressable
            disabled={!isCentered || busy}
            onPress={handleCapture}
            style={({ pressed }) => [
              styles.cta,
              (!isCentered || busy) && styles.ctaDisabled,
              pressed && isCentered && styles.ctaPressed,
            ]}
          >
            <Text style={styles.ctaLabel}>{busy ? 'Analyzing…' : 'Capture'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function FaceGuide({ isCentered }: { isCentered: boolean }): React.JSX.Element {
  const { width, height } = Dimensions.get('window');
  // Oval ~70% of width, 1.4x as tall as wide. Centered.
  const ovalW = width * 0.7;
  const ovalH = ovalW * 1.4;
  const cx = (width - ovalW) / 2;
  const cy = (height - ovalH) / 2;
  const color = isCentered ? COLORS.accent : COLORS.textMuted;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Oval
        x={cx}
        y={cy}
        width={ovalW}
        height={ovalH}
        color={color}
        style="stroke"
        strokeWidth={3}
      />
    </Canvas>
  );
}

const handleOpenSettings = (): void => {
  openSettings().catch(() => {
    Linking.openSettings().catch(() => {
      // best effort
    });
  });
};

const styles = StyleSheet.create({
  cameraRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlayChrome: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
  },
  header: {
    paddingTop: SPACING.lg,
    backgroundColor: 'rgba(26,26,26,0.7)',
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  step: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    paddingBottom: SPACING.xl,
  },
  cta: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: RADII.md,
    alignItems: 'center',
  },
  ctaPressed: {
    backgroundColor: COLORS.accentPressed,
  },
  ctaDisabled: {
    backgroundColor: COLORS.border,
  },
  ctaLabel: {
    color: COLORS.accentText,
    fontSize: 17,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: SPACING.md,
    borderRadius: RADII.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  cancelPressed: {
    opacity: 0.6,
  },
  cancelLabel: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  permissionRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
  },
  body: {
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
});

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CameraPhotoOutput } from 'react-native-vision-camera';

import { RICH_POSE_LIBRARY } from '../../library/poseLibrary';
import {
  callGeminiAPI,
  captureCurrentFrame,
  parseGeminiResponse,
  projectPoseForAgent,
  runSmartSuggestionsFlow,
  smartSuggestionsCache,
  smartSuggestionsRateLimiter,
} from '../../smartSuggestions';
import { usePoseStream } from '../../state/poseStream';
import { useRecommendationSession } from '../../state/recommendationSession';
import { useSmartSuggestions } from '../../state/smartSuggestionsState';
import { useUserProfile } from '../../state/userProfile';
import type { SmartSuggestionError } from '../../types/smartSuggestions';

interface Props {
  photoOutput: CameraPhotoOutput | null;
}

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

export function SmartSuggestionsButton({ photoOutput }: Props): React.JSX.Element {
  const loading = useSmartSuggestions((s) => s.loading);
  const onboardingComplete = useUserProfile((s) => s.profile.onboardingComplete);

  const disabled = !photoOutput || loading || !onboardingComplete;

  const handlePress = async (): Promise<void> => {
    if (disabled || !photoOutput) return;

    // Spec gate: latestFrame must exist. Read at press time, not via subscribe,
    // so the disabled flag doesn't flicker the button while a person walks
    // in/out of frame between presses.
    const latestFrame = usePoseStream.getState().latestFrame;
    if (!latestFrame) return;

    const profile = useUserProfile.getState().profile;
    if (!profile.onboardingComplete) return;

    const shownPoseIds = Array.from(useRecommendationSession.getState().shownPoseIds);

    useSmartSuggestions.getState().startRequest();

    try {
      const captured = await captureCurrentFrame(photoOutput);
      const result = await runSmartSuggestionsFlow(
        {
          frameBase64: captured.base64,
          grayscale: captured.grayscale,
          profile,
          libraryMetadata: RICH_POSE_LIBRARY.map(projectPoseForAgent),
          libraryIds: new Set(RICH_POSE_LIBRARY.map((p) => p.id)),
          shownPoseIds,
        },
        {
          cache: smartSuggestionsCache,
          rateLimiter: smartSuggestionsRateLimiter(),
          callGemini: (request) => callGeminiAPI(request, API_KEY),
          parseResponse: parseGeminiResponse,
        },
      );
      useSmartSuggestions.getState().setResult(result);
    } catch (err) {
      useSmartSuggestions.getState().setError(extractErrorPayload(err));
    }
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          void handlePress();
        }}
        disabled={disabled}
        style={[styles.button, disabled && styles.buttonDisabled]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.icon}>🎯</Text>}
        <Text style={styles.label}>Smart Picks</Text>
      </Pressable>
    </View>
  );
}

function extractErrorPayload(err: unknown): SmartSuggestionError {
  if (
    err &&
    typeof err === 'object' &&
    'errorPayload' in err &&
    isSmartSuggestionError((err as { errorPayload: unknown }).errorPayload)
  ) {
    return (err as { errorPayload: SmartSuggestionError }).errorPayload;
  }
  // Frame capture or any other unexpected throw lands here. Map to api-error
  // so the UI's error mapping has something to render.
  return {
    type: 'api-error',
    status: 0,
    message: err instanceof Error ? err.message : 'unknown',
  };
}

function isSmartSuggestionError(payload: unknown): payload is SmartSuggestionError {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    typeof (payload as { type: unknown }).type === 'string'
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    top: '50%',
    marginTop: -36,
  },
  button: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#7C3AED',
    borderWidth: 2,
    borderColor: '#9333EA',
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

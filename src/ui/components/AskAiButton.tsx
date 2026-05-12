/**
 * "Ask AI" manual coaching trigger (Phase E).
 *
 * Renders a small pill button positioned just below the MatchFeedback card.
 * Gating to aiMode is handled by the parent (CameraScreen) so this component
 * stays trivially testable.
 *
 * UX rules:
 *   - Shows a loading spinner while the trigger promise is in flight (frame
 *     capture + Gemini roundtrip is ~2-3s on a good network).
 *   - Disabled when the per-session cap (3 calls) is exhausted — the button
 *     greys out so users see why a tap doesn't do anything.
 *   - Manual trigger does NOT bypass the per-session cap; it does bypass the
 *     5-second auto-trigger cooldown. That cap-vs-cooldown distinction is
 *     enforced inside useAiCoachingOrchestrator.
 */

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_AI_CALLS_PER_POSE_SESSION, useAiCoaching } from '../../state/aiCoaching';

interface Props {
  onPress: () => Promise<void>;
}

export function AskAiButton({ onPress }: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const callsThisSession = useAiCoaching((s) => s.callsThisSession);
  const capped = callsThisSession >= MAX_AI_CALLS_PER_POSE_SESSION;
  const disabled = busy || capped;

  const handlePress = async (): Promise<void> => {
    if (disabled) return;
    setBusy(true);
    try {
      await onPress();
    } finally {
      setBusy(false);
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
        accessibilityLabel="Ask AI for a coaching tip"
      >
        {busy ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.label}>{capped ? '✨ AI tips used' : '✨ Ask AI'}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 220,
    alignItems: 'center',
  },
  button: {
    minWidth: 120,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(124, 58, 237, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(80, 80, 80, 0.7)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

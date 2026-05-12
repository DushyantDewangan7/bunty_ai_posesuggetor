import { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useAiCoaching } from '../../state/aiCoaching';
import { useAiMode } from '../../state/aiMode';
import { usePoseTarget } from '../../state/poseTarget';
import type { MatchResult, MatchState } from '../../types/pose';

const COLOR_FAR = '#FF4D4F';
const COLOR_CLOSE = '#FACC15';
const COLOR_MATCHED = '#22C55E';

const LANDMARK_NAMES: Record<number, string> = {
  0: 'head',
  11: 'left shoulder',
  12: 'right shoulder',
  13: 'left elbow',
  14: 'right elbow',
  15: 'left wrist',
  16: 'right wrist',
  23: 'left hip',
  24: 'right hip',
  25: 'left knee',
  26: 'right knee',
  27: 'left ankle',
  28: 'right ankle',
};

function colorForState(state: MatchState): string {
  if (state === 'matched') return COLOR_MATCHED;
  if (state === 'close') return COLOR_CLOSE;
  return COLOR_FAR;
}

function describeWorstJoints(indices: number[]): string | null {
  const named = indices
    .map((i) => LANDMARK_NAMES[i])
    .filter((n): n is string => typeof n === 'string');
  // De-duplicate while preserving order (e.g. left+right wrist on the same arm).
  const unique: string[] = [];
  for (const name of named) {
    if (!unique.includes(name)) unique.push(name);
  }
  if (unique.length === 0) return null;
  if (unique.length === 1) return `Adjust your ${unique[0]}`;
  return `Adjust your ${unique[0]} and ${unique[1]}`;
}

/**
 * Returns the coaching text to display: AI tip when aiMode is on AND a tip is
 * available, otherwise the rule-based "Adjust your X" hint, otherwise null.
 * Centralises the AI/rule-based fallback so MatchFeedback's render path stays
 * a single read.
 */
export function useCoachingText(matchResult: MatchResult | null): string | null {
  const aiMode = useAiMode();
  const aiTip = useAiCoaching((s) => s.currentTip);
  if (aiMode && aiTip) return aiTip;
  if (matchResult && matchResult.state !== 'matched') {
    return describeWorstJoints(matchResult.worstJoints);
  }
  return null;
}

export function MatchFeedback(): React.JSX.Element | null {
  const selected = usePoseTarget((s) => s.selected);
  const matchResult = usePoseTarget((s) => s.matchResult);

  const scale = useSharedValue(1);
  const state = matchResult?.state ?? 'far';

  // Pulse on transition to 'matched' for celebratory feedback.
  useEffect(() => {
    if (state === 'matched') {
      scale.value = withTiming(1.1, { duration: 150 }, () => {
        scale.value = withTiming(1, { duration: 200 });
      });
    }
  }, [state, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const hint = useCoachingText(matchResult);

  if (!selected) return null;

  const fitScore = matchResult?.fitScore ?? 0;
  const percent = Math.round(fitScore * 100);
  const color = colorForState(state);

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.card, { borderColor: color }, animatedStyle]}>
        <Text style={[styles.percent, { color }]}>{percent}%</Text>
        <Text style={styles.label}>{selected.name}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 200,
    alignItems: 'center',
  },
  card: {
    minWidth: 160,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 2,
    alignItems: 'center',
  },
  percent: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 36,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    marginTop: 2,
    opacity: 0.85,
  },
  hint: {
    color: '#fff',
    fontSize: 13,
    marginTop: 6,
    opacity: 0.9,
  },
});

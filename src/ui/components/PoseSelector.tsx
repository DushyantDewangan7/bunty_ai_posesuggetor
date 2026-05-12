import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { POSE_LIBRARY } from '../../library/poseLibrary';
import { getPoseImage } from './poseImageAssetMap';
import { recommend } from '../../recommendation/recommend';
import { useAiMode } from '../../state/aiMode';
import { useCustomPoses } from '../../state/customPoses';
import { usePoseTarget } from '../../state/poseTarget';
import { useRecommendationSession } from '../../state/recommendationSession';
import { useSmartSuggestions } from '../../state/smartSuggestionsState';
import { useUserProfile } from '../../state/userProfile';
import type { CapturedPose } from '../../types/customPose';
import type { PoseCategory, PoseTarget } from '../../types/pose';
import type { SmartSuggestionError, SmartSuggestionPick } from '../../types/smartSuggestions';

const CATEGORY_GLYPH: Record<PoseCategory, string> = {
  standing: '⏐',
  sitting: '◧',
  fitness: '✦',
  lifestyle: '◐',
};

const RECOMMENDATION_LIMIT = 3;

function captureToPoseTarget(c: CapturedPose): PoseTarget {
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    description: `Captured ${new Date(c.capturedAt).toLocaleDateString()}`,
    referenceLandmarks: c.referenceLandmarks,
    difficulty: c.difficulty,
  };
}

export function PoseSelector(): React.JSX.Element {
  const selected = usePoseTarget((s) => s.selected);
  const selectTarget = usePoseTarget((s) => s.selectTarget);
  const profile = useUserProfile((s) => s.profile);
  const shownPoseIds = useRecommendationSession((s) => s.shownPoseIds);
  const markShown = useRecommendationSession((s) => s.markShown);
  const captures = useCustomPoses((s) => s.captures);
  const aiMode = useAiMode();
  const smartLoadingRaw = useSmartSuggestions((s) => s.loading);
  const smartResultRaw = useSmartSuggestions((s) => s.result);
  const smartErrorRaw = useSmartSuggestions((s) => s.error);
  const clearSmart = useSmartSuggestions((s) => s.clear);

  // When aiMode is off, hide any leftover loading/result/error state so the
  // AI Picks section disappears immediately on toggle-off without needing to
  // clear the smartSuggestions store.
  const smartLoading = aiMode ? smartLoadingRaw : false;
  const smartResult = aiMode ? smartResultRaw : null;
  const smartError = aiMode ? smartErrorRaw : null;

  const poseById = useMemo(() => {
    const map = new Map<string, PoseTarget>();
    for (const pose of POSE_LIBRARY) {
      map.set(pose.id, pose);
    }
    return map;
  }, []);

  const aiPicks = useMemo(() => {
    if (!smartResult) return [] as { pick: SmartSuggestionPick; pose: PoseTarget }[];
    return smartResult.recommendations
      .map((pick) => {
        const pose = poseById.get(pick.poseId);
        return pose ? { pick, pose } : null;
      })
      .filter((entry): entry is { pick: SmartSuggestionPick; pose: PoseTarget } => entry !== null);
  }, [smartResult, poseById]);

  const aiPickIds = useMemo(() => new Set(aiPicks.map((entry) => entry.pose.id)), [aiPicks]);

  const { recommendedPoses, otherPoses } = useMemo(() => {
    const result = recommend({ profile, shownPoseIds, limit: RECOMMENDATION_LIMIT });
    // AI picks claim their slot at the top — drop them from the on-device
    // For You and library tail to avoid showing the same pose twice.
    const recOrdered = result.recommendations
      .map((r) => r.pose)
      .filter((p) => !aiPickIds.has(p.id));
    const recIds = new Set(recOrdered.map((p) => p.id));
    const others = POSE_LIBRARY.filter((p) => !recIds.has(p.id) && !aiPickIds.has(p.id));
    return { recommendedPoses: recOrdered, otherPoses: others };
  }, [profile, shownPoseIds, aiPickIds]);

  const handlePress = (pose: PoseTarget): void => {
    selectTarget(pose);
    markShown(pose.id);
  };

  const handleAiPickLongPress = (pick: SmartSuggestionPick, pose: PoseTarget): void => {
    Alert.alert(pose.name, pick.reasoning, [{ text: 'OK', style: 'default' }], {
      cancelable: true,
    });
  };

  const handleCaptureLongPress = (capture: CapturedPose): void => {
    Alert.alert(
      'Delete pose?',
      `Remove "${capture.name}" from your saved poses?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            useCustomPoses.getState().remove(capture.id);
            // If the deleted capture was the active target, clear selection.
            if (usePoseTarget.getState().selected?.id === capture.id) {
              selectTarget(null);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ClearCard active={selected === null} onPress={() => selectTarget(null)} />
        {smartLoading && (
          <>
            <View style={styles.sectionLabelWrap}>
              <Text style={styles.aiPicksLabel}>🎯 AI Picks</Text>
            </View>
            <View style={[styles.card, styles.cardLoading]}>
              <ActivityIndicator color="#C4B5FD" />
              <Text style={styles.statusText} numberOfLines={2}>
                Analyzing scene...
              </Text>
            </View>
            <View style={styles.divider} />
          </>
        )}
        {!smartLoading && smartError && (
          <>
            <View style={styles.sectionLabelWrap}>
              <Text style={styles.aiPicksLabel}>🎯 AI Picks</Text>
            </View>
            <Pressable onPress={clearSmart} style={[styles.card, styles.cardError]}>
              <Text style={styles.glyph}>⚠️</Text>
              <Text style={styles.statusText} numberOfLines={3}>
                {errorMessageFor(smartError)}
              </Text>
            </Pressable>
            <View style={styles.divider} />
          </>
        )}
        {!smartLoading && !smartError && aiPicks.length > 0 && (
          <>
            <View style={styles.sectionLabelWrap}>
              <Text style={styles.aiPicksLabel}>
                🎯 AI Picks
                {smartResult?.fromCache ? <Text style={styles.cachedHint}> (cached)</Text> : null}
              </Text>
            </View>
            {aiPicks.map(({ pick, pose }) => (
              <AiPickCard
                key={pose.id}
                pose={pose}
                active={selected?.id === pose.id}
                onPress={() => handlePress(pose)}
                onLongPress={() => handleAiPickLongPress(pick, pose)}
              />
            ))}
            <View style={styles.divider} />
          </>
        )}
        {recommendedPoses.length > 0 && (
          <>
            <View style={styles.sectionLabelWrap}>
              <Text style={styles.forYouLabel}>✨ For You</Text>
            </View>
            {recommendedPoses.map((pose) => (
              <PoseCard
                key={pose.id}
                pose={pose}
                active={selected?.id === pose.id}
                onPress={() => handlePress(pose)}
                recommended
              />
            ))}
            <View style={styles.divider} />
          </>
        )}
        {captures.length > 0 && (
          <>
            <View style={styles.sectionLabelWrap}>
              <Text style={styles.myPosesLabel}>📌 My Poses</Text>
            </View>
            {captures.map((capture) => {
              const pose = captureToPoseTarget(capture);
              return (
                <CaptureCard
                  key={capture.id}
                  pose={pose}
                  active={selected?.id === pose.id}
                  onPress={() => handlePress(pose)}
                  onLongPress={() => handleCaptureLongPress(capture)}
                />
              );
            })}
            <View style={styles.divider} />
          </>
        )}
        {otherPoses.map((pose) => (
          <PoseCard
            key={pose.id}
            pose={pose}
            active={selected?.id === pose.id}
            onPress={() => handlePress(pose)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function PoseTileVisual({ pose }: { pose: PoseTarget }): React.JSX.Element {
  const image = getPoseImage(pose.id);
  if (image !== undefined) {
    return <Image source={image} style={styles.poseImage} resizeMode="contain" />;
  }
  return <Text style={styles.glyph}>{CATEGORY_GLYPH[pose.category]}</Text>;
}

function PoseCard({
  pose,
  active,
  onPress,
  recommended = false,
}: {
  pose: PoseTarget;
  active: boolean;
  onPress: () => void;
  recommended?: boolean;
}): React.JSX.Element {
  const stars = '★'.repeat(pose.difficulty) + '☆'.repeat(Math.max(0, 5 - pose.difficulty));
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, recommended && styles.cardRecommended, active && styles.cardActive]}
    >
      <PoseTileVisual pose={pose} />
      <Text style={styles.name} numberOfLines={1}>
        {pose.name}
      </Text>
      <Text style={styles.stars} numberOfLines={1}>
        {stars}
      </Text>
    </Pressable>
  );
}

function AiPickCard({
  pose,
  active,
  onPress,
  onLongPress,
}: {
  pose: PoseTarget;
  active: boolean;
  onPress: () => void;
  onLongPress: () => void;
}): React.JSX.Element {
  const stars = '★'.repeat(pose.difficulty) + '☆'.repeat(Math.max(0, 5 - pose.difficulty));
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={[styles.card, styles.cardAiPick, active && styles.cardActive]}
    >
      <PoseTileVisual pose={pose} />
      <Text style={styles.name} numberOfLines={1}>
        {pose.name}
      </Text>
      <Text style={styles.stars} numberOfLines={1}>
        {stars}
      </Text>
    </Pressable>
  );
}

function errorMessageFor(error: SmartSuggestionError): string {
  switch (error.type) {
    case 'no-internet':
      return 'Connect to internet for Smart Picks';
    case 'rate-limit': {
      if (error.resetAt) {
        const reset = new Date(error.resetAt);
        const formatted = reset.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });
        return `Daily limit reached — resets at ${formatted}`;
      }
      return 'Rate limit reached, try again in a minute';
    }
    case 'timeout':
      return 'Took too long, tap Smart Picks to retry';
    case 'api-error':
      return "Couldn't reach the service, tap to retry";
    case 'parse-error':
    case 'no-valid-picks':
      return "Couldn't generate picks, tap to retry";
  }
}

function CaptureCard({
  pose,
  active,
  onPress,
  onLongPress,
}: {
  pose: PoseTarget;
  active: boolean;
  onPress: () => void;
  onLongPress: () => void;
}): React.JSX.Element {
  const stars = '★'.repeat(pose.difficulty) + '☆'.repeat(Math.max(0, 5 - pose.difficulty));
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      style={[styles.card, styles.cardCaptured, active && styles.cardActive]}
    >
      <Text style={styles.glyph}>📌</Text>
      <Text style={styles.name} numberOfLines={1}>
        {pose.name}
      </Text>
      <Text style={styles.stars} numberOfLines={1}>
        {stars}
      </Text>
    </Pressable>
  );
}

function ClearCard({
  active,
  onPress,
}: {
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, styles.clearCard, active && styles.cardActive]}
    >
      <Text style={styles.glyph}>✕</Text>
      <Text style={styles.name}>None</Text>
      <Text style={styles.stars}> </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 84,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
  },
  card: {
    width: 88,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
  },
  clearCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  cardActive: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
  },
  cardRecommended: {
    borderColor: 'rgba(250, 204, 21, 0.55)',
  },
  cardCaptured: {
    borderColor: 'rgba(255, 107, 53, 0.65)',
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
  },
  cardAiPick: {
    borderColor: '#9333EA',
    borderWidth: 2,
    backgroundColor: 'rgba(147, 51, 234, 0.16)',
  },
  cardLoading: {
    borderColor: 'rgba(196, 181, 253, 0.6)',
    backgroundColor: 'rgba(124, 58, 237, 0.18)',
    minHeight: 76,
    justifyContent: 'center',
  },
  cardError: {
    borderColor: 'rgba(248, 113, 113, 0.7)',
    backgroundColor: 'rgba(127, 29, 29, 0.4)',
    minHeight: 76,
    justifyContent: 'center',
  },
  glyph: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 26,
  },
  poseImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  name: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  stars: {
    color: '#FACC15',
    fontSize: 10,
    marginTop: 2,
  },
  sectionLabelWrap: {
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  forYouLabel: {
    color: '#FACC15',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  myPosesLabel: {
    color: '#FF6B35',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  aiPicksLabel: {
    color: '#C4B5FD',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cachedHint: {
    color: 'rgba(196, 181, 253, 0.55)',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  divider: {
    width: 1,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginHorizontal: 4,
  },
});

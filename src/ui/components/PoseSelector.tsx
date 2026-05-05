import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { POSE_LIBRARY } from '../../library/poseLibrary';
import { recommend } from '../../recommendation/recommend';
import { usePoseTarget } from '../../state/poseTarget';
import { useRecommendationSession } from '../../state/recommendationSession';
import { useUserProfile } from '../../state/userProfile';
import type { PoseCategory, PoseTarget } from '../../types/pose';

const CATEGORY_GLYPH: Record<PoseCategory, string> = {
  standing: '⏐',
  sitting: '◧',
  fitness: '✦',
  lifestyle: '◐',
};

const RECOMMENDATION_LIMIT = 3;

export function PoseSelector(): React.JSX.Element {
  const selected = usePoseTarget((s) => s.selected);
  const selectTarget = usePoseTarget((s) => s.selectTarget);
  const profile = useUserProfile((s) => s.profile);
  const shownPoseIds = useRecommendationSession((s) => s.shownPoseIds);
  const markShown = useRecommendationSession((s) => s.markShown);

  const { recommendedPoses, otherPoses } = useMemo(() => {
    const result = recommend({ profile, shownPoseIds, limit: RECOMMENDATION_LIMIT });
    const recIds = new Set(result.recommendations.map((r) => r.pose.id));
    const recOrdered = result.recommendations.map((r) => r.pose);
    const others = POSE_LIBRARY.filter((p) => !recIds.has(p.id));
    return { recommendedPoses: recOrdered, otherPoses: others };
  }, [profile, shownPoseIds]);

  const handlePress = (pose: PoseTarget): void => {
    selectTarget(pose);
    markShown(pose.id);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ClearCard active={selected === null} onPress={() => selectTarget(null)} />
        {recommendedPoses.length > 0 && (
          <>
            <View style={styles.forYouLabelWrap}>
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
      <Text style={styles.glyph}>{CATEGORY_GLYPH[pose.category]}</Text>
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
  glyph: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 26,
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
  forYouLabelWrap: {
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  forYouLabel: {
    color: '#FACC15',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginHorizontal: 4,
  },
});

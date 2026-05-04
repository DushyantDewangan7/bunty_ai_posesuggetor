import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useUserProfile } from '../../../state/userProfile';
import type { HeightBucket } from '../../../types/userProfile';
import { COLORS, RADII, SPACING } from './theme';

interface Props {
  onAdvance: () => void;
}

interface Option {
  value: HeightBucket;
  label: string;
  hint: string;
}

const OPTIONS: Option[] = [
  { value: 'short', label: 'Short', hint: 'under 5’4" / 162 cm' },
  { value: 'medium', label: 'Medium', hint: '5’4" – 5’10" / 162–178 cm' },
  { value: 'tall', label: 'Tall', hint: 'over 5’10" / 178 cm' },
];

export function HeightScreen({ onAdvance }: Props): React.JSX.Element {
  const setHeightBucket = useUserProfile((s) => s.setHeightBucket);
  const current = useUserProfile((s) => s.profile.heightBucket);

  const handleSelect = (h: HeightBucket): void => {
    setHeightBucket(h);
    onAdvance();
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.step}>2 of 3</Text>
        <Text style={styles.title}>How tall are you?</Text>
        <Text style={styles.subtitle}>Adjusts framing suggestions for full-body shots.</Text>
      </View>
      <View style={styles.options}>
        {OPTIONS.map((opt) => {
          const active = current === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => handleSelect(opt.value)}
              style={({ pressed }) => [
                styles.card,
                active && styles.cardActive,
                pressed && styles.cardPressed,
              ]}
            >
              <Text style={[styles.cardLabel, active && styles.cardLabelActive]}>{opt.label}</Text>
              <Text style={styles.cardHint}>{opt.hint}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
  },
  header: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
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
    fontSize: 26,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  options: {
    flex: 1,
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardActive: {
    borderColor: COLORS.borderActive,
    backgroundColor: COLORS.surfaceActive,
  },
  cardPressed: {
    backgroundColor: COLORS.surfaceActive,
  },
  cardLabel: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  cardLabelActive: {
    color: COLORS.accent,
  },
  cardHint: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
});

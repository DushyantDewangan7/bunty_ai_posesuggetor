import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUserProfile } from '../../../state/userProfile';
import type { Gender } from '../../../types/userProfile';
import { COLORS, RADII, SPACING } from './theme';

interface Props {
  onAdvance: () => void;
}

interface Option {
  value: Gender;
  label: string;
}

const OPTIONS: Option[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export function GenderScreen({ onAdvance }: Props): React.JSX.Element {
  const setGender = useUserProfile((s) => s.setGender);
  const current = useUserProfile((s) => s.profile.gender);

  const handleSelect = (g: Gender): void => {
    setGender(g);
    onAdvance();
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.step}>1 of 3</Text>
        <Text style={styles.title}>How do you identify?</Text>
        <Text style={styles.subtitle}>Helps us suggest poses that flatter you.</Text>
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
  },
  cardLabelActive: {
    color: COLORS.accent,
  },
});

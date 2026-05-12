import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUserProfile } from '../../../state/userProfile';
import type { FaceShape, Gender, HeightBucket } from '../../../types/userProfile';
import { COLORS, RADII, SPACING } from './theme';

interface Props {
  onContinue: () => void;
}

const FACE_LABEL: Record<FaceShape, string> = {
  oval: 'Oval',
  round: 'Round',
  square: 'Square',
  heart: 'Heart',
  diamond: 'Diamond',
  unknown: 'Not detected',
};

const GENDER_LABEL: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  non_binary: 'Non-binary',
  prefer_not_to_say: 'Not specified',
};

const HEIGHT_LABEL: Record<HeightBucket, string> = {
  short: 'Short',
  medium: 'Medium',
  tall: 'Tall',
};

export function CompletionScreen({ onContinue }: Props): React.JSX.Element {
  const profile = useUserProfile((s) => s.profile);
  const completeOnboarding = useUserProfile((s) => s.completeOnboarding);

  const handleContinue = (): void => {
    completeOnboarding();
    onContinue();
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.celebrate}>You&apos;re set.</Text>
        <Text style={styles.body}>
          Setup complete. We&apos;ll use this profile to suggest poses tailored to you.
        </Text>
        <View style={styles.summary}>
          <Row label="Identity" value={profile.gender ? GENDER_LABEL[profile.gender] : '—'} />
          <Row
            label="Height"
            value={profile.heightBucket ? HEIGHT_LABEL[profile.heightBucket] : '—'}
          />
          <Row label="Face shape" value={FACE_LABEL[profile.faceShape]} />
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        onPress={handleContinue}
      >
        <Text style={styles.ctaLabel}>Continue</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  celebrate: {
    color: COLORS.accent,
    fontSize: 36,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  body: {
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  summary: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  rowLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  rowValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
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
  ctaLabel: {
    color: COLORS.accentText,
    fontSize: 17,
    fontWeight: '700',
  },
});

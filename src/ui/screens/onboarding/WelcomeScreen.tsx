import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS, RADII, SPACING } from './theme';

interface Props {
  onStart: () => void;
}

export function WelcomeScreen({ onStart }: Props): React.JSX.Element {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.brand}>Pose</Text>
        <Text style={styles.tagline}>AI-suggested poses, tailored to you.</Text>
        <Text style={styles.body}>Let&apos;s set you up — takes 30 seconds.</Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        onPress={onStart}
      >
        <Text style={styles.ctaLabel}>Get Started</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  brand: {
    color: COLORS.accent,
    fontSize: 56,
    fontWeight: '700',
    marginBottom: SPACING.lg,
  },
  tagline: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  body: {
    color: COLORS.textMuted,
    fontSize: 16,
    lineHeight: 24,
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

import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAiModeStore } from '../../state/aiMode';
import { useCustomPoses } from '../../state/customPoses';
import { useUserProfile } from '../../state/userProfile';
import type { FaceShape, Gender, HeightBucket } from '../../types/userProfile';

interface Props {
  visible: boolean;
  onClose: () => void;
  onRequestRecapture: () => void;
}

interface GenderOption {
  value: Gender;
  label: string;
}

const GENDER_OPTIONS: GenderOption[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

interface HeightOption {
  value: HeightBucket;
  label: string;
  hint: string;
}

const HEIGHT_OPTIONS: HeightOption[] = [
  { value: 'short', label: 'Short', hint: 'under 5’4"' },
  { value: 'medium', label: 'Medium', hint: '5’4"–5’10"' },
  { value: 'tall', label: 'Tall', hint: 'over 5’10"' },
];

const FACE_SHAPE_LABELS: Record<FaceShape, string> = {
  oval: 'Oval',
  round: 'Round',
  square: 'Square',
  heart: 'Heart',
  diamond: 'Diamond',
  unknown: 'Not detected',
};

export function SettingsModal({ visible, onClose, onRequestRecapture }: Props): React.JSX.Element {
  const profile = useUserProfile((s) => s.profile);
  const setGender = useUserProfile((s) => s.setGender);
  const setHeightBucket = useUserProfile((s) => s.setHeightBucket);
  const aiMode = useAiModeStore((s) => s.aiMode);
  const setAiMode = useAiModeStore((s) => s.setAiMode);

  const handleRedoOnboarding = (): void => {
    Alert.alert(
      'Re-do onboarding?',
      'This will take you back to the welcome screen. Your saved poses will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-do',
          style: 'destructive',
          onPress: () => {
            useUserProfile.getState().reset();
          },
        },
      ],
    );
  };

  const handleClearPoses = (): void => {
    Alert.alert(
      'Clear all my poses?',
      'This permanently deletes every pose you have captured. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            useCustomPoses.getState().reset();
          },
        },
      ],
    );
  };

  const handleRecaptureFace = (): void => {
    onRequestRecapture();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>Settings</Text>
              <Pressable onPress={onClose}>
                <Text style={styles.closeText}>Done</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>AI features</Text>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextWrap}>
                    <Text style={styles.toggleLabel}>AI-Enhanced Mode</Text>
                    <Text style={styles.toggleDescription}>
                      Use cloud AI for smarter pose recommendations. Sends camera frames to Google
                      Gemini. Off by default.
                    </Text>
                  </View>
                  <Switch
                    value={aiMode}
                    onValueChange={setAiMode}
                    trackColor={{ false: BORDER, true: ACCENT }}
                    thumbColor={aiMode ? '#FFFFFF' : '#CCCCCC'}
                  />
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Gender</Text>
                <View style={styles.genderGrid}>
                  {GENDER_OPTIONS.map((opt) => {
                    const active = profile.gender === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setGender(opt.value)}
                        style={({ pressed }) => [
                          styles.gridCard,
                          active && styles.cardActive,
                          pressed && styles.cardPressed,
                        ]}
                      >
                        <Text style={[styles.cardLabel, active && styles.cardLabelActive]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Height</Text>
                <View style={styles.heightRow}>
                  {HEIGHT_OPTIONS.map((opt) => {
                    const active = profile.heightBucket === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setHeightBucket(opt.value)}
                        style={({ pressed }) => [
                          styles.heightCard,
                          active && styles.cardActive,
                          pressed && styles.cardPressed,
                        ]}
                      >
                        <Text style={[styles.cardLabel, active && styles.cardLabelActive]}>
                          {opt.label}
                        </Text>
                        <Text style={styles.cardHint}>{opt.hint}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Face shape</Text>
                <View style={styles.readonlyBox}>
                  <Text style={styles.readonlyValue}>{FACE_SHAPE_LABELS[profile.faceShape]}</Text>
                </View>
                <Text style={styles.sectionHint}>Detected from your photo during onboarding</Text>
                <Pressable
                  onPress={handleRecaptureFace}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.secondaryButtonLabel}>Re-capture face</Text>
                </Pressable>
              </View>

              <View style={styles.dangerSection}>
                <Text style={styles.dangerSectionTitle}>Profile actions</Text>
                <Pressable
                  onPress={handleRedoOnboarding}
                  style={({ pressed }) => [styles.dangerButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.dangerButtonLabel}>Re-do onboarding</Text>
                </Pressable>
                <Pressable
                  onPress={handleClearPoses}
                  style={({ pressed }) => [styles.dangerButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.dangerButtonLabel}>Clear all my poses</Text>
                </Pressable>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const ACCENT = '#1AC8AA';
const SURFACE = '#242424';
const SURFACE_ACTIVE = '#2E2E2E';
const BORDER = '#3A3A3A';
const TEXT = '#F5F5F0';
const TEXT_MUTED = '#9A9A92';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '60%',
  },
  safeArea: {
    flex: 1,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    color: TEXT,
    fontSize: 20,
    fontWeight: '600',
  },
  closeText: {
    color: ACCENT,
    fontSize: 16,
    fontWeight: '500',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  sectionHint: {
    color: TEXT_MUTED,
    fontSize: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleLabel: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  toggleDescription: {
    color: TEXT_MUTED,
    fontSize: 12,
    lineHeight: 16,
  },
  genderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: '48%',
    backgroundColor: SURFACE,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  heightRow: {
    flexDirection: 'row',
    gap: 10,
  },
  heightCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActive: {
    borderColor: ACCENT,
    backgroundColor: SURFACE_ACTIVE,
  },
  cardPressed: {
    backgroundColor: SURFACE_ACTIVE,
  },
  cardLabel: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardLabelActive: {
    color: ACCENT,
  },
  cardHint: {
    color: TEXT_MUTED,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  readonlyBox: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  readonlyValue: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '500',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  dangerSection: {
    marginTop: 12,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    gap: 10,
  },
  dangerSectionTitle: {
    color: TEXT_MUTED,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dangerButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#5A2A2A',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonLabel: {
    color: '#E07A7A',
    fontSize: 15,
    fontWeight: '500',
  },
});

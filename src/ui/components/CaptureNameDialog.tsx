import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useCustomPoses } from '../../state/customPoses';
import type { CapturedPose } from '../../types/customPose';
import type { PoseLandmark } from '../../types/landmarks';
import type { PoseCategory } from '../../types/pose';

const CAPTURE_CATEGORIES: PoseCategory[] = ['standing', 'sitting', 'fitness'];
const DIFFICULTIES: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

interface Props {
  imageLandmarks: PoseLandmark[];
  normalizedLandmarks: PoseLandmark[];
  onClose: () => void;
}

export function CaptureNameDialog({
  imageLandmarks,
  normalizedLandmarks,
  onClose,
}: Props): React.JSX.Element {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PoseCategory | null>(null);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5 | null>(null);

  const trimmed = name.trim();
  const canSave = trimmed.length >= 2 && category !== null && difficulty !== null;

  const handleSave = (): void => {
    if (!canSave || category === null || difficulty === null) return;
    const id = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const capture: CapturedPose = {
      id,
      name: trimmed,
      category,
      difficulty,
      imageLandmarks,
      referenceLandmarks: normalizedLandmarks,
      capturedAt: new Date().toISOString(),
      version: 1,
    };
    useCustomPoses.getState().add(capture);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kbWrap}
        >
          <View style={styles.card}>
            <Text style={styles.title}>📌 Save Pose</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. My T-pose"
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.input}
              autoFocus
              maxLength={40}
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.row}>
              {CAPTURE_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.chip, category === c && styles.chipActive]}
                >
                  <Text style={styles.chipLabel}>{c[0]!.toUpperCase() + c.slice(1)}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.row}>
              {DIFFICULTIES.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDifficulty(d)}
                  style={[styles.starChip, difficulty === d && styles.chipActive]}
                >
                  <Text style={styles.chipLabel}>{d}★</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actions}>
              <Pressable onPress={onClose} style={[styles.actionBtn, styles.cancelBtn]}>
                <Text style={styles.actionLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={!canSave}
                style={[styles.actionBtn, styles.saveBtn, !canSave && styles.actionBtnDisabled]}
              >
                <Text style={styles.actionLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kbWrap: {
    width: '100%',
    alignItems: 'center',
  },
  card: {
    width: '88%',
    maxWidth: 380,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  label: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  starChip: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  chipActive: {
    borderColor: '#FF6B35',
    backgroundColor: 'rgba(255, 107, 53, 0.18)',
  },
  chipLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  saveBtn: {
    backgroundColor: '#FF6B35',
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

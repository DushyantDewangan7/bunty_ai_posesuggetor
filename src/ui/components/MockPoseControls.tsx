import { Pressable, StyleSheet, Text, View } from 'react-native';

import { clearMockPose, injectMockPose } from '../../state/__mock__/mockPose';

export function MockPoseControls(): React.JSX.Element {
  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable style={styles.button} onPress={injectMockPose}>
        <Text style={styles.label}>Inject T-Pose</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={clearMockPose}>
        <Text style={styles.label}>Clear</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 230,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  button: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

import { Pressable, StyleSheet, Text } from 'react-native';

interface Props {
  onPress: () => void;
  style?: any;
}

export function SettingsButton({ onPress, style }: Props): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.button, style]}>
      <Text style={styles.icon}>⚙️</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  icon: {
    fontSize: 20,
  },
});

import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { POSE_LIBRARY } from '../../library/poseLibrary';
import { usePoseLibraryStore } from '../../state/poseLibrary';
import { useNavigate } from '../../state/screen';
import { getPoseImage } from '../components/poseImageAssetMap';

export function MarketplaceScreen(): React.JSX.Element {
  const activePoseIds = usePoseLibraryStore((s) => s.activePoseIds);
  const togglePose = usePoseLibraryStore((s) => s.togglePose);
  const navigate = useNavigate();

  const totalCount = POSE_LIBRARY.length;
  const activeCount = activePoseIds.size;
  const minimumReached = activeCount <= 1;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigate('camera')}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back to camera"
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Marketplace</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {POSE_LIBRARY.map((pose) => {
          const isActive = activePoseIds.has(pose.id);
          const image = getPoseImage(pose.id);
          const tryingToRemoveLast = isActive && minimumReached;
          return (
            <View key={pose.id} style={styles.row}>
              {image !== undefined ? (
                <Image source={image} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={styles.thumb} />
              )}
              <View style={styles.textWrap}>
                <Text style={styles.poseName} numberOfLines={1}>
                  {pose.name}
                </Text>
                <Text style={styles.poseDesc} numberOfLines={2}>
                  {pose.description ?? pose.name}
                </Text>
                {tryingToRemoveLast && (
                  <Text style={styles.minimumHint}>At least 1 pose required</Text>
                )}
              </View>
              <Pressable
                onPress={() => togglePose(pose.id)}
                style={({ pressed }) => [
                  styles.pill,
                  isActive ? styles.pillActive : styles.pillInactive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  isActive ? `Remove ${pose.name} from carousel` : `Add ${pose.name} to carousel`
                }
              >
                <Text style={isActive ? styles.pillActiveLabel : styles.pillInactiveLabel}>
                  {isActive ? '✓ In your carousel' : '+ Add to carousel'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {activeCount} of {totalCount} poses in your carousel
        </Text>
      </View>
    </SafeAreaView>
  );
}

const BG = '#0F0F12';
const SURFACE = '#1C1C20';
const SURFACE_ACTIVE = '#27272E';
const BORDER = '#2F2F36';
const TEXT = '#F5F5F0';
const TEXT_MUTED = '#9A9A92';
const ACCENT_PURPLE = '#9333EA';
const ACCENT_PURPLE_BG = 'rgba(147, 51, 234, 0.16)';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: TEXT,
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 30,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: TEXT,
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    gap: 12,
  },
  thumb: {
    width: 80,
    height: 100,
    borderRadius: 10,
    backgroundColor: '#2A2A2A',
  },
  textWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  poseName: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  poseDesc: {
    color: TEXT_MUTED,
    fontSize: 12,
    lineHeight: 16,
  },
  minimumHint: {
    color: '#E0A77A',
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 130,
  },
  pillActive: {
    backgroundColor: SURFACE_ACTIVE,
    borderColor: BORDER,
  },
  pillInactive: {
    backgroundColor: ACCENT_PURPLE_BG,
    borderColor: ACCENT_PURPLE,
  },
  pillActiveLabel: {
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  pillInactiveLabel: {
    color: '#C4B5FD',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    alignItems: 'center',
  },
  footerText: {
    color: TEXT_MUTED,
    fontSize: 12,
    fontWeight: '500',
  },
});

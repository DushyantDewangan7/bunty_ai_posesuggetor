import { useCallback, useRef } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { validateForCapture } from '../../ml/poseValidation';
import { usePoseStream } from '../../state/poseStream';
import { useCustomPoses } from '../../state/customPoses';

import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import type { CameraPhotoOutput } from 'react-native-vision-camera';

const STALE_FRAME_MS = 500;

interface Props {
  photoOutput: CameraPhotoOutput | null;
  onFlipCamera?: () => void;
}

export function CaptureButton({
  photoOutput,
  onFlipCamera,
}: Props): React.JSX.Element {
  const latestFrame = usePoseStream((s) => s.latestFrame);
  const latestNormalized = usePoseStream((s) => s.latestNormalized);

  const isCapturingRef = useRef(false);

  const handlePress = useCallback(async (): Promise<void> => {
    if (isCapturingRef.current) return;

    isCapturingRef.current = true;

    try {
      if (!photoOutput) {
        Alert.alert('Camera Error', 'Camera is not ready.');
        return;
      }

      // Snapshot pose data BEFORE async work
      const frameSnapshot = latestFrame;
      const normalizedSnapshot = latestNormalized;

      const isStale =
        !frameSnapshot ||
        Date.now() - frameSnapshot.timestamp > STALE_FRAME_MS;

      const validation = isStale
        ? null
        : validateForCapture(frameSnapshot);

      const hasValidPose =
        validation?.valid === true &&
        frameSnapshot?.landmarks != null &&
        normalizedSnapshot?.landmarks != null;

      // Capture photo
      const photo = await photoOutput.capturePhoto(
        {
          enableShutterSound: true,
        },
        {},
      );

      let tempPhotoPath: string | null = null;

      try {
        // Vision Camera temp file
        if (photo.saveToTemporaryFileAsync) {
          tempPhotoPath = await photo.saveToTemporaryFileAsync();
        } else if ((photo as any)?.path) {
          tempPhotoPath = (photo as any).path;
        }
      } finally {
        if (photo.dispose) {
          photo.dispose();
        }
      }

      if (!tempPhotoPath) {
        Alert.alert(
          'Capture Failed',
          'Could not get image path from camera output.',
        );
        return;
      }

      const formattedPhotoPath = tempPhotoPath.startsWith('file://')
        ? tempPhotoPath
        : `file://${tempPhotoPath}`;

      // Create app directory
      const dirPath = `${FileSystem.documentDirectory}ai_camera/`;

      const dirInfo = await FileSystem.getInfoAsync(dirPath);

      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirPath, {
          intermediates: true,
        });
      }

      const currentDate = new Date();

      const autoName = `Pose_${currentDate.getFullYear()}${(
        currentDate.getMonth() + 1
      )
        .toString()
        .padStart(2, '0')}${currentDate
          .getDate()
          .toString()
          .padStart(2, '0')}_${currentDate
            .getHours()
            .toString()
            .padStart(2, '0')}${currentDate
              .getMinutes()
              .toString()
              .padStart(2, '0')}${currentDate
                .getSeconds()
                .toString()
                .padStart(2, '0')}`;

      // Permanent local image path
      const localImagePath = `${dirPath}${autoName}.jpg`;

      // Copy image into app storage
      await FileSystem.copyAsync({
        from: formattedPhotoPath,
        to: localImagePath,
      });

      // Create pose metadata
      const capture = {
        id: `capture-${Date.now()}`,
        name: autoName,
        category: 'standing' as const,
        difficulty: 1 as const,

        imagePath: localImagePath,

        hasPose: hasValidPose,

        imageLandmarks: frameSnapshot?.landmarks ?? [],
        referenceLandmarks: normalizedSnapshot?.landmarks ?? [],

        capturedAt: currentDate.toISOString(),

        version: 1 as const,
      };

      // Save in Zustand
      useCustomPoses.getState().add(capture);

      // Log the captured object to the console for debugging
      console.log('Captured Picture Details:', JSON.stringify(capture, null, 2));

      // Save JSON metadata
      const jsonPath = `${dirPath}${autoName}.json`;

      await FileSystem.writeAsStringAsync(
        jsonPath,
        JSON.stringify(capture, null, 2),
      );

      // Request gallery permissions
      const permission =
        await MediaLibrary.requestPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Gallery permission is required to save images.',
        );
        return;
      }

      // Save to gallery
      const asset = await MediaLibrary.createAssetAsync(
        localImagePath,
      );

      const albumName = 'AI Camera';

      const existingAlbum =
        await MediaLibrary.getAlbumAsync(albumName);

      if (existingAlbum == null) {
        await MediaLibrary.createAlbumAsync(
          albumName,
          asset,
          false,
        );
      } else {
        await MediaLibrary.addAssetsToAlbumAsync(
          [asset],
          existingAlbum,
          false,
        );
      }

      Alert.alert(
        'Saved',
        `Photo saved successfully.\n\n${autoName}.jpg`,
      );
    } catch (err) {
      console.error('Capture error:', err);

      Alert.alert(
        'Capture Error',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      isCapturingRef.current = false;
    }
  }, [photoOutput, latestFrame, latestNormalized]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TouchableOpacity
        onPress={() => alert('Gallery view coming soon!')}
        style={styles.sideButton}
        activeOpacity={0.7}
      >
        <Text style={styles.sideIcon}>🖼️</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handlePress}
        style={styles.button}
        activeOpacity={0.8}
      />

      <TouchableOpacity
        onPress={onFlipCamera}
        style={styles.sideButton}
        activeOpacity={0.7}
      >
        <Text style={styles.sideIcon}>↻</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    gap: 48,
  },

  button: {
    width: 72,
    height: 72,
    borderRadius: 36,

    backgroundColor: '#FFFFFF',

    borderWidth: 4,
    borderColor: '#DADADA',
  },

  sideButton: {
    width: 48,
    height: 48,
    borderRadius: 24,

    backgroundColor: 'rgba(0,0,0,0.5)',

    alignItems: 'center',
    justifyContent: 'center',
  },

  sideIcon: {
    color: '#FFFFFF',
    fontSize: 22,
  },
});
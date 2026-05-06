import type { UserProfile } from './userProfile';
import type {
  RichPoseCategory,
  GenderOrientation,
  MoodTag,
  UseCase,
  LightingRecommendation,
  LocationType,
} from './poseMetadata';

/**
 * Slim projection of RichPose passed into the Gemini prompt. Drops fields the
 * model does not need (referenceLandmarks, bodyTypeHints, groupSize,
 * recommendedClothing, imageAttribution, description) to keep the input token
 * count down. The model can infer pose semantics from name + tags + category
 * without the verbose description field.
 */
export interface PoseMetadataForAgent {
  id: string;
  name: string;
  category: RichPoseCategory;
  tags: string[];
  difficulty: number;
  genderOrientation: GenderOrientation;
  moodTags: MoodTag[];
  useCase: UseCase[];
  lightingRecommendation: LightingRecommendation;
  locationType: LocationType;
}

export interface SmartSuggestionRequest {
  /** JPEG-encoded current camera frame, base64 string (no data URL prefix). */
  frameBase64: string;
  profile: UserProfile;
  libraryMetadata: PoseMetadataForAgent[];
  /** Pose IDs the user has already seen this session — deprioritise. */
  shownPoseIds: string[];
}

export interface SmartSuggestionPick {
  poseId: string;
  reasoning: string;
  rank: number;
}

export interface SmartSuggestionResult {
  recommendations: SmartSuggestionPick[];
  sceneDescription?: string;
  fromCache: boolean;
  /** ISO-8601 timestamp of when the result was produced. */
  timestamp: string;
}

export type SmartSuggestionError =
  | { type: 'no-internet' }
  | { type: 'rate-limit'; resetAt?: string }
  | { type: 'api-error'; status: number; message: string }
  | { type: 'timeout' }
  | { type: 'parse-error'; message: string }
  | { type: 'no-valid-picks' };

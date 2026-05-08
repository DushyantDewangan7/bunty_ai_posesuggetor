import { Skia, type SkPath } from '@shopify/react-native-skia';

import {
  computeBodyOutlineGeometry,
  type BodyOutlineConfig,
  type BodyPart,
  type OutlinePoint,
} from './bodyOutlineGeometry';

/**
 * Skia adapter on top of the pure body-outline geometry. Renderers call this
 * to get drawable SkPath[] for fills + strokes. The pure geometry lives in
 * ./bodyOutlineGeometry so unit tests can import it without loading Skia
 * native code.
 */

export type { BodyOutlineConfig, OutlinePoint };

export interface BodyOutlineResult {
  paths: SkPath[];
  /**
   * False iff a coherent silhouette could not be built (typically: shoulders
   * or hips below visibility threshold). Caller should fall back to skeleton
   * lines or skip rendering, depending on context.
   */
  valid: boolean;
}

export function computeBodyOutlinePaths(
  points: readonly OutlinePoint[],
  config: BodyOutlineConfig = {},
): BodyOutlineResult {
  const geom = computeBodyOutlineGeometry(points, config);
  return {
    valid: geom.valid,
    paths: geom.parts.map(partToSkPath),
  };
}

function partToSkPath(part: BodyPart): SkPath {
  const path = Skia.Path.Make();
  switch (part.kind) {
    case 'torso':
    case 'limb': {
      const verts = part.vertices;
      const first = verts[0];
      if (!first) return path;
      path.moveTo(first.x, first.y);
      for (let i = 1; i < verts.length; i++) {
        const v = verts[i];
        if (v) path.lineTo(v.x, v.y);
      }
      path.close();
      return path;
    }
    case 'head': {
      path.addOval(Skia.XYWHRect(part.cx - part.rx, part.cy - part.ry, part.rx * 2, part.ry * 2));
      return path;
    }
    case 'circle': {
      path.addCircle(part.cx, part.cy, part.r);
      return path;
    }
  }
}

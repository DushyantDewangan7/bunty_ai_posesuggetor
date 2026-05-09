import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { poseOutlineAssets } from './poseOutlineAssetMap';

declare const __DEV__: boolean | undefined;

const VIEWBOX_SIZE = 1000;

interface PathAttrs {
  d: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  strokeDasharray?: number[];
  strokeLinecap?: 'round' | 'butt' | 'square';
  strokeLinejoin?: 'round' | 'bevel' | 'miter';
}

function parseDashArray(s: string): number[] | undefined {
  const parts = s
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(parseFloat);
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts;
}

const ATTR_REGEXES = {
  pathTag: /<path\s[^>]*\/?>/i,
  d: /\sd="([^"]+)"/i,
  stroke: /\sstroke="([^"]+)"/i,
  fill: /\sfill="([^"]+)"/i,
  strokeWidth: /\sstroke-width="([^"]+)"/i,
  strokeDasharray: /\sstroke-dasharray="([^"]+)"/i,
  strokeLinecap: /\sstroke-linecap="([^"]+)"/i,
  strokeLinejoin: /\sstroke-linejoin="([^"]+)"/i,
};

function parsePathAttrs(svgText: string): PathAttrs | null {
  const tag = svgText.match(ATTR_REGEXES.pathTag)?.[0];
  if (!tag) return null;
  const d = tag.match(ATTR_REGEXES.d)?.[1];
  if (!d) return null;
  const out: PathAttrs = { d };
  const stroke = tag.match(ATTR_REGEXES.stroke)?.[1];
  if (stroke) out.stroke = stroke;
  const fill = tag.match(ATTR_REGEXES.fill)?.[1];
  if (fill) out.fill = fill;
  const sw = tag.match(ATTR_REGEXES.strokeWidth)?.[1];
  if (sw && Number.isFinite(parseFloat(sw))) out.strokeWidth = parseFloat(sw);
  const da = tag.match(ATTR_REGEXES.strokeDasharray)?.[1];
  if (da) {
    const parsed = parseDashArray(da);
    if (parsed) out.strokeDasharray = parsed;
  }
  const lc = tag.match(ATTR_REGEXES.strokeLinecap)?.[1];
  if (lc === 'round' || lc === 'butt' || lc === 'square') out.strokeLinecap = lc;
  const lj = tag.match(ATTR_REGEXES.strokeLinejoin)?.[1];
  if (lj === 'round' || lj === 'bevel' || lj === 'miter') out.strokeLinejoin = lj;
  return out;
}

export interface PoseOutlineSvgProps {
  /** Filename in assets/poseOutlines/, e.g. 'casual-standing-01_outline.svg'. */
  outlineAsset: string;
  /**
   * Optional stroke color override. When undefined (default), the renderer
   * uses the stroke baked into the SVG asset. Prompt C will use this prop
   * to drive the white→green match-color transition.
   */
  color?: string;
  /** Optional opacity 0–1 (multiplied with the SVG's own opacity if any). */
  opacity?: number;
  /** Render width in screen px. */
  width: number;
  /** Render height in screen px. */
  height: number;
}

/**
 * Renders a pose outline SVG asset baked offline by
 * `scripts/generate-pose-outline.mjs`. The SVG is loaded as a Metro static
 * asset, fetched once via its resolved URI, parsed for the `<path>`
 * attributes, and re-rendered as a fresh `<Svg>/<Path>` tree so the runtime
 * can swap the stroke color/opacity at runtime (Prompt C will use this for
 * the white→green match-color transition).
 *
 * Per ADR-001 G28, the SVG itself is the source of truth for stroke
 * appearance (white, dotted, width 6, rounded caps/joins). The renderer
 * passes those attributes through verbatim and only overrides what the
 * caller explicitly supplies via `color`/`opacity`.
 */
export function PoseOutlineSvg({
  outlineAsset,
  color,
  opacity,
  width,
  height,
}: PoseOutlineSvgProps): React.JSX.Element | null {
  const moduleId = poseOutlineAssets[outlineAsset];
  const [pathAttrs, setPathAttrs] = useState<PathAttrs | null>(null);

  useEffect(() => {
    if (moduleId === undefined) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(
          `[PoseOutlineSvg] No bundled asset registered for "${outlineAsset}". ` +
            `Add it to src/ui/overlays/poseOutlineAssetMap.ts.`,
        );
      }
      return;
    }
    const src = Image.resolveAssetSource(moduleId);
    if (!src?.uri) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[PoseOutlineSvg] resolveAssetSource returned no uri for "${outlineAsset}".`);
      }
      return;
    }

    let cancelled = false;
    fetch(src.uri)
      .then((r) => r.text())
      .then((svgText) => {
        if (cancelled) return;
        const attrs = parsePathAttrs(svgText);
        if (!attrs) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn(`[PoseOutlineSvg] Could not parse <path d="..."> from "${outlineAsset}".`);
          }
          return;
        }
        setPathAttrs(attrs);
      })
      .catch((err) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn(`[PoseOutlineSvg] Failed to load "${outlineAsset}":`, err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId, outlineAsset]);

  if (!pathAttrs) return null;

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <Path
        d={pathAttrs.d}
        stroke={color ?? pathAttrs.stroke ?? '#FFFFFF'}
        fill={pathAttrs.fill ?? 'none'}
        strokeWidth={pathAttrs.strokeWidth ?? 4}
        strokeDasharray={pathAttrs.strokeDasharray ?? []}
        strokeLinecap={pathAttrs.strokeLinecap ?? 'round'}
        strokeLinejoin={pathAttrs.strokeLinejoin ?? 'round'}
        opacity={opacity ?? 1}
      />
    </Svg>
  );
}

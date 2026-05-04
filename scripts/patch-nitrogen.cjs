#!/usr/bin/env node
// Post-nitrogen patch for ADR-001 G14.
//
// nitrogen 0.35.6 has a codegen bug for Outputs that extend
// `CameraOutput` from a *different* C++ namespace than vision-camera's own
// `margelo::nitro::camera`. The generated JNI spec under
// `nitrogen/generated/android/c++/JHybrid<Output>Spec.{hpp,cpp}` references
// `MediaType` and `CameraOrientation` unqualified, and includes
// `"MediaType.hpp"` instead of `<VisionCamera/MediaType.hpp>` — which only
// resolves when the spec lives in the camera namespace. Vision-camera's own
// HybridCameraObjectOutputSpec works because it's in that namespace; ours is
// in `margelo::nitro::aiposesuggestor::poseplugin`, so the C++ build fails.
//
// This script is idempotent. It is wired into `npm run nitrogen` after
// `nitrogen` itself, so re-generation stays correct.

const fs = require('fs');
const path = require('path');

const GENERATED_ROOT = path.resolve(__dirname, '..', 'nitrogen', 'generated', 'android', 'c++');

const TYPES = ['MediaType', 'CameraOrientation', 'JMediaType', 'JCameraOrientation'];
const QUALIFIED = (t) => `margelo::nitro::camera::${t}`;

function qualifyToken(line, token) {
  const re = new RegExp(`(?<![:A-Za-z_])${token}(?![A-Za-z_])`, 'g');
  return line.replace(re, QUALIFIED(token));
}

function processFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/MediaType|CameraOrientation/.test(src)) return false;

  const lines = src.split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Rewrite local "MediaType.hpp" / "JMediaType.hpp" / etc. include forms
    // into the prefab-namespaced form in one shot.
    line = line.replace(/#include "MediaType\.hpp"/, '#include <VisionCamera/MediaType.hpp>');
    line = line.replace(/#include "JMediaType\.hpp"/, '#include <VisionCamera/JMediaType.hpp>');
    line = line.replace(
      /#include "CameraOrientation\.hpp"/,
      '#include <VisionCamera/CameraOrientation.hpp>',
    );
    line = line.replace(
      /#include "JCameraOrientation\.hpp"/,
      '#include <VisionCamera/JCameraOrientation.hpp>',
    );

    // Rewrite forward declarations from the local plugin namespace into the
    // real camera namespace. The codegen always emits these with the local
    // plugin namespace; we don't know the plugin name in advance, so match
    // any `margelo::nitro::<anything>` that wraps a `MediaType`/
    // `CameraOrientation` enum forward decl.
    line = line.replace(
      /namespace margelo::nitro::[A-Za-z_:]+ \{ enum class (MediaType|CameraOrientation); \}/g,
      'namespace margelo::nitro::camera { enum class $1; }',
    );

    // Skip qualification on lines we should leave alone:
    //   - include directives (paths must stay literal)
    //   - comments (descriptive text, often contains the type name in backticks)
    //   - forward-decl lines (already handled above with the precise regex)
    const trimmed = line.trimStart();
    const isInclude = trimmed.startsWith('#include');
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
    const isForwardDecl =
      trimmed.startsWith('namespace margelo::nitro::') && /enum class \w+; \}/.test(trimmed);

    if (!isInclude && !isComment && !isForwardDecl) {
      for (const t of TYPES) {
        line = qualifyToken(line, t);
      }
      // Collapse double-qualified forms in case this script ran on its own
      // output.
      line = line.replace(
        /margelo::nitro::camera::margelo::nitro::camera::/g,
        'margelo::nitro::camera::',
      );
    }

    out.push(line);
  }

  let result = out.join('\n');

  // Ensure the .hpp pulls in MediaType.hpp / CameraOrientation.hpp via prefab
  // — required for the now-qualified `margelo::nitro::camera::MediaType`
  // type to resolve in the property declarations.
  if (file.endsWith('.hpp')) {
    const sentinel = '#include <VisionCamera/JHybridCameraOutputSpec.hpp>';
    const needsMedia =
      /margelo::nitro::camera::MediaType\b/.test(result) &&
      !result.includes('#include <VisionCamera/MediaType.hpp>');
    const needsOri =
      /margelo::nitro::camera::CameraOrientation\b/.test(result) &&
      !result.includes('#include <VisionCamera/CameraOrientation.hpp>');
    if ((needsMedia || needsOri) && result.includes(sentinel)) {
      const adds = [];
      if (needsMedia) adds.push('#include <VisionCamera/MediaType.hpp>');
      if (needsOri) adds.push('#include <VisionCamera/CameraOrientation.hpp>');
      result = result.replace(sentinel, `${sentinel}\n${adds.join('\n')}`);
    }
  }

  if (result === src) return false;
  fs.writeFileSync(file, result);
  return true;
}

function findOutputSpecFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((e) => /^JHybrid.*OutputSpec\.(hpp|cpp)$/.test(e))
    .map((e) => path.join(dir, e));
}

const files = findOutputSpecFiles(GENERATED_ROOT);
let patched = 0;
for (const f of files) {
  const changed = processFile(f);
  if (changed) {
    patched++;
    console.log(`patched ${path.relative(process.cwd(), f)}`);
  }
}
console.log(`patch-nitrogen: ${patched} file(s) patched, ${files.length - patched} already clean`);

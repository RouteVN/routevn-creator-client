# Particle validation gap in the model

Written 2026-10-02, with PR #1237.

## The gap

`@routevn/creator-model` validates a particle shallowly (`validateParticleModules`
checks, for example, that `modules.emission` is an object). route-graphics
validates it strictly and throws `Input Error: …` from `render` for anything
else, which fails every render of every scene that uses the particle.

Accepted by the model, rejected by route-graphics:

- a range with `min` greater than `max` (lifetime, speed, direction, angle, scale)
- a negative `movement.maxSpeed`
- `emission.source.data.innerRadius` outside `0..radius`
- `emission.mode` that is `null` or not `continuous` / `burst`, a non-number
  `emission.rate`, `source.data = {}`, a texture selector without a `mode`
- very large `emission.rate`, `maxActive` or `burstCount` (1,000,000 or more
  hangs the webview; see `MAX_PARTICLE_COUNT` and `MAX_PARTICLE_RATE`)

In 1,200 junk-driven saves through the particle form, the model rejected none.

## Decision: leave the model as it is

Tightening the model's validator could make projects that were saved earlier
fail validation or replay, so the model is **not** changed for this. Do not
tighten it without a compatibility plan (the model's `test:compat` fixtures and
a check against real saved projects).

## What protects us instead

- **Write:** `buildParticlePayload` runs `normalizeParticleModules`, so the form
  writes valid values.
- **Render:** `createRenderableParticleData` and `createParticlePreviewState`
  run the same normalizer on a copy, so data saved earlier is repaired when it
  is rendered, without a migration. Every client path that hands particle
  modules to route-graphics goes through one of them: the scene layout builder,
  the engine resources, the particles page preview and the asset-package
  previews.

## What is not covered

`normalizeParticleModules` repairs ordering, ranges and limits. It does not fix
structural errors (a wrong type, an invalid `mode`, a missing field). Data like
that can still arrive from asset-package import or from an older version, and
it still fails the whole scene. The sanitized error message (#1236) reports
the failing property, so such a case should be visible in the next release's
error reports.

## If this is revisited

Isolate a bad particle so the rest of the scene still renders (replace that
element with an empty container and report once), and then consider a model
change with a migration or a compatibility fallback.

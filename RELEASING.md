# Releasing

This repo publishes two npm packages:

- `@effect-zero/v3`
- `@effect-zero/v4`

Keep releases on `0.x` for now. Avoid majors until the API is stable. Prefer beta prereleases for experimental `@effect-zero/v4` changes.

## Commands

```bash
pnpm release:check
pnpm release:version -- packages/effect-zero-v3 patch
pnpm release:version -- packages/effect-zero-v3 minor
pnpm release:version -- packages/effect-zero-v4 patch
pnpm release:version -- packages/effect-zero-v4 minor
pnpm release:version -- packages/effect-zero-v4 prerelease --preid beta

pnpm publish:package -- packages/effect-zero-v3
pnpm publish:package -- packages/effect-zero-v4
pnpm publish:package -- packages/effect-zero-v4 --tag beta
```

`release:version` only updates the target package version and prints the next steps. It does not commit, tag, or publish automatically.

## Recommended Flow

```bash
pnpm release:version -- packages/effect-zero-v3 patch
pnpm release:check
git add packages/effect-zero-v3/package.json
git commit -m "release(v3): cut 0.x.y"
git tag effect-zero-v3@0.x.y
pnpm publish:package -- packages/effect-zero-v3
```

For experimental v4 work:

```bash
pnpm release:version -- packages/effect-zero-v4 prerelease --preid beta
pnpm release:check
git add packages/effect-zero-v4/package.json
git commit -m "release(v4): cut 0.x.y-beta.z"
git tag effect-zero-v4@0.x.y-beta.z
pnpm publish:package -- packages/effect-zero-v4 --tag beta
```

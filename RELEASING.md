# Releasing

This repo publishes two npm packages:

- `@awstin/effect-zero-v3`
- `@awstin/effect-zero-v4`

Keep releases on `0.x` for now. Avoid majors until the API is stable. Prefer beta prereleases for experimental `@awstin/effect-zero-v4` changes.

Keep one root [CHANGELOG.md](/Users/am/Coding/2026/effect-zero/CHANGELOG.md). Do not maintain
separate changelog files inside each package directory.

For each release, add or move bullets under the package-specific section in the root changelog.

## Commands

```bash
pnpm release:check
pnpm pack:package -- packages/effect-zero-v3
pnpm pack:package -- packages/effect-zero-v4
pnpm pack:v3
pnpm pack:v4
pnpm pack:all
pnpm release:version packages/effect-zero-v3 patch
pnpm release:version packages/effect-zero-v3 minor
pnpm release:version packages/effect-zero-v4 patch
pnpm release:version packages/effect-zero-v4 minor
pnpm release:version packages/effect-zero-v4 prerelease --preid beta

pnpm publish:package -- packages/effect-zero-v3
pnpm publish:package -- packages/effect-zero-v4
pnpm publish:package -- packages/effect-zero-v4 --tag beta

pnpm publish:v3
pnpm publish:v4
pnpm publish:v4:beta
```

`release:version` only updates the target package version and prints the next steps. It does not commit, tag, or publish automatically.

`pack:*` writes tarballs to `.local-packs/` at the repo root. Use these tarballs
for local consumer-app testing before publish. The package-level `prepack`
hooks rebuild `dist/` first, so the tarball reflects the current package source
instead of whatever happened to already be in `dist/`.

## Local Tarball Flow

```bash
pnpm release:check
pnpm pack:v3

# In a consumer app:
pnpm add /Users/am/Coding/2026/effect-zero/.local-packs/<generated-v3-tarball>.tgz
```

Use `pnpm pack:all` when you want fresh tarballs for both publishable lines.

## Recommended Flow

```bash
pnpm pack:v3
pnpm release:check
pnpm release:version packages/effect-zero-v3 patch
git add packages/effect-zero-v3/package.json
git commit -m "release(v3): cut 0.x.y"
git tag effect-zero-v3@0.x.y
pnpm publish:v3
```

For experimental v4 work:

```bash
pnpm pack:v4
pnpm release:check
pnpm release:version packages/effect-zero-v4 prerelease --preid beta
git add packages/effect-zero-v4/package.json
git commit -m "release(v4): cut 0.x.y-beta.z"
git tag effect-zero-v4@0.x.y-beta.z
pnpm publish:v4:beta
```

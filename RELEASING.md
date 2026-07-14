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

Publishing is CI-owned. Do not publish from a workstation or add a long-lived npm token.
The npm package must bind trusted publishing to this public repository, the exact release
workflow, and the protected `npm-stage` environment.

For experimental v4 work:

```bash
pnpm release:check
pnpm release:version packages/effect-zero-v4 prerelease --preid beta
candidate_dir="$(mktemp -d)"
pnpm pack:v4 -- --out-dir "$candidate_dir"
pnpm release:verify-tarball -- "$candidate_dir"/*.tgz "$candidate_dir/manifest.json"
git add packages/effect-zero-v4/package.json
git commit -m "release(v4): cut 0.x.y-beta.z"
git tag effect-zero-v4@0.x.y-beta.z
git push origin main effect-zero-v4@0.x.y-beta.z
```

The protected `effect-zero-v4@0.x.y-beta.z` tag starts
`.github/workflows/release-v4.yml`. That workflow builds and tests once, packs once, records
the file manifest and digests, and submits those exact bytes with `npm stage publish`.

Before npm stage approval, download the workflow artifact and prove the same bytes in
Valterra:

```bash
gh run download <run-id> --name effect-zero-v4-<release-sha> --dir <candidate-dir>
node tools/verify-package-tarball.mjs \
  <candidate-dir>/awstin-effect-zero-v4-0.x.y-beta.z.tgz \
  <candidate-dir>/verified-manifest.json
diff -u <candidate-dir>/manifest.json <candidate-dir>/verified-manifest.json
```

Install that tarball in Valterra's temporary candidate slice, then run the Zero workspace
doctor, workspace/CRM typechecks, focused provider/handler tests, and authenticated query and
mutation smoke. Approve npm's proof-of-presence stage only after those checks and the staged
package digest agree. Tag protection, environment approval, and the npm trusted-publisher
binding are repository/registry settings and must be verified before a release push.

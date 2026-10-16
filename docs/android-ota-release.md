# Android OTA release controls

The default frontend build remains the complete website/admin build. The
`build:parents` command produces the isolated parent-only web build.

## Publication is off by default

Every push runs tests and builds both variants. It does not publish unless the
repository variable `OTA_PUBLISH_MODE` is explicitly set to `legacy`,
`parents`, or `both`. An empty value or `none` is verification-only.

The workflow can also be started manually. Both channel checkboxes default to
off, and either channel can be selected independently.

All selected channels are built, signed, and verified in temporary staging
before files are applied. A `both` run creates one Git commit only after both
channels pass. If staging or validation fails, nothing is committed or pushed.
Render deployment happens after GitHub receives the commit, so deployment
health must still be checked separately.

## Google Play Android workspace

Generate the Android parent workspace outside this source tree:

```text
npm run android:prepare:parents -- C:\path\to\empty-parent-android-workspace
```

The generated workspace has application ID
`com.warriorsgymnastics.parents`. It intentionally excludes environment files,
signing keys, Firebase Admin credentials, and `google-services.json`. Place the
Google Play parent's Firebase client file at
`android/app/google-services.json`, install locked dependencies, then build its
web assets with:

```text
npx vite build --mode parents --outDir dist
```

The generated native contract must equal the Google Play parent contract in
`ota-channels.json` before any native build or OTA publication is accepted.

# Clipboard Palette: One Offer per Image

Date: 2026-09-29
Result: VERIFIED locally; production deployment remains Owner-owned.

## Requested Behavior

Either Yes or No handles the offered clipboard image. Returning to Presets
must not offer that content again. Different content remains eligible.

## Root Causes and Fix

- Android tab-hidden handling explicitly cleared handled fingerprints.
  Removed that reset and its obsolete flag/API.
- The candidate component owned its detection session, but Method replaces
  the controls subtree and unmounts the component. The root editor now owns
  one session and passes it through the existing editor/candidate interface.
- The old fingerprint sampled only three byte ranges. Full-payload Web Crypto
  SHA-256 now distinguishes changes outside those ranges as well.

Suppression stores fingerprints only, not clipboard images. It is interaction
state, not project/module settings: ordinary new-import defaults and saved
project restoration remain unchanged. It survives Method, editor Home/start,
opening another project, focus changes and tab visibility changes within that
root editor session. Refreshing the page or leaving/recreating the editor root
starts a new session; no cross-session persistence was introduced.

Identity is based on encoded clipboard payload content, MIME and size, not a
visual/perceptual comparison. Returning to previously handled content after
handling another image remains suppressed. No polling or new dependencies.
The file-picker palette import pipeline is unchanged.

## Files

- `src/editor/clipboardPaletteCandidate.tsx`: fingerprint and session lifetime.
- `src/editor/PixelEditorFramer.tsx`: root ownership and explicit session wiring.
- `src/editor/clipboardPaletteCandidate.test.tsx`: updated contract/regressions.
- `tests/e2e/clipboard-palette-candidate.spec.ts`: mounted editor regressions.

## Verification

| Check | Result |
| --- | --- |
| Focused clipboard/import units, 3 files | 32 PASS |
| All applicable `src` units, 51 files | 818 PASS |
| Selected desktop/mobile browser cases | 28 PASS; no skips |
| Typecheck | PASS |
| Scoped ESLint on all four changed code/test files | PASS |
| Production build, prerender and CSP injection | PASS |
| Diff whitespace / final status inspection | PASS |

Browser cases cover both Yes/No, three repeated Auto/Presets visits, Method
return, content A -> B -> A, Home then project reopening, simulated Android
hidden/visible, import spinner, failed read and unsupported clipboard content.
Ten additional cases cover new-import/load defaults, saved module restoration,
rectangular preset geometry and independent tab selections.

Before the fix, desktop regressions reproduced renewed offers after Yes/Method
and after both Yes/No Android hidden/visible. A fourth baseline case stopped at
a test setup error: Method requires a selected preset. The first fixed run
had 16 PASS and two test-selector failures because the preset accessible name
also includes its Delete control. Corrected setup/selectors; the final run
passed without changing production behavior to accommodate those tests.

The old Android reset test was obsolete under the Owner's new requirement;
replaced it with preservation/new-content regression coverage, not a weaker
acceptance condition. Snapshot baselines and visual tolerance were not changed.

Final browser command:

```text
node tests/e2e/run-playwright.mjs --grep 'clipboard|new life resets session preferences: (image|load)|new import resets committed modules|palette tabs keep independent selected swatches|palette presets keep imported rectangular canvas geometry' --workers=1 --reporter=line --output=test-results/clipboard-once-closure
```

Execution evidence: `test-results/clipboard-once-closure/.last-run.json`.
Failed/intermediate evidence remains in `test-results/clipboard-once-baseline`
and `test-results/clipboard-once-fixed`; not overwritten by the final run.

## Limits and Delivery

NOT VERIFIED: real OS clipboard/permission behavior on a physical Android
device. Browser tests use the built app and real import/UI paths, with a mocked
Clipboard API and simulated Android visibility events. The full unrelated E2E
suite was not rerun. No push, deploy or production changes were performed.

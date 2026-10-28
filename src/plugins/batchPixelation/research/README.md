# Research-Only Batch Tools

Production authoring now lives in `../authoring/`; production frame replay lives
in `../render/`. Neither the normal App nor its production build imports this
research directory. Research tools may depend on those production modules.

## Independent rAF Stand

Run `npm run research:batch-raf`, then open
`http://127.0.0.1:5176/tests/research/batch-raf/` in ordinary Chrome.
The separate Vite configuration loads `rafResearchEntry.tsx` directly, not App.
The historical `/__batch-raf-validation` route no longer exists in production.
OFF/ON measurements and local diagnostic JSON download remain research-only.

Run its existing automated checks while that server is running:

```text
node node_modules/playwright/cli.js test tests/e2e/raf-validation.spec.ts --workers=1 --output=test-results/batch-raf-research-e2e
```

These checks are not part of the normal production suite and are not real Owner
performance measurements. Historical reports/evidence retain their old paths.

## Historical Replay Proofs

These modules preserve the Stage 2-4 identity experiments conducted under the
v1 Batch Pixelation contract. They are not imported by the Base Editor or the
v2 Batch runtime.

`paletteReplay.ts` includes swatch mutation, transparency and old-classifier
predicates that the v2 MVP explicitly excludes. `frameReplay.ts` is a browser
proof harness, not a validated Batch Template format or production runner.

The v2 implementation must capture a new final-state declarative recipe in
plugin scope. Do not use these historical types as that template without a
separate contract review.

# Batch Pixelation Ownership

Production modules:

- `BatchPixelationRoute.tsx` and `workflow/`: product workflow orchestration.
- `authoring/`: restricted Reference authoring and immutable committed envelope.
- `render/`: final-frame recipe validation/replay, Smart, palette and timing types.
- `sourceSet/`: acquisition, validation and deterministic ordering.
- `runner/`: sequential processing and output staging.
- `packaging/`: ZIP/report packaging and download lifecycle.
- `cropRasterPolicy.ts` and `staticRasterPolicy.ts`: Batch policy selection.

The authoring and render paths use neutral editor seams: `editorHost.ts`,
`cropRender.ts`, `referencePreparation.ts`, `smartRender.ts`, `pixelRaster.ts`
and the existing quantization/palette core. The ordinary editor retains its
default Crop policy; Batch selects canonical C1. Template semantics are unchanged.

Research may import these production modules. Production must never import
`research/`; research-only code must never enter the production build graph.
The legacy `/__batch-gate5` acceptance route still mounts the same production
authoring component. It is not the independent rAF diagnostic stand.

`npm run build` records the actual input modules and rejects research inputs.
`npm run verify:batch-production-boundary` checks the source dependency graph,
build module inventory and every emitted artifact. No new golden acceptance or
test tolerance is part of this boundary check.

See `research/README.md` for the independent research launch path. Reports under
`docs/` and evidence retain historically correct paths rather than being rewritten.

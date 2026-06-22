# PixelEditorFramer Product Decomposition Map

Status: map only, no runtime changes.

Goal: split `src/editor/PixelEditorFramer.tsx` by product ownership, not by
generic folders such as `hooks/`, `utils/`, or `components/`. Technical shapes
are still useful, but only inside a product slice.

Current file size: about 18.2K lines.

## Top-Level Landmarks

| Lines | Area | Notes |
| --- | --- | --- |
| 1-134 | Imports | Existing extracted modules already include file intake, palette quantization, history, viewport zoom, Smart Object, recorder, XLSX export, icons. |
| 135-224 | Source image, logging, checksums, canvas helpers | Small shared helpers. Some are pure and extractable, but they support multiple domains. |
| 238-878 | Import preprocessing | Source image square bake, color sanitization, stylization boost, delicate image cleanup. Product-owned by import/crop/quantization boundary. |
| 878-2045 | Pixel, swatch, palette, color, quantization helpers | Mixed domain primitives: pixel values, swatches, color conversion, BW helpers, pixelize/quantize helpers. |
| 2046-2257 | Shared UI/layout helpers | `FitToViewport`, checkerboard drawing, transparent mark drawing. |
| 2260-2506 | Camera modal | Desktop camera modal UI and capture to `SourceImage`. |
| 2509-3145 | Start screen | Start UX, logo/report-code modal, Open/Camera/Draw actions. |
| 3146-3487 | Editor/root contracts | Smart Object ownership contract, root history contract, committed state types. |
| 3488-15088 | `PixelEditorFramer` editor component | Main editor orchestration, canvas, palette, tools, save/load, export, modal UI. |
| 15093-15135 | Import transaction helpers | Shared root/editor import transaction logging helpers. |
| 15138-18214 | Root shell | App-level screen routing, root history, Smart Object gateway, file intake, camera/crop flow, root overlays. |

## Product Blocks

### 1. Start Screen And App Shell

Primary lines:

- `StartScreen`: 2509-3145
- Root screen state and route callbacks: 15138-15201
- Root render wiring: 17562-17633
- Start footer actions: 17677-17848

Responsibilities:

- First-visit actions: open file, camera, blank draw.
- Logo/home behavior and hidden report-code modal.
- Root-level screen switch between `start`, `editor`, and `smart-reference`.
- Shared hidden file inputs remain mounted in root.

Main dependencies:

- Root file intake callbacks.
- Camera entry points.
- Blank project gateway.
- Promo home navigation.

Extraction notes:

- Good early UI extraction candidate because `StartScreen` is already a local component.
- Keep root-owned callbacks in root; do not move file intake into the start screen.
- The footer should probably follow the start shell, not the editor domain.

### 2. Root Gateway, History, And Cross-Domain Transactions

Primary lines:

- Contracts and committed-state types: 3163-3487
- Root gateway state: 15169-15231
- Editor/Smart Object bridge callbacks: 15236-15340
- Root history transactions: 15357-15558
- Smart Object strict modal user action: 15569-15684
- Root render wiring into editor and Smart Object: 17575-17656

Responsibilities:

- Own the cross-domain boundary between editor-domain and smart-object-domain.
- Own user-facing undo/redo through root history.
- Route import/load/Smart Object Apply into a committed editor reference.
- Capture/restore editor and Smart Object committed states.

Main dependencies:

- `rootHistory.ts`
- `SmartReferenceEditor.tsx`
- `PixelEditorFramer` committed-state bridge
- Project save/load callbacks

Extraction notes:

- This should become a product-level gateway module or hook, not a generic
  `useHistory` helper.
- Do not split root history away from Smart Object coordination too early; they
  are currently one ownership boundary.
- Good future slice name: `editor/root-gateway`.

### 3. File Intake, Open Project, Camera, And Crop Flow

Primary lines:

- SourceImage helpers: 135-144
- Desktop `CameraModal`: 2260-2506
- Editor-side pending project load bridge: 4183-4211
- Root unified file picker and routing: 15812-16093
- Root import decision/gateway entry: 16100-16169
- Crop state and contract: 16173-16275
- Crop artifact apply effects: 16334-16439
- Crop viewport/preview/pointers: 16485-17448
- Blank/camera gateway: 17450-17518
- Picked project file handling: 17519-17557
- Crop UI portal: 17895-18214

Responsibilities:

- Fail-closed routing of images and `.pixtudio` projects.
- Camera input selection for desktop and mobile.
- Crop/prep room: preview, transform, confirm/cancel.
- Publish only a baked 512x512 reference artifact into root/editor gateway.
- Keep import errors centralized in root modal.

Main dependencies:

- `openFileRouter.ts`
- `fileIntakeSecurity.ts`
- `cameraInputDevice.test.ts` coverage around device detection
- Preprocess helpers near the top of this file
- Smart Object gateway because imports set/clear base reference state

Extraction notes:

- The crop flow is the clearest large vertical slice.
- Start by extracting pure geometry/image helpers from crop, not the overlay UI.
- The root import-error modal belongs with file intake/root shell, not with editor canvas.
- Keep `SourceImage -> CropFlow -> bakedRef512 -> root gateway` as the invariant.

### 4. Project Save/Load And Snapshot V2

Primary lines:

- Save click entry: 4036-4063
- Load read/parse/apply: 4082-4180
- Snapshot V2 schema/canonicalization/validation: 4213-5000
- Save/load tracing and strict snapshot build: 5033-5313
- Load decode/state rebuild: 5315-5500
- Load restore commit into editor state: 7881-8057
- Root save helpers for Smart Object export: 15691-15789

Responsibilities:

- Canonical `.pixtudio` save format.
- Fail-closed damaged project handling.
- Serialize canvas, palette, quantization profile, overlays, reference snapshot,
  and Smart Object committed state.
- Restore editor-domain state while routing Smart Object-owned data through root.

Main dependencies:

- `projectSnapshotV2.ts`
- `zipStore.ts` indirectly through export ecosystem
- Smart Object capture/restore bridge
- Palette world and canvas state

Extraction notes:

- Snapshot validation is large but comparatively pure; this is a strong early
  extraction candidate if tests move with it.
- Do not extract all Save/Load as the first slice. `buildNextStateFromValidatedSnapshotV2`,
  load restore, root save helpers, and Smart Object restore are cross-domain
  gateway work and should remain in place until the validation/canonicalization
  boundary is stable.
- Keep save/load as a product slice, not a generic `serialization` folder.
- Do not move Smart Object restore logic without preserving root ownership.

### 5. Reference Snapshot, Quantization, Grid Policy, And Palette Worlds

Primary lines:

- Import preprocessing and bake helpers: 238-878
- Palette/quantization primitives: 1470-2045
- Editor quantization state: 3833-3899
- Initial image import behavior: 4006-4032
- Overlay snapshot invariant and paint snapshot helpers: 5505-5951
- Canvas composition gateway: 5952-6075
- Reference/original image state: 6078-6095
- Grid policy: 6089-6284
- Auto/user swatches and selected swatch: 6301-6336
- Palette worlds, fixed presets, imported palettes: 6455-7400
- Repixelize effect: 9886-10764

Responsibilities:

- Reference snapshot is the source for repeat quantization.
- Grid size changes trigger requantization.
- Palette is the source of truth for color identity.
- Auto palette, user swatches, imported fixed presets, and deleted colors form
  a "palette world".
- Overlay paint survives base rebuild by snapshot/remap logic.

Main dependencies:

- `paletteQuantizationEngine.ts`
- `palettePresetExtension.ts`
- `importedPaletteStrategy.ts`
- `paletteFromImage.ts`
- `quantizationMethods/*`

Extraction notes:

- This is the conceptual core of PIXTUDIO. Do not split it by "state variables".
- First extract pure functions around palette world building, duplicate collapse,
  fixed palette remap, and snapshot signatures.
- Avoid extracting hooks until ownership is clear: palette, grid, and reference
  are tightly coupled.

### 6. Canvas Rendering, Viewport, Pan/Zoom, And Pointer Input

Primary lines:

- Canvas refs and viewport size: 6337-6420
- Canvas frame composition and atomic publish: 5952-6075
- Pointer and brush preview refs: 8540-8573
- Mobile pinch zoom: 8596-8708
- Pointer down/move handlers: 8708-8894
- Panning and zoom state: 8949-9238
- Canvas render effect: 10253-10375
- Drawing and brush preview handlers: 10407-10899
- Canvas JSX area: 12990-13100

Responsibilities:

- Render the composed grid to a deterministic 512 canvas.
- Keep viewport transform stable across desktop and mobile.
- Support brush, transparent brush, eyedropper, hand/pan, pinch zoom, wheel zoom.
- Keep brush preview DOM updates out of React render flow.

Main dependencies:

- `viewportWheelZoom.ts`
- `viewportPinchZoom.ts`
- `spaceHandTool.ts`
- `editorHistoryShortcuts.ts`
- Canvas/palette state

Extraction notes:

- Good future slice name: `editor/canvas-interaction`.
- Start with pure viewport math and pointer coordinate helpers where possible.
- Be careful: drawing writes overlay state and participates in user action
  history, so it crosses into history and palette ownership.
- The boundary around clear/import/swatch edit is not clean. Functions near the
  end of drawing and the start of swatch edit update overlay state, image state,
  import context, and palette modal state. Treat this as a boundary adapter
  before assigning it to either `canvas` or `palette`.

### 7. Drawing Tools, Swatch Editing, And Palette UI

Primary lines:

- Tool mode: 9023-9049
- Color modal state and HSV/HEX sync: 9359-9455, 12263-12349
- Swatch sorting and lookup memoization: 9576-9659
- Swatch/preset render helpers: 12350-12688
- Palette UI return section: 13542-13946
- Swatch edit modal: 14508-15028
- Swatch edit/delete/apply logic: 10924-11623

Responsibilities:

- Select swatch or transparent tool.
- Edit existing auto/user/preset swatches.
- Add user swatches or fixed-preset swatches.
- Delete swatches/presets and remap pixels safely.
- Present palette size and preset tabs.

Main dependencies:

- Palette world state.
- Canvas overlay remap.
- Color conversion helpers.
- Export/checkerboard UI helpers.

Extraction notes:

- This should be a `palette` product slice, not just UI components.
- UI extraction should happen after pure swatch edit/remap functions are isolated.
- Keep "transparent" as a first-class palette participant.

### 8. Project Actions Toolbar, Menus, Manual, And Export

Primary lines:

- Manual/export/open overlay state: 9426-9455
- Export blob creation: 11624-12124
- Overlay positioning and runExport: 12125-12262
- Top toolbar JSX: 12741-12960
- Manual portal: 13947-13980
- Open/export anchored menu portal: 13981-14507

Responsibilities:

- Top toolbar actions: home, save/export, undo/redo, open/camera, zoom, tools,
  manual.
- Anchored open menu.
- Anchored export menu.
- Export PNG/SVG/XLSX/ZIP and include-stroke/include-image toggles.
- Manual fullscreen modal.

Main dependencies:

- `PixelArtXlsxExport.tsx`
- `ManualScreen.tsx`
- Canvas rendering/export helpers.
- Project save helpers.

Extraction notes:

- Export producers are better extraction candidates than the overlay UI.
- The top toolbar is a UI component candidate, but it currently depends on many
  editor callbacks and state flags.
- Open menu is coupled to root file intake callbacks; keep that boundary clear.

### 9. Quantization Recorder

Primary lines:

- Recorder seed state: 6087
- Recorder frame producer and seed builder: 7426-7656
- Recorder open/close actions: 7650-7656
- Recorder modal render: 15032-15047

Responsibilities:

- Build a seed from current reference, palette, grid, and export frame producer.
- Open `QuantizationRecorder` as a modal-like tool.
- Produce frames for MP4 process export.

Main dependencies:

- `QuantizationRecorder.tsx`
- Quantization/palette state
- Canvas/export rendering helpers

Extraction notes:

- The recorder component already lives outside the file.
- Remaining work is the adapter/seed builder. It belongs near quantization/export,
  not generic UI.

### 10. Smart Object

Primary lines:

- Architecture contract: 3163-3176
- Editor props for Smart Object save/load/restore: 3492-3536
- Root Smart Object bridge: 15285-15340
- Root Smart Object open/apply/cancel flow: 15569-15684
- Smart Object export helpers: 15691-15809
- Import/blank effects on Smart Object base state: 16104-16120, 17450-17460
- Root render of `SmartReferenceEditor`: 17646-17656

Responsibilities:

- SmartReferenceEditor owns base reference and non-destructive adjustments.
- Root owns the transaction boundary and committed-state bridge.
- Editor consumes committed output and contributes save/load serialization.

Main dependencies:

- `SmartReferenceEditor.tsx`
- Root history
- Project save/load
- Import gateway

Extraction notes:

- Smart Object is already partially separated.
- The next cleanup should clarify adapter boundaries, not move Smart Object state
  back into the editor.

## Existing Extraction Candidates

These can be extracted without starting with UI or hooks:

1. Snapshot V2 validation/canonicalization: 4213-5000.
2. Palette world pure functions: 6455-7400, 10999-11164.
3. Crop geometry helpers: 16565-16667, 17134-17253.
4. Export blob producers: 11624-12124.
5. Recorder seed/frame adapter: 7426-7656.
6. Swatch color modal pure helpers: 9371-9404, 10950-11517.

## Suggested First Slice

Start with a map-to-tests step before extraction:

1. Add focused tests around a pure area that already has product meaning.
2. Extract that area into a product folder.
3. Keep the editor import surface tiny.
4. Run `typecheck`, `test`, `lint`, `build`, and targeted e2e if UI changed.

Recommended first extraction target: Snapshot V2 validation/canonicalization
only.

Why:

- It has clear product ownership: project save/load.
- It is mostly pure validation/canonicalization.
- It is already covered conceptually by `projectSnapshotV2.test.ts`.
- It does not touch canvas pointer behavior, crop gestures, or toolbar layout.
- `projectSnapshotV2.ts` already exists, so the first step should remove the
  duplicate local definitions from `PixelEditorFramer.tsx` and make the editor
  consume that module directly.

Out of scope for this first slice:

- `buildNextStateFromValidatedSnapshotV2`.
- `restoreProjectFromLoadPayload`.
- Root save helpers.
- Smart Object gateway restore/capture wiring.

Second good target: crop geometry helpers, if paired with narrow unit tests.

Avoid as first extraction:

- Top toolbar JSX: too many callbacks.
- Root history gateway: high blast radius.
- Palette state hook: ownership is still intertwined with grid/reference/overlay.
- Canvas pointer handlers: easy to alter behavior accidentally.

## Target Folder Shape

Prefer product folders:

```text
src/editor/
  project/
  import/
  crop/
  palette/
  quantization/
  canvas/
  export/
  recorder/
  root-gateway/
  start-screen/
```

Inside each product folder, use technical files only when they serve that slice:

```text
palette/
  paletteWorld.ts
  paletteWorld.test.ts
  SwatchEditModal.tsx
  usePaletteWorld.ts
```

Do not start with:

```text
hooks/
utils/
components/
```

Those folders hide product ownership and make the next reader reconstruct the
editor flow from scattered technical categories.

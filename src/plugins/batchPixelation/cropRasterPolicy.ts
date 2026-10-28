import type { CropRasterPolicy } from "../../editor/cropRender.ts"

// Authoring and replay share one fixed policy, pinned by template semantics.
export const BATCH_CROP_RASTER_POLICY = "canonical-software" satisfies CropRasterPolicy

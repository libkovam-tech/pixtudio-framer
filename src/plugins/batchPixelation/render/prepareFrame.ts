import { PREP_CONFIG, sanitizeImageDataDelicate, stylizeBoostImageData } from "../../../editor/referencePreparation.ts"

/** Stage 4 proof adapter; the editor owns the numerical preparation kernels. */
export function prepareFrame(image: ImageData): ImageData {
    if (PREP_CONFIG.SANITIZE_DEBUG_X10 || PREP_CONFIG.SANITIZE_DEBUG_X10_CAMERA) {
        throw new Error("Debug preparation is not a supported replay pipeline")
    }
    const sanitized = PREP_CONFIG.ENABLE_COLOR_SANITIZATION ? sanitizeImageDataDelicate(image) : image
    return PREP_CONFIG.ENABLE_STYLIZATION_BOOST ? stylizeBoostImageData(sanitized) : sanitized
}

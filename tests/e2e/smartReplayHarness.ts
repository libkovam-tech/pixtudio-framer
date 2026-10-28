import {
    initializeWhiteBalanceDomainStateFromBakedBase, ZERO_SMART_REFERENCE_ADJUSTMENTS,
} from "../../src/editor/smartRender"
import { applyResolvedSmartRecipe, resolveSmartRecipe } from "../../src/plugins/batchPixelation/render/smartRecipe"

export function compareSmartReplay(base: ImageData, whiteBalance: number, expected: ImageData) {
    const recipe = resolveSmartRecipe({ ...ZERO_SMART_REFERENCE_ADJUSTMENTS, whiteBalance },
        initializeWhiteBalanceDomainStateFromBakedBase(base))
    const replay = applyResolvedSmartRecipe(base, JSON.parse(JSON.stringify(recipe)))
    if (replay.width !== expected.width || replay.height !== expected.height) {
        throw new Error("Smart replay dimensions differ")
    }
    for (let i = 0; i < replay.data.length; i++) {
        if (replay.data[i] !== expected.data[i]) throw new Error(`Smart RGBA mismatch at byte ${i}`)
    }
}

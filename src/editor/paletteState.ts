export type PaletteSwatchLike = {
    id?: string | null
    isTransparent?: boolean | null
}

export type PaletteSelection = string | "transparent"
export type PaletteTabKey = "size" | "presets"

export type PaletteTabWorldState<TWorld> = {
    activeTab: PaletteTabKey
    sizeWorld: TWorld | null
    presetsWorld: TWorld | null
}

function clampInt(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function isCountedPaletteSwatch(
    swatch: PaletteSwatchLike | null | undefined
): boolean {
    return !!swatch && !swatch.isTransparent && swatch.id !== "transparent"
}

export function computePaletteCountFromSwatches(
    autoSwatches:
        | ReadonlyArray<PaletteSwatchLike | null | undefined>
        | null
        | undefined,
    userSwatches:
        | ReadonlyArray<PaletteSwatchLike | null | undefined>
        | null
        | undefined,
    bounds: { min: number; max: number }
): number {
    const autoCount = (autoSwatches ?? []).filter(isCountedPaletteSwatch).length
    const userCount = (userSwatches ?? []).filter(isCountedPaletteSwatch).length

    return clampInt(autoCount + userCount, bounds.min, bounds.max)
}

function swatchListHasId(
    swatches:
        | ReadonlyArray<PaletteSwatchLike | null | undefined>
        | null
        | undefined,
    id: string
): boolean {
    return (swatches ?? []).some((swatch) => swatch?.id === id)
}

export function resolveSelectedSwatchAfterAutoChange(input: {
    nextAutoSwatches:
        | ReadonlyArray<PaletteSwatchLike | null | undefined>
        | null
        | undefined
    userSwatches:
        | ReadonlyArray<PaletteSwatchLike | null | undefined>
        | null
        | undefined
    selectedSwatch: PaletteSelection
    preferredSwatch?: PaletteSelection | null
}): PaletteSelection {
    const {
        nextAutoSwatches,
        userSwatches,
        selectedSwatch,
        preferredSwatch,
    } = input

    if (preferredSwatch === "transparent") return preferredSwatch
    if (
        preferredSwatch &&
        swatchListHasId(userSwatches, preferredSwatch)
    ) {
        return preferredSwatch
    }
    if (
        preferredSwatch &&
        swatchListHasId(nextAutoSwatches, preferredSwatch)
    ) {
        return preferredSwatch
    }

    if (selectedSwatch === "transparent") return selectedSwatch
    if (swatchListHasId(userSwatches, selectedSwatch)) return selectedSwatch
    if (swatchListHasId(nextAutoSwatches, selectedSwatch)) return selectedSwatch

    return (
        nextAutoSwatches?.find((swatch) => swatch?.id)?.id ??
        userSwatches?.find((swatch) => swatch?.id)?.id ??
        "transparent"
    )
}

export function preparePaletteTabSwitch<TWorld>(input: {
    state: PaletteTabWorldState<TWorld>
    currentWorld: TWorld
    nextTab: PaletteTabKey
    isTargetWorldCompatible: (world: TWorld) => boolean
}): {
    savedState: PaletteTabWorldState<TWorld>
    nextState: PaletteTabWorldState<TWorld>
    targetWorld: TWorld | null
    targetWorldIsCompatible: boolean
} {
    const { state, currentWorld, nextTab, isTargetWorldCompatible } = input
    const savedState =
        state.activeTab === "size"
            ? { ...state, sizeWorld: currentWorld }
            : { ...state, presetsWorld: currentWorld }
    const targetWorld =
        nextTab === "size" ? savedState.sizeWorld : savedState.presetsWorld
    const targetWorldIsCompatible =
        !!targetWorld && isTargetWorldCompatible(targetWorld)

    return {
        savedState,
        targetWorld,
        targetWorldIsCompatible,
        nextState: {
            ...savedState,
            activeTab: nextTab,
            ...(nextTab === "size" && !targetWorldIsCompatible
                ? { sizeWorld: null }
                : {}),
            ...(nextTab === "presets" && !targetWorldIsCompatible
                ? { presetsWorld: null }
                : {}),
        },
    }
}

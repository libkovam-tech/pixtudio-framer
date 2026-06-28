export type PaletteSwatchLike = {
    id?: string | null
    isTransparent?: boolean | null
}

export type PalettePaintSwatchLike = PaletteSwatchLike & {
    color?: string | null
    isUser?: boolean | null
}

export type PaletteSelection = string | "transparent"
export type PaletteTabKey = "size" | "presets"
export type PaletteAutoOverridesMap<TOverride = unknown> = Record<
    string,
    TOverride
>

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

function normalizeSwatchColor(color: string | null | undefined): string {
    return (color ?? "").trim().toUpperCase()
}

function paintSwatchKey(
    swatch: PalettePaintSwatchLike | null | undefined
): string {
    return `${normalizeSwatchColor(swatch?.color)}|${
        swatch?.isTransparent ? "1" : "0"
    }`
}

export function prepareStrokePaintSwatch<TSwatch extends PalettePaintSwatchLike>(
    input: {
        activeTab: PaletteTabKey
        selectedSwatch: PaletteSelection
        autoSwatches: ReadonlyArray<TSwatch>
        userSwatches: ReadonlyArray<TSwatch>
        makeUserSwatch: (source: TSwatch) => TSwatch
    }
): {
    paintSwatch: PaletteSelection
    userSwatches: TSwatch[]
    createdUserSwatch: TSwatch | null
} {
    const {
        activeTab,
        selectedSwatch,
        autoSwatches,
        userSwatches,
        makeUserSwatch,
    } = input

    if (selectedSwatch === "transparent") {
        return {
            paintSwatch: selectedSwatch,
            userSwatches: userSwatches.slice(),
            createdUserSwatch: null,
        }
    }

    if (activeTab !== "presets") {
        return {
            paintSwatch: selectedSwatch,
            userSwatches: userSwatches.slice(),
            createdUserSwatch: null,
        }
    }

    if (swatchListHasId(userSwatches, selectedSwatch)) {
        return {
            paintSwatch: selectedSwatch,
            userSwatches: userSwatches.slice(),
            createdUserSwatch: null,
        }
    }

    const source = autoSwatches.find((swatch) => swatch.id === selectedSwatch)
    if (!source || source.isTransparent) {
        return {
            paintSwatch: selectedSwatch,
            userSwatches: userSwatches.slice(),
            createdUserSwatch: null,
        }
    }

    const createdUserSwatch = makeUserSwatch(source)
    return {
        paintSwatch: createdUserSwatch.id ?? selectedSwatch,
        userSwatches: [...userSwatches, createdUserSwatch],
        createdUserSwatch,
    }
}

function buildScopedDuplicateRemap<TSwatch extends PalettePaintSwatchLike>(
    swatches: ReadonlyArray<TSwatch>,
    remap: Record<string, string>
): TSwatch[] {
    const winnerByKey = new Map<string, string>()
    const keptIds = new Set<string>()

    for (const swatch of swatches) {
        if (!swatch.id) continue

        const id = String(swatch.id)
        const key = paintSwatchKey(swatch)
        const winner = winnerByKey.get(key)

        if (!winner) {
            winnerByKey.set(key, id)
            remap[id] = id
            keptIds.add(id)
        } else {
            remap[id] = winner
        }
    }

    return swatches.filter((swatch) => swatch.id && keptIds.has(swatch.id))
}

export function collapseDuplicateSwatchesByScope<
    TSwatch extends PalettePaintSwatchLike,
>(input: {
    autoSwatches: ReadonlyArray<TSwatch>
    userSwatches: ReadonlyArray<TSwatch>
}): {
    autoSwatches: TSwatch[]
    userSwatches: TSwatch[]
    remap: Record<string, string>
    changed: boolean
} {
    const remap: Record<string, string> = {}
    const autoSwatches = buildScopedDuplicateRemap(input.autoSwatches, remap)
    const userSwatches = input.userSwatches.slice()
    for (const swatch of userSwatches) {
        if (swatch.id) remap[String(swatch.id)] = String(swatch.id)
    }
    const changed = Object.keys(remap).some((id) => remap[id] !== id)

    return {
        autoSwatches,
        userSwatches,
        remap,
        changed,
    }
}

export function remapPaletteGridById<TPixel extends string | null>(
    grid: TPixel[][],
    idMap: Record<string, string>
): TPixel[][] {
    if (!grid || grid.length === 0) return grid

    let changed = false
    const out = grid.map((row) => {
        let rowChanged = false
        const nextRow = row.map((value) => {
            if (
                typeof value === "string" &&
                idMap[value] &&
                idMap[value] !== value
            ) {
                rowChanged = true
                return idMap[value] as TPixel
            }
            return value
        })
        if (rowChanged) changed = true
        return rowChanged ? nextRow : row
    })

    return changed ? out : grid
}

export function removePalettePixelValueFromGrid<
    TPixel extends string | null,
>(grid: TPixel[][], swatchId: string): TPixel[][] {
    let changed = false
    const out = grid.map((row) => {
        let rowChanged = false
        const nextRow = row.map((value) => {
            if (value === swatchId) {
                rowChanged = true
                return null as TPixel
            }
            return value
        })
        if (rowChanged) changed = true
        return rowChanged ? nextRow : row
    })

    return changed ? out : grid
}

function moveCollapsedAutoOverrides<TOverride>(
    overrides: PaletteAutoOverridesMap<TOverride>,
    remap: Record<string, string>
): PaletteAutoOverridesMap<TOverride> {
    const outOverrides: PaletteAutoOverridesMap<TOverride> = {
        ...(overrides || {}),
    }

    for (const from of Object.keys(outOverrides)) {
        if (!from.startsWith("auto-")) continue
        const to = remap[from]
        if (!to || to === from) continue

        const entry = outOverrides[from]
        delete outOverrides[from]

        if (to.startsWith("auto-") && !outOverrides[to]) {
            outOverrides[to] = entry
        }
    }

    return outOverrides
}

export function collapseDuplicateSwatchesAndRemapPixels<
    TSwatch extends PalettePaintSwatchLike,
    TPixel extends string | null,
    TOverride,
>(input: {
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    nextAuto: TSwatch[]
    nextUser: TSwatch[]
    nextAutoOverrides: PaletteAutoOverridesMap<TOverride>
    selectedSwatch: PaletteSelection
    pruneAutoOverrides?: (
        currentAuto: TSwatch[],
        overrides: PaletteAutoOverridesMap<TOverride>
    ) => PaletteAutoOverridesMap<TOverride>
}): {
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    autoSwatches: TSwatch[]
    userSwatches: TSwatch[]
    autoOverrides: PaletteAutoOverridesMap<TOverride>
    selectedSwatch: PaletteSelection
} {
    const collapsed = collapseDuplicateSwatchesByScope({
        autoSwatches: input.nextAuto,
        userSwatches: input.nextUser,
    })

    if (!collapsed.changed) {
        return {
            imagePixels: input.imagePixels,
            overlayPixels: input.overlayPixels,
            autoSwatches: collapsed.autoSwatches,
            userSwatches: collapsed.userSwatches,
            autoOverrides: input.nextAutoOverrides,
            selectedSwatch: input.selectedSwatch,
        }
    }

    const nextImage = remapPaletteGridById(input.imagePixels, collapsed.remap)
    const nextOverlay = remapPaletteGridById(
        input.overlayPixels,
        collapsed.remap
    )
    const movedOverrides = moveCollapsedAutoOverrides(
        input.nextAutoOverrides,
        collapsed.remap
    )
    const nextOverrides = input.pruneAutoOverrides
        ? input.pruneAutoOverrides(collapsed.autoSwatches, movedOverrides)
        : movedOverrides
    const nextSelected =
        input.selectedSwatch === "transparent"
            ? "transparent"
            : (collapsed.remap[String(input.selectedSwatch)] ||
                  String(input.selectedSwatch))

    return {
        imagePixels: nextImage,
        overlayPixels: nextOverlay,
        autoSwatches: collapsed.autoSwatches,
        userSwatches: collapsed.userSwatches,
        autoOverrides: nextOverrides,
        selectedSwatch: nextSelected,
    }
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

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
export type PaletteAutoOverrideLike = {
    hex?: string
    isTransparent?: boolean
}

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

function componentToHex(value: number): string {
    const clamped = Math.max(0, Math.min(255, Math.round(value)))
    return clamped.toString(16).padStart(2, "0").toUpperCase()
}

function rgbToHex(r: number, g: number, b: number): string {
    return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`
}

function hslToRgb(h: number, s: number, l: number): {
    r: number
    g: number
    b: number
} {
    const hue = ((h % 360) + 360) % 360
    const sat = s / 100
    const light = l / 100
    const c = (1 - Math.abs(2 * light - 1)) * sat
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
    const m = light - c / 2

    let r1 = 0
    let g1 = 0
    let b1 = 0
    if (hue < 60) {
        r1 = c
        g1 = x
    } else if (hue < 120) {
        r1 = x
        g1 = c
    } else if (hue < 180) {
        g1 = c
        b1 = x
    } else if (hue < 240) {
        g1 = x
        b1 = c
    } else if (hue < 300) {
        r1 = x
        b1 = c
    } else {
        r1 = c
        b1 = x
    }

    return {
        r: (r1 + m) * 255,
        g: (g1 + m) * 255,
        b: (b1 + m) * 255,
    }
}

function normalizeSwatchColor(color: string | null | undefined): string {
    const rawColor = (color ?? "").trim()
    const upperColor = rawColor.toUpperCase()

    const hex6Match = /^#([0-9A-F]{6})$/i.exec(rawColor)
    if (hex6Match) return `#${hex6Match[1].toUpperCase()}`

    const hex3Match = /^#([0-9A-F])([0-9A-F])([0-9A-F])$/i.exec(rawColor)
    if (hex3Match) {
        return `#${hex3Match[1]}${hex3Match[1]}${hex3Match[2]}${hex3Match[2]}${hex3Match[3]}${hex3Match[3]}`.toUpperCase()
    }

    const rgbMatch =
        /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(rawColor)
    if (rgbMatch) {
        return rgbToHex(
            Number(rgbMatch[1]),
            Number(rgbMatch[2]),
            Number(rgbMatch[3])
        )
    }

    const hslMatch =
        /^hsl\(\s*(-?\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/i.exec(rawColor)
    if (hslMatch) {
        const rgb = hslToRgb(
            Number(hslMatch[1]),
            Number(hslMatch[2]),
            Number(hslMatch[3])
        )
        return rgbToHex(rgb.r, rgb.g, rgb.b)
    }

    return upperColor
}

function paintSwatchKey(
    swatch: PalettePaintSwatchLike | null | undefined
): string {
    return `${normalizeSwatchColor(swatch?.color)}|${
        swatch?.isTransparent ? "1" : "0"
    }`
}

export function prepareSwatchesForEdit<
    TSwatch extends PalettePaintSwatchLike & { id: string },
>(input: {
    swatchId: string
    newColorUpper: string
    makeTransparent: boolean
    autoSwatches: ReadonlyArray<TSwatch>
    userSwatches: ReadonlyArray<TSwatch>
}): { nextAuto: TSwatch[]; nextUser: TSwatch[] } {
    const patch = (swatch: TSwatch): TSwatch =>
        swatch.id === input.swatchId
            ? ({
                  ...swatch,
                  color: input.newColorUpper,
                  isTransparent: input.makeTransparent,
              } as TSwatch)
            : swatch

    return {
        nextAuto: input.autoSwatches.map(patch),
        nextUser: input.userSwatches.map(patch),
    }
}

export function prepareAutoOverridesForSwatchEdit(input: {
    swatchId: string
    newColorUpper: string
    makeTransparent: boolean
    autoSwatches: ReadonlyArray<PalettePaintSwatchLike>
    currentOverrides?: PaletteAutoOverridesMap<PaletteAutoOverrideLike> | null
}): PaletteAutoOverridesMap<PaletteAutoOverrideLike> {
    const nextAutoOverrides: PaletteAutoOverridesMap<PaletteAutoOverrideLike> =
        {
            ...(input.currentOverrides || {}),
        }

    if (!input.swatchId.startsWith("auto-")) {
        return nextAutoOverrides
    }

    const existingOverride = input.currentOverrides?.[input.swatchId]
    const sourceAuto = input.autoSwatches.find(
        (swatch) => swatch.id === input.swatchId
    )
    const hasHex = /^#[0-9A-F]{6}$/.test(input.newColorUpper)
    const nextIsTransparent = !!input.makeTransparent
    const nextHex = input.newColorUpper.toUpperCase()
    const sourceHex = normalizeSwatchColor(sourceAuto?.color)

    if (
        !existingOverride &&
        sourceAuto &&
        !!sourceAuto.isTransparent === nextIsTransparent &&
        (!hasHex || sourceHex === nextHex)
    ) {
        delete nextAutoOverrides[input.swatchId]
        return nextAutoOverrides
    }

    const entry: PaletteAutoOverrideLike = {}
    if (!nextIsTransparent && hasHex) entry.hex = nextHex
    entry.isTransparent = nextIsTransparent
    nextAutoOverrides[input.swatchId] = entry

    return nextAutoOverrides
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

export function resolvePaletteWorldSelection(input: {
    autoSwatches:
        | ReadonlyArray<PaletteSwatchLike | null | undefined>
        | null
        | undefined
    userSwatches:
        | ReadonlyArray<PaletteSwatchLike | null | undefined>
        | null
        | undefined
    preferredSwatch?: PaletteSelection | null
}): PaletteSelection {
    const { autoSwatches, userSwatches, preferredSwatch } = input

    if (preferredSwatch === "transparent") return preferredSwatch
    if (preferredSwatch && swatchListHasId(userSwatches, preferredSwatch)) {
        return preferredSwatch
    }
    if (preferredSwatch && swatchListHasId(autoSwatches, preferredSwatch)) {
        return preferredSwatch
    }

    return (
        autoSwatches?.find((swatch) => swatch?.id)?.id ??
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

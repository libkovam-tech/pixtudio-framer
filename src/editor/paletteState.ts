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

type RgbColor = { r: number; g: number; b: number }
type OklabColor = { l: number; a: number; b: number }

export type PaletteTabWorldState<TWorld> = {
    activeTab: PaletteTabKey
    sizeWorld: TWorld | null
    presetsWorld: TWorld | null
}

export type PaletteWorldSnapshotLike<
    TSwatch extends PaletteSwatchLike & { id: string },
    TPixel extends string | null,
> = {
    profile: {
        kind: "extract" | "fixed"
        id?: string
    }
    autoSwatches: ReadonlyArray<TSwatch>
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    canvasPixels: TPixel[][]
}

export type PaletteWorldSnapshotApplication<
    TSwatch extends PaletteSwatchLike & { id: string },
    TPixel extends string | null,
> = {
    autoSwatches: TSwatch[]
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    canvasPixels: TPixel[][]
    selectedSwatch: PaletteSelection
    activePresetButton: string | null
    activePaletteTab: PaletteTabKey
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

function clonePaletteSwatches<TSwatch>(swatches: ReadonlyArray<TSwatch>) {
    return swatches.map((swatch) =>
        swatch && typeof swatch === "object" ? { ...swatch } : swatch
    )
}

function clonePaletteGrid<TPixel>(pixels: TPixel[][]): TPixel[][] {
    return pixels.map((row) => row.slice())
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

function colorToDeletedAutoHex(color: string | null | undefined): string {
    const normalized = normalizeSwatchColor(color)
    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : "#FF0000"
}

function parseDeletedAutoColorToRgb(color: string): RgbColor | null {
    const str = (color || "").trim()
    const rgbMatch =
        /rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i.exec(
            str
        )
    if (rgbMatch) {
        return {
            r: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[1])))),
            g: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[2])))),
            b: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[3])))),
        }
    }

    const hex = str.replace(/^#/, "")
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        }
    }

    return null
}

const AUTO_SWATCH_DELETE_OKLAB_RADIUS = 0.05
const AUTO_SWATCH_DELETE_MAX_LIGHTNESS_DELTA = 0.08

function srgbChannelToLinear01ForOklab(value: number): number {
    const n = Math.max(0, Math.min(255, Math.round(value))) / 255
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
}

function rgbToOklabColor(rgb: RgbColor): OklabColor {
    const r = srgbChannelToLinear01ForOklab(rgb.r)
    const g = srgbChannelToLinear01ForOklab(rgb.g)
    const b = srgbChannelToLinear01ForOklab(rgb.b)
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    const l3 = Math.cbrt(l)
    const m3 = Math.cbrt(m)
    const s3 = Math.cbrt(s)

    return {
        l: 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3,
        a: 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3,
        b: 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3,
    }
}

function oklabDistance(a: OklabColor, b: OklabColor): number {
    const dl = a.l - b.l
    const da = a.a - b.a
    const db = a.b - b.b
    return Math.sqrt(dl * dl + da * da + db * db)
}

function expandDeletedAutoPaletteColorsByOklab(input: {
    sourcePixels: (string | null)[][]
    deletedColor: string
    currentDeletedColors: string[]
}): string[] {
    const baseHex = colorToDeletedAutoHex(input.deletedColor)
    const deletedRgb = parseDeletedAutoColorToRgb(baseHex)
    if (!deletedRgb) {
        return input.currentDeletedColors.includes(baseHex)
            ? input.currentDeletedColors.slice()
            : [...input.currentDeletedColors, baseHex]
    }

    const deletedLab = rgbToOklabColor(deletedRgb)
    const out = new Set(
        input.currentDeletedColors.map((color) => color.toUpperCase())
    )
    out.add(baseHex)

    for (const row of input.sourcePixels) {
        for (const color of row) {
            if (color == null) continue

            const rgb = parseDeletedAutoColorToRgb(color)
            if (!rgb) continue

            const lab = rgbToOklabColor(rgb)
            if (
                Math.abs(lab.l - deletedLab.l) <=
                    AUTO_SWATCH_DELETE_MAX_LIGHTNESS_DELTA &&
                oklabDistance(lab, deletedLab) <=
                    AUTO_SWATCH_DELETE_OKLAB_RADIUS
            ) {
                out.add(colorToDeletedAutoHex(color))
            }
        }
    }

    return Array.from(out)
}

export function appendDeletedAutoPaletteColor(input: {
    color: string
    currentDeletedColors: string[]
    sourcePixels?: (string | null)[][]
}): string[] {
    if (input.sourcePixels) {
        return expandDeletedAutoPaletteColorsByOklab({
            sourcePixels: input.sourcePixels,
            deletedColor: input.color,
            currentDeletedColors: input.currentDeletedColors,
        })
    }

    const nextColor = colorToDeletedAutoHex(input.color)
    if (input.currentDeletedColors.includes(nextColor)) {
        return input.currentDeletedColors.slice()
    }
    return [...input.currentDeletedColors, nextColor]
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

export function prepareSwatchDelete<
    TSwatch extends PaletteSwatchLike & { id: string },
    TPixel extends string | null,
    TOverride,
>(input: {
    swatchId: string
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    autoSwatches: ReadonlyArray<TSwatch>
    userSwatches: ReadonlyArray<TSwatch>
    selectedSwatch: PaletteSelection
    autoOverrides: PaletteAutoOverridesMap<TOverride>
    pruneAutoOverrides?: (
        currentAuto: TSwatch[],
        overrides: PaletteAutoOverridesMap<TOverride>
    ) => PaletteAutoOverridesMap<TOverride>
}): {
    removed: boolean
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    autoSwatches: TSwatch[]
    userSwatches: TSwatch[]
    selectedSwatch: PaletteSelection
    autoOverrides: PaletteAutoOverridesMap<TOverride>
} {
    const nextAuto = input.autoSwatches.filter(
        (swatch) => swatch.id !== input.swatchId
    )
    const nextUser = input.userSwatches.filter(
        (swatch) => swatch.id !== input.swatchId
    )
    const removed =
        nextAuto.length !== input.autoSwatches.length ||
        nextUser.length !== input.userSwatches.length

    if (!removed) {
        return {
            removed: false,
            imagePixels: input.imagePixels,
            overlayPixels: input.overlayPixels,
            autoSwatches: input.autoSwatches.slice(),
            userSwatches: input.userSwatches.slice(),
            selectedSwatch: input.selectedSwatch,
            autoOverrides: input.autoOverrides,
        }
    }

    const nextImage = removePalettePixelValueFromGrid(
        input.imagePixels,
        input.swatchId
    )
    const nextOverlay = removePalettePixelValueFromGrid(
        input.overlayPixels,
        input.swatchId
    )
    const nextSelected =
        input.selectedSwatch === input.swatchId
            ? nextAuto[0]?.id ?? nextUser[0]?.id ?? "transparent"
            : input.selectedSwatch
    const nextAutoOverrides: PaletteAutoOverridesMap<TOverride> = {
        ...(input.autoOverrides || {}),
    }
    delete nextAutoOverrides[input.swatchId]

    return {
        removed: true,
        imagePixels: nextImage,
        overlayPixels: nextOverlay,
        autoSwatches: nextAuto,
        userSwatches: nextUser,
        selectedSwatch: nextSelected,
        autoOverrides: input.pruneAutoOverrides
            ? input.pruneAutoOverrides(nextAuto, nextAutoOverrides)
            : nextAutoOverrides,
    }
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

export function preparePaletteSwatchEditApplication<
    TSwatch extends PalettePaintSwatchLike & { id: string },
    TPixel extends string | null,
>(input: {
    swatchId: string
    newColorUpper: string
    makeTransparent: boolean
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    autoSwatches: ReadonlyArray<TSwatch>
    userSwatches: ReadonlyArray<TSwatch>
    selectedSwatch: PaletteSelection
    autoOverrides?: PaletteAutoOverridesMap<PaletteAutoOverrideLike> | null
    pruneAutoOverrides?: (
        currentAuto: TSwatch[],
        overrides: PaletteAutoOverridesMap<PaletteAutoOverrideLike>
    ) => PaletteAutoOverridesMap<PaletteAutoOverrideLike>
}): {
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    autoSwatches: TSwatch[]
    userSwatches: TSwatch[]
    autoOverrides: PaletteAutoOverridesMap<PaletteAutoOverrideLike>
    selectedSwatch: PaletteSelection
} {
    const { nextAuto, nextUser } = prepareSwatchesForEdit({
        swatchId: input.swatchId,
        newColorUpper: input.newColorUpper,
        makeTransparent: input.makeTransparent,
        autoSwatches: input.autoSwatches,
        userSwatches: input.userSwatches,
    })

    const nextAutoOverrides = prepareAutoOverridesForSwatchEdit({
        swatchId: input.swatchId,
        newColorUpper: input.newColorUpper,
        makeTransparent: input.makeTransparent,
        autoSwatches: input.autoSwatches,
        currentOverrides: input.autoOverrides,
    })

    return collapseDuplicateSwatchesAndRemapPixels({
        imagePixels: input.imagePixels,
        overlayPixels: input.overlayPixels,
        nextAuto,
        nextUser,
        nextAutoOverrides,
        selectedSwatch: input.selectedSwatch,
        pruneAutoOverrides: input.pruneAutoOverrides,
    })
}

export function preparePaletteWorldSnapshotApplication<
    TSwatch extends PaletteSwatchLike & { id: string },
    TPixel extends string | null,
>(input: {
    world: PaletteWorldSnapshotLike<TSwatch, TPixel>
    userSwatches:
        | ReadonlyArray<PaletteSwatchLike | null | undefined>
        | null
        | undefined
    selectedSwatch: PaletteSelection
    preferredSwatch?: PaletteSelection | null
    activeTab: PaletteTabKey
}): PaletteWorldSnapshotApplication<TSwatch, TPixel> {
    const autoSwatches = clonePaletteSwatches(input.world.autoSwatches)
    const selectedSwatch = resolveSelectedSwatchAfterAutoChange({
        nextAutoSwatches: autoSwatches,
        userSwatches: input.userSwatches,
        selectedSwatch: input.selectedSwatch,
        preferredSwatch: input.preferredSwatch,
    })
    const activePresetButton =
        input.world.profile.kind === "fixed"
            ? input.world.profile.id ?? null
            : null

    return {
        autoSwatches,
        imagePixels: clonePaletteGrid(input.world.imagePixels),
        overlayPixels: clonePaletteGrid(input.world.overlayPixels),
        canvasPixels: clonePaletteGrid(input.world.canvasPixels),
        selectedSwatch,
        activePresetButton,
        activePaletteTab:
            input.world.profile.kind === "fixed" ? "presets" : input.activeTab,
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

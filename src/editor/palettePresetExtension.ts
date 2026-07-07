import {
    buildDrawingPaletteWorld,
    getFixedProfilePaletteForApplication,
} from "./paletteQuantizationEngine.ts"

export type EditableFixedPaletteProfile = {
    kind: "fixed"
    source: "builtin" | "imported"
    id: string
    name: string
    colors: string[]
}

export type FixedPaletteExtensionResult<
    T extends EditableFixedPaletteProfile,
> = {
    profile: T
    colorIndex: number
    added: boolean
}

export type FixedPaletteSwatchDeleteResult<
    T extends EditableFixedPaletteProfile,
    TSelection extends string,
> = {
    profile: T
    selectedSwatch: TSelection
    removed: boolean
}

export type FixedPaletteEditSwatchLike = {
    id: string
    color: string
    isTransparent?: boolean
}

export type FixedPaletteSwatchEditResult<
    TProfile extends EditableFixedPaletteProfile,
    TSwatch extends FixedPaletteEditSwatchLike,
> = {
    profile: TProfile
    autoSwatches: TSwatch[]
    edited: boolean
}

export type FixedPaletteSwatchExtensionResult<
    TSwatch extends FixedPaletteEditSwatchLike,
> = {
    autoSwatches: TSwatch[]
    selectedSwatch: string
}

export type FixedPalettePresetSwatchCreateResult<
    TProfile extends EditableFixedPaletteProfile,
    TPreset extends ImportedPalettePresetRecord,
    TSwatch extends FixedPaletteEditSwatchLike,
> =
    | {
          kind: "ignored"
      }
    | {
          kind: "existing"
          profile: TProfile
          selectedSwatch: string
          importedPalettePresets: TPreset[]
      }
    | {
          kind: "added"
          profile: TProfile
          selectedSwatch: string
          autoSwatches: TSwatch[]
          importedPalettePresets: TPreset[]
      }

export type FixedPalettePresetSwatchDeleteApplicationResult<
    TProfile extends EditableFixedPaletteProfile,
    TPreset extends ImportedPalettePresetRecord,
> =
    | {
          kind: "ignored"
      }
    | {
          kind: "deleted"
          profile: TProfile
          selectedSwatch: string
          importedPalettePresets: TPreset[]
      }

export type FixedPalettePresetSwatchEditApplicationResult<
    TProfile extends EditableFixedPaletteProfile,
    TPreset extends ImportedPalettePresetRecord,
    TSwatch extends FixedPaletteEditSwatchLike,
> =
    | {
          kind: "ignored"
      }
    | {
          kind: "edited"
          profile: TProfile
          autoSwatches: TSwatch[]
          importedPalettePresets: TPreset[]
      }

export type FixedPaletteVocabularyExtensionWorld<
    TProfile extends EditableFixedPaletteProfile,
    TSwatch extends FixedPaletteEditSwatchLike,
    TPixel extends string | null,
> = {
    profile: TProfile
    referenceSignature?: string | null
    autoSwatches: TSwatch[]
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    canvasPixels: TPixel[][]
}

export type FixedPaletteVocabularyExtensionWorldResult<
    TProfile extends EditableFixedPaletteProfile,
    TSwatch extends FixedPaletteEditSwatchLike,
    TPixel extends string | null,
> = {
    world: FixedPaletteVocabularyExtensionWorld<TProfile, TSwatch, TPixel>
    selectedSwatch: string
}

export type FixedPaletteVocabularyExtensionWorldInput<
    TProfile extends EditableFixedPaletteProfile,
    TSwatch extends FixedPaletteEditSwatchLike,
    TPixel extends string | null,
> = {
    profile: TProfile
    referenceSignature?: string | null
    autoSwatches: ReadonlyArray<TSwatch>
    candidateAutoSwatches?: ReadonlyArray<TSwatch> | null
    candidateImagePixels?: TPixel[][] | null
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    selectedSwatch: string
}

export type FixedPaletteVocabularyExtensionApplicationResult<
    TProfile extends EditableFixedPaletteProfile,
    TSwatch extends FixedPaletteEditSwatchLike,
    TPixel extends string | null,
> = FixedPaletteVocabularyExtensionWorldResult<TProfile, TSwatch, TPixel> & {
    autoSwatches: TSwatch[]
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    canvasPixels: TPixel[][]
}

export type ImportedPalettePresetRecord<
    T extends EditableFixedPaletteProfile = EditableFixedPaletteProfile,
> = {
    id: string
    name: string
    profile: T
}

export type FixedPaletteAutoSwatch = {
    id: string
    color: string
    isTransparent: boolean
    isUser: boolean
}

function normalizeImportedPaletteHex(color: string): string | null {
    const nextColor = color.trim().toUpperCase()
    if (!/^#[0-9A-F]{6}$/.test(nextColor)) return null
    return nextColor
}

function cloneSwatches<TSwatch>(swatches: ReadonlyArray<TSwatch>): TSwatch[] {
    return swatches.map((swatch) =>
        swatch && typeof swatch === "object" ? { ...swatch } : swatch
    )
}

function clonePixelGrid<TPixel>(pixels: TPixel[][]): TPixel[][] {
    return pixels.map((row) => row.slice())
}

function assignNewVocabularySwatchCells<
    TSwatch extends FixedPaletteEditSwatchLike,
    TPixel extends string | null,
>(input: {
    autoSwatches: ReadonlyArray<TSwatch>
    candidateAutoSwatches?: ReadonlyArray<TSwatch> | null
    candidateImagePixels?: TPixel[][] | null
    imagePixels: TPixel[][]
    selectedSwatch: string
}): TPixel[][] {
    if (!input.candidateImagePixels) return input.imagePixels

    const selectedSwatch = input.autoSwatches.find(
        (swatch) => swatch.id === input.selectedSwatch
    )
    if (!selectedSwatch) return input.imagePixels

    const candidateSelectedSwatch =
        input.candidateAutoSwatches?.find(
            (swatch) =>
                normalizeEditablePaletteColor(swatch.color) ===
                normalizeEditablePaletteColor(selectedSwatch.color)
        )?.id ?? selectedSwatch.id

    return input.imagePixels.map((row, rowIndex) =>
        row.map((pixel, columnIndex) => {
            if (
                input.candidateImagePixels?.[rowIndex]?.[columnIndex] ===
                candidateSelectedSwatch
            ) {
                return selectedSwatch.id as TPixel
            }
            return pixel
        })
    )
}

function componentToHex(c: number) {
    const hex = c.toString(16)
    return hex.length === 1 ? "0" + hex : hex
}

function parseRGB(color: string) {
    const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(color)
    if (!m) return { r: 0, g: 0, b: 0 }
    return {
        r: parseInt(m[1], 10),
        g: parseInt(m[2], 10),
        b: parseInt(m[3], 10),
    }
}

function parseHSL(color: string) {
    const m = /hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/.exec(color)
    if (!m) return { h: 0, s: 0, l: 0 }
    return {
        h: parseInt(m[1], 10),
        s: parseInt(m[2], 10),
        l: parseInt(m[3], 10),
    }
}

function hslToRgb(h: number, s: number, l: number) {
    h = ((h % 360) + 360) % 360
    s /= 100
    l /= 100

    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2

    let r1 = 0
    let g1 = 0
    let b1 = 0
    if (h < 60) {
        r1 = c
        g1 = x
    } else if (h < 120) {
        r1 = x
        g1 = c
    } else if (h < 180) {
        g1 = c
        b1 = x
    } else if (h < 240) {
        g1 = x
        b1 = c
    } else if (h < 300) {
        r1 = x
        b1 = c
    } else {
        r1 = c
        b1 = x
    }

    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    }
}

function cssColorToHex(color: string | null) {
    if (!color) return "#ff0000"

    if (color.startsWith("#")) {
        if (color.length === 7) return color
        if (color.length === 4) {
            const r = color[1]
            const g = color[2]
            const b = color[3]
            return "#" + r + r + g + g + b + b
        }
        return "#ff0000"
    }

    if (color.startsWith("rgb")) {
        const { r, g, b } = parseRGB(color)
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b)
    }

    if (color.startsWith("hsl")) {
        const { h, s, l } = parseHSL(color)
        const { r, g, b } = hslToRgb(h, s, l)
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b)
    }

    return "#ff0000"
}

function normalizeEditablePaletteColor(color: string): string {
    return cssColorToHex(color).toUpperCase()
}

export function makeAutoSwatchesFromFixedProfile(
    profile: EditableFixedPaletteProfile
): FixedPaletteAutoSwatch[] {
    return getFixedProfilePaletteForApplication(profile).map((color, index) => ({
        id: `auto-${index}`,
        color,
        isTransparent: false,
        isUser: false,
    }))
}

export function makeEditableFixedPresetProfile<
    T extends EditableFixedPaletteProfile,
>(
    profile: T,
    makeImportedId: () => string
): EditableFixedPaletteProfile & { source: "imported" } {
    if (profile.source === "imported") {
        return {
            ...profile,
            colors: profile.colors.map(normalizeEditablePaletteColor),
        } as EditableFixedPaletteProfile & { source: "imported" }
    }

    return {
        kind: "fixed",
        source: "imported",
        id: makeImportedId(),
        name: `${profile.name} Custom`,
        colors: getFixedProfilePaletteForApplication(profile).map(
            normalizeEditablePaletteColor
        ),
    }
}

export function makeImportedPalettePresetName(fileName: string): string {
    const trimmedName = fileName.trim()
    return (
        trimmedName
            .replace(/\.(pixtudio|json|png|jpe?g|webp|gif|bmp|avif)$/i, "")
            .trim() || "Imported palette"
    )
}

export function makeImportedPalettePreset<
    T extends EditableFixedPaletteProfile,
>(profile: T): ImportedPalettePresetRecord<T> {
    return {
        id: profile.id,
        name: profile.name,
        profile,
    }
}

export function upsertImportedPalettePreset<
    TPreset extends ImportedPalettePresetRecord,
>(
    registry: ReadonlyArray<TPreset>,
    profile: EditableFixedPaletteProfile
): TPreset[] {
    const preset = makeImportedPalettePreset(profile) as TPreset
    const exists = registry.some((item) => item.id === profile.id)
    return exists
        ? registry.map((item) =>
              item.id === profile.id ? { ...item, ...preset } : item
          )
        : [...registry, preset]
}

export function extendFixedPaletteProfile<
    T extends EditableFixedPaletteProfile,
>(
    profile: T,
    color: string
): FixedPaletteExtensionResult<T> | null {
    const nextColor = normalizeImportedPaletteHex(color)
    if (!nextColor) return null

    const existingIndex = profile.colors.findIndex(
        (item) => item.toUpperCase() === nextColor
    )

    if (existingIndex >= 0) {
        return {
            profile,
            colorIndex: existingIndex,
            added: false,
        }
    }

    return {
        profile: {
            ...profile,
            colors: [...profile.colors, nextColor],
        },
        colorIndex: profile.colors.length,
        added: true,
    }
}

export function findPaletteColorIndexByHex(
    colors: readonly string[],
    color: string
): number | null {
    const targetColor = normalizeImportedPaletteHex(color)
    if (!targetColor) return null

    const colorIndex = colors.findIndex(
        (item) => normalizeImportedPaletteHex(item) === targetColor
    )

    return colorIndex >= 0 ? colorIndex : null
}

export function removeFixedPaletteProfileColor<
    T extends EditableFixedPaletteProfile,
>(profile: T, colorIndex: number): { profile: T; removed: boolean } {
    if (!Number.isInteger(colorIndex)) {
        return { profile, removed: false }
    }
    if (profile.colors.length <= 1) {
        return { profile, removed: false }
    }
    if (colorIndex < 0 || colorIndex >= profile.colors.length) {
        return { profile, removed: false }
    }

    return {
        profile: {
            ...profile,
            colors: profile.colors.filter((_, index) => index !== colorIndex),
        },
        removed: true,
    }
}

export function removeFixedPaletteProfileColorByHex<
    T extends EditableFixedPaletteProfile,
>(profile: T, color: string): { profile: T; removed: boolean } {
    const targetColor = normalizeImportedPaletteHex(color)
    if (!targetColor) {
        return { profile, removed: false }
    }

    const colorIndex = profile.colors.findIndex(
        (item) => normalizeImportedPaletteHex(item) === targetColor
    )

    return removeFixedPaletteProfileColor(profile, colorIndex)
}

export function prepareFixedPaletteSwatchEdit<
    TProfile extends EditableFixedPaletteProfile,
    TSwatch extends FixedPaletteEditSwatchLike,
>(input: {
    profile: TProfile
    swatchId: string
    displayedColor: string
    nextColor: string
    autoSwatches: ReadonlyArray<TSwatch>
}): FixedPaletteSwatchEditResult<TProfile, TSwatch> {
    const targetColor = normalizeImportedPaletteHex(input.displayedColor)
    const nextColor = normalizeImportedPaletteHex(input.nextColor)
    if (!targetColor || !nextColor) {
        return {
            profile: input.profile,
            autoSwatches: input.autoSwatches.slice(),
            edited: false,
        }
    }

    let replaced = false
    const nextColors = input.profile.colors.map((color) => {
        const colorHex = normalizeImportedPaletteHex(color)
        if (!replaced && colorHex === targetColor) {
            replaced = true
            return nextColor
        }
        return colorHex ?? color
    })

    if (!replaced) {
        return {
            profile: input.profile,
            autoSwatches: input.autoSwatches.slice(),
            edited: false,
        }
    }

    return {
        profile: {
            ...input.profile,
            colors: nextColors,
        },
        autoSwatches: input.autoSwatches.map((swatch) =>
            swatch.id === input.swatchId
                ? ({
                      ...swatch,
                      color: nextColor,
                      isTransparent: false,
                  } as TSwatch)
                : swatch
        ),
        edited: true,
    }
}

export function prepareFixedPalettePresetSwatchEditApplication<
    TProfile extends EditableFixedPaletteProfile & { source: "imported" },
    TPreset extends ImportedPalettePresetRecord,
    TSwatch extends FixedPaletteEditSwatchLike,
>(input: {
    profile: TProfile
    swatchId: string
    displayedColor: string
    nextColor: string
    autoSwatches: ReadonlyArray<TSwatch>
    importedPalettePresets: ReadonlyArray<TPreset>
}): FixedPalettePresetSwatchEditApplicationResult<
    TProfile,
    TPreset,
    TSwatch
> {
    const preparedEdit = prepareFixedPaletteSwatchEdit({
        profile: input.profile,
        swatchId: input.swatchId,
        displayedColor: input.displayedColor,
        nextColor: input.nextColor,
        autoSwatches: input.autoSwatches,
    })
    if (!preparedEdit.edited) return { kind: "ignored" }

    return {
        kind: "edited",
        profile: preparedEdit.profile,
        autoSwatches: preparedEdit.autoSwatches,
        importedPalettePresets: upsertImportedPalettePreset(
            input.importedPalettePresets,
            preparedEdit.profile
        ),
    }
}

function makeNextAutoSwatchId<TSwatch extends FixedPaletteEditSwatchLike>(
    swatches: ReadonlyArray<TSwatch>
): string {
    let maxIndex = -1
    for (const swatch of swatches) {
        const match = /^auto-(\d+)$/.exec(swatch.id)
        if (!match) continue
        maxIndex = Math.max(maxIndex, Number(match[1]))
    }
    return `auto-${maxIndex + 1}`
}

export function prepareFixedPaletteSwatchExtension<
    TSwatch extends FixedPaletteEditSwatchLike,
>(input: {
    autoSwatches: ReadonlyArray<TSwatch>
    color: string
    makeSwatch: (id: string, color: string) => TSwatch
}): FixedPaletteSwatchExtensionResult<TSwatch> | null {
    const nextColor = normalizeImportedPaletteHex(input.color)
    if (!nextColor) return null

    const existingSwatch = input.autoSwatches.find(
        (swatch) => normalizeImportedPaletteHex(swatch.color) === nextColor
    )
    if (existingSwatch) {
        return {
            autoSwatches: input.autoSwatches.slice(),
            selectedSwatch: existingSwatch.id,
        }
    }

    const id = makeNextAutoSwatchId(input.autoSwatches)
    const swatch = input.makeSwatch(id, nextColor)
    return {
        autoSwatches: [...input.autoSwatches, swatch],
        selectedSwatch: id,
    }
}

export function prepareFixedPalettePresetSwatchCreate<
    TProfile extends EditableFixedPaletteProfile & { source: "imported" },
    TPreset extends ImportedPalettePresetRecord,
    TSwatch extends FixedPaletteEditSwatchLike,
>(input: {
    profile: TProfile
    color: string
    autoSwatches: ReadonlyArray<TSwatch>
    importedPalettePresets: ReadonlyArray<TPreset>
    makeSwatch: (id: string, color: string) => TSwatch
}): FixedPalettePresetSwatchCreateResult<TProfile, TPreset, TSwatch> {
    const extension = extendFixedPaletteProfile(input.profile, input.color)
    if (!extension) return { kind: "ignored" }

    if (!extension.added) {
        const existingSwatch = input.autoSwatches.find(
            (swatch) =>
                normalizeImportedPaletteHex(swatch.color) ===
                normalizeImportedPaletteHex(input.color)
        )
        const applicationColorIndex = findPaletteColorIndexByHex(
            getFixedProfilePaletteForApplication(extension.profile),
            input.color
        )
        return {
            kind: "existing",
            profile: extension.profile,
            selectedSwatch:
                existingSwatch?.id ??
                `auto-${applicationColorIndex ?? extension.colorIndex}`,
            importedPalettePresets: input.importedPalettePresets.slice(),
        }
    }

    const preparedExtension = prepareFixedPaletteSwatchExtension({
        autoSwatches: input.autoSwatches,
        color: input.color,
        makeSwatch: input.makeSwatch,
    })
    if (!preparedExtension) return { kind: "ignored" }

    return {
        kind: "added",
        profile: extension.profile,
        selectedSwatch: preparedExtension.selectedSwatch,
        autoSwatches: preparedExtension.autoSwatches,
        importedPalettePresets: upsertImportedPalettePreset(
            input.importedPalettePresets,
            extension.profile
        ),
    }
}

export function prepareFixedPaletteVocabularyExtensionWorld<
    TProfile extends EditableFixedPaletteProfile,
    TSwatch extends FixedPaletteEditSwatchLike,
    TPixel extends string | null,
>(
    input: FixedPaletteVocabularyExtensionWorldInput<
        TProfile,
        TSwatch,
        TPixel
    >
): FixedPaletteVocabularyExtensionWorldResult<TProfile, TSwatch, TPixel> {
    const autoSwatches = cloneSwatches(input.autoSwatches)
    const imagePixels = assignNewVocabularySwatchCells({
        autoSwatches,
        candidateAutoSwatches: input.candidateAutoSwatches,
        candidateImagePixels: input.candidateImagePixels,
        imagePixels: input.imagePixels,
        selectedSwatch: input.selectedSwatch,
    })
    const world = buildDrawingPaletteWorld({
        profile: input.profile,
        referenceSignature: input.referenceSignature,
        palette: autoSwatches.map((swatch) => swatch.color),
        imagePixels,
        overlayPixels: input.overlayPixels,
        makeAutoSwatchId: (index) => autoSwatches[index]?.id ?? `auto-${index}`,
    })

    return {
        world: {
            ...world,
            profile: input.profile,
            autoSwatches,
        },
        selectedSwatch: input.selectedSwatch,
    }
}

export function prepareFixedPaletteVocabularyExtensionApplication<
    TProfile extends EditableFixedPaletteProfile,
    TSwatch extends FixedPaletteEditSwatchLike,
    TPixel extends string | null,
>(
    input: FixedPaletteVocabularyExtensionWorldInput<
        TProfile,
        TSwatch,
        TPixel
    >
): FixedPaletteVocabularyExtensionApplicationResult<
    TProfile,
    TSwatch,
    TPixel
> {
    const prepared = prepareFixedPaletteVocabularyExtensionWorld(input)

    return {
        ...prepared,
        autoSwatches: cloneSwatches(prepared.world.autoSwatches),
        imagePixels: clonePixelGrid(prepared.world.imagePixels),
        overlayPixels: clonePixelGrid(prepared.world.overlayPixels),
        canvasPixels: clonePixelGrid(prepared.world.canvasPixels),
    }
}

export function prepareFixedPaletteSwatchDelete<
    T extends EditableFixedPaletteProfile,
    TSelection extends string,
>(input: {
    profile: T
    swatchColor: string
    swatchId: TSelection
    swatchIndex: number | null
    selectedSwatch: TSelection
}): FixedPaletteSwatchDeleteResult<T, TSelection> {
    if (input.swatchIndex == null) {
        return {
            profile: input.profile,
            selectedSwatch: input.selectedSwatch,
            removed: false,
        }
    }

    const result = removeFixedPaletteProfileColorByHex(
        input.profile,
        input.swatchColor
    )
    if (!result.removed) {
        return {
            profile: input.profile,
            selectedSwatch: input.selectedSwatch,
            removed: false,
        }
    }

    return {
        profile: result.profile,
        selectedSwatch:
            input.selectedSwatch === input.swatchId
                ? (`auto-${Math.max(0, input.swatchIndex - 1)}` as TSelection)
                : input.selectedSwatch,
        removed: true,
    }
}

export function prepareFixedPalettePresetSwatchDeleteApplication<
    TProfile extends EditableFixedPaletteProfile & { source: "imported" },
    TPreset extends ImportedPalettePresetRecord,
>(input: {
    profile: TProfile
    swatchColor: string
    swatchId: string
    swatchIndex: number | null
    selectedSwatch: string
    importedPalettePresets: ReadonlyArray<TPreset>
}): FixedPalettePresetSwatchDeleteApplicationResult<TProfile, TPreset> {
    const preparedDelete = prepareFixedPaletteSwatchDelete({
        profile: input.profile,
        swatchColor: input.swatchColor,
        swatchId: input.swatchId,
        swatchIndex: input.swatchIndex,
        selectedSwatch: input.selectedSwatch,
    })
    if (!preparedDelete.removed) return { kind: "ignored" }

    return {
        kind: "deleted",
        profile: preparedDelete.profile,
        selectedSwatch: preparedDelete.selectedSwatch,
        importedPalettePresets: upsertImportedPalettePreset(
            input.importedPalettePresets,
            preparedDelete.profile
        ),
    }
}

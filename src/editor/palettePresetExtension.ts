import { getFixedProfilePaletteForApplication } from "./paletteQuantizationEngine.ts"

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

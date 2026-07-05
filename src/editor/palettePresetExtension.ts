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

export type ImportedPalettePresetRecord<
    T extends EditableFixedPaletteProfile = EditableFixedPaletteProfile,
> = {
    id: string
    name: string
    profile: T
}

function normalizeImportedPaletteHex(color: string): string | null {
    const nextColor = color.trim().toUpperCase()
    if (!/^#[0-9A-F]{6}$/.test(nextColor)) return null
    return nextColor
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

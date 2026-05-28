export type ImportedFixedPaletteProfile = {
    kind: "fixed"
    source: "imported"
    id: string
    name: string
    colors: string[]
}

export type ImportedPaletteExtensionResult<
    T extends ImportedFixedPaletteProfile,
> = {
    profile: T
    colorIndex: number
    added: boolean
}

export function extendImportedPaletteProfile<
    T extends ImportedFixedPaletteProfile,
>(
    profile: T,
    color: string
): ImportedPaletteExtensionResult<T> | null {
    const nextColor = color.trim().toUpperCase()
    if (!/^#[0-9A-F]{6}$/.test(nextColor)) return null

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

export function removeImportedPaletteProfileColor<
    T extends ImportedFixedPaletteProfile,
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

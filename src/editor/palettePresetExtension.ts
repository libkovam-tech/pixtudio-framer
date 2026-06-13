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

function normalizeImportedPaletteHex(color: string): string | null {
    const nextColor = color.trim().toUpperCase()
    if (!/^#[0-9A-F]{6}$/.test(nextColor)) return null
    return nextColor
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

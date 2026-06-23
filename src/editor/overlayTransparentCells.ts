export type OverlayTransparentSwatch = {
    id: string
    isTransparent: boolean
}

export type OverlayPixel<TTransparent> = string | null | TTransparent

export function isTransparentOverlayPixel<TTransparent>(
    value: OverlayPixel<TTransparent>,
    options: {
        transparentPixel: TTransparent
        swatches: ReadonlyArray<OverlayTransparentSwatch>
    }
): boolean {
    if (value == null) return false
    if (value === options.transparentPixel) return true
    if (typeof value !== "string") return false

    return options.swatches.some(
        (candidate) => candidate.id === value && candidate.isTransparent
    )
}

export function preserveTransparentOverlayPixels<TTransparent>(params: {
    overlay: ReadonlyArray<ReadonlyArray<OverlayPixel<TTransparent>>>
    transparentSource: ReadonlyArray<ReadonlyArray<OverlayPixel<TTransparent>>>
    transparentPixel: TTransparent
    swatches: ReadonlyArray<OverlayTransparentSwatch>
}): OverlayPixel<TTransparent>[][] {
    let changed = false
    const out = params.overlay.map((row) => row.slice())
    const transparentSwatchIds = new Set(
        params.swatches
            .filter((swatch) => swatch.isTransparent)
            .map((swatch) => swatch.id)
    )

    for (let row = 0; row < out.length; row++) {
        const sourceRow = params.transparentSource[row] ?? []
        const outRow = out[row]

        for (let column = 0; column < outRow.length; column++) {
            const sourceValue = sourceRow[column] ?? null
            if (sourceValue == null) continue

            const isExplicitTransparent =
                sourceValue === params.transparentPixel
            const isTransparentSwatch =
                typeof sourceValue === "string" &&
                transparentSwatchIds.has(sourceValue)

            if (!isExplicitTransparent && !isTransparentSwatch) {
                continue
            }

            if (outRow[column] !== sourceValue) {
                outRow[column] = sourceValue
                changed = true
            }
        }
    }

    return changed ? out : params.overlay.map((row) => row.slice())
}

export type AspectRatioId =
    | "16:9"
    | "3:2"
    | "4:3"
    | "1:1"
    | "3:4"
    | "2:3"
    | "9:16"

export type AspectRatioOrientation = "horizontal" | "square" | "vertical"

export type AspectRatioTemplate = {
    id: AspectRatioId
    orientation: AspectRatioOrientation
    shortRatio: number
    longRatio: number
}

export type CanvasGridGeometry = {
    aspectRatioId: AspectRatioId
    gridSize: number
    columns: number
    rows: number
}

export type ReferenceDimensions = {
    aspectRatioId: AspectRatioId
    width: number
    height: number
}

export const DEFAULT_ASPECT_RATIO_ID: AspectRatioId = "1:1"
export const REFERENCE_SHORT_SIDE_PX = 512

export const ASPECT_RATIO_TEMPLATES: readonly AspectRatioTemplate[] = [
    { id: "16:9", orientation: "horizontal", shortRatio: 9, longRatio: 16 },
    { id: "3:2", orientation: "horizontal", shortRatio: 2, longRatio: 3 },
    { id: "4:3", orientation: "horizontal", shortRatio: 3, longRatio: 4 },
    { id: "1:1", orientation: "square", shortRatio: 1, longRatio: 1 },
    { id: "3:4", orientation: "vertical", shortRatio: 3, longRatio: 4 },
    { id: "2:3", orientation: "vertical", shortRatio: 2, longRatio: 3 },
    { id: "9:16", orientation: "vertical", shortRatio: 9, longRatio: 16 },
] as const

const ASPECT_RATIO_TEMPLATE_BY_ID = new Map<AspectRatioId, AspectRatioTemplate>(
    ASPECT_RATIO_TEMPLATES.map((template) => [template.id, template])
)

export function roundHalfUp(value: number): number {
    if (!Number.isFinite(value)) {
        throw new Error("roundHalfUp: value must be finite")
    }
    return Math.floor(value + 0.5)
}

export function isAspectRatioId(value: unknown): value is AspectRatioId {
    return (
        typeof value === "string" &&
        ASPECT_RATIO_TEMPLATE_BY_ID.has(value as AspectRatioId)
    )
}

export function getAspectRatioTemplate(
    aspectRatioId: AspectRatioId
): AspectRatioTemplate {
    const template = ASPECT_RATIO_TEMPLATE_BY_ID.get(aspectRatioId)
    if (!template) {
        throw new Error(`Unsupported aspect ratio: ${String(aspectRatioId)}`)
    }
    return template
}

export function calculateCanvasGridGeometry(params: {
    gridSize: number
    aspectRatioId: AspectRatioId
}): CanvasGridGeometry {
    const gridSize = params.gridSize
    if (!Number.isInteger(gridSize) || gridSize <= 0) {
        throw new Error("calculateCanvasGridGeometry: gridSize must be a positive integer")
    }

    const template = getAspectRatioTemplate(params.aspectRatioId)
    const longSide = roundHalfUp(
        (gridSize * template.longRatio) / template.shortRatio
    )

    if (template.orientation === "horizontal") {
        return {
            aspectRatioId: template.id,
            gridSize,
            columns: longSide,
            rows: gridSize,
        }
    }

    if (template.orientation === "vertical") {
        return {
            aspectRatioId: template.id,
            gridSize,
            columns: gridSize,
            rows: longSide,
        }
    }

    return {
        aspectRatioId: template.id,
        gridSize,
        columns: gridSize,
        rows: gridSize,
    }
}

export function calculateReferenceDimensions(
    aspectRatioId: AspectRatioId,
    shortSide: number = REFERENCE_SHORT_SIDE_PX
): ReferenceDimensions {
    if (!Number.isInteger(shortSide) || shortSide <= 0) {
        throw new Error(
            "calculateReferenceDimensions: shortSide must be a positive integer"
        )
    }

    const template = getAspectRatioTemplate(aspectRatioId)
    const longSide = roundHalfUp(
        (shortSide * template.longRatio) / template.shortRatio
    )

    if (template.orientation === "horizontal") {
        return {
            aspectRatioId: template.id,
            width: longSide,
            height: shortSide,
        }
    }

    if (template.orientation === "vertical") {
        return {
            aspectRatioId: template.id,
            width: shortSide,
            height: longSide,
        }
    }

    return {
        aspectRatioId: template.id,
        width: shortSide,
        height: shortSide,
    }
}

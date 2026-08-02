import {
    ASPECT_RATIO_TEMPLATES,
    DEFAULT_ASPECT_RATIO_ID,
    getAspectRatioTemplate,
    type AspectRatioId,
} from "./canvasGeometry.ts"

export type CropViewportGeometry = {
    canvasWidth: number
    canvasHeight: number
    inset: number
    viewportWidth: number
    viewportHeight: number
    viewportX: number
    viewportY: number
    viewportCenterX: number
    viewportCenterY: number
}

export function getAspectRatioDimensions(aspectRatioId: AspectRatioId): {
    width: number
    height: number
} {
    const template = getAspectRatioTemplate(aspectRatioId)
    if (template.orientation === "horizontal") {
        return { width: template.longRatio, height: template.shortRatio }
    }
    if (template.orientation === "vertical") {
        return { width: template.shortRatio, height: template.longRatio }
    }
    return { width: 1, height: 1 }
}

export function getAspectRatioCssValue(aspectRatioId: AspectRatioId): string {
    const dimensions = getAspectRatioDimensions(aspectRatioId)
    return `${dimensions.width} / ${dimensions.height}`
}

export function selectDefaultCropAspectRatio(params: {
    width: number
    height: number
}): AspectRatioId {
    const width = Math.max(1, params.width || 0)
    const height = Math.max(1, params.height || 0)
    const sourceRatio = width / height
    if (!Number.isFinite(sourceRatio) || sourceRatio <= 0) {
        return DEFAULT_ASPECT_RATIO_ID
    }

    let best: AspectRatioId = DEFAULT_ASPECT_RATIO_ID
    let bestDistance = Number.POSITIVE_INFINITY

    for (const template of ASPECT_RATIO_TEMPLATES) {
        const dimensions = getAspectRatioDimensions(template.id)
        const ratio = dimensions.width / dimensions.height
        const distance = Math.abs(Math.log(sourceRatio / ratio))
        if (distance < bestDistance) {
            best = template.id
            bestDistance = distance
        }
    }

    return best
}

export function calculateCropViewportGeometry(params: {
    canvasWidth: number
    canvasHeight: number
    insetFraction: number
}): CropViewportGeometry {
    const canvasWidth = Math.max(1, Math.round(params.canvasWidth || 0))
    const canvasHeight = Math.max(1, Math.round(params.canvasHeight || 0))
    const shortSide = Math.min(canvasWidth, canvasHeight)
    const inset = Math.max(0, Math.round(shortSide * params.insetFraction))
    const viewportShortSide = Math.max(1, shortSide - inset * 2)
    const canvasRatio = canvasWidth / canvasHeight
    let viewportWidth: number
    let viewportHeight: number
    if (canvasWidth >= canvasHeight) {
        viewportHeight = viewportShortSide
        viewportWidth = Math.max(
            1,
            Math.min(canvasWidth, Math.round(viewportHeight * canvasRatio))
        )
    } else {
        viewportWidth = viewportShortSide
        viewportHeight = Math.max(
            1,
            Math.min(canvasHeight, Math.round(viewportWidth / canvasRatio))
        )
    }
    const viewportX = (canvasWidth - viewportWidth) / 2
    const viewportY = (canvasHeight - viewportHeight) / 2

    return {
        canvasWidth,
        canvasHeight,
        inset,
        viewportWidth,
        viewportHeight,
        viewportX,
        viewportY,
        viewportCenterX: viewportX + viewportWidth / 2,
        viewportCenterY: viewportY + viewportHeight / 2,
    }
}

export function getAspectRatioButtonLabel(aspectRatioId: AspectRatioId): string {
    return aspectRatioId
}

export function AspectRatioSelector({
    value,
    onChange,
    compact = false,
}: {
    value: AspectRatioId
    onChange: (value: AspectRatioId) => void
    compact?: boolean
}) {
    return (
        <div
            role="radiogroup"
            aria-label="Aspect ratio"
            style={{
                display: "grid",
                gridTemplateColumns: compact
                    ? "repeat(7, minmax(38px, 1fr))"
                    : "repeat(7, minmax(48px, 1fr))",
                gap: compact ? 5 : 7,
                width: "100%",
                maxWidth: compact ? 390 : 470,
            }}
        >
            {ASPECT_RATIO_TEMPLATES.map((template) => {
                const selected = template.id === value
                return (
                    <button
                        key={template.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`Aspect ratio ${template.id}`}
                        title={template.id}
                        onClick={() => onChange(template.id)}
                        style={{
                            minWidth: 0,
                            height: compact ? 32 : 36,
                            border: `2px solid ${
                                selected ? "#111111" : "rgba(17,17,17,0.35)"
                            }`,
                            background: selected ? "#ffffff" : "rgba(255,255,255,0.58)",
                            color: "#111111",
                            fontSize: compact ? 11 : 12,
                            fontWeight: 800,
                            borderRadius: 6,
                            cursor: "pointer",
                            fontFamily:
                                "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
                            boxSizing: "border-box",
                        }}
                    >
                        {getAspectRatioButtonLabel(template.id)}
                    </button>
                )
            })}
        </div>
    )
}

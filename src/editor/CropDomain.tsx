import type {
    CSSProperties,
    PointerEvent as ReactPointerEvent,
    ReactNode,
    RefObject,
    TouchEvent as ReactTouchEvent,
    WheelEvent as ReactWheelEvent,
} from "react"

import {
    ASPECT_RATIO_TEMPLATES,
    DEFAULT_ASPECT_RATIO_ID,
    getAspectRatioTemplate,
    type AspectRatioId,
} from "./canvasGeometry.ts"
import { ImportActivitySpinner } from "./ImportActivitySpinner.tsx"

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

export const CROP_LAYOUT_REGION_FRACTIONS = {
    top: 5 / 24,
    middle: 14 / 24,
    bottom: 5 / 24,
} as const

export const CROP_LAYOUT_TOP_REGION_ROWS = {
    topSpacer: 2,
    content: 2,
    bottomSpacer: 1,
} as const

export const CROP_LAYOUT_BOTTOM_REGION_ROWS = {
    topSpacer: 1,
    content: 2,
    bottomSpacer: 2,
} as const

export const CROP_LAYOUT_ASPECT_SELECTOR_WIDTH_VH = 64
export const CROP_LAYOUT_MOBILE_HORIZONTAL_INSET_PX = 20

export type CropScreenRegionLayout = {
    topHeight: number
    middleHeight: number
    bottomHeight: number
    stageWidth: number
}

export function calculateCropScreenRegionLayout(params: {
    viewportWidth: number
    viewportHeight: number
    fractions?: typeof CROP_LAYOUT_REGION_FRACTIONS
}): CropScreenRegionLayout {
    const viewportHeight = Math.max(1, params.viewportHeight || 0)
    const fractions = params.fractions ?? CROP_LAYOUT_REGION_FRACTIONS
    const topHeight = viewportHeight * fractions.top
    const middleHeight = viewportHeight * fractions.middle
    const bottomHeight = viewportHeight * fractions.bottom
    const stageWidth = middleHeight

    return {
        topHeight,
        middleHeight,
        bottomHeight,
        stageWidth,
    }
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
    const maxShapeWidth = compact ? 31 : 40
    const maxShapeHeight = compact ? 27 : 32

    return (
        <div
            role="radiogroup"
            aria-label="Aspect ratio"
            style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: compact ? 7 : 9,
                width: "min(100%, 520px)",
            }}
        >
            {ASPECT_RATIO_TEMPLATES.map((template) => {
                const selected = template.id === value
                const dimensions = getAspectRatioDimensions(template.id)
                const scale = Math.min(
                    maxShapeWidth / dimensions.width,
                    maxShapeHeight / dimensions.height
                )
                const shapeWidth = Math.max(8, Math.round(dimensions.width * scale))
                const shapeHeight = Math.max(8, Math.round(dimensions.height * scale))

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
                            minWidth: compact ? 34 : 42,
                            height: compact ? 45 : 53,
                            border: "none",
                            background: "transparent",
                            color: "#111111",
                            padding: 0,
                            fontSize: compact ? 14 : 16,
                            fontWeight: 800,
                            cursor: "pointer",
                            fontFamily:
                                "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
                            boxSizing: "border-box",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: 4,
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: shapeWidth,
                                height: shapeHeight,
                                border: "2px solid #ffffff",
                                background: selected ? "#ffffff" : "transparent",
                                boxSizing: "border-box",
                                display: "block",
                            }}
                        />
                        <span style={{ color: "#ffffff" }}>
                            {getAspectRatioButtonLabel(template.id)}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

const cropScreenBackdropStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(69,64,49,0.5)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    overflow: "hidden",
    boxSizing: "border-box",
}

export function BlankCanvasSetupScreen({
    aspectRatioId,
    onAspectRatioChange,
    cancelButton,
    applyButton,
}: {
    aspectRatioId: AspectRatioId
    onAspectRatioChange: (value: AspectRatioId) => void
    cancelButton: ReactNode
    applyButton: ReactNode
}) {
    return (
        <div
            data-blank-canvas-setup-screen="true"
            style={{
                ...cropScreenBackdropStyle,
                zIndex: 12000,
                display: "grid",
                gridTemplateRows: `${(1 - CROP_LAYOUT_REGION_FRACTIONS.bottom) * 100}vh ${CROP_LAYOUT_REGION_FRACTIONS.bottom * 100}vh`,
            }}
        >
            <div
                data-blank-canvas-aspect-region="true"
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: "border-box",
                }}
            >
                <div
                    style={{
                        width: `min(92vw, ${CROP_LAYOUT_ASPECT_SELECTOR_WIDTH_VH}vh)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <AspectRatioSelector
                        value={aspectRatioId}
                        onChange={onAspectRatioChange}
                    />
                </div>
            </div>

            <div
                data-blank-canvas-actions-region="true"
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: "border-box",
                }}
            >
                {cancelButton}
                {applyButton}
            </div>
        </div>
    )
}

export function ImportCropScreen({
    aspectRatioId,
    onAspectRatioChange,
    compactAspectSelector,
    isMobileLayout,
    isApplying,
    previewMeasureRef,
    previewBoxRef,
    previewCanvasRef,
    previewCanvasWidth,
    previewCanvasHeight,
    previewInsetFraction,
    isDragging,
    showPointerHandles,
    onPanPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onWheel,
    onRotatePointerDown,
    onScalePointerDown,
    cancelButton,
    applyButton,
}: {
    aspectRatioId: AspectRatioId
    onAspectRatioChange: (value: AspectRatioId) => void
    compactAspectSelector: boolean
    isMobileLayout: boolean
    isApplying: boolean
    previewMeasureRef: RefObject<HTMLDivElement | null>
    previewBoxRef: RefObject<HTMLDivElement | null>
    previewCanvasRef: RefObject<HTMLCanvasElement | null>
    previewCanvasWidth: number
    previewCanvasHeight: number
    previewInsetFraction: number
    isDragging: boolean
    showPointerHandles: boolean
    onPanPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void
    onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void
    onRotatePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
    onScalePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
    cancelButton: ReactNode
    applyButton: ReactNode
}) {
    const cropReferenceDimensions = getAspectRatioDimensions(aspectRatioId)
    const cropReferenceRatio =
        cropReferenceDimensions.width / cropReferenceDimensions.height
    const cropViewport = calculateCropViewportGeometry({
        canvasWidth: previewCanvasWidth,
        canvasHeight: previewCanvasHeight,
        insetFraction: previewInsetFraction,
    })
    const cropRegionHeight = `${CROP_LAYOUT_REGION_FRACTIONS.middle * 100}dvh`
    const cropWindowWidth = isMobileLayout
        ? `calc(100dvw - ${CROP_LAYOUT_MOBILE_HORIZONTAL_INSET_PX * 2}px)`
        : cropRegionHeight
    const cropWindowHeight = cropRegionHeight
    const cropFrameWidth = `min(${cropWindowWidth}, calc(${cropWindowHeight} * ${cropReferenceRatio}))`
    const cropFrameHeight = `min(${cropWindowHeight}, calc(${cropWindowWidth} / ${cropReferenceRatio}))`
    const cropViewportWidthFraction = Math.max(
        0.0001,
        cropViewport.viewportWidth / cropViewport.canvasWidth
    )
    const cropViewportHeightFraction = Math.max(
        0.0001,
        cropViewport.viewportHeight / cropViewport.canvasHeight
    )
    const cropPreviewCanvasDisplayWidth = `calc(${cropFrameWidth} * ${1 / cropViewportWidthFraction})`
    const cropPreviewCanvasDisplayHeight = `calc(${cropFrameHeight} * ${1 / cropViewportHeightFraction})`
    const cropFrameOverlayStyle: CSSProperties = {
        position: "absolute",
        left: `${(cropViewport.viewportX / cropViewport.canvasWidth) * 100}%`,
        top: `${(cropViewport.viewportY / cropViewport.canvasHeight) * 100}%`,
        width: `${(cropViewport.viewportWidth / cropViewport.canvasWidth) * 100}%`,
        height: `${(cropViewport.viewportHeight / cropViewport.canvasHeight) * 100}%`,
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 5,
    }

    return (
        <div
            data-crop-screen="true"
            style={{
                ...cropScreenBackdropStyle,
                zIndex: 9999,
                display: "grid",
                gridTemplateRows: `${CROP_LAYOUT_REGION_FRACTIONS.top * 100}dvh ${CROP_LAYOUT_REGION_FRACTIONS.middle * 100}dvh ${CROP_LAYOUT_REGION_FRACTIONS.bottom * 100}dvh`,
                overflow: "hidden",
            }}
            onWheel={(event) => event.preventDefault()}
            onTouchMove={(event: ReactTouchEvent<HTMLDivElement>) =>
                event.preventDefault()
            }
        >
            <div
                data-crop-aspect-region="true"
                style={{
                    width: "100%",
                    height: "100%",
                    display: "grid",
                    gridTemplateRows: `${CROP_LAYOUT_TOP_REGION_ROWS.topSpacer}fr ${CROP_LAYOUT_TOP_REGION_ROWS.content}fr ${CROP_LAYOUT_TOP_REGION_ROWS.bottomSpacer}fr`,
                    boxSizing: "border-box",
                    position: "relative",
                    zIndex: 3,
                }}
            >
                <div />
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: "100%",
                    }}
                >
                    <AspectRatioSelector
                        value={aspectRatioId}
                        onChange={(next) => {
                            if (isApplying) return
                            onAspectRatioChange(next)
                        }}
                        compact={compactAspectSelector}
                    />
                </div>
                <div />
            </div>

            <div
                data-crop-frame-region="true"
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: "border-box",
                    overflow: "visible",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                <div
                    data-crop-frame-window="true"
                    ref={previewMeasureRef}
                    style={{
                        width: cropWindowWidth,
                        height: cropWindowHeight,
                        position: "relative",
                        boxSizing: "border-box",
                        overflow: "visible",
                    }}
                >
                    <div
                        ref={previewBoxRef}
                        onPointerDown={(event) => {
                            if (isApplying) return
                            onPanPointerDown(event)
                        }}
                        onPointerMove={(event) => {
                            if (isApplying) return
                            onPointerMove(event)
                        }}
                        onPointerUp={(event) => {
                            if (isApplying) return
                            onPointerUp(event)
                        }}
                        onPointerCancel={(event) => {
                            if (isApplying) return
                            onPointerCancel(event)
                        }}
                        onWheel={(event) => {
                            if (isApplying) {
                                event.preventDefault()
                                return
                            }
                            onWheel(event)
                        }}
                        style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            width: cropPreviewCanvasDisplayWidth,
                            height: cropPreviewCanvasDisplayHeight,
                            transform: "translate(-50%, -50%)",
                            touchAction: "none",
                            overflow: "visible",
                            cursor: isApplying
                                ? "wait"
                                : isDragging
                                  ? "grabbing"
                                  : "grab",
                        }}
                    >
                        <canvas
                            ref={previewCanvasRef}
                            width={previewCanvasWidth}
                            height={previewCanvasHeight}
                            style={{
                                display: "block",
                                width: "100%",
                                height: "100%",
                                cursor: isApplying
                                    ? "wait"
                                    : isDragging
                                      ? "grabbing"
                                      : "grab",
                            }}
                        />

                        {showPointerHandles && (
                            <div
                                data-crop-frame-overlay="true"
                                style={cropFrameOverlayStyle}
                            >
                                <CropRotateHandle
                                    onPointerDown={(event) => {
                                        if (isApplying) return
                                        onRotatePointerDown(event)
                                    }}
                                />
                                <CropScaleHandle
                                    onPointerDown={(event) => {
                                        if (isApplying) return
                                        onScalePointerDown(event)
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div
                data-crop-actions-region="true"
                style={{
                    width: "100%",
                    height: "100%",
                    display: "grid",
                    gridTemplateRows: `${CROP_LAYOUT_BOTTOM_REGION_ROWS.topSpacer}fr ${CROP_LAYOUT_BOTTOM_REGION_ROWS.content}fr ${CROP_LAYOUT_BOTTOM_REGION_ROWS.bottomSpacer}fr`,
                    boxSizing: "border-box",
                    position: "relative",
                    zIndex: 3,
                }}
            >
                <div />
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: "100%",
                    }}
                >
                    {cancelButton}
                    {applyButton}
                </div>
                <div />
            </div>

            {isApplying && <CropApplyingOverlay />}
        </div>
    )
}

function CropApplyingOverlay() {
    return (
        <div
            data-crop-applying-overlay="true"
            role="status"
            aria-label="Preparing import"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 20,
                background: "transparent",
                display: "grid",
                placeItems: "center",
                pointerEvents: "auto",
                cursor: "wait",
            }}
        >
            <ImportActivitySpinner />
        </div>
    )
}

function CropRotateHandle({
    onPointerDown,
}: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
}) {
    return (
        <div
            data-crop-rotate-handle="true"
            onPointerDown={onPointerDown}
            style={{
                position: "absolute",
                right: 0,
                top: 0,
                width: 44,
                height: 44,
                background: "transparent",
                border: "none",
                cursor: "grab",
                touchAction: "none",
                pointerEvents: "auto",
                zIndex: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                userSelect: "none",
            }}
        >
            <svg
                width="25"
                height="25"
                viewBox="0 0 63.1 66.8"
                style={{
                    display: "block",
                    filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.2))",
                }}
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    fill="#fff"
                    d="M32.5,66.8c-17.7,0-32.1-14.4-32.1-32.1c0-17.7,14.4-32,32.1-32c7,0,13.6,2.4,18.9,6.9l3.5,3V0h6.4v25H36.2v-6.4h15.7l-4-3.7C43.6,11.1,38.3,9,32.5,9C18.3,9,6.7,20.5,6.7,34.7c0,14.2,11.5,25.7,25.7,25.7c10.7,0,20.3-6.8,24-16.8l6.2,1.7C58.3,58.1,46.1,66.8,32.5,66.8z"
                />
            </svg>
        </div>
    )
}

function CropScaleHandle({
    onPointerDown,
}: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
}) {
    return (
        <div
            data-crop-scale-handle="true"
            onPointerDown={onPointerDown}
            style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: 44,
                height: 44,
                background: "transparent",
                border: "none",
                cursor: "nesw-resize",
                touchAction: "none",
                pointerEvents: "auto",
                zIndex: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                userSelect: "none",
            }}
        >
            <svg
                width="25"
                height="25"
                viewBox="0 0 66.8 66.8"
                style={{
                    display: "block",
                    filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.2))",
                }}
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    fill="#fff"
                    d="M41.7,66.8v-6.4H57L40.3,43.7l3.4-3.4L60.4,57V41.7h6.4v25.1H41.7z M0,66.8V41.7h6.4V57l16.7-16.7l3.4,3.4L9.8,60.4h15.3v6.4H0z M6.4,9.8v15.3H0V0h25.1v6.4H9.8l16.7,16.7l-3.4,3.4L6.4,9.8z M40.3,23.1L57,6.4H41.7V0h25.1v25.1h-6.4V9.8L43.7,26.5L40.3,23.1z"
                />
            </svg>
        </div>
    )
}

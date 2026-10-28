export type CropDimensions = Readonly<{ width: number; height: number }>

export type CropRasterPolicy = "default" | "canonical-software"

export type CropDrawGeometry = Readonly<{
    outputWidth: number
    outputHeight: number
    cx: number
    cy: number
    drawWidth: number
    drawHeight: number
    rotationRadians: number
}>

export type CropResolveInput = {
    input: CropDimensions
    output: CropDimensions
    viewport: CropDimensions
    scale: number
    offset: Readonly<{ x: number; y: number }>
    rotationRadians: number
}

export type PreparedCrop = {
    preparedReference: ImageData
    referenceInputGeometry: CropDimensions
    drawGeometry: CropDrawGeometry
}

function positiveFinite(value: number, name: string) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid Crop ${name}: expected a positive finite number`)
    }
}

function dimension(value: number, name: string) {
    positiveFinite(value, name)
    if (!Number.isSafeInteger(value)) {
        throw new Error(`Invalid Crop ${name}: expected an integer dimension`)
    }
}

export function validateCropDrawGeometry(geometry: CropDrawGeometry): void {
    dimension(geometry.outputWidth, "outputWidth")
    dimension(geometry.outputHeight, "outputHeight")
    positiveFinite(geometry.drawWidth, "drawWidth")
    positiveFinite(geometry.drawHeight, "drawHeight")
    for (const key of ["cx", "cy", "rotationRadians"] as const) {
        if (!Number.isFinite(geometry[key])) {
            throw new Error(`Invalid Crop ${key}: expected a finite number`)
        }
    }
}

export function getCropSourceDimensions(
    source: CanvasImageSource
): CropDimensions | null {
    let width: number
    let height: number
    if ("naturalWidth" in source) {
        width = source.naturalWidth
        height = source.naturalHeight
    } else if ("videoWidth" in source) {
        width = source.videoWidth
        height = source.videoHeight
    } else if ("displayWidth" in source) {
        width = source.displayWidth
        height = source.displayHeight
    } else {
        if (typeof source.width !== "number" || typeof source.height !== "number") {
            return null
        }
        width = source.width
        height = source.height
    }
    if (
        !Number.isSafeInteger(width) || width <= 0 ||
        !Number.isSafeInteger(height) || height <= 0
    ) return null
    return Object.freeze({ width, height })
}

// Resolve UI coordinates once. Replay must not fit the next source to a viewport.
export function resolveCropDrawGeometry(params: CropResolveInput): CropDrawGeometry {
    dimension(params.input.width, "input width")
    dimension(params.input.height, "input height")
    dimension(params.output.width, "output width")
    dimension(params.output.height, "output height")
    positiveFinite(params.viewport.width, "viewport width")
    positiveFinite(params.viewport.height, "viewport height")
    positiveFinite(params.scale, "scale")

    // Preserve the original operation order, including floating-point rounding.
    const k = params.output.width / params.viewport.width
    const baseScale = Math.max(
        params.viewport.width / params.input.width,
        params.viewport.height / params.input.height
    )
    const geometry: CropDrawGeometry = {
        outputWidth: params.output.width,
        outputHeight: params.output.height,
        cx: params.output.width / 2 + params.offset.x * k,
        cy: params.output.height / 2 + params.offset.y * k,
        drawWidth: params.input.width * baseScale * params.scale * k,
        drawHeight: params.input.height * baseScale * params.scale * k,
        rotationRadians: params.rotationRadians,
    }
    validateCropDrawGeometry(geometry)
    return Object.freeze(geometry)
}

// Input compatibility and resource budgets belong to the caller/preflight.
// This renderer is independent of React and preview dimensions.
export function renderResolvedCrop(
    source: CanvasImageSource,
    geometry: CropDrawGeometry,
    options: Readonly<{ rasterPolicy?: CropRasterPolicy }> = {}
): ImageData | null {
    validateCropDrawGeometry(geometry)
    const rasterPolicy = options.rasterPolicy ?? "default"
    if (rasterPolicy !== "default" && rasterPolicy !== "canonical-software") {
        throw new Error("Unsupported Crop raster policy")
    }
    const out = document.createElement("canvas")
    out.width = geometry.outputWidth
    out.height = geometry.outputHeight
    const ctx = rasterPolicy === "canonical-software"
        ? out.getContext("2d", { willReadFrequently: true })
        : out.getContext("2d")
    if (!ctx) return null

    // A fresh 2D context retains the original smoothing/color-space defaults.
    ctx.clearRect(0, 0, out.width, out.height)
    ctx.save()
    ctx.translate(geometry.cx, geometry.cy)
    ctx.rotate(geometry.rotationRadians)
    ctx.drawImage(
        source,
        -geometry.drawWidth / 2,
        -geometry.drawHeight / 2,
        geometry.drawWidth,
        geometry.drawHeight
    )
    ctx.restore()
    return ctx.getImageData(0, 0, out.width, out.height)
}

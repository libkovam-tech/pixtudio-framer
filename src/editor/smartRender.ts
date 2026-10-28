export type SmartReferenceAdjustments = {
    exposure: number
    whiteBalance: number
    contrast: number
    saturation: number
    shadows: number
    midtones: number
    highlights: number
}

export const SMART_REFERENCE_VERSION_1 = 1 as const

export type SmartObjectWhitePoint = readonly [number, number, number]

export type SmartObjectWhiteBalanceDomainState = {
    // Source white estimation runs only on bakedBase, which Smart Object receives
    // after Chinese Room.
    //
    // It is not raw import, gallery/camera source, or pre-crop/pre-room image.
    //
    // From step 3 onward, the estimator is real.
    // From step 4 onward, the source estimate is calculated once for each new
    // Smart Object session and remains stable while the WB slider moves.
    sourceWhitePoint: SmartObjectWhitePoint | null
    sourceKelvin: number | null
    whiteBalanceConfidence: number | null
    targetKelvin: number | null
}

export const ZERO_SMART_REFERENCE_ADJUSTMENTS: SmartReferenceAdjustments = {
    exposure: 0,
    whiteBalance: 0.5,
    contrast: 0,
    saturation: 0,
    shadows: 0,
    midtones: 0,
    highlights: 0,
}

export const ZERO_SMARTOBJECT_WB_DOMAIN_STATE: SmartObjectWhiteBalanceDomainState =
    {
        sourceWhitePoint: null,
        sourceKelvin: null,
        whiteBalanceConfidence: null,
        targetKelvin: null,
    }

function clamp255(v: number): number {
    if (v <= 0) return 0
    if (v >= 255) return 255
    return Math.round(v)
}

function clamp01(v: number): number {
    if (v <= 0) return 0
    if (v >= 1) return 1
    return v
}

function clampSignedUnit(v: number): number {
    if (v <= -1) return -1
    if (v >= 1) return 1
    return v
}

function normalizeExposure(raw: number): number {
    if (!Number.isFinite(raw)) return 0
    return clampSignedUnit(raw / 100)
}

function applyExposureToPixel(
    r: number,
    g: number,
    b: number,
    rawExposure: number
): [number, number, number] {
    const amount = normalizeExposure(rawExposure)

    if (amount === 0) {
        return [r, g, b]
    }

    const gain = Math.pow(2, amount)

    return [clamp255(r * gain), clamp255(g * gain), clamp255(b * gain)]
}

function applyContrastToPixel(
    r: number,
    g: number,
    b: number,
    rawContrast: number
): [number, number, number] {
    const amount = clampSignedUnit(rawContrast / 100)

    if (Math.abs(amount) <= 1e-6) {
        return [r, g, b]
    }

    // Contrast v2:
    // - one pass
    // - pivoted per-channel contrast
    // - work in linear RGB
    // - fixed pivot at 0.5
    //
    // Gain curve:
    // -100 -> ~0.5
    // 0    -> 1
    // +100 -> ~2
    //
    // This range is visually noticeable,
    // but gentler than an aggressive 3x gain.
    const gain = Math.pow(2, amount)

    let rl = srgbChannelToLinear01(r)
    let gl = srgbChannelToLinear01(g)
    let bl = srgbChannelToLinear01(b)

    rl = clamp01(0.5 + (rl - 0.5) * gain)
    gl = clamp01(0.5 + (gl - 0.5) * gain)
    bl = clamp01(0.5 + (bl - 0.5) * gain)

    return [
        linearChannel01ToSrgb255(rl),
        linearChannel01ToSrgb255(gl),
        linearChannel01ToSrgb255(bl),
    ]
}

function applySaturationToPixel(
    r: number,
    g: number,
    b: number,
    rawSaturation: number
): [number, number, number] {
    const amount = clampSignedUnit(rawSaturation / 100)

    if (Math.abs(amount) <= 1e-6) {
        return [r, g, b]
    }

    // Saturation:
    // - luminance-preserving model
    // - not naive RGB scaling
    // - one pass
    // - work in linear RGB
    //
    // factor:
    // -100 -> 0
    // 0    -> 1
    // +100 -> 1.75
    //
    // Positive saturation is boosted gently,
    // to make the effect visible
    // without excessive oversaturation.
    const factor = amount >= 0 ? 1 + amount * 0.75 : 1 + amount

    let rl = srgbChannelToLinear01(r)
    let gl = srgbChannelToLinear01(g)
    let bl = srgbChannelToLinear01(b)

    const luma = REC709_LUMA[0] * rl + REC709_LUMA[1] * gl + REC709_LUMA[2] * bl

    rl = clamp01(luma + (rl - luma) * factor)
    gl = clamp01(luma + (gl - luma) * factor)
    bl = clamp01(luma + (bl - luma) * factor)

    return [
        linearChannel01ToSrgb255(rl),
        linearChannel01ToSrgb255(gl),
        linearChannel01ToSrgb255(bl),
    ]
}

function applyTonalExposureBandsToPixel(
    r: number,
    g: number,
    b: number,
    rawShadows: number,
    rawMidtones: number,
    rawHighlights: number
): [number, number, number] {
    const shadows = normalizeExposure(rawShadows)
    const midtones = normalizeExposure(rawMidtones)
    const highlights = normalizeExposure(rawHighlights)

    if (
        Math.abs(shadows) <= 1e-6 &&
        Math.abs(midtones) <= 1e-6 &&
        Math.abs(highlights) <= 1e-6
    ) {
        return [r, g, b]
    }

    const luma =
        REC709_LUMA[0] * (r / 255) +
        REC709_LUMA[1] * (g / 255) +
        REC709_LUMA[2] * (b / 255)

    const shadowMask = 1 - smoothstep(0, 0.3, luma)
    const midtoneMask =
        smoothstep(0, 0.3, luma) * (1 - smoothstep(0.75, 1, luma))
    const highlightMask = smoothstep(0.75, 1, luma)

    const tonalExposure =
        shadows * shadowMask + midtones * midtoneMask + highlights * highlightMask

    if (Math.abs(tonalExposure) <= 1e-6) {
        return [r, g, b]
    }

    const gain = Math.pow(2, tonalExposure)

    return [clamp255(r * gain), clamp255(g * gain), clamp255(b * gain)]
}

type Mat3 = readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
]

const SRGB_TO_XYZ_D65: Mat3 = [
    0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339,
    0.119192, 0.9503041,
]

const XYZ_TO_SRGB_D65: Mat3 = [
    3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556,
    0.0556434, -0.2040259, 1.0572252,
]

const REC709_LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722]

type WhiteBalanceTransform = {
    matrix: Mat3
    anchorReference: SmartObjectWhitePoint
    targetKelvin: number
}

const WB_PERCEPTUAL_GAMMA = 0.68
const WB_PERCEPTUAL_ROLLOFF = 1.2

// Visual WB range in mired space.
//
// Important:
// D65 = ~153.8 mired.
// An excessive cool range drives targetMired toward zero,
// destabilizing the cool end.
//
// Keep the range asymmetric:
// - a shorter cool side avoids that instability
// - the warm side retains its existing range
const WB_TARGET_MIREDS_RANGE_COOL = 130
const WB_TARGET_MIREDS_RANGE_WARM = 160

// Hard physical bounds of the working mired domain,
// corresponding to clampKelvin(50000) and clampKelvin(1667).
const WB_MIN_TARGET_MIREDS = 1000000 / 50000
const WB_MAX_TARGET_MIREDS = 1000000 / 1667

// Adaptive neutral anchor:
// partial pull from D65 toward estimated scene bias.
// This is neither auto-WB nor normalization at the center.
// It only provides an internal base for a more symmetric slider trajectory.
const WB_ADAPTIVE_ANCHOR_BIAS_CAP_MIREDS = 60
const WB_ADAPTIVE_ANCHOR_PULL = 0.65
const WB_ADAPTIVE_ANCHOR_CONFIDENCE_START = 0.15
const WB_ADAPTIVE_ANCHOR_CONFIDENCE_END = 0.75

// Gamut fitting v4:
// WB no longer uses a piecewise channel-limited fit.
// Instead, continuous soft compression is applied
// around the target-white anchor.
// This avoids spatial regime switching in highlights.
const WB_GAMUT_FIT_EPSILON = 1e-6

const BRADFORD_M: Mat3 = [
    0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296,
]

const BRADFORD_M_INV: Mat3 = [
    0.9869929, -0.1470543, 0.1599627, 0.4323053, 0.5183603, 0.0492912,
    -0.0085287, 0.0400428, 0.9684867,
]

function sliderWhiteBalanceToSignedUnit(raw: number): number {
    if (!Number.isFinite(raw)) return 0
    return clampSignedUnit(clamp01(raw) * 2 - 1)
}

function clampKelvin(k: number): number {
    if (k <= 1667) return 1667
    if (k >= 50000) return 50000
    return k
}

function multiplyMat3Vec3(
    m: Mat3,
    x: number,
    y: number,
    z: number
): [number, number, number] {
    return [
        m[0] * x + m[1] * y + m[2] * z,
        m[3] * x + m[4] * y + m[5] * z,
        m[6] * x + m[7] * y + m[8] * z,
    ]
}

function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
    return [
        a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
        a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
        a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

        a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
        a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
        a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

        a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
        a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
        a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
    ]
}

function diagMat3(a: number, b: number, c: number): Mat3 {
    return [a, 0, 0, 0, b, 0, 0, 0, c]
}


function compressChannelAroundAnchor(value: number, anchor: number): number {
    const safeAnchor = clamp01(anchor)
    const residual = value - safeAnchor

    if (Math.abs(residual) <= WB_GAMUT_FIT_EPSILON) {
        return safeAnchor
    }

    if (residual > 0) {
        const headroom = Math.max(WB_GAMUT_FIT_EPSILON, 1 - safeAnchor)
        return safeAnchor + headroom * Math.tanh(residual / headroom)
    }

    const headroom = Math.max(WB_GAMUT_FIT_EPSILON, safeAnchor)
    return safeAnchor - headroom * Math.tanh(-residual / headroom)
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    if (edge0 === edge1) {
        return x < edge0 ? 0 : 1
    }

    const t = clamp01((x - edge0) / (edge1 - edge0))
    return t * t * (3 - 2 * t)
}


function srgbChannelToLinear01(v255: number): number {
    const v = v255 / 255
    if (v <= 0.04045) return v / 12.92
    return Math.pow((v + 0.055) / 1.055, 2.4)
}

function linearChannel01ToSrgb255(v: number): number {
    const clamped = clamp01(v)

    if (clamped <= 0.0031308) {
        return clamp255(clamped * 12.92 * 255)
    }

    return clamp255((1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255)
}

function whitePointXyToXyz(x: number, y: number): [number, number, number] {
    const Y = 1
    const X = (x * Y) / y
    const Z = ((1 - x - y) * Y) / y
    return [X, Y, Z]
}

function chromaticityNormalizedXyzToLinearRgbWhitePoint(
    xyz: readonly [number, number, number]
): SmartObjectWhitePoint {
    const [r, g, b] = multiplyMat3Vec3(XYZ_TO_SRGB_D65, xyz[0], xyz[1], xyz[2])

    const rr = Math.max(0, r)
    const gg = Math.max(0, g)
    const bb = Math.max(0, b)

    return normalizeWhitePointLinearRgb(rr, gg, bb) ?? [1, 1, 1]
}

function resolveAdaptiveAnchorMired(
    domainState: SmartObjectWhiteBalanceDomainState | null | undefined
): number {
    const d65Mired = 1000000 / 6500

    if (
        !domainState?.sourceKelvin ||
        !Number.isFinite(domainState.sourceKelvin)
    ) {
        return d65Mired
    }

    const sceneMired = 1000000 / clampKelvin(domainState.sourceKelvin)
    const rawBias = sceneMired - d65Mired
    const cappedBias = Math.max(
        -WB_ADAPTIVE_ANCHOR_BIAS_CAP_MIREDS,
        Math.min(WB_ADAPTIVE_ANCHOR_BIAS_CAP_MIREDS, rawBias)
    )

    const confidenceGate = smoothstep(
        WB_ADAPTIVE_ANCHOR_CONFIDENCE_START,
        WB_ADAPTIVE_ANCHOR_CONFIDENCE_END,
        domainState.whiteBalanceConfidence ?? 0
    )

    return d65Mired + cappedBias * WB_ADAPTIVE_ANCHOR_PULL * confidenceGate
}

function kelvinToWhitePointXy(kelvinRaw: number): [number, number] {
    const kelvin = clampKelvin(kelvinRaw)
    const t = kelvin

    let x: number
    if (t <= 4000) {
        x =
            -0.2661239e9 / (t * t * t) -
            0.234358e6 / (t * t) +
            0.8776956e3 / t +
            0.17991
    } else {
        x =
            -3.0258469e9 / (t * t * t) +
            2.1070379e6 / (t * t) +
            0.2226347e3 / t +
            0.24039
    }

    let y: number
    if (t <= 2222) {
        y =
            -1.1063814 * Math.pow(x, 3) -
            1.3481102 * Math.pow(x, 2) +
            2.18555832 * x -
            0.20219683
    } else if (t <= 4000) {
        y =
            -0.9549476 * Math.pow(x, 3) -
            1.37418593 * Math.pow(x, 2) +
            2.09137015 * x -
            0.16748867
    } else {
        y =
            3.081758 * Math.pow(x, 3) -
            5.8733867 * Math.pow(x, 2) +
            3.75112997 * x -
            0.37001483
    }

    return [x, y]
}

function buildBradfordAdaptationMatrix(
    srcWhiteXYZ: readonly [number, number, number],
    dstWhiteXYZ: readonly [number, number, number]
): Mat3 {
    const [srcL, srcM, srcS] = multiplyMat3Vec3(
        BRADFORD_M,
        srcWhiteXYZ[0],
        srcWhiteXYZ[1],
        srcWhiteXYZ[2]
    )

    const [dstL, dstM, dstS] = multiplyMat3Vec3(
        BRADFORD_M,
        dstWhiteXYZ[0],
        dstWhiteXYZ[1],
        dstWhiteXYZ[2]
    )

    const scale: Mat3 = [
        dstL / srcL,
        0,
        0,
        0,
        dstM / srcM,
        0,
        0,
        0,
        dstS / srcS,
    ]

    return multiplyMat3(multiplyMat3(BRADFORD_M_INV, scale), BRADFORD_M)
}

function buildWhiteBalanceLinearRgbMatrix(
    rawWhiteBalance: number,
    domainState: SmartObjectWhiteBalanceDomainState | null | undefined
): WhiteBalanceTransform | null {
    const signedAmount = sliderWhiteBalanceToSignedUnit(rawWhiteBalance)

    // The center bypasses the WB stage.
    if (Math.abs(signedAmount) <= 1e-6) {
        return null
    }

    const magnitude = Math.pow(Math.abs(signedAmount), WB_PERCEPTUAL_GAMMA)

    const shapedAmount =
        (Math.tanh(WB_PERCEPTUAL_ROLLOFF * magnitude) /
            Math.tanh(WB_PERCEPTUAL_ROLLOFF)) *
        Math.sign(signedAmount)

    const anchorMired = resolveAdaptiveAnchorMired(domainState)

    const signedRange =
        shapedAmount < 0
            ? WB_TARGET_MIREDS_RANGE_COOL
            : WB_TARGET_MIREDS_RANGE_WARM

    const unclampedTargetMired = anchorMired + shapedAmount * signedRange

    const targetMired =
        clamp01(
            (unclampedTargetMired - WB_MIN_TARGET_MIREDS) /
                (WB_MAX_TARGET_MIREDS - WB_MIN_TARGET_MIREDS)
        ) *
            (WB_MAX_TARGET_MIREDS - WB_MIN_TARGET_MIREDS) +
        WB_MIN_TARGET_MIREDS

    const anchorKelvin = clampKelvin(1000000 / anchorMired)
    const targetKelvin = clampKelvin(1000000 / targetMired)

    const [anchorX, anchorY] = kelvinToWhitePointXy(anchorKelvin)
    const [targetX, targetY] = kelvinToWhitePointXy(targetKelvin)

    const anchorWhiteXYZ = whitePointXyToXyz(anchorX, anchorY)
    const targetWhiteXYZ = whitePointXyToXyz(targetX, targetY)

    const adaptationXYZ = buildBradfordAdaptationMatrix(
        anchorWhiteXYZ,
        targetWhiteXYZ
    )

    const adaptationRgb = multiplyMat3(
        multiplyMat3(XYZ_TO_SRGB_D65, adaptationXYZ),
        SRGB_TO_XYZ_D65
    )

    const anchorReference =
        chromaticityNormalizedXyzToLinearRgbWhitePoint(anchorWhiteXYZ)

    const [mappedWhiteR, mappedWhiteG, mappedWhiteB] = multiplyMat3Vec3(
        adaptationRgb,
        anchorReference[0],
        anchorReference[1],
        anchorReference[2]
    )

    const mappedWhiteLuma =
        REC709_LUMA[0] * mappedWhiteR +
        REC709_LUMA[1] * mappedWhiteG +
        REC709_LUMA[2] * mappedWhiteB

    const anchorLuma =
        REC709_LUMA[0] * anchorReference[0] +
        REC709_LUMA[1] * anchorReference[1] +
        REC709_LUMA[2] * anchorReference[2]

    const lumaNormalization =
        mappedWhiteLuma > WB_GAMUT_FIT_EPSILON &&
        Number.isFinite(mappedWhiteLuma)
            ? anchorLuma / mappedWhiteLuma
            : 1

    return {
        matrix: multiplyMat3(
            diagMat3(lumaNormalization, lumaNormalization, lumaNormalization),
            adaptationRgb
        ),
        anchorReference,
        targetKelvin,
    }
}

function applyWhiteBalanceToPixel(
    r: number,
    g: number,
    b: number,
    transform: Pick<WhiteBalanceTransform, "matrix" | "anchorReference"> | null
): [number, number, number] {
    if (!transform) {
        return [r, g, b]
    }

    const rl = srgbChannelToLinear01(r)
    const gl = srgbChannelToLinear01(g)
    const bl = srgbChannelToLinear01(b)

    let [outR, outG, outB] = multiplyMat3Vec3(transform.matrix, rl, gl, bl)

    const sourceReference = transform.anchorReference

    let [axisR, axisG, axisB] = multiplyMat3Vec3(
        transform.matrix,
        sourceReference[0],
        sourceReference[1],
        sourceReference[2]
    )

    axisR = Math.max(0, axisR)
    axisG = Math.max(0, axisG)
    axisB = Math.max(0, axisB)

    const axisLuma =
        REC709_LUMA[0] * axisR + REC709_LUMA[1] * axisG + REC709_LUMA[2] * axisB

    const outputLuma =
        REC709_LUMA[0] * outR + REC709_LUMA[1] * outG + REC709_LUMA[2] * outB

    if (
        axisLuma > WB_GAMUT_FIT_EPSILON &&
        Number.isFinite(axisLuma) &&
        Number.isFinite(outputLuma)
    ) {
        const axisUnitR = axisR / axisLuma
        const axisUnitG = axisG / axisLuma
        const axisUnitB = axisB / axisLuma

        const anchorLuma = Math.max(0, outputLuma)

        const anchorR = axisUnitR * anchorLuma
        const anchorG = axisUnitG * anchorLuma
        const anchorB = axisUnitB * anchorLuma

        outR = compressChannelAroundAnchor(outR, anchorR)
        outG = compressChannelAroundAnchor(outG, anchorG)
        outB = compressChannelAroundAnchor(outB, anchorB)
    } else {
        outR = clamp01(outR)
        outG = clamp01(outG)
        outB = clamp01(outB)
    }

    outR = clamp01(outR)
    outG = clamp01(outG)
    outB = clamp01(outB)

    return [
        linearChannel01ToSrgb255(outR),
        linearChannel01ToSrgb255(outG),
        linearChannel01ToSrgb255(outB),
    ]
}

function clampUnit(v: number): number {
    if (v <= 0) return 0
    if (v >= 1) return 1
    return v
}

function max3(a: number, b: number, c: number): number {
    return Math.max(a, Math.max(b, c))
}

function min3(a: number, b: number, c: number): number {
    return Math.min(a, Math.min(b, c))
}

function mean3(a: number, b: number, c: number): number {
    return (a + b + c) / 3
}

function rgbToRelativeChroma01(r: number, g: number, b: number): number {
    const mx = max3(r, g, b)
    const mn = min3(r, g, b)
    if (mx <= 1e-6) return 0
    return (mx - mn) / mx
}

function rgbChannelSpreadAroundMean(r: number, g: number, b: number): number {
    const m = mean3(r, g, b)
    if (m <= 1e-6) return 0
    return (Math.abs(r - m) + Math.abs(g - m) + Math.abs(b - m)) / (3 * m)
}



function normalizeWhitePointLinearRgb(
    r: number,
    g: number,
    b: number
): SmartObjectWhitePoint | null {
    const sum = r + g + b
    if (!Number.isFinite(sum) || sum <= 1e-8) return null
    return [r / sum, g / sum, b / sum]
}

function blendWhitePoints(
    items: Array<{
        point: SmartObjectWhitePoint | null
        weight: number
    }>
): SmartObjectWhitePoint | null {
    let accR = 0
    let accG = 0
    let accB = 0
    let accW = 0

    for (const item of items) {
        if (!item.point) continue
        if (!Number.isFinite(item.weight) || item.weight <= 0) continue

        accR += item.point[0] * item.weight
        accG += item.point[1] * item.weight
        accB += item.point[2] * item.weight
        accW += item.weight
    }

    if (accW <= 1e-8) return null

    return normalizeWhitePointLinearRgb(accR / accW, accG / accW, accB / accW)
}

function estimateWhitePointShadesOfGray(
    bakedBase: ImageData
): SmartObjectWhitePoint | null {
    const src = bakedBase.data
    const p = 6

    let sumR = 0
    let sumG = 0
    let sumB = 0

    for (let i = 0; i < src.length; i += 4) {
        const a = src[i + 3]
        if (a <= 0) continue

        const r = srgbChannelToLinear01(src[i + 0])
        const g = srgbChannelToLinear01(src[i + 1])
        const b = srgbChannelToLinear01(src[i + 2])

        sumR += Math.pow(r, p)
        sumG += Math.pow(g, p)
        sumB += Math.pow(b, p)
    }

    if (sumR <= 0 && sumG <= 0 && sumB <= 0) {
        return null
    }

    return normalizeWhitePointLinearRgb(
        Math.pow(sumR, 1 / p),
        Math.pow(sumG, 1 / p),
        Math.pow(sumB, 1 / p)
    )
}

function estimateWhitePointNeutralCandidates(bakedBase: ImageData): {
    point: SmartObjectWhitePoint | null
    confidence: number
} {
    const src = bakedBase.data

    let accR = 0
    let accG = 0
    let accB = 0
    let count = 0

    for (let i = 0; i < src.length; i += 4) {
        const a = src[i + 3]
        if (a <= 0) continue

        const r8 = src[i + 0]
        const g8 = src[i + 1]
        const b8 = src[i + 2]

        if (r8 >= 250 || g8 >= 250 || b8 >= 250) continue

        const r = srgbChannelToLinear01(r8)
        const g = srgbChannelToLinear01(g8)
        const b = srgbChannelToLinear01(b8)

        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if (luma < 0.08 || luma > 0.92) continue

        const chroma = rgbToRelativeChroma01(r, g, b)
        if (chroma > 0.18) continue

        const spread = rgbChannelSpreadAroundMean(r, g, b)
        if (spread > 0.12) continue

        accR += r
        accG += g
        accB += b
        count += 1
    }

    const point =
        count > 0
            ? normalizeWhitePointLinearRgb(
                  accR / count,
                  accG / count,
                  accB / count
              )
            : null

    const totalPixels = Math.max(1, bakedBase.width * bakedBase.height)
    const density = count / totalPixels
    const confidence = clampUnit(density / 0.08)

    return { point, confidence }
}

function estimateWhitePointHighlightNeutral(bakedBase: ImageData): {
    point: SmartObjectWhitePoint | null
    confidence: number
} {
    const src = bakedBase.data

    let accR = 0
    let accG = 0
    let accB = 0
    let count = 0

    for (let i = 0; i < src.length; i += 4) {
        const a = src[i + 3]
        if (a <= 0) continue

        const r8 = src[i + 0]
        const g8 = src[i + 1]
        const b8 = src[i + 2]

        if (r8 >= 252 || g8 >= 252 || b8 >= 252) continue

        const r = srgbChannelToLinear01(r8)
        const g = srgbChannelToLinear01(g8)
        const b = srgbChannelToLinear01(b8)

        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if (luma < 0.55 || luma > 0.95) continue

        const chroma = rgbToRelativeChroma01(r, g, b)
        if (chroma > 0.12) continue

        const spread = rgbChannelSpreadAroundMean(r, g, b)
        if (spread > 0.08) continue

        accR += r
        accG += g
        accB += b
        count += 1
    }

    const point =
        count > 0
            ? normalizeWhitePointLinearRgb(
                  accR / count,
                  accG / count,
                  accB / count
              )
            : null

    const totalPixels = Math.max(1, bakedBase.width * bakedBase.height)
    const density = count / totalPixels
    const confidence = clampUnit(density / 0.03)

    return { point, confidence }
}

function linearRgbWhitePointToXyz(
    point: SmartObjectWhitePoint
): [number, number, number] {
    return multiplyMat3Vec3(SRGB_TO_XYZ_D65, point[0], point[1], point[2])
}


function xyToApproxKelvin(x: number, y: number): number {
    const n = (x - 0.332) / (0.1858 - y)
    const kelvin =
        -449 * Math.pow(n, 3) + 3525 * Math.pow(n, 2) - 6823.3 * n + 5520.33

    if (!Number.isFinite(kelvin)) return 6500
    return clampKelvin(kelvin)
}

function whitePointLinearRgbToApproxKelvin(
    point: SmartObjectWhitePoint
): number | null {
    const [X, Y, Z] = linearRgbWhitePointToXyz(point)
    const sum = X + Y + Z
    if (!Number.isFinite(sum) || sum <= 1e-8) return null

    const x = X / sum
    const y = Y / sum

    return xyToApproxKelvin(x, y)
}

function estimateWhiteBalanceDomainStateFromBakedBase(
    bakedBase: ImageData
): SmartObjectWhiteBalanceDomainState {
    const shadesOfGray = estimateWhitePointShadesOfGray(bakedBase)

    const neutralCandidates = estimateWhitePointNeutralCandidates(bakedBase)
    const highlightNeutral = estimateWhitePointHighlightNeutral(bakedBase)

    const fusedWhitePoint = blendWhitePoints([
        { point: shadesOfGray, weight: 0.45 },
        {
            point: neutralCandidates.point,
            weight: 0.35 * neutralCandidates.confidence,
        },
        {
            point: highlightNeutral.point,
            weight: 0.2 * highlightNeutral.confidence,
        },
    ])

    const sourceWhitePoint =
        fusedWhitePoint ??
        shadesOfGray ??
        neutralCandidates.point ??
        highlightNeutral.point

    const sourceKelvin = sourceWhitePoint
        ? whitePointLinearRgbToApproxKelvin(sourceWhitePoint)
        : null

    const whiteBalanceConfidence = clampUnit(
        (shadesOfGray ? 0.4 : 0) +
            neutralCandidates.confidence * 0.35 +
            highlightNeutral.confidence * 0.25
    )

    return {
        sourceWhitePoint,
        sourceKelvin,
        whiteBalanceConfidence,
        targetKelvin: sourceKelvin,
    }
}

export function initializeWhiteBalanceDomainStateFromBakedBase(
    bakedBase: ImageData | null
): SmartObjectWhiteBalanceDomainState {
    if (!bakedBase) {
        return { ...ZERO_SMARTOBJECT_WB_DOMAIN_STATE }
    }

    // Estimate source white ONLY from bakedBase,
    // which Smart Object receives after Chinese Room.
    //
    // Canonical estimator:
    // A) Shades of Gray
    // B) Neutral candidates
    // C) Highlight-neutral
    // D) Robust fusion
    return estimateWhiteBalanceDomainStateFromBakedBase(bakedBase)
}

function deriveTargetKelvinFromLegacyWhiteBalanceAdjustment(
    rawWhiteBalance: number,
    domainState: SmartObjectWhiteBalanceDomainState
): number | null {
    const signedAmount = sliderWhiteBalanceToSignedUnit(rawWhiteBalance)

    const anchorMired = resolveAdaptiveAnchorMired(domainState)
    const anchorKelvin = clampKelvin(1000000 / anchorMired)

    if (Math.abs(signedAmount) <= 1e-6) {
        return anchorKelvin
    }

    const signedRange =
        signedAmount < 0
            ? WB_TARGET_MIREDS_RANGE_COOL
            : WB_TARGET_MIREDS_RANGE_WARM

    const targetMired =
        clamp01(
            (anchorMired + signedAmount * signedRange - WB_MIN_TARGET_MIREDS) /
                (WB_MAX_TARGET_MIREDS - WB_MIN_TARGET_MIREDS)
        ) *
            (WB_MAX_TARGET_MIREDS - WB_MIN_TARGET_MIREDS) +
        WB_MIN_TARGET_MIREDS

    return clampKelvin(1000000 / targetMired)
}

export function deriveEffectiveWhiteBalanceDomainState(
    rawWhiteBalance: number,
    domainState: SmartObjectWhiteBalanceDomainState
): SmartObjectWhiteBalanceDomainState {
    const nextTargetKelvin = deriveTargetKelvinFromLegacyWhiteBalanceAdjustment(
        rawWhiteBalance,
        domainState
    )

    if (domainState.targetKelvin === nextTargetKelvin) {
        return domainState
    }

    return {
        ...domainState,
        targetKelvin: nextTargetKelvin,
    }
}

function areZeroSmartAdjustments(
    adjustments: SmartReferenceAdjustments
): boolean {
    return (
        adjustments.exposure === 0 &&
        Math.abs(adjustments.whiteBalance - 0.5) <= 1e-6 &&
        adjustments.contrast === 0 &&
        adjustments.saturation === 0 &&
        adjustments.shadows === 0 &&
        adjustments.midtones === 0 &&
        adjustments.highlights === 0
    )
}

export type SmartPixelAdjustments = Readonly<Omit<SmartReferenceAdjustments, "whiteBalance">>
export type SmartWhiteBalanceApplyInputs = Readonly<Pick<WhiteBalanceTransform, "matrix" | "anchorReference">>

export function resolveSmartWhiteBalanceApplyInputs(
    adjustments: SmartReferenceAdjustments,
    domainState?: SmartObjectWhiteBalanceDomainState | null
): SmartWhiteBalanceApplyInputs | null {
    return areZeroSmartAdjustments(adjustments)
        ? null
        : buildWhiteBalanceLinearRgbMatrix(
              adjustments.whiteBalance,
              domainState ?? ZERO_SMARTOBJECT_WB_DOMAIN_STATE
          )
}

// Existing Smart pixel order: exposure, contrast, saturation, tonal bands, WB.
export function applySmartPixelPipeline(
    base: ImageData,
    adjustments: SmartPixelAdjustments,
    whiteBalanceTransform: SmartWhiteBalanceApplyInputs | null
): ImageData {
    if (whiteBalanceTransform === null &&
        [adjustments.exposure, adjustments.contrast, adjustments.saturation,
            adjustments.shadows, adjustments.midtones, adjustments.highlights]
            .every(value => value === 0)) {
        return new ImageData(new Uint8ClampedArray(base.data), base.width, base.height)
    }
    const src = base.data
    const out = new Uint8ClampedArray(src.length)

    for (let i = 0; i < src.length; i += 4) {
        const r = src[i + 0]
        const g = src[i + 1]
        const b = src[i + 2]
        const a = src[i + 3]

        const [exposedR, exposedG, exposedB] = applyExposureToPixel(
            r,
            g,
            b,
            adjustments.exposure
        )

        const [contrastR, contrastG, contrastB] = applyContrastToPixel(
            exposedR,
            exposedG,
            exposedB,
            adjustments.contrast
        )

        const [saturatedR, saturatedG, saturatedB] = applySaturationToPixel(
            contrastR,
            contrastG,
            contrastB,
            adjustments.saturation
        )

        const [toneR, toneG, toneB] = applyTonalExposureBandsToPixel(
            saturatedR,
            saturatedG,
            saturatedB,
            adjustments.shadows,
            adjustments.midtones,
            adjustments.highlights
        )

        const [rr, gg, bb] = applyWhiteBalanceToPixel(
            toneR,
            toneG,
            toneB,
            whiteBalanceTransform
        )

        out[i + 0] = rr
        out[i + 1] = gg
        out[i + 2] = bb
        out[i + 3] = a // alpha invariant
    }


    return new ImageData(out, base.width, base.height)
}

// Existing Smart editor entry point, with session-owned calibration state.
export function buildReferenceSnapshot(
    base: ImageData | null,
    adjustments: SmartReferenceAdjustments,
    whiteBalanceDomainState?: SmartObjectWhiteBalanceDomainState | null
): ImageData | null {
    if (!base) return null
    return applySmartPixelPipeline(
        base, adjustments,
        resolveSmartWhiteBalanceApplyInputs(adjustments, whiteBalanceDomainState)
    )
}

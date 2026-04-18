import * as React from "react"

import { SvgCancelButton, SvgOkButton, SvgExportSOButton } from "./SvgIcons.tsx"

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

export type ReferenceSnapshotEnvelope = {
    snapshot: ImageData | null
    revision: number
    kind: "import" | "load" | "smart-object-apply"
}

export type SmartObjectCommittedState = {
    // Последнее committed состояние Smart Object,
    // которое участвует в общей истории приложения.
    adjustments: SmartReferenceAdjustments
    revision: number
}

export type SmartObjectCommittedStateBridge = {
    captureCommittedState: () => SmartObjectCommittedState
    applyCommittedState: (state: SmartObjectCommittedState) => void
    importBakedBase: (base: ImageData) => void
    restoreFromLoad: (payload: {
        base: ImageData | null
        adjustments: SmartReferenceAdjustments
    }) => void
    clearBase: (kind: "import" | "load") => void
    captureBakedBaseForSave: () => ImageData | null
    hasBakedBase: () => boolean
}

export type SmartObjectWhitePoint = readonly [number, number, number]

export type SmartObjectWhiteBalanceDomainState = {
    // Оценка source white выполняется только по bakedBase,
    // который Smart Object получает уже после Chinese Room.
    //
    // Это НЕ raw import,
    // НЕ gallery/camera source,
    // НЕ pre-crop/pre-room image.
    //
    // Начиная с шага 3, estimator уже реален.
    // Начиная с шага 4, source estimate должен вычисляться
    // один раз на новую smart-object session
    // и оставаться стабильным при движении WB slider.
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

// =====================================================
// OK / CANCEL / EXPORT BUTTON CANON (Smart Object family)
// =====================================================
//
// Эта семья кнопок обязана использовать:
// - один и тот же HTML button container
// - один и тот же svg sizing style
// - различаться только иконкой, opacity, cursor, disabled-state и handler'ом
//
// Локальные отдельные button-style для Export здесь не допускаются.

const okCancelButtonStyle: React.CSSProperties = {
    width: 50,
    height: 50,

    border: "none",
    background: "transparent",
    padding: 0,

    marginTop: 35,
    marginLeft: 14,
    marginRight: 14,

    cursor: "pointer",
    touchAction: "manipulation",

    display: "block",
}

const okCancelSvgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "block",
}

const SMART_UI_BUTTON_ANIM_CSS = `
.pxUiAnim {
    transition:
        transform 120ms ease,
        filter 120ms ease;
    transform-origin: center;
    will-change: transform, filter;
}

.pxUiAnim:hover:not(:disabled) {
    transform: translateY(-2px) scale(1.05);
    filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.22));
}

.pxUiAnim:active:not(:disabled) {
    transform: translateY(1px) scale(0.97);
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18));
}

.pxUiAnim:disabled {
    filter: none;
}

@media (hover: none) {
    .pxUiAnim:hover:not(:disabled) {
        transform: none;
        filter: none;
    }
}
`

const RANGE_CIRCLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 134 134">
  <g fill="#FF00FF">
    <polygon points="58.6,134 58.6,125.6 33.5,125.6 33.5,117.2 25.1,117.2 25.1,108.8 16.7,108.8 16.7,100.5 8.4,100.5 8.4,75.3 0,75.3 0,58.6 8.4,58.6 8.4,33.5 16.7,33.5 16.7,25.1 25.1,25.1 25.1,16.7 33.5,16.7 33.5,8.4 58.6,8.4 58.6,0 75.3,0 75.3,8.4 100.5,8.4 100.5,16.7 108.8,16.7 108.8,25.1 117.2,25.1 117.2,33.5 125.6,33.5 125.6,58.6 134,58.6 134,75.3 125.6,75.3 125.6,100.5 117.2,100.5 117.2,108.8 108.8,108.8 108.8,117.2 100.5,117.2 100.5,125.6 75.3,125.6 75.3,134"/>
  </g>
</svg>`.trim()

const RANGE_CIRCLE_MASK_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(
    RANGE_CIRCLE_SVG
)}")`

function buildMaskedThumbStyle(
    base: React.CSSProperties,
    fillColor: string
): React.CSSProperties {
    return {
        ...base,
        backgroundColor: fillColor,
        WebkitMaskImage: RANGE_CIRCLE_MASK_URL,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        WebkitMaskSize: "100% 100%",
        maskImage: RANGE_CIRCLE_MASK_URL,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "100% 100%",
    }
}

// =====================
// S4/S6 — isolated smart-object math
//
// Область работ строго ограничена Smart Object domain:
// - SmartReferenceEditor
// - buildReferenceSnapshot
// - internal WB helpers
// - WB UI track
//
// Мы НЕ трогаем:
// - editor
// - root
// - envelope/history contract вне Smart Object
// - Chinese Room
// - import pipeline
//
// White Balance contract:
//
// 1) Visible WB не выполняет auto-normalization сцены.
//    В центре слайдера изображение должно оставаться визуально неизменным.
//
// 2) sourceKelvin / whiteBalanceConfidence используются
//    для вычисления adaptive neutral anchor,
//    который влияет только на геометрию WB slider trajectory,
//    но не "чинит" изображение в центре.
//
// 3) Visible WB строится как:
//    adaptiveAnchor -> targetWhite
//    где targetWhite = adaptiveAnchor + signed slider delta (в mired-space).
//
// 4) Neutral WB is fixed at slider center:
//    whiteBalance = 0.5 === real identity / bypass for WB stage.
//
// 5) UI semantics:
//    left   = cool
//    center = neutral
//    right  = warm
//
//    Cool/warm ranges remain asymmetric:
//    cool side is shorter to avoid blue-edge collapse.
//
// 6) Bright / near-white highlight behavior:
//    out-of-gamut cases возвращаются в display gamut
//    через continuous soft-compression around the same adaptive target-white anchor,
//    без piecewise channel-limited fit и без увода к серому.

function clamp255(v: number): number {
    if (v <= 0) return 0
    if (v >= 255) return 255
    return Math.round(v)
}

function get2dReadFrequentlyContext(
    canvas: HTMLCanvasElement
): CanvasRenderingContext2D | null {
    return canvas.getContext("2d", {
        willReadFrequently: true,
    } as CanvasRenderingContext2DSettings)
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
    // - один проход
    // - pivoted per-channel contrast
    // - работаем в linear RGB
    // - pivot фиксирован на 0.5
    //
    // Gain curve:
    // -100 -> ~0.5
    // 0    -> 1
    // +100 -> ~2
    //
    // Такой диапазон заметен визуально,
    // но мягче, чем агрессивный 3x.
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
    // - luminance-preserving модель
    // - НЕ naive RGB scaling
    // - один проход
    // - работаем в linear RGB
    //
    // factor:
    // -100 -> 0
    // 0    -> 1
    // +100 -> 1.75
    //
    // Позитивная сторона усилена мягко,
    // чтобы эффект был заметен,
    // но не уходил слишком быстро в кислотность.
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

function applyToneShapeToPixel(
    r: number,
    g: number,
    b: number,
    rawShadows: number,
    rawMidtones: number,
    rawHighlights: number
): [number, number, number] {
    const shadows = clamp01(rawShadows / 100)
    const midtones = clampSignedUnit(rawMidtones / 100)
    const highlights = clamp01(rawHighlights / 100)

    if (shadows <= 1e-6 && Math.abs(midtones) <= 1e-6 && highlights <= 1e-6) {
        return [r, g, b]
    }

    let rl = srgbChannelToLinear01(r)
    let gl = srgbChannelToLinear01(g)
    let bl = srgbChannelToLinear01(b)

    const luma = REC709_LUMA[0] * rl + REC709_LUMA[1] * gl + REC709_LUMA[2] * bl

    const shadowMask = 1 - smoothstep(0.16, 0.42, luma)
    const highlightMask = smoothstep(0.42, 0.82, luma)

    const midLow = smoothstep(0.12, 0.45, luma)
    const midHigh = 1 - smoothstep(0.55, 0.88, luma)
    const midtoneMask = clamp01(midLow * midHigh)

    const shadowDelta = shadows * shadowMask * 0.28
    const midtoneDelta = midtones * midtoneMask * 0.18
    const highlightDelta = -highlights * highlightMask * 0.34

    const totalDelta = shadowDelta + midtoneDelta + highlightDelta

    rl = clamp01(rl + totalDelta)
    gl = clamp01(gl + totalDelta)
    bl = clamp01(bl + totalDelta)

    return [
        linearChannel01ToSrgb255(rl),
        linearChannel01ToSrgb255(gl),
        linearChannel01ToSrgb255(bl),
    ]
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

type ToneThumbKey = "shadows" | "midtones" | "highlights"

const WB_PERCEPTUAL_GAMMA = 0.68
const WB_PERCEPTUAL_ROLLOFF = 1.2

// Visual WB range in mired space.
//
// Важно:
// D65 = ~153.8 mired.
// Если cool-range слишком большой, targetMired уходит к нулю,
// и холодный край начинает "срываться".
//
// Поэтому диапазон делаем асимметричным:
// - cool side короче и безопаснее
// - warm side пока оставляем как был
const WB_TARGET_MIREDS_RANGE_COOL = 130
const WB_TARGET_MIREDS_RANGE_WARM = 160

// Жёсткие физические границы рабочего mired-domain,
// соответствующие clampKelvin(50000) и clampKelvin(1667).
const WB_MIN_TARGET_MIREDS = 1000000 / 50000
const WB_MAX_TARGET_MIREDS = 1000000 / 1667

// Adaptive neutral anchor:
// partial pull from D65 toward estimated scene bias.
// Это НЕ auto-WB и НЕ normalization в центре.
// Это только внутренняя база для более симметричной slider trajectory.
const WB_ADAPTIVE_ANCHOR_BIAS_CAP_MIREDS = 60
const WB_ADAPTIVE_ANCHOR_PULL = 0.65
const WB_ADAPTIVE_ANCHOR_CONFIDENCE_START = 0.15
const WB_ADAPTIVE_ANCHOR_CONFIDENCE_END = 0.75

// Gamut fitting v4:
// после WB мы больше не используем piecewise channel-limited fit.
// Вместо этого применяется непрерывное soft-compression
// вокруг target-white anchor.
// Это должно убрать spatial regime switching в хайлайтах.
const WB_GAMUT_FIT_EPSILON = 1e-6

const BRADFORD_M: Mat3 = [
    0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296,
]

const BRADFORD_M_INV: Mat3 = [
    0.9869929, -0.1470543, 0.1599627, 0.4323053, 0.5183603, 0.0492912,
    -0.0085287, 0.0400428, 0.9684867,
]

const D65_WHITE_XYZ: readonly [number, number, number] = [0.95047, 1.0, 1.08883]
void D65_WHITE_XYZ

const RGB_TO_LMS_BRADFORD = multiplyMat3(BRADFORD_M, SRGB_TO_XYZ_D65)
void RGB_TO_LMS_BRADFORD
const LMS_BRADFORD_TO_RGB = multiplyMat3(XYZ_TO_SRGB_D65, BRADFORD_M_INV)
void LMS_BRADFORD_TO_RGB

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

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
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

function lerpMat3(a: Mat3, b: Mat3, t: number): Mat3 {
    return [
        lerp(a[0], b[0], t),
        lerp(a[1], b[1], t),
        lerp(a[2], b[2], t),
        lerp(a[3], b[3], t),
        lerp(a[4], b[4], t),
        lerp(a[5], b[5], t),
        lerp(a[6], b[6], t),
        lerp(a[7], b[7], t),
        lerp(a[8], b[8], t),
    ]
}
void lerpMat3

const IDENTITY_MAT3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
void IDENTITY_MAT3

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

    // Центр = реальный bypass WB stage.
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
    transform: WhiteBalanceTransform | null
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

function rgbChannelSpreadAroundLuma(r: number, g: number, b: number): number {
    const luma = REC709_LUMA[0] * r + REC709_LUMA[1] * g + REC709_LUMA[2] * b
    if (luma <= 1e-6) return 0

    return (
        (Math.abs(r - luma) + Math.abs(g - luma) + Math.abs(b - luma)) /
        (3 * luma)
    )
}
void rgbChannelSpreadAroundLuma

function remapSpreadTowardsLuma(
    value: number,
    luma: number,
    ratio: number
): number {
    return luma + (value - luma) * ratio
}
void remapSpreadTowardsLuma

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

function linearRgbWhitePointToChromaticityNormalizedXyz(
    point: SmartObjectWhitePoint
): [number, number, number] | null {
    const [X, Y, Z] = linearRgbWhitePointToXyz(point)
    const sum = X + Y + Z

    if (!Number.isFinite(sum) || sum <= 1e-8) {
        return null
    }

    const x = X / sum
    const y = Y / sum

    if (!Number.isFinite(x) || !Number.isFinite(y) || y <= 1e-8) {
        return null
    }

    return whitePointXyToXyz(x, y)
}
void linearRgbWhitePointToChromaticityNormalizedXyz

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

function initializeWhiteBalanceDomainStateFromBakedBase(
    bakedBase: ImageData | null
): SmartObjectWhiteBalanceDomainState {
    if (!bakedBase) {
        return { ...ZERO_SMARTOBJECT_WB_DOMAIN_STATE }
    }

    // source white estimate вычисляется ТОЛЬКО по bakedBase,
    // который Smart Object получает уже после Chinese Room.
    //
    // Канонический estimator:
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

function deriveEffectiveWhiteBalanceDomainState(
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

export function buildReferenceSnapshot(
    base: ImageData | null,
    adjustments: SmartReferenceAdjustments,
    whiteBalanceDomainState?: SmartObjectWhiteBalanceDomainState | null
): ImageData | null {
    if (!base) return null

    // Инварианты:
    // 1) WB нейтраль теперь = 0.5, а не 0
    // 2) ZERO adjustments обязаны давать exact copy
    // 3) Contrast = 0 не меняет текущий pixel pipeline
    // 4) Saturation = 0 не меняет текущий pixel pipeline
    // 5) Tone Shape zeros не меняют текущий pixel pipeline
    if (areZeroSmartAdjustments(adjustments)) {
        return new ImageData(
            new Uint8ClampedArray(base.data),
            base.width,
            base.height
        )
    }

    const src = base.data
    const out = new Uint8ClampedArray(src.length)

    const effectiveWhiteBalanceDomainState =
        whiteBalanceDomainState ?? ZERO_SMARTOBJECT_WB_DOMAIN_STATE

    // Visible WB:
    // adaptive neutral anchor -> target white.
    // sourceKelvin / confidence влияют на внутреннюю базу slider trajectory,
    // но не нормализуют изображение в центре.
    const whiteBalanceTransform = buildWhiteBalanceLinearRgbMatrix(
        adjustments.whiteBalance,
        effectiveWhiteBalanceDomainState
    )

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

        const [toneR, toneG, toneB] = applyToneShapeToPixel(
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

type SmartReferenceEditorProps = {
    bakedBase?: ImageData | null
    seedCommittedAdjustments?: SmartReferenceAdjustments
    loadPublishNonce?: number
    isOpen?: boolean
    onCancel?: () => void

    // H4:
    // Root получает bridge для capture/apply committed-state Smart Object.
    onSmartObjectCommittedStateBridgeReady?: (
        bridge: SmartObjectCommittedStateBridge | null
    ) => void

    // Smart Object публикует наружу только готовый envelope.
    // Root не знает ни про adjustments, ни про revision-логику.
    onPublishEnvelope?: (envelope: ReferenceSnapshotEnvelope) => void

    onExport?: (payload: {
        previewImage: ImageData | null
        adjustments: SmartReferenceAdjustments
    }) => void
}

const WRAP: React.CSSProperties = {
    width: 760,
    background: "#031219",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    padding: "12px 14px 20px",
    boxSizing: "border-box",
    fontFamily:
        'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const INNER: React.CSSProperties = {
    width: 732,
    display: "flex",
    flexDirection: "column",
}

const PREVIEW_WRAP: React.CSSProperties = {
    width: "100%",
    marginBottom: 18,
}

const PREVIEW_CANVAS: React.CSSProperties = {
    width: "100%",
    height: "auto",
    display: "block",
    imageRendering: "pixelated",
    background: "#000000",
}

const CONTROLS_STACK: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    width: "100%",
}

const CONTROL_BLOCK: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "100%",
}

const CONTROL_LABEL: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.1,
    textTransform: "uppercase",
    color: "#f0f0f0",
    margin: 0,
}

//const DIAG_SMART_TRACK_SOLID = "#2F6BFF"
//const DIAG_SMART_TRACK_SOFT = "rgba(47, 107, 255, 0.35)"

const RANGE_INPUT: React.CSSProperties = {
    width: "100%",
    margin: 0,
    //accentColor: DIAG_SMART_TRACK_SOLID,
    accentColor: "#ffffff",
}

const PX_RANGE_THUMB_SIZE = 28
const PX_RANGE_TRACK_H = 6

const WB_TRACK_AREA: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: 32,
}

const WB_TRACK_LINE: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 6,
    transform: "translateY(-50%)",
    background: "linear-gradient(to right, #3A7BD5, #FFE082)",
}

const WB_CENTER_MARK: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 2,
    height: 24,
    background: "#ffffff",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
}

const WB_RANGE_HITBOX: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    margin: 0,
    opacity: 0,
    cursor: "pointer",
}

const WB_THUMB: React.CSSProperties = buildMaskedThumbStyle(
    {
        position: "absolute",
        top: "50%",
        width: 28,
        height: 28,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
    },
    "#f3f3f3"
)

const TONE_PANEL: React.CSSProperties = {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.35)",
    boxSizing: "border-box",
}

const TONE_TOGGLE: React.CSSProperties = {
    width: "100%",
    minHeight: 48,
    border: "0",
    background: "transparent",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    boxSizing: "border-box",
    fontSize: 14,
    fontWeight: 700,
    textTransform: "uppercase",
    cursor: "pointer",
}

const TONE_TOGGLE_LEFT: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
}

const TONE_CHEVRON: React.CSSProperties = {
    fontSize: 18,
    lineHeight: 1,
    color: "#ffffff",
}

const TONE_BODY: React.CSSProperties = {
    padding: "0 16px 14px",
    boxSizing: "border-box",
}

const TONE_LABEL_ROW: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
}

const TONE_TRACK_AREA: React.CSSProperties = {
    position: "relative",
    width: "calc(100% - 32px)",
    marginLeft: 16,
    marginRight: 16,
    height: 46,
    marginBottom: 14,
}

const TONE_TRACK_LINE: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 6,
    transform: "translateY(-50%)",
    background: "rgba(255,255,255,0.22)",
}

const TONE_CENTER_MARK: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 2,
    height: 28,
    background: "#ffffff",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
}

const TONE_THUMB: React.CSSProperties = buildMaskedThumbStyle(
    {
        position: "absolute",
        top: "50%",
        width: 28,
        height: 28,
        border: "0",
        padding: 0,
        margin: 0,
        transform: "translate(-50%, -50%)",
        cursor: "grab",
        touchAction: "none",
    },
    "#f3f3f3"
)

const TONE_RESET_ROW: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
}

const TONE_RESET_BUTTON: React.CSSProperties = {
    border: "0",
    background: "transparent",
    color: "#ff244f",
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    padding: 0,
    margin: 0,
    cursor: "pointer",
}

const BUTTON_ROW: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    gap: 30,
    marginTop: 24,
    paddingBottom: 8,
}

const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

function getViewportHeightPx(): number {
    if (typeof window === "undefined") return 0

    const vv = window.visualViewport
    if (vv?.height) return Math.round(vv.height)

    if (typeof document !== "undefined") {
        const h = document.documentElement?.clientHeight ?? 0
        if (h > 0) return h
    }

    return Math.round(window.innerHeight || 0)
}

function FitToViewport({
    children,
    background,
    onScale,
}: {
    children: React.ReactNode
    background: string
    onScale?: (s: number) => void
}) {
    const contentRef = React.useRef<HTMLDivElement | null>(null)

    const [viewport, setViewport] = React.useState({
        w: 1,
        h: 1,
    })
    const [contentSize, setContentSize] = React.useState({
        w: 1,
        h: 1,
    })
    const [scale, setScale] = React.useState(1)

    const VIEWPORT_PAD = 0

    useIsomorphicLayoutEffect(() => {
        let raf = 0

        const updateViewport = () => {
            if (raf) cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const vv =
                    typeof window !== "undefined" ? window.visualViewport : null

                const vh = vv?.height ?? getViewportHeightPx()
                const vw =
                    Math.round(
                        vv?.width ??
                            (typeof document !== "undefined"
                                ? document.documentElement.clientWidth
                                : 0) ??
                            (typeof window !== "undefined"
                                ? window.innerWidth
                                : 0)
                    ) || 0

                setViewport((prev) => {
                    const next = {
                        w: Math.max(1, vw),
                        h: Math.max(1, vh),
                    }

                    if (prev.w === next.w && prev.h === next.h) return prev
                    return next
                })
            })
        }

        updateViewport()

        window.addEventListener("resize", updateViewport)
        window.visualViewport?.addEventListener("resize", updateViewport)

        return () => {
            window.removeEventListener("resize", updateViewport)
            window.visualViewport?.removeEventListener("resize", updateViewport)
            if (raf) cancelAnimationFrame(raf)
        }
    }, [])

    useIsomorphicLayoutEffect(() => {
        const el = contentRef.current
        if (!el) return

        let raf = 0

        const measureContent = () => {
            if (raf) cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const nextW = Math.max(1, el.scrollWidth)
                const nextH = Math.max(1, el.scrollHeight)

                setContentSize((prev) => {
                    if (prev.w === nextW && prev.h === nextH) return prev
                    return {
                        w: nextW,
                        h: nextH,
                    }
                })
            })
        }

        measureContent()

        const ro = new ResizeObserver(() => measureContent())
        ro.observe(el)

        return () => {
            ro.disconnect()
            if (raf) cancelAnimationFrame(raf)
        }
    }, [])

    React.useEffect(() => {
        const availH = Math.max(1, viewport.h - VIEWPORT_PAD * 2)
        const availW = Math.max(1, viewport.w - VIEWPORT_PAD * 2)

        const sH = availH / Math.max(1, contentSize.h)
        const sW = availW / Math.max(1, contentSize.w)

        const next = Math.min(sH, sW)

        setScale((prev) => (Math.abs(prev - next) < 0.001 ? prev : next))
        onScale?.(next)
    }, [viewport, contentSize, onScale])

    const stageW = Math.max(1, Math.round(contentSize.w * scale))
    const stageH = Math.max(1, Math.round(contentSize.h * scale))

    return (
        <div
            style={{
                width: viewport.w,
                maxWidth: viewport.w,
                height: viewport.h,
                background,
                overflowX: "clip",
                overflowY: "hidden",
                padding: VIEWPORT_PAD,
                boxSizing: "border-box",
                display: "grid",
                placeItems: "start center",
                fontFamily:
                    'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
        >
            <div
                style={{
                    width: stageW,
                    height: stageH,
                    position: "relative",
                    overflow: "hidden",
                    display: "block",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: contentSize.w,
                        height: contentSize.h,
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                    }}
                >
                    <div
                        ref={contentRef}
                        style={{
                            display: "inline-block",
                            width: "fit-content",
                        }}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </div>
    )
}

export function SmartReferenceEditor({
    bakedBase = null,
    seedCommittedAdjustments = ZERO_SMART_REFERENCE_ADJUSTMENTS,
    loadPublishNonce = 0,
    isOpen = true,
    onCancel = () => {},
    onSmartObjectCommittedStateBridgeReady,
    onPublishEnvelope,
    onExport,
}: SmartReferenceEditorProps) {
    // =====================
    // SMART OBJECT MODULE STATE — S3
    // Эти сущности принадлежат SmartReferenceEditor module contract,
    // а не root и не PixelEditorFramer.
    //
    // H0 / HISTORY ENGINE CONTRACT:
    //
    // SmartReferenceEditor владеет своим smart-domain state.
    // Для истории важно различать:
    //
    // 1) committed-state
    //    То, что уже считается частью опубликованного состояния Smart Object
    //    и должно участвовать в undo/redo.
    //    Минимальный committed payload:
    //    - adjustments
    //    - revision
    //
    // 2) draft / live UI state
    //    То, что пользователь временно меняет внутри окна
    //    до Apply и что НЕ должно входить в committed history напрямую.
    //
    // На текущем шаге поведение ещё не меняем.
    // Мы только фиксируем доменный контракт перед внедрением History Engine.
    // H2:
    /// Open Smart Object = begin pending transaction (в coordinator/root)
    /// Cancel = abort pending transaction
    /// Apply = publish envelope, после чего coordinator/root
    /// превращает pending transaction в committed HistoryEntry.
    // =====================
    const [smartObjectBase, setSmartObjectBase] =
        React.useState<ImageData | null>(null)
    const smartObjectBaseRef = React.useRef<ImageData | null>(null)

    // WB domain state хранит session-stable source estimate и metadata.
    // В visible WB transform сейчас участвует sourceWhitePoint.
    // sourceKelvin / whiteBalanceConfidence / targetKelvin остаются metadata/debug domain state.
    const [whiteBalanceDomainState, setWhiteBalanceDomainState] =
        React.useState<SmartObjectWhiteBalanceDomainState>(() =>
            initializeWhiteBalanceDomainStateFromBakedBase(null)
        )

    // H4:
    // draft/live UI state внутри открытого окна
    const [smartAdjustments, setSmartAdjustments] =
        React.useState<SmartReferenceAdjustments>(
            ZERO_SMART_REFERENCE_ADJUSTMENTS
        )

    const [publishedRevision, setPublishedRevision] = React.useState<number>(0)

    const committedStateRef = React.useRef<SmartObjectCommittedState>({
        adjustments: { ...ZERO_SMART_REFERENCE_ADJUSTMENTS },
        revision: 0,
    })

    const previewCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
    const toneTrackRef = React.useRef<HTMLDivElement | null>(null)
    const lastHandledLoadPublishNonceRef = React.useRef(0)

    const [fitScale, setFitScale] = React.useState(1)

    const [isToneShapeOpen, setIsToneShapeOpen] = React.useState(false)
    const activeToneThumbRef = React.useRef<ToneThumbKey | null>(null)

    const effectiveAdjustments = smartAdjustments

    const effectiveWhiteBalanceDomainState = React.useMemo(
        () =>
            deriveEffectiveWhiteBalanceDomainState(
                effectiveAdjustments.whiteBalance,
                whiteBalanceDomainState
            ),
        [effectiveAdjustments.whiteBalance, whiteBalanceDomainState]
    )

    // S3/S6:
    // root only routes incoming seeds into the module.
    // Математика уже живёт внутри SmartReferenceEditor;
    // здесь мы только синхронизируем контейнер с новыми входными данными.
    React.useEffect(() => {
        // Новый bakedBase = новая локальная Smart Object session.
        // На import/load root может подать seed committed adjustments.
        smartObjectBaseRef.current = bakedBase
        setSmartObjectBase(bakedBase)

        const nextWhiteBalanceDomainState =
            initializeWhiteBalanceDomainStateFromBakedBase(bakedBase)

        setWhiteBalanceDomainState(nextWhiteBalanceDomainState)

        const safeSeedAdjustments: SmartReferenceAdjustments = {
            ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
            ...(seedCommittedAdjustments ?? ZERO_SMART_REFERENCE_ADJUSTMENTS),
        }

        setSmartAdjustments({
            ...safeSeedAdjustments,
        })

        committedStateRef.current = {
            adjustments: { ...safeSeedAdjustments },
            revision: 0,
        }
        setPublishedRevision(0)
    }, [bakedBase, seedCommittedAdjustments])

    React.useEffect(() => {
        if (!isOpen) return

        // H4:
        // при открытии окна UI обязан показывать последнее committed-state,
        // а не случайный незакоммиченный draft прошлой сессии.
        const committed = committedStateRef.current.adjustments

        setSmartAdjustments({
            ...committed,
        })
    }, [isOpen])

    // S5/S6 note:
    // buildReferenceSnapshot already works,
    // and local preview is driven by smartAdjustments.

    const publishSnapshotForBase = React.useCallback(
        (
            base: ImageData | null,
            adjustments: SmartReferenceAdjustments,
            kind: "import" | "load"
        ) => {
            if (!onPublishEnvelope) return

            if (!base) {
                onPublishEnvelope({
                    snapshot: null,
                    revision: 0,
                    kind,
                })
                return
            }

            const nextWhiteBalanceDomainState =
                initializeWhiteBalanceDomainStateFromBakedBase(base)
            const snapshot = buildReferenceSnapshot(
                base,
                adjustments,
                nextWhiteBalanceDomainState
            )

            onPublishEnvelope({
                snapshot,
                revision: 0,
                kind,
            })
        },
        [onPublishEnvelope]
    )

    const resetSmartObjectSession = React.useCallback(
        (
            base: ImageData | null,
            adjustments: SmartReferenceAdjustments,
            kind: "import" | "load"
        ) => {
            const safeAdjustments: SmartReferenceAdjustments = {
                ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
                ...(adjustments ?? ZERO_SMART_REFERENCE_ADJUSTMENTS),
            }

            smartObjectBaseRef.current = base
            setSmartObjectBase(base)

            const nextWhiteBalanceDomainState =
                initializeWhiteBalanceDomainStateFromBakedBase(base)
            setWhiteBalanceDomainState(nextWhiteBalanceDomainState)

            setSmartAdjustments({ ...safeAdjustments })

            committedStateRef.current = {
                adjustments: { ...safeAdjustments },
                revision: 0,
            }
            setPublishedRevision(0)

            publishSnapshotForBase(base, safeAdjustments, kind)
        },
        [publishSnapshotForBase]
    )

    React.useEffect(() => {
        if (!onSmartObjectCommittedStateBridgeReady) return

        onSmartObjectCommittedStateBridgeReady({
            captureCommittedState: () => ({
                adjustments: { ...committedStateRef.current.adjustments },
                revision: committedStateRef.current.revision,
            }),
            applyCommittedState: (state) => {
                const safeState: SmartObjectCommittedState = {
                    adjustments: {
                        ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
                        ...(state?.adjustments ??
                            ZERO_SMART_REFERENCE_ADJUSTMENTS),
                    },
                    revision:
                        typeof state?.revision === "number" &&
                        Number.isFinite(state.revision)
                            ? state.revision
                            : 0,
                }

                committedStateRef.current = {
                    adjustments: { ...safeState.adjustments },
                    revision: safeState.revision,
                }

                setPublishedRevision(safeState.revision)

                // UI при restore тоже должен синхронизироваться с committed-state.
                setSmartAdjustments({ ...safeState.adjustments })
            },
            importBakedBase: (base) => {
                resetSmartObjectSession(
                    base,
                    ZERO_SMART_REFERENCE_ADJUSTMENTS,
                    "import"
                )
            },
            restoreFromLoad: (payload) => {
                resetSmartObjectSession(
                    payload.base,
                    payload.adjustments ?? ZERO_SMART_REFERENCE_ADJUSTMENTS,
                    "load"
                )
            },
            clearBase: (kind) => {
                resetSmartObjectSession(
                    null,
                    ZERO_SMART_REFERENCE_ADJUSTMENTS,
                    kind
                )
            },
            captureBakedBaseForSave: () => smartObjectBaseRef.current,
            hasBakedBase: () => smartObjectBaseRef.current != null,
        })

        return () => {
            onSmartObjectCommittedStateBridgeReady(null)
        }
    }, [onSmartObjectCommittedStateBridgeReady, resetSmartObjectSession])

    React.useEffect(() => {
        if (!onPublishEnvelope) return
        if (!loadPublishNonce) return
        if (lastHandledLoadPublishNonceRef.current === loadPublishNonce) return

        lastHandledLoadPublishNonceRef.current = loadPublishNonce

        const safeSeedAdjustments: SmartReferenceAdjustments = {
            ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
            ...(seedCommittedAdjustments ?? ZERO_SMART_REFERENCE_ADJUSTMENTS),
        }

        const loadWhiteBalanceDomainState =
            initializeWhiteBalanceDomainStateFromBakedBase(bakedBase)

        const loadSnapshot = buildReferenceSnapshot(
            bakedBase,
            safeSeedAdjustments,
            loadWhiteBalanceDomainState
        )

        onPublishEnvelope({
            snapshot: loadSnapshot,
            revision: 0,
            kind: "load",
        })
    }, [
        onPublishEnvelope,
        loadPublishNonce,
        bakedBase,
        seedCommittedAdjustments,
    ])

    const previewSnapshot = React.useMemo(() => {
        return buildReferenceSnapshot(
            smartObjectBase,
            effectiveAdjustments,
            effectiveWhiteBalanceDomainState
        )
    }, [
        smartObjectBase,
        effectiveAdjustments,
        effectiveWhiteBalanceDomainState,
    ])

    React.useEffect(() => {
        const canvas = previewCanvasRef.current
        if (!canvas || !previewSnapshot) return

        const ctx = get2dReadFrequentlyContext(canvas)
        if (!ctx) return

        canvas.width = previewSnapshot.width
        canvas.height = previewSnapshot.height

        ctx.putImageData(previewSnapshot, 0, 0)
    }, [previewSnapshot])

    const handleAdjustmentChange = React.useCallback(
        (key: keyof SmartReferenceAdjustments) =>
            (e: React.ChangeEvent<HTMLInputElement>) => {
                const next = Number(e.target.value)

                setSmartAdjustments((prev) => ({
                    ...(prev ?? ZERO_SMART_REFERENCE_ADJUSTMENTS),
                    [key]: Number.isFinite(next) ? next : 0,
                }))
            },
        []
    )

    const handleToneShapeToggle = React.useCallback(() => {
        setIsToneShapeOpen((prev) => !prev)
    }, [])

    const handleToneShapeReset = React.useCallback(() => {
        setSmartAdjustments((prev) => ({
            ...(prev ?? ZERO_SMART_REFERENCE_ADJUSTMENTS),
            shadows: 0,
            midtones: 0,
            highlights: 0,
        }))
    }, [])

    const updateToneThumbFromClientX = React.useCallback(
        (key: ToneThumbKey, clientX: number) => {
            const track = toneTrackRef.current
            if (!track) return

            const rect = track.getBoundingClientRect()
            if (rect.width <= 0) return

            const rawT = (clientX - rect.left) / rect.width
            const t = Math.max(0, Math.min(1, rawT))

            setSmartAdjustments((prev) => {
                const base = prev ?? ZERO_SMART_REFERENCE_ADJUSTMENTS

                if (key === "shadows") {
                    const next = Math.round(
                        Math.max(0, Math.min(1, t * 2)) * 100
                    )
                    return { ...base, shadows: next }
                }

                if (key === "midtones") {
                    const next = Math.round((t * 2 - 1) * 100)
                    return {
                        ...base,
                        midtones: Math.max(-100, Math.min(100, next)),
                    }
                }

                const next = Math.round(
                    (1 - Math.max(0, Math.min(1, (t - 0.5) * 2))) * 100
                )
                return {
                    ...base,
                    highlights: Math.max(0, Math.min(100, next)),
                }
            })
        },
        []
    )

    const handleToneThumbPointerDown = React.useCallback(
        (key: ToneThumbKey) => (e: React.PointerEvent<HTMLButtonElement>) => {
            activeToneThumbRef.current = key
            e.currentTarget.setPointerCapture(e.pointerId)
            updateToneThumbFromClientX(key, e.clientX)
        },
        [updateToneThumbFromClientX]
    )

    const handleToneThumbPointerMove = React.useCallback(
        (key: ToneThumbKey) => (e: React.PointerEvent<HTMLButtonElement>) => {
            if (activeToneThumbRef.current !== key) return
            updateToneThumbFromClientX(key, e.clientX)
        },
        [updateToneThumbFromClientX]
    )

    const handleToneThumbPointerEnd = React.useCallback(
        (key: ToneThumbKey) => (e: React.PointerEvent<HTMLButtonElement>) => {
            if (activeToneThumbRef.current === key) {
                activeToneThumbRef.current = null
            }

            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId)
            }
        },
        []
    )

    const whiteBalancePct = Math.max(
        0,
        Math.min(100, effectiveAdjustments.whiteBalance * 100)
    )

    const shadowPct = Math.max(
        0,
        Math.min(50, (effectiveAdjustments.shadows / 100) * 50)
    )
    const midPct = Math.max(
        0,
        Math.min(100, 50 + (effectiveAdjustments.midtones / 100) * 50)
    )
    const highlightsPct = Math.max(
        50,
        Math.min(100, 100 - (effectiveAdjustments.highlights / 100) * 50)
    )

    const bottomButtonsCompensationScale = fitScale > 1e-6 ? 1 / fitScale : 1

    const bottomActionButtonStyle: React.CSSProperties = {
        ...okCancelButtonStyle,
        width: 50 * bottomButtonsCompensationScale,
        height: 50 * bottomButtonsCompensationScale,
        marginTop: 35 * bottomButtonsCompensationScale,
        marginLeft: 14 * bottomButtonsCompensationScale,
        marginRight: 14 * bottomButtonsCompensationScale,
    }

    const handleApply = React.useCallback(() => {
        if (!onPublishEnvelope) {
            return
        }

        const committedSnapshot = buildReferenceSnapshot(
            smartObjectBase,
            effectiveAdjustments,
            effectiveWhiteBalanceDomainState
        )

        const nextRevision = publishedRevision <= 0 ? 1 : publishedRevision + 1

        const nextCommittedState: SmartObjectCommittedState = {
            adjustments: { ...effectiveAdjustments },
            revision: nextRevision,
        }

        // H4:
        // committed-state Smart Object должен обновиться ДО publish envelope,
        // чтобы Root мог сразу захватить корректный smartAfter через bridge.
        committedStateRef.current = {
            adjustments: { ...nextCommittedState.adjustments },
            revision: nextCommittedState.revision,
        }

        setPublishedRevision(nextCommittedState.revision)

        onPublishEnvelope({
            snapshot: committedSnapshot,
            revision: nextRevision,
            kind: "smart-object-apply",
        })
    }, [
        onPublishEnvelope,
        smartObjectBase,
        effectiveAdjustments,
        effectiveWhiteBalanceDomainState,
        publishedRevision,
    ])

    const handleExport = React.useCallback(() => {
        if (!onExport) {
            return
        }

        onExport({
            previewImage: previewSnapshot,
            adjustments: { ...effectiveAdjustments },
        })
    }, [onExport, previewSnapshot, effectiveAdjustments])

    if (!isOpen) {
        return null
    }

    return (
        <FitToViewport
            background="#031219"
            onScale={(s) => {
                setFitScale(s)
            }}
        >
            <style>{SMART_UI_BUTTON_ANIM_CSS}</style>
            <div style={WRAP}>
                <style>{`
                input.soRange[type="range"]{
                    -webkit-appearance: none;
                    appearance: none;
                    background: transparent;
                }

                input.soRange[type="range"]::-webkit-slider-runnable-track{
                    height: ${PX_RANGE_TRACK_H}px;
                    background: #fff;
                    border: none;
                }

                input.soRange[type="range"]::-moz-range-track{
                    height: ${PX_RANGE_TRACK_H}px;
                    background: #fff;
                    border: none;
                }

                input.soRange[type="range"]::-webkit-slider-thumb{
                    -webkit-appearance: none;
                    appearance: none;
                    width: ${PX_RANGE_THUMB_SIZE}px;
                    height: ${PX_RANGE_THUMB_SIZE}px;
                    border: none;
                    background-color: #f3f3f3;

                    -webkit-mask-image: ${RANGE_CIRCLE_MASK_URL};
                    -webkit-mask-repeat: no-repeat;
                    -webkit-mask-position: center;
                    -webkit-mask-size: 100% 100%;

                    mask-image: ${RANGE_CIRCLE_MASK_URL};
                    mask-repeat: no-repeat;
                    mask-position: center;
                    mask-size: 100% 100%;

                    margin-top: calc((${PX_RANGE_TRACK_H}px - ${PX_RANGE_THUMB_SIZE}px) / 2);
                }

                input.soRange[type="range"]::-moz-range-thumb{
                    width: ${PX_RANGE_THUMB_SIZE}px;
                    height: ${PX_RANGE_THUMB_SIZE}px;
                    border: none;
                    border-radius: 0;
                    background-color: #f3f3f3;

                    -webkit-mask-image: ${RANGE_CIRCLE_MASK_URL};
                    -webkit-mask-repeat: no-repeat;
                    -webkit-mask-position: center;
                    -webkit-mask-size: 100% 100%;

                    mask-image: ${RANGE_CIRCLE_MASK_URL};
                    mask-repeat: no-repeat;
                    mask-position: center;
                    mask-size: 100% 100%;
                }

                input.soRange[type="range"]:focus{
                    outline: none;
                }
            `}</style>
                <div style={INNER}>
                    <div style={PREVIEW_WRAP}>
                        {previewSnapshot ? (
                            <canvas
                                ref={previewCanvasRef}
                                style={PREVIEW_CANVAS}
                            />
                        ) : (
                            <div
                                style={{
                                    ...PREVIEW_CANVAS,
                                    minHeight: 240,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "rgba(255,255,255,0.55)",
                                }}
                            >
                                No preview
                            </div>
                        )}
                    </div>

                    <div style={CONTROLS_STACK}>
                        <div style={CONTROL_BLOCK}>
                            <p style={CONTROL_LABEL}>
                                EXPOSURE: {effectiveAdjustments.exposure}
                            </p>
                            <input
                                className="soRange"
                                type="range"
                                min={-100}
                                max={100}
                                step={1}
                                value={effectiveAdjustments.exposure}
                                onChange={handleAdjustmentChange("exposure")}
                                style={RANGE_INPUT}
                            />
                        </div>

                        <div style={CONTROL_BLOCK}>
                            <p style={CONTROL_LABEL}>
                                CONTRAST: {effectiveAdjustments.contrast}
                            </p>
                            <input
                                className="soRange"
                                type="range"
                                min={-100}
                                max={100}
                                step={1}
                                value={effectiveAdjustments.contrast}
                                onChange={handleAdjustmentChange("contrast")}
                                style={RANGE_INPUT}
                            />
                        </div>

                        <div style={CONTROL_BLOCK}>
                            <p style={CONTROL_LABEL}>
                                SATURATION: {effectiveAdjustments.saturation}
                            </p>
                            <input
                                className="soRange"
                                type="range"
                                min={-100}
                                max={100}
                                step={1}
                                value={effectiveAdjustments.saturation}
                                onChange={handleAdjustmentChange("saturation")}
                                style={RANGE_INPUT}
                            />
                        </div>

                        {/* WB UI NOTE:
    White Balance is a centered warm/cool control.

    Neutral point:
    - whiteBalance = 0.5
    - center of slider
    - identity transform

    Visible WB effect is built around an adaptive neutral anchor.
    The anchor affects internal slider trajectory only
    and does NOT normalize the image at center.

    UI semantics:
    - left   = cool
    - center = neutral
    - right  = warm
*/}

                        <div style={CONTROL_BLOCK}>
                            <p style={CONTROL_LABEL}>
                                WHITE BALANCE:{" "}
                                {Math.round(
                                    (effectiveAdjustments.whiteBalance - 0.5) *
                                        200
                                )}
                            </p>

                            <div style={WB_TRACK_AREA}>
                                <div style={WB_TRACK_LINE} />
                                <div style={WB_CENTER_MARK} />

                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.001}
                                    value={effectiveAdjustments.whiteBalance}
                                    onChange={handleAdjustmentChange(
                                        "whiteBalance"
                                    )}
                                    style={WB_RANGE_HITBOX}
                                />

                                <div
                                    style={{
                                        ...WB_THUMB,
                                        left: `${whiteBalancePct}%`,
                                    }}
                                />
                            </div>
                        </div>

                        <div style={TONE_PANEL}>
                            <button
                                type="button"
                                onClick={handleToneShapeToggle}
                                aria-label="Tone Shape"
                                style={TONE_TOGGLE}
                            >
                                <span style={TONE_TOGGLE_LEFT}>
                                    <span>TONE SHAPE</span>
                                </span>
                                <span style={TONE_CHEVRON}>
                                    {isToneShapeOpen ? "▴" : "▾"}
                                </span>
                            </button>

                            {isToneShapeOpen && (
                                <div style={TONE_BODY}>
                                    <div style={TONE_LABEL_ROW}>
                                        <span>SHADOWS</span>
                                        <span>MID (BALANCE)</span>
                                        <span>HIGHLIGHTS</span>
                                    </div>

                                    <div
                                        ref={toneTrackRef}
                                        style={TONE_TRACK_AREA}
                                    >
                                        <div style={TONE_TRACK_LINE} />
                                        <div style={TONE_CENTER_MARK} />

                                        <button
                                            type="button"
                                            aria-label="Shadows"
                                            onPointerDown={handleToneThumbPointerDown(
                                                "shadows"
                                            )}
                                            onPointerMove={handleToneThumbPointerMove(
                                                "shadows"
                                            )}
                                            onPointerUp={handleToneThumbPointerEnd(
                                                "shadows"
                                            )}
                                            onPointerCancel={handleToneThumbPointerEnd(
                                                "shadows"
                                            )}
                                            style={{
                                                ...TONE_THUMB,
                                                left: `${shadowPct}%`,
                                                zIndex: 1,
                                            }}
                                        />

                                        <button
                                            type="button"
                                            aria-label="Midtones"
                                            onPointerDown={handleToneThumbPointerDown(
                                                "midtones"
                                            )}
                                            onPointerMove={handleToneThumbPointerMove(
                                                "midtones"
                                            )}
                                            onPointerUp={handleToneThumbPointerEnd(
                                                "midtones"
                                            )}
                                            onPointerCancel={handleToneThumbPointerEnd(
                                                "midtones"
                                            )}
                                            style={{
                                                ...TONE_THUMB,
                                                left: `${midPct}%`,
                                                zIndex: 2,
                                            }}
                                        />

                                        <button
                                            type="button"
                                            aria-label="Highlights"
                                            onPointerDown={handleToneThumbPointerDown(
                                                "highlights"
                                            )}
                                            onPointerMove={handleToneThumbPointerMove(
                                                "highlights"
                                            )}
                                            onPointerUp={handleToneThumbPointerEnd(
                                                "highlights"
                                            )}
                                            onPointerCancel={handleToneThumbPointerEnd(
                                                "highlights"
                                            )}
                                            style={{
                                                ...TONE_THUMB,
                                                left: `${highlightsPct}%`,
                                                zIndex: 1,
                                            }}
                                        />
                                    </div>

                                    <div style={TONE_RESET_ROW}>
                                        <button
                                            type="button"
                                            onClick={handleToneShapeReset}
                                            style={TONE_RESET_BUTTON}
                                        >
                                            RESET
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Smart Object bottom action row:
                        одна каноническая семья кнопок:
                        Cancel / Apply / Export */}
                    <div style={BUTTON_ROW}>
                        <button
                            type="button"
                            onClick={onCancel}
                            style={bottomActionButtonStyle}
                            aria-label="Cancel"
                            className="pxUiAnim"
                        >
                            <SvgCancelButton style={okCancelSvgStyle} />
                        </button>

                        <button
                            type="button"
                            onClick={handleApply}
                            disabled={!onPublishEnvelope}
                            style={{
                                ...bottomActionButtonStyle,
                                opacity: onPublishEnvelope ? 1 : 0.45,
                                cursor: onPublishEnvelope
                                    ? "pointer"
                                    : "default",
                            }}
                            aria-label="Apply"
                            className="pxUiAnim"
                        >
                            <SvgOkButton style={okCancelSvgStyle} />
                        </button>

                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={!onExport || !previewSnapshot}
                            style={{
                                ...bottomActionButtonStyle,
                                opacity: onExport && previewSnapshot ? 1 : 0.45,
                                cursor:
                                    onExport && previewSnapshot
                                        ? "pointer"
                                        : "default",
                            }}
                            aria-label="Export"
                            className="pxUiAnim"
                        >
                            <SvgExportSOButton style={okCancelSvgStyle} />
                        </button>
                    </div>
                </div>
            </div>
        </FitToViewport>
    )
}

export default SmartReferenceEditor

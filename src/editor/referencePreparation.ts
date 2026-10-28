export const PREP_CONFIG = {
    // sanitize
    SANITIZE_DIAGNOSTICS: true,
    ENABLE_COLOR_SANITIZATION: true,

    // Sanitization strength (0..1).
    SANITIZE_STRENGTH: 0.3,

    SANITIZE_DEBUG_X10: false,
    SANITIZE_DEBUG_X10_CAMERA: false,

    // Strict gray: channel differences must all be within GRAY_EPS.
    GRAY_EPS: 10,

    // Leave near-white and near-black colors unchanged.
    WHITE_CUTOFF: 0.93,
    BLACK_CUTOFF: 0.08,

    // Low-saturation threshold for gentle correction.
    SAT_TRIGGER: 0.32,

    // Safe saturation ceiling.
    SAT_SAFE: 0.4,

    // Dark midtone range where dull colors are most noticeable.
    V_MIN: 0.22,
    V_MAX: 0.65,

    // Stylization Boost: second preparation stage.
    // Runs AFTER sanitize and BEFORE quantization.
    ENABLE_STYLIZATION_BOOST: true,
    ENABLE_PREP_LOGS: true,

    // Diagnostics, as in sanitize.
    BOOST_DIAGNOSTICS: true,

    // Additional RGB white protection for HSV boundary cases.
    BOOST_WHITE_RGB_CUTOFF: 250, // Leave pixels unchanged when all channels reach this cutoff.

    // Do not boost already saturated colors.
    BOOST_S_SAFE: 0.55, // Above this saturation, leave the pixel unchanged.

    // Midtone range.
    BOOST_V_MIN: 0.25, // Lower midtone boundary.
    BOOST_V_MID_MAX: 0.75, // Upper midtone boundary, expanded for poster-like rendering.

    // Saturation controls.
    BOOST_S_TRIGGER: 0.5, // Target dull colors, with gentler treatment for skin.

    // Strength and limits.
    BOOST_STRENGTH: 0.85, // Boost strength for the narrower protected range.
    BOOST_S_MAX: 0.9, // Saturation ceiling.
    BOOST_V_CAP: 0.95, // Value ceiling protects whites and skin.
    BOOST_V_LIFT_MAX: 0.12, // Maximum midtone lift for poster-like rendering.

    // --- Skin-safe V fade (B5) ---
    BOOST_V_SKIN_FADE_START: 0.5,
    BOOST_V_SKIN_FADE_END: 0.68,

    // --- Skin low-midtones rescue (B5) ---
    // Prevent gray-looking skin in lower midtones:
    // slightly stronger saturation boost for skin while value is low.
    BOOST_V_SKIN_LOW_END: 0.42,
    BOOST_SKIN_S_GAIN_LOW_K: 0.92, // Closer to one means less gray, while remaining conservative.

    // Reduce both saturation and lift for skin in upper midtones.
    BOOST_SKIN_LIFT_K: 0.55,

    // Conservative skin detection.
    // The existing conversion returns hue in degrees and saturation/value in 0..1.
    BOOST_SKIN_H_MIN: 0.02,
    BOOST_SKIN_H_MAX: 0.14,
    BOOST_SKIN_S_MIN: 0.08,
    BOOST_SKIN_S_MAX: 0.75,

    // Reduced saturation gain for skin to avoid excessive orange tones.
    BOOST_SKIN_S_GAIN_K: 0.35,
} as const

const { SANITIZE_STRENGTH, GRAY_EPS, WHITE_CUTOFF, BLACK_CUTOFF, SAT_TRIGGER, SAT_SAFE, V_MIN, V_MAX, BOOST_WHITE_RGB_CUTOFF, BOOST_S_SAFE, BOOST_V_MIN, BOOST_V_MID_MAX, BOOST_S_TRIGGER, BOOST_STRENGTH, BOOST_S_MAX, BOOST_V_CAP, BOOST_V_LIFT_MAX, BOOST_V_SKIN_FADE_START, BOOST_V_SKIN_FADE_END, BOOST_V_SKIN_LOW_END, BOOST_SKIN_S_GAIN_LOW_K, BOOST_SKIN_LIFT_K, BOOST_SKIN_H_MIN, BOOST_SKIN_H_MAX, BOOST_SKIN_S_MIN, BOOST_SKIN_S_MAX, BOOST_SKIN_S_GAIN_K } = PREP_CONFIG
const BOOST_GRAY_EPS = GRAY_EPS
const BOOST_WHITE_CUTOFF = WHITE_CUTOFF
const BOOST_BLACK_CUTOFF = BLACK_CUTOFF

function clamp01(x: number) {
    return Math.max(0, Math.min(1, x))
}

export function clamp255(x: number) {
    return Math.max(0, Math.min(255, Math.round(x)))
}

function isStrictGray(r: number, g: number, b: number, eps: number) {
    return (
        Math.abs(r - g) <= eps &&
        Math.abs(r - b) <= eps &&
        Math.abs(g - b) <= eps
    )
}

function isMostlyGrayscaleImageData(imageData: ImageData) {
    const data = imageData.data

    // Sample at most about 1024 pixels to avoid another full pass.
    const totalPixels = Math.floor(data.length / 4)
    const sampleCount = Math.min(1024, totalPixels)
    if (sampleCount <= 0) return false

    const stepPx = Math.max(1, Math.floor(totalPixels / sampleCount))
    const step = stepPx * 4

    let checked = 0
    let gray = 0

    // Use a wider gray tolerance for monochrome frames.
    const eps = GRAY_EPS * 2

    for (let i = 0; i < data.length; i += step) {
        const a = data[i + 3]
        if (a === 0) continue // Ignore fully transparent pixels.

        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        checked++
        if (isStrictGray(r, g, b, eps)) gray++
    }

    if (checked === 0) return false

    // Treat a nearly all-gray image as monochrome.
    return gray / checked >= 0.985
}

// Gently adjust dull midtones, protecting grays, whites and blacks without mutating input.
function sanitizeRgbPixel(px: { r: number; g: number; b: number; a?: number }) {
    const r = clamp255(px.r)
    const g = clamp255(px.g)
    const b = clamp255(px.b)

    // Protect strict grays.
    if (isStrictGray(r, g, b, GRAY_EPS)) {
        return { r, g, b }
    }

    // Use the existing RGB-to-HSV conversion.
    const { h, s, v } = rgbToHsv(r, g, b)

    // Protect near-whites from tinting.
    if (v >= WHITE_CUTOFF) {
        return { r, g, b }
    }

    // Protect near-blacks.
    if (v <= BLACK_CUTOFF) {
        return { r, g, b }
    }

    // Only affect dark midtones.
    if (v < V_MIN || v > V_MAX) {
        return { r, g, b }
    }

    // Leave already saturated pixels unchanged.
    if (s >= SAT_SAFE) {
        return { r, g, b }
    }

    // ---------
    // Vibrance-like: lower saturation permits a larger relative boost,
    // bounded by the conservative SAT_SAFE ceiling.
    // ---------
    const satGap = SAT_SAFE - s
    if (satGap <= 0) {
        return { r, g, b }
    }

    const lowSatFactor = clamp01((SAT_TRIGGER - s) / SAT_TRIGGER) // 0..1
    const sBoost = satGap * SANITIZE_STRENGTH * lowSatFactor
    const s2 = clamp01(s + sBoost)

    const rgb2 = hsvToRgb(h, s2, v)
    return {
        r: clamp255(rgb2.r),
        g: clamp255(rgb2.g),
        b: clamp255(rgb2.b),
    }
}

export function sanitizeImageDataDelicate(imageData: ImageData): ImageData {
    const w = imageData.width
    const h = imageData.height

    // Work on a copy; preserve the input.
    const out = new ImageData(new Uint8ClampedArray(imageData.data), w, h)
    const d = out.data

    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]

        // Skip fully transparent pixels while retaining their alpha.
        if (a === 0) continue

        const r = d[i + 0]
        const g = d[i + 1]
        const b = d[i + 2]

        const rgb2 = sanitizeRgbPixel({ r, g, b })
        d[i + 0] = rgb2.r
        d[i + 1] = rgb2.g
        d[i + 2] = rgb2.b
        // Preserve alpha exactly.
    }

    return out
}

export function stylizeBoostImageData(imageData: ImageData): ImageData {
    // Work on a copy; preserve the input.
    const out = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
    )

    // Do not boost a nearly monochrome image.
    // Return an exact copy in that case.
    if (isMostlyGrayscaleImageData(imageData)) {
        return out
    }

    const data = out.data
    // reuse (no allocations per-pixel)
    const hsvTmpDeg = { h: 0, s: 0, v: 0 }
    const rgbTmp = { r: 0, g: 0, b: 0 }

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]

        // Preserve alpha as an invariant.
        // Fully transparent pixels could be skipped, but retain the existing calculation here.
        // if (a === 0) continue

        // Protect near-white RGB colors.
        if (
            r >= BOOST_WHITE_RGB_CUTOFF &&
            g >= BOOST_WHITE_RGB_CUTOFF &&
            b >= BOOST_WHITE_RGB_CUTOFF
        ) {
            continue
        }

        // Protect strict grays.
        if (isStrictGray(r, g, b, BOOST_GRAY_EPS)) {
            continue
        }

        // Use the existing RGB-to-HSV conversion.
        rgbToHsvIntoDeg(r, g, b, hsvTmpDeg)
        const h = hsvTmpDeg.h
        const s = hsvTmpDeg.s
        const v = hsvTmpDeg.v

        // Protect near-whites by value.
        if (v >= BOOST_WHITE_CUTOFF) {
            continue
        }

        // Protect near-blacks by value.
        if (v <= BOOST_BLACK_CUTOFF) {
            continue
        }

        // Protect already saturated colors.
        if (s >= BOOST_S_SAFE) {
            continue
        }

        // Limit processing to midtones.
        if (v < BOOST_V_MIN || v > BOOST_V_MID_MAX) {
            continue
        }

        // Dull-color trigger.
        if (s >= BOOST_S_TRIGGER) {
            continue
        }

        // Dullness factor.
        const dustK = clamp01(1 - s / Math.max(1e-6, BOOST_S_TRIGGER))

        // Lower-midtone factor.
        const midK = clamp01(
            1 -
                (v - BOOST_V_MIN) /
                    Math.max(1e-6, BOOST_V_MID_MAX - BOOST_V_MIN)
        )

        // --- Skin-safe V fade (B5) ---
        let skinFadeK = 1
        if (v >= BOOST_V_SKIN_FADE_START) {
            skinFadeK = clamp01(
                1 -
                    (v - BOOST_V_SKIN_FADE_START) /
                        Math.max(
                            1e-6,
                            BOOST_V_SKIN_FADE_END - BOOST_V_SKIN_FADE_START
                        )
            )
        }

        // Skin rescue: one at the darkest midtones, zero at BOOST_V_SKIN_LOW_END.
        const skinLowK = clamp01(
            (BOOST_V_SKIN_LOW_END - v) /
                Math.max(1e-6, BOOST_V_SKIN_LOW_END - BOOST_V_MIN)
        )

        // --- Skin detect ---
        const isSkin =
            h >= BOOST_SKIN_H_MIN &&
            h <= BOOST_SKIN_H_MAX &&
            s >= BOOST_SKIN_S_MIN &&
            s <= BOOST_SKIN_S_MAX &&
            v >= BOOST_V_MIN &&
            v <= BOOST_V_CAP

        // Base boost strength.
        const baseBoost = BOOST_STRENGTH * midK * dustK

        // --- Skin behavior (B5) ---
        // Upper midtones: fade skin saturation gain through skinFadeK.
        // Lower midtones: restore some skin saturation gain through skinLowK.
        const skinSatK =
            (BOOST_SKIN_S_GAIN_K * (1 - skinLowK) +
                BOOST_SKIN_S_GAIN_LOW_K * skinLowK) *
            skinFadeK

        const boostAmountSat = baseBoost * (isSkin ? skinSatK : 1)

        // Keep skin lift conservative and fade it further in upper midtones.
        const boostAmountLift =
            baseBoost * (isSkin ? BOOST_SKIN_LIFT_K * skinFadeK : 1)
        const sGain = boostAmountSat * 0.55
        const s2 = clamp01(Math.min(BOOST_S_MAX, s + sGain))

        const vLift = Math.min(BOOST_V_LIFT_MAX, boostAmountLift * midK * 0.12)
        const v2 = clamp01(Math.min(BOOST_V_CAP, v + vLift))

        hsvToRgbIntoDeg(h, s2, v2, rgbTmp)
        data[i] = rgbTmp.r
        data[i + 1] = rgbTmp.g
        data[i + 2] = rgbTmp.b
        data[i + 3] = a // Preserve alpha.
    }

    return out
}

export function rgbToHsv(r: number, g: number, b: number) {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min

    let h = 0
    if (d !== 0) {
        switch (max) {
            case r:
                h = ((g - b) / d) % 6
                break
            case g:
                h = (b - r) / d + 2
                break
            case b:
                h = (r - g) / d + 4
                break
        }
        h *= 60
        if (h < 0) h += 360
    }
    const s = max === 0 ? 0 : d / max
    const v = max
    return { h, s, v }
}

export function hsvToRgb(h: number, s: number, v: number) {
    h = ((h % 360) + 360) % 360
    const c = v * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = v - c

    let r1 = 0,
        g1 = 0,
        b1 = 0

    if (h < 60) {
        r1 = c
        g1 = x
        b1 = 0
    } else if (h < 120) {
        r1 = x
        g1 = c
        b1 = 0
    } else if (h < 180) {
        r1 = 0
        g1 = c
        b1 = x
    } else if (h < 240) {
        r1 = 0
        g1 = x
        b1 = c
    } else if (h < 300) {
        r1 = x
        g1 = 0
        b1 = c
    } else {
        r1 = c
        g1 = 0
        b1 = x
    }

    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    }
}

function rgbToHsvIntoDeg(
    r: number,
    g: number,
    b: number,
    out: { h: number; s: number; v: number }
) {
    const rf = r / 255
    const gf = g / 255
    const bf = b / 255

    const max = Math.max(rf, gf, bf)
    const min = Math.min(rf, gf, bf)
    const d = max - min

    let h = 0
    const s = max === 0 ? 0 : d / max
    const v = max

    if (d !== 0) {
        if (max === rf) h = ((gf - bf) / d) % 6
        else if (max === gf) h = (bf - rf) / d + 2
        else h = (rf - gf) / d + 4

        h *= 60 // -> degrees
        if (h < 0) h += 360
    }

    out.h = h
    out.s = s
    out.v = v
}

function hsvToRgbIntoDeg(
    h: number,
    s: number,
    v: number,
    out: { r: number; g: number; b: number }
) {
    // normalize
    h = ((h % 360) + 360) % 360

    const c = v * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = v - c

    let r1 = 0,
        g1 = 0,
        b1 = 0

    if (h < 60) {
        r1 = c
        g1 = x
        b1 = 0
    } else if (h < 120) {
        r1 = x
        g1 = c
        b1 = 0
    } else if (h < 180) {
        r1 = 0
        g1 = c
        b1 = x
    } else if (h < 240) {
        r1 = 0
        g1 = x
        b1 = c
    } else if (h < 300) {
        r1 = x
        g1 = 0
        b1 = c
    } else {
        r1 = c
        g1 = 0
        b1 = x
    }

    out.r = Math.round((r1 + m) * 255)
    out.g = Math.round((g1 + m) * 255)
    out.b = Math.round((b1 + m) * 255)
}

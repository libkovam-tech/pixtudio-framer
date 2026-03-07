import * as React from "react"
import * as ReactDOM from "react-dom"

import { ManualScreen } from "./ManualScreen.tsx"

import {
    InlineSvgWrap,
    SvgTopButton3,
    SvgTopButton4,
    SvgManualButton,
    SvgCloseIcon,
    SvgModalBacking,
    SvgAlertBacking,
    SvgCancelButton,
    SvgOkButton,
    SvgPickerThumb,
    SvgCircle,
    SvgImageWhite,
    SvgImage,
    SvgCameraWhite,
    SvgBlankCanvasWhite,
    SvgFolder,
    SvgCamera,
    SvgPencil,
    SvgLogo,
    ExportCheckboxIcon,
    SaveIcon,
    LoadIcon,
    UndoIcon,
    RedoIcon,
    ZoomOutIcon,
    ZoomInIcon,
    PipetteIcon,
    HandIconOn,
    HandIconOff,
} from "./SvgIcons.tsx"

const CANVAS_SIZE = 512
const TRANSPARENT_LABEL = "Transparent"
const TRANSPARENT_PIXEL = "__PX_TRANSPARENT__" as const

const MODAL_OVERLAY_STYLE: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.3)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    zIndex: 999,
}

const SWATCH_MODAL_W = 360

// --- P1: Canonical "SourceImage" type for CropFlow (original, not 512x512, not ImageData) ---

export type SourceImage = ImageBitmap

// --- P2: Decode gallery File -> SourceImage (decode only; fail-closed; no resize; no presets) ---

export async function decodeToSourceImage(file: File): Promise<SourceImage> {
    // Fail-closed: images only
    if (
        !file ||
        typeof file.type !== "string" ||
        !file.type.startsWith("image/")
    ) {
        throw new Error("decodeToSourceImage: only image/* files are allowed")
    }

    // We standardize on ImageBitmap as SourceImage.
    if (typeof createImageBitmap !== "function") {
        throw new Error(
            "decodeToSourceImage: createImageBitmap is not available in this environment"
        )
    }

    // Try to respect EXIF orientation where supported.
    try {
        return await createImageBitmap(file, {
            imageOrientation: "from-image",
        } as any)
    } catch {
        // Fallback: decode without orientation options.
        return await createImageBitmap(file)
    }
}

const ENABLE_PREP_LOGS = false
const ENABLE_TXN_LOGS = false
const ENABLE_SAVELOAD_CHECKSUM_LOGS = false
const ENABLE_OVERLAY_FALLBACK_LOGS = false

const ENABLE_LOAD_TRACE_LOGS = false

const ENABLE_ROUTE_LOGS = false

function countNonNullCells(grid: PixelValue[][]): number {
    let n = 0
    for (let r = 0; r < grid.length; r++) {
        const row = grid[r] || []
        for (let c = 0; c < row.length; c++) {
            const v = row[c] ?? null
            if (v !== null) n++
        }
    }
    return n
}

function routeLog(stage: string, meta?: any) {
    if (!ENABLE_ROUTE_LOGS) return
    const t = nowMs().toFixed(1)
    try {
        console.log(`[ROUTE t=${t}] ${stage}`, meta ?? "")
    } catch {
        console.log(`[ROUTE t=${t}] ${stage}`)
    }
}

function nowMs() {
    return typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now()
}

function fnv1a32(str: string): string {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(16).padStart(8, "0")
}

function checksumJsonString(json: string): string {
    return fnv1a32(json)
}

function createTransparencyTile(tileSize: number): HTMLCanvasElement {
    const tile = document.createElement("canvas")
    tile.width = tileSize * 2
    tile.height = tileSize * 2

    const ctx = tile.getContext("2d")!
    // Цвета должны совпадать с canvas-логикой drawCheckerboard
    const a = "#ffffff"
    const b = "#d9d9d9"

    ctx.fillStyle = a
    ctx.fillRect(0, 0, tile.width, tile.height)

    ctx.fillStyle = b
    ctx.fillRect(0, 0, tileSize, tileSize)
    ctx.fillRect(tileSize, tileSize, tileSize, tileSize)

    return tile
}

// --- Transparency pattern cache ---
let __transparencyTile1px: HTMLCanvasElement | null = null

function getTransparencyTile1px(): HTMLCanvasElement {
    if (!__transparencyTile1px) {
        __transparencyTile1px = createTransparencyTile(1)
    }
    return __transparencyTile1px
}

function drawCoverIntoSquare(
    ctx: CanvasRenderingContext2D,
    src: CanvasImageSource,
    size: number
) {
    const anySrc: any = src as any

    const srcW =
        anySrc?.naturalWidth ?? anySrc?.videoWidth ?? anySrc?.width ?? 0

    const srcH =
        anySrc?.naturalHeight ?? anySrc?.videoHeight ?? anySrc?.height ?? 0

    if (!srcW || !srcH) return

    // cover-crop: заполняем квадрат, сохраняя пропорции; лишнее обрезается ("уши")
    const scale = Math.max(size / srcW, size / srcH)
    const drawW = srcW * scale
    const drawH = srcH * scale
    const dx = (size - drawW) / 2
    const dy = (size - drawH) / 2

    ctx.drawImage(src, dx, dy, drawW, drawH)
}

// ===== COLOR SANITIZATION (MVP, Step 0: infra only, no behavior change) =====

const PREP_CONFIG = {
    // sanitize
    SANITIZE_DIAGNOSTICS: true,
    ENABLE_COLOR_SANITIZATION: true,

    // “Сила” деликатной пред-обработки (0..1). Сейчас только константа — нигде не применяется.
    SANITIZE_STRENGTH: 0.3,

    SANITIZE_DEBUG_X10: false,
    SANITIZE_DEBUG_X10_CAMERA: false,

    // Строгий gray: только когда каналы почти равны (|r-g|, |g-b|, |r-b| <= GRAY_EPS)
    GRAY_EPS: 10,

    // Почти белое / почти чёрное — НЕ трогаем (табy на “подкрашивание” светлых)
    WHITE_CUTOFF: 0.93,
    BLACK_CUTOFF: 0.08,

    // Порог “грязных” тонов: если sat ниже SAT_TRIGGER — можно мягко “очищать”
    SAT_TRIGGER: 0.32,

    // “Безопасная” насыщенность, до которой можно подталкивать (деликатно)
    SAT_SAFE: 0.4,

    // Защита от “грязных тёмных midtones”: диапазон, где особенно заметна “пыль”
    V_MIN: 0.22,
    V_MAX: 0.65,

    // ====== Stylization Boost (2-й слой пред-обработки) =====
    // ВАЖНО: выполняется ПОСЛЕ sanitize, но ДО квантования
    ENABLE_STYLIZATION_BOOST: true,
    ENABLE_PREP_LOGS: true,

    // Диагностика (как у sanitize)
    BOOST_DIAGNOSTICS: true,

    // Доп. “табý на белое” по RGB (если вдруг HSV-v даёт пограничные кейсы)
    BOOST_WHITE_RGB_CUTOFF: 250, // если r,g,b >= 250 — не трогаем

    // “Уже достаточно насыщенное” — не бустим
    BOOST_S_SAFE: 0.55, // выше — считаем “уже ок”, не трогаем

    // --- Диапазон midtones ---
    BOOST_V_MIN: 0.25, // нижняя граница midtones (чуть выше, чем было)
    BOOST_V_MID_MAX: 0.75, // верхняя граница midtones (расширяем для “плакатности”)

    // --- Работа с насыщенностью ---
    BOOST_S_TRIGGER: 0.5, // бьём именно “пыль”, но чуть мягче для кожи

    // --- Сила и ограничители ---
    BOOST_STRENGTH: 0.85, // усиливаем Boost, т.к. маска стала уже и безопаснее
    BOOST_S_MAX: 0.9, // потолок насыщенности (чуть ниже, чтобы не «кислотить»)
    BOOST_V_CAP: 0.95, // потолок яркости — защита белого и кожи
    BOOST_V_LIFT_MAX: 0.12, // чуть сильнее осветление midtones для poster-эффекта

    // --- Skin-safe V fade (B5) ---
    BOOST_V_SKIN_FADE_START: 0.5,
    BOOST_V_SKIN_FADE_END: 0.68,

    // --- Skin low-midtones rescue (B5) ---
    // В нижних midtones коже нельзя становиться "трупно-серой":
    // чуть больше SAT-boost только для skin, пока V низкий.
    BOOST_V_SKIN_LOW_END: 0.42,
    BOOST_SKIN_S_GAIN_LOW_K: 0.92, // ближе к 1 = меньше "серости", но still safe

    // В верхних midtones (где морковит) гасим не только SAT, но и lift
    BOOST_SKIN_LIFT_K: 0.55,

    // --- Skin detect (очень мягкий, без "магии") ---
    // h,s,v в rgbToHsv: 0..1
    BOOST_SKIN_H_MIN: 0.02,
    BOOST_SKIN_H_MAX: 0.14,
    BOOST_SKIN_S_MIN: 0.08,
    BOOST_SKIN_S_MAX: 0.75,

    // насколько слабее SAT-boost для skin в нижних midtones (чтобы не "морковило")
    BOOST_SKIN_S_GAIN_K: 0.35,
} as const

// Деструктуризация — чтобы остальной код НЕ менять (сохраняем старые имена)
const {
    SANITIZE_DIAGNOSTICS,
    ENABLE_COLOR_SANITIZATION,
    SANITIZE_STRENGTH,
    SANITIZE_DEBUG_X10,
    SANITIZE_DEBUG_X10_CAMERA,
    GRAY_EPS,
    WHITE_CUTOFF,
    BLACK_CUTOFF,
    SAT_TRIGGER,
    SAT_SAFE,
    V_MIN,
    V_MAX,

    ENABLE_STYLIZATION_BOOST,
    //ENABLE_PREP_LOGS,
    BOOST_DIAGNOSTICS,
    BOOST_WHITE_RGB_CUTOFF,
    BOOST_S_SAFE,
    BOOST_V_MIN,
    BOOST_V_MID_MAX,
    BOOST_S_TRIGGER,
    BOOST_STRENGTH,
    BOOST_S_MAX,
    BOOST_V_CAP,
    BOOST_V_LIFT_MAX,
    BOOST_V_SKIN_FADE_START,
    BOOST_V_SKIN_FADE_END,
    BOOST_V_SKIN_LOW_END,
    BOOST_SKIN_S_GAIN_LOW_K,
    BOOST_SKIN_LIFT_K,
    BOOST_SKIN_H_MIN,
    BOOST_SKIN_H_MAX,
    BOOST_SKIN_S_MIN,
    BOOST_SKIN_S_MAX,
    BOOST_SKIN_S_GAIN_K,
} = PREP_CONFIG

// --- Инварианты/стоп-зоны именно для Boost (B3) ---
const BOOST_GRAY_EPS = GRAY_EPS // используем тот же eps, что и в sanitize
const BOOST_WHITE_CUTOFF = WHITE_CUTOFF // v>=cutoff — не трогаем
const BOOST_BLACK_CUTOFF = BLACK_CUTOFF // v<=cutoff — не трогаем

// ------------------------------
// Color sanitization — helpers (Step 1)
// Чистые функции, без сайд-эффектов.
// ------------------------------

function clamp01(x: number) {
    return Math.max(0, Math.min(1, x))
}

function smoothFade01(x: number, start: number, end: number): number {
    if (x <= start) return 1
    if (x >= end) return 0
    const t = (x - start) / (end - start)
    return 1 - t
}

function clamp255(x: number) {
    return Math.max(0, Math.min(255, Math.round(x)))
}

// gray = строго r≈g≈b (eps в 0..255)
function isStrictGray(r: number, g: number, b: number, eps: number) {
    return (
        Math.abs(r - g) <= eps &&
        Math.abs(r - b) <= eps &&
        Math.abs(g - b) <= eps
    )
}

function isMostlyGrayscaleImageData(imageData: ImageData) {
    const data = imageData.data

    // Сэмплируем до ~1024 пикселей, чтобы не делать второй полный проход
    const totalPixels = Math.floor(data.length / 4)
    const sampleCount = Math.min(1024, totalPixels)
    if (sampleCount <= 0) return false

    const stepPx = Math.max(1, Math.floor(totalPixels / sampleCount))
    const step = stepPx * 4

    let checked = 0
    let gray = 0

    // Для ч/б кадров используем более мягкий допуск, чем GRAY_EPS
    const eps = GRAY_EPS * 2

    for (let i = 0; i < data.length; i += step) {
        const a = data[i + 3]
        if (a === 0) continue // прозрачные не учитываем

        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        checked++
        if (isStrictGray(r, g, b, eps)) gray++
    }

    if (checked === 0) return false

    // Если почти всё серое — считаем кадр монохромным
    return gray / checked >= 0.985
}

/**
 * Деликатная "санитизация" пикселя перед квантованием:
 * - стоп-зоны: строгие серые, почти белые, почти чёрные НЕ трогаем
 * - воздействуем только на "грязные midtones" (низкая сатурация + средняя яркость)
 * - корректируем S (в духе vibrance), не выкручивая "вырвиглазно"
 *
 * ВАЖНО: функция чистая — не мутирует вход, не трогает state/массивы.
 */
function sanitizeRgbPixel(px: { r: number; g: number; b: number; a?: number }) {
    const r = clamp255(px.r)
    const g = clamp255(px.g)
    const b = clamp255(px.b)

    // стоп-зона 1: строгие серые (и весь "gray" тракт)
    if (isStrictGray(r, g, b, GRAY_EPS)) {
        return { r, g, b }
    }

    // RGB -> HSV (используем уже имеющуюся утилиту)
    const { h, s, v } = rgbToHsv(r, g, b)

    // стоп-зона 2: почти белые (табü — не окрашиваем)
    if (v >= WHITE_CUTOFF) {
        return { r, g, b }
    }

    // стоп-зона 3: почти чёрные (не трогаем)
    if (v <= BLACK_CUTOFF) {
        return { r, g, b }
    }

    // работаем только в диапазоне "тёмных мидтонов"
    if (v < V_MIN || v > V_MAX) {
        return { r, g, b }
    }

    // уже достаточно насыщенно — не трогаем
    if (s >= SAT_SAFE) {
        return { r, g, b }
    }

    // ---------
    // Vibrance-like: чем ниже sat, тем больше относительный буст,
    // но строго мягко и с потолком SAT_SAFE.
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

function sanitizeImageDataDebugX10(imageData: ImageData): ImageData {
    const w = imageData.width
    const h = imageData.height

    // работаем на копии, исходник не мутируем
    const out = new ImageData(new Uint8ClampedArray(imageData.data), w, h)
    const d = out.data

    // 1) ЖЕЛЕЗНЫЙ маркер: квадрат 16×16 magenta (должен пережить квантование)
    const block = Math.min(16, w, h)
    for (let y = 0; y < block; y++) {
        for (let x = 0; x < block; x++) {
            const i = (y * w + x) * 4
            d[i + 0] = 255
            d[i + 1] = 0
            d[i + 2] = 255
            // alpha не трогаем
        }
    }

    // 2) Доп. маркер: каждая 7-я точка по индексу пикселя -> magenta
    // (чтобы было видно по всему изображению)
    const total = w * h
    for (let p = 0; p < total; p++) {
        if (p % 7 !== 0) continue
        const i = p * 4
        d[i + 0] = 255
        d[i + 1] = 0
        d[i + 2] = 255
    }

    return out
}

function sanitizeImageDataDelicate(imageData: ImageData): ImageData {
    const w = imageData.width
    const h = imageData.height

    // работаем на копии, исходник не мутируем
    const out = new ImageData(new Uint8ClampedArray(imageData.data), w, h)
    const d = out.data

    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]

        // полностью прозрачные можно пропускать (alpha сохраняем как есть)
        if (a === 0) continue

        const r = d[i + 0]
        const g = d[i + 1]
        const b = d[i + 2]

        const rgb2 = sanitizeRgbPixel({ r, g, b })
        d[i + 0] = rgb2.r
        d[i + 1] = rgb2.g
        d[i + 2] = rgb2.b
        // d[i + 3] НЕ трогаем => A_out = A_in
    }

    return out
}

function computeSanitizeDiffMetrics(before: ImageData, after: ImageData) {
    const a = before.data
    const b = after.data

    const totalPixels = before.width * before.height

    let changedPixels = 0
    let changedAlphaPixels = 0

    let sumAbsDr = 0
    let sumAbsDg = 0
    let sumAbsDb = 0
    let maxAbsDelta = 0

    for (let i = 0; i < a.length; i += 4) {
        const dr = Math.abs(b[i + 0] - a[i + 0])
        const dg = Math.abs(b[i + 1] - a[i + 1])
        const db = Math.abs(b[i + 2] - a[i + 2])
        const da = Math.abs(b[i + 3] - a[i + 3])

        if (da !== 0) changedAlphaPixels++

        const d = dr + dg + db
        if (d !== 0) {
            changedPixels++
            sumAbsDr += dr
            sumAbsDg += dg
            sumAbsDb += db
            if (d > maxAbsDelta) maxAbsDelta = d
        }
    }

    const avgAbsDr = changedPixels ? sumAbsDr / changedPixels : 0
    const avgAbsDg = changedPixels ? sumAbsDg / changedPixels : 0
    const avgAbsDb = changedPixels ? sumAbsDb / changedPixels : 0

    const changedPct = totalPixels ? (changedPixels / totalPixels) * 100 : 0

    return {
        totalPixels,
        changedPixels,
        changedPct,
        changedAlphaPixels,
        avgAbsDr,
        avgAbsDg,
        avgAbsDb,
        maxAbsDelta,
    }
}

function maybeSanitizeImageData(
    imageData: ImageData,
    source: "gallery" | "camera" | "other" = "other"
): ImageData {
    // Ветка включения/выключения есть, при false — строго идентично
    if (!ENABLE_COLOR_SANITIZATION) return imageData

    // Шаг 3.3: debug ×10 только для галереи
    if (source === "gallery" && SANITIZE_DEBUG_X10) {
        return sanitizeImageDataDebugX10(imageData)
    }

    if (source === "camera" && SANITIZE_DEBUG_X10_CAMERA) {
        return sanitizeImageDataDebugX10(imageData)
    }

    const sanitized = sanitizeImageDataDelicate(imageData)

    if (SANITIZE_DIAGNOSTICS) {
        const m = computeSanitizeDiffMetrics(imageData, sanitized)
        if (ENABLE_PREP_LOGS)
            console.log(
                `[SANITIZE] source=${source} changed=${m.changedPixels}/${m.totalPixels} (${m.changedPct.toFixed(2)}%) ` +
                    `avgAbsRGB=(${m.avgAbsDr.toFixed(2)},${m.avgAbsDg.toFixed(2)},${m.avgAbsDb.toFixed(2)}) ` +
                    `maxAbsRGBSum=${m.maxAbsDelta} alphaChanged=${m.changedAlphaPixels}`
            )
    }

    return sanitized
}

function maybeStylizeBoostImageData(
    imageData: ImageData,
    source: "gallery" | "camera" | "other" = "other"
): ImageData {
    if (!ENABLE_STYLIZATION_BOOST) return imageData

    const inputCopy = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
    )

    const boosted = stylizeBoostImageData(inputCopy)

    if (BOOST_DIAGNOSTICS) {
        const m = computeSanitizeDiffMetrics(imageData, boosted)
        if (ENABLE_PREP_LOGS)
            console.log(
                `[BOOST] source=${source} changed=${m.changedPixels}/${m.totalPixels} (${m.changedPct.toFixed(2)}%) ` +
                    `avgAbsRGB=(${m.avgAbsDr.toFixed(2)},${m.avgAbsDg.toFixed(2)},${m.avgAbsDb.toFixed(2)}) ` +
                    `maxAbsRGBSum=${m.maxAbsDelta} alphaChanged=${m.changedAlphaPixels}`
            )
    }

    return boosted
}

function stylizeBoostImageData(imageData: ImageData): ImageData {
    // ВАЖНО: работаем на копии, исходник не мутируем
    const out = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
    )

    // Если изображение в целом почти ч/б — Boost не должен ничего делать
    // (оставляем 1:1 копию, changed=0 будет честным)
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

        // Альфа: НЕ ТРОГАЕМ (инвариант)
        // При желании можно рано пропускать полностью прозрачные:
        // if (a === 0) continue

        // --- Стоп-зона 0: “почти белый” по RGB (табý на окрашивание белого) ---
        if (
            r >= BOOST_WHITE_RGB_CUTOFF &&
            g >= BOOST_WHITE_RGB_CUTOFF &&
            b >= BOOST_WHITE_RGB_CUTOFF
        ) {
            continue
        }

        // --- Стоп-зона 1: строгие серые ---
        if (isStrictGray(r, g, b, BOOST_GRAY_EPS)) {
            continue
        }

        // RGB -> HSV (утилита уже есть в проекте)
        rgbToHsvIntoDeg(r, g, b, hsvTmpDeg)
        const h = hsvTmpDeg.h
        const s = hsvTmpDeg.s
        const v = hsvTmpDeg.v

        // --- Стоп-зона 2: почти белые по V ---
        if (v >= BOOST_WHITE_CUTOFF) {
            continue
        }

        // --- Стоп-зона 3: почти чёрные по V ---
        if (v <= BOOST_BLACK_CUTOFF) {
            continue
        }

        // --- Стоп-зона 4: уже насыщенные ---
        if (s >= BOOST_S_SAFE) {
            continue
        }

        // --- Область действия: midtones по яркости ---
        if (v < BOOST_V_MIN || v > BOOST_V_MID_MAX) {
            continue
        }

        // --- Триггер “пыльности” ---
        if (s >= BOOST_S_TRIGGER) {
            continue
        }

        // Насколько “пыльно”
        const dustK = clamp01(1 - s / Math.max(1e-6, BOOST_S_TRIGGER))

        // Насколько “нижние midtones”
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

        // Skin low-midtones rescue: 1 в самых нижних midtones, 0 к BOOST_V_SKIN_LOW_END
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

        // Базовая сила буста
        const baseBoost = BOOST_STRENGTH * midK * dustK

        // --- Skin behavior (B5) ---
        // 1) Верхние midtones: гасим boost (anti-carrot) через skinFadeK
        // 2) Нижние midtones: слегка возвращаем SAT-boost для skin (anti-dead-gray) через skinLowK
        const skinSatK =
            (BOOST_SKIN_S_GAIN_K * (1 - skinLowK) +
                BOOST_SKIN_S_GAIN_LOW_K * skinLowK) *
            skinFadeK

        const boostAmountSat = baseBoost * (isSkin ? skinSatK : 1)

        // Lift для skin всегда осторожнее + дополнительно затухает в верхних midtones
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
        data[i + 3] = a // альфа неизменна
    }

    return out
}

function preprocessImportedImageData(
    imageData: ImageData,
    source: "gallery" | "camera" | "other" = "other"
): ImageData {
    const sanitized = maybeSanitizeImageData(imageData, source)
    const boosted = maybeStylizeBoostImageData(sanitized, source)
    return boosted
}

// ===============================
// E2.0 — Chinese Room bake pipeline (NO-OP)
// ===============================
//
// Единственная функция, имеющая право
// превращать prepared512 в bakedRef512.
//
// Порядок (пока NO-OP):
// prepared512
// → sanitize
// → boost
// → preset-bake
// → bakedRef512
//

type PresetId = "DEFAULT" | "NEON" | "GRAYSCALE" | "BW"

function bakeRef512InChineseRoom(
    prepared512: ImageData,
    preset: PresetId, // DEFAULT | NEON | GRAYSCALE | BW
    source: "gallery" | "camera" | "other" = "other"
): ImageData {
    // E2.0: NO-OP
    // В следующих шагах здесь появится реальная логика.
    // E2.2: sanitize -> boost (no preset)
    const sanitized = maybeSanitizeImageData(prepared512, source)
    const boosted = maybeStylizeBoostImageData(sanitized, source)
    const baked = applyPresetBakeToImageData(boosted, preset)
    return baked
}

// ===============================
// N0 — NEON migration anchor
// Следующие шаги N1–N4 вставляют NEON_COLD_32 + NEON_STAIRCASE + force-map сюда,
// и подключают их только в ветке preset === "NEON" внутри applyPresetBakeToImageData.
// ===============================

// ------------------- N1 — NEON palette (NO-OP, not used yet) -------------------

// NEON_COLD_32 — холоднее: больше синих/индиго, меньше тёплых
const NEON_COLD_32: string[] = [
    "#0B0A1A",
    "#16132B",
    "#1E1A3A",
    "#241F4A",
    "#2C255C",
    "#332A6E",

    "#2E3A8C",
    "#3547A8",
    "#3C54C2",
    "#4662DA",
    "#5270F0",

    "#5F63E0",
    "#6E6AE8",
    "#7E72EE",
    "#8E7BF2",

    "#9B7BE0",
    "#A783E6",
    "#B28CEC",
    "#BD96F0",
    "#C9A0F4",

    "#D6A9F7",
    "#E2B3FA",
    "#EDBEFC",
    "#F6CAFD",

    "#F3E6FF",
    "#E9DDF8",
    "#DCD1F0",
    "#BFD6FF",

    "#9AD8FF",
    "#5BC2FF",
    "#4ED6C4",
    "#FF6AD5",
]

// ✅ Активная палитра NEON (фиксируем “мир” пресета)
const PALETTE_NEON_32: string[] = NEON_COLD_32

// ------------------- NEON PRE-TRANSFORM (NEON_STAIRCASE v2: chroma-preserving) -------------------

// флаг (если захочешь быстро отключить, не удаляя код)
const NEON_STAIRCASE_ENABLED = true

// “мягкость” притягивания к якорю (0 = no-op, 1 = жёсткая лестница)
const NEON_STAIRCASE_K = 0.9

// Пороги зон по яркости L (0..1): 5 зон => 4 порога
const NEON_STAIR_B1 = 0.1
const NEON_STAIR_B2 = 0.3
const NEON_STAIR_B3 = 0.55
const NEON_STAIR_B4 = 0.8

// Якоря яркости (0..1): должны отличаться скачком ~15–20%
const NEON_STAIR_A_BLACK = 0.06
const NEON_STAIR_A_DARK = 0.24
const NEON_STAIR_A_MID = 0.44
const NEON_STAIR_A_LIGHT = 0.64
const NEON_STAIR_A_WHITE = 0.88

function lerp01(a: number, b: number, t: number) {
    return a + (b - a) * t
}

// Яркость (luma) в sRGB 0..255 -> 0..1 (быстро и достаточно для “лестницы”)
function luma01(r: number, g: number, b: number) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function pickStairAnchor(L: number) {
    if (L < NEON_STAIR_B1) return NEON_STAIR_A_BLACK
    if (L < NEON_STAIR_B2) return NEON_STAIR_A_DARK
    if (L < NEON_STAIR_B3) return NEON_STAIR_A_MID
    if (L < NEON_STAIR_B4) return NEON_STAIR_A_LIGHT
    return NEON_STAIR_A_WHITE
}

// NEON_STAIRCASE v2:
function applyNeonPreTransform(imageData: ImageData): ImageData {
    if (!NEON_STAIRCASE_ENABLED) return imageData

    const w = imageData.width
    const h = imageData.height

    // работаем на копии, исходник не мутируем
    const out = new ImageData(new Uint8ClampedArray(imageData.data), w, h)
    const d = out.data

    // reuse объектов (no-new-in-loop)
    const hsvTmpDeg = { h: 0, s: 0, v: 0 }
    const rgbTmp = { r: 0, g: 0, b: 0 }

    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]
        if (a === 0) continue // полностью прозрачные не трогаем (alpha сохраняем)

        const r = d[i + 0]
        const g = d[i + 1]
        const b = d[i + 2]

        const L = luma01(r, g, b)
        const A = pickStairAnchor(L)

        // “мягко” тянем яркость к якорю
        const Lp = clamp01(lerp01(L, A, NEON_STAIRCASE_K))

        // RGB -> HSV (утилита уже есть в проекте; используем её)
        rgbToHsvIntoDeg(r, g, b, hsvTmpDeg)

        // Подменяем только V (яркость), Hue/Sat сохраняем.
        // Важно: V в ваших утилитах обычно 0..1
        const v2 = clamp01(hsvTmpDeg.v * (Lp / Math.max(1e-6, L)))

        hsvToRgbIntoDeg(hsvTmpDeg.h, hsvTmpDeg.s, v2, rgbTmp)

        d[i + 0] = rgbTmp.r
        d[i + 1] = rgbTmp.g
        d[i + 2] = rgbTmp.b
        // d[i + 3] НЕ трогаем
    }

    return out
}

// ------------------- N3 — NEON fixed-palette force-map (NO-OP, not used yet) -------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = hex.replace("#", "")
    if (m.length !== 6) return null

    const r = parseInt(m.slice(0, 2), 16)
    const g = parseInt(m.slice(2, 4), 16)
    const b = parseInt(m.slice(4, 6), 16)

    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    return { r, g, b }
}

function quantizeImageDataToFixedPalette(
    imageData: ImageData,
    paletteHex: string[]
): ImageData {
    const out = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
    )

    const pal = paletteHex
        .map((hx) => hexToRgb(hx))
        .filter((x): x is { r: number; g: number; b: number } => x != null)

    if (pal.length === 0) return out

    const d = out.data

    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]
        if (a === 0) continue

        const r = d[i + 0]
        const g = d[i + 1]
        const b = d[i + 2]

        let best = 0
        let bestDist = Number.POSITIVE_INFINITY

        for (let k = 0; k < pal.length; k++) {
            const pr = pal[k].r
            const pg = pal[k].g
            const pb = pal[k].b

            const dr = r - pr
            const dg = g - pg
            const db = b - pb

            const dist = dr * dr + dg * dg + db * db
            if (dist < bestDist) {
                bestDist = dist
                best = k
            }
        }

        d[i + 0] = pal[best].r
        d[i + 1] = pal[best].g
        d[i + 2] = pal[best].b
        // alpha unchanged
    }

    return out
}

function applyPresetBakeToImageData(
    imageData512: ImageData,
    preset: PresetId
): ImageData {
    if (preset === "DEFAULT") return imageData512

    // NEON: используем уже существующий ImageData->ImageData pre-transform
    if (preset === "NEON") {
        const pre = applyNeonPreTransform(imageData512)
        const baked = quantizeImageDataToFixedPalette(pre, PALETTE_NEON_32)

        if (ENABLE_PREP_LOGS) {
            // Собираем до 10 уникальных RGB из baked (непрозрачные)
            const uniq: string[] = []
            const seen = new Set<string>()
            const d = baked.data
            for (let i = 0; i < d.length && uniq.length < 10; i += 4) {
                const a = d[i + 3]
                if (a === 0) continue
                const key = `${d[i + 0]},${d[i + 1]},${d[i + 2]}`
                if (!seen.has(key)) {
                    seen.add(key)
                    uniq.push(key)
                }
            }

            // Проверяем, что все эти RGB есть в палитре
            const palSet = new Set(
                PALETTE_NEON_32.map((hx) => hexToRgb(hx))
                    .filter(
                        (x): x is { r: number; g: number; b: number } =>
                            x != null
                    )
                    .map((p) => `${p.r},${p.g},${p.b}`)
            )

            const notInPalette = uniq.filter((k) => !palSet.has(k))

            if (ENABLE_PREP_LOGS) {
                console.log("[NEON][CHK] uniqRGB(<=10) =", uniq)
                if (notInPalette.length > 0) {
                    console.warn("[NEON][CHK] NOT IN PALETTE =", notInPalette)
                } else {
                    console.log(
                        "[NEON][CHK] OK: all sampled colors are in PALETTE_NEON_32"
                    )
                }
            }
        }

        if (ENABLE_PREP_LOGS) {
            let alphaMismatch = 0
            const a1 = pre.data
            const a2 = baked.data
            const n = Math.min(a1.length, a2.length)
            for (let i = 3; i < n; i += 4) {
                if (a1[i] !== a2[i]) {
                    alphaMismatch++
                    if (alphaMismatch >= 5) break
                }
            }
            if (alphaMismatch > 0) {
                console.warn("[NEON][ALPHA] mismatch detected:", alphaMismatch)
            } else {
                if (ENABLE_PREP_LOGS) {
                    console.log("[NEON][ALPHA] OK (A_out = A_in)")
                }
            }
        }

        return baked
    }

    // GRAYSCALE / BW: делаем копию и меняем RGB, альфу не трогаем
    const out = new ImageData(
        new Uint8ClampedArray(imageData512.data),
        imageData512.width,
        imageData512.height
    )
    const d = out.data

    if (preset === "GRAYSCALE") {
        for (let i = 0; i < d.length; i += 4) {
            const a = d[i + 3]
            if (a === 0) continue

            const r = d[i + 0]
            const g = d[i + 1]
            const b = d[i + 2]

            const L = clamp255(Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b))
            d[i + 0] = L
            d[i + 1] = L
            d[i + 2] = L
            // alpha unchanged
        }
        return out
    }

    // BW
    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]
        if (a === 0) continue

        const r = d[i + 0]
        const g = d[i + 1]
        const b = d[i + 2]

        const L01 = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        const v = L01 < BW_THRESHOLD ? 0 : 255

        d[i + 0] = v
        d[i + 1] = v
        d[i + 2] = v
        // alpha unchanged
    }
    return out
}

type PixelValue = SwatchId | null | typeof TRANSPARENT_PIXEL

// ===== PIXEL TYPE (НАЧАЛО) =====
type Pixel = {
    swatchId: string | null
}
// ===== PIXEL TYPE (КОНЕЦ) =====

// ===== SWATCH TYPE (НАЧАЛО) =====
type Swatch = {
    id: string
    color: string
    isTransparent: boolean
    isUser: boolean
}

type SwatchId = string

// ===== SWATCH TYPE (КОНЕЦ) =====

// Swatch "Transparency" must visually match canvas checkerboard.
// Canvas itself is rendered in CANVAS_SIZE pixels (no DPR upscale), so we keep CSS size deterministic.
// We reuse the same 1px tile used by drawCheckerboard() and scale it via background-size in CSS.
let __checkerBackgroundCss: string | null = null

function getCheckerBackgroundCss(): string {
    if (__checkerBackgroundCss) return __checkerBackgroundCss

    // Keep the old visual density of the swatch: 8px tile on screen (matches previous CSS).
    // This is purely a UI swatch background; the canvas uses its own cell-based scaling.
    const SWATCH_TILE_CSS_PX = 8

    // SSR safety
    if (typeof window === "undefined") {
        __checkerBackgroundCss =
            `repeating-conic-gradient(#d9d9d9 0% 25%, #ffffff 0% 50%) 50% / ` +
            `${SWATCH_TILE_CSS_PX}px ${SWATCH_TILE_CSS_PX}px`
        return __checkerBackgroundCss
    }

    const tile = getTransparencyTile1px()
    const url = tile.toDataURL()

    // Use the same tile as canvas uses; scale it in CSS
    __checkerBackgroundCss = `url(${url}) 0 0 / ${SWATCH_TILE_CSS_PX}px ${SWATCH_TILE_CSS_PX}px repeat`
    return __checkerBackgroundCss
}

const checkerBackground = getCheckerBackgroundCss()

const footerIconStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
}

// ------------------- ALERT MODAL (shared) -------------------

// Пропорции белой подложки (viewBox 1189.63 x 416.35)
const ALERT_BACKING_RATIO = 1189.63 / 416.35

const ALERT_MODAL_MAX_W = 520
const ALERT_MODAL_MIN_W = 280

// паддинги текста внутри белой подложки
const ALERT_PAD_X = 22
const ALERT_PAD_Y = 18

const ALERT_OVERLAY_STYLE: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 99999,
    background: "rgba(69,64,49,0.5)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    boxSizing: "border-box",
}

function useImportAlertBoxSizing(isOpen: boolean, contentKey: string) {
    const useIsoLayout =
        typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

    const [alertBoxSize, setAlertBoxSize] = React.useState<{
        w: number
        h: number
    }>({
        w: 420,
        h: 420 / ALERT_BACKING_RATIO,
    })

    // меряем ТОЛЬКО текстовый блок (без кнопки OK)
    const alertMeasureRef = React.useRef<HTMLDivElement | null>(null)

    useIsoLayout(() => {
        if (!isOpen) return
        if (typeof window === "undefined") return

        let raf = 0

        const recompute = () => {
            const el = alertMeasureRef.current
            if (!el) return

            const rect = el.getBoundingClientRect()
            const contentW = Math.max(1, rect.width)
            const contentH = Math.max(1, rect.height)

            // 1) стартуем от ширины контента + паддинги
            let w = contentW + ALERT_PAD_X * 2
            let h = w / ALERT_BACKING_RATIO

            // 2) гарантируем, что по высоте помещается контент + паддинги
            const minHNeeded = contentH + ALERT_PAD_Y * 2
            if (h < minHNeeded) {
                h = minHNeeded
                w = h * ALERT_BACKING_RATIO
            }

            // 3) clamp по viewport и константам
            const maxWByViewport = Math.floor(window.innerWidth * 0.92)
            const maxW = Math.min(ALERT_MODAL_MAX_W, maxWByViewport)

            if (w > maxW) {
                w = maxW
                h = w / ALERT_BACKING_RATIO
            }

            const minWByViewport = Math.floor(window.innerWidth * 0.75)
            const minW = Math.min(
                Math.max(ALERT_MODAL_MIN_W, 1),
                minWByViewport
            )

            if (w < minW) {
                w = minW
                h = w / ALERT_BACKING_RATIO
            }

            setAlertBoxSize({ w: Math.round(w), h: Math.round(h) })
        }

        raf = window.requestAnimationFrame(recompute)

        const onResize = () => {
            window.cancelAnimationFrame(raf)
            raf = window.requestAnimationFrame(recompute)
        }

        window.addEventListener("resize", onResize)
        return () => {
            window.cancelAnimationFrame(raf)
            window.removeEventListener("resize", onResize)
        }
    }, [isOpen, contentKey])

    return { alertBoxSize, alertMeasureRef }
}

const PALETTE_MIN = 10
const PALETTE_MAX = 32

const rangeTrackStyle = (
    value: number,
    min: number,
    max: number,
    fillColor: string
) => {
    const pct = ((value - min) / (max - min)) * 100
    return {
        "--px-track-pct": `${pct}%`,
        "--px-track-fill": fillColor, // цветная часть (слева от кружка)
        "--px-track-rest": "rgba(255,255,255,0.25)", // правая часть (как было)
    } as React.CSSProperties
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function createEmptyPixels(size: number) {
    return Array.from({ length: size }, () =>
        Array.from({ length: size }, () => null as PixelValue)
    )
}

function resizePixels(prevPixels: PixelValue[][], newSize: number) {
    if (!prevPixels || prevPixels.length === 0)
        return createEmptyPixels(newSize)
    const oldSize = prevPixels.length
    if (oldSize === newSize) return prevPixels

    const next = createEmptyPixels(newSize)
    const copySize = Math.min(oldSize, newSize)
    for (let r = 0; r < copySize; r++) {
        const srcRow = prevPixels[r] || []
        for (let c = 0; c < copySize; c++)
            next[r][c] = (srcRow[c] ?? null) as PixelValue
    }
    return next
}

// ---- color utils ----
function parseRGB(color: string) {
    const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(color)
    if (!m) return { r: 0, g: 0, b: 0 }
    return {
        r: parseInt(m[1], 10),
        g: parseInt(m[2], 10),
        b: parseInt(m[3], 10),
    }
}

function parseHSL(color: string) {
    const m = /hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/.exec(color)
    if (!m) return { h: 0, s: 0, l: 0 }
    return {
        h: parseInt(m[1], 10),
        s: parseInt(m[2], 10),
        l: parseInt(m[3], 10),
    }
}

function hslToRgb(h: number, s: number, l: number) {
    h = ((h % 360) + 360) % 360
    s /= 100
    l /= 100

    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2

    let r1 = 0,
        g1 = 0,
        b1 = 0
    if (h < 60) {
        r1 = c
        g1 = x
    } else if (h < 120) {
        r1 = x
        g1 = c
    } else if (h < 180) {
        g1 = c
        b1 = x
    } else if (h < 240) {
        g1 = x
        b1 = c
    } else if (h < 300) {
        r1 = x
        b1 = c
    } else {
        r1 = c
        b1 = x
    }

    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    }
}

function componentToHex(c: number) {
    const hex = c.toString(16)
    return hex.length === 1 ? "0" + hex : hex
}

function cssColorToHex(color: string | null) {
    if (!color) return "#ff0000"

    if (color.startsWith("#")) {
        if (color.length === 7) return color
        if (color.length === 4) {
            const r = color[1],
                g = color[2],
                b = color[3]
            return "#" + r + r + g + g + b + b
        }
        return "#ff0000"
    }

    if (color.startsWith("rgb")) {
        const { r, g, b } = parseRGB(color)
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b)
    }

    if (color.startsWith("hsl")) {
        const { h, s, l } = parseHSL(color)
        const { r, g, b } = hslToRgb(h, s, l)
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b)
    }

    return "#ff0000"
}

// ---- HSV helpers for the custom picker ----
function rgbToHsv(r: number, g: number, b: number) {
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

type SwatchColorGroup = "red" | "green" | "blue" | "gray"

type SwatchColorClass = {
    group: SwatchColorGroup
    keyInsideGroup: number
    h: number
    s: number
    v: number
    isTransparent: boolean
}

/**
 * Чистая классификация свотча для будущей сортировки палитры:
 * - group: red | green | blue | gray
 * - keyInsideGroup: число для сортировки внутри группы
 *
 * Прозрачные (sw.isTransparent) помечаем отдельно; куда ставить — решим в UX шаге сортировки.
 */
function classifySwatchColor(sw: Swatch): SwatchColorClass {
    const isTransparent = !!(sw as any)?.isTransparent

    // Если прозрачный — считаем его "gray" по группе,
    // а keyInsideGroup даём очень большим, чтобы при желании уезжал в самый конец серых.
    if (isTransparent) {
        return {
            group: "gray",
            keyInsideGroup: Number.POSITIVE_INFINITY,
            h: 0,
            s: 0,
            v: 0,
            isTransparent: true,
        }
    }

    if (!sw?.color) {
        return {
            group: "gray",
            keyInsideGroup: Number.POSITIVE_INFINITY,
            h: 0,
            s: 0,
            v: 0,
            isTransparent: false,
        }
    }

    const hex = cssColorToHex(sw.color)
    const rgb = hexToRgb(hex)

    if (!rgb) {
        return {
            group: "gray",
            keyInsideGroup: Number.POSITIVE_INFINITY,
            h: 0,
            s: 0,
            v: 0,
            isTransparent: false,
        }
    }

    const { h, s, v } = rgbToHsv(rgb.r, rgb.g, rgb.b)

    // Gray: низкая насыщенность (градации от чёрного до белого)
    const isGray = s < 0.08
    if (isGray) {
        // keyInsideGroup: яркость (чёрный -> белый)
        return {
            group: "gray",
            keyInsideGroup: v,
            h,
            s,
            v,
            isTransparent: false,
        }
    }

    // Группы: Red -> Green -> Blue
    // Red: hue < 60 или hue >= 300
    // Green: 60..180
    // Blue: 180..300
    let group: SwatchColorGroup = "blue"
    if (h < 60 || h >= 300) group = "red"
    else if (h < 180) group = "green"
    else group = "blue"

    // Для красных “оборачиваем” 300..360 в отрицательную зону,
    // чтобы "красный" шёл непрерывно слева направо.
    const hueAdjusted = group === "red" && h >= 300 ? h - 360 : h

    // keyInsideGroup: базово по hue внутри группы (это “скелет” будущей сортировки).
    // (В следующих шагах мы можем усложнить: учитывать s/v вторыми критериями.)
    return {
        group,
        keyInsideGroup: hueAdjusted,
        h: hueAdjusted,
        s,
        v,
        isTransparent: false,
    }
}

function hsvToRgb(h: number, s: number, v: number) {
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

function rgbToHex(r: number, g: number, b: number) {
    return (
        "#" +
        componentToHex(clamp(Math.round(r), 0, 255)) +
        componentToHex(clamp(Math.round(g), 0, 255)) +
        componentToHex(clamp(Math.round(b), 0, 255))
    ).toUpperCase()
}

function rgbToCss(r: number, g: number, b: number) {
    return `rgb(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)})`
}

function parseAnyColorToRgb(
    s: string
): { r: number; g: number; b: number } | null {
    const str = (s || "").trim()

    // 1) rgb(r,g,b)
    const m = str.match(
        /rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i
    )
    if (m) {
        const r = clamp255(Number(m[1]))
        const g = clamp255(Number(m[2]))
        const b = clamp255(Number(m[3]))
        return { r, g, b }
    }

    // 2) #RRGGBB (или RRGGBB)
    const hex = str.replace(/^#/, "")
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        const r = parseInt(hex.slice(0, 2), 16)
        const g = parseInt(hex.slice(2, 4), 16)
        const b = parseInt(hex.slice(4, 6), 16)
        return { r, g, b }
    }

    return null
}

function toGrayscaleGrid(pixels: (string | null)[][]): (string | null)[][] {
    if (!pixels || pixels.length === 0) return pixels

    const h = pixels.length
    const w = pixels[0]?.length ?? 0
    if (w <= 0) return pixels

    const out: (string | null)[][] = new Array(h)

    for (let y = 0; y < h; y++) {
        const rowIn = pixels[y]
        const rowOut: (string | null)[] = new Array(w)

        for (let x = 0; x < w; x++) {
            const cell = rowIn[x]

            // прозрачность — отдельная семантика
            if (cell == null) {
                rowOut[x] = null
                continue
            }

            const rgb = parseAnyColorToRgb(cell)

            // если вдруг попался неожиданный формат — НЕ ломаем картинку
            if (!rgb) {
                rowOut[x] = cell
                continue
            }

            const L = clamp255(
                Math.round(0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b)
            )
            rowOut[x] = rgbToCss(L, L, L)
        }

        out[y] = rowOut
    }

    return out
}

// -------------------- BW PRESET (Step BW2) — threshold constants --------------------

// Порог бинаризации яркости (0..1). MVP-дефолт.
const BW_THRESHOLD = 0.5

// Строгие значения BW (в формате, который уже используется в проекте: rgb(...))
const BW_BLACK = "rgb(0, 0, 0)"
const BW_WHITE = "rgb(255, 255, 255)"

// -------------------- BW PRESET (Step BW5) — invariants (MVP-safe warn) --------------------

// Приводим любой CSS-цвет (rgb/#hex/hsl) к каноническому HEX, чтобы проверять именно "#000/#fff".
function bwToHexUpper(color: string) {
    return (cssColorToHex(color) || "").toUpperCase()
}

function warnIfBwPaletteInvalid(palette: string[]) {
    if (!Array.isArray(palette)) {
        console.warn(
            "[BW] invariant failed (BW5): palette is not array:",
            palette
        )
        return
    }

    if (palette.length !== 2) {
        console.warn(
            `[BW] invariant failed (BW5): palette size != 2 (got ${palette.length})`,
            palette
        )
        return
    }

    const allowed = new Set(["#000000", "#FFFFFF"])

    const hex0 = bwToHexUpper(palette[0])
    const hex1 = bwToHexUpper(palette[1])

    // проверка “каждый цвет ∈ {#000000,#FFFFFF}”
    if (!allowed.has(hex0) || !allowed.has(hex1)) {
        console.warn(
            "[BW] invariant failed (BW5): non BW color in palette:",
            palette,
            { hex0, hex1 }
        )
        return
    }

    // опционально: если вдруг оба одинаковые (две белых/две чёрных)
    if (hex0 === hex1) {
        console.warn(
            "[BW] invariant failed (BW5): palette has duplicate colors (expected black+white):",
            palette,
            { hex0, hex1 }
        )
    }
}

// -------------------- BW PRESET (Step BW2) — threshold helper --------------------
// Принимает grid пикселей как после pixelizeFromImageDominant: (string|null)[][]
// Возвращает grid тех же размеров, где каждый пиксель => BW_BLACK/BW_WHITE, а прозрачный => null.
function toBlackWhiteGrid(pixels: (string | null)[][]): (string | null)[][] {
    if (!pixels || pixels.length === 0) return pixels

    const h = pixels.length
    const w = pixels[0]?.length ?? 0
    if (w <= 0) return pixels

    const out: (string | null)[][] = new Array(h)

    for (let y = 0; y < h; y++) {
        const rowIn = pixels[y]
        const rowOut: (string | null)[] = new Array(w)

        for (let x = 0; x < w; x++) {
            const cell = rowIn[x]

            // прозрачность — отдельная семантика
            if (cell == null) {
                rowOut[x] = null
                continue
            }

            const rgb = parseAnyColorToRgb(cell)

            // если вдруг попался неожиданный формат — НЕ ломаем картинку
            if (!rgb) {
                rowOut[x] = cell
                continue
            }

            // яркость (luma) 0..1
            const L = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255

            rowOut[x] = L < BW_THRESHOLD ? BW_BLACK : BW_WHITE
        }

        out[y] = rowOut
    }

    return out
}

function rgbToHsvInto01(
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
    let s = max === 0 ? 0 : d / max
    const v = max

    if (d !== 0) {
        if (max === rf) h = ((gf - bf) / d) % 6
        else if (max === gf) h = (bf - rf) / d + 2
        else h = (rf - gf) / d + 4
        h /= 6
        if (h < 0) h += 1
    }

    out.h = h
    out.s = s
    out.v = v
}

function hsvToRgbInto01(
    h: number,
    s: number,
    v: number,
    out: { r: number; g: number; b: number }
) {
    const i = Math.floor(h * 6)
    const f = h * 6 - i
    const p = v * (1 - s)
    const q = v * (1 - f * s)
    const t = v * (1 - (1 - f) * s)

    let rf = 0,
        gf = 0,
        bf = 0
    switch (i % 6) {
        case 0:
            rf = v
            gf = t
            bf = p
            break
        case 1:
            rf = q
            gf = v
            bf = p
            break
        case 2:
            rf = p
            gf = v
            bf = t
            break
        case 3:
            rf = p
            gf = q
            bf = v
            break
        case 4:
            rf = t
            gf = p
            bf = v
            break
        case 5:
            rf = v
            gf = p
            bf = q
            break
    }

    out.r = Math.round(rf * 255)
    out.g = Math.round(gf * 255)
    out.b = Math.round(bf * 255)
}

// --- Perf helpers: HSV(deg) into/out (no allocations) ---
// h: degrees [0..360), s/v: [0..1]
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

// h: degrees [0..360), s/v: [0..1]
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

// ---- pixelize: dominant color + rounding ----
function pixelizeFromImageDominant(
    imageData: ImageData,
    gridSize: number,
    roundStep = 16
) {
    const { width, height, data } = imageData

    const size = gridSize
    const result = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => null as string | null)
    )

    const cellWidth = width / size
    const cellHeight = height / size
    const roundComponent = (v: number) =>
        clamp(Math.round(v / roundStep) * roundStep, 0, 255)

    const rgbKey = (r: number, g: number, b: number) =>
        ((r & 255) << 16) | ((g & 255) << 8) | (b & 255)

    const keyToRgb = (key: number) => {
        const r = (key >> 16) & 255
        const g = (key >> 8) & 255
        const b = key & 255
        return { r, g, b }
    }

    const pickSmartTie = (keys: number[]) => {
        if (keys.length === 1) return keys[0]
        let bestKey = keys[0]
        let bestLum = Infinity
        for (const k of keys) {
            const { r, g, b } = keyToRgb(k)
            const lum = r * 0.299 + g * 0.587 + b * 0.114
            if (lum < bestLum) {
                bestLum = lum
                bestKey = k
            }
        }
        return bestKey
    }

    for (let gy = 0; gy < size; gy++) {
        const startY = Math.floor(gy * cellHeight)
        const endY = Math.floor((gy + 1) * cellHeight) || startY + 1

        for (let gx = 0; gx < size; gx++) {
            const startX = Math.floor(gx * cellWidth)
            const endX = Math.floor((gx + 1) * cellWidth) || startX + 1

            const counts = new Map<number, number>()
            for (let y = startY; y < endY; y++) {
                if (y < 0 || y >= height) continue
                for (let x = startX; x < endX; x++) {
                    if (x < 0 || x >= width) continue
                    const idx = (y * width + x) * 4
                    const a = data[idx + 3]
                    if (a === 0) continue
                    const rr = roundComponent(data[idx])
                    const gg = roundComponent(data[idx + 1])
                    const bb = roundComponent(data[idx + 2])

                    const key = rgbKey(rr, gg, bb)
                    counts.set(key, (counts.get(key) || 0) + 1)
                }
            }

            if (counts.size === 0) {
                result[gy][gx] = null
                continue
            }

            let maxCount = -1
            for (const v of counts.values()) if (v > maxCount) maxCount = v
            const topKeys: number[] = []
            for (const [k, v] of counts.entries())
                if (v === maxCount) topKeys.push(k)

            const bestKey = pickSmartTie(topKeys)
            const { r, g, b } = keyToRgb(bestKey)
            result[gy][gx] = "rgb(" + r + ", " + g + ", " + b + ")"
        }
    }

    return result
}

function quantizeToFixedPalette(
    pixels: (string | null)[][],
    paletteHex: string[]
): (string | null)[][] {
    // Готовим RGB-палитру один раз
    const pal = paletteHex.map((hx) => hexToRgb(hx)) // hexToRgb уже есть в файле

    const height = pixels.length
    const width = height > 0 ? pixels[0].length : 0

    const out: (string | null)[][] = Array.from({ length: height }, () =>
        Array.from({ length: width }, () => null as string | null)
    )

    for (let y = 0; y < height; y++) {
        const row = pixels[y]
        const outRow = out[y]
        for (let x = 0; x < width; x++) {
            const col = row[x]
            if (col == null) {
                outRow[x] = null
                continue
            }

            const { r, g, b } = parseRGB(col) // parseRGB уже есть: rgb(...) -> {r,g,b}

            let best = 0
            let bestDist = Infinity

            for (let i = 0; i < pal.length; i++) {
                const p = pal[i]
                const dr = r - p.r
                const dg = g - p.g
                const db = b - p.b
                const d = dr * dr + dg * dg + db * db
                if (d < bestDist) {
                    bestDist = d
                    best = i
                }
            }

            const p = pal[best]
            outRow[x] = `rgb(${p.r}, ${p.g}, ${p.b})`
        }
    }

    return out
}

// ---- palette quantization ----
function quantizePixels(pixels: (string | null)[][], targetColors: number) {
    const height = pixels.length
    const width = height > 0 ? pixels[0].length : 0

    const map = new Map<
        string,
        { color: string; r: number; g: number; b: number; count: number }
    >()
    for (let y = 0; y < height; y++) {
        const row = pixels[y]
        for (let x = 0; x < width; x++) {
            const col = row[x]
            if (col == null) continue
            let entry = map.get(col)
            if (!entry) {
                const { r, g, b } = parseRGB(col)
                entry = { color: col, r, g, b, count: 0 }
                map.set(col, entry)
            }
            entry.count++
        }
    }

    const uniqueColors = Array.from(map.values())
    if (uniqueColors.length === 0) return { pixels, palette: [] as string[] }

    const k = clamp(targetColors, 1, uniqueColors.length)
    if (uniqueColors.length <= k)
        return { pixels, palette: uniqueColors.map((c) => c.color) }

    let centroids = uniqueColors
        .slice(0, k)
        .map((c) => ({ r: c.r, g: c.g, b: c.b }))
    const ITER = 6

    for (let iter = 0; iter < ITER; iter++) {
        const clusters = centroids.map(() => ({
            sumR: 0,
            sumG: 0,
            sumB: 0,
            sumCount: 0,
        }))

        for (const uc of uniqueColors) {
            let best = 0
            let bestDist = Infinity
            for (let i = 0; i < centroids.length; i++) {
                const c = centroids[i]
                const dr = uc.r - c.r
                const dg = uc.g - c.g
                const db = uc.b - c.b
                const dist = dr * dr + dg * dg + db * db
                if (dist < bestDist) {
                    bestDist = dist
                    best = i
                }
            }
            const cl = clusters[best]
            cl.sumR += uc.r * uc.count
            cl.sumG += uc.g * uc.count
            cl.sumB += uc.b * uc.count
            cl.sumCount += uc.count
        }

        for (let i = 0; i < centroids.length; i++) {
            const cl = clusters[i]
            if (cl.sumCount > 0) {
                centroids[i] = {
                    r: cl.sumR / cl.sumCount,
                    g: cl.sumG / cl.sumCount,
                    b: cl.sumB / cl.sumCount,
                }
            }
        }
    }

    const palette = centroids.map(
        (c) =>
            "rgb(" +
            Math.round(c.r) +
            ", " +
            Math.round(c.g) +
            ", " +
            Math.round(c.b) +
            ")"
    )

    const mapping = new Map<string, string>()
    for (const uc of uniqueColors) {
        let best = 0
        let bestDist = Infinity
        for (let i = 0; i < centroids.length; i++) {
            const c = centroids[i]
            const dr = uc.r - c.r
            const dg = uc.g - c.g
            const db = uc.b - c.b
            const dist = dr * dr + dg * dg + db * db
            if (dist < bestDist) {
                bestDist = dist
                best = i
            }
        }
        mapping.set(uc.color, palette[best])
    }

    const newPixels = pixels.map((row) =>
        row.map((col) => (col == null ? null : mapping.get(col) || col))
    )
    return { pixels: newPixels, palette }
}

function generatePalette(count: number) {
    const colors: string[] = []
    for (let i = 0; i < count; i++) {
        const hue = Math.round((360 * i) / count)
        colors.push("hsl(" + hue + ", 80%, 55%)")
    }
    return colors
}

function computeExportSize(gridSize: number) {
    const target = CANVAS_SIZE
    const down = Math.floor(target / gridSize) * gridSize
    const up = Math.ceil(target / gridSize) * gridSize
    const best = Math.abs(down - target) <= Math.abs(up - target) ? down : up
    return best > 0 ? best : gridSize
}

// ------------------- HELPERS -------------------

const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

function getViewportHeightPx() {
    if (typeof window === "undefined") return 0
    const vv: any = (window as any).visualViewport
    return Math.round(vv?.height ?? window.innerHeight ?? 0)
}

/**
 * FitToViewport (NO-OP на шаге A0)
 * Считает scale = min(1, viewportHeight / contentHeight) и применяет transform: scale(scale).
 * Пока НЕ используется ни в одном экране — просто инфраструктура.
 */
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
    const [scale, setScale] = React.useState(1)

    // ✅ “воздух” внутри viewport
    const VIEWPORT_PAD = 0

    useIsomorphicLayoutEffect(() => {
        const el = contentRef.current
        if (!el) return

        let raf = 0

        const recompute = () => {
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
            (typeof window !== "undefined" ? window.innerWidth : 0)
    ) || 0

                // scrollWidth/scrollHeight НЕ зависят от transform: scale()
                const h = Math.max(1, el.scrollHeight)
                const w = Math.max(1, el.scrollWidth)

                const availH = Math.max(1, vh - VIEWPORT_PAD * 2)
                const availW = Math.max(1, vw - VIEWPORT_PAD * 2)

                const sH = availH / h
                const sW = availW / w

                const next = Math.min(sH, sW)

                setScale((prev) =>
                    Math.abs(prev - next) < 0.001 ? prev : next
                )
                onScale?.(next)
            })
        }

        recompute()

        const ro = new ResizeObserver(() => recompute())
        ro.observe(el)

        window.addEventListener("resize", recompute)
        window.visualViewport?.addEventListener("resize", recompute)

        return () => {
            ro.disconnect()
            window.removeEventListener("resize", recompute)
            window.visualViewport?.removeEventListener("resize", recompute)
            if (raf) cancelAnimationFrame(raf)
        }
    }, [onScale])

    return (
        <div
style={{
    // ✅ жёстко привязываемся к реальному viewport, а не к ширине родителя
    width: "100vw",
    maxWidth: "100vw",
    height: "100dvh",

    background,

    // ✅ прибиваем горизонтальный оверфлоу (чтобы ничего не “расширяло” центр)
    overflowX: "clip",
    overflowY: "hidden",

    // ✅ воздух по краям
    padding: VIEWPORT_PAD,
    boxSizing: "border-box",

    // ✅ центрируем контент
    display: "grid",
    placeItems: "start center",

    fontFamily:
        "Roboto, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
}}>
            <div
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top center",

                    // ✅ важно: не растягиваем на 100%, иначе scrollWidth будет “плыть”
                    display: "inline-block",
                }}
            >
                <div
                    ref={contentRef}
                    style={{
                        display: "inline-block",
                    }}
                >
                    {children}
                </div>
            </div>
        </div>
    )
}

const drawCheckerboard = (
    ctx: CanvasRenderingContext2D,
    sizePx: number,
    cells: number
) => {
    const cell = sizePx / cells

    // 1) Пытаемся рисовать как паттерн (идеально совпадает с canvas-пикселями, включая дробные cell)
    const tile = getTransparencyTile1px()
    const pattern = ctx.createPattern(tile, "repeat")

    if (pattern && (pattern as any).setTransform) {
        // Масштабируем тайл 1px -> cell px (canvas-px, не CSS)
        ;(pattern as any).setTransform(new DOMMatrix().scale(cell, cell))
        ctx.fillStyle = pattern as any
        ctx.fillRect(0, 0, sizePx, sizePx)
        return
    }

    // 2) Фолбэк: старый способ (на случай старых браузеров без setTransform)
    const a = "#ffffff"
    const b = "#d9d9d9"
    for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
            ctx.fillStyle = (x + y) % 2 === 0 ? a : b
            ctx.fillRect(x * cell, y * cell, cell, cell)
        }
    }
}

const drawTransparentMark = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number
) => {
    const pad = Math.max(1, Math.floor(size * 0.15))
    const x0 = x + pad
    const y0 = y + pad
    const s = Math.max(2, size - pad * 2)

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(x0, y0, s, s)

    ctx.strokeStyle = "rgba(0,0,0,0.65)"
    ctx.lineWidth = Math.max(1, Math.floor(size * 0.08))
    ctx.strokeRect(x0, y0, s, s)

    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x0 + s, y0 + s)
    ctx.moveTo(x0 + s, y0)
    ctx.lineTo(x0, y0 + s)
    ctx.stroke()
}

// ------------------- CAMERA MODAL -------------------

function CameraModal({
    isOpen,
    onClose,
    onCaptured,
}: {
    isOpen: boolean
    onClose: () => void
    onCaptured: (img: SourceImage) => void
}) {
    const videoRef = React.useRef<HTMLVideoElement | null>(null)
    const streamRef = React.useRef<MediaStream | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    const [starting, setStarting] = React.useState(false)

    const stop = React.useCallback(() => {
        const s = streamRef.current
        if (s) s.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (videoRef.current) videoRef.current.srcObject = null
    }, [])

    React.useEffect(() => {
        if (!isOpen) {
            stop()
            setError(null)
            setStarting(false)
            return
        }

        let cancelled = false
        ;(async () => {
            try {
                setStarting(true)
                setError(null)

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1280 },
                        height: { ideal: 1280 },
                    },
                    audio: false,
                })

                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop())
                    return
                }

                streamRef.current = stream
                const v = videoRef.current
                if (v) {
                    v.srcObject = stream
                    await v.play()
                }
            } catch (e: any) {
                setError(
                    "Could not open the camera. Check browser permissions and HTTPS."
                )
            } finally {
                setStarting(false)
            }
        })()

        return () => {
            cancelled = true
            stop()
        }
    }, [isOpen, stop])

    const capture = React.useCallback(() => {
        const v = videoRef.current
        if (!v) return

        const vw = v.videoWidth || 0
        const vh = v.videoHeight || 0
        if (vw === 0 || vh === 0) return

        const side = Math.min(vw, vh)
        const sx = Math.floor((vw - side) / 2)
        const sy = Math.floor((vh - side) / 2)

        const canvas = document.createElement("canvas")
        canvas.width = side
        canvas.height = side

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        ctx.imageSmoothingEnabled = true
        ctx.clearRect(0, 0, side, side)

        // квадрат из видео без ресайза в 512
        ctx.drawImage(v, sx, sy, side, side, 0, 0, side, side)

        // P7: возвращаем SourceImage (ImageBitmap), не ImageData(512)
        ;(async () => {
            try {
                const bmp = await createImageBitmap(canvas)
                onCaptured(bmp)
                stop()
                onClose()
            } catch (e) {
                console.warn("[CAMERA] createImageBitmap failed", e)
                // можно показать error, но минимально — просто не закрываем модалку автоматически
                setError("Could not capture frame. Please try again.")
            }
        })()

        stop()
        onClose()
    }, [onCaptured, onClose, stop])

    if (!isOpen) return null

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,

                background: "rgba(0,0,0,0.3)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",

                display: "flex",
                flexDirection: "column",
            }}
        >
            <div
                style={{
                    padding: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    color: "#fff",
                    fontFamily:
                        "Roboto, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                }}
            >
                <div style={{ fontSize: 14, fontWeight: 600 }}>Camera</div>
                <button
                    type="button"
                    onClick={() => {
                        stop()
                        onClose()
                    }}
                    style={{
                        border: "1px solid rgba(255,255,255,0.35)",
                        background: "transparent",
                        color: "#fff",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                    }}
                >
                    Close
                </button>
            </div>

            <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
                <div
                    style={{
                        width: "min(92vw, 520px)",
                        aspectRatio: "1 / 1",
                        background: "#000",
                        borderRadius: 14,
                        overflow: "hidden",
                        position: "relative",
                    }}
                >
                    <video
                        ref={videoRef}
                        playsInline
                        muted
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                        }}
                    />
                    {starting && (
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                display: "grid",
                                placeItems: "center",
                                color: "#fff",
                                fontSize: 13,
                            }}
                        >
                            Starting camera…
                        </div>
                    )}
                    {error && (
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                padding: 16,
                                display: "grid",
                                placeItems: "center",
                                color: "#fff",
                                fontSize: 13,
                                textAlign: "center",
                            }}
                        >
                            {error}
                        </div>
                    )}
                </div>
            </div>

            <div
                style={{
                    padding: 14,
                    display: "flex",
                    justifyContent: "center",
                }}
            >
                <button
                    type="button"
                    onClick={capture}
                    disabled={!!error || starting}
                    style={{
                        width: "min(92vw, 520px)",
                        borderRadius: 14,
                        padding: "14px 16px",
                        border: "none",
                        background: "#ffffff",
                        color: "#000",
                        fontWeight: 700,
                        cursor: !!error || starting ? "not-allowed" : "pointer",
                        fontFamily:
                            "Roboto, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                >
                    Capture
                </button>
            </div>
        </div>
    )
}

// ------------------- START SCREEN -------------------

function StartScreen({
    onPickImage,
    onOpenCamera,
    onOpenDraw,
    onOpenProject,
}: {
    onPickImage: () => void
    onOpenCamera: () => void
    onOpenDraw: () => void
    onOpenProject: () => void
}) {
    const bg = "#e9d8a6"

    //const LOGO_W = 260
    const TAGLINE_TEXT = "Pixelize the world around you"

    const taglineRef = React.useRef<HTMLDivElement | null>(null)
    const [taglineFontPx, setTaglineFontPx] = React.useState(20)

    useIsomorphicLayoutEffect(() => {
        const el = taglineRef.current
        if (!el) return

        let raf = 0

        const measureAndFit = () => {
            const node = taglineRef.current
            if (!node) return

            const cw = node.clientWidth || 0
            if (cw <= 0) return

            const MAX = 20
            const MIN = 12

            node.style.fontSize = MAX + "px"

            if (node.scrollWidth <= node.clientWidth) {
                setTaglineFontPx((prev) => (prev === MAX ? prev : MAX))
                return
            }

            let lo = MIN
            let hi = MAX
            let best = MIN

            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2)
                node.style.fontSize = mid + "px"
                if (node.scrollWidth <= node.clientWidth) {
                    best = mid
                    lo = mid + 1
                } else {
                    hi = mid - 1
                }
            }

            setTaglineFontPx((prev) => (prev === best ? prev : best))
        }

        raf = window.requestAnimationFrame(measureAndFit)

        const onResize = () => {
            if (raf) window.cancelAnimationFrame(raf)
            raf = window.requestAnimationFrame(measureAndFit)
        }

        window.addEventListener("resize", onResize)

        return () => {
            window.removeEventListener("resize", onResize)
            if (raf) window.cancelAnimationFrame(raf)
        }
    }, [TAGLINE_TEXT, START_LOGO_W])

    const wrapStyle: React.CSSProperties = {
        height: "100vh",
        minHeight: "100vh",
        background: bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "28px 16px 10px",
        boxSizing: "border-box",
        fontFamily:
            "Roboto, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    }

    const logoBox: React.CSSProperties = {
        width: 260,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginTop: 10,
    }

    const taglineStyle: React.CSSProperties = {
        width: "100%",
        boxSizing: "border-box",
        fontSize: taglineFontPx,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        color: "#1b1b1b",
        textAlign: "justify",
        fontWeight: 400,
    }

    const logoButtonsSpacerStyle: React.CSSProperties = {
        height: "clamp(24px, 12vh, 64px)", // ~10–15% viewport, но с безопасными границами
        flex: "0 0 auto",
    }

    const buttonsWrap: React.CSSProperties = {
        // квадрат строго по ширине логотипа
        width: START_LOGO_W,
        height: START_LOGO_W,

        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",

        // фиксированный gap (оставил твой текущий)
        gap: 26,

        // важно: ячейки растягиваются, а не центрируются
        justifyItems: "stretch",
        alignItems: "stretch",

        margin: "0 auto",
    }

    const circleButton: React.CSSProperties = {
        // кнопка занимает ВСЮ ячейку grid
        width: "100%",
        height: "100%",

        border: "none",
        background: "transparent",
        padding: 0,
        margin: 0,
        cursor: "pointer",

        // чтобы внутренности ровно центрировались
        display: "grid",
        placeItems: "center",

        WebkitTapHighlightColor: "transparent",
    }

    const iconStyle: React.CSSProperties = {
        position: "absolute",

        // иконка масштабируется вместе с ячейкой
        width: "40%",
        height: "40%",

        imageRendering: "pixelated",
    }

    const circleInner: React.CSSProperties = {
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    }

    const circleSvgStyle: React.CSSProperties = {
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
    }

return (
<FitToViewport background={bg}>
    <div
        style={{
            ...wrapStyle,

            // ✅ страховка: не даём первому контейнеру раздуваться шире контента
            width: "fit-content",
            maxWidth: "100%",
            display: "inline-flex",
            flexDirection: "column",
            boxSizing: "border-box",
        }}
    >
            <div style={logoBox}>
                <div style={{ width: "100%", height: 52 }}>
                    <SvgLogo style={{ imageRendering: "pixelated" }} />
                </div>
                <div ref={taglineRef} style={taglineStyle}>
                    {TAGLINE_TEXT}
                </div>
            </div>

            <div aria-hidden="true" style={logoButtonsSpacerStyle} />

            <div style={buttonsWrap}>
                <button
                    type="button"
                    onClick={onPickImage}
                    style={circleButton}
                    aria-label="Image"
                >
                    <div style={circleInner}>
                        <SvgCircle style={circleSvgStyle} />
                        <div style={iconStyle}>
                            <SvgImage style={{ imageRendering: "pixelated" }} />
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={onOpenCamera}
                    style={circleButton}
                    aria-label="Camera"
                >
                    <div style={circleInner}>
                        <SvgCircle style={circleSvgStyle} />
                        <div style={iconStyle}>
                            <SvgCamera style={{ imageRendering: "pixelated" }} />
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={onOpenDraw}
                    style={circleButton}
                    aria-label="Draw"
                >
                    <div style={circleInner}>
                        <SvgCircle style={circleSvgStyle} />
                        <div style={iconStyle}>
                            <SvgPencil style={{ imageRendering: "pixelated" }} />
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={onOpenProject}
                    style={circleButton}
                    aria-label="Open Project"
                >
                    <div style={circleInner}>
                        <SvgCircle style={circleSvgStyle} />
                        <div style={iconStyle}>
                            <SvgFolder
                                style={{
                                    width: 51,
                                    imageRendering: "pixelated",
                                    paddingTop: 5,
                                    paddingLeft: 2,
                                }}
                            />
                        </div>
                    </div>
                </button>
            </div>

            <div style={{ flex: 1 }} />
        </div>
    </FitToViewport>
)
}

// ------------------- EDITOR -------------------

type OverlayMode = null | "import" | "export"

type BusyKind = "stream" | "txn" | null

type TxnAction = {
    kind: string
    payload?: any
}

type PendingFlags = {
    repixelize: boolean
    gridCommit: boolean
    overlayRequant: boolean
    gridPolicyBlankCheck: boolean
}

// ------------------- GLOBAL LAYOUT CONSTANTS -------------------
// ширина логотипа стартового экрана (используется и в футере)
const START_LOGO_W = 260

function PixelEditorFramer({
    initialImageData,
    startWithImageVisible,
    onRequestCamera,
    onRequestCropFromFile,
    onRequestPickImage,
    pendingProjectFile,
    onPendingProjectFileConsumed,
    onShowImportError,
}: {
    initialImageData: ImageData | null
    startWithImageVisible: boolean
    onRequestCamera: () => void
    onRequestCropFromFile: (p: { file: File }) => void
    onRequestPickImage?: () => void

    // ✅ NEW: project-open bridge from ROOT
    pendingProjectFile?: File | null
    onPendingProjectFileConsumed?: () => void

    // ✅ NEW: unified import-error bridge (optional)
    onShowImportError?: (message: string) => void
}) {
    const isMobileUI =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 640px)").matches

    // =====================
    // S0: USER ACTION CONTRACT "WIRES" (NO BEHAVIOR CHANGES)
    // =====================

    const busyKindRef = React.useRef<BusyKind>(null)
    const txnQueueRef = React.useRef<TxnAction[]>([])
    const pendingRef = React.useRef<PendingFlags>({
        repixelize: false,
        gridCommit: false,
        overlayRequant: false,
        gridPolicyBlankCheck: false,
    })

    // ------------------- BRUSH PREVIEW (S7) -------------------

    const brushPreviewRafRef = React.useRef<number>(0)
    const brushPreviewPendingRef = React.useRef<{
        show: boolean
        leftPx: number
        topPx: number
        wPx: number
        hPx: number
    } | null>(null)

    // внешний scale от FitToViewport (viewport → content)
    const fitScaleRef = React.useRef<number>(1)

    const brushPreviewPosRef = React.useRef<{ x: number; y: number } | null>(
        null
    )

    // ------------------- USER ACTION QUEUE (S2) -------------------

    type TxnKind = "gridCommit" | "importLoad" | "save"
    type TxnAction = { kind: TxnKind; run: () => void | Promise<void> }

    // чтобы не запускать drain ре-ентерабельно (и не плодить параллельные сливы)
    const drainScheduledRef = React.useRef(false)

    function isPromiseLike(x: any): x is Promise<any> {
        return (
            !!x &&
            (typeof x === "object" || typeof x === "function") &&
            typeof x.then === "function"
        )
    }

    function scheduleDrainAfterUnlock() {
        if (drainScheduledRef.current) return
        drainScheduledRef.current = true
        Promise.resolve().then(() => {
            drainScheduledRef.current = false
            drainAfterUnlock()
        })
    }

    // enqueueTxn: если idle — выполнить сразу как TXN; иначе — в очередь
    function enqueueTxn(kind: TxnKind, run: () => void | Promise<void>) {
        const action: TxnAction = { kind, run }

        // если занято (stream/txn) — просто ставим в очередь
        if (busyKindRef.current !== null) {
            txnQueueRef.current.push(action)
            return
        }

        // idle → выполняем сразу как txn
        busyKindRef.current = "txn"
        try {
            const r = run()

            // если async — держим lock до завершения, потом слив
            if (isPromiseLike(r)) {
                r.finally(() => {
                    if (busyKindRef.current === "txn")
                        busyKindRef.current = null
                    scheduleDrainAfterUnlock()
                })
                return
            }
        } finally {
            // sync path
            if (busyKindRef.current === "txn") busyKindRef.current = null
            scheduleDrainAfterUnlock()
        }
    }

    // drainAfterUnlock: строгий порядок “TXN очередь → pending фон”
    function drainAfterUnlock() {
        // если прямо сейчас кто-то владеет курсором — выкачивать нельзя
        if (busyKindRef.current !== null) return

        // 1) выкачиваем txn-очередь строго последовательно
        while (busyKindRef.current === null && txnQueueRef.current.length > 0) {
            const next = txnQueueRef.current.shift()!
            busyKindRef.current = "txn"

            try {
                const r = next.run()
                if (isPromiseLike(r)) {
                    r.finally(() => {
                        if (busyKindRef.current === "txn")
                            busyKindRef.current = null
                        scheduleDrainAfterUnlock()
                    })
                    return // продолжим после завершения async txn
                }
            } finally {
                if (busyKindRef.current === "txn") busyKindRef.current = null
            }
        }

        // 2) когда TXN пусто — pending фон
        applyPendingAfterUnlock()
    }

    // В S3 эти функции могут быть no-op, чтобы НЕ менять поведение MVP.
    // Подключение к реальным “тяжёлым” операциям — следующим шагом, когда начнём ставить pendingRef.* = true.

    function applyPendingGridCommit() {
        // no-op (или в будущем: commitGridResizeIfNeeded через enqueueTxn)
    }

    function applyPendingRepixelize() {
        // безопасный “пинок”: repixelizeEffect сам решит что делать, но только в idle
        setRepixelizeKick((x) => x + 1)
    }

    function applyPendingOverlayRequant() {
        // 🔒 S5: overlay-requant ИМЕЕТ ПРАВО читать ТОЛЬКО эталон штрихов (paintRefImageData).
        // Никаких “пересъёмов” эталона из overlayPixels здесь быть не должно.

        // Если эталона нет — значит и восстанавливать нечего (оверлей пустой/нефиксированный)
        const refSnap = paintRefImageData ?? null
        if (!refSnap) {
            setOverlayPixels(createEmptyPixels(gridSize))
            return
        }

        // Важно: используем те же autoEffective, что реально в UI/логике
        const autoEffective = applyAutoOverrides(autoSwatches, autoOverrides)

        const overlayNext = requantizePaintSnapshotToOverlayPixels({
            snapshot: refSnap,
            gridSize,
            baseAuto: autoEffective,
            user: userSwatches,
        })

        setOverlayPixels(overlayNext)

        postCommitGridHook(
            {
                imagePixels,
                overlayPixels: overlayNext,
                autoSwatches: autoEffective,
                userSwatches,
            },
            "overlay-requant(from-paintRef)"
        )
    }

    function applyPendingGridPolicyBlankCheck() {
        const reason = pendingBlankCheckReasonRef.current
        if (!reason) return

        // сбрасываем сразу (fail-safe)
        pendingBlankCheckReasonRef.current = null

        autoEnableGridIfBlank(
            { imagePixels, overlayPixels, autoSwatches, userSwatches },
            reason
        )
    }

    // applyPendingAfterUnlock: применяется только когда idle и TXN-очередь пуста
    function applyPendingAfterUnlock(): boolean {
        // safety: этот хелпер должен жить только в idle
        if (busyKindRef.current !== null) return false
        if (txnQueueRef.current.length > 0) return false

        const p = pendingRef.current
        const hasAny = !!(
            p.repixelize ||
            p.gridCommit ||
            p.overlayRequant ||
            p.gridPolicyBlankCheck
        )

        const doRepixelize = p.repixelize
        const doGridCommit = p.gridCommit
        const doOverlayRequant = p.overlayRequant
        const doGridPolicyBlankCheck = p.gridPolicyBlankCheck

        p.repixelize = false
        p.gridCommit = false
        p.overlayRequant = false
        p.gridPolicyBlankCheck = false

        // Детерминированный порядок применения pending (фиксируем контракт):
        // 1) gridCommit
        // 2) repixelize
        // 3) overlayRequant
        // 4) gridPolicyBlankCheck

        if (doGridPolicyBlankCheck) {
            applyPendingGridPolicyBlankCheck()
        }

        if (doGridCommit) {
            applyPendingGridCommit()
        }
        if (doRepixelize) {
            applyPendingRepixelize()
        }
        if (doOverlayRequant) {
            applyPendingOverlayRequant()
        }

        return true
    }

    function computePaletteCountFromSwatches(
        auto: Swatch[],
        user: Swatch[]
    ): number {
        const strip = (list: Swatch[]) =>
            (list || []).filter(
                (s) => s && !s.isTransparent && s.id !== "transparent"
            )
        const a = strip(auto).length
        const u = strip(user).length
        return clampInt(a + u, PALETTE_MIN, PALETTE_MAX)
    }

    const [gridSize, setGridSize] = React.useState(32)
    const [paletteCount, setPaletteCount] = React.useState(16)

    const [imagePixels, setImagePixels] = React.useState<PixelValue[][]>(() =>
        createEmptyPixels(32)
    )
    const [overlayPixels, setOverlayPixels] = React.useState<PixelValue[][]>(
        () => createEmptyPixels(32)
    )

    const [autoOverrides, setAutoOverrides] =
        React.useState<AutoSwatchOverridesMap>({})

    function resetAutoOverridesForNewImport() {
        setAutoOverrides({})
    }

    // =====================
    // IMPORT UI STATE (used by crop/import modal + failClosedLoad)
    // =====================

    type ImportStatus = "idle" | "decoding" | "ready" | "applying"

    const [importStatus, setImportStatus] = React.useState<ImportStatus>("idle")

    // legacy diagnostics only (UI must NOT branch on this anymore)
    const [importError, setImportError] = React.useState<string | null>(null)

    // ---------------------
    // Unified import error (single modal, owned by ROOT)
    // PixelEditorFramer управляет своим importStatus, а ROOT — только показом модалки.
    // ---------------------
    const showImportError = onShowImportError ?? ((_: string) => {}) // fail-safe NO-OP

    const failImport = React.useCallback(
        (message: string) => {
            showImportError(message)
            setImportStatus("idle")
            setImportError(null) // legacy diagnostics only
        },
        [showImportError]
    )

    // когда ошибка случилась внутри активного флоу (crop/import) — оставляем "ready"
    const failImportInFlow = React.useCallback(
        (message: string) => {
            showImportError(message)
            setImportStatus("ready")
            setImportError(null)
        },
        [showImportError]
    )

    // --------------------- BLANK PROJECT (S3) ---------------------
    // Одна точка правды: синхронный сброс проекта в "пустой".
    // Никаких async/heavy — только setters/refs-reset.

    const SAFE_DEFAULT_GRID_SIZE = 32

    function safeGridSizeOrDefault(v: any): number {
        const n = Number(v)
        if (!Number.isFinite(n)) return SAFE_DEFAULT_GRID_SIZE
        const i = Math.floor(n)
        if (i <= 0) return SAFE_DEFAULT_GRID_SIZE
        return i
    }

    function applyBlankProject(nextGridSize: number) {
        const gs = safeGridSizeOrDefault(nextGridSize)

        // если вдруг gridSize был битый — фиксируем и state тоже
        if (gs !== gridSize) setGridSize(gs)

        // 1) Пиксели
        setOverlayPixels(createEmptyPixels(gs))
        setImagePixels(createEmptyPixels(gs))

        // 2) Import context — строго выключаем
        setOriginalImageData(null)
        setHasImportContext(false)
        setImportStatus("idle")
        setImportError(null)

        // 3) Undo/Redo — чистый новый проект
        pastRef.current = []
        futureRef.current = []
        syncHistoryFlags()

        // 4) NEW PROJECT = новая сессия:
        // очищаем эталон слоя штрихов и ключи пайплайна, чтобы старое не “приехало” после repixelize.
        setPaintRefImageData(null)
        overlayDirtyRef.current = false
        paintSnapshotNonceRef.current = 0
        p25LastKeyRef.current = null
        p3LastProcessedKeyRef.current = null
        p3InFlightKeyRef.current = null
    }

    const lastInitialImageDataRef = React.useRef<ImageData | null>(null)

    React.useEffect(() => {
        // Если пришёл null (Draw / очистка) — сбросим якорь
        if (!initialImageData) {
            lastInitialImageDataRef.current = null
            return
        }

        // Новый импорт = новый объект ImageData (другая ссылка)
        if (lastInitialImageDataRef.current === initialImageData) return
        lastInitialImageDataRef.current = initialImageData

        // ✅ reset overrides for NEW import (camera/gallery/crop)
        resetAutoOverridesForNewImport()
    }, [initialImageData])

    const onSaveProject = React.useCallback(() => {
        const snapshot = buildProjectSnapshotV2()
        const json = JSON.stringify(snapshot)

        if (ENABLE_SAVELOAD_CHECKSUM_LOGS) {
            console.log(
                "[SAVE][CHK] len=",
                json.length,
                "fnv1a32=",
                checksumJsonString(json)
            )
        }

        enqueueTxn("save", async () => {
            await saveProjectFile({
                suggestedName: "project.pixtudio",
                mime: "application/json",
                jsonText: json,
            })
        })
    }, [buildProjectSnapshotV2])

    const onLoadProject = React.useCallback(() => {
        // UI1: открываем системный пикер файла
        loadFileInputRef.current?.click()
    }, [])

    type LoadPayload = {
        snapshotVersion: 2
        nextState: ReturnType<typeof buildNextStateFromValidatedSnapshotV2>
        canonicalChecksum?: string
        fileName?: string
    }

    type LoadLetter = { ok: true; payload: LoadPayload } | { ok: false }

    async function buildLoadLetterFromPixtudioFile(
        file: File
    ): Promise<LoadLetter> {
        try {
            // ==========================
            // LOAD CAPSULE: read + parse
            // ==========================
            const jsonText = await file.text()

            let parsed: any
            try {
                parsed = JSON.parse(jsonText)
            } catch {
                return { ok: false }
            }

            // ==========================
            // LOAD CAPSULE: validate + canonicalize + build payload (V2 only)
            // ==========================
            if (!parsed || parsed.version !== 2) {
                return { ok: false }
            }

            const validatedV2 = validateProjectSnapshotV2OrThrow(parsed)
            const canonical = canonicalizeSnapshotV2(validatedV2)
            const canonicalChecksum = checksumJsonString(
                JSON.stringify(canonical)
            )

            const nextState = buildNextStateFromValidatedSnapshotV2(validatedV2)

            const payload: LoadPayload = {
                snapshotVersion: 2,
                nextState,
                canonicalChecksum,
                fileName: file.name,
            }

            return { ok: true, payload }
        } catch {
            return { ok: false }
        }
    }

    // ==========================
    // S3 — EDITOR APPLY POINT (single decision point)
    // ==========================

    function applyLoadLetterInEditor(letter: LoadLetter) {
        // Editor — единственное место, где решаем: применить или показать ошибку
        if (!letter.ok) {
            // ✅ ЕДИНАЯ модалка "Неправильный импорт" (как и для неверного изображения)
            onShowImportError?.("Import failed. Please try again.")

            // (опционально) оставляем legacy-стейт, если он ещё где-то используется логикой
            //setImportStatus("error")
            //setImportError("Import failed. Please try again.")
            return
        }

        restoreProjectFromLoadPayload(letter.payload)
    }

    React.useEffect(() => {
        const file = pendingProjectFile
        if (!file) return

        let cancelled = false

        ;(async () => {
            try {
                const letter = await buildLoadLetterFromPixtudioFile(file)
                if (cancelled) return

                applyLoadLetterInEditor(letter)
            } finally {
                // “съедаем” pending в любом случае (успех/ошибка)
                if (!cancelled) onPendingProjectFileConsumed?.()
            }
        })()

        return () => {
            cancelled = true
        }
    }, [
        pendingProjectFile,
        onPendingProjectFileConsumed,
        buildLoadLetterFromPixtudioFile,
        applyLoadLetterInEditor,
    ])

    const handlePickedProjectFile = React.useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            if (!file) return

            // важно: чтобы повторный выбор того же файла срабатывал
            event.target.value = ""

            enqueueTxn("importLoad", async () => {
                try {
                    const letter = await buildLoadLetterFromPixtudioFile(file)
                    applyLoadLetterInEditor(letter)
                } catch {
                    applyLoadLetterInEditor({ ok: false })
                }
            })
        },
        []
    )

    type ValidatedSnapshotV1 = ProjectSnapshotV1

    type ValidatedSnapshotV2 = ProjectSnapshotV2

    function canonicalizeSnapshotV1(s: ProjectSnapshotV1): ProjectSnapshotV1 {
        const sw = [...s.palette.swatches].sort((a, b) => a.index - b.index)
        const st = [...s.strokeLayer.cells].sort((a, b) => {
            if (a.cellIndex !== b.cellIndex) return a.cellIndex - b.cellIndex
            return a.swatchIndex - b.swatchIndex
        })

        return {
            magic: "PIXTUDIO",
            version: 1,
            gridSize: s.gridSize,
            palette: {
                swatches: sw.map((x, i) => ({
                    index: i,
                    id: x.id,
                    hex: x.hex,
                    isTransparent: !!x.isTransparent,
                    isUser: !!x.isUser,
                })),
                transparentIndex: s.palette.transparentIndex,
            },
            importLayer: { cells: [...s.importLayer.cells] },
            strokeLayer: {
                cells: st.map((c) => ({
                    cellIndex: c.cellIndex,
                    swatchIndex: c.swatchIndex,
                })),
            },
            ref: s.ref
                ? { w: 512, h: 512, ext: "rgba8", b64: s.ref.b64 }
                : null,
        }
    }

    function canonicalizeSnapshotV2(s: ProjectSnapshotV2): ProjectSnapshotV2 {
        const sw = [...s.palette.swatches].sort((a, b) => a.index - b.index)
        const st = [...s.strokeLayer.cells].sort((a, b) => {
            if (a.cellIndex !== b.cellIndex) return a.cellIndex - b.cellIndex
            return a.swatchIndex - b.swatchIndex
        })

        let autoOverridesCanon: AutoSwatchOverridesMap | undefined = undefined
        if (s.autoOverrides && Object.keys(s.autoOverrides).length > 0) {
            const keys = Object.keys(s.autoOverrides).sort()
            const out: AutoSwatchOverridesMap = {}
            for (const k of keys) out[k] = s.autoOverrides[k]
            autoOverridesCanon = out
        }

        return {
            magic: "PIXTUDIO",
            version: 2,
            gridSize: s.gridSize,
            palette: {
                swatches: sw.map((x, i) => ({
                    index: i,
                    id: x.id,
                    hex: x.hex,
                    isUser: !!x.isUser,
                })),
            },
            importLayer: { cells: [...s.importLayer.cells] },
            autoOverrides: autoOverridesCanon,
            strokeLayer: {
                cells: st.map((c) => ({
                    cellIndex: c.cellIndex,
                    swatchIndex: c.swatchIndex,
                })),
            },
            ref: s.ref
                ? { w: 512, h: 512, ext: "rgba8", b64: s.ref.b64 }
                : null,
        }
    }

    function v1ToV2ForChecksum(v1: ValidatedSnapshotV1): ProjectSnapshotV2 {
        // строим V2 palette без transparent
        const swatches = v1.palette.swatches
            .filter((s) => !s.isTransparent)
            .map((s, i) => ({
                index: i,
                id: s.id,
                hex: s.hex,
                isUser: !!s.isUser,
            }))

        const indexById = new Map(swatches.map((s) => [s.id, s.index]))

        const transparentIndex = v1.palette.transparentIndex

        const mapCell = (cell: number): number => {
            if (cell < 0) return -1
            if (cell === transparentIndex) return -2
            const sw = v1.palette.swatches[cell]
            if (!sw || sw.isTransparent) return -2
            return indexById.get(sw.id) ?? -1
        }

        const importCells = v1.importLayer.cells.map(mapCell)

        const strokeCells = v1.strokeLayer.cells.map((c) => ({
            cellIndex: c.cellIndex,
            swatchIndex: mapCell(c.swatchIndex),
        }))

        return {
            magic: "PIXTUDIO",
            version: 2,
            gridSize: v1.gridSize,
            palette: { swatches },
            importLayer: { cells: importCells },
            strokeLayer: { cells: strokeCells },
            ref: v1.ref,
        }
    }

    // ============================================================
    // T0 — Snapshot V2 contract (NO-OP)
    // Цель: зафиксировать новый формат слепка без вмешательства в поведение.
    //
    // V2 changes (semantics):
    // - palette.swatches[] = только цвета (без transparent swatch)
    // - transparentIndex отсутствует
    // - importLayer.cells[]: -1 = null, -2 = TRANSPARENT_PIXEL, 0..N-1 = index in palette.swatches
    // - strokeLayer.cells[]: swatchIndex может быть -2
    //
    // ВАЖНО (T0): эти типы/константы пока НИГДЕ не используются в логике.
    // ============================================================

    // Канонические коды ячеек V2
    const V2_CELL_NULL = -1 as const
    const V2_CELL_TRANSPARENT = -2 as const

    // importLayer.cells[i] в V2: -1 | -2 | [0..paletteLen-1]
    type ImportCellV2 = -1 | -2 | number

    // strokeLayer.cells[].swatchIndex в V2: -2 | [0..paletteLen-1]
    type StrokeSwatchIndexV2 = -2 | number

    type ProjectSnapshotV2 = {
        magic: "PIXTUDIO"
        version: 2
        gridSize: number
        palette: {
            // В2: только цветовые свотчи. Прозрачность — свойство редактора/пикселя, НЕ свотча.
            swatches: Array<{
                index: number
                id: string
                hex: string
                isUser: boolean
            }>
        }

        paletteCount?: number

        autoOverrides?: AutoSwatchOverridesMap

        importLayer: {
            // len = gridSize*gridSize
            // value:
            //  -1 => null (пусто)
            //  -2 => TRANSPARENT_PIXEL (прозрачный пиксель)
            //  0..N-1 => index into palette.swatches
            cells: ImportCellV2[]
        }
        strokeLayer: {
            // sparse (как в V1), но swatchIndex может быть -2 (прозрачный штрих)
            cells: Array<{
                cellIndex: number
                swatchIndex: StrokeSwatchIndexV2
            }>
        }
        ref: null | {
            w: 512
            h: 512
            ext: "rgba8"
            b64: string // base64 of raw RGBA bytes
        }
    }

    // На будущее (пока NO-OP): общий тип слепка, когда loader начнёт различать версии.
    type ProjectSnapshotAny = ProjectSnapshotV1 | ProjectSnapshotV2

    type LoadGateErrorCode =
        | "E_READ"
        | "E_JSON_PARSE"
        | "E_ROOT_KEYS"
        | "E_MAGIC"
        | "E_VERSION"
        | "E_GRID"
        | "E_PALETTE"
        | "E_IMPORT_LAYER"
        | "E_STROKE_LAYER"
        | "E_REF"

    type LoadGateError = {
        code: LoadGateErrorCode
        message: string
    }

    function makeLoadGateError(
        code: LoadGateErrorCode,
        message: string
    ): LoadGateError {
        return { code, message }
    }

    function isPlainObject(x: any): x is Record<string, any> {
        return !!x && typeof x === "object" && !Array.isArray(x)
    }

    function assertExactKeys(
        obj: Record<string, any>,
        allowed: string[],
        code: LoadGateErrorCode,
        where: string
    ) {
        const keys = Object.keys(obj)
        if (keys.length !== allowed.length) {
            throw makeLoadGateError(code, `${where}: keys length mismatch`)
        }
        for (const k of keys) {
            if (!allowed.includes(k)) {
                throw makeLoadGateError(code, `${where}: unexpected key "${k}"`)
            }
        }
        // также проверяем, что ничего не пропущено
        for (const k of allowed) {
            if (!(k in obj)) {
                throw makeLoadGateError(code, `${where}: missing key "${k}"`)
            }
        }
    }

    function isInt(n: any) {
        return Number.isInteger(n)
    }

    function assertIntInRange(
        n: any,
        min: number,
        max: number,
        code: LoadGateErrorCode,
        where: string
    ) {
        if (!isInt(n)) throw makeLoadGateError(code, `${where}: not integer`)
        if (n < min || n > max)
            throw makeLoadGateError(code, `${where}: out of range`)
    }

    function assertString(n: any, code: LoadGateErrorCode, where: string) {
        if (typeof n !== "string")
            throw makeLoadGateError(code, `${where}: not string`)
    }

    function assertBool(n: any, code: LoadGateErrorCode, where: string) {
        if (typeof n !== "boolean")
            throw makeLoadGateError(code, `${where}: not boolean`)
    }

    // base64 без декодирования (никаких аллокаций по данным)
    // считаем ожидаемую длину decoded bytes по длине строки
    function base64DecodedLenOrThrow(
        b64: string,
        code: LoadGateErrorCode,
        where: string
    ): number {
        // только валидные символы base64 + padding
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
            throw makeLoadGateError(code, `${where}: invalid base64 charset`)
        }
        if (b64.length === 0) return 0
        if (b64.length % 4 !== 0) {
            throw makeLoadGateError(
                code,
                `${where}: base64 length not multiple of 4`
            )
        }
        const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0
        return (b64.length / 4) * 3 - pad
    }

    function validateProjectSnapshotV1OrThrow(raw: any): ValidatedSnapshotV1 {
        if (!isPlainObject(raw)) {
            throw makeLoadGateError("E_ROOT_KEYS", "root: not an object")
        }

        assertExactKeys(
            raw,
            [
                "magic",
                "version",
                "gridSize",
                "palette",
                "importLayer",
                "strokeLayer",
                "ref",
            ],
            "E_ROOT_KEYS",
            "root"
        )

        // magic/version whitelist
        if (raw.magic !== "PIXTUDIO") {
            throw makeLoadGateError("E_MAGIC", "magic: not allowed")
        }
        if (raw.version !== 1) {
            throw makeLoadGateError("E_VERSION", "version: not allowed")
        }

        // gridSize (фиксированные bounds — выбирай свои; сейчас делаю безопасный диапазон MVP)
        assertIntInRange(raw.gridSize, 4, 128, "E_GRID", "gridSize")
        const g = raw.gridSize
        const cellsN = g * g

        // palette
        const pal = raw.palette
        if (!isPlainObject(pal))
            throw makeLoadGateError("E_PALETTE", "palette: not object")
        assertExactKeys(
            pal,
            ["swatches", "transparentIndex"],
            "E_PALETTE",
            "palette"
        )

        if (!Array.isArray(pal.swatches)) {
            throw makeLoadGateError("E_PALETTE", "palette.swatches: not array")
        }
        const swatches = pal.swatches
        // sanity cap
        if (swatches.length <= 0 || swatches.length > 256) {
            throw makeLoadGateError(
                "E_PALETTE",
                "palette.swatches: invalid length"
            )
        }

        assertIntInRange(
            pal.transparentIndex,
            0,
            swatches.length - 1,
            "E_PALETTE",
            "palette.transparentIndex"
        )

        for (let i = 0; i < swatches.length; i++) {
            const sw = swatches[i]
            if (!isPlainObject(sw))
                throw makeLoadGateError(
                    "E_PALETTE",
                    `swatches[${i}]: not object`
                )
            assertExactKeys(
                sw,
                ["index", "id", "hex", "isTransparent", "isUser"],
                "E_PALETTE",
                `swatches[${i}]`
            )

            // index должен совпадать позиции
            if (sw.index !== i)
                throw makeLoadGateError(
                    "E_PALETTE",
                    `swatches[${i}].index mismatch`
                )
            assertString(sw.id, "E_PALETTE", `swatches[${i}].id`)
            if (!sw.id)
                throw makeLoadGateError("E_PALETTE", `swatches[${i}].id empty`)

            assertString(sw.hex, "E_PALETTE", `swatches[${i}].hex`)
            if (!/^#[0-9A-F]{6}$/.test(sw.hex)) {
                throw makeLoadGateError(
                    "E_PALETTE",
                    `swatches[${i}].hex invalid`
                )
            }
            assertBool(
                sw.isTransparent,
                "E_PALETTE",
                `swatches[${i}].isTransparent`
            )
            assertBool(sw.isUser, "E_PALETTE", `swatches[${i}].isUser`)
        }

        // importLayer
        const imp = raw.importLayer
        if (!isPlainObject(imp))
            throw makeLoadGateError("E_IMPORT_LAYER", "importLayer: not object")
        assertExactKeys(imp, ["cells"], "E_IMPORT_LAYER", "importLayer")
        if (!Array.isArray(imp.cells))
            throw makeLoadGateError(
                "E_IMPORT_LAYER",
                "importLayer.cells: not array"
            )
        if (imp.cells.length !== cellsN) {
            throw makeLoadGateError(
                "E_IMPORT_LAYER",
                "importLayer.cells: length mismatch"
            )
        }
        for (let i = 0; i < imp.cells.length; i++) {
            const v = imp.cells[i]
            // -1 или индекс свотча
            if (!isInt(v))
                throw makeLoadGateError(
                    "E_IMPORT_LAYER",
                    `importLayer.cells[${i}]: not int`
                )
            if (v !== -1)
                assertIntInRange(
                    v,
                    0,
                    swatches.length - 1,
                    "E_IMPORT_LAYER",
                    `importLayer.cells[${i}]`
                )
        }

        // strokeLayer (sparse)
        const st = raw.strokeLayer
        if (!isPlainObject(st))
            throw makeLoadGateError("E_STROKE_LAYER", "strokeLayer: not object")
        assertExactKeys(st, ["cells"], "E_STROKE_LAYER", "strokeLayer")
        if (!Array.isArray(st.cells))
            throw makeLoadGateError(
                "E_STROKE_LAYER",
                "strokeLayer.cells: not array"
            )
        if (st.cells.length > cellsN)
            throw makeLoadGateError(
                "E_STROKE_LAYER",
                "strokeLayer.cells: too large"
            )

        for (let i = 0; i < st.cells.length; i++) {
            const cell = st.cells[i]
            if (!isPlainObject(cell))
                throw makeLoadGateError(
                    "E_STROKE_LAYER",
                    `strokeLayer.cells[${i}]: not object`
                )
            assertExactKeys(
                cell,
                ["cellIndex", "swatchIndex"],
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}]`
            )
            assertIntInRange(
                cell.cellIndex,
                0,
                cellsN - 1,
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}].cellIndex`
            )
            assertIntInRange(
                cell.swatchIndex,
                0,
                swatches.length - 1,
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}].swatchIndex`
            )
        }

        // ref
        const ref = raw.ref
        if (ref !== null) {
            if (!isPlainObject(ref))
                throw makeLoadGateError("E_REF", "ref: not null/object")
            assertExactKeys(ref, ["w", "h", "ext", "b64"], "E_REF", "ref")

            if (ref.w !== 512 || ref.h !== 512) {
                throw makeLoadGateError("E_REF", "ref: invalid size")
            }
            if (ref.ext !== "rgba8") {
                throw makeLoadGateError("E_REF", "ref.ext: not allowed")
            }
            assertString(ref.b64, "E_REF", "ref.b64")

            const expectedLen = 512 * 512 * 4
            const decodedLen = base64DecodedLenOrThrow(
                ref.b64,
                "E_REF",
                "ref.b64"
            )
            if (decodedLen !== expectedLen) {
                throw makeLoadGateError(
                    "E_REF",
                    "ref.b64: decoded length mismatch"
                )
            }
        }

        // ✅ если дошли сюда — snapshot валиден
        return raw as ValidatedSnapshotV1
    }

    function validateProjectSnapshotV2OrThrow(raw: any): ValidatedSnapshotV2 {
        if (!isPlainObject(raw)) {
            throw makeLoadGateError("E_ROOT_KEYS", "root: not an object")
        }

        // root keys (V2: version=2). MVP-contract:
        // paletteCount ОБЯЗАТЕЛЕН, autoOverrides ОПЦИОНАЛЕН
        const keys = Object.keys(raw).sort().join("|")

        const allowB = [
            "magic",
            "version",
            "gridSize",
            "palette",
            "importLayer",
            "strokeLayer",
            "ref",
            "paletteCount",
        ]
            .sort()
            .join("|")

        const allowD = [
            "magic",
            "version",
            "gridSize",
            "palette",
            "importLayer",
            "strokeLayer",
            "ref",
            "paletteCount",
            "autoOverrides",
        ]
            .sort()
            .join("|")

        // paletteCount обязателен по root-keys (allowB/allowD),
        // но дополнительно валидируем диапазон, если ключ присутствует
        if ("paletteCount" in raw) {
            assertIntInRange(
                raw.paletteCount,
                PALETTE_MIN,
                PALETTE_MAX,
                "E_PALETTE",
                "paletteCount"
            )
        }

        if (keys !== allowB && keys !== allowD) {
            throw makeLoadGateError("E_ROOT_KEYS", "root: unexpected keys")
        }

        if ("autoOverrides" in raw) {
            const ao = raw.autoOverrides
            if (!isPlainObject(ao)) {
                throw makeLoadGateError(
                    "E_ROOT_KEYS",
                    "autoOverrides: not object"
                )
            }

            for (const k of Object.keys(ao)) {
                if (!/^auto-\d+$/.test(k)) {
                    throw makeLoadGateError(
                        "E_ROOT_KEYS",
                        `autoOverrides: invalid key "${k}"`
                    )
                }

                const v = ao[k]
                if (!isPlainObject(v)) {
                    throw makeLoadGateError(
                        "E_ROOT_KEYS",
                        `autoOverrides["${k}"]: not object`
                    )
                }

                // допускаем ТОЛЬКО hex/isTransparent
                const vKeys = Object.keys(v)
                for (const kk of vKeys) {
                    if (kk !== "hex" && kk !== "isTransparent") {
                        throw makeLoadGateError(
                            "E_ROOT_KEYS",
                            `autoOverrides["${k}"]: unexpected key "${kk}"`
                        )
                    }
                }

                if ("hex" in v) {
                    assertString(
                        v.hex,
                        "E_ROOT_KEYS",
                        `autoOverrides["${k}"].hex`
                    )
                    if (
                        !/^#[0-9A-F]{6}$/.test((v.hex as string).toUpperCase())
                    ) {
                        throw makeLoadGateError(
                            "E_ROOT_KEYS",
                            `autoOverrides["${k}"].hex invalid`
                        )
                    }
                }

                if ("isTransparent" in v) {
                    assertBool(
                        v.isTransparent,
                        "E_ROOT_KEYS",
                        `autoOverrides["${k}"].isTransparent`
                    )
                }

                // diff-only: нельзя пустой объект
                if (!("hex" in v) && !("isTransparent" in v)) {
                    throw makeLoadGateError(
                        "E_ROOT_KEYS",
                        `autoOverrides["${k}"] empty`
                    )
                }
            }
        }

        // magic/version whitelist
        if (raw.magic !== "PIXTUDIO") {
            throw makeLoadGateError("E_MAGIC", "magic: not allowed")
        }
        if (raw.version !== 2) {
            throw makeLoadGateError("E_VERSION", "version: not allowed")
        }

        // gridSize bounds (те же, что в V1)
        assertIntInRange(raw.gridSize, 4, 128, "E_GRID", "gridSize")
        const g = raw.gridSize
        const cellsN = g * g

        // palette (V2: НЕТ transparentIndex; swatches без isTransparent)
        const pal = raw.palette
        if (!isPlainObject(pal))
            throw makeLoadGateError("E_PALETTE", "palette: not object")

        assertExactKeys(pal, ["swatches"], "E_PALETTE", "palette")

        if (!Array.isArray(pal.swatches)) {
            throw makeLoadGateError("E_PALETTE", "palette.swatches: not array")
        }

        const swatches = pal.swatches
        if (swatches.length <= 0 || swatches.length > 256) {
            throw makeLoadGateError(
                "E_PALETTE",
                "palette.swatches: invalid length"
            )
        }

        for (let i = 0; i < swatches.length; i++) {
            const sw = swatches[i]
            if (!isPlainObject(sw))
                throw makeLoadGateError(
                    "E_PALETTE",
                    `swatches[${i}]: not object`
                )

            assertExactKeys(
                sw,
                ["index", "id", "hex", "isUser"],
                "E_PALETTE",
                `swatches[${i}]`
            )

            if (sw.index !== i)
                throw makeLoadGateError(
                    "E_PALETTE",
                    `swatches[${i}].index mismatch`
                )

            assertString(sw.id, "E_PALETTE", `swatches[${i}].id`)
            if (!sw.id)
                throw makeLoadGateError("E_PALETTE", `swatches[${i}].id empty`)

            assertString(sw.hex, "E_PALETTE", `swatches[${i}].hex`)
            if (!/^#[0-9A-F]{6}$/.test(sw.hex)) {
                throw makeLoadGateError(
                    "E_PALETTE",
                    `swatches[${i}].hex invalid`
                )
            }

            assertBool(sw.isUser, "E_PALETTE", `swatches[${i}].isUser`)
        }

        // importLayer (V2: cells могут быть -1, -2, 0..N-1)
        const imp = raw.importLayer
        if (!isPlainObject(imp))
            throw makeLoadGateError("E_IMPORT_LAYER", "importLayer: not object")

        assertExactKeys(imp, ["cells"], "E_IMPORT_LAYER", "importLayer")

        if (!Array.isArray(imp.cells))
            throw makeLoadGateError(
                "E_IMPORT_LAYER",
                "importLayer.cells: not array"
            )

        if (imp.cells.length !== cellsN) {
            throw makeLoadGateError(
                "E_IMPORT_LAYER",
                "importLayer.cells: length mismatch"
            )
        }

        for (let i = 0; i < imp.cells.length; i++) {
            const v = imp.cells[i]
            if (!isInt(v))
                throw makeLoadGateError(
                    "E_IMPORT_LAYER",
                    `importLayer.cells[${i}]: not int`
                )

            if (v === V2_CELL_NULL) continue
            if (v === V2_CELL_TRANSPARENT) continue

            assertIntInRange(
                v,
                0,
                swatches.length - 1,
                "E_IMPORT_LAYER",
                `importLayer.cells[${i}]`
            )
        }

        // strokeLayer (V2: swatchIndex может быть -2)
        const st = raw.strokeLayer
        if (!isPlainObject(st))
            throw makeLoadGateError("E_STROKE_LAYER", "strokeLayer: not object")

        assertExactKeys(st, ["cells"], "E_STROKE_LAYER", "strokeLayer")

        if (!Array.isArray(st.cells))
            throw makeLoadGateError(
                "E_STROKE_LAYER",
                "strokeLayer.cells: not array"
            )

        if (st.cells.length > cellsN)
            throw makeLoadGateError(
                "E_STROKE_LAYER",
                "strokeLayer.cells: too large"
            )

        for (let i = 0; i < st.cells.length; i++) {
            const cell = st.cells[i]
            if (!isPlainObject(cell))
                throw makeLoadGateError(
                    "E_STROKE_LAYER",
                    `strokeLayer.cells[${i}]: not object`
                )

            assertExactKeys(
                cell,
                ["cellIndex", "swatchIndex"],
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}]`
            )

            assertIntInRange(
                cell.cellIndex,
                0,
                cellsN - 1,
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}].cellIndex`
            )

            const si = cell.swatchIndex
            if (!isInt(si))
                throw makeLoadGateError(
                    "E_STROKE_LAYER",
                    `strokeLayer.cells[${i}].swatchIndex: not int`
                )

            if (si === V2_CELL_TRANSPARENT) continue

            assertIntInRange(
                si,
                0,
                swatches.length - 1,
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}].swatchIndex`
            )
        }

        // ref (тот же контракт, что V1)
        const ref = raw.ref
        if (ref !== null) {
            if (!isPlainObject(ref))
                throw makeLoadGateError("E_REF", "ref: not null/object")

            assertExactKeys(ref, ["w", "h", "ext", "b64"], "E_REF", "ref")

            if (ref.w !== 512 || ref.h !== 512) {
                throw makeLoadGateError("E_REF", "ref: invalid size")
            }
            if (ref.ext !== "rgba8") {
                throw makeLoadGateError("E_REF", "ref.ext: not allowed")
            }

            assertString(ref.b64, "E_REF", "ref.b64")

            const expectedLen = 512 * 512 * 4
            const decodedLen = base64DecodedLenOrThrow(
                ref.b64,
                "E_REF",
                "ref.b64"
            )
            if (decodedLen !== expectedLen) {
                throw makeLoadGateError(
                    "E_REF",
                    "ref.b64: decoded length mismatch"
                )
            }
        }

        return raw as ValidatedSnapshotV2
    }

    const lastValidatedSnapshotRef = React.useRef<ValidatedSnapshotV1 | null>(
        null
    )

    const lastValidatedSnapshotV2Ref = React.useRef<ValidatedSnapshotV2 | null>(
        null
    )

    // =====================
    // L1 — IMPORT TXN (NO-UI SIDE EFFECTS)
    // =====================

    type LoadNextState = {
        // то, что будем коммитить в L2 через applyProjectState(...)
        project: ProjectState

        // отдельная часть “реального проекта”: эталонный растр ref
        originalImageData: ImageData | null

        //paletteOrder: Array<{ id: string; isUser: boolean }>

        paletteOrderIds: string[]
    }

    // сюда L1 складывает результат (без setState)
    const nextLoadStateRef = React.useRef<LoadNextState | null>(null)

    const loadedCanonicalChecksumRef = React.useRef<string | null>(null)
    const loadedSnapshotVersionRef = React.useRef<1 | 2 | null>(null)

    const [postLoadCheckNonce, setPostLoadCheckNonce] = React.useState(0)

    const postLoadCheckNonceRef = React.useRef(0)

    // B2 restore-trigger nonce: нужен, чтобы один раз прогнать визуальный композит
    // после того, как isRestoringFromSaveRef.current станет false.
    const [restoreVisualNonce, setRestoreVisualNonce] = React.useState(0)

    React.useEffect(() => {
        postLoadCheckNonceRef.current = postLoadCheckNonce
    }, [postLoadCheckNonce])

    const isRestoringFromSaveRef = React.useRef(false)

    const skipNextRepixelizeAfterLoadRef = React.useRef(false)

    const loadTraceSeqRef = React.useRef(0)

    const paletteOrderRef = React.useRef<string[] | null>(null)

    function traceLoad(tag: string, meta?: any) {
        if (!ENABLE_LOAD_TRACE_LOGS) return
        const id = ++loadTraceSeqRef.current
        const t = nowMs().toFixed(1)
        try {
            console.log(`[LOAD][TRACE#${id} t=${t}] ${tag}`, meta ?? "")
        } catch {
            console.log(`[LOAD][TRACE#${id} t=${t}] ${tag}`)
        }
    }

    // =====================
    // SAVE/LOAD — S0 STRICT SNAPSHOT (NO-OP SAVE)
    // =====================

    // Единственный допустимый формат (v1)
    type ProjectSnapshotV1 = {
        magic: "PIXTUDIO"
        version: 1
        gridSize: number
        palette: {
            swatches: Array<{
                index: number
                id: string
                hex: string
                isTransparent: boolean
                isUser: boolean
            }>
            transparentIndex: number
        }
        importLayer: {
            cells: number[] // len = gridSize*gridSize, value = swatchIndex or -1
        }
        strokeLayer: {
            cells: Array<{ cellIndex: number; swatchIndex: number }>
        }
        ref: null | {
            w: 512
            h: 512
            ext: "rgba8"
            b64: string // base64 of raw RGBA bytes
        }
    }

    // sRGB hex normalize (без вычислений “умной палитры” — просто чтение)
    function toHexUpperSafe(css: string | null): string {
        const hx = (cssColorToHex(css) || "#FF0000").toUpperCase()
        return hx
    }

    function bytesToBase64(bytes: Uint8ClampedArray): string {
        // base64 encode без внешних зависимостей
        // (да, это проход по данным — но в S0 это допустимо, потому что ref.data обязателен)
        let bin = ""
        const chunk = 0x8000
        for (let i = 0; i < bytes.length; i += chunk) {
            const sub = bytes.subarray(i, i + chunk)
            let s = ""
            for (let j = 0; j < sub.length; j++)
                s += String.fromCharCode(sub[j])
            bin += s
        }
        return btoa(bin)
    }

    function buildProjectSnapshotV1(): ProjectSnapshotV1 {
        const g = gridSize

        // ---- palette: prefer loaded order if present ----
        const swatchById = new Map<string, Swatch>()
        for (const s of autoSwatches) swatchById.set(s.id, s)
        for (const s of userSwatches) swatchById.set(s.id, s)

        const base: Swatch[] = []
        const seen = new Set<string>()

        const order = paletteOrderRef.current
        const orderSet = order && order.length > 0 ? new Set(order) : null

        if (order && order.length > 0) {
            // 1) собираем в точном порядке из файла (и без дублей)
            for (const id of order) {
                if (!id || seen.has(id)) continue

                const sw = swatchById.get(id)
                if (sw) {
                    base.push(sw)
                    seen.add(id)
                    continue
                }

                // если в рантайме нет прозрачного свотча, но в файле он был
                if (id === "transparent") {
                    base.push({
                        id: "transparent",
                        color: "#000000",
                        isTransparent: true,
                        isUser: false,
                    })
                    seen.add(id)
                }
            }

            // 2) если в рантайме есть свотчи, которых нет в order — добавляем в конец (уникально)
            for (const sw of [...autoSwatches, ...userSwatches]) {
                if (!sw?.id) continue
                if (orderSet && orderSet.has(sw.id)) continue
                if (seen.has(sw.id)) continue
                base.push(sw)
                seen.add(sw.id)
            }
        } else {
            // дефолт: как раньше, но без дублей
            for (const sw of [...autoSwatches, ...userSwatches]) {
                if (!sw?.id) continue
                if (seen.has(sw.id)) continue
                base.push(sw)
                seen.add(sw.id)
            }
        }

        let transparentIndex = -1

        const swatches: ProjectSnapshotV1["palette"]["swatches"] = base.map(
            (sw, idx) => {
                if (transparentIndex < 0 && !!(sw as any)?.isTransparent) {
                    transparentIndex = idx
                }
                return {
                    index: idx,
                    id: sw.id,
                    hex: toHexUpperSafe(sw.color),
                    isTransparent: !!(sw as any)?.isTransparent,
                    isUser: !!(sw as any)?.isUser,
                }
            }
        )

        // если прозрачного свотча в runtime-палитре нет — добавляем синтетический в конец
        if (transparentIndex < 0) {
            transparentIndex = swatches.length
            swatches.push({
                index: transparentIndex,
                id: "transparent",
                hex: "#000000",
                isTransparent: true,
                isUser: false,
            })
        }

        const indexById = new Map<string, number>()
        for (const s of swatches) indexById.set(s.id, s.index)

        const mapPixelToSwatchIndex = (v: PixelValue): number => {
            if (v === null) return -1
            if (v === TRANSPARENT_PIXEL) return transparentIndex
            const idx = indexById.get(v)
            return typeof idx === "number" ? idx : -1
        }

        // ---- importLayer: full grid, flat ----
        const importCells: number[] = new Array(g * g)
        for (let r = 0; r < g; r++) {
            const row = imagePixels[r] || []
            for (let c = 0; c < g; c++) {
                importCells[r * g + c] = mapPixelToSwatchIndex(
                    (row[c] ?? null) as PixelValue
                )
            }
        }

        // ---- strokeLayer: sparse ----
        const strokeCells: Array<{ cellIndex: number; swatchIndex: number }> =
            []
        for (let r = 0; r < g; r++) {
            const row = overlayPixels[r] || []
            for (let c = 0; c < g; c++) {
                const v = (row[c] ?? null) as PixelValue
                if (v === null) continue
                const si = mapPixelToSwatchIndex(v)
                if (si < 0) continue
                strokeCells.push({ cellIndex: r * g + c, swatchIndex: si })
            }
        }

        // ---- ref: originalImageData (512x512 RGBA) or null ----
        let ref: ProjectSnapshotV1["ref"] = null
        if (
            originalImageData &&
            originalImageData.width === 512 &&
            originalImageData.height === 512
        ) {
            ref = {
                w: 512,
                h: 512,
                ext: "rgba8",
                b64: bytesToBase64(originalImageData.data),
            }
        }

        return {
            magic: "PIXTUDIO",
            version: 1,
            gridSize: g,
            palette: {
                swatches,
                transparentIndex,
            },
            importLayer: {
                cells: importCells,
            },
            strokeLayer: {
                cells: strokeCells,
            },
            ref,
        }
    }

    function buildProjectSnapshotV2(): ProjectSnapshotV2 {
        const g = gridSize

        // palette V2 — только цветовые свотчи
        const swatchById = new Map<string, Swatch>()
        for (const s of autoSwatches) swatchById.set(s.id, s)
        for (const s of userSwatches) swatchById.set(s.id, s)

        const swatches: ProjectSnapshotV2["palette"]["swatches"] = []
        let idx = 0
        for (const sw of [...autoSwatches, ...userSwatches]) {
            if (sw.isTransparent) continue
            swatches.push({
                index: idx++,
                id: sw.id,
                hex: toHexUpperSafe(sw.color),
                isUser: !!sw.isUser,
            })
        }

        const indexById = new Map(swatches.map((s) => [s.id, s.index]))

        const mapPixel = (v: PixelValue): number => {
            if (v === null) return -1
            if (v === TRANSPARENT_PIXEL) return -2
            return indexById.get(v) ?? -1
        }

        const importCells = new Array(g * g)
        for (let r = 0; r < g; r++) {
            for (let c = 0; c < g; c++) {
                importCells[r * g + c] = mapPixel(imagePixels[r][c])
            }
        }

        const strokeCells: Array<{ cellIndex: number; swatchIndex: number }> =
            []
        for (let r = 0; r < g; r++) {
            for (let c = 0; c < g; c++) {
                const v = overlayPixels[r][c]
                if (v == null) continue
                strokeCells.push({
                    cellIndex: r * g + c,
                    swatchIndex: mapPixel(v),
                })
            }
        }

        const hasAutoOverrides =
            autoOverrides && Object.keys(autoOverrides).length > 0

        return {
            magic: "PIXTUDIO",
            version: 2,
            gridSize: g,
            palette: { swatches },
            paletteCount: clampInt(paletteCount, PALETTE_MIN, PALETTE_MAX),
            importLayer: { cells: importCells },
            strokeLayer: { cells: strokeCells },
            autoOverrides: hasAutoOverrides ? autoOverrides : undefined,
            //paletteCount: pc,
            ref: originalImageData
                ? {
                      w: 512,
                      h: 512,
                      ext: "rgba8",
                      b64: bytesToBase64(originalImageData.data),
                  }
                : null,
        }
    }

    function downloadTextFile(params: {
        filename: string
        mime: string
        text: string
    }) {
        const blob = new Blob([params.text], { type: params.mime })
        const url = URL.createObjectURL(blob)

        const a = document.createElement("a")
        a.href = url
        a.download = params.filename
        document.body.appendChild(a)
        a.click()
        a.remove()

        // освобождаем URL
        setTimeout(() => URL.revokeObjectURL(url), 0)
    }

    function saveProjectFileViaDownload(params: {
        suggestedName: string
        mime: string
        jsonText: string
    }) {
        try {
            downloadTextFile({
                filename: params.suggestedName,
                mime: params.mime,
                text: params.jsonText,
            })
        } catch {
            // тихо
        }
    }

    async function saveProjectFileViaShare(params: {
        suggestedName: string
        mime: string
        jsonText: string
    }): Promise<boolean> {
        const nav: any =
            typeof navigator !== "undefined" ? (navigator as any) : null
        if (!nav || typeof nav.share !== "function") return false

        try {
            const blob = new Blob([params.jsonText], { type: params.mime })
            const file = new File([blob], params.suggestedName, {
                type: params.mime,
            })

            // Некоторые браузеры (особенно iOS) требуют canShare({files})
            if (typeof nav.canShare === "function") {
                const ok = nav.canShare({ files: [file] })
                if (!ok) return false
            }

            await nav.share({
                files: [file],
                title: "PIXTUDIO Project",
                text: "PIXTUDIO project file",
            })

            return true
        } catch (e: any) {
            // пользователь отменил / система отказала — тихо
            if (e?.name === "AbortError") return true
            return false
        }
    }

    async function saveProjectFile(params: {
        suggestedName: string
        mime: string
        jsonText: string
    }) {
        // Step 2: "Save As" через File System Access API (Chrome/Edge на Win/Android)
        const w: any = typeof window !== "undefined" ? (window as any) : null

        if (w && typeof w.showSaveFilePicker === "function") {
            try {
                const handle = await w.showSaveFilePicker({
                    suggestedName: params.suggestedName,
                    types: [
                        {
                            description: "PIXTUDIO Project",
                            accept: {
                                [params.mime]: [".pixtudio", ".json"],
                            },
                        },
                    ],
                })

                const writable = await handle.createWritable()
                await writable.write(
                    new Blob([params.jsonText], { type: params.mime })
                )
                await writable.close()
                return
            } catch (e: any) {
                // пользователь отменил / браузер запретил — тихо
                if (e?.name === "AbortError" || e?.name === "NotAllowedError")
                    return
                // любые прочие проблемы — тихо падаем в fallback
            }
        }

        // Step 4: iOS-friendly fallback — share sheet (Save to Files и др.)
        const shared = await saveProjectFileViaShare(params)
        if (shared) return

        // Fallback: обычная загрузка файла (как было)
        saveProjectFileViaDownload(params)
    }

    function clampInt(n: number, min: number, max: number) {
        return Math.min(max, Math.max(min, n))
    }

    function base64ToBytes(b64: string): Uint8ClampedArray {
        // L0 уже проверил формат и длину decoded bytes, здесь можно декодировать смело
        const bin = atob(b64)
        const out = new Uint8ClampedArray(bin.length)
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
        return out
    }

    function decodeRefToImageData(
        ref: ProjectSnapshotV1["ref"] | ProjectSnapshotV2["ref"]
    ): ImageData | null {
        if (!ref) return null
        // ref.ext строго "rgba8", ref.w/h строго 512 — L0 уже гарантировал
        const bytes = base64ToBytes(ref.b64)
        // ImageData ждёт Uint8ClampedArray
        return new ImageData(bytes, 512, 512)
    }

    function buildNextStateFromValidatedSnapshot(
        validated: ValidatedSnapshotV1
    ): LoadNextState {
        const g = validated.gridSize
        const cellsN = g * g
        const transparentIndex = validated.palette.transparentIndex

        // 0) палитровый порядок ровно как в файле (важно для checksum/слепка)
        const paletteOrderIds: string[] = validated.palette.swatches.map(
            (s) => s.id
        )

        // 1) palette ровно как в файле
        const allSwatches: Swatch[] = validated.palette.swatches
            .filter((s) => !s.isTransparent)
            .map((s) => ({
                id: s.id,
                color: s.hex,
                isTransparent: false,
                isUser: !!s.isUser,
            }))

        // runtime хранит два массива, но порядок внутри каждого сохраняем из файла
        const isTransparentSwatch = (s: Swatch) =>
            !!s.isTransparent || s.id === "transparent"

        const nextAutoSwatches = allSwatches.filter(
            (s) => !s.isUser && !isTransparentSwatch(s)
        )

        const nextUserSwatches = allSwatches.filter(
            (s) => s.isUser && !isTransparentSwatch(s)
        )

        // paletteCount (в файле его нет) — детерминированно от фактической палитры
        const nonTransparentCount = allSwatches.filter(
            (s) => !s.isTransparent
        ).length
        const nextPaletteCount = clampInt(
            nonTransparentCount || PALETTE_MIN,
            PALETTE_MIN,
            PALETTE_MAX
        )

        // 2) importLayer напрямую (без пайплайна)
        const imagePixelsNext: PixelValue[][] = createEmptyPixels(g)

        const idxToPixelValue = (swatchIndex: number): PixelValue => {
            if (swatchIndex < 0) return null
            if (swatchIndex === transparentIndex) return TRANSPARENT_PIXEL

            const swFile = validated.palette.swatches[swatchIndex]
            if (!swFile) return null
            if (swFile.isTransparent) return TRANSPARENT_PIXEL // safety

            return swFile.id as PixelValue
        }

        const imp = validated.importLayer.cells
        for (let i = 0; i < cellsN; i++) {
            const pv = idxToPixelValue(imp[i] as number)
            const r = Math.floor(i / g)
            const c = i - r * g
            imagePixelsNext[r][c] = pv
        }

        // 4) ref строго по формату
        const original = decodeRefToImageData(validated.ref)

        routeLog("L1 mapped importLayer.cells -> imagePixelsNext", {
            g,
            cellsN,
            imageNonNull: countNonNullCells(imagePixelsNext),
        })

        // 3) strokeLayer без вычислений (sparse -> grid)
        const overlayPixelsNext: PixelValue[][] = createEmptyPixels(g)

        routeLog("L1 built overlay + decoded ref", {
            overlayNonNull: countNonNullCells(overlayPixelsNext),
            hasRef: original != null,
        })

        const st = validated.strokeLayer.cells
        for (let i = 0; i < st.length; i++) {
            const cellIndex = st[i].cellIndex
            const swatchIndex = st[i].swatchIndex
            const r = Math.floor(cellIndex / g)
            const c = cellIndex - r * g
            if (r < 0 || c < 0 || r >= g || c >= g) continue
            overlayPixelsNext[r][c] = idxToPixelValue(swatchIndex)
        }

        // selectedSwatch: детерминированно — первый НЕ прозрачный в порядке файла
        const firstPaintable = allSwatches.find((s) => !s.isTransparent)?.id
        const selectedSwatchNext: SwatchId | "transparent" = firstPaintable
            ? firstPaintable
            : "transparent"

        // showImage/hasOriginalImageData: если ref есть — считаем импортный контекст восстановленным
        const hasOriginal = original != null

        const loadedAutoOverrides: AutoSwatchOverridesMap = {}

        const nextAutoEffective = applyAutoOverrides(
            nextAutoSwatches,
            loadedAutoOverrides // {}
        )

        const project: ProjectState = {
            gridSize: g,
            paletteCount: nextPaletteCount,
            imagePixels: imagePixelsNext,
            overlayPixels: overlayPixelsNext,
            showImage: hasOriginal ? true : false,
            hasOriginalImageData: hasOriginal,
            autoSwatches: nextAutoEffective,
            userSwatches: nextUserSwatches,
            selectedSwatch: selectedSwatchNext,
            autoOverrides: {}, // ← строго пусто
        }

        return {
            project,
            originalImageData: original,
            paletteOrderIds: paletteOrderIds,
        }
    }

    function buildNextStateFromValidatedSnapshotV2(
        validated: ValidatedSnapshotV2
    ): LoadNextState {
        const g = validated.gridSize
        const cellsN = g * g

        // 0) порядок палитры ровно как в файле (важно для будущего checksum/слепка)
        const paletteOrderIds: string[] = validated.palette.swatches.map(
            (s) => s.id
        )

        // 1) палитра V2: только цветовые свотчи (прозрачности здесь нет)
        const allSwatches: Swatch[] = validated.palette.swatches.map((s) => ({
            id: s.id,
            color: s.hex, // hex уже в файле
            isTransparent: false,
            isUser: !!s.isUser,
        }))

        // runtime хранит два массива, порядок внутри каждого сохраняем как в файле
        const nextAutoSwatches = allSwatches.filter((s) => !s.isUser)
        const nextUserSwatches = allSwatches.filter((s) => s.isUser)

        const pcFromFile =
            typeof (validated as any).paletteCount === "number"
                ? (validated as any).paletteCount
                : computePaletteCountFromSwatches(
                      nextAutoSwatches,
                      nextUserSwatches
                  )

        const pcActual = computePaletteCountFromSwatches(
            nextAutoSwatches,
            nextUserSwatches
        )

        // если файл просит pc, который не совпадает с реальным набором свотчей —
        // мы не можем “создать” цвета из воздуха, поэтому фиксируем реальность
        const nextPaletteCount =
            typeof (validated as any).paletteCount === "number"
                ? clampInt(
                      (validated as any).paletteCount,
                      PALETTE_MIN,
                      PALETTE_MAX
                  )
                : clampInt(
                      allSwatches.length || PALETTE_MIN,
                      PALETTE_MIN,
                      PALETTE_MAX
                  )

        // 2) importLayer: -2 => TRANSPARENT_PIXEL, -1 => null, >=0 => swatches[idx].id
        const imagePixelsNext: PixelValue[][] = createEmptyPixels(g)

        const idxToPixelValue = (cell: number): PixelValue => {
            if (cell === V2_CELL_NULL) return null
            if (cell === V2_CELL_TRANSPARENT) return TRANSPARENT_PIXEL
            if (cell < 0) return null
            const sw = validated.palette.swatches[cell]
            return sw ? (sw.id as PixelValue) : null
        }

        const imp = validated.importLayer.cells
        for (let i = 0; i < cellsN; i++) {
            const pv = idxToPixelValue(imp[i] as number)
            const r = Math.floor(i / g)
            const c = i - r * g
            imagePixelsNext[r][c] = pv
        }

        // 3) strokeLayer: sparse -> grid, swatchIndex может быть -2
        const overlayPixelsNext: PixelValue[][] = createEmptyPixels(g)
        const st = validated.strokeLayer.cells
        for (let i = 0; i < st.length; i++) {
            const cellIndex = st[i].cellIndex
            const swatchIndex = st[i].swatchIndex as number
            const r = Math.floor(cellIndex / g)
            const c = cellIndex - r * g
            if (r < 0 || c < 0 || r >= g || c >= g) continue
            overlayPixelsNext[r][c] = idxToPixelValue(swatchIndex)
        }

        // 4) ref (формат тот же, что V1)
        // decodeRefToImageData уже принимает ref с {w,h,ext,b64}; если тип узкий — см. патч T2-B ниже.
        const original = decodeRefToImageData(validated.ref as any)

        // selectedSwatch: первый цветовой (если нет — "transparent" как инструмент)
        const firstPaintable = allSwatches[0]?.id
        const selectedSwatchNext: SwatchId | "transparent" = firstPaintable
            ? (firstPaintable as SwatchId)
            : "transparent"

        const hasOriginal = original != null

        const loadedAutoOverrides: AutoSwatchOverridesMap =
            (validated as any).autoOverrides &&
            isPlainObject((validated as any).autoOverrides)
                ? ((validated as any).autoOverrides as AutoSwatchOverridesMap)
                : {}

        const nextAutoEffective = applyAutoOverrides(
            nextAutoSwatches,
            loadedAutoOverrides
        )

        const project: ProjectState = {
            gridSize: g,
            paletteCount: nextPaletteCount,
            imagePixels: imagePixelsNext,
            overlayPixels: overlayPixelsNext,
            showImage: hasOriginal ? true : false,
            hasOriginalImageData: hasOriginal,
            autoSwatches: nextAutoEffective,
            userSwatches: nextUserSwatches,
            selectedSwatch: selectedSwatchNext,
            autoOverrides: loadedAutoOverrides,
        }

        return {
            project,
            originalImageData: original,
            paletteOrderIds: paletteOrderIds,
        }
    }

    // =====================
    // P0 — Paint Snapshot (infra only, NO-OP)
    // =====================

    // =====================
    // INVARIANT — Overlay Snapshot (эталон слоя штрихов)
    // =====================
    // Эталон слоя штрихов (paintRefImageData / paintSnapshotNonceRef):
    // (paintSnapshotNonceRef сейчас используется как refNonce — версия эталона штрихов)
    // 1) ОБНОВЛЯЕТСЯ ТОЛЬКО при реальном рисовании (когда overlayPixels действительно изменились от ввода кистью).
    // 2) Изменение GRID SIZE / PALETTE SIZE НЕ ИМЕЕТ ПРАВА создавать/обновлять эталон слоя штрихов.
    // 3) Во время repixelize допускается переквантовывать overlay ИЗ последнего эталона,
    //    но нельзя “переснимать” эталон из уже переквантованного overlayPixels — это приводит к деградации.

    // P0.1 — Paint Reference (эталон слоя штрихов; пока NO-OP)
    // Будет обновляться только при реальном рисовании (в следующих шагах).
    const [paintRefImageData, setPaintRefImageData] =
        React.useState<ImageData | null>(null)

    // Nonce для защиты/ключей в следующих шагах (пока нигде не используется)
    const paintSnapshotNonceRef = React.useRef(0)

    // P0.2 — Overlay dirty flag (пока NO-OP)
    // true => были реальные изменения overlay от кисти со времени последнего обновления эталона.
    const overlayDirtyRef = React.useRef(false)

    // =====================
    // P2.5 — QC helpers (logs only)
    // =====================

    const p25LastKeyRef = React.useRef<string | null>(null)

    // =====================
    // P3 — SKIP guard (anti "silent re-apply")
    // =====================
    const p3LastProcessedKeyRef = React.useRef<string | null>(null)
    const p3InFlightKeyRef = React.useRef<string | null>(null)

    function fnv1a32_u32(str: string): number {
        let h = 0x811c9dc5
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i)
            h = Math.imul(h, 0x01000193)
        }
        return h >>> 0
    }

    function hashSwatchesForQC(swatches: Swatch[]): string {
        // стабильно: id + hex(color) + flags
        let s = ""
        for (const sw of swatches) {
            const hx = (cssColorToHex(sw.color) || "").toUpperCase()
            s += `${sw.id}:${hx}:${sw.isTransparent ? 1 : 0}:${sw.isUser ? 1 : 0};`
        }
        return fnv1a32_u32(s).toString(16).padStart(8, "0")
    }

    function countNonNull(pixels: PixelValue[][]): number {
        let n = 0
        for (let r = 0; r < pixels.length; r++) {
            const row = pixels[r] || []
            for (let c = 0; c < row.length; c++) {
                const v = row[c] ?? null
                if (v !== null) n++
            }
        }
        return n
    }

    function qcLogP2(params: {
        phase: "BEGIN" | "END" | "WARN"
        gridSize: number
        paletteCount: number
        autoSwatches: Swatch[]
        userSwatches: Swatch[]
        overlay?: PixelValue[][]
        note?: string
    }) {
        if (!ENABLE_PREP_LOGS) return

        const autoH = hashSwatchesForQC(params.autoSwatches)
        const userH = hashSwatchesForQC(params.userSwatches)
        const key = `g=${params.gridSize}|p=${params.paletteCount}|a=${autoH}|u=${userH}|ref=${paintSnapshotNonceRef.current}`

        const prev = p25LastKeyRef.current
        if (params.phase === "BEGIN") {
            p25LastKeyRef.current = key
        }

        let extra = ""
        if (params.overlay) {
            const h = params.overlay.length
            const w = h > 0 ? (params.overlay[0]?.length ?? 0) : 0
            const nn = countNonNull(params.overlay)
            extra = ` overlay=${h}x${w} nn=${nn}`
            if (h !== params.gridSize || w !== params.gridSize) {
                console.warn(
                    `[P2.5][WARN] overlay size mismatch expected=${params.gridSize} got=${h}x${w} key=${key}`
                )
            }
        }

        const note = params.note ? ` note=${params.note}` : ""
        if (ENABLE_PREP_LOGS) {
            console.log(`[P2.5][${params.phase}] key=${key}${extra}${note}`)
        }
    }

    function p3BuildRequantizeKey(params: {
        gridSize: number
        paletteCount: number
        autoSwatches: Swatch[]
        userSwatches: Swatch[]
        refNonce: number
    }): string {
        const autoH = hashSwatchesForQC(params.autoSwatches)
        const userH = hashSwatchesForQC(params.userSwatches)
        return `g=${params.gridSize}|p=${params.paletteCount}|a=${autoH}|u=${userH}|ref=${params.refNonce}`
    }

    function commitPaintRefIfDirty(reason: string) {
        if (!overlayDirtyRef.current) return

        // Снимаем эталон ОДИН РАЗ на завершение штриха
        const snap = renderPaintGridToImageData({
            paintGrid: overlayPixels,
            autoSwatches,
            userSwatches,
        })

        setPaintRefImageData(snap)
        paintSnapshotNonceRef.current += 1
        overlayDirtyRef.current = false

        if (ENABLE_PREP_LOGS) {
            console.log(
                `[PAINT_REF][UPDATE] refNonce=${paintSnapshotNonceRef.current} reason=${reason}`
            )
        }
    }

    function syncPaintRefToOverlay(params: {
        overlay: PixelValue[][]
        auto: Swatch[]
        user: Swatch[]
        autoOverrides: Record<string, any>
        reason: string
    }) {
        const { overlay, auto, user, autoOverrides, reason } = params

        // используем те же “effective auto”, которые реально в UI/логике
        const autoEffective = applyAutoOverrides(auto, autoOverrides)

        // если overlay пустой — эталон должен быть null (иначе он “воскресит прошлое”)
        const nn = countNonNull(overlay)
        if (nn === 0) {
            setPaintRefImageData(null)
            overlayDirtyRef.current = false
            if (ENABLE_PREP_LOGS) {
                console.log(`[PAINT_REF][SYNC] reason=${reason} -> null`)
            }
            return
        }

        const snap = renderPaintGridToImageData({
            paintGrid: overlay,
            autoSwatches: autoEffective,
            userSwatches: user,
        })

        setPaintRefImageData(snap)
        overlayDirtyRef.current = false

        if (ENABLE_PREP_LOGS) {
            console.log(`[PAINT_REF][SYNC] reason=${reason} nn=${nn}`)
        }
    }

    // =====================
    // P1 — Paint Reference helpers (render + requantize)
    // =====================

    function buildSwatchByIdMap(
        autoSwatches: Swatch[],
        userSwatches: Swatch[]
    ) {
        const m = new Map<string, Swatch>()
        for (const s of autoSwatches) m.set(s.id, s)
        for (const s of userSwatches) m.set(s.id, s)
        return m
    }

    // "Фотография" overlayPixels: 512x512, прозрачный фон, закраска свотчами
    function renderPaintGridToImageData(params: {
        paintGrid: PixelValue[][]
        autoSwatches: Swatch[]
        userSwatches: Swatch[]
    }): ImageData {
        const { paintGrid, autoSwatches, userSwatches } = params

        const rows = paintGrid?.length ?? 0
        const cols = rows > 0 ? (paintGrid[0]?.length ?? 0) : 0

        // Всегда возвращаем 512x512, даже если сетка пустая (прозрачная)
        const canvas =
            offscreenRef.current ||
            (offscreenRef.current = document.createElement("canvas"))
        canvas.width = CANVAS_SIZE
        canvas.height = CANVAS_SIZE

        const ctx = canvas.getContext("2d")
        if (!ctx) {
            return new ImageData(CANVAS_SIZE, CANVAS_SIZE)
        }

        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

        if (rows <= 0 || cols <= 0) {
            return ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)
        }

        const swatchById = buildSwatchByIdMap(autoSwatches, userSwatches)

        for (let r = 0; r < rows; r++) {
            const y0 = Math.floor((r * CANVAS_SIZE) / rows)
            const y1 = Math.floor(((r + 1) * CANVAS_SIZE) / rows)
            const row = paintGrid[r] || []

            for (let c = 0; c < cols; c++) {
                const x0 = Math.floor((c * CANVAS_SIZE) / cols)
                const x1 = Math.floor(((c + 1) * CANVAS_SIZE) / cols)

                const v = (row[c] ?? null) as PixelValue

                // null / TRANSPARENT_PIXEL => просто оставляем прозрачным
                if (v === null) continue
                if (v === TRANSPARENT_PIXEL) continue

                // v — это SwatchId
                const sw = swatchById.get(v)
                if (!sw) continue
                if ((sw as any).isTransparent) continue

                ctx.fillStyle = sw.color
                ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0))
            }
        }

        return ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    }

    // =====================
    // P2 — Paint Snapshot requantize helpers
    // =====================

    function toHexUpperOrNull(css: string | null): string | null {
        if (!css) return null
        const hx = (cssColorToHex(css) || "").toUpperCase()
        return hx || null
    }

    function buildFixedPaletteHexAndIdMap(params: {
        baseAuto: Swatch[]
        user: Swatch[]
    }): { paletteHex: string[]; idByHex: Map<string, SwatchId> } {
        const { baseAuto, user } = params

        const paletteHex: string[] = []
        const idByHex = new Map<string, SwatchId>()

        const add = (sw: Swatch) => {
            if ((sw as any)?.isTransparent) return
            const hx = toHexUpperOrNull(sw.color)
            if (!hx) return
            // сохраняем порядок, но схлопываем дубликаты по hex
            if (!idByHex.has(hx)) {
                paletteHex.push(hx)
                idByHex.set(hx, sw.id)
            }
        }

        for (const s of baseAuto) add(s)
        for (const s of user) add(s)

        return { paletteHex, idByHex }
    }

    function requantizePaintSnapshotToOverlayPixels(params: {
        snapshot: ImageData
        gridSize: number
        baseAuto: Swatch[]
        user: Swatch[]
    }): PixelValue[][] {
        const { snapshot, gridSize, baseAuto, user } = params

        // 1) pixelize snapshot -> rgb-grid
        const snapPixels = pixelizeFromImageDominant(snapshot, gridSize, 16)

        // 2) fixed palette = baseAuto + userSwatches (без прозрачных)
        const { paletteHex, idByHex } = buildFixedPaletteHexAndIdMap({
            baseAuto,
            user,
        })

        // safety: если палитра вдруг пустая — возвращаем прозрачный overlay
        if (paletteHex.length === 0) {
            return createEmptyPixels(gridSize)
        }

        // 3) quantize rgb-grid to fixed palette
        const q = quantizeToFixedPalette(snapPixels, paletteHex)

        // 4) map rgb -> SwatchId (через hex), null остаётся null
        const out: PixelValue[][] = Array.from({ length: gridSize }, () =>
            Array.from({ length: gridSize }, () => null as PixelValue)
        )

        for (let r = 0; r < gridSize; r++) {
            const row = q[r] || []
            const outRow = out[r]
            for (let c = 0; c < gridSize; c++) {
                const col = row[c] ?? null
                if (col == null) {
                    outRow[c] = null
                    continue
                }
                const hx = toHexUpperOrNull(col)
                if (!hx) {
                    outRow[c] = null
                    continue
                }
                const id = idByHex.get(hx)
                outRow[c] = (id ?? "auto-0") as PixelValue
            }
        }

        return out
    }

    function applyOverlayAfterBaseRebuild(params: {
        imagePixelsNext: PixelValue[][]
        nextAuto: Swatch[]
        // snapshotMode: если есть snapshot — пересчитываем overlay из snapshot
        // иначе — АВАРИЙНЫЙ legacy resize (строго с warn)
        hasSnap: boolean
        snapshot: ImageData | null

        // кто вызвал (чтобы ловить “как мы сюда попали”)
        reason: string
    }) {
        const { imagePixelsNext, nextAuto, hasSnap, snapshot, reason } = params

        // Step 4: источник overlay-переквантования — ТОЛЬКО эталон paintRefImageData, если он есть.
        // Источник переквантования overlay — только paintRefImageData. GRID SIZE / PALETTE SIZE не создают эталон. Эталон обновляется только по завершению рисования.
        const refSnap = paintRefImageData ?? null
        const snapToUse = refSnap ?? snapshot
        const hasSnapToUse = snapToUse != null

        if (hasSnapToUse && snapToUse) {
            const overlayNext = requantizePaintSnapshotToOverlayPixels({
                snapshot: snapToUse,
                gridSize,
                baseAuto: nextAuto,
                user: userSwatches,
            })

            if (ENABLE_PREP_LOGS) {
                qcLogP2({
                    phase: "END",
                    gridSize,
                    paletteCount,
                    autoSwatches: nextAuto,
                    userSwatches,
                    overlay: overlayNext,
                    note: "after-overlay",
                })
            }

            setOverlayPixels(overlayNext)

            postCommitGridHook(
                {
                    imagePixels: imagePixelsNext,
                    overlayPixels: overlayNext,
                    autoSwatches: nextAuto,
                    userSwatches,
                },
                "import-or-repixelize"
            )
        } else {
            // ==========================
            // EMERGENCY PATH: legacy resize fallback
            // ==========================
            const key = `reason=${reason}|g=${gridSize}|hasSnap=${hasSnap ? 1 : 0}|hasSnapshot=${snapshot ? 1 : 0}|snapNonce=${paintSnapshotNonceRef.current}`

            if (overlayLegacyFallbackWarnKeyRef.current !== key) {
                overlayLegacyFallbackWarnKeyRef.current = key

                // ВАЖНО: warn НЕ под ENABLE_PREP_LOGS — это не должно быть “тихо”
                if (ENABLE_OVERLAY_FALLBACK_LOGS) {
                    console.warn(
                        "[OVERLAY][LEGACY_RESIZE_FALLBACK]",
                        reason,
                        ":: This path should be emergency-only."
                    )
                }
            }

            if (!ENABLE_OVERLAY_LEGACY_RESIZE_FALLBACK) {
                // жёсткий режим (если захочешь): вместо “плохого” ресайза — чистим слой
                setOverlayPixels(createEmptyPixels(gridSize))

                postCommitGridHook(
                    {
                        imagePixels: imagePixelsNext,
                        overlayPixels: createEmptyPixels(gridSize),
                        autoSwatches: nextAuto,
                        userSwatches,
                    },
                    "import-or-repixelize"
                )
                return
            }

            setOverlayPixels((prev) => {
                const overlayNext = resizePixels(prev, gridSize)

                postCommitGridHook(
                    {
                        imagePixels: imagePixelsNext,
                        overlayPixels: overlayNext,
                        autoSwatches: nextAuto,
                        userSwatches,
                    },
                    "import-or-repixelize"
                )

                return overlayNext
            })
        }
    }

    // =====================
    // OVERLAY — legacy resize fallback (EMERGENCY ONLY)
    // =====================

    const ENABLE_OVERLAY_LEGACY_RESIZE_FALLBACK = false

    // warn-once (чтобы не спамить, но не дать “тихого” поведения)
    const overlayLegacyFallbackWarnKeyRef = React.useRef<string | null>(null)

    // =====================
    // B1 — единый холст (пока “мягкая миграция”: source-of-truth для РЕНДЕРА)
    // =====================
    const [canvasPixels, setCanvasPixels] = React.useState<PixelValue[][]>(() =>
        createEmptyPixels(gridSize)
    )

    // ROUTE B: overlay -> canvas gateway probe
    React.useEffect(() => {
        routeLog("B OVERLAY->CANVAS PROBE (overlayPixels changed)", {
            g: gridSize,
            overlayNonNull: countNonNullCells(overlayPixels),
            canvasNonNull: countNonNullCells(canvasPixels),
        })
    }, [overlayPixels])

    // B2 disabled: replaced by B1-SYNC (legacy behavior)

    function getVisualPixel(r: number, c: number): PixelValue {
        const ov = overlayPixels?.[r]?.[c] ?? null
        if (ov !== null) return ov
        return (imagePixels?.[r]?.[c] ?? null) as PixelValue
    }

    function composeVisualGrid(): PixelValue[][] | null {
        const g = gridSize

        // ✅ ВАЖНО: при рассинхроне НЕ возвращаем пустоту (шахматку),
        // а возвращаем null => "не обновлять витрину"
        if (!Array.isArray(overlayPixels) || overlayPixels.length !== g) {
            return null
        }
        if (!Array.isArray(imagePixels) || imagePixels.length !== g) {
            return null
        }

        const out: PixelValue[][] = createEmptyPixels(g)

        for (let r = 0; r < g; r++) {
            for (let c = 0; c < g; c++) {
                out[r][c] = getVisualPixel(r, c)
            }
        }

        return out
    }

    function overlayOverBaseGrid(
        base: PixelValue[][],
        overlay: PixelValue[][]
    ): PixelValue[][] {
        const g = base?.length ?? 0
        if (g <= 0) return base

        const out: PixelValue[][] = createEmptyPixels(g)

        for (let r = 0; r < g; r++) {
            const baseRow = base[r] || []
            const ovRow = overlay?.[r] || []
            const outRow = out[r]

            for (let c = 0; c < g; c++) {
                const ov = (ovRow[c] ?? null) as PixelValue
                outRow[c] =
                    ov !== null ? ov : ((baseRow[c] ?? null) as PixelValue)
            }
        }

        return out
    }

        const liveGridPreviewOwnerRef = React.useRef(false)

    function publishCanvasFrameAtomic(params: {
        base: PixelValue[][]
        overlay: PixelValue[][]
    }) {
        const { base, overlay } = params

        const baseSize = base?.length ?? 0
        const overlaySize = overlay?.length ?? 0

        if (baseSize <= 0) return
        if (overlaySize !== baseSize) return

        const finalFrame = overlayOverBaseGrid(base, overlay)
        setCanvasPixels(finalFrame)
    }

    // B1-SYNC (legacy behavior):
    // canvasPixels = visual composite (overlay over base) всегда, когда меняются слои или gridSize.
    // Это устраняет гонку "repixelize перетёр витрину —> штрихи пропали до следующего overlay-change".
    useIsomorphicLayoutEffect(() => {
        // во время restore можно либо разрешить sync (как в legacy),
        // либо запретить и ждать restoreVisualNonce.
        // Я делаю мягко: во время restore не трогаем, но сразу после restore будет прогон.
        if (isRestoringFromSaveRef.current) return

        // ✅ После Load не делаем repixelize автоматически (это проверяется в repixelizeEffect).
        // Но витрину (canvasPixels) мы обязаны синхронизировать сразу, поэтому здесь НЕ return.
        if (skipNextRepixelizeAfterLoadRef.current) {
            skipNextRepixelizeAfterLoadRef.current = false
            // НЕ return!
        }
        if (p3InFlightKeyRef.current) return

        if (liveGridPreviewOwnerRef.current) {
            routeLog("B1-SYNC SKIP (live GRID preview owns canvasPixels)", {
                g: gridSize,
            })
            return
        }

        const next = composeVisualGrid()
        if (next == null) {
            // слои ещё не готовы под текущий gridSize — витрину не трогаем
            routeLog("B1-SYNC SKIP (layers not synced to gridSize yet)", {
                g: gridSize,
                imgH: imagePixels?.length ?? 0,
                ovH: overlayPixels?.length ?? 0,
            })
            return
        }

        setCanvasPixels(next)

        routeLog("B1-SYNC canvasPixels = composeVisualGrid()", {
            g: gridSize,
            imageNonNull: countNonNullCells(imagePixels),
            overlayNonNull: countNonNullCells(overlayPixels),
            canvasNonNullNext: countNonNullCells(next),
        })
    }, [gridSize, imagePixels, overlayPixels, restoreVisualNonce])

    const [originalImageData, setOriginalImageData] =
        React.useState<ImageData | null>(initialImageData)
    const [showImage, setShowImage] = React.useState(startWithImageVisible)

    // Импортный контекст редактора (НЕ равен originalImageData != null).
    // Нужен, чтобы undo/redo и grid-policy были детерминированными.
    const [hasImportContext, setHasImportContext] = React.useState<boolean>(
        initialImageData != null
    )

    // =====================
    // GRID POLICY (A0: infra only, NO-OP)
    // =====================

    // По умолчанию сетка НЕ подавлена (вся сессия видна, пока не будет импорта)
    const [gridSuppressedByImport, setGridSuppressedByImport] =
        React.useState(false)

    type GridMode = "AUTO_ON" | "FORCED_OFF_BY_IMPORT"

    // G0: новый источник истины для рендера сетки (пока 1:1 повторяет старую логику)
    const [gridMode, setGridMode] = React.useState<GridMode>("AUTO_ON")

    // showGrid вычисляем ТОЛЬКО из gridMode
    const showGrid = gridMode === "AUTO_ON"

    function setGridSuppressed(next: boolean, reason: string) {
        // старое поведение сохраняем как было
        setGridSuppressedByImport((prev) => {
            if (prev === next) return prev
            if (ENABLE_PREP_LOGS) {
                console.log(`[GRID] suppressed = ${next} reason=${reason}`)
            }
            return next
        })

        setGridMode(next ? "FORCED_OFF_BY_IMPORT" : "AUTO_ON")
    }

    React.useEffect(() => {
        setGridMode(gridSuppressedByImport ? "FORCED_OFF_BY_IMPORT" : "AUTO_ON")
    }, [gridSuppressedByImport])

    React.useEffect(() => {
        if (ENABLE_PREP_LOGS) {
            console.log(
                `[GRID] suppressed = ${gridSuppressedByImport} reason=mount`
            )
        }
    }, [])

    // true, если цвет можно считать белым (#FFF) в любой форме (hex/rgb/hsl)
    function isCssWhite(color: string | null): boolean {
        if (!color) return false

        const raw = color.trim().toLowerCase()

        // быстрые хиты без парсинга
        if (raw === "white") return true
        if (raw === "#fff") return true
        if (raw === "#ffffff") return true

        const hx = (cssColorToHex(color) || "").toUpperCase()
        return hx === "#FFFFFF"
    }

    // Чистая проверка: все ячейки white (#fff) и/или transparent.
    function isCanvasBlankWhiteOrTransparent(params: {
        imagePixels: PixelValue[][]
        overlayPixels: PixelValue[][]
        autoSwatches: Swatch[]
        userSwatches: Swatch[]
    }): boolean {
        const { imagePixels, overlayPixels, autoSwatches, userSwatches } =
            params

        const swatchById = new Map<string, Swatch>()
        for (const s of autoSwatches) swatchById.set(s.id, s)
        for (const s of userSwatches) swatchById.set(s.id, s)

        const h = Math.max(imagePixels?.length || 0, overlayPixels?.length || 0)
        if (h === 0) return true

        for (let r = 0; r < h; r++) {
            const rowImg = imagePixels?.[r] || []
            const rowOv = overlayPixels?.[r] || []

            const w = Math.max(rowImg.length || 0, rowOv.length || 0)
            for (let c = 0; c < w; c++) {
                // Визуальный пиксель: overlay имеет приоритет, если не null
                const ov = (rowOv[c] ?? null) as PixelValue
                const base = (rowImg[c] ?? null) as PixelValue
                const v: PixelValue = ov !== null ? ov : base

                // transparent семантика
                if (v === null) continue
                if (v === TRANSPARENT_PIXEL) continue

                // v — это SwatchId
                const sw = swatchById.get(v)
                if (!sw) {
                    // неизвестный id — считаем "не пусто", чтобы не включить сетку ошибочно
                    return false
                }

                if ((sw as any).isTransparent) continue

                // белый = #FFFFFF
                if (isCssWhite(sw.color)) continue

                // любой другой цвет => холст НЕ "пустой/белый"
                return false
            }
        }

        return true
    }

    // --------------------
    // GRID POLICY (G2 helper) — auto-enable on blank (NO-OFF side effects)
    // --------------------
    function enforceGridRuleAfterRestore(
        snapshot: {
            imagePixels: PixelValue[][]
            overlayPixels: PixelValue[][]
            autoSwatches: Swatch[]
            userSwatches: Swatch[]
            hasOriginalImageData: boolean
        },
        reason: string
    ) {
        // 1) all-white / transparent => сетка ON
        const blank = isCanvasBlankWhiteOrTransparent({
            imagePixels: snapshot.imagePixels,
            overlayPixels: snapshot.overlayPixels,
            autoSwatches: snapshot.autoSwatches,
            userSwatches: snapshot.userSwatches,
        })

        if (blank) {
            setGridSuppressed(false, reason + ":blank")
            return
        }

        // 2) не blank + импортный контекст => сетка OFF
        if (snapshot.hasOriginalImageData) {
            setGridSuppressed(true, reason + ":import")
            return
        }

        // 3) иначе — не трогаем (сетка остаётся как есть)
    }

    function autoEnableGridIfBlank(
        state: {
            imagePixels: PixelValue[][]
            overlayPixels: PixelValue[][]
            autoSwatches: Swatch[]
            userSwatches: Swatch[]
        },
        reason: string
    ) {
        try {
            const blank = isCanvasBlankWhiteOrTransparent({
                imagePixels: state.imagePixels,
                overlayPixels: state.overlayPixels,
                autoSwatches: state.autoSwatches,
                userSwatches: state.userSwatches,
            })
            if (blank) {
                setGridSuppressed(false, reason)
            }
        } catch {}
    }

    // --------------------
    // GRID POLICY (G2.5) — post-commit hook (snapshot-based)
    // --------------------
    function postCommitGridHook(
        after: {
            imagePixels: PixelValue[][]
            overlayPixels: PixelValue[][]
            autoSwatches: Swatch[]
            userSwatches: Swatch[]
        },
        reason: string
    ) {
        // хук имеет смысл только если сетка сейчас подавлена импортом
        if (!gridSuppressedByImport) return

        autoEnableGridIfBlank(
            {
                imagePixels: after.imagePixels,
                overlayPixels: after.overlayPixels,
                autoSwatches: after.autoSwatches,
                userSwatches: after.userSwatches,
            },
            reason
        )
    }

    // --------------------
    // GRID POLICY (G3-proxy, but minimal fix): suppress grid on import event
    // --------------------
    const lastImportedImageRef = React.useRef<ImageData | null>(null)

    React.useEffect(() => {
        if (!initialImageData) return

        // если пришёл новый ImageData (импорт)
        if (lastImportedImageRef.current !== initialImageData) {
            lastImportedImageRef.current = initialImageData

            // импорт = единственный выключатель сетки
            setGridSuppressed(true, "import-initialImageData")
        }
    }, [initialImageData])

    // ✅ Авто-свотчи (квантование/дефолт) + пользовательские (не трогаются при изменениях paletteCount)
    const [autoSwatches, setAutoSwatches] = React.useState<Swatch[]>(() =>
        generatePalette(16).map((c, i) => ({
            id: `auto-${i}`,
            color: c,
            isTransparent: false,
            isUser: false,
        }))
    )
    const [userSwatches, setUserSwatches] = React.useState<Swatch[]>([])

    const paletteCountActual = computePaletteCountFromSwatches(
        autoSwatches,
        userSwatches
    )

    React.useEffect(() => {
        const reason = pendingBlankCheckReasonRef.current
        if (!reason) return

        // S4: во время STREAM никаких grid-мутаций (setGridSuppressed и т.п.)
        if (busyKindRef.current === "stream") {
            pendingRef.current.gridPolicyBlankCheck = true
            return
        }

        // сбрасываем сразу, чтобы не зациклиться
        pendingBlankCheckReasonRef.current = null

        autoEnableGridIfBlank(
            { imagePixels, overlayPixels, autoSwatches, userSwatches },
            reason
        )
    }, [imagePixels, overlayPixels, autoSwatches, userSwatches])

    // ✅ Активный свотч: по ID, либо "transparent" (инструмент стирания)
    const [selectedSwatch, setSelectedSwatch] = React.useState<
        SwatchId | "transparent"
    >("auto-0")

    const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
    const offscreenRef = React.useRef<HTMLCanvasElement | null>(null)
    //const fileInputRef = React.useRef<HTMLInputElement | null>(null)
    const cameraInputRef = React.useRef<HTMLInputElement | null>(null)
    const [isDrawing, setIsDrawing] = React.useState(false)
    const [brushSize, setBrushSize] = React.useState<number>(3)
    const viewportRef = React.useRef<HTMLDivElement | null>(null)

    const [viewportSize, setViewportSize] = React.useState({ w: 0, h: 0 })

    React.useLayoutEffect(() => {
        const el = viewportRef.current
        if (!el) return

        const apply = () => {
            const r = el.getBoundingClientRect()
            const w = Math.round(r.width)
            const h = Math.round(r.height)
            setViewportSize({ w, h })
        }

        apply()

        const ro = new ResizeObserver(() => apply())
        ro.observe(el)

        return () => ro.disconnect()
    }, [])

    const loadFileInputRef = React.useRef<HTMLInputElement | null>(null)

    // =====================
    // UNDO / REDO (Step 1: infra only, no UI changes)
    // =====================

    type ProjectState = {
        // grid
        gridSize: number
        paletteCount: number

        // canvas layers (indices into palette)
        imagePixels: PixelValue[][]
        overlayPixels: PixelValue[][]

        // visibility
        showImage: boolean

        hasOriginalImageData: boolean

        // palette
        autoSwatches: Swatch[]
        userSwatches: Swatch[]

        // selection
        selectedSwatch: SwatchId | "transparent"

        // auto-swatches overrides (diff-only, Step 1 infra)
        autoOverrides: AutoSwatchOverridesMap
    }

    type AutoSwatchOverride = {
        // если поле отсутствует — значит "не переопределяем"
        hex?: string
        isTransparent?: boolean
    }

    type AutoSwatchOverridesMap = Record<string, AutoSwatchOverride>

    // NO-OP helpers (Step 1): НЕ вызываем в repixelize пока.
    function applyAutoOverrides(
        nextAuto: Swatch[],
        overrides: AutoSwatchOverridesMap
    ): Swatch[] {
        if (!overrides) return nextAuto
        if (!Array.isArray(nextAuto) || nextAuto.length === 0) return nextAuto

        // возвращаем новый массив, но только если реально есть что применять
        let changed = false
        const out = nextAuto.map((sw) => {
            if (!sw?.id || !sw.id.startsWith("auto-")) return sw
            const ov = overrides[sw.id]
            if (!ov) return sw

            const next: Swatch = { ...sw }
            if (typeof ov.hex === "string" && ov.hex) {
                // sw.color хранится как CSS-цвет (обычно #RRGGBB или rgb(...)).
                next.color = ov.hex
                changed = true
            }
            if (typeof ov.isTransparent === "boolean") {
                next.isTransparent = ov.isTransparent
                changed = true
            }
            return next
        })

        return changed ? out : nextAuto
    }

    // ВАЖНО: prune вызываем ТОЛЬКО НА COMMIT (не в preview/drag).
    function pruneAutoOverridesForCurrentAuto(
        currentAuto: Swatch[],
        overrides: AutoSwatchOverridesMap
    ): AutoSwatchOverridesMap {
        if (!overrides) return {}
        const keep = new Set<string>()
        for (const sw of currentAuto || []) {
            if (sw?.id && sw.id.startsWith("auto-")) keep.add(sw.id)
        }

        const out: AutoSwatchOverridesMap = {}
        for (const k of Object.keys(overrides)) {
            if (!k.startsWith("auto-")) continue
            if (!keep.has(k)) continue
            const v = overrides[k]
            if (!v) continue
            // сохраняем только реальные diff-поля
            const hasHex = typeof v.hex === "string" && v.hex.length > 0
            const hasTr = typeof v.isTransparent === "boolean"
            if (!hasHex && !hasTr) continue
            out[k] = {
                ...(hasHex ? { hex: v.hex } : null),
                ...(hasTr ? { isTransparent: v.isTransparent } : null),
            } as any
        }
        return out
    }

    const MAX_HISTORY = 50

    const pastRef = React.useRef<ProjectState[]>([])
    const futureRef = React.useRef<ProjectState[]>([])
    const pendingBlankCheckReasonRef = React.useRef<string | null>(null)
    const isRestoringHistoryRef = React.useRef(false)

    const [canUndo, setCanUndo] = React.useState(false)
    const [canRedo, setCanRedo] = React.useState(false)

    function syncHistoryFlags() {
        setCanUndo(pastRef.current.length > 0)
        setCanRedo(futureRef.current.length > 0)
    }

    function clonePixelsGrid(src: PixelValue[][]): PixelValue[][] {
        return src.map((row) => row.slice())
    }

    function cloneSwatches(src: Swatch[]): Swatch[] {
        return src.map((s) => ({ ...s }))
    }

    function makeProjectState(): ProjectState {
        return {
            gridSize,
            paletteCount,
            imagePixels: clonePixelsGrid(imagePixels),
            overlayPixels: clonePixelsGrid(overlayPixels),
            showImage,

            autoSwatches: cloneSwatches(autoSwatches),
            userSwatches: cloneSwatches(userSwatches),
            selectedSwatch,
            hasOriginalImageData: hasImportContext,

            autoOverrides: { ...autoOverrides },
        }
    }

    pendingBlankCheckReasonRef.current = null

    function applyProjectState(state: ProjectState) {
        isRestoringHistoryRef.current = true
        setGridSize(state.gridSize)
        setPaletteCount(state.paletteCount)
        setHasImportContext(state.hasOriginalImageData)

        setImagePixels(clonePixelsGrid(state.imagePixels))
        setOverlayPixels(clonePixelsGrid(state.overlayPixels))

        setOverlayPixels(state.overlayPixels)

        // ✅ Шаг 6: Undo/Redo/restore должны обновлять эталон,
        // иначе GRID SIZE “воскресит” старые штрихи из прошлого эталона.
        syncPaintRefToOverlay({
            overlay: state.overlayPixels,
            auto: state.autoSwatches,
            user: state.userSwatches,
            autoOverrides: state.autoOverrides,
            reason: "applyProjectState",
        })

        setShowImage(state.showImage)

        // ВАЖНО: восстанавливаем только факт наличия импорта (без хранения ImageData в истории)
        if (!state.hasOriginalImageData) {
            setOriginalImageData(null)
        }

        const ao = { ...(state.autoOverrides || {}) }
        setAutoOverrides(ao)

        const autoEffective = applyAutoOverrides(
            cloneSwatches(state.autoSwatches),
            ao
        )
        setAutoSwatches(autoEffective)

        setUserSwatches(cloneSwatches(state.userSwatches))

        setSelectedSwatch(state.selectedSwatch)

        // Важно: флаги истории не меняем здесь — их меняют undo/redo/pushCommit
    }

    function restoreProjectFromLoadPayload(payload: LoadPayload) {
        const next = payload.nextState as any

        traceLoad("commit: start", {
            hasNext: !!next,
            expected:
                payload.canonicalChecksum ?? loadedCanonicalChecksumRef.current,
        })

        if (!next) {
            traceLoad("commit: no nextState -> fail")
            failImport("Import failed. Please try again.")
            return
        }

        try {
            // ==========================
            // EDITOR-RESTORE: new life (reset histories)
            // ==========================
            pastRef.current = []
            futureRef.current = []
            syncHistoryFlags()
            traceLoad("commit: history reset")

            // keep diagnostics (optional)
            loadedSnapshotVersionRef.current = payload.snapshotVersion
            if (payload.canonicalChecksum) {
                loadedCanonicalChecksumRef.current = payload.canonicalChecksum
            }

            // ==========================
            // EDITOR-RESTORE: commit/apply + UI cleanup
            // (1:1 из бывшего commitLoadedProjectOrFail)
            // ==========================

            isRestoringFromSaveRef.current = true
            traceLoad("commit: restoring=true")

            paletteOrderRef.current = next.paletteOrderIds

            // 1) применяем ProjectState (ядро проекта)
            // --------------------------
            // FIX: palette invariants on restore
            // - no transparent swatch in auto/user
            // - paletteCount: keep target from state (clamped)
            // --------------------------
            const stripTransparentSwatches = (list: Swatch[]) =>
                (list || []).filter(
                    (s) => s && !s.isTransparent && s.id !== "transparent"
                )

            const fixedAuto = stripTransparentSwatches(
                next.project.autoSwatches
            )
            const fixedUser = stripTransparentSwatches(
                next.project.userSwatches
            )

            const fixedProject: ProjectState = {
                ...next.project,
                autoSwatches: fixedAuto,
                userSwatches: fixedUser,
                paletteCount: clampInt(
                    next.project.paletteCount,
                    PALETTE_MIN,
                    PALETTE_MAX
                ),
            }

            // ✅ Load contract: восстанавливаем палитру И сразу применяем autoOverrides.
            // Никакого repixelize из ref для "появления" overrides не нужно.
            const fixedAutoEffective = applyAutoOverrides(
                fixedProject.autoSwatches,
                fixedProject.autoOverrides || {}
            )
            fixedProject.autoSwatches = fixedAutoEffective

            traceLoad("commit: applyProjectState called", {
                gridSize: fixedProject.gridSize,
                paletteCount: fixedProject.paletteCount,
                auto: fixedProject.autoSwatches.length,
                user: fixedProject.userSwatches.length,
            })

            // ✅ после load не делаем repixelize автоматически
            skipNextRepixelizeAfterLoadRef.current = true

            applyProjectState(fixedProject)

            // ✅ PATCH C: синхронизируем эталон штрихов с загруженным overlay,
            // чтобы штрихи были видны СРАЗУ после load и не "воскресали" от GRID SIZE.
            syncPaintRefToOverlay({
                overlay: fixedProject.overlayPixels,
                auto: fixedProject.autoSwatches,
                user: fixedProject.userSwatches,
                autoOverrides: fixedProject.autoOverrides || {},
                reason: "load",
            })

            routeLog(
                "L2 commit applied ProjectState (image/overlay updated), canvasPixels NOT updated here",
                {
                    g: fixedProject.gridSize,
                    imageNonNull: countNonNullCells(fixedProject.imagePixels),
                    overlayNonNull: countNonNullCells(
                        fixedProject.overlayPixels
                    ),
                }
            )

            // 2) восстановить эталон (ref)
            setOriginalImageData(next.originalImageData)

            routeLog("L2 commit setOriginalImageData(ref storage)", {
                hasRef: next.originalImageData != null,
                refSize: next.originalImageData
                    ? `${next.originalImageData.width}x${next.originalImageData.height}`
                    : null,
            })

            traceLoad("commit: setOriginalImageData called", {
                hasRef: next.originalImageData != null,
                refSize: next.originalImageData
                    ? `${next.originalImageData.width}x${next.originalImageData.height}`
                    : null,
            })

            // 4) сетка-политика после restore
            enforceGridRuleAfterRestore(
                {
                    imagePixels: fixedProject.imagePixels,
                    overlayPixels: fixedProject.overlayPixels,
                    autoSwatches: fixedProject.autoSwatches,
                    userSwatches: fixedProject.userSwatches,
                    hasOriginalImageData: fixedProject.hasOriginalImageData,
                },
                "load-commit"
            )
            traceLoad("commit: enforceGridRuleAfterRestore done")

            // 5) checksum-проверка ПОСЛЕ рендера (через useEffect)
            const expected = loadedCanonicalChecksumRef.current
            traceLoad("commit: scheduled CHK_AFTER_COMMIT", { expected })

            if (ENABLE_SAVELOAD_CHECKSUM_LOGS) {
                traceLoad(
                    "commit: requested CHK_AFTER_COMMIT (via useEffect)",
                    {
                        expected: loadedCanonicalChecksumRef.current,
                    }
                )
                setPostLoadCheckNonce((v) => v + 1)
            }

            // 6) очистить pending refs (после планирования проверки)
            //nextLoadStateRef.current = null
            //lastValidatedSnapshotRef.current = null
            //lastValidatedSnapshotV2Ref.current = null
            traceLoad("commit: refs cleared")

            // 7) ВАЖНО: снять restoring=true ПОСЛЕ коммита, но не в этом же тике.
            // Иначе repixelizeEffect может успеть схватить изменения и начать мутировать проект.
            requestAnimationFrame(() => {
                isRestoringFromSaveRef.current = false
                setRestoreVisualNonce((x) => x + 1)
                // ✅ PATCH C: форсим перерисовку витрины после load (особенно важно на мобилках/батчинге)
                setRestoreVisualNonce((x) => x + 1)

                traceLoad("commit: restoring=false (rAF)")
            })
        } catch (e) {
            traceLoad("commit: failed", e)

            //console.error("[LOAD][L2] commit failed", e)
            //nextLoadStateRef.current = null
            //lastValidatedSnapshotRef.current = null
            //lastValidatedSnapshotV2Ref.current = null

            // fail-closed
            failImport("Import failed. Please try again.")

            // важно: не залипнуть в restoring=true
            isRestoringFromSaveRef.current = false
            setRestoreVisualNonce((x) => x + 1)
        }
    }

    React.useEffect(() => {
        if (!ENABLE_SAVELOAD_CHECKSUM_LOGS) return

        const expected = loadedCanonicalChecksumRef.current
        if (!expected) return

        try {
            const snap = buildProjectSnapshotV2()
            const got = checksumJsonString(
                JSON.stringify(canonicalizeSnapshotV2(snap))
            )

            if (ENABLE_SAVELOAD_CHECKSUM_LOGS) {
                console.log(
                    "[LOAD][CHK_AFTER_COMMIT] got=",
                    got,
                    "expected=",
                    expected,
                    "match=",
                    got === expected,
                    "ver=",
                    2
                )
            }

            if (got !== expected) {
                console.warn(
                    "[LOAD][CHK_MISMATCH] project state mutated after load (forbidden)"
                )
            }
        } catch (e) {
            console.warn("[LOAD][CHK_AFTER_COMMIT] failed", e)
        }
    }, [postLoadCheckNonce])

    function isSameProjectState(a: ProjectState, b: ProjectState): boolean {
        // быстрые проверки по ссылкам и примитивам
        if (a.gridSize !== b.gridSize) return false
        if (a.paletteCount !== b.paletteCount) return false
        if (a.showImage !== b.showImage) return false
        if (a.selectedSwatch !== b.selectedSwatch) return false

        // autoOverrides (diff-only)
        const aOv = a.autoOverrides || {}
        const bOv = b.autoOverrides || {}

        const aKeys = Object.keys(aOv).sort()
        const bKeys = Object.keys(bOv).sort()
        if (aKeys.length !== bKeys.length) return false

        for (let i = 0; i < aKeys.length; i++) {
            if (aKeys[i] !== bKeys[i]) return false
            const k = aKeys[i]
            const av = aOv[k]
            const bv = bOv[k]
            // поля только hex/isTransparent, сравниваем строго
            if ((av?.hex ?? null) !== (bv?.hex ?? null)) return false
            if ((av?.isTransparent ?? null) !== (bv?.isTransparent ?? null))
                return false
        }

        // палитра
        if (a.autoSwatches.length !== b.autoSwatches.length) return false
        if (a.userSwatches.length !== b.userSwatches.length) return false

        // пиксели (быстро: размеры)
        if (a.overlayPixels.length !== b.overlayPixels.length) return false

        return false
    }

    function pushCommit(before: ProjectState) {
        const now = makeProjectState()

        // ✅ STEP 7: защита от пустых коммитов
        if (isSameProjectState(before, now)) {
            return
        }

        pastRef.current.push(before)

        // ✅ лимит истории
        if (pastRef.current.length > MAX_HISTORY) {
            pastRef.current.shift()
        }

        // ✅ любое новое действие убивает redo
        futureRef.current = []

        syncHistoryFlags()

        pendingBlankCheckReasonRef.current = "commit-allwhite"
    }

    function doUndo() {
        if (pastRef.current.length === 0) return

        const before = pastRef.current.pop() as ProjectState
        const now = makeProjectState()

        futureRef.current.push(now)
        applyProjectState(before)

        enforceGridRuleAfterRestore(
            {
                imagePixels: before.imagePixels,
                overlayPixels: before.overlayPixels,
                autoSwatches: before.autoSwatches,
                userSwatches: before.userSwatches,
                hasOriginalImageData: before.hasOriginalImageData,
            },
            "undo"
        )

        syncHistoryFlags()
    }

    function doRedo() {
        if (futureRef.current.length === 0) return

        const next = futureRef.current.pop() as ProjectState
        const now = makeProjectState()

        pastRef.current.push(now)

        // limit
        if (pastRef.current.length > MAX_HISTORY) {
            pastRef.current.shift()
        }

        applyProjectState(next)

        enforceGridRuleAfterRestore(
            {
                imagePixels: next.imagePixels,
                overlayPixels: next.overlayPixels,
                autoSwatches: next.autoSwatches,
                userSwatches: next.userSwatches,
                hasOriginalImageData: next.hasOriginalImageData,
            },
            "redo"
        )

        syncHistoryFlags()
    }

    // ------------------- GRID SIZE COMMIT (STEP 4) -------------------

    const gridResizeBeforeRef = React.useRef<ProjectState | null>(null)
    function commitGridResizeIfNeeded() {
        const before = gridResizeBeforeRef.current
        if (!before) return
        gridResizeBeforeRef.current = null

        commitPruneAutoOverridesAndPush(before)
    }

    function commitPruneAutoOverridesAndPush(before: ProjectState | null) {
        if (!before) return

        // 1) Считаем cleaned только по текущим autoSwatches (текущая "реальность" палитры)
        const cleaned = pruneAutoOverridesForCurrentAuto(
            autoSwatches,
            autoOverrides
        )

        // 2) Если отличается — фиксируем в state (НО: только на commit-event)
        const prevKeys = Object.keys(autoOverrides || {})
        const nextKeys = Object.keys(cleaned || {})
        const changed =
            prevKeys.length !== nextKeys.length ||
            prevKeys.some((k) => {
                const a = (autoOverrides as any)?.[k]
                const b = (cleaned as any)?.[k]
                return JSON.stringify(a) !== JSON.stringify(b)
            })

        if (changed) {
            setAutoOverrides(cleaned)
        }

        // 3) Коммитим историю ПОСЛЕ того, как state успеет применить setAutoOverrides
        // (rAF = тот же паттерн, что у тебя уже применяется для атомарных коммитов)
        requestAnimationFrame(() => {
            pushCommit(before)
        })
    }

    function beginGridResizeCaptureIfNeeded() {
        // 1) фиксируем состояние “до” (undo-commit логика уже у тебя)
        if (!gridResizeBeforeRef.current) {
            gridResizeBeforeRef.current = makeProjectState()
        }
    }

    function endGridResizeCaptureIfNeeded() {
        // S2: тяжёлый grid commit — только через TXN-очередь
        enqueueTxn("gridCommit", () => {
            commitGridResizeIfNeeded()
        })
    }

    // ------------------- PALETTE SIZE COMMIT (NEW) -------------------

    const paletteResizeBeforeRef = React.useRef<ProjectState | null>(null)

    function commitPaletteResizeIfNeeded() {
        const before = paletteResizeBeforeRef.current
        if (!before) return
        paletteResizeBeforeRef.current = null

        commitPruneAutoOverridesAndPush(before)
    }

    // ------------------- STROKE UNDO (STEP 6) -------------------

    const strokeBeforeRef = React.useRef<ProjectState | null>(null)
    const strokeDidMutateRef = React.useRef(false)
    const lastDrawPointRef = React.useRef<{ x: number; y: number } | null>(null)
    const strokeAfterOverlayRef = React.useRef<PixelValue[][] | null>(null)

    // --- ROUTE A: stroke debug guards (no spam) ---
    const strokeRouteIdRef = React.useRef(0)
    const strokeRouteLoggedWriteRef = React.useRef(false)

    // =====================
    // CANVAS POINTER HANDLERS (preview infra)
    // =====================

    const pointerRef = React.useRef<{
        x: number
        y: number
        inside: boolean
        w: number
        h: number
    }>({ x: 0, y: 0, inside: false, w: 0, h: 0 })

    const brushPreviewRef = React.useRef<HTMLDivElement | null>(null)

    const [, forceBrushPreviewTick] = React.useReducer((x) => x + 1, 0)

    function handlePointerDown(e: any) {
        if (overlayMode) return

        e.preventDefault()

        // обновляем pointerRef + preview-рамку (шаги 1–4)
        updatePointerFromEvent(e, true)

        // --- Step 9: PIPETTE tool (pick swatch from canvas/overlay) ---
        if (toolMode === "pipette") {
            const x = pointerRef.current.x
            const y = pointerRef.current.y

            const picked = pickSwatchAtXY(x, y)
            setSelectedSwatch(picked)

            return
        }

        // --- Step 7: HAND tool starts panning instead of drawing ---
        if (toolMode === "hand") {
            panSessionRef.current = {
                active: true,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startPanX: panX,
                startPanY: panY,
            }
            setIsPanning(true)

            try {
                ;(e.currentTarget as any)?.setPointerCapture?.(e.pointerId)
            } catch {}

            return
        }

        // запускаем рисование (S1 STREAM-lock)
        if (busyKindRef.current !== null) {
            // мягкий отказ: курсор занят другим пользовательским действием
            return
        }

        busyKindRef.current = "stream"
        setIsDrawing(true)

        // ROUTE A1: stroke begin
        strokeRouteIdRef.current += 1
        strokeRouteLoggedWriteRef.current = false

        const x0 = pointerRef.current.x
        const y0 = pointerRef.current.y
        const row = Math.floor(y0 / (CANVAS_SIZE / rows))
        const col = Math.floor(x0 / (CANVAS_SIZE / cols))

        routeLog("A1 STROKE BEGIN (pointerDown)", {
            id: strokeRouteIdRef.current,
            toolMode,
            g: gridSize,
            brushSize,
            x: x0,
            y: y0,
            row,
            col,
            paintValue: currentPaintValue,
        })

        // ✅ STEP 6: начало stroke — сохраняем состояние ДО
        strokeBeforeRef.current = makeProjectState()
        strokeDidMutateRef.current = false

        // переводим позицию указателя (0..CANVAS_SIZE) в индексы клетки
        const x = pointerRef.current.x
        const y = pointerRef.current.y

        const last = lastDrawPointRef.current
        if (last) {
            paintInterpolatedStroke(last.x, last.y, x, y, currentPaintValue)
        } else {
            paintBrushAtXY(x, y, currentPaintValue)
        }

        lastDrawPointRef.current = { x, y }

        // чтобы при отпускании вне canvas onPointerUp всё равно сработал
        try {
            ;(e.currentTarget as any)?.setPointerCapture?.(e.pointerId)
        } catch {}
    }

    // --- Step 9 helper: pick swatch id by content pixel (overlay has priority) ---
    function pickSwatchAtXY(x: number, y: number): SwatchId | "transparent" {
        const cellW = CANVAS_SIZE / cols
        const cellH = CANVAS_SIZE / rows

        const col = Math.floor(x / cellW)
        const row = Math.floor(y / cellH)

        if (row < 0 || col < 0 || row >= rows || col >= cols)
            return "transparent"

        // приоритет: overlayPixels, если ячейка НЕ пустая (то есть !== null)
        const ov = overlayPixels[row]?.[col] ?? null
        const base = imagePixels[row]?.[col] ?? null

        const picked: PixelValue = ov !== null ? ov : base

        if (picked === null) return "transparent"
        if (picked === TRANSPARENT_PIXEL) return "transparent"

        return picked
    }

    function handlePointerMove(e: any) {
        if (overlayMode) return

        e.preventDefault()

        // --- Step 8: panning ---
        if (panSessionRef.current.active && toolMode === "hand") {
            const dx = e.clientX - panSessionRef.current.startClientX
            const dy = e.clientY - panSessionRef.current.startClientY

            const nextX = panSessionRef.current.startPanX + dx
            const nextY = panSessionRef.current.startPanY + dy

            const clamped = clampPan(nextX, nextY, zoom)

            if (clamped.x !== panX) setPanX(clamped.x)
            if (clamped.y !== panY) setPanY(clamped.y)

            return
        }

        // обновляем pointerRef + preview-рамку (шаги 1–4)
        updatePointerFromEvent(e, true)

        // если не рисуем — просто двигаем рамку
        if (!isDrawing) return

        // рисуем кистью по клеткам
        const x = pointerRef.current.x
        const y = pointerRef.current.y

        const last = lastDrawPointRef.current
        if (last) {
            paintInterpolatedStroke(last.x, last.y, x, y, currentPaintValue)
        } else {
            paintBrushAtXY(x, y, currentPaintValue)
        }

        lastDrawPointRef.current = { x, y }
    }

    const cancelHold = (ref: React.MutableRefObject<number | null>) => {
        if (ref.current != null) {
            window.clearTimeout(ref.current)
            ref.current = null
        }
    }

    const SHOW_BRUSH_PREVIEW = true

    // Padding рамки в долях одной ячейки (по 0.3 ячейки с каждой стороны)
    const BRUSH_PREVIEW_PAD_CELL = 0.3

    const [zoom, setZoom] = React.useState(1)
    const [panX, setPanX] = React.useState(0)
    const [panY, setPanY] = React.useState(0)

    // =====================
    // STEP 8: PAN CLAMP (anti "lost canvas")
    // =====================

    const clampPanWithSize = React.useCallback(
        (
            nextPanX: number,
            nextPanY: number,
            nextZoom: number,
            vw: number,
            vh: number
        ) => {
            // Content по базовой геометрии равен viewport (width/height 100%),
            // а масштабируется zoom-ом.
            const contentW = vw * nextZoom
            const contentH = vh * nextZoom

            // Если zoom=1 → content==viewport → pan должен быть 0.
            // Если zoom>1 → можно двигать в пределах [vw - contentW, 0].
            const minX = Math.min(0, vw - contentW)
            const maxX = 0
            const minY = Math.min(0, vh - contentH)
            const maxY = 0

            const x = Math.max(minX, Math.min(maxX, nextPanX))
            const y = Math.max(minY, Math.min(maxY, nextPanY))

            // ✅ ПАТЧ 3: убиваем субпиксели на выходе
            return { x: Math.round(x), y: Math.round(y) }
        },
        []
    )

    const clampPan = React.useCallback(
        (nextPanX: number, nextPanY: number, nextZoom: number) => {
            const vp = viewportRef.current
            if (!vp) return { x: Math.round(nextPanX), y: Math.round(nextPanY) }

            const rect = vp.getBoundingClientRect()
            const vw = Math.round(rect.width)
            const vh = Math.round(rect.height)

            return clampPanWithSize(nextPanX, nextPanY, nextZoom, vw, vh)
        },
        [clampPanWithSize]
    )

    // Поджимать pan, если:
    // - изменился zoom (уменьшили — чтобы pan не оказался вне диапазона)
    // - изменился размер viewport (мобилка повернулась, изменился layout и т.п.)
    React.useEffect(() => {
        // ждём валидный размер viewport (он приходит из ResizeObserver)
        if (!viewportSize.w || !viewportSize.h) return

        const { x, y } = clampPanWithSize(
            panX,
            panY,
            zoom,
            viewportSize.w,
            viewportSize.h
        )

        if (x !== panX) setPanX(x)
        if (y !== panY) setPanY(y)
    }, [panX, panY, zoom, viewportSize.w, viewportSize.h, clampPanWithSize])

    // --- TOOL MODE (Step 7) ---
    type ToolMode = "brush" | "hand" | "pipette"
    const [toolMode, setToolMode] = React.useState<ToolMode>("brush")

    // --- PANNING (Step 7) ---
    const [isPanning, setIsPanning] = React.useState(false)
    const panSessionRef = React.useRef<{
        active: boolean
        startClientX: number
        startClientY: number
        startPanX: number
        startPanY: number
    }>({
        active: false,
        startClientX: 0,
        startClientY: 0,
        startPanX: 0,
        startPanY: 0,
    })

    // --- ZOOM CONSTANTS (MVP) ---
    const ZOOM_STEP = 0.1
    const MIN_ZOOM = 1

    // --- ZOOM/PAN (Step 4: кнопки Zoom In/Out + reset на long-press / right-click) ---
    const zoomOutHoldRef = React.useRef<number | null>(null)
    const zoomOutDidLongPressRef = React.useRef(false)

    const quantizeZoomStep = React.useCallback((z: number) => {
        // шаг 0.1 → держим значения аккуратными (1.0, 1.1, 1.2…)
        return Math.round(z * 10) / 10
    }, [])

    const resetView = React.useCallback(() => {
        setZoom(1)
        setPanX(0)
        setPanY(0)
    }, [])

    const handleZoomIn = React.useCallback(() => {
        setZoom((z) => quantizeZoomStep(z + ZOOM_STEP))
    }, [quantizeZoomStep])

    const handleZoomOut = React.useCallback(() => {
        // если только что сработал long-press — не делаем ещё и обычный zoom-out кликом
        if (zoomOutDidLongPressRef.current) {
            zoomOutDidLongPressRef.current = false
            return
        }
        setZoom((z) => Math.max(MIN_ZOOM, quantizeZoomStep(z - ZOOM_STEP)))
    }, [quantizeZoomStep])

    const handleZoomOutPointerDown = React.useCallback(
        (e: any) => {
            zoomOutDidLongPressRef.current = false
            // long-press только для touch (как в твоём startHold)
            startHold(e, zoomOutHoldRef, () => {
                zoomOutDidLongPressRef.current = true
                resetView()
            })
        },
        [resetView]
    )

    const handleZoomOutPointerUp = React.useCallback(() => {
        cancelHold(zoomOutHoldRef)
    }, [])

    const startHold = (
        e: any,
        ref: React.MutableRefObject<number | null>,
        toggle: () => void
    ) => {
        // only for touch long-press
        if (e?.pointerType !== "touch") return
        cancelHold(ref)
        ref.current = window.setTimeout(() => {
            ref.current = null
            toggle()
        }, 550) // long tap threshold
    }

    const [isColorModalOpen, setIsColorModalOpen] = React.useState(false)
    const SWATCH_ICON = 44
    const [editingSwatchId, setEditingSwatchId] =
        React.useState<SwatchId | null>(null)
    const [pendingColor, setPendingColor] = React.useState("#FF0000")
    const [pendingTransparent, setPendingTransparent] = React.useState(false)

    // HEX1: draft текста в инпуте (может быть временно невалидным)
    const [hexDraft, setHexDraft] = React.useState("#FF0000")

    function normalizeHexForCommit(s: string): string {
        const raw = (s || "").trim()
        if (!raw) return ""

        let t = raw.replace(/\s+/g, "")

        // добавляем # если нет
        if (!t.startsWith("#")) t = "#" + t

        t = t.toUpperCase()

        // #RGB -> #RRGGBB
        const short = /^#([0-9A-F]{3})$/.exec(t)
        if (short) {
            const r = short[1][0]
            const g = short[1][1]
            const b = short[1][2]
            return `#${r}${r}${g}${g}${b}${b}`
        }

        return t
    }

    function isValidHex6(s: string): boolean {
        return /^#[0-9A-F]{6}$/.test(s)
    }

    // HEX2: чтобы не перетирать draft, пока пользователь печатает
    const hexIsEditingRef = React.useRef(false)

    // HEX2: маркер "цвет поменялся из HSV", тогда hexDraft обновляем всегда
    const pendingColorFromHSVRef = React.useRef(false)

    function commitHexDraft() {
        const norm = normalizeHexForCommit(hexDraft)

        // если пользователь ввёл без # — можно аккуратно показать нормализованный вариант,
        // но НЕ форсить #RRGGBB при невалидном вводе
        if (norm && norm !== hexDraft) {
            setHexDraft(norm)
        }

        if (/^#[0-9A-F]{6}$/.test(norm)) {
            // HEX2: HEX -> HSV (двигаем ползунок hue и точку SV)
            const { r, g, b } = hexToRgb(norm)
            const hsv = rgbToHsv(r, g, b)

            setPendingColor(norm)
            setPickerHue(hsv.h)
            setPickerSV({ s: hsv.s, v: hsv.v })
        }
    }

    const [overlayMode, setOverlayMode] = React.useState<OverlayMode>(null)

    const [manualOpen, setManualOpen] = React.useState(false)

    // EXPORT: re-entry guard (enterprise UX)
    const [isExporting, setIsExporting] = React.useState(false)

    // EXPORT: layer selection (UI only, defaults = composite)
    const [exportIncludeStroke, setExportIncludeStroke] = React.useState(true)
    const [exportIncludeImage, setExportIncludeImage] = React.useState(true)

    const toggleExportStroke = React.useCallback(() => {
        // нельзя оставить оба OFF — мягко игнорируем попытку снять последнюю галочку
        if (exportIncludeStroke && !exportIncludeImage) return
        setExportIncludeStroke(!exportIncludeStroke)
    }, [exportIncludeStroke, exportIncludeImage])

    const toggleExportImage = React.useCallback(() => {
        if (exportIncludeImage && !exportIncludeStroke) return
        setExportIncludeImage(!exportIncludeImage)
    }, [exportIncludeImage, exportIncludeStroke])

    // Custom picker state (HSV)
    const [pickerHue, setPickerHue] = React.useState(0)
    const [pickerSV, setPickerSV] = React.useState({ s: 1, v: 1 })

    const rows = overlayPixels.length
    const cols = rows > 0 ? overlayPixels[0].length : 0
    const pixelSize = rows > 0 ? CANVAS_SIZE / rows : CANVAS_SIZE

    const bg = "#e9d8a6"
    const textColor = "#1b1b1b"
    const canvasMax = 640

    const squareButton = (clickable = false): React.CSSProperties => ({
        width: 44,
        height: 44,
        background: "#000",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.15)",
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
        fontSize: 18,
        lineHeight: 1,
        userSelect: "none",
        cursor: clickable ? "pointer" : "default",
        WebkitTapHighlightColor: "transparent",
        padding: 0,
    })

    const iconButton = (clickable = false): React.CSSProperties => ({
        ...squareButton(clickable),
        background: "transparent",
        border: "none", // если хочешь убрать и рамку
    })

    const iconOnlyButton = (clickable = false): React.CSSProperties => {
        const s = "clamp(28px, 3vw, 38px)"

        return {
            /* ✅ ВСЕ кнопки равноправны */
            flex: "1 1 0",
            minWidth: 0,
            maxWidth: s,

            /* квадрат, но сжимаемый */
            height: s,
            aspectRatio: "1 / 1",

            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            background: "transparent",
            border: "none",
            padding: 0,

            cursor: clickable ? "pointer" : "default",
            color: "#ffffff",
        }
    }

    const labelStyle: React.CSSProperties = {
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: 0.4,
        color: textColor,
        textTransform: "uppercase",
        marginBottom: 3,
    }

    const subLabelStyle: React.CSSProperties = {
        fontSize: 14,
        fontWeight: 500,
        color: textColor,
        marginLeft: 6,
    }

    const trackWrap: React.CSSProperties = {
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
    }

    const rangeStyleBase: React.CSSProperties = {
        width: "100%",
        //height: 34,
        borderRadius: 0,
        background: "transparent",
        WebkitAppearance: "none" as any,
        appearance: "none",
    }

    const overlayButtonStyle: React.CSSProperties = {
        background: "transparent",
        border: "none",
        outline: "none",
        boxShadow: "none",
        appearance: "none",
        WebkitAppearance: "none",
        WebkitTapHighlightColor: "transparent",
        padding: 0,
        width: 180,
        height: 64,
        fontWeight: 900,
        letterSpacing: 0.8,
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        userSelect: "none",
        fontFamily:
            "Roboto, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    }

    const transparentToolSelected = selectedSwatch === "transparent"

    const currentPaintValue: PixelValue = transparentToolSelected
        ? TRANSPARENT_PIXEL
        : (selectedSwatch as SwatchId)

    const allSwatches = React.useMemo(() => {
        return [...autoSwatches, ...userSwatches].filter(
            (s) => !s.isTransparent && s.id !== "transparent"
        )
    }, [autoSwatches, userSwatches])

    // Унифицированная сортировка “по группам” (red → green → blue → gray) + внутри группы
    function sortSwatchesForUI(source: Swatch[]) {
        const groupOrder: Record<SwatchColorGroup, number> = {
            red: 0,
            green: 1,
            blue: 2,
            gray: 3,
        }

        // Важно: сортируем копию, source не мутируем
        const arr = [...source]

        const clsById = new Map<SwatchId, SwatchColorClass>()
        for (const sw of arr) clsById.set(sw.id, classifySwatchColor(sw))

        const stableId = (id: any) => String(id ?? "")

        arr.sort((a, b) => {
            const ca = clsById.get(a.id) ?? classifySwatchColor(a)
            const cb = clsById.get(b.id) ?? classifySwatchColor(b)

            const ga = groupOrder[ca.group]
            const gb = groupOrder[cb.group]
            if (ga !== gb) return ga - gb

            // внутри групп: сортировка по keyInsideGroup (у тебя это яркость/светлота), затем стабилизация по id
            if (ca.keyInsideGroup !== cb.keyInsideGroup)
                return ca.keyInsideGroup - cb.keyInsideGroup

            // доп. стабилизация (если есть)
            if (ca.s !== cb.s) return ca.s - cb.s

            const ida = stableId(a.id)
            const idb = stableId(b.id)
            if (ida < idb) return -1
            if (ida > idb) return 1
            return 0
        })

        return arr
    }

    // ✅ 1) “основная” палитра — только autoSwatches (БЕЗ transparent)
    const sortedAutoSwatchesForUI = React.useMemo(() => {
        return sortSwatchesForUI(autoSwatches).filter(
            (s) => !s.isTransparent && s.id !== "transparent"
        )
    }, [autoSwatches])

    // ✅ 2) пользовательские — отдельным блоком после “+”
    const sortedUserSwatchesForUI = React.useMemo(() => {
        return sortSwatchesForUI(userSwatches)
    }, [userSwatches])

    const swatchById = React.useMemo(() => {
        const m = new Map<SwatchId, Swatch>()
        for (const s of allSwatches) m.set(s.id, s)
        return m
    }, [allSwatches])

    const resolveToColor = React.useCallback(
        (v: PixelValue): string | null => {
            if (v == null) return null
            if (v === TRANSPARENT_PIXEL) return null
            const sw = swatchById.get(v)
            if (!sw) return null
            if (sw.isTransparent) return null
            return sw.color || null
        },
        [swatchById]
    )

    const isTransparentValue = React.useCallback(
        (v: PixelValue): boolean => {
            if (v == null) return false
            if (v === TRANSPARENT_PIXEL) return true
            const sw = swatchById.get(v)
            return !!sw?.isTransparent
        },
        [swatchById]
    )

    const importBtnRef = React.useRef<HTMLButtonElement | null>(null)
    const exportBtnRef = React.useRef<HTMLButtonElement | null>(null)

    const [overlayAnchorRect, setOverlayAnchorRect] =
        React.useState<DOMRect | null>(null)

    const BRUSH_MIN = 1
    const BRUSH_MAX = 20
    const BRUSH_STEP = 1
    const pendingImportBeforeRef = React.useRef<ProjectState | null>(null)

    // ------------------- IMAGE INPUT -------------------

    React.useEffect(() => {
        if (initialImageData) {
            // FIX: если перед импортом был “all-white commit”, мог остаться pending blank-check.
            // Его нужно сбросить, иначе он иногда включает сетку обратно уже ПОСЛЕ импорта.
            pendingBlankCheckReasonRef.current = null
            setAutoOverrides({})
            const before = makeProjectState()

            pendingImportBeforeRef.current = before
            pendingBlankCheckReasonRef.current = null
            setGridSuppressed(true, "import")
            setOriginalImageData(initialImageData)

            // ✅ NEW IMPORT = новая сессия:
            // очищаем слой штрихов И его эталон, чтобы старые штрихи не пере-наложились после repixelize.
            setPaintRefImageData(null)
            overlayDirtyRef.current = false
            paintSnapshotNonceRef.current = 0
            p25LastKeyRef.current = null
            p3LastProcessedKeyRef.current = null
            p3InFlightKeyRef.current = null

            setOverlayPixels(createEmptyPixels(gridSize))
            setShowImage(true)
            setHasImportContext(true)
        }
    }, [initialImageData])

    const [repixelizeKick, setRepixelizeKick] = React.useState(0)

    React.useEffect(() => {
        traceLoad("repixelizeEffect ENTER", {
            g: gridSize,
            p: paletteCount,
            hasRef: originalImageData != null,
            restoring: isRestoringFromSaveRef.current,
            snapNonce: paintSnapshotNonceRef.current,
            postLoadNonce: postLoadCheckNonceRef.current,
        })
        traceLoad("repixelizeEffect ENTER", {
            g: gridSize,
            p: paletteCount,
            restoring: isRestoringFromSaveRef.current,
            postLoadNonce: postLoadCheckNonceRef.current,
        })

        // ✅ G1: блокируем repixelize во время restore
        if (isRestoringFromSaveRef.current) {
            traceLoad("repixelizeEffect SKIP (restoring=true)")
            return
        }

        // S4: фон не имеет права коммитить editor-state во время STREAM
        if (busyKindRef.current === "stream") {
            pendingRef.current.repixelize = true
            pendingRef.current.overlayRequant = true
            traceLoad(
                "repixelizeEffect DEFER (busy=stream) — pendingRef.repixelize=true"
            )
            return
        }

        // ✅ G1.7 (FIX): postLoadCheckNonce больше НЕ должен "съедать" единственный repixelize.
        // Мы используем его как "маркер, что это первый проход после load":
        //  - сбрасываем nonce,
        //  - и ПРОДОЛЖАЕМ выполнение эффекта, чтобы он обновил canvasPixels.
        if (postLoadCheckNonceRef.current > 0) {
            traceLoad(
                "repixelizeEffect PASS (postLoadCheckNonce>0) — allowing first repixelize after load"
            )

            // Важно: сбросить флаг, чтобы следующие вызовы repixelize уже не считались "пост-лоадом".
            postLoadCheckNonceRef.current = 0

            // НЕ return!
        }

        const hasSnap = paintRefImageData != null

        // P3: ключ и SKIP — только для snap-режима
        const p3Key = hasSnap
            ? p3BuildRequantizeKey({
                  gridSize,
                  paletteCount,
                  autoSwatches,
                  userSwatches,
                  refNonce: paintSnapshotNonceRef.current,
              })
            : null

        if (hasSnap && p3Key) {
            // 1) уже обработано — SKIP
            if (p3LastProcessedKeyRef.current === p3Key) {
                if (ENABLE_TXN_LOGS) {
                    console.log(
                        `[IMPORT][SKIP] key=${p3Key} reason=already_processed`
                    )
                }
                traceLoad("repixelizeEffect SKIP (already_processed)", {
                    p3Key,
                })
                return
            }

            // 2) защита от наложения
            if (p3InFlightKeyRef.current === p3Key) {
                if (ENABLE_TXN_LOGS) {
                    console.log(`[IMPORT][SKIP] key=${p3Key} reason=in_flight`)
                }
                traceLoad("repixelizeEffect SKIP (in_flight)", { p3Key })
                return
            }

            p3InFlightKeyRef.current = p3Key

            if (ENABLE_PREP_LOGS) {
                qcLogP2({
                    phase: "BEGIN",
                    gridSize,
                    paletteCount,
                    autoSwatches,
                    userSwatches,
                    note: "before-rebuild",
                })
            }
        }

        // txn нужен только в snap-режиме
        const txn =
            hasSnap && ENABLE_TXN_LOGS
                ? beginImportTxn("paint-snapshot-requantize")
                : null

        try {
            if (originalImageData) {
                const basePixels = pixelizeFromImageDominant(
                    originalImageData,
                    gridSize,
                    16
                )

                // ✅ IMPORT UNDO: импорт должен стать одним коммитом в историю.
                const beforeImport = pendingImportBeforeRef.current
                if (beforeImport) {
                    pendingImportBeforeRef.current = null
                    requestAnimationFrame(() => {
                        pushCommit(beforeImport)
                    })
                }

                // E1A: DEFAULT-ONLY (editor не знает о пресетах)
                const pixelsForQuant = basePixels

                const target = clamp(paletteCount, PALETTE_MIN, PALETTE_MAX)
                const q = quantizePixels(pixelsForQuant, target)

                const finalQuantPixels: (string | null)[][] = q.pixels
                const finalPalette: string[] = q.palette

                // next auto-swatches from finalPalette
                const nextAuto: Swatch[] = finalPalette.map((c, i) => ({
                    id: `auto-${i}`,
                    color: c,
                    isTransparent: false,
                    isUser: false,
                }))

                // map quant pixels -> SwatchId grid
                const mapColorToId = new Map<string, string>()
                for (let i = 0; i < finalPalette.length; i++) {
                    mapColorToId.set(finalPalette[i], `auto-${i}`)
                }

                const indexed: PixelValue[][] = finalQuantPixels.map((row) =>
                    row.map((col) => {
                        if (col == null) return null
                        const id = mapColorToId.get(col)
                        return (id ?? null) as any
                    })
                )

                // ==========================
                // TRACE: MUTATIONS (with-original)
                // ==========================
                traceLoad("repixelizeEffect MUTATE", {
                    step: "setImagePixels (with-original)",
                })
                setImagePixels(indexed)

                // ✅ legacy-mode: canvasPixels НЕ трогаем здесь.
                // Витрину синхронизирует B1-SYNC: canvasPixels = composeVisualGrid().

                const nextAutoEffective = applyAutoOverrides(
                    nextAuto,
                    autoOverrides
                )

                // ✅ NEW: collapse duplicates + remap BOTH base+overlay,
                // so "any method" truly means any (including repixelize).
                const collapsed = collapseDuplicateSwatchesAndRemap({
                    imagePixels: indexed,
                    overlayPixels,
                    nextAuto: nextAutoEffective,
                    nextUser: userSwatches,
                    nextAutoOverrides: autoOverrides,
                    selectedSwatch,
                })

                traceLoad("repixelizeEffect MUTATE", {
                    step: "setUserSwatches (with-original) [after collapse]",
                    n: collapsed.userSwatches.length,
                })
                setUserSwatches(collapsed.userSwatches)

                traceLoad("repixelizeEffect MUTATE", {
                    step: "setAutoSwatches (with-original) [after collapse]",
                    n: collapsed.autoSwatches.length,
                })
                setAutoSwatches(collapsed.autoSwatches)

                setAutoOverrides(collapsed.autoOverrides)

                // ✅ важно: если collapse срезал auto-индексы, валидируем selection по НОВОЙ длине
                traceLoad("repixelizeEffect MUTATE", {
                    step: "setSelectedSwatch (with-original) [after collapse]",
                })
                setSelectedSwatch((prev) => {
                    if (prev === "transparent") return prev
                    if (typeof prev === "string" && prev.startsWith("auto-")) {
                        const idx = parseInt(prev.replace("auto-", ""), 10)
                        if (
                            !Number.isFinite(idx) ||
                            idx < 0 ||
                            idx >= collapsed.autoSwatches.length
                        )
                            return "auto-0"
                    }
                    return prev
                })

                // ✅ NEW: overlay тоже обязан быть ремапнут, иначе он может ссылаться на "удалённый" свотч
                traceLoad("repixelizeEffect MUTATE", {
                    step: "setOverlayPixels (with-original) [after collapse]",
                })
                setOverlayPixels(collapsed.overlayPixels)

                traceLoad("repixelizeEffect MUTATE", {
                    step: "setSelectedSwatch (with-original)",
                })
                setSelectedSwatch((prev) => {
                    if (prev === "transparent") return prev
                    if (typeof prev === "string" && prev.startsWith("auto-")) {
                        const idx = parseInt(prev.replace("auto-", ""), 10)
                        if (
                            !Number.isFinite(idx) ||
                            idx < 0 ||
                            idx >= nextAuto.length
                        )
                            return "auto-0"
                    }
                    return prev
                })

                traceLoad("repixelizeEffect MUTATE", {
                    step: "applyOverlayAfterBaseRebuild (with-original)",
                    hasSnap,
                })
                applyOverlayAfterBaseRebuild({
                    imagePixelsNext: collapsed.imagePixels,
                    nextAuto: collapsed.autoSwatches,
                    hasSnap: paintRefImageData != null,
                    snapshot: paintRefImageData,
                    reason: "repixelize:with-original",
                })
            } else {
                // ==========================
                // TRACE: MUTATIONS (no-original)
                // ==========================
                traceLoad("repixelizeEffect MUTATE", {
                    step: "setImagePixels (no-original) [functional]",
                })

                traceLoad("repixelizeEffect MUTATE", {
                    step: "setImagePixels (no-original) [non-functional]",
                })

                const imageNext = resizePixels(imagePixels, gridSize)

                traceLoad("repixelizeEffect MUTATE", {
                    step: "build auto palette (no-original)",
                    p: paletteCount,
                })

                const count = clamp(paletteCount, PALETTE_MIN, PALETTE_MAX)
                const colors = generatePalette(count)
                const nextAutoRaw: Swatch[] = colors.map((c, i) => ({
                    id: `auto-${i}`,
                    color: c,
                    isTransparent: false,
                    isUser: false,
                }))

                const nextAutoEffective = applyAutoOverrides(
                    nextAutoRaw,
                    autoOverrides
                )

                // ✅ NEW: collapse + remap base+overlay
                const collapsed = collapseDuplicateSwatchesAndRemap({
                    imagePixels: imageNext,
                    overlayPixels,
                    nextAuto: nextAutoEffective,
                    nextUser: userSwatches,
                    nextAutoOverrides: autoOverrides,
                    selectedSwatch,
                })

                traceLoad("repixelizeEffect MUTATE", {
                    step: "setUserSwatches (no-original) [after collapse]",
                    n: collapsed.userSwatches.length,
                })
                setUserSwatches(collapsed.userSwatches)

                traceLoad("repixelizeEffect MUTATE", {
                    step: "setAutoSwatches (no-original) [after collapse]",
                    n: collapsed.autoSwatches.length,
                })
                setAutoSwatches(collapsed.autoSwatches)

                setAutoOverrides(collapsed.autoOverrides)

                traceLoad("repixelizeEffect MUTATE", {
                    step: "setSelectedSwatch (no-original) [after collapse]",
                })
                setSelectedSwatch((prevSel) => {
                    if (prevSel === "transparent") return prevSel
                    if (
                        typeof prevSel === "string" &&
                        prevSel.startsWith("auto-")
                    ) {
                        const idx = parseInt(prevSel.replace("auto-", ""), 10)
                        if (
                            !Number.isFinite(idx) ||
                            idx < 0 ||
                            idx >= collapsed.autoSwatches.length
                        )
                            return "auto-0"
                    }
                    return prevSel
                })

                traceLoad("repixelizeEffect MUTATE", {
                    step: "setOverlayPixels (no-original) [after collapse]",
                })
                setOverlayPixels(collapsed.overlayPixels)

                traceLoad("repixelizeEffect MUTATE", {
                    step: "applyOverlayAfterBaseRebuild (no-original)",
                    hasSnap,
                })

                applyOverlayAfterBaseRebuild({
                    imagePixelsNext: collapsed.imagePixels,
                    nextAuto: collapsed.autoSwatches,
                    hasSnap: paintRefImageData != null,
                    snapshot: paintRefImageData,
                    reason: "repixelize:no-original",
                })

                setImagePixels(collapsed.imagePixels)
            }

            // ✅ txn commit success (раньше тут ошибочно было ok:false)
            if (txn && ENABLE_TXN_LOGS) {
                commitImportTxn(txn, { ok: true, note: "ok" })
            }

            if (hasSnap && p3Key) {
                p3LastProcessedKeyRef.current = p3Key
            }
        } catch (e: any) {
            console.error("[P2][paint-snapshot-requantize] failed", e)
            if (txn) {
                commitImportTxn(txn, { ok: false, note: "failed" })
            }
        } finally {
            if (hasSnap && p3Key && p3InFlightKeyRef.current === p3Key) {
                p3InFlightKeyRef.current = null
            }
        }
    }, [gridSize, originalImageData, paletteCount, repixelizeKick])

    // ------------------- CANVAS RENDER (R0: offscreen -> upscale) -------------------
    React.useLayoutEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        canvas.width = CANVAS_SIZE
        canvas.height = CANVAS_SIZE

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        // ==========================
        // B1.4-FIX2:
        // Рендер берёт И размеры, И данные ТОЛЬКО из canvasPixels.
        // Это убирает промежуточные кадры "ужатия" и полосы при смене gridSize.
        // ==========================
        const renderRows = canvasPixels?.length || 0
        const renderCols = canvasPixels?.[0]?.length || 0

        if (ENABLE_ROUTE_LOGS) {
            let nn = 0
            for (let r = 0; r < renderRows; r++) {
                const row = canvasPixels[r] || []
                for (let c = 0; c < renderCols; c++) {
                    const v = row[c] ?? null
                    if (v !== null) nn++
                }
            }

            routeLog("R0 CANVAS RENDER sees canvasPixels", {
                renderRows,
                renderCols,
                nonNull: nn,
                showImage,
                showGrid,
            })
        }

        if (renderRows <= 0 || renderCols <= 0) {
            // безопасный рендер пустоты
            ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
            drawCheckerboard(ctx, CANVAS_SIZE, Math.max(1, gridSize))
            return
        }

        // --- 1) Offscreen canvas N×N (reuse) ---
        const w = Math.max(1, renderCols)
        const h = Math.max(1, renderRows)

        let off = offscreenRef.current
        if (!off) {
            off = document.createElement("canvas")
            offscreenRef.current = off
        }

        if (off.width !== w) off.width = w
        if (off.height !== h) off.height = h

        const offCtx = off.getContext("2d")
        if (!offCtx) return

        // Очищаем offscreen
        offCtx.clearRect(0, 0, w, h)

        // --- B1) Рисуем ЕДИНЫЙ визуальный слой (canvasPixels) в offscreen 1×1 ---
        for (let r = 0; r < renderRows; r++) {
            const row = canvasPixels[r]
            for (let c = 0; c < renderCols; c++) {
                const v = row?.[c] ?? null
                if (v == null) continue

                // Прозрачные значения НЕ рисуем в offscreen (пусть просвечивает checkerboard)
                if (isTransparentValue(v)) continue

                const col = resolveToColor(v)
                if (!col) continue

                offCtx.fillStyle = col
                offCtx.fillRect(c, r, 1, 1)
            }
        }

        // --- 4) Рисуем фон + апскейл offscreen -> основной 512×512 без сглаживания ---
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

        // Оставляем прежний checkerboard (как было), чтобы не менять UX слоями
        drawCheckerboard(ctx, CANVAS_SIZE, renderRows)

        ctx.imageSmoothingEnabled = false
        ctx.drawImage(off, 0, 0, CANVAS_SIZE, CANVAS_SIZE)

        // --- 5) Прозрачность НЕ маркируем крестиками ---
        // Задача: "прозрачная кисть" должна выглядеть идентично прозрачной основе (checkerboard),
        // чтобы было ощущение "протираю до прозрачности". Поэтому ничего поверх checkerboard не рисуем.
        const cellW = CANVAS_SIZE / renderCols
        const cellH = CANVAS_SIZE / renderRows
        const cell = Math.min(cellW, cellH) // квадратный размер маркера

        // Если захочешь вернуть — просто поменяй false -> true.
        const SHOW_TRANSPARENT_MARKS = false

        if (SHOW_TRANSPARENT_MARKS && showImage) {
            for (let r = 0; r < renderRows; r++) {
                const row = canvasPixels[r]
                for (let c = 0; c < renderCols; c++) {
                    const v = row?.[c] ?? null
                    if (isTransparentValue(v)) {
                        drawTransparentMark(ctx, c * cellW, r * cellH, cell)
                    }
                }
            }
        }

        // Если захочешь вернуть — просто поменяй false -> true.
        const SHOW_GRID_R0 = true

        if (SHOW_GRID_R0 && showGrid) {
            ctx.strokeStyle = "rgba(0,0,0,0.15)"
            ctx.lineWidth = 1

            for (let y = 0; y <= CANVAS_SIZE; y += cellH) {
                const pos = Math.round(y) + 0.5
                ctx.beginPath()
                ctx.moveTo(0.5, pos)
                ctx.lineTo(CANVAS_SIZE + 0.5, pos)
                ctx.stroke()
            }

            for (let x = 0; x <= CANVAS_SIZE; x += cellW) {
                const pos = Math.round(x) + 0.5
                ctx.beginPath()
                ctx.moveTo(pos, 0.5)
                ctx.lineTo(pos, CANVAS_SIZE + 0.5)
                ctx.stroke()
            }
        }
    }, [
        // B1.4-FIX2: запускаем рендер только когда поменялся итоговый визуальный слой
        canvasPixels,
        gridSize,
        showImage,
        resolveToColor,
        isTransparentValue,
        showGrid,
    ])

    // ------------------- DRAWING -------------------

    const getBrushBounds = (size: number) => {
        const s = Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, Math.floor(size)))
        const start = -Math.floor((s - 1) / 2)
        const end = start + s - 1
        return { start, end }
    }

    // Интерполяция между быстрыми точками, чтобы не было разрывов
    function paintInterpolatedStroke(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        value: PixelValue
    ) {
        const cellW = CANVAS_SIZE / cols
        const cellH = CANVAS_SIZE / rows

        // шаг интерполяции — четверть клетки (плотнее, чем 0.5), чтобы точно не было дырок
        const step = Math.max(1, Math.min(cellW, cellH) * 0.25)

        const dx = x1 - x0
        const dy = y1 - y0
        const dist = Math.hypot(dx, dy)

        const steps = Math.max(1, Math.ceil(dist / step))

        // ограничитель на случай очень больших скачков, чтобы не подвесить UI
        const cappedSteps = Math.min(steps, 250)

        for (let i = 0; i <= cappedSteps; i++) {
            const t = i / cappedSteps
            const xi = x0 + dx * t
            const yi = y0 + dy * t
            paintBrushAtXY(xi, yi, value)
        }
    }

    function paintBrushAtXY(x: number, y: number, value: PixelValue) {
        const s = Math.max(
            BRUSH_MIN,
            Math.min(BRUSH_MAX, Math.floor(brushSize))
        )

        // ✅ STEP 6: фиксируем, что stroke реально изменяет холст
        if (!strokeDidMutateRef.current) {
            strokeDidMutateRef.current = true
        }

        const cellW = CANVAS_SIZE / cols
        const cellH = CANVAS_SIZE / rows

        // x/y в координатах "виртуального" холста 0..CANVAS_SIZE
        // Вместо "центральной клетки" считаем стартовую клетку квадрата кисти.
        // ROUND делает поведение чётной кисти предсказуемым (не уезжает влево/вверх из-за floor).
        const col0 = Math.round(x / cellW - s / 2)
        const row0 = Math.round(y / cellH - s / 2)

        // Step 2: overlay dirty отмечаем ТОЛЬКО при рисовании
        if (!overlayDirtyRef.current) {
            overlayDirtyRef.current = true
        }

        setOverlayPixels((prev) => {
            const next = prev.map((row) => row.slice())

            // ROUTE A2: first actual write (log once per stroke)
            let sampleR = Math.max(0, Math.min(gridSize - 1, row0))
            let sampleC = Math.max(0, Math.min(gridSize - 1, col0))
            const beforeSample = prev?.[sampleR]?.[sampleC] ?? null

            for (let rr = row0; rr < row0 + s; rr++) {
                for (let cc = col0; cc < col0 + s; cc++) {
                    if (rr < 0 || cc < 0 || rr >= gridSize || cc >= gridSize)
                        continue
                    next[rr][cc] = value
                }
            }

            const afterSample = next?.[sampleR]?.[sampleC] ?? null

            if (!strokeRouteLoggedWriteRef.current) {
                strokeRouteLoggedWriteRef.current = true

                routeLog("A2 OVERLAY WRITE (first in stroke)", {
                    id: strokeRouteIdRef.current,
                    g: gridSize,
                    brushS: s,
                    row0,
                    col0,
                    sampleR,
                    sampleC,
                    before: beforeSample,
                    after: afterSample,
                    overlayNonNullNext: countNonNullCells(next),
                })
            }

            strokeAfterOverlayRef.current = next

            return next
        })
    }

    function getCellFromEvent(e: any) {
        const viewport = viewportRef.current
        if (!viewport) return null

        const rect = viewport.getBoundingClientRect()

        // координаты указателя внутри viewport (в CSS-пикселях ПОСЛЕ FitToViewport)
        const xViewportPx = e.clientX - rect.left
        const yViewportPx = e.clientY - rect.top

        // внешний scale FitToViewport
        const fit = Math.max(0.0001, fitScaleRef.current || 1)

        // "unscaled viewport px" (как если бы FitToViewport scale = 1)
        const xViewportUnscaledPx = xViewportPx / fit
        const yViewportUnscaledPx = yViewportPx / fit

        // размеры viewport в "unscaled" px
        const viewportWUnscaledPx = rect.width / fit
        const viewportHUnscaledPx = rect.height / fit

        // переводим в координаты content (обратный transform редактора)
        // panX/panY/zoom считаются в НЕ-fit системе
        const xContentPx = (xViewportUnscaledPx - panX) / zoom
        const yContentPx = (yViewportUnscaledPx - panY) / zoom

        // переводим в координаты "виртуального" холста 0..CANVAS_SIZE
        const xCanvas = (xContentPx / viewportWUnscaledPx) * CANVAS_SIZE
        const yCanvas = (yContentPx / viewportHUnscaledPx) * CANVAS_SIZE

        // переводим в col/row
        const col = Math.floor((xCanvas / CANVAS_SIZE) * cols)
        const row = Math.floor((yCanvas / CANVAS_SIZE) * rows)

        if (row < 0 || row >= rows || col < 0 || col >= cols) return null
        return { row, col }
    }

    function paintBrush(
        centerRow: number,
        centerCol: number,
        value: PixelValue
    ) {
        const { start, end } = getBrushBounds(brushSize)

        setOverlayPixels((prev) => {
            const next = prev.map((row) => row.slice())

            for (let dr = start; dr <= end; dr++) {
                for (let dc = start; dc <= end; dc++) {
                    const rr = centerRow + dr
                    const cc = centerCol + dc
                    if (rr < 0 || cc < 0 || rr >= gridSize || cc >= gridSize)
                        continue
                    next[rr][cc] = value
                }
            }
            strokeAfterOverlayRef.current = next

            return next
        })
    }

    function commitBrushPreviewDOM() {
        brushPreviewRafRef.current = 0

        const el = brushPreviewRef.current
        const p = brushPreviewPendingRef.current
        if (!el || !p) return

        if (!p.show) {
            el.style.display = "none"
            return
        }

        el.style.display = "block"
        el.style.position = "absolute"
        el.style.left = "0px"
        el.style.top = "0px"
        el.style.width = `${p.wPx}px`
        el.style.height = `${p.hPx}px`
        el.style.transform = `translate(${p.leftPx}px, ${p.topPx}px)`
        el.style.willChange = "transform"
    }

    function hideBrushPreview() {
        brushPreviewPendingRef.current = {
            show: false,
            leftPx: 0,
            topPx: 0,
            wPx: 0,
            hPx: 0,
        }

        if (!brushPreviewRafRef.current) {
            brushPreviewRafRef.current = requestAnimationFrame(
                commitBrushPreviewDOM
            )
        }
    }

    function updatePointerFromEvent(e: any, inside: boolean = true) {
        const viewport = viewportRef.current
        if (!viewport) return

        const rect = viewport.getBoundingClientRect()

        // координаты указателя внутри viewport (в CSS-пикселях ПОСЛЕ FitToViewport)
        const xViewportPx = e.clientX - rect.left
        const yViewportPx = e.clientY - rect.top

        // --- FIX: учитываем внешний scale FitToViewport ---
        const fit = Math.max(0.0001, fitScaleRef.current || 1)

        // "unscaled viewport px" (как если бы FitToViewport scale = 1)
        const xViewportUnscaledPx = xViewportPx / fit
        const yViewportUnscaledPx = yViewportPx / fit

        // размеры viewport в "unscaled" px
        const viewportWUnscaledPx = rect.width / fit
        const viewportHUnscaledPx = rect.height / fit

        // переводим в координаты content (обратный transform редактора)
        // panX/panY/zoom здесь считаются в НЕ-fit системе, поэтому работаем в unscaled px
        const xContentPx = (xViewportUnscaledPx - panX) / zoom
        const yContentPx = (yViewportUnscaledPx - panY) / zoom

        // переводим в координаты "виртуального" холста 0..CANVAS_SIZE
        const x = (xContentPx / viewportWUnscaledPx) * CANVAS_SIZE
        const y = (yContentPx / viewportHUnscaledPx) * CANVAS_SIZE

        // --- размеры рамки в координатах CANVAS_SIZE ---
        const cellW = CANVAS_SIZE / cols
        const cellH = CANVAS_SIZE / rows

        const brushW = brushSize * cellW
        const brushH = brushSize * cellH

        // padding считаем от размера одной ячейки
        const padX = cellW * BRUSH_PREVIEW_PAD_CELL
        const padY = cellH * BRUSH_PREVIEW_PAD_CELL

        const previewW = brushW + 2 * padX
        const previewH = brushH + 2 * padY

        // сохраним для дебага/возможных будущих шагов
        pointerRef.current = { x, y, inside, w: previewW, h: previewH }

        const canShowPreview =
            SHOW_BRUSH_PREVIEW && toolMode === "brush" && !isPanning
        const el = brushPreviewRef.current
        if (!el) return

        // --- S7: никаких “живых” layout-обновлений в move: только rAF+transform ---
        if (!canShowPreview || !inside) {
            brushPreviewPendingRef.current = {
                show: false,
                leftPx: 0,
                topPx: 0,
                wPx: 0,
                hPx: 0,
            }
            if (!brushPreviewRafRef.current) {
                brushPreviewRafRef.current = requestAnimationFrame(
                    commitBrushPreviewDOM
                )
            }
            return
        }

        // Конвертируем размеры превью из CANVAS_SIZE → content px (unscaled viewport px)
        // ВАЖНО: brushPreviewRef живёт ВНУТРИ zoom/pan контейнера,
        // поэтому сюда нельзя подмешивать zoom/fit — они применятся DOM-трансформами сами.
        const previewWContentPx = (previewW / CANVAS_SIZE) * viewportWUnscaledPx
        const previewHContentPx = (previewH / CANVAS_SIZE) * viewportHUnscaledPx

        // ✅ КЛЮЧЕВОЙ FIX:
        // позиционируем рамку в ЛОКАЛЬНЫХ координатах content (до zoom/pan),
        // иначе translate будет дополнительно масштабирован zoom-ом и даст дрейф к правому-нижнему углу.
        const leftPx = xContentPx - previewWContentPx / 2
        const topPx = yContentPx - previewHContentPx / 2

        brushPreviewPendingRef.current = {
            show: true,
            leftPx,
            topPx,
            wPx: previewWContentPx,
            hPx: previewHContentPx,
        }

        if (!brushPreviewRafRef.current) {
            brushPreviewRafRef.current = requestAnimationFrame(
                commitBrushPreviewDOM
            )
        }
    }

    function handlePointerLeave() {
        pointerRef.current.inside = false
        hideBrushPreview()
    }

    function stopDrawing(e: any, reason: string = "pointerup") {
        if (e && typeof e.preventDefault === "function") {
            e.preventDefault()
        }

        // --- Step 7: stop panning ---
        if (panSessionRef.current.active) {
            panSessionRef.current.active = false
            setIsPanning(false)
            return
        }

        lastDrawPointRef.current = null
        setIsDrawing(false)

        if (strokeDidMutateRef.current && strokeBeforeRef.current) {
            pushCommit(strokeBeforeRef.current)

            postCommitGridHook(
                {
                    imagePixels,
                    overlayPixels:
                        strokeAfterOverlayRef.current ?? overlayPixels,
                    autoSwatches,
                    userSwatches,
                },
                "stroke"
            )
        }

        // сброс refs stroke
        strokeBeforeRef.current = null
        strokeDidMutateRef.current = false
        strokeAfterOverlayRef.current = null

        // ✅ эталон обновляем на завершение жеста (неважно как он закончился)
        commitPaintRefIfDirty(reason)

        // 🔒 S5 ARCH-INVARIANT:
        // 1) pointerup/cancel завершает STREAM
        // 2) ДО unlock мы ОБЯЗАНЫ зафиксировать эталон штрихов (paintRefImageData)
        // 3) Любое overlay-requant после этого имеет право читать ТОЛЬКО эталон (не overlayPixels)

        // S1: release STREAM-lock строго ПОСЛЕ обязательного снапшота
        if (busyKindRef.current === "stream") {
            busyKindRef.current = null
            drainAfterUnlock()
        }
    }

    function handleCanvasPointerLeave(e: any) {
        pointerRef.current = { ...pointerRef.current, inside: false }
        hideBrushPreview()
        stopDrawing(e, "pointerleave")
    }

    function handleCanvasPointerCancel(e: any) {
        pointerRef.current = { ...pointerRef.current, inside: false }
        hideBrushPreview()
        stopDrawing(e, "pointercancel")
    }

    function handleClear() {
        if (originalImageData) {
            // Импорт есть → Clear чистит только overlay, импортный контекст сохраняем
            setOverlayPixels(createEmptyPixels(gridSize))
        } else {
            // Импорта нет → это “пустой проект”
            setOverlayPixels(createEmptyPixels(gridSize))
            setImagePixels(createEmptyPixels(gridSize))

            // Patch E: сбрасываем импортный контекст (только тут это корректно)
            setHasImportContext(false)
            setOriginalImageData(null)
        }
    }

    function handleImageChange(event: any) {
        const input = event?.target as HTMLInputElement | null
        const file =
            input?.files && input.files.length > 0 ? input.files[0] : null

        if (input) input.value = ""

        if (!file) {
            console.warn("[IMPORT][file] empty selection")
            return
        }

        // старт нового импорта: overrides должны обнулиться (контракт словаря)
        resetAutoOverridesForNewImport()

        enqueueTxn("importLoad", () => onRequestCropFromFile({ file }))
    }

    function openFileDialog() {
        // единая точка: ROOT держит <input type="file" .../> и общий обработчик ошибок импорта
        onRequestPickImage?.()
    }

    function toggleImageVisibility() {
        setShowImage((prev) => !prev)
    }

    // ------------------- SWATCH EDIT -------------------

    function openColorEditor(swatchId: SwatchId) {
        const sw = swatchById.get(swatchId)
        if (!sw) return

        const hex = cssColorToHex(sw.color).toUpperCase()
        const { r, g, b } = hexToRgb(hex)
        const hsv = rgbToHsv(r, g, b)

        setEditingSwatchId(swatchId)
        setPendingTransparent(!!sw.isTransparent)
        setPendingColor(hex)

        setPickerHue(hsv.h)
        setPickerSV({ s: hsv.s, v: hsv.v })

        setHexDraft((hex || "#FF0000").toUpperCase())

        setIsColorModalOpen(true)
    }

    function applySwatchChange(
        swatchId: SwatchId,
        newColor: string,
        makeTransparent: boolean
    ) {
        // Step 2: для auto-* пишем diff в autoOverrides (без чистки)
        if (typeof swatchId === "string" && swatchId.startsWith("auto-")) {
            const hexUpper = (newColor || "").toUpperCase()

            setAutoOverrides((prev) => {
                const next: AutoSwatchOverridesMap = { ...(prev || {}) }

                const isHex = /^#[0-9A-F]{6}$/.test(hexUpper)
                const hasAny = isHex || typeof makeTransparent === "boolean"

                if (!hasAny) {
                    delete next[swatchId]
                    return next
                }

                const entry: AutoSwatchOverride = {}
                if (isHex) entry.hex = hexUpper
                entry.isTransparent = !!makeTransparent

                next[swatchId] = entry
                return next
            })
        }
        setAutoSwatches((prev) =>
            prev.map((s) =>
                s.id === swatchId
                    ? {
                          ...s,
                          color: newColor.toUpperCase(),
                          isTransparent: makeTransparent,
                      }
                    : s
            )
        )
        setUserSwatches((prev) =>
            prev.map((s) =>
                s.id === swatchId
                    ? {
                          ...s,
                          color: newColor.toUpperCase(),
                          isTransparent: makeTransparent,
                      }
                    : s
            )
        )
    }

    function buildNextSwatchesForEdit(
        swatchId: SwatchId,
        newColorUpper: string,
        makeTransparent: boolean
    ): { nextAuto: Swatch[]; nextUser: Swatch[] } {
        const patch = (s: Swatch) =>
            s.id === swatchId
                ? { ...s, color: newColorUpper, isTransparent: makeTransparent }
                : s

        return {
            nextAuto: autoSwatches.map(patch),
            nextUser: userSwatches.map(patch),
        }
    }

    function swatchKey(s: Swatch): string {
        const col = (s.color || "").toUpperCase()
        const tr = s.isTransparent ? "1" : "0"
        return `${col}|${tr}`
    }

    function remapGridById(
        grid: PixelValue[][],
        idMap: Record<string, string>
    ): PixelValue[][] {
        if (!grid || grid.length === 0) return grid
        let changed = false
        const out = grid.map((row) => {
            let rowChanged = false
            const nextRow = row.map((v) => {
                if (typeof v === "string" && idMap[v] && idMap[v] !== v) {
                    rowChanged = true
                    return idMap[v] as any
                }
                return v
            })
            if (rowChanged) changed = true
            return rowChanged ? nextRow : row
        })
        return changed ? out : grid
    }

    function collapseDuplicateSwatchesAndRemap(input: {
        imagePixels: PixelValue[][]
        overlayPixels: PixelValue[][]
        nextAuto: Swatch[]
        nextUser: Swatch[]
        nextAutoOverrides: AutoSwatchOverridesMap
        selectedSwatch: SwatchId | "transparent"
    }): {
        imagePixels: PixelValue[][]
        overlayPixels: PixelValue[][]
        autoSwatches: Swatch[]
        userSwatches: Swatch[]
        autoOverrides: AutoSwatchOverridesMap
        selectedSwatch: SwatchId | "transparent"
    } {
        const all = [...input.nextAuto, ...input.nextUser]

        // канон: первый встретившийся ключ — “победитель”
        const winnerByKey = new Map<string, SwatchId>()
        const remap: Record<string, string> = {}

        for (const s of all) {
            const key = swatchKey(s)
            const win = winnerByKey.get(key)
            if (!win) {
                winnerByKey.set(key, s.id)
                remap[String(s.id)] = String(s.id)
            } else {
                remap[String(s.id)] = String(win)
            }
        }

        // если реально ничего не схлопнулось — быстро выходим
        let anyCollapse = false
        for (const k of Object.keys(remap)) {
            if (remap[k] !== k) {
                anyCollapse = true
                break
            }
        }
        if (!anyCollapse) {
            return {
                imagePixels: input.imagePixels,
                overlayPixels: input.overlayPixels,
                autoSwatches: input.nextAuto,
                userSwatches: input.nextUser,
                autoOverrides: input.nextAutoOverrides,
                selectedSwatch: input.selectedSwatch,
            }
        }

        const nextImage = remapGridById(input.imagePixels, remap)
        const nextOverlay = remapGridById(input.overlayPixels, remap)

        const keptId = new Set<string>()
        for (const id of Object.values(remap)) keptId.add(String(id))

        const nextAuto = input.nextAuto.filter((s) => keptId.has(String(s.id)))
        const nextUser = input.nextUser.filter((s) => keptId.has(String(s.id)))

        // перенос/чистка overrides:
        // - если auto-* схлопнули в другой auto-* и у победителя нет override — переносим
        // - если схлопнули в user-* — override выкидываем (он не применим)
        const outOverrides: AutoSwatchOverridesMap = {
            ...(input.nextAutoOverrides || {}),
        }
        for (const from of Object.keys(outOverrides)) {
            if (!from.startsWith("auto-")) continue
            const to = remap[from]
            if (!to || to === from) continue

            const entry = outOverrides[from]
            delete outOverrides[from]

            if (typeof to === "string" && to.startsWith("auto-")) {
                if (!outOverrides[to]) outOverrides[to] = entry
            }
        }

        const nextSelected =
            input.selectedSwatch === "transparent"
                ? "transparent"
                : ((remap[String(input.selectedSwatch)] ||
                      String(input.selectedSwatch)) as any)

        return {
            imagePixels: nextImage,
            overlayPixels: nextOverlay,
            autoSwatches: nextAuto,
            userSwatches: nextUser,
            autoOverrides: pruneAutoOverridesForCurrentAuto(
                nextAuto,
                outOverrides
            ),
            selectedSwatch: nextSelected,
        }
    }

    function handleModalApply() {
        if (!editingSwatchId) {
            setIsColorModalOpen(false)
            return
        }

        const before = makeProjectState()

        // 1) вычисляем “истинный” цвет для применения:
        //    - если прозрачный: цвет неважен, но оставим pendingColor
        //    - иначе: если hexDraft валиден — берём его (даже если blur не случился)
        let colorUpper = (pendingColor || "#FF0000").toUpperCase()

        if (!pendingTransparent) {
            const norm = normalizeHexForCommit(hexDraft)
            if (isValidHex6(norm)) {
                colorUpper = norm.toUpperCase()
            }
        }

        // 2) готовим next swatches (локально, синхронно)
        const { nextAuto, nextUser } = buildNextSwatchesForEdit(
            editingSwatchId,
            colorUpper,
            pendingTransparent
        )

        // 3) next overrides (тоже локально, синхронно)
        let nextAutoOverrides: AutoSwatchOverridesMap = {
            ...(autoOverrides || {}),
        }
        if (
            typeof editingSwatchId === "string" &&
            editingSwatchId.startsWith("auto-")
        ) {
            const hasHex = /^#[0-9A-F]{6}$/.test(colorUpper)
            const entry: any = {}
            if (!pendingTransparent && hasHex) entry.hex = colorUpper
            entry.isTransparent = !!pendingTransparent
            nextAutoOverrides[editingSwatchId] = entry
        }

        // 4) схлопываем дубликаты и ремапим пиксели + selectedSwatch
        const collapsed = collapseDuplicateSwatchesAndRemap({
            imagePixels,
            overlayPixels,
            nextAuto,
            nextUser,
            nextAutoOverrides,
            selectedSwatch: selectedSwatch as any,
        })

        // 5) применяем состояние
        setAutoSwatches(collapsed.autoSwatches)
        setUserSwatches(collapsed.userSwatches)
        setImagePixels(collapsed.imagePixels)
        setOverlayPixels(collapsed.overlayPixels)
        setAutoOverrides(collapsed.autoOverrides)
        setSelectedSwatch(collapsed.selectedSwatch as any)

        postCommitGridHook(
            {
                imagePixels: collapsed.imagePixels,
                overlayPixels: collapsed.overlayPixels,
                autoSwatches: collapsed.autoSwatches,
                userSwatches: collapsed.userSwatches,
            },
            "swatch-edit"
        )

        pushCommit(before)

        setIsColorModalOpen(false)
        setEditingSwatchId(null)
    }

    function handleModalCancel() {
        setIsColorModalOpen(false)
        setEditingSwatchId(null)
    }

    // ------------------- ADD SWATCH -------------------

    function addUserSwatch() {
        const id = `user-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 8)}`
        const newSwatch: Swatch = {
            id,
            color: bg, // ✅ цвет фона
            isTransparent: false,
            isUser: true,
        }
        setUserSwatches((prev) => [...prev, newSwatch])
    }

    // ------------------- EXPORT -------------------

    // Strict feature detection (no try/catch), SSR-safe
    const supportsFileSystemAccess =
        typeof window !== "undefined" && "showSaveFilePicker" in window

    function getSavePickerOptionsForFilename(filename: string) {
        const lower = filename.toLowerCase()
        const isPng = lower.endsWith(".png")
        const isSvg = lower.endsWith(".svg")

        const pickerOpts: any = {
            suggestedName: filename,
        }

        if (isPng) {
            pickerOpts.types = [
                {
                    description: "PNG Image",
                    accept: { "image/png": [".png"] },
                },
            ]
        } else if (isSvg) {
            pickerOpts.types = [
                {
                    description: "SVG Image",
                    accept: { "image/svg+xml": [".svg"] },
                },
            ]
        }

        return pickerOpts
    }

    function downloadBlob(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    async function saveBlobFromProducer(
        produceBlob: () => Promise<Blob | null>,
        filename: string
    ) {
        // SSR safety
        if (typeof window === "undefined") {
            const b = await produceBlob()
            if (b) downloadBlob(b, filename)
            return
        }

        const anyWin = window as any
        const canSaveAs =
            supportsFileSystemAccess &&
            window.isSecureContext &&
            typeof anyWin.showSaveFilePicker === "function"

        // 1) Если можем — открываем Save As СРАЗУ (пока есть user gesture)
        if (canSaveAs) {
            let handle: any = null
            try {
                handle = await anyWin.showSaveFilePicker(
                    getSavePickerOptionsForFilename(filename)
                )
            } catch (e: any) {
                // cancel → ничего не делаем
                if (e?.name === "AbortError") return
                // прочие ошибки → fallback download ниже
                handle = null
            }

            // 2) Готовим blob уже после выбора файла
            const blob = await produceBlob()
            if (!blob) return

            if (handle) {
                try {
                    const writable = await handle.createWritable()
                    await writable.write(blob)
                    await writable.close()
                    return
                } catch (e: any) {
                    // permission/прочее → fallback download ниже
                }
            }

            // fallback download
            downloadBlob(blob, filename)
            return
        }

        // нет API → старый download
        const blob = await produceBlob()
        if (!blob) return
        downloadBlob(blob, filename)
    }

    async function saveBlob(blob: Blob, filename: string) {
        // SSR safety
        if (typeof window === "undefined") {
            downloadBlob(blob, filename)
            return
        }

        // File System Access API (Save As)
        const anyWin = window as any

        const canSaveAs =
            supportsFileSystemAccess &&
            window.isSecureContext &&
            typeof anyWin.showSaveFilePicker === "function"

        if (canSaveAs) {
            try {
                // mime + extension
                const lower = filename.toLowerCase()
                const isPng = lower.endsWith(".png")
                const isSvg = lower.endsWith(".svg")

                const pickerOpts: any = {
                    suggestedName: filename,
                }

                // types must match extension; for unknown extensions do not force a fake type
                if (isPng) {
                    pickerOpts.types = [
                        {
                            description: "PNG Image",
                            accept: { "image/png": [".png"] },
                        },
                    ]
                } else if (isSvg) {
                    pickerOpts.types = [
                        {
                            description: "SVG Image",
                            accept: { "image/svg+xml": [".svg"] },
                        },
                    ]
                }

                const handle = await anyWin.showSaveFilePicker(pickerOpts)
                const writable = await handle.createWritable()
                await writable.write(blob)
                await writable.close()
                return
            } catch (e: any) {
                // Если пользователь отменил диалог — ничего не делаем (и НЕ скачиваем через fallback)
                if (e?.name === "AbortError") return
                // иначе — fallback ниже
            }
        }

        // Fallback — старый download
        downloadBlob(blob, filename)
    }

    async function exportPNG(p?: {
        includeStroke: boolean
        includeImage: boolean
    }) {
        const includeStroke = p?.includeStroke ?? true
        const includeImage = p?.includeImage ?? true

        const rows = gridSize
        const cols = gridSize

        const exportSize = computeExportSize(rows)
        const px = exportSize / rows

        const out = document.createElement("canvas")
        out.width = exportSize
        out.height = exportSize

        const ctx = out.getContext("2d")
        if (!ctx) return

        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, exportSize, exportSize)

        for (let r = 0; r < rows; r++) {
            const iRow = imagePixels[r]
            const oRow = overlayPixels[r]

            for (let c = 0; c < cols; c++) {
                let v: any = null

                // includeStroke=false → полностью игнорируем overlay (включая “ластик”)
                if (includeStroke) {
                    const o = oRow?.[c] ?? null
                    if (o != null) {
                        // overlay имеет приоритет всегда, включая прозрачность (ластик)
                        v = o
                    }
                }

                // includeImage=false → игнорируем image, остаются только штрихи (или пусто)
                if (v == null && includeImage) {
                    // экспорт НЕ зависит от showImage
                    v = iRow?.[c] ?? null
                }

                if (!v) continue
                if (isTransparentValue(v)) continue

                const finalColor = resolveToColor(v)
                if (!finalColor) continue

                ctx.fillStyle = finalColor
                ctx.fillRect(c * px, r * px, px, px)
            }
        }

        await saveBlobFromProducer(async () => {
            const blob = await new Promise<Blob | null>((resolve) => {
                out.toBlob((b) => resolve(b), "image/png")
            })
            return blob
        }, "pixtudio.png")
    }

    async function exportSVG(p?: {
        includeStroke: boolean
        includeImage: boolean
    }) {
        const includeStroke = p?.includeStroke ?? true
        const includeImage = p?.includeImage ?? true

        const rows = gridSize
        const cols = gridSize

        const exportSize = computeExportSize(rows)
        const px = exportSize / rows

        const rects: string[] = []

        for (let r = 0; r < rows; r++) {
            const iRow = imagePixels[r]
            const oRow = overlayPixels[r]

            for (let c = 0; c < cols; c++) {
                let v: any = null

                if (includeStroke) {
                    const o = oRow?.[c] ?? null
                    if (o != null) {
                        // overlay имеет приоритет всегда, включая прозрачность (ластик)
                        v = o
                    }
                }

                if (v == null && includeImage) {
                    // экспорт НЕ зависит от showImage
                    v = iRow?.[c] ?? null
                }

                if (!v) continue
                if (isTransparentValue(v)) continue

                const finalColor = resolveToColor(v)
                if (!finalColor) continue

                rects.push(
                    `<rect x="${c * px}" y="${r * px}" width="${px}" height="${px}" fill="${finalColor}" />`
                )
            }
        }

        const svg =
            `<?xml version="1.0" encoding="UTF-8"?>` +
            `<svg xmlns="http://www.w3.org/2000/svg" ` +
            `width="${exportSize}" height="${exportSize}" ` +
            `viewBox="0 0 ${exportSize} ${exportSize}" shape-rendering="crispEdges">` +
            rects.join("") +
            `</svg>`

        await saveBlobFromProducer(async () => {
            const blob = new Blob([svg], {
                type: "image/svg+xml;charset=utf-8",
            })
            return blob
        }, "pixtudio-icon.svg")
    }

    // ------------------- OVERLAY MENU (#3/#4) -------------------

    const clampN = (v: number, min: number, max: number) =>
        Math.max(min, Math.min(max, v))

    // FIX: anchor must be captured from the button on the same user gesture.

    const openImport = (e?: React.MouseEvent) => {
        let rect: DOMRect | null = null

        const t = e?.currentTarget
        if (t && t instanceof HTMLElement) {
            rect = t.getBoundingClientRect()
        } else {
            // fallback: measure by ref (in case called programmatically)
            const el = importBtnRef.current
            rect = el instanceof HTMLElement ? el.getBoundingClientRect() : null
        }

        setOverlayAnchorRect(rect)
        setOverlayMode("import")
    }

    const openExport = (e?: React.MouseEvent) => {
        if (isExporting) return

        let rect: DOMRect | null = null

        const t = e?.currentTarget
        if (t && t instanceof HTMLElement) {
            rect = t.getBoundingClientRect()
        } else {
            const el = exportBtnRef.current
            rect = el instanceof HTMLElement ? el.getBoundingClientRect() : null
        }

        setOverlayAnchorRect(rect)
        setOverlayMode("export")
    }

    const closeOverlay = () => {
        setOverlayMode(null)
        setOverlayAnchorRect(null)
    }

    const toggleManual = () => {
        // на всякий случай: если было открыто Import/Export — закрываем
        closeOverlay()
        setManualOpen((v) => !v)
    }

    const closeManual = () => {
        setManualOpen(false)
    }

    const runExport = async (kind: "png" | "svg") => {
        // Enterprise: ignore re-entry (no toasts, no alerts)
        if (isExporting) return

        // STEP 5.6 железобетон:
        // 1) модалка закрывается ДО любого SaveAs/download
        closeOverlay()

        setIsExporting(true)
        try {
            // 2) SaveAs запускается строго от user gesture:
            // runExport() вызывается только из onClick PNG/SVG
            if (kind === "png") {
                await exportPNG({
                    includeStroke: exportIncludeStroke,
                    includeImage: exportIncludeImage,
                })
            } else {
                await exportSVG({
                    includeStroke: exportIncludeStroke,
                    includeImage: exportIncludeImage,
                })
            }
        } finally {
            setIsExporting(false)
        }
    }

    const handleBlankCanvas = () => {
        // S2-1: закрыть Import overlay СРАЗУ, чтобы UI не зависал
        closeOverlay()

        // S2-2: busy lock через очередь транзакций (без async/heavy)
        enqueueTxn("importLoad", () => {
            // S3: инициализация пустого проекта (строго синхронно)
            applyBlankProject(gridSize)

            // S2-4: “перейти в Editor”
            // В текущей архитектуре Editor уже под overlay,
            // закрытие overlay выше делает Editor видимым.
            // Если у тебя есть router/screen — дерни здесь:
            // setScreen("editor")
        })
    }

    const updateOverlayAnchor = React.useCallback(() => {
        const el =
            overlayMode === "import"
                ? importBtnRef.current
                : overlayMode === "export"
                  ? exportBtnRef.current
                  : null

        if (!el) {
            setOverlayAnchorRect(null)
            return
        }

        setOverlayAnchorRect(el.getBoundingClientRect())
    }, [overlayMode])

    useIsomorphicLayoutEffect(() => {
        if (!overlayMode) return

        // keep-up only
        updateOverlayAnchor()

        const onReflow = () => updateOverlayAnchor()
        window.addEventListener("resize", onReflow)
        window.addEventListener("scroll", onReflow, true)

        return () => {
            window.removeEventListener("resize", onReflow)
            window.removeEventListener("scroll", onReflow, true)
        }
    }, [overlayMode, updateOverlayAnchor])

    // ---- custom picker interactions ----
    const svRef = React.useRef<HTMLDivElement | null>(null)
    const hueRef = React.useRef<HTMLDivElement | null>(null)
    const [dragSV, setDragSV] = React.useState(false)
    const [dragHue, setDragHue] = React.useState(false)

    const setColorFromHSV = React.useCallback(
        (h: number, s01: number, v01: number) => {
            const rgb = hsvToRgb(h, clamp(s01, 0, 1), clamp(v01, 0, 1))
            const hex = rgbToHex(rgb.r, rgb.g, rgb.b)
            pendingColorFromHSVRef.current = true
            setPendingColor(hex)
        },
        []
    )

    React.useEffect(() => {
        if (pendingTransparent) return
        setColorFromHSV(pickerHue, pickerSV.s, pickerSV.v)
    }, [pickerHue, pickerSV, pendingTransparent, setColorFromHSV])

    const onSVAt = (clientX: number, clientY: number) => {
        const el = svRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const x = clamp((clientX - r.left) / r.width, 0, 1)
        const y = clamp((clientY - r.top) / r.height, 0, 1)
        const s = x
        const v = 1 - y
        setPickerSV({ s, v })
    }

    const onHueAt = (clientX: number) => {
        const el = hueRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const x = clamp((clientX - r.left) / r.width, 0, 1)
        setPickerHue(x * 360)
    }

    React.useEffect(() => {
        const onMove = (e: PointerEvent) => {
            if (dragSV) onSVAt(e.clientX, e.clientY)
            if (dragHue) onHueAt(e.clientX)
        }
        const onUp = () => {
            if (dragSV) setDragSV(false)
            if (dragHue) setDragHue(false)
        }
        window.addEventListener("pointermove", onMove)
        window.addEventListener("pointerup", onUp)
        window.addEventListener("pointercancel", onUp)
        return () => {
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onUp)
        }
    }, [dragSV, dragHue])

    const hueColor = `hsl(${Math.round(pickerHue)}, 100%, 50%)`
    const svX = pickerSV.s
    const svY = 1 - pickerSV.v

    // HEX2: pendingColor -> hexDraft
    React.useEffect(() => {
        if (pendingTransparent) return

        const canon = (pendingColor || "#FF0000").toUpperCase()

        // если pendingColor пришёл из HSV — обновляем hexDraft всегда
        if (pendingColorFromHSVRef.current) {
            pendingColorFromHSVRef.current = false
            setHexDraft(canon)
            return
        }

        // если пользователь печатает — НЕ перетираем невалидный ввод
        if (hexIsEditingRef.current) {
            const norm = normalizeHexForCommit(hexDraft)
            const isValid = /^#[0-9A-F]{6}$/.test(norm)
            if (!isValid) return
        }

        // иначе можно синхронизировать
        setHexDraft(canon)
    }, [pendingColor, pendingTransparent])

    // ------------------- PALETTE LAYOUT ORDER -------------------
    // 1) autoSwatches
    // 2) transparent tool
    // 3) add button
    // 4) userSwatches

    const SWATCH_PX = 26
    const SWATCH_GAP = 10

    const renderSwatchButton = (sw: Swatch) => {
        const isActive = selectedSwatch === sw.id

        let longPressTimeout: number | null = null
        const cancelLongPress = () => {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout)
                longPressTimeout = null
            }
        }

        return (
            <button
                key={sw.id}
                type="button"
                onClick={() => setSelectedSwatch(sw.id)}
                onContextMenu={(e) => {
                    e.preventDefault()
                    openColorEditor(sw.id)
                }}
                onPointerDown={(e: any) => {
                    if (e.pointerType === "touch") {
                        longPressTimeout = window.setTimeout(() => {
                            openColorEditor(sw.id)
                        }, 600)
                    }
                }}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                title={
                    sw.isTransparent
                        ? `${TRANSPARENT_LABEL} Swatch`
                        : sw.color || ""
                }
                style={{
                    width: SWATCH_PX,
                    height: SWATCH_PX,
                    borderRadius: 0,
                    padding: 0,
                    cursor: "pointer",
                    background: sw.isTransparent
                        ? checkerBackground
                        : sw.color || "",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: "border-box",
                    border: isActive
                        ? "2px solid rgba(0,0,0,0.95)"
                        : "1px solid rgba(0,0,0,0.25)",
                }}
            />
        )
    }

    return (
        <FitToViewport
            background={bg}
            onScale={(s) => {
                // FitToViewport может давать любое число, но нам нужна безопасная нижняя граница
                fitScaleRef.current = Math.max(0.0001, s || 1)
            }}
        >
            <div
                style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    padding: 7,
                    paddingTop: 10,
                    boxSizing: "border-box",
                    margin: "0 auto",
                    width: "100%",

                    // важно: как и в StartScreen — не держим "100%" высоты,
                    // чтобы FitToViewport мерил естественный контент
                    height: "auto",
                    minHeight: "auto",

                    fontFamily:
                        "Roboto, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                    //background: bg,
                }}
            >
                {/* Top toolbar (unified layout) */}
                <div
                    style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "center",
                        marginBottom: 12,
                    }}
                >
                    <div
                        style={{
                            width: "100%",
                            maxWidth: canvasMax,
                            display: "flex",
                            alignItems: "stretch",

                            // ✅ распределяем кнопки на всю ширину тулбара (ширина = ширина холста)
                            justifyContent: "space-between",
                            gap: "clamp(7px, 0.6vw, 8px)",

                            flexWrap: "nowrap",
                            minWidth: 0,
                        }}
                    >
                        {/* Block 0: Save / Load */}
                        <div style={{ display: "contents" }}>
                            <button
                                type="button"
                                onClick={onSaveProject}
                                aria-label="Save"
                                style={iconOnlyButton(true)}
                            >
                                <SaveIcon />
                            </button>

                            <button
                                type="button"
                                onClick={onLoadProject}
                                aria-label="Load"
                                style={iconOnlyButton(true)}
                            >
                                <LoadIcon />
                            </button>
                        </div>

                        {/* Block 1: Undo / Redo */}
                        <div style={{ display: "contents" }}>
                            <button
                                type="button"
                                onClick={doUndo}
                                disabled={!canUndo}
                                aria-label="Undo"
                                style={{
                                    ...iconOnlyButton(canUndo),
                                    opacity: canUndo ? 1 : 0.35,
                                }}
                            >
                                <UndoIcon />
                            </button>

                            <button
                                type="button"
                                onClick={doRedo}
                                disabled={!canRedo}
                                aria-label="Redo"
                                style={{
                                    ...iconOnlyButton(canRedo),
                                    opacity: canRedo ? 1 : 0.35,
                                }}
                            >
                                <RedoIcon />
                            </button>
                        </div>

                        {/* Block 2: Import / Export (keep refs + dropdown anchoring) */}
                        <div style={{ display: "contents" }}>
                            <button
                                ref={importBtnRef}
                                onClick={(e) => openImport(e)}
                                style={iconOnlyButton(true)}
                                aria-label="Import (Camera / Image)"
                            >
                                <SvgTopButton3
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "block",
                                        transform: "translateY(0px)",
                                    }}
                                />
                            </button>

                            <button
                                ref={exportBtnRef}
                                onClick={(e) => openExport(e)}
                                style={iconOnlyButton(true)}
                                aria-label="Export (PNG / SVG)"
                            >
                                <SvgTopButton4
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "block",
                                        transform: "translateY(0px)",
                                    }}
                                />
                            </button>
                        </div>

                        {/* Block 3: Zoom out / Zoom in */}
                        <div style={{ display: "contents" }}>
                            <button
                                type="button"
                                onClick={handleZoomOut}
                                onPointerDown={handleZoomOutPointerDown}
                                onPointerUp={handleZoomOutPointerUp}
                                onPointerCancel={handleZoomOutPointerUp}
                                onPointerLeave={handleZoomOutPointerUp}
                                onContextMenu={(e) => {
                                    e.preventDefault()
                                    resetView()
                                }}
                                aria-label="Zoom out (tap) / Reset view (long-press or right-click)"
                                style={iconOnlyButton(true)}
                            >
                                <ZoomOutIcon />
                            </button>

                            <button
                                type="button"
                                onClick={handleZoomIn}
                                aria-label="Zoom in"
                                style={iconOnlyButton(true)}
                            >
                                <ZoomInIcon />
                            </button>
                        </div>

                        {/* Block 4: Pipette / Hand */}
                        <div style={{ display: "contents" }}>
                            <button
                                type="button"
                                aria-label="Pipette tool"
                                onClick={() =>
                                    setToolMode((m) =>
                                        m === "pipette" ? "brush" : "pipette"
                                    )
                                }
                                style={{
                                    ...iconOnlyButton(true),
                                    opacity: toolMode === "pipette" ? 1 : 0.85,
                                    cursor: "pointer",
                                }}
                            >
                                <PipetteIcon
                                    size={50}
                                    active={toolMode === "pipette"}
                                />
                            </button>

                            <button
                                type="button"
                                aria-label="Hand tool"
                                onClick={() =>
                                    setToolMode((m) =>
                                        m === "hand" ? "brush" : "hand"
                                    )
                                }
                                style={{
                                    ...iconOnlyButton(false),
                                    opacity: toolMode === "hand" ? 1 : 0.85,
                                    cursor: "pointer",
                                }}
                            >
                                {toolMode === "hand" ? (
                                    <HandIconOn size={50} />
                                ) : (
                                    <HandIconOff size={50} />
                                )}
                            </button>
                        </div>

                        {/* Manual */}
                        <div style={{ display: "contents" }}>
                            <button
                                //ref={exportBtnRef}
                                type="button"
                                onClick={() => {
                                    toggleManual()
                                }}
                                style={iconOnlyButton(true)}
                                aria-label="Manual button"
                            >
                                <SvgManualButton
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "block",
                                        transform: "translateY(0px)",
                                    }}
                                />
                            </button>
                        </div>
                    </div>
                </div>

                {/* UI1: hidden file input for project load (NO-OP) */}
                <input
                    ref={loadFileInputRef}
                    type="file"
                    accept=".pixtudio,application/json"
                    onChange={handlePickedProjectFile}
                    style={{ display: "none" }}
                />

                {/* Canvas */}
                <div
                    style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <div
                        style={{
                            width: "100%",
                            maxWidth: canvasMax,
                            aspectRatio: "1 / 1",
                            border: "2px solid rgba(0,0,0,0.55)",
                            background: "#ffffff",
                            backgroundClip: "padding-box",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxSizing: "border-box",
                        }}
                    >
                        {/* ✅ ZOOM STEP 1: Viewport wrapper + Content layer (no transform yet) */}
                        <div
                            ref={viewportRef}
                            style={{
                                position: "relative",
                                width: "100%",
                                height: "100%",
                                overflow: "hidden", // важно: клиппинг "окна холста"

                                // --- Step 10: cursors ---
                                cursor:
                                    toolMode === "hand"
                                        ? isPanning
                                            ? "grabbing"
                                            : "grab"
                                        : toolMode === "pipette"
                                          ? "crosshair"
                                          : "crosshair",

                                userSelect: "none",

                                touchAction: "manipulation",
                            }}
                        >
                            {/* Content layer (пока без transform) */}
                            <div
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    top: 0,
                                    width: "100%",
                                    height: "100%",
                                    transformOrigin: "0 0",
                                    transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
                                }}
                            >
                                {/* ✅ ZOOM STEP 2: Canvas + overlay stack inside Content */}
                                <div
                                    style={{
                                        position: "relative",
                                        width: "100%",
                                        height: "100%",
                                    }}
                                >
                                    <canvas
                                        ref={canvasRef}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            imageRendering: "pixelated",
                                            touchAction: "none",
                                            cursor: overlayMode
                                                ? "default"
                                                : toolMode === "hand"
                                                  ? isPanning
                                                      ? "grabbing"
                                                      : "grab"
                                                  : "crosshair",

                                            display: "block",
                                        }}
                                        onPointerDown={handlePointerDown}
                                        onPointerMove={handlePointerMove}
                                        onPointerUp={stopDrawing}
                                        onPointerLeave={
                                            handleCanvasPointerLeave
                                        }
                                        onPointerCancel={
                                            handleCanvasPointerCancel
                                        }
                                    />

                                    {/* overlay слой (Единственный) */}
                                    <div
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            pointerEvents: "none",
                                        }}
                                    >
                                        {/* рамка кисти (двигается через brushPreviewRef) */}
                                        {SHOW_BRUSH_PREVIEW && !overlayMode && (
                                            <div
                                                ref={brushPreviewRef}
                                                style={{
                                                    position: "absolute",
                                                    border: "2px solid rgba(255,255,255,0.9)",
                                                    boxSizing: "border-box",
                                                    borderRadius: 0,
                                                    display: "none", // покажем, когда inside:true
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Controls area */}
                <div
                    style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "center",
                        marginTop: 18,
                    }}
                >
                    <div style={{ width: "100%", maxWidth: canvasMax }}>
                        {/* BRUSH SIZE (dummy UI only) */}
                        <div style={{ marginBottom: 18 }}>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                }}
                            >
                                <div style={labelStyle}>BRUSH SIZE:</div>
                                <div style={subLabelStyle}>
                                    {brushSize} × {brushSize}
                                </div>
                            </div>

                            {/* ---------- RANGE THUMB: use RangeCircle SVG as native slider thumb ---------- */}
                            <style>{`
  :root{
    --px-range-thumb: 30px; /* размер кружка */
    --px-track-h: 6px;      /* толщина полоски */
  }

  input.pxRange[type="range"]{
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    background: transparent; /* ВАЖНО: не красим сам input */
    cursor: pointer;

    /* чтобы трек и thumb красиво центрировались по высоте */
    height: var(--px-range-thumb);
    display: block;
  }

  /* ===== TRACK (рисуем заливку ТОЛЬКО здесь) ===== */
  input.pxRange[type="range"]::-webkit-slider-runnable-track{
    height: var(--px-track-h);
    border-radius: 0px;
    background: linear-gradient(
      to right,
      var(--px-track-fill, rgba(0,0,0,0.25)) 0%,
      var(--px-track-fill, rgba(0,0,0,0.25)) var(--px-track-pct, 0%),
      var(--px-track-rest, rgba(255,255,255,0.25)) var(--px-track-pct, 0%),
      var(--px-track-rest, rgba(255,255,255,0.25)) 100%
    );
  }

  input.pxRange[type="range"]::-moz-range-track{
    height: var(--px-track-h);
    border-radius: 0px;
    border: none;
    background: linear-gradient(
      to right,
      var(--px-track-fill, rgba(0,0,0,0.25)) 0%,
      var(--px-track-fill, rgba(0,0,0,0.25)) var(--px-track-pct, 0%),
      var(--px-track-rest, rgba(255,255,255,0.25)) var(--px-track-pct, 0%),
      var(--px-track-rest, rgba(255,255,255,0.25)) 100%
    );
  }

  /* ===== THUMB (MASK + COLOR + ICON) ===== */
  input.pxRange[type="range"]::-webkit-slider-thumb{
    -webkit-appearance: none;
    appearance: none;
    width: var(--px-range-thumb);
    height: var(--px-range-thumb);
    border: none;

    background-color: var(--px-thumb-color, #004e98);

    -webkit-mask-image: var(--px-range-circle);
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
    -webkit-mask-size: 100% 100%;

            mask-image: var(--px-range-circle);
            mask-repeat: no-repeat;
            mask-position: center;
            mask-size: 100% 100%;

    /* ✅ Центрирование кружка по вертикали относительно полоски */
    margin-top: calc((var(--px-track-h) - var(--px-range-thumb)) / 2);
  }

  input.pxRange[type="range"]::-moz-range-thumb{
    width: var(--px-range-thumb);
    height: var(--px-range-thumb);
    border: none;

    background-color: var(--px-thumb-color, #004e98);

    -webkit-mask-image: var(--px-range-circle);
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
    -webkit-mask-size: 100% 100%;

            mask-image: var(--px-range-circle);
            mask-repeat: no-repeat;
            mask-position: center;
            mask-size: 100% 100%;
  }

  input.pxRange[type="range"]:focus{
    outline: none;
  }
`}</style>

                            {(() => {
                                const RANGE_CIRCLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 134 134">
  <g fill="#FF00FF">
    <polygon points="58.6,134 58.6,125.6 33.5,125.6 33.5,117.2 25.1,117.2 25.1,108.8 16.7,108.8 16.7,100.5 8.4,100.5 8.4,75.3 0,75.3 0,58.6 8.4,58.6 8.4,33.5 16.7,33.5 16.7,25.1 25.1,25.1 25.1,16.7 33.5,16.7 33.5,8.4 58.6,8.4 58.6,0 75.3,0 75.3,8.4 100.5,8.4 100.5,16.7 108.8,16.7 108.8,25.1 117.2,25.1 117.2,33.5 125.6,33.5 125.6,58.6 134,58.6 134,75.3 125.6,75.3 125.6,100.5 117.2,100.5 117.2,108.8 108.8,108.8 108.8,117.2 100.5,117.2 100.5,125.6 75.3,125.6 75.3,134"/>
  </g>
</svg>`.trim()

                                const svgToDataUrl = (svg: string) => {
                                    const encoded = encodeURIComponent(svg)
                                        .replace(/'/g, "%27")
                                        .replace(/"/g, "%22")
                                    return `url("data:image/svg+xml,${encoded}")`
                                }

                                const circleUrl = svgToDataUrl(RANGE_CIRCLE_SVG)

                                return (
                                    <style>{`
:root{
  --px-range-circle: ${circleUrl};
}
`}</style>
                                )
                            })()}

                            {/* ---------- /RANGE THUMB ---------- */}

                            <div style={trackWrap}>
                                <input
                                    type="range"
                                    className="pxRange"
                                    min={BRUSH_MIN}
                                    max={BRUSH_MAX}
                                    step={BRUSH_STEP}
                                    value={brushSize}
                                    onChange={(e) => {
                                        setBrushSize(
                                            parseInt(e.currentTarget.value, 10)
                                        )
                                    }}
                                    style={
                                        {
                                            ...rangeStyleBase,
                                            ...(rangeTrackStyle
                                                ? rangeTrackStyle(
                                                      brushSize,
                                                      BRUSH_MIN,
                                                      BRUSH_MAX,
                                                      "#2F6BFF"
                                                  )
                                                : {}),
                                            "--px-thumb-color": "#2F6BFF",
                                        } as React.CSSProperties
                                    }
                                    disabled={!!overlayMode}
                                />
                            </div>
                        </div>

                        {/* GRID SIZE (real slider) */}
                        <div style={{ marginBottom: 18 }}>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                }}
                            >
                                <div style={labelStyle}>GRID SIZE:</div>
                                <div style={subLabelStyle}>
                                    {rows} × {cols}
                                </div>
                            </div>

                            <div style={trackWrap}>
                                <input
                                    type="range"
                                    className="pxRange"
                                    min={16}
                                    max={128}
                                    step={1}
                                    value={gridSize}
                                    onChange={(e) => {
                                        // ✅ мобилка: pointerdown может не прийти, но onChange приходит
                                        // Поэтому гарантируем старт "before-state" (один раз на жест)
                                        if (isMobileUI) {
                                            if (!gridResizeBeforeRef.current) {
                                                gridResizeBeforeRef.current =
                                                    makeProjectState()
                                            }
                                        }

                                        setGridSize(
                                            parseInt(e.currentTarget.value, 10)
                                        )
                                    }}
                                    onPointerDown={() => {
                                        // Если начинаем менять gridSize — запоминаем состояние ДО первого изменения
                                        if (!gridResizeBeforeRef.current) {
                                            gridResizeBeforeRef.current =
                                                makeProjectState()
                                        }
                                    }}
                                    onPointerUp={() => {
                                        commitGridResizeIfNeeded()
                                    }}
                                    onPointerLeave={() => {
                                        commitGridResizeIfNeeded()
                                    }}
                                    onPointerCancel={() => {
                                        commitGridResizeIfNeeded()
                                    }}
                                    // ✅ мобилка: явные touch-хуки (когда pointer events не приходят)
                                    onTouchStart={() => {
                                        if (!gridResizeBeforeRef.current) {
                                            gridResizeBeforeRef.current =
                                                makeProjectState()
                                        }
                                    }}
                                    onTouchEnd={() => {
                                        commitGridResizeIfNeeded()
                                    }}
                                    // ✅ страховка: на мобилке конец жеста иногда теряется
                                    onBlur={() => {
                                        commitGridResizeIfNeeded()
                                    }}
                                    style={
                                        {
                                            ...rangeStyleBase,
                                            ...rangeTrackStyle(
                                                gridSize,
                                                16,
                                                128,
                                                "#79c7b2"
                                            ),
                                            "--px-thumb-color": "#79c7b2",
                                        } as React.CSSProperties
                                    }
                                    disabled={!!overlayMode}
                                />
                            </div>
                        </div>

                        {/* PALETTE SIZE (real slider) */}
                        <div style={{ marginBottom: 14 }}>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                }}
                            >
                                <div style={labelStyle}>PALETTE SIZE:</div>
                                <div style={subLabelStyle}>
                                    {paletteCountActual} colors
                                </div>
                            </div>

                            <div style={trackWrap}>
                                <input
                                    type="range"
                                    className="pxRange"
                                    min={PALETTE_MIN}
                                    max={PALETTE_MAX}
                                    step={1}
                                    value={paletteCount}
                                    onChange={(e) => {
                                        setPaletteCount(
                                            parseInt(e.currentTarget.value, 10)
                                        )
                                    }}
                                    onPointerDown={() => {
                                        // ✅ если начинаем менять paletteCount — запоминаем состояние ДО первого изменения
                                        if (!paletteResizeBeforeRef.current) {
                                            paletteResizeBeforeRef.current =
                                                makeProjectState()
                                        }
                                    }}
                                    onPointerUp={() => {
                                        commitPaletteResizeIfNeeded()
                                    }}
                                    onPointerLeave={() => {
                                        commitPaletteResizeIfNeeded()
                                    }}
                                    onPointerCancel={() => {
                                        commitPaletteResizeIfNeeded()
                                    }}
                                    onBlur={() => {
                                        commitPaletteResizeIfNeeded()
                                    }}
                                    onTouchEnd={() => {
                                        commitPaletteResizeIfNeeded()
                                    }}
                                    style={
                                        {
                                            ...rangeStyleBase,
                                            ...rangeTrackStyle(
                                                paletteCount,
                                                PALETTE_MIN,
                                                PALETTE_MAX,
                                                "#d58a1c"
                                            ),
                                            "--px-thumb-color": "#d58a1c",
                                        } as React.CSSProperties
                                    }
                                    disabled={!!overlayMode}
                                />
                            </div>
                        </div>

                        {/* Palette row (palette full width + Clear under palette) */}
                        <div
                            style={{
                                marginTop: 6,
                                opacity: overlayMode ? 0.5 : 1,
                                pointerEvents: overlayMode
                                    ? "none"
                                    : ("auto" as any),
                                width: "100%",
                            }}
                        >
                            {/* Палитра на всю ширину блока холста */}
                            <div
                                style={{
                                    width: "100%",
                                    display: "grid",
                                    gridTemplateColumns: `repeat(auto-fill, ${SWATCH_PX}px)`,
                                    gap: SWATCH_GAP,
                                    alignItems: "start",
                                    justifyContent: "start",
                                }}
                            >
                                {/* swatches (sorted for UI) */}
                                {sortedAutoSwatchesForUI.map(
                                    renderSwatchButton
                                )}

                                {/* 2) transparent tool */}
                                <button
                                    type="button"
                                    onClick={() =>
                                        setSelectedSwatch("transparent")
                                    }
                                    title={TRANSPARENT_LABEL}
                                    style={{
                                        width: SWATCH_PX,
                                        height: SWATCH_PX,
                                        borderRadius: 0,
                                        padding: 0,
                                        cursor: "pointer",
                                        background: checkerBackground,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        border:
                                            selectedSwatch === "transparent"
                                                ? "2px solid rgba(255,255,255,0.95)"
                                                : "2px solid rgba(255,255,255,0.25)",
                                        boxShadow:
                                            selectedSwatch === "transparent"
                                                ? "0 0 0 2px rgba(0,0,0,0.6)"
                                                : "0 0 0 2px rgba(0,0,0,0.35)",
                                        boxSizing: "border-box",
                                    }}
                                />

                                {/* 3) add button INSIDE grid (после прозрачности) */}
                                <button
                                    type="button"
                                    onClick={addUserSwatch}
                                    title="Add swatch"
                                    style={{
                                        width: SWATCH_PX,
                                        height: SWATCH_PX,
                                        borderRadius: 999,
                                        background: "#2ecc71",
                                        display: "grid",
                                        placeItems: "center",
                                        color: "#fff",
                                        fontWeight: 900,
                                        fontSize: 15,
                                        lineHeight: 0.1,
                                        border: "2px solid rgba(0,0,0,0.15)",
                                        userSelect: "none",
                                        cursor: "pointer",
                                    }}
                                >
                                    +
                                </button>

                                {/* 4) user swatches */}
                                {sortedUserSwatchesForUI.map(
                                    renderSwatchButton
                                )}
                            </div>

                            {/* Clear под палитрой */}
                            <div style={{ marginTop: 12, width: "100%" }} />
                        </div>
                    </div>
                </div>

                {/* ------------------- MANUAL SCREEN (fullscreen) ------------------- */}
                {manualOpen &&
                    typeof document !== "undefined" &&
                    ReactDOM.createPortal(
                        <div
                            style={{
                                position: "fixed",
                                inset: 0,
                                zIndex: 10000, // выше всех overlay’ев/кропа
                                pointerEvents: "auto",
                            }}
                            onClick={(e) => {
                                // не даём кликам проваливаться “в редактор”
                                e.preventDefault()
                                e.stopPropagation()
                            }}
                        >
                            {/* сам мануал */}
                            <div
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                }}
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                }}
                            >
                                <ManualScreen onClose={closeManual} />
                            </div>
                        </div>,
                        document.body
                    )}

                {/* Overlay for #3 and #4 — anchored dropdown (close only by X) */}
                {overlayMode &&
                    !isColorModalOpen &&
                    typeof document !== "undefined" &&
                    ReactDOM.createPortal(
                        <div
                            style={{
                                position: "fixed",
                                inset: 0,

                                // ✅ Одинаковая подложка для Import и Export
                                background: "rgba(0,0,0,0.3)",
                                backdropFilter: "blur(10px)",
                                WebkitBackdropFilter: "blur(10px)",

                                zIndex: 999,
                                pointerEvents: "auto",
                            }}
                            onClick={(e) => e.stopPropagation()} // не закрываем по фону
                        >
                            {(() => {
                                const MENU_W = 300
                                const GAP = 10

                                // ✅ берём "живой" rect прямо из DOM как fallback,
                                // чтобы не зависеть от того, успел ли state overlayAnchorRect обновиться
                                const liveEl =
                                    overlayMode === "import"
                                        ? importBtnRef.current
                                        : overlayMode === "export"
                                          ? exportBtnRef.current
                                          : null

                                const rect =
                                    overlayAnchorRect ??
                                    (liveEl
                                        ? liveEl.getBoundingClientRect()
                                        : null)

                                // ✅ используем clientWidth (без плясок из-за скроллбара)
                                const vw =
                                    (typeof document !== "undefined" &&
                                    document.documentElement
                                        ? document.documentElement.clientWidth
                                        : window.innerWidth) ||
                                    window.innerWidth

                                const cx = rect
                                    ? rect.left + rect.width / 2
                                    : vw / 2
                                const top = (rect ? rect.bottom : 60) + 10

                                // ✅ используем локальный clampN (а не "какой-то clamp" из другого контекста)
                                const left = clampN(
                                    cx - MENU_W / 2,
                                    10,
                                    vw - 10 - MENU_W
                                )

                                const itemStyle: React.CSSProperties = {
                                    width: "100%",
                                    height: 30,
                                    background: "transparent",
                                    border: "none",
                                    padding: 0,
                                    margin: 0,
                                    cursor: "pointer",
                                    color: "#fff",
                                    fontWeight: 800,
                                    fontSize: 18,
                                    letterSpacing: 0.6,
                                    textTransform: "uppercase",
                                    lineHeight: "30px",
                                    textAlign: "center",
                                    userSelect: "none",
                                    textShadow: "0 2px 6px rgba(0,0,0,0.45)",
                                }

                                return (
                                    <div
                                        style={{
                                            position: "fixed",
                                            left,
                                            top,
                                            width: MENU_W,
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: GAP,
                                            pointerEvents: "auto",
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <button
                                            type="button"
                                            onClick={closeOverlay}
                                            aria-label="Close"
                                            style={{
                                                width: 23.4,
                                                height: 23.4,
                                                background: "transparent",
                                                border: "none",
                                                padding: 0,
                                                margin: 0,
                                                cursor: "pointer",
                                                display: "grid",
                                                placeItems: "center",
                                            }}
                                        >
                                            <SvgCloseIcon
                                                style={{
                                                    width: 50,
                                                    height: 50,
                                                    alignContent: "center",
                                                    display: "block",
                                                }}
                                            />
                                        </button>

                                        {overlayMode === "import" && (
                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                    gap: 28,
                                                    marginTop: 10,
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        closeOverlay()
                                                        openFileDialog()
                                                    }}
                                                    style={overlayButtonStyle}
                                                    aria-label="Pick image from gallery"
                                                >
                                                    <SvgImageWhite
                                                        style={{
                                                            width: 70,
                                                            height: 70,
                                                            display: "block",
                                                        }}
                                                    />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        closeOverlay()
                                                        onRequestCamera()
                                                    }}
                                                    style={overlayButtonStyle}
                                                    aria-label="Open camera"
                                                >
                                                    <SvgCameraWhite
                                                        style={{
                                                            width: 70,
                                                            height: 70,
                                                            display: "block",
                                                        }}
                                                    />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        closeOverlay()
                                                        handleBlankCanvas()
                                                    }}
                                                    style={overlayButtonStyle}
                                                    aria-label="Blank canvas"
                                                >
                                                    <SvgBlankCanvasWhite
                                                        style={{
                                                            width: 70,
                                                            height: 70,
                                                            display: "block",
                                                            color: "#fff",
                                                        }}
                                                    />
                                                </button>
                                            </div>
                                        )}

                                        {overlayMode === "export" && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void runExport("png")
                                                    }
                                                    disabled={isExporting}
                                                    style={itemStyle}
                                                >
                                                    PNG
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void runExport("svg")
                                                    }
                                                    disabled={isExporting}
                                                    style={itemStyle}
                                                >
                                                    SVG
                                                </button>

                                                {/* separator / spacing (same vibe as other modals, no new paradigm) */}
                                                <div
                                                    style={{
                                                        height: 20,
                                                        background:
                                                            "rgba(255,255,255,0)",
                                                        margin: "14px auto 14px",
                                                        width: "72%",
                                                    }}
                                                />
                                                {/* export layer options (match English design) */}
                                                <div
                                                    style={{
                                                        width: "min(420px, 86%)",
                                                        margin: "0 auto",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: 14,
                                                        alignItems: "stretch",
                                                    }}
                                                >
                                                    {/* Stroke layer */}
                                                    <label
                                                        style={{
                                                            display: "flex",
                                                            alignItems:
                                                                "flex-start",
                                                            justifyContent:
                                                                "flex-start",
                                                            gap: 12,
                                                            cursor: "pointer",
                                                            userSelect: "none",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                width: 28,
                                                                height: 28,
                                                                position:
                                                                    "relative",
                                                                flex: "0 0 auto",
                                                                marginTop: 2,
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    exportIncludeStroke
                                                                }
                                                                onChange={
                                                                    toggleExportStroke
                                                                }
                                                                aria-label="Stroke layer"
                                                                style={{
                                                                    position:
                                                                        "absolute",
                                                                    inset: 0,
                                                                    opacity: 0,
                                                                    margin: 0,
                                                                    cursor: "pointer",
                                                                }}
                                                            />

                                                            <div
                                                                style={{
                                                                    width: 28,
                                                                    height: 28,
                                                                    display:
                                                                        "grid",
                                                                    placeItems:
                                                                        "center",
                                                                    pointerEvents:
                                                                        "none",
                                                                }}
                                                            >
                                                                <ExportCheckboxIcon
                                                                    checked={
                                                                        exportIncludeStroke
                                                                    }
                                                                    size={28}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div
                                                            style={{
                                                                color: "#fff",
                                                                fontSize:
                                                                    "clamp(10px, 3.8vw, 12px)",
                                                                lineHeight: 1.35,
                                                                textAlign:
                                                                    "left",
                                                                textShadow:
                                                                    "0 2px 6px rgba(0,0,0,0.45)",
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    fontWeight: 800,
                                                                }}
                                                            >
                                                                Stroke layer
                                                            </span>
                                                            <span
                                                                style={{
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                {" "}
                                                                —{" "}
                                                            </span>
                                                            <span
                                                                style={{
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                only what is
                                                                painted with the
                                                                brush, including
                                                                transparency.
                                                            </span>
                                                        </div>
                                                    </label>

                                                    {/* Image layer */}
                                                    <label
                                                        style={{
                                                            display: "flex",
                                                            alignItems:
                                                                "flex-start",
                                                            justifyContent:
                                                                "flex-start",
                                                            gap: 12,
                                                            cursor: "pointer",
                                                            userSelect: "none",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                width: 28,
                                                                height: 28,
                                                                position:
                                                                    "relative",
                                                                flex: "0 0 auto",
                                                                marginTop: 2,
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    exportIncludeImage
                                                                }
                                                                onChange={
                                                                    toggleExportImage
                                                                }
                                                                aria-label="Image layer"
                                                                style={{
                                                                    position:
                                                                        "absolute",
                                                                    inset: 0,
                                                                    opacity: 0,
                                                                    margin: 0,
                                                                    cursor: "pointer",
                                                                }}
                                                            />

                                                            <div
                                                                style={{
                                                                    width: 28,
                                                                    height: 28,
                                                                    display:
                                                                        "grid",
                                                                    placeItems:
                                                                        "center",
                                                                    pointerEvents:
                                                                        "none",
                                                                }}
                                                            >
                                                                <ExportCheckboxIcon
                                                                    checked={
                                                                        exportIncludeImage
                                                                    }
                                                                    size={28}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div
                                                            style={{
                                                                color: "#fff",
                                                                fontSize:
                                                                    "clamp(10px, 3.8vw, 12px)",
                                                                lineHeight: 1.35,
                                                                textAlign:
                                                                    "left",
                                                                textShadow:
                                                                    "0 2px 6px rgba(0,0,0,0.45)",
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    fontWeight: 800,
                                                                }}
                                                            >
                                                                Image layer
                                                            </span>
                                                            <span
                                                                style={{
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                {" "}
                                                                —{" "}
                                                            </span>
                                                            <span
                                                                style={{
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                only the
                                                                quantized image,
                                                                without the
                                                                brush, including
                                                                transparency.
                                                            </span>
                                                        </div>
                                                    </label>

                                                    {/* Disclaimer (3 lines) */}
                                                    <div
                                                        style={{
                                                            marginTop: 6,
                                                            fontSize:
                                                                "clamp(10px, 3.6vw, 12px)",
                                                            lineHeight: 1.4,
                                                            color: "rgba(255,255,255,1)",
                                                            textAlign: "left",
                                                            textShadow:
                                                                "0 2px 6px rgba(0,0,0,0.45)",
                                                            display: "flex",
                                                            flexDirection:
                                                                "column",
                                                            gap: 10,
                                                        }}
                                                    >
                                                        <div>
                                                            <span
                                                                style={{
                                                                    fontWeight: 800,
                                                                }}
                                                            >
                                                                Both layers
                                                            </span>
                                                            <span
                                                                style={{
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                {" "}
                                                                —{" "}
                                                            </span>
                                                            <span
                                                                style={{
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                composite: brush
                                                                strokes over the
                                                                image; a
                                                                transparent
                                                                brush creates
                                                                “holes”.
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )
                            })()}
                        </div>,

                        document.body
                    )}

                {/* COLOR MODAL — закрытие ТОЛЬКО кнопками (без клика снаружи) */}

                {isColorModalOpen &&
                    ReactDOM.createPortal(
                        <div style={MODAL_OVERLAY_STYLE}>
                            <div
                                style={{
                                    position: "relative",
                                    width: "min(92vw, 520px)",
                                    maxHeight: "min(78vh, 520px)",
                                }}
                            >
                                <div style={{ position: "absolute", inset: 0 }}>
                                    <SvgModalBacking
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            display: "block",
                                            overflow: "hidden",
                                        }}
                                        ariaLabel="Modal backing"
                                    />
                                </div>

                                <div
                                    style={{
                                        position: "relative",
                                        width: "100%",
                                        height: "100%",
                                        display: "flex",
                                        flexDirection: "column",
                                        padding: "18px 18px 14px",
                                        boxSizing: "border-box",
                                        gap: 12,
                                        overflow: "hidden",
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div
                                        style={{
                                            fontSize: "clamp(18px, 5vw, 26px)",
                                            fontWeight: 900,
                                            letterSpacing: 1.2,
                                            textAlign: "center",
                                            color: "#001219",
                                        }}
                                    >
                                        SWATCH EDIT
                                    </div>

                                    <div
                                        ref={svRef}
                                        onPointerDown={(e) => {
                                            if (pendingTransparent) return
                                            setDragSV(true)
                                            onSVAt(e.clientX, e.clientY)
                                        }}
                                        style={{
                                            position: "relative",
                                            flex: "0 0 auto",
                                            height: "min(38vh, 300px)",
                                            border: "3px solid rgba(0,0,0,0.75)",
                                            background: pendingTransparent
                                                ? checkerBackground
                                                : `linear-gradient(to top, #000 0%, transparent 100%), linear-gradient(to right, #fff 0%, ${hueColor} 100%)`,
                                            touchAction: "none",
                                            userSelect: "none",
                                            overflow: "hidden",
                                        }}
                                        aria-label="SV Picker"
                                    >
                                        {!pendingTransparent && (
                                            <div
                                                style={{
                                                    position: "absolute",
                                                    left: `calc(${(
                                                        svX * 100
                                                    ).toFixed(2)}% - 12px)`,
                                                    top: `calc(${(
                                                        svY * 100
                                                    ).toFixed(2)}% - 12px)`,
                                                    width: 24,
                                                    height: 24,
                                                    pointerEvents: "none",
                                                }}
                                            >
                                                <SvgPickerThumb />
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        ref={hueRef}
                                        onPointerDown={(e) => {
                                            if (pendingTransparent) return
                                            setDragHue(true)
                                            onHueAt(e.clientX)
                                        }}
                                        style={{
                                            height: 20,
                                            border: "3px solid rgba(0,0,0,0.75)",
                                            background:
                                                "linear-gradient(to right, rgb(255,0,0), rgb(255,255,0), rgb(0,255,0), rgb(0,255,255), rgb(0,0,255), rgb(255,0,255), rgb(255,0,0))",
                                            position: "relative",
                                            touchAction: "none",
                                            userSelect: "none",
                                        }}
                                        aria-label="Hue Picker"
                                    >
                                        {!pendingTransparent && (
                                            <div
                                                style={{
                                                    position: "absolute",
                                                    left: `calc(${(
                                                        (pickerHue / 360) *
                                                        100
                                                    ).toFixed(2)}% - 2px)`,
                                                    top: -4,
                                                    width: 4,
                                                    height: 26,
                                                    background: "#fff",
                                                    boxShadow:
                                                        "0 0 0 2px rgba(0,0,0,0.6)",
                                                }}
                                            />
                                        )}
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            //justifyContent: "space-between",
                                            gap: 14,
                                            marginTop: 6,
                                            minWidth: 0,
                                        }}
                                    >
                                        <label
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 10,
                                                fontSize:
                                                    "clamp(13px, 4vw, 16px)",
                                                fontWeight: 900,
                                                letterSpacing: 0.6,
                                                color: "#001219",
                                                userSelect: "none",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: SWATCH_ICON,
                                                    height: SWATCH_ICON,
                                                    position: "relative",
                                                    flex: "0 0 auto",
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={pendingTransparent}
                                                    onChange={(e) =>
                                                        setPendingTransparent(
                                                            e.target.checked
                                                        )
                                                    }
                                                    style={{
                                                        width: SWATCH_ICON,
                                                        height: SWATCH_ICON,
                                                        appearance: "none",
                                                        WebkitAppearance:
                                                            "none",
                                                        border: "4px solid rgba(0,0,0,0.75)",
                                                        background: "#fff",
                                                        display: "inline-block",
                                                        position: "relative",
                                                        cursor: "pointer",
                                                        flex: "0 0 auto",
                                                    }}
                                                />
                                                {pendingTransparent && (
                                                    <div
                                                        style={{
                                                            position:
                                                                "absolute",
                                                            inset: 0,
                                                            display: "grid",
                                                            placeItems:
                                                                "center",
                                                            pointerEvents:
                                                                "none",
                                                            fontSize: 26,
                                                            fontWeight: 900,
                                                            color: "#001219",
                                                            lineHeight: 1,
                                                        }}
                                                    >
                                                        ✓
                                                    </div>
                                                )}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize:
                                                        "clamp(12px, 3.6vw, 15px)",
                                                    fontWeight: 400,
                                                    letterSpacing: 0.2,
                                                    color: "#001219",
                                                    textTransform: "uppercase",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                TRANSPARENT
                                            </div>
                                        </label>

                                        {!isMobileUI && (
                                            <div
                                                style={{
                                                    flex: "1 1 auto",
                                                    minWidth: 0,
                                                }}
                                            />
                                        )}

                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 12,
                                                minWidth: 0,
                                                flex: "0 1 auto",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: SWATCH_ICON,
                                                    height: SWATCH_ICON,
                                                    border: "4px solid rgba(0,0,0,0.75)",
                                                    boxSizing: "border-box",
                                                    background:
                                                        pendingTransparent
                                                            ? checkerBackground
                                                            : pendingColor,
                                                    flex: "0 0 auto",
                                                }}
                                                aria-label="Color preview"
                                            />
                                            <div
                                                style={{
                                                    flex: "1 1 auto",
                                                    minWidth: 0,
                                                    display: "flex",
                                                    justifyContent: "flex-end",
                                                    alignItems: "center",
                                                }}
                                                aria-label="HEX value"
                                            >
                                                {pendingTransparent ? (
                                                    <div
                                                        style={{
                                                            fontSize:
                                                                "clamp(13px, 4vw, 16px)",
                                                            fontWeight: 800,
                                                            letterSpacing: 6,
                                                            color: "#001219",
                                                            fontFamily:
                                                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                                            whiteSpace:
                                                                "nowrap",
                                                        }}
                                                    >
                                                        — — — —
                                                    </div>
                                                ) : (
                                                    <input
                                                        value={hexDraft}
                                                        onChange={(e) => {
                                                            // ВАЖНО: не нормализуем в процессе ввода
                                                            setHexDraft(
                                                                e.target.value
                                                            )
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (
                                                                e.key ===
                                                                "Enter"
                                                            ) {
                                                                e.preventDefault()
                                                                commitHexDraft()
                                                                ;(
                                                                    e.currentTarget as HTMLInputElement
                                                                ).blur()
                                                            }
                                                        }}
                                                        inputMode="text"
                                                        enterKeyHint="done"
                                                        autoCapitalize="characters"
                                                        spellCheck={false}
                                                        aria-label="HEX input"
                                                        onFocus={() => {
                                                            hexIsEditingRef.current =
                                                                true
                                                        }}
                                                        onBlur={() => {
                                                            // ВАЖНО: при уходе из поля фиксируем hexDraft -> pendingColor/picker
                                                            commitHexDraft()
                                                            hexIsEditingRef.current =
                                                                false
                                                        }}
                                                        style={{
                                                            width: "100%",
                                                            minWidth: 0,
                                                            maxWidth: 220,
                                                            height: 40,
                                                            border: "3px solid rgba(0,0,0,0.75)",
                                                            background:
                                                                "rgba(255,255,255,0.9)",
                                                            color: "#001219",
                                                            fontSize:
                                                                "clamp(13px, 4vw, 16px)",
                                                            fontWeight: 900,
                                                            letterSpacing: 0.6,
                                                            padding: "0 10px",
                                                            boxSizing:
                                                                "border-box",
                                                            outline: "none",
                                                            fontFamily:
                                                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                                            textTransform:
                                                                "uppercase",
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            marginTop: 2,
                                            fontSize:
                                                "clamp(11px, 3.5vw, 13px)",
                                            lineHeight: 1.4,
                                            color: "rgba(0,0,0,0.75)",
                                        }}
                                    >
                                        This swatch will not paint pixels. It
                                        behaves as empty pixel and will not
                                        include in PNG/SVG
                                    </div>
                                </div>
                            </div>
                            {/* Buttons OUTSIDE the white modal (like Crop overlay) */}
                            <div
                                style={{
                                    marginTop: 18,
                                    width: "min(92vw, 520px)",
                                    display: "flex",
                                    justifyContent: "center",
                                    gap: 26,
                                    pointerEvents: "auto",
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={handleModalCancel}
                                    style={{
                                        width: 80,
                                        height: 80,
                                        border: "none",
                                        background: "transparent",
                                        padding: 0,
                                        cursor: "pointer",
                                        touchAction: "manipulation",
                                    }}
                                    aria-label="Cancel"
                                >
                                    <SvgCancelButton
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                        }}
                                    />
                                </button>

                                <button
                                    type="button"
                                    onClick={handleModalApply}
                                    style={{
                                        width: 80,
                                        height: 80,
                                        border: "none",
                                        background: "transparent",
                                        padding: 0,
                                        cursor: "pointer",
                                        touchAction: "manipulation",
                                    }}
                                    aria-label="Apply"
                                >
                                    <SvgOkButton
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                        }}
                                    />
                                </button>
                            </div>
                        </div>,
                        document.body
                    )}
            </div>
        </FitToViewport>
    )
}

// =====================
// IMPORT_TXN — module-level (shared across ROOT + EDITOR)
// =====================

type ImportTxn = {
    id: number
    reason: string
    startedAtMs: number
}

let importTxnSeq = 0

function beginImportTxn(reason: string): ImportTxn {
    const id = ++importTxnSeq
    const startedAtMs =
        typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now()
    if (ENABLE_PREP_LOGS) {
        console.log(`[IMPORT_TXN][BEGIN] id=${id} reason=${reason}`)
    }
    return { id, reason, startedAtMs }
}

function commitImportTxn(
    txn: ImportTxn,
    meta?: { ok?: boolean; note?: string }
) {
    const now =
        typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now()

    const dt = now - txn.startedAtMs
    const okStr =
        typeof meta?.ok === "boolean" ? ` ok=${meta.ok ? "1" : "0"}` : ""
    const noteStr = meta?.note ? ` note=${meta.note}` : ""

    if (ENABLE_PREP_LOGS) {
        console.log(
            `[IMPORT_TXN][COMMIT] id=${txn.id} reason=${txn.reason} dtMs=${dt.toFixed(
                1
            )}${okStr}${noteStr}`
        )
    }
}

// ------------------- ROOT MVP -------------------

export default function PIXTUDIO_Mobile_MVP() {
    const [screen, setScreen] = React.useState<"start" | "editor">("start")
    const [pendingProjectFile, setPendingProjectFile] =
        React.useState<File | null>(null)
    const [editorImageData, setEditorImageData] =
        React.useState<ImageData | null>(null)

    const [setImportPresetId] = React.useState<
        "DEFAULT" | "NEON" | "GRAYSCALE" | "BW"
    >("DEFAULT")

    const [cameraOpen, setCameraOpen] = React.useState(false)

    const fileInputRef = React.useRef<HTMLInputElement | null>(null)

    const loadFileInputRef = React.useRef<HTMLInputElement | null>(null)

    const cameraInputRef = React.useRef<HTMLInputElement | null>(null)

    const openProjectPicker = React.useCallback(() => {
        loadFileInputRef.current?.click()
    }, [])

    // ======================
    // GLOBAL: unified import-error modal (single source of truth)
    // ======================

    const [importErrorModal, setImportErrorModal] = React.useState<{
        message: string
    } | null>(null)

    const isImportErrorModalOpen = !!importErrorModal

    const showImportErrorModal = React.useCallback((message: string) => {
        setImportErrorModal({ message })
    }, [])

    const dismissImportErrorModal = React.useCallback(() => {
        setImportErrorModal(null)
    }, [])

    // ✅ ROOT: единая точка показа import-error (ТОЛЬКО модалка; без importStatus/importError)
    const onShowImportError = React.useCallback(
        (message: string) => {
            showImportErrorModal(message)
        },
        [showImportErrorModal]
    )

    // единый portal (ОДНА модалка на все ошибки импорта)

    // ======================
    // IMPORT ERROR MODAL: fixed geometry (NO autosize / NO measuring)
    // ======================

    const IMPORT_ALERT_W = 300
    const IMPORT_ALERT_H = 100

    // ВАЖНО:
    // width = min(520px, 100vw-48px)
    // height = пропорционально ширине, чтобы SvgAlertBacking не "плавал"
    const importAlertBoxW = `min(${IMPORT_ALERT_W}px, calc(100vw - 48px))`
    const importAlertBoxH = `calc(${importAlertBoxW} * ${IMPORT_ALERT_H} / ${IMPORT_ALERT_W})`

    // фиксированные типографика/паддинги (без vw/clamp)
    const importAlertTitleFontPx = 18
    const importAlertBodyFontPx = 12
    const importAlertPadV = 26
    const importAlertPadH = 32

    const importErrorModalPortal: React.ReactNode = importErrorModal
        ? (ReactDOM.createPortal(
              <div
                  style={ALERT_OVERLAY_STYLE}
                  onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                  }}
              >
                  {/* ✅ Внутренний контейнер-колонка (на случай если кто-то сломает ALERT_OVERLAY_STYLE) */}
                  <div
                      style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 14,
                          pointerEvents: "auto",
                      }}
                      onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                      }}
                  >
                      {/* WHITE BACKING */}
                      <div
                          style={{
                              position: "relative",
                              width: importAlertBoxW,
                              height: importAlertBoxH,
                          }}
                      >
                          <div style={{ position: "absolute", inset: 0 }}>
                              <SvgAlertBacking
                                  style={{
                                      width: "100%",
                                      height: "100%",
                                      display: "block",
                                  }}
                                  ariaLabel="Import error modal backing"
                              />
                          </div>

                          {/* CONTENT */}
                          <div
                              style={{
                                  position: "relative",
                                  width: "100%",
                                  height: "100%",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 12,
                                  padding: `${importAlertPadV}px ${importAlertPadH}px`,
                                  boxSizing: "border-box",
                                  textAlign: "center",
                              }}
                          >
                              <div
                                  style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      gap: 5,
                                  }}
                              >
                                  <div
                                      style={{
                                          fontSize: importAlertTitleFontPx,
                                          fontWeight: 900,
                                          letterSpacing: 1,
                                          textAlign: "center",
                                          color: "black",
                                      }}
                                  >
                                      IMPORT ERROR
                                  </div>

                                  <div
                                      style={{
                                          fontSize: importAlertBodyFontPx,
                                          lineHeight: 1,
                                          wordBreak: "break-word",
                                          fontWeight: 400,
                                          textAlign: "center",
                                          color: "black",
                                          opacity: 1,
                                      }}
                                  >
                                      {importErrorModal.message}
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* OK button OUTSIDE the white backing (80×80) */}
                      <button
                          type="button"
                          onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              dismissImportErrorModal()
                          }}
                          style={{
                              width: 80,
                              height: 80,
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              cursor: "pointer",
                              touchAction: "manipulation",
                          }}
                          aria-label="OK"
                      >
                          <SvgOkButton
                              style={{ width: "100%", height: "100%" }}
                          />
                      </button>
                  </div>
              </div>,
              document.body
          ) as unknown as React.ReactNode)
        : null

    // ЕДИНЫЙ вход для импорта изображения (Start Screen + Editor)
    const openImagePicker = React.useCallback(() => {
        const el = fileInputRef.current
        if (!el) return

        // важно: чтобы повторный выбор того же файла всегда триггерил onChange
        try {
            el.value = ""
        } catch {
            // на некоторых браузерах value может быть read-only — тогда просто кликаем
        }

        el.click()
    }, [])

    // ЕДИНЫЙ обработчик выбранного изображения (Start Screen + Editor)
    const handlePickedImage = React.useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            if (!file) return

            // важно: чтобы повторный выбор того же файла срабатывал
            event.target.value = ""

            // fail-closed: только image/*
            if (!file.type || !file.type.startsWith("image/")) {
                console.warn("[IMPORT][GALLERY] rejected non-image file", {
                    type: file.type,
                    name: file.name,
                    size: file.size,
                })

                // ✅ единый алерт (то же, что при неверном файле проекта)
                failImport("Import failed. Please try again.")
                return
            }

            try {
                setImportStatus("decoding")
                setImportError(null)

                const sourceImage = await decodeToSourceImage(file)

                // Gallery pipe: CropFlow -> ChineseRoom -> Editor
                setCropFlowSource("gallery")
                openCropFlow(sourceImage)
            } catch (e: any) {
                console.warn("[IMPORT][GALLERY] decodeToSourceImage failed", e)

                // ✅ единый алерт
                failImport("Import failed. Please try again.")
            }
        },
        []
    )

    function handleImportDecision(decision: ImportDecision) {
        const base = decision.preparedImageData

        // ✅ NEON_STAIRCASE включаем ТОЛЬКО для пресета NEON и ТОЛЬКО один раз на импорт
        let withNeonStaircase = base

        if (decision.presetId === "NEON") {
            withNeonStaircase = applyNeonPreTransform(base)
        } else if (decision.presetId === "BW") {
            // BW0: NO-OP, поведение как DEFAULT
            withNeonStaircase = base
        } else if (decision.presetId === "GRAYSCALE") {
            // GRAYSCALE в BW0 здесь не трогаем (оно применяется в Editor pipeline)
            withNeonStaircase = base
        } else {
            // DEFAULT
            withNeonStaircase = base
        }

        // (sanitize + boost остаются как есть внутри preprocessImportedImageData)
        const preprocessed = preprocessImportedImageData(
            withNeonStaircase,
            "gallery" // было "file" — лучше держать в рамках union-типа
        )

        setEditorImageData(preprocessed)
        setScreen("editor")

        return preprocessed
    }

    function openCamera() {
        openSystemCameraHead()
    }

    async function handlePickedCamera(e: React.ChangeEvent<HTMLInputElement>) {
        const input = e.currentTarget
        const file = input.files?.[0] ?? null

        // allow selecting the same captured file again
        input.value = ""

        // Cancel = no file
        if (!file) return

        // Some browsers can return a "ghost" file on cancel (0 bytes, empty type/name).
        // Treat it as Cancel (quiet) for zero-skill UX.
        const looksLikeCancelGhost =
            file.size === 0 &&
            (!file.type || file.type.trim() === "") &&
            (!file.name || file.name.trim() === "")
        if (looksLikeCancelGhost) return

        // fail-closed: only image/*
        if (!file.type || !file.type.startsWith("image/")) {
            console.error("[CAMERA][head] rejected non-image file", {
                type: file.type,
                name: file.name,
                size: file.size,
            })
            failImport(CAMERA_IMPORT_ERROR_TEXT)
            return
        }

        try {
            setImportStatus("decoding")
            setImportError(null)

            // ✅ source-layer only: EXIF/orientation may be read inside decode,
            // but nothing is returned except pixels (SourceImage).
            const sourceImage = await decodeToSourceImage(file)

            // Camera pipe: CropFlow -> ChineseRoom -> Editor
            setCropFlowSource("camera")
            openCropFlow(sourceImage)
        } catch (err) {
            console.error("[CAMERA][head] decodeToSourceImage failed", err)
            failImport(CAMERA_IMPORT_ERROR_TEXT)
        }
    }

    type CropRequest = { file: File } | { sourceImage: SourceImage }

    const CAMERA_IMPORT_ERROR_TEXT = "Import error. Let’s try again."

    const [cropPending, setCropPending] = React.useState<CropRequest | null>(
        null
    )
    const [cropFlowSource, setCropFlowSource] = React.useState<
        "gallery" | "camera"
    >("gallery")

    // --- Step 1: preview inside Crop/ImportPrep overlay (NO-OP for project) ---

    const cropDecodedRef = React.useRef<ImageData | null>(null)
    const cropPreviewSrcCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
    const cropOriginalSourceRef = React.useRef<CanvasImageSource | null>(null)
    const cropPreviewCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
    const [cropPreviewTick, setCropPreviewTick] = React.useState(0)
    const cropDecodeJobRef = React.useRef(0)

    // === STEP 3: UI transforms (NO ImageData recompute) ===
    const [cropUiScale, setCropUiScale] = React.useState(1) // uniform
    const [cropUiRotation, setCropUiRotation] = React.useState(0) // radians
    const [cropUiOffset, setCropUiOffset] = React.useState({ x: 0, y: 0 }) // px in preview-space

    // ============================================================
    // C0 — CROP "CHINESE ROOM" CONTRACT (NO-OP)
    //
    // Crop/ImportPrep = китайская комната между выбором файла и Editor.
    // Editor не знает:
    // - был ли кроп,
    // - был ли пресет,
    // - какой пресет,
    // - были ли санитизация/буст.
    //
    // Единственный артефакт, который выходит из кроп-комнаты:
    // bakedRef512: ImageData (crop + preset + preprocess уже запечены).
    //
    // NOTE (C0): пока это только контракт типами/комментариями.
    // Старый ImportDecision (preparedImageData + presetId) остаётся работать,
    // пока мы не перейдём на E1/E2.
    // ============================================================

    type ImportArtifact = {
        bakedRef512: ImageData
    }

    // Единственный вход в редактор (пока НЕ используется — NO-OP).
    function commitImport(_artifact: ImportArtifact) {
        // C0: NO-OP stub. Реальная проводка будет в E1/E2.
    }

    type PresetId = "DEFAULT" | "NEON" | "GRAYSCALE" | "BW"

    const [lastImportPresetId, setLastImportPresetId] =
        React.useState<PresetId>("DEFAULT")

    const [selectedPresetId, setSelectedPresetId] =
        React.useState<PresetId | null>(null)
    // null = “ничего не выбрано” => по твоим правилам это DEFAULT

    type ImportStatus = "idle" | "decoding" | "ready" | "applying"

    const [importStatus, setImportStatus] = React.useState<ImportStatus>("idle")

    // legacy diagnostics only (UI must NOT branch on this anymore)
    const [importError, setImportError] = React.useState<string | null>(null)

    // --------------------
    // IMPORT ERROR: single source of truth = ROOT modal
    // PixelEditorFramer only requests showing it and resets local import UI.
    // --------------------

    const showImportError =
        onShowImportError ??
        ((message: string) => {
            console.error("[IMPORT ERROR]", message)
        })

    const failImport = React.useCallback(
        (message: string) => {
            showImportError(message)
            setImportStatus("idle")
            setImportError(null)
        },
        [showImportError]
    )

    const failImportInFlow = React.useCallback(
        (message: string) => {
            showImportError(message)
            setImportStatus("ready")
            setImportError(null)
        },
        [showImportError]
    )

    const { alertBoxSize, alertMeasureRef } = useImportAlertBoxSizing(false, "")

    // LEGACY (to be removed):
    // ImportDecision carries presetId past crop boundary -> violates Chinese Room.
    // Kept temporarily for transition; will be replaced by ImportArtifact(bakedRef512) in E1/E2.

    // LEGACY (to be removed):

    // ImportDecision carries presetId past crop boundary -> violates Chinese Room.

    // Kept temporarily for transition; will be replaced by ImportArtifact(bakedRef512) in E1/E2.

    type CropFlowResult = {
        prepared512: ImageData
        presetId: PresetId
        source: "gallery" | "camera"
    }

    type ImportDecision = {
        preparedImageData: ImageData

        presetId: PresetId // DEFAULT, если selectedPresetId == null
    }

    // RF3: транзакция импорта — decision, ожидающий применения

    const [pendingImportDecision, setPendingImportDecision] =
        React.useState<ImportDecision | null>(null)

    // E1B: параллельная “новая шина” (пока НЕ используется — NO-OP результата)

    const [pendingCropResult, setPendingCropResult] =
        React.useState<CropFlowResult | null>(null)

    const [pendingImportArtifact, setPendingImportArtifact] =
        React.useState<ImportArtifact | null>(null)

    // RF2: транзакционный апплаер импорта — единственное место, где проект реально меняется

    function validateImportImageDataOrThrow(img: ImageData, label: string) {
        if (!img) {
            throw new Error(
                `[IMPORT][A0] ${label}: ImageData is null/undefined`
            )
        }

        const w = (img as any).width

        const h = (img as any).height

        const data = (img as any).data

        if (w !== 512 || h !== 512) {
            throw new Error(
                `[IMPORT][A0] ${label}: expected 512x512, got ${String(w)}x${String(h)}`
            )
        }

        if (!data || typeof (data as any).length !== "number") {
            throw new Error(`[IMPORT][A0] ${label}: missing data buffer`)
        }

        const expectedLen = 512 * 512 * 4

        if ((data as any).length !== expectedLen) {
            throw new Error(
                `[IMPORT][A0] ${label}: expected data.length=${expectedLen}, got ${String(
                    (data as any).length
                )}`
            )
        }

        const ctorName = (data as any)?.constructor?.name || ""

        if (ctorName && ctorName !== "Uint8ClampedArray") {
            console.warn(
                `[IMPORT][A0] ${label}: data is ${ctorName} (expected Uint8ClampedArray)`
            )
        }
    }

    // E1B: новый апплаер (старый НЕ трогаем)

    function handleImportArtifact(a: ImportArtifact) {
        setEditorImageData(a.bakedRef512)

        setScreen("editor")
    }

    React.useEffect(() => {
        const d = pendingImportDecision

        if (!d) return

        const txn = ENABLE_TXN_LOGS ? beginImportTxn("import-apply") : null

        try {
            // A0: жёсткая валидация “бэйк=512×512”

            validateImportImageDataOrThrow(
                d.preparedImageData,
                "decision.preparedImageData"
            )

            setImportStatus("applying")

            // применяем старый путь (пока он единственный, кто реально работает)

            handleImportDecision(d)

            setPendingImportDecision(null)

            if (txn && ENABLE_TXN_LOGS) {
                commitImportTxn(txn, { ok: true, note: "ok" })
            }
        } catch (e: any) {
            console.error("[IMPORT][A0] apply failed", e)

            if (ENABLE_PREP_LOGS) {
                console.log("[IMPORT][A0] decision snapshot", {
                    hasPrepared: !!d?.preparedImageData,
                    w: d?.preparedImageData?.width,
                    h: d?.preparedImageData?.height,
                    presetId: d?.presetId,
                })
            }

            failImportInFlow("Please try importing another image or cancel.")
            setPendingImportDecision(null)

            if (txn && ENABLE_TXN_LOGS) {
                commitImportTxn(txn, { ok: false, note: "failed" })
            }
        }
    }, [pendingImportDecision])

    // E1B: параллельный useEffect под новый контракт ImportArtifact (пока не используется)

    React.useEffect(() => {
        const a = pendingImportArtifact

        if (!a) return

        try {
            // A0: жёсткая валидация “бэйк=512×512”

            validateImportImageDataOrThrow(
                a.bakedRef512,
                "artifact.bakedRef512"
            )

            handleImportArtifact(a)

            // закрываем кроп-оверлей и сбрасываем UI кроп-комнаты
            setCropPending(null)
            setSelectedPresetId(null)
            setImportStatus("idle")
            setImportError(null)
        } catch (e: any) {
            console.error("[IMPORT][A0] artifact apply failed", e)

            // В E1B можно НЕ трогать старый UX ошибок (путь ещё не активен),
            // но хотя бы чистим pending, чтобы не зависать.
        } finally {
            setPendingImportArtifact(null)
        }
    }, [pendingImportArtifact])

    React.useEffect(() => {
        const r = pendingCropResult
        if (!r) return

        try {
            // P5: единственное место между CropFlow и Editor, где существует presetId
            const bakedRef512 = bakeRef512InChineseRoom(
                r.prepared512,
                r.presetId,
                r.source
            )

            const artifact: ImportArtifact = { bakedRef512 }

            // дальше — как раньше: транзакционный apply артефакта
            setPendingImportArtifact(artifact)
        } catch (e: any) {
            console.error("[IMPORT][P5] cropResult->artifact failed", e)
            failImportInFlow("Failed to bake import artifact.")
        } finally {
            // важно: presetId не должен жить дольше одного тика
            setPendingCropResult(null)
        }
    }, [pendingCropResult])

    const cropDragRef = React.useRef<{
        mode: "none" | "pan" | "rotate" | "scale"
        pointerId: number | null

        startX: number
        startY: number

        startOffsetX: number
        startOffsetY: number

        startRotation: number
        startScale: number

        startAngle: number
        startDist: number
    }>({
        mode: "none",
        pointerId: null,

        startX: 0,
        startY: 0,

        startOffsetX: 0,
        startOffsetY: 0,

        startRotation: 0,
        startScale: 1,

        startAngle: 0,
        startDist: 1,
    })

    function bumpCropPreview() {
        setCropPreviewTick((t) => t + 1)
    }

    function resetCropUiIfNeeded() {
        setCropUiScale(1)
        setCropUiRotation(0)
        setCropUiOffset({ x: 0, y: 0 })
        // preview перерисуется сам из-за bump ниже
        bumpCropPreview()
    }

    // === ImportPrep Step 2: viewport + ears ===
    const IMPORT_PREVIEW_VIEWPORT_INSET_FRAC_DESKTOP = 0.22
    const IMPORT_PREVIEW_VIEWPORT_INSET_FRAC_MOBILE = 0.18

    const IMPORT_PREVIEW_EARS_OPACITY = 0.3
    const IMPORT_PREVIEW_DECODE_MAX_SIDE = 2048 // чтобы не держать гигантские исходники в памяти

    const [isCoarsePointer, setIsCoarsePointer] = React.useState(false)
    const [isTouchDevice, setIsTouchDevice] = React.useState(false)

    React.useEffect(() => {
        if (typeof window === "undefined") return

        const ua = navigator.userAgent || ""
        const touch =
            (navigator as any).maxTouchPoints > 0 ||
            "ontouchstart" in window ||
            /Android|iPhone|iPad|iPod/i.test(ua)

        setIsTouchDevice(touch)
    }, [])

    React.useEffect(() => {
        if (typeof window === "undefined") return

        const mql = window.matchMedia("(pointer: coarse)")
        const apply = () => setIsCoarsePointer(!!mql.matches)
        apply()

        if (typeof mql.addEventListener === "function") {
            mql.addEventListener("change", apply)
            return () => mql.removeEventListener("change", apply)
        }

        // fallback для старых браузеров
        mql.addListener(apply)
        return () => mql.removeListener(apply)
    }, [])

    const isMobileUI = isCoarsePointer || isTouchDevice

    const isMobileOS = React.useMemo(() => {
        if (typeof navigator === "undefined") return false
        const ua = navigator.userAgent || ""
        return /Android|iPhone|iPad|iPod/i.test(ua)
    }, [])

    React.useEffect(() => {
        if (typeof window === "undefined") return
        if (!window.matchMedia) return

        const mql = window.matchMedia("(pointer: coarse)")

        const apply = () => setIsCoarsePointer(!!mql.matches)
        apply()

        if (typeof mql.addEventListener === "function") {
            mql.addEventListener("change", apply)
            return () => mql.removeEventListener("change", apply)
        }

        // старые браузеры
        ;(mql as any).addListener?.(apply)
        return () => (mql as any).removeListener?.(apply)
    }, [])

    // активные pointers для pinch
    const cropPointersRef = React.useRef<Map<number, { x: number; y: number }>>(
        new Map()
    )

    const cropPinchRef = React.useRef({
        active: false,

        startCenterX: 0,
        startCenterY: 0,

        startDist: 1,
        startAngle: 0,

        startScale: 1,
        startRotation: 0,

        startOffsetX: 0,
        startOffsetY: 0,
    })

    function getTwoPointers() {
        const arr = Array.from(cropPointersRef.current.values())
        const a = arr[0]
        const b = arr[1]
        return { a, b }
    }

    function centerOf(
        a: { x: number; y: number },
        b: { x: number; y: number }
    ) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }

    function distOf(a: { x: number; y: number }, b: { x: number; y: number }) {
        const dx = b.x - a.x
        const dy = b.y - a.y
        return Math.max(1, Math.hypot(dx, dy))
    }

    function angleOf(a: { x: number; y: number }, b: { x: number; y: number }) {
        return Math.atan2(b.y - a.y, b.x - a.x)
    }

    React.useEffect(() => {
        const el = cropPreviewBoxRef.current
        if (!el) return

        const ro = new ResizeObserver((entries) => {
            const cr = entries[0]?.contentRect
            if (!cr) return
            const next = Math.max(1, Math.floor(Math.min(cr.width, cr.height)))
            setCropPreviewCssPx(next)
        })

        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    function applyGeometry(): ImageData | null {
        // P4: финальный рендер должен идти с оригинала (SourceImage),
        // preview-canvas используется только как fallback.
        const srcAny =
            cropOriginalSourceRef.current ?? cropPreviewSrcCanvasRef.current
        if (!srcAny) return null

        const out = document.createElement("canvas")
        out.width = CANVAS_SIZE
        out.height = CANVAS_SIZE

        const ctx = out.getContext("2d")
        if (!ctx) return null

        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

        // Универсальные размеры для CanvasImageSource:
        // - HTMLImageElement: naturalWidth/naturalHeight
        // - ImageBitmap / Canvas: width/height
        const anySrc: any = srcAny as any
        const imgW =
            anySrc?.naturalWidth ?? anySrc?.videoWidth ?? anySrc?.width ?? 0
        const imgH =
            anySrc?.naturalHeight ?? anySrc?.videoHeight ?? anySrc?.height ?? 0
        if (imgW <= 0 || imgH <= 0) return null

        // --- ВАЖНО: повторяем геометрию preview ---
        // В preview "viewport — квадрат внутри preview", размер vSize = W - 2*vInset
        // Поэтому cropUiOffset и cropUiScale должны интерпретироваться в координатах vSize, а не 512.

        const previewCanvas = cropPreviewCanvasRef.current
        const W = previewCanvas?.width ?? CANVAS_SIZE

        const insetFrac = isMobileUI
            ? IMPORT_PREVIEW_VIEWPORT_INSET_FRAC_MOBILE
            : IMPORT_PREVIEW_VIEWPORT_INSET_FRAC_DESKTOP

        const vInset = Math.round(W * insetFrac)
        const vSize = Math.max(1, W - vInset * 2)

        // Масштаб из координат preview-viewport -> в итоговый 512×512
        const k = CANVAS_SIZE / vSize

        // cover-scale как в preview, но потом домножаем на k
        const baseScale = Math.max(vSize / imgW, vSize / imgH)

        const drawW = imgW * baseScale * cropUiScale * k
        const drawH = imgH * baseScale * cropUiScale * k

        // offset тоже в координатах vSize -> переводим в 512
        const ox = cropUiOffset.x * k
        const oy = cropUiOffset.y * k

        const cx = CANVAS_SIZE / 2 + ox
        const cy = CANVAS_SIZE / 2 + oy

        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(cropUiRotation)
        ctx.drawImage(srcAny as any, -drawW / 2, -drawH / 2, drawW, drawH)
        ctx.restore()

        return ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    }

    function renderCropPreview() {
        const dst = cropPreviewCanvasRef.current
        const src = cropPreviewSrcCanvasRef.current
        if (!dst || !src) return

        const ctx = dst.getContext("2d")
        if (!ctx) return

        const W = dst.width
        const H = dst.height

        ctx.clearRect(0, 0, W, H)

        // viewport — квадрат внутри preview
        const insetFrac = isMobileUI
            ? IMPORT_PREVIEW_VIEWPORT_INSET_FRAC_MOBILE
            : IMPORT_PREVIEW_VIEWPORT_INSET_FRAC_DESKTOP

        const vInset = Math.round(W * insetFrac)
        const vSize = Math.max(1, W - vInset * 2)
        const vx = vInset
        const vy = vInset
        const vcx = vx + vSize / 2
        const vcy = vy + vSize / 2

        // картинка масштабируется "cover" относительно viewport:
        // меньшая сторона viewport касается изображения => вторая сторона вылезает (это и есть "уши")
        const imgW = src.width
        const imgH = src.height
        if (imgW <= 0 || imgH <= 0) return

        // базовый cover-scale + UI scale
        const baseScale = Math.max(vSize / imgW, vSize / imgH)
        const drawW = imgW * baseScale * cropUiScale
        const drawH = imgH * baseScale * cropUiScale

        // apply UI offset относительно центра viewport
        const cx = vcx + cropUiOffset.x
        const cy = vcy + cropUiOffset.y

        function drawTransformed(alpha: number) {
            ctx.save()
            ctx.globalAlpha = alpha
            ctx.translate(cx, cy)
            ctx.rotate(cropUiRotation)
            ctx.drawImage(src, -drawW / 2, -drawH / 2, drawW, drawH)
            ctx.restore()
        }

        // 1) "уши": рисуем ту же картинку, но с opacity ~30% (без клипа)
        drawTransformed(IMPORT_PREVIEW_EARS_OPACITY)

        // 2) viewport: поверх — та же картинка, но только внутри квадратного окна (100% opacity)
        ctx.save()
        ctx.beginPath()
        ctx.rect(vx, vy, vSize, vSize)
        ctx.clip()
        drawTransformed(1)
        ctx.restore()

        // 3) рамка viewport, чтобы было понятно "вот это будет холст"
        ctx.save()
        ctx.strokeStyle = "rgba(255,255,255,0.95)"
        ctx.lineWidth = Math.max(2, Math.round(W * 0.006))
        const half = ctx.lineWidth / 2
        ctx.strokeRect(
            vx + half,
            vy + half,
            vSize - ctx.lineWidth,
            vSize - ctx.lineWidth
        )
        ctx.restore()
    }

    const cropPreviewBoxRef = React.useRef<HTMLDivElement | null>(null)
    const [cropPreviewCssPx, setCropPreviewCssPx] = React.useState(0)

    const [isCropDragging, setIsCropDragging] = React.useState(false)

    function setCropCursorDragging(active: boolean) {
        setIsCropDragging(active)
    }

    const cropPreviewCanvasPx = React.useMemo(() => {
        const dpr =
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
        return Math.max(1, Math.round(cropPreviewCssPx * dpr))
    }, [cropPreviewCssPx])

    React.useLayoutEffect(() => {
        if (!cropPending) return

        const el = cropPreviewBoxRef.current
        if (!el) return

        const measure = () => {
            const r = el.getBoundingClientRect()
            const next = Math.max(1, Math.floor(Math.min(r.width, r.height)))
            setCropPreviewCssPx((prev) => (prev === next ? prev : next))
        }

        measure()

        // ResizeObserver может отсутствовать в очень старых браузерах
        if (typeof (window as any).ResizeObserver === "undefined") {
            window.addEventListener("resize", measure)
            return () => window.removeEventListener("resize", measure)
        }

        const ro = new (window as any).ResizeObserver(() => measure())
        ro.observe(el)

        window.addEventListener("resize", measure)

        return () => {
            try {
                ro.disconnect()
            } catch {}
            window.removeEventListener("resize", measure)
        }
    }, [cropPending])

    React.useEffect(() => {
        if (!cropPending) return

        const el = cropPreviewBoxRef.current
        if (!el) return

        // Важно: курсор задаём именно на контейнер рамки кропа,
        // чтобы он работал даже если поверх канваса появляются слои.
        el.style.cursor = isCropDragging ? "grabbing" : "grab"

        return () => {
            // Когда кроп закрывается — возвращаем дефолт
            try {
                el.style.cursor = ""
            } catch {}
        }
    }, [cropPending, isCropDragging])

    React.useEffect(() => {
        if (!cropPending) return

        const onUp = () => setIsCropDragging(false)
        window.addEventListener("pointerup", onUp)
        window.addEventListener("pointercancel", onUp)
        window.addEventListener("blur", onUp)

        return () => {
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onUp)
            window.removeEventListener("blur", onUp)
        }
    }, [cropPending])

    React.useEffect(() => {
        if (!cropPending) return

        const onUp = () => setIsCropDragging(false)

        window.addEventListener("pointerup", onUp)
        window.addEventListener("pointercancel", onUp)
        window.addEventListener("blur", onUp)

        return () => {
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onUp)
            window.removeEventListener("blur", onUp)
        }
    }, [cropPending])

    React.useEffect(() => {
        if (!cropPending) return

        // Freeze scroll + gestures while Crop overlay is open
        const prevOverflow = document.body.style.overflow
        const prevTouchAction = (document.body.style as any).touchAction

        document.body.style.overflow = "hidden"
        ;(document.body.style as any).touchAction = "none"

        const prevent = (e: any) => {
            e.preventDefault()
        }

        // Block scroll wheel + touch scroll
        window.addEventListener("wheel", prevent, { passive: false } as any)
        window.addEventListener("touchmove", prevent, { passive: false } as any)

        return () => {
            document.body.style.overflow = prevOverflow
            ;(document.body.style as any).touchAction = prevTouchAction

            window.removeEventListener("wheel", prevent as any)
            window.removeEventListener("touchmove", prevent as any)
        }
    }, [cropPending])

    function openCropScreen(p: CropRequest) {
        setCropPending(p)
        resetCropUiIfNeeded()
    }

    function openCropFlow(source: SourceImage) {
        // P3: единая точка входа в CropFlow (без ChineseRoom/Editor)
        openCropScreen({ sourceImage: source })
    }

    function closeCropScreen() {
        resetImportUi("close")
    }

    function resetImportUi(reason: string) {
        if (ENABLE_PREP_LOGS) {
            console.log("[IMPORT][ui] reset", reason)
        }

        setImportStatus("idle")
        setImportError(null)

        setSelectedPresetId(null)
        setCropPending(null)

        cropDecodedRef.current = null
        cropPreviewSrcCanvasRef.current = null
        cropOriginalSourceRef.current = null
        setCropPreviewTick((t) => t + 1)
    }

    React.useEffect(() => {
        if (!cropPending) return

        // новый запрос — сбрасываем старое превью
        cropDecodedRef.current = null
        cropPreviewSrcCanvasRef.current = null
        cropOriginalSourceRef.current = null
        setCropPreviewTick((t) => t + 1)

        const jobId = ++cropDecodeJobRef.current

        setImportStatus("decoding")
        setImportError(null)

        const fail = (err: any) => {
            // Не трогаем UI, если этот decode уже устарел
            if (jobId !== cropDecodeJobRef.current) return

            console.error("[IMPORT][decode] processing failed", err)
            failImportInFlow("Failed to open image.")
        }

        // 1) Ветка FILE (как было)
        if ("file" in cropPending) {
            const file = cropPending.file
            const url = URL.createObjectURL(file)
            const img = new Image()

            const cleanup = () => {
                try {
                    URL.revokeObjectURL(url)
                } catch {}
            }

            img.onload = () => {
                if (jobId !== cropDecodeJobRef.current) {
                    cleanup()
                    return
                }

                try {
                    const offCanvas = document.createElement("canvas")

                    const srcW0 = (img as any).naturalWidth || img.width
                    const srcH0 = (img as any).naturalHeight || img.height
                    cropOriginalSourceRef.current = img

                    const maxSide = Math.max(srcW0, srcH0)
                    const k =
                        maxSide > 0
                            ? Math.min(
                                  1,
                                  IMPORT_PREVIEW_DECODE_MAX_SIDE / maxSide
                              )
                            : 1

                    const srcW = Math.max(1, Math.round(srcW0 * k))
                    const srcH = Math.max(1, Math.round(srcH0 * k))

                    offCanvas.width = srcW
                    offCanvas.height = srcH

                    const ctx = offCanvas.getContext("2d")
                    if (!ctx) throw new Error("Failed to get 2D context")

                    ctx.clearRect(0, 0, srcW, srcH)
                    ctx.drawImage(img, 0, 0, srcW, srcH)

                    const decoded = ctx.getImageData(0, 0, srcW, srcH)

                    cropDecodedRef.current = decoded
                    cropPreviewSrcCanvasRef.current = offCanvas

                    setImportStatus("ready")
                    setCropPreviewTick((t) => t + 1)
                } catch (err) {
                    fail(err)
                } finally {
                    cleanup()
                }
            }

            img.onerror = (e) => {
                cleanup()
                fail(e)
            }

            img.src = url
            return
        }

        // 2) Ветка SOURCE IMAGE (НОВАЯ)
        if ("sourceImage" in cropPending) {
            try {
                const src = cropPending.sourceImage as any
                cropOriginalSourceRef.current = cropPending.sourceImage as any

                const srcW0 = src?.width ?? 0
                const srcH0 = src?.height ?? 0
                if (!srcW0 || !srcH0)
                    throw new Error("Invalid SourceImage size")

                const offCanvas = document.createElement("canvas")

                const maxSide = Math.max(srcW0, srcH0)
                const k =
                    maxSide > 0
                        ? Math.min(1, IMPORT_PREVIEW_DECODE_MAX_SIDE / maxSide)
                        : 1

                const srcW = Math.max(1, Math.round(srcW0 * k))
                const srcH = Math.max(1, Math.round(srcH0 * k))

                offCanvas.width = srcW
                offCanvas.height = srcH

                const ctx = offCanvas.getContext("2d")
                if (!ctx) throw new Error("Failed to get 2D context")

                ctx.clearRect(0, 0, srcW, srcH)
                ctx.drawImage(src, 0, 0, srcW, srcH)

                // Если вдруг пока рисовали пришёл новый job — просто молча выходим
                if (jobId !== cropDecodeJobRef.current) return

                const decoded = ctx.getImageData(0, 0, srcW, srcH)

                // Ещё раз проверяем job перед коммитом (на случай, если getImageData занял время)
                if (jobId !== cropDecodeJobRef.current) return

                cropDecodedRef.current = decoded
                cropPreviewSrcCanvasRef.current = offCanvas

                setImportStatus("ready")
                setCropPreviewTick((t) => t + 1)
            } catch (err) {
                fail(err)
            }

            return
        }

        // На всякий случай: неизвестный вариант CropRequest
        fail(new Error("Unknown CropRequest variant"))
    }, [cropPending])

    React.useEffect(() => {
        if (!cropPending) return
        if (!cropPreviewCanvasPx) return
        renderCropPreview()
    }, [
        cropPending,
        cropPreviewTick,
        cropPreviewCanvasPx,

        // 🔥 важно: любые изменения UI-трансформаций должны перерисовывать превью
        cropUiScale,
        cropUiRotation,
        cropUiOffset.x,
        cropUiOffset.y,
    ])

    function cancelCrop() {
        // P5: Cancel = выход CropFlow = null
        setPendingCropResult(null)
        resetImportUi("cancel")
    }

    function confirmCrop() {
        // 🔒 защита от повторного OK
        if (importStatus === "applying") return

        const p = cropPending
        if (!p) {
            console.error("[IMPORT][confirmCrop] missing crop parameters", {
                p,
            })
            failImportInFlow("Crop parameters missing.")
            return
        }

        const prepared = applyGeometry()

        if (ENABLE_PREP_LOGS) {
            console.log("[CROP][prepared]", {
                w: prepared.width,
                h: prepared.height,
                a0: (() => {
                    let z = 0
                    const d = prepared.data
                    for (let i = 3; i < d.length; i += 4) if (d[i] === 0) z++
                    return z
                })(),
            })
        }

        if (!prepared) {
            console.error("[IMPORT][confirmCrop] applyGeometry returned null")
            failImportInFlow("Failed to apply crop geometry.")
            return
        }

        const preset: PresetId = selectedPresetId ?? "DEFAULT"

        // P5: Confirm = выход CropFlow = { prepared512, presetId }
        setImportError(null)
        setImportStatus("applying")
        setPendingCropResult({
            prepared512: prepared,
            presetId: preset,
            source: cropFlowSource,
        })
    }

    function retryImport() {
        // A2: при error даём повторить OK без потери кропа/превью
        // НИЧЕГО не сбрасываем: cropPending / cropDecodedRef / cropPreviewSrcCanvasRef остаются как есть
        setImportError(null)

        // если превью уже готово — возвращаем в ready, чтобы UI был консистентным
        if (
            cropPending &&
            cropDecodedRef.current &&
            cropPreviewSrcCanvasRef.current
        ) {
            setImportStatus("ready")
        } else {
            // иначе оставляем как есть (скорее всего decoding/error)
            // но в большинстве кейсов попадём в ready ветку выше
        }
    }

    function handleCropWheel(e: React.WheelEvent) {
        // важно: чтобы wheel не скроллил страницу под оверлеем
        e.preventDefault()

        const delta = e.deltaY

        // wheel up -> zoom in, wheel down -> zoom out
        const k = delta < 0 ? 1.08 : 0.92

        setCropUiScale((s) => {
            const next = s * k
            // разумные пределы, чтобы не улетать
            if (next < 0.25) return 0.25
            if (next > 8) return 8
            return next
        })

        bumpCropPreview()
    }

    function getLocalPoint(e: any) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    function getCenterForAngle(e: any) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        return { x: rect.width / 2, y: rect.height / 2 }
    }

    function angleBetween(ax: number, ay: number, bx: number, by: number) {
        return Math.atan2(by - ay, bx - ax)
    }

    function dist(ax: number, ay: number, bx: number, by: number) {
        const dx = bx - ax
        const dy = by - ay
        return Math.sqrt(dx * dx + dy * dy)
    }

    function clamp(n: number, a: number, b: number) {
        return Math.max(a, Math.min(b, n))
    }

    function getCropCenterClient() {
        const canvas = cropPreviewCanvasRef.current
        if (!canvas) return { cx: 0, cy: 0 }
        const rect = canvas.getBoundingClientRect()
        return {
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
        }
    }

    function handleCropPointerDown(
        e: React.PointerEvent,
        mode: "pan" | "rotate" | "scale"
    ) {
        e.preventDefault()
        e.stopPropagation()

        const target = e.currentTarget as HTMLElement
        target.setPointerCapture(e.pointerId)

        // регистрируем pointer
        cropPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

        // если стало 2 пальца/2 pointers — включаем pinch
        if (cropPointersRef.current.size === 2) {
            const { a, b } = getTwoPointers()
            const c = centerOf(a, b)

            cropPinchRef.current.active = true
            cropPinchRef.current.startCenterX = c.x
            cropPinchRef.current.startCenterY = c.y

            cropPinchRef.current.startDist = distOf(a, b)
            cropPinchRef.current.startAngle = angleOf(a, b)

            cropPinchRef.current.startScale = cropUiScale
            cropPinchRef.current.startRotation = cropUiRotation

            cropPinchRef.current.startOffsetX = cropUiOffset.x
            cropPinchRef.current.startOffsetY = cropUiOffset.y

            // при pinch обычный drag-режим выключаем
            cropDragRef.current.mode = "none"
            cropDragRef.current.pointerId = null
            return
        }

        // одиночный pointer — обычный drag (desktop handles / pan мышью)
        cropPinchRef.current.active = false

        cropDragRef.current.mode = mode
        cropDragRef.current.pointerId = e.pointerId

        cropDragRef.current.startX = e.clientX
        cropDragRef.current.startY = e.clientY

        cropDragRef.current.startOffsetX = cropUiOffset.x
        cropDragRef.current.startOffsetY = cropUiOffset.y

        cropDragRef.current.startRotation = cropUiRotation
        cropDragRef.current.startScale = cropUiScale

        const { cx, cy } = getCropCenterClient()

        if (mode === "rotate") {
            cropDragRef.current.startAngle = Math.atan2(
                e.clientY - cy,
                e.clientX - cx
            )
        }

        if (mode === "scale") {
            const dx = e.clientX - cx
            const dy = e.clientY - cy
            cropDragRef.current.startDist = Math.max(1, Math.hypot(dx, dy))
        }
    }

    function handleCropPointerMove(e: React.PointerEvent) {
        // обновляем pointer в карте
        if (cropPointersRef.current.has(e.pointerId)) {
            cropPointersRef.current.set(e.pointerId, {
                x: e.clientX,
                y: e.clientY,
            })
        }

        // pinch активен только когда 2 pointers
        if (cropPinchRef.current.active && cropPointersRef.current.size === 2) {
            e.preventDefault()
            e.stopPropagation()

            const { a, b } = getTwoPointers()
            const c = centerOf(a, b)

            const dist = distOf(a, b)
            const ang = angleOf(a, b)

            const ratio = dist / Math.max(1, cropPinchRef.current.startDist)

            const nextScale = cropPinchRef.current.startScale * ratio
            const clampedScale = Math.max(0.1, Math.min(20, nextScale))

            const deltaAng = ang - cropPinchRef.current.startAngle
            const nextRotation = cropPinchRef.current.startRotation + deltaAng

            const dxCenter = c.x - cropPinchRef.current.startCenterX
            const dyCenter = c.y - cropPinchRef.current.startCenterY

            setCropUiScale(clampedScale)
            setCropUiRotation(nextRotation)
            setCropUiOffset({
                x: cropPinchRef.current.startOffsetX + dxCenter,
                y: cropPinchRef.current.startOffsetY + dyCenter,
            })

            return
        }

        // обычный single-pointer drag
        const st = cropDragRef.current
        if (st.pointerId !== e.pointerId) return
        if (st.mode === "none") return

        e.preventDefault()
        e.stopPropagation()

        if (st.mode === "pan") {
            const dx = e.clientX - st.startX
            const dy = e.clientY - st.startY

            setCropUiOffset({
                x: st.startOffsetX + dx,
                y: st.startOffsetY + dy,
            })
            return
        }

        const { cx, cy } = getCropCenterClient()

        if (st.mode === "rotate") {
            const a = Math.atan2(e.clientY - cy, e.clientX - cx)
            const delta = a - st.startAngle
            setCropUiRotation(st.startRotation + delta)
            return
        }

        if (st.mode === "scale") {
            const dx = e.clientX - cx
            const dy = e.clientY - cy
            const dist = Math.max(1, Math.hypot(dx, dy))
            const ratio = dist / Math.max(1, st.startDist)

            const next = st.startScale * ratio
            const clamped = Math.max(0.1, Math.min(20, next))
            setCropUiScale(clamped)
            return
        }
    }

    function handleCropPointerUp(e: React.PointerEvent) {
        e.preventDefault()
        e.stopPropagation()

        // удаляем pointer из карты
        cropPointersRef.current.delete(e.pointerId)

        // если pinch был активен — выключаем его, когда пальцев стало меньше 2
        if (cropPinchRef.current.active && cropPointersRef.current.size < 2) {
            cropPinchRef.current.active = false
        }

        const st = cropDragRef.current
        if (st.pointerId !== e.pointerId) return

        st.mode = "none"
        st.pointerId = null
    }

    function openDraw() {
        setEditorImageData(null)
        setScreen("editor")
    }

    function isLikelyMobileDevice(): boolean {
        if (typeof navigator === "undefined") return false
        const ua = navigator.userAgent || ""
        return /Android|iPhone|iPad|iPod/i.test(ua)
    }

    function openSystemCameraHead() {
        // Desktop: use the existing custom CameraModal (it works on Win11)
        if (!isLikelyMobileDevice()) {
            const hasGetUserMedia =
                typeof navigator !== "undefined" &&
                !!(
                    navigator.mediaDevices &&
                    navigator.mediaDevices.getUserMedia
                )

            if (hasGetUserMedia) {
                setCameraOpen(true)
                return
            }

            // No camera API -> show the same import error overlay (OK only)
            console.warn("[CAMERA][head] no getUserMedia on desktop")
            failImport(CAMERA_IMPORT_ERROR_TEXT)
            return
        }

        // Mobile: use hidden <input capture> to open native camera UI
        const el = cameraInputRef.current
        if (!el) {
            console.warn("[CAMERA][head] cameraInputRef is null")
            failImport(CAMERA_IMPORT_ERROR_TEXT)
            return
        }

        try {
            // allow taking the same photo again
            el.value = ""
            el.click()
        } catch (err) {
            console.error("[CAMERA][head] click failed", err)
            failImport(CAMERA_IMPORT_ERROR_TEXT)
        }
    }

    function onCaptured(sourceImage: SourceImage) {
        // Камера = вторая труба: сначала CropFlow, потом ChineseRoom, потом Editor
        setCropFlowSource("camera")
        openCropFlow(sourceImage)
        setCameraOpen(false)
    }

    const handlePickedProjectFile = React.useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            if (!file) return

            // важно: чтобы повторный выбор того же файла срабатывал
            event.target.value = ""

            // 1) кладём файл в pending
            setPendingProjectFile(file)

            // 2) переключаемся в Editor (дальше Editor сам “съест” pending и восстановит)
            setScreen("editor")
        },
        [setScreen]
    )

    const content =
        screen === "start" ? (
            <>
                <StartScreen
                    onPickImage={openImagePicker}
                    onOpenCamera={openCamera}
                    onOpenDraw={openDraw}
                    onOpenProject={openProjectPicker}
                />
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handlePickedImage}
                />
                <input
                    ref={loadFileInputRef}
                    type="file"
                    accept=".pixtudio,application/json"
                    style={{ display: "none" }}
                    onChange={handlePickedProjectFile}
                />
            </>
        ) : (
            <>
                <PixelEditorFramer
                    initialImageData={editorImageData}
                    startWithImageVisible={true}
                    onRequestCamera={openSystemCameraHead}
                    onRequestCropFromFile={async ({ file }) => {
                        const sourceImage = await decodeToSourceImage(file)
                        openCropFlow(sourceImage)
                    }}
                    pendingProjectFile={pendingProjectFile}
                    onPendingProjectFileConsumed={() =>
                        setPendingProjectFile(null)
                    }
                    onRequestPickImage={openImagePicker}
                    onShowImportError={onShowImportError}
                />

                {/* общий file input: нужен и в start, и в editor */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handlePickedImage}
                />
            </>
        )

    return (
        <>
            {content}

            {/* ------------------- FOOTER STUBS (Start Screen) ------------------- */}
            {screen === "start" && (
                <div
                    style={{
                        position: "fixed",
                        left: 0,
                        right: 0,
                        bottom: 18,
                        zIndex: 50,

                        // ✅ внешний контейнер — только для позиционирования по центру экрана
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",

                        pointerEvents: "none", // важно: не ломаем клики по контенту
                        boxSizing: "border-box",
                    }}
                >
                    {/* ✅ реальная ширина футера = ширина логотипа */}
                    <div
                        style={{
                            width: START_LOGO_W,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            pointerEvents: "none",
                            boxSizing: "border-box",
                        }}
                    >
                        <div
                            style={{
                                fontFamily:
                                    "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
                                fontSize: 12,
                                color: "rgba(0,0,0,0.85)",
                                letterSpacing: 0.2,
                                pointerEvents: "auto",
                            }}
                        >
                            PIXTUDIO ©2026
                        </div>

                        <div
                            style={{
                                display: "flex",
                                //gap: 5,
                                alignItems: "center",
                                pointerEvents: "auto",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() =>
                                    console.log("[FOOTER] instagram")
                                }
                                style={footerIconStyle}
                                aria-label="Instagram"
                            >
                                <svg
                                    viewBox="0 0 71.78 71.78"
                                    width="18"
                                    height="18"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    {/* ...весь твой текущий svg без изменений... */}
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={() => console.log("[FOOTER] mailto")}
                                style={footerIconStyle}
                                aria-label="Telegram"
                            >
                                <svg
                                    viewBox="0 0 71.78 71.78"
                                    width="18"
                                    height="18"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <rect
                                        x="0"
                                        y="0"
                                        width="71.78"
                                        height="71.78"
                                        rx="20.85"
                                        ry="20.85"
                                        fill="#0a000f"
                                    />
                                    <path
                                        fill="#ffffff"
                                        d="M46.74,63.89h-21.71c-9.45,0-17.14-7.69-17.14-17.14v-21.71c0-9.45,7.69-17.14,17.14-17.14h21.71c9.45,0,17.14,7.69,17.14,17.14v21.71c0,9.45-7.69,17.14-17.14,17.14ZM25.03,12.09c-7.14,0-12.95,5.81-12.95,12.95v21.71c0,7.14,5.81,12.95,12.95,12.95h21.71c7.14,0,12.95-5.81,12.95-12.95v-21.71c0-7.14-5.81-12.95-12.95-12.95h-21.71Z"
                                    />
                                    <path
                                        fill="#ffffff"
                                        d="M35.89,50.05c-7.81,0-14.16-6.35-14.16-14.16s6.35-14.16,14.16-14.16,14.16,6.35,14.16,14.16-6.35,14.16-14.16,14.16ZM35.89,26.02c-5.44,0-9.87,4.43-9.87,9.87s4.43,9.87,9.87,9.87,9.87-4.43,9.87-9.87-4.43-9.87-9.87-9.87Z"
                                    />
                                    <circle
                                        cx="51.59"
                                        cy="20.19"
                                        r="3.69"
                                        fill="#ffffff"
                                    />
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={() => console.log("[FOOTER] email")}
                                style={footerIconStyle}
                                aria-label="Email"
                            >
                                <svg
                                    viewBox="0 0 79.8 63.84"
                                    width="18"
                                    height="15"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fill="#0a000f"
                                        d="M67.83,0H11.97C5.37,0,0,5.37,0,11.97v39.9c0,6.6,5.37,11.97,11.97,11.97h55.86c6.6,0,11.97-5.37,11.97-11.97V11.97c0-6.6-5.37-11.97-11.97-11.97Z"
                                    />
                                    <path
                                        fill="#ffffff"
                                        d="M67.83,7.98c.31,0,.62.04.91.11l-28.84,21.27L11.06,8.09c.29-.07.6-.11.91-.11h55.86Z"
                                    />
                                    <path
                                        fill="#ffffff"
                                        d="M67.83,55.86H11.97c-2.2,0-3.99-1.79-3.99-3.99V15.73l29.55,21.79c.7.52,1.54.78,2.37.78s1.66-.26,2.37-.78l29.55-21.79v36.14c0,2.2-1.79,3.99-3.99,3.99h0Z"
                                    />
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={() => console.log("[FOOTER] share")}
                                style={footerIconStyle}
                                aria-label="Share"
                            >
                                <svg
                                    viewBox="0 0 70.47 70.47"
                                    width="22"
                                    height="22"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="#0a000f"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M14.09,28.63c3.89,0,7.05,3.16,7.05,7.05s-3.16,7.05-7.05,7.05-7.05-3.16-7.05-7.05,3.16-7.05,7.05-7.05M56.37,7.05c3.89,0,7.05,3.16,7.05,7.05s-3.16,7.05-7.05,7.05c-9.31,0-9.32-14.09,0-14.09M56.37,49.33c3.89,0,7.05,3.16,7.05,7.05s-3.16,7.05-7.05,7.05c-9.31,0-9.32-14.09,0-14.09M14.09,49.77c4.3,0,8.1-1.97,10.69-5.01l17.64,10.19c-.89,8.76,5.95,15.52,13.95,15.52s14.09-6.31,14.09-14.09-6.31-14.09-14.09-14.09c-4.75,0-8.92,2.36-11.48,5.96l-16.99-9.81c.38-1.92.37-3.76-.03-5.68l17.43-10.03c2.58,3.3,6.55,5.46,11.07,5.46,7.78,0,14.09-6.31,14.09-14.09S64.16,0,56.37,0c-8.32,0-15.23,7.3-13.88,16.21l-17.81,10.25c-2.58-2.97-6.35-4.88-10.59-4.88-7.78,0-14.09,6.31-14.09,14.09s6.31,14.09,14.09,14.09"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {importErrorModalPortal}

            {/* camera head: MUST be mounted on both start + editor */}
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handlePickedCamera}
            />

            <CameraModal
                isOpen={cameraOpen}
                onClose={() => setCameraOpen(false)}
                onCaptured={(sourceImage) => {
                    setCropFlowSource("camera")
                    openCropFlow(sourceImage)
                }}
            />

            {cropPending && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,

                        background: "rgba(69,64,49,0.5)",
                        backdropFilter: "blur(10px)",
                        WebkitBackdropFilter: "blur(10px)",

                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 0,
                        zIndex: 9999,
                    }}
                    onWheel={(e) => e.preventDefault()}
                    onTouchMove={(e) => e.preventDefault()}
                >
                    <div
                        style={{
                            width: "100%",
                            maxWidth: 420,
                            height: "min(86vh, 820px)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 16,
                        }}
                    >
                        {/* ВЕРХНЯЯ ПОЛОВИНА: Crop preview */}
                        <div
                            style={{
                                width: "100%",
                                flex: "1 1 0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-start",
                                //paddingTop: "1vh",
                            }}
                        >
                            <div
                                style={{
                                    width: "100%",
                                    aspectRatio: "1 / 1",
                                    borderRadius: 8,
                                    overflow: "visible",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <div
                                    ref={cropPreviewBoxRef}
                                    onPointerDown={(e) => {
                                        setIsCropDragging(true)
                                        handleCropPointerDown(e, "pan")
                                    }}
                                    onPointerMove={handleCropPointerMove}
                                    onPointerUp={(e) => {
                                        setIsCropDragging(false)
                                        handleCropPointerUp(e)
                                    }}
                                    onPointerCancel={(e) => {
                                        setIsCropDragging(false)
                                        handleCropPointerUp(e)
                                    }}
                                    onWheel={handleCropWheel}
                                    style={{
                                        position: "relative",
                                        width: "100%",
                                        height: "100%",
                                        touchAction: "none",
                                        overflow: "visible",

                                        // ✅ курсор “ладошка” внутри рамки
                                        cursor: isCropDragging
                                            ? "grabbing"
                                            : "grab",
                                    }}
                                >
                                    <canvas
                                        ref={cropPreviewCanvasRef}
                                        width={cropPreviewCanvasPx}
                                        height={cropPreviewCanvasPx}
                                        style={{
                                            display: "block",
                                            width: "100%",
                                            height: "100%",

                                            cursor: isCropDragging
                                                ? "grabbing"
                                                : "grab",
                                        }}
                                    />

                                    {!isMobileOS && (
                                        <>
                                            {/* rotate handle — правый верх */}
                                            <div
                                                onPointerDown={(e) =>
                                                    handleCropPointerDown(
                                                        e,
                                                        "rotate"
                                                    )
                                                }
                                                style={{
                                                    position: "absolute",
                                                    right: 25,
                                                    top: 25,
                                                    width: 44,
                                                    height: 44,

                                                    background: "transparent",
                                                    border: "none",
                                                    cursor: "grab",
                                                    touchAction: "none",
                                                    zIndex: 5,

                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    userSelect: "none",
                                                }}
                                            >
                                                <svg
                                                    width="44"
                                                    height="44"
                                                    viewBox="0 0 44 44"
                                                    style={{ display: "block" }}
                                                    xmlns="http://www.w3.org/2000/svg"
                                                >
                                                    <polygon
                                                        fill="#fff"
                                                        points="42.64 29.03 41.74 29.03 40.83 29.03 40.83 29.94 39.92 29.94 39.01 29.94 39.01 30.85 38.11 30.85 37.2 30.85 36.29 30.85 36.29 29.94 36.29 29.03 36.29 28.13 35.38 28.13 35.38 27.22 35.38 26.31 35.38 25.4 34.48 25.4 34.48 24.5 34.48 23.59 33.57 23.59 33.57 22.68 33.57 21.78 32.66 21.78 32.66 20.87 31.76 20.87 31.76 19.96 31.76 19.05 30.85 19.05 30.85 18.15 29.94 18.15 29.94 17.24 29.03 17.24 29.03 16.33 29.03 15.42 28.13 15.42 28.13 14.52 27.22 14.52 26.31 14.52 26.31 13.61 25.4 13.61 25.4 12.7 24.5 12.7 24.5 11.79 23.59 11.79 23.59 10.89 22.68 10.89 21.78 10.89 21.78 9.98 20.87 9.98 19.96 9.98 19.96 9.07 19.05 9.07 18.15 9.07 18.15 8.17 17.24 8.17 16.33 8.17 15.42 8.17 15.42 7.26 14.52 7.26 13.61 7.26 12.7 7.26 12.7 6.35 12.7 5.44 12.7 4.54 13.61 4.54 13.61 3.63 13.61 2.72 13.61 1.81 14.52 1.81 14.52 .91 14.52 0 13.61 0 13.61 .91 12.7 .91 12.7 1.81 11.79 1.81 11.79 2.72 10.89 2.72 9.98 2.72 9.98 3.63 9.07 3.63 8.17 3.63 8.17 4.54 7.26 4.54 7.26 5.44 6.35 5.44 5.44 5.44 5.44 6.35 4.54 6.35 3.63 6.35 3.63 7.26 2.72 7.26 1.81 7.26 .91 7.26 .91 8.17 0 8.17 0 9.07 .91 9.07 1.81 9.07 1.81 9.98 2.72 9.98 3.63 9.98 3.63 10.89 4.54 10.89 5.44 10.89 5.44 11.79 6.35 11.79 7.26 11.79 7.26 12.7 8.17 12.7 9.07 12.7 9.07 13.61 9.98 13.61 10.89 13.61 10.89 14.52 11.79 14.52 11.79 15.42 12.7 15.42 13.61 15.42 13.61 16.33 14.52 16.33 14.52 15.42 14.52 14.52 13.61 14.52 13.61 13.61 13.61 12.7 13.61 11.79 12.7 11.79 12.7 10.89 13.61 10.89 14.52 10.89 14.52 11.79 15.42 11.79 16.33 11.79 17.24 11.79 17.24 12.7 18.15 12.7 19.05 12.7 19.05 13.61 19.96 13.61 20.87 13.61 20.87 14.52 21.78 14.52 21.78 15.42 22.68 15.42 22.68 16.33 23.59 16.33 24.5 16.33 24.5 17.24 25.4 17.24 25.4 18.15 26.31 18.15 26.31 19.05 27.22 19.05 27.22 19.96 27.22 20.87 28.13 20.87 28.13 21.78 29.03 21.78 29.03 22.68 29.03 23.59 29.94 23.59 29.94 24.5 30.85 24.5 30.85 25.4 30.85 26.31 31.76 26.31 31.76 27.22 31.76 28.13 31.76 29.03 32.66 29.03 32.66 29.94 32.66 30.85 31.76 30.85 31.76 29.94 30.85 29.94 29.94 29.94 29.03 29.94 29.03 29.03 28.13 29.03 27.22 29.03 27.22 29.94 28.13 29.94 28.13 30.85 28.13 31.76 29.03 31.76 29.03 32.66 29.94 32.66 29.94 33.57 29.94 34.48 30.85 34.48 30.85 35.38 30.85 36.29 31.76 36.29 31.76 37.2 31.76 38.11 32.66 38.11 32.66 39.01 32.66 39.92 33.57 39.92 33.57 40.83 33.57 41.74 33.57 42.64 34.48 42.64 34.48 43.55 35.38 43.55 35.38 42.64 36.29 42.64 36.29 41.74 36.29 40.83 36.29 39.92 37.2 39.92 37.2 39.01 37.2 38.11 38.11 38.11 38.11 37.2 38.11 36.29 39.01 36.29 39.01 35.38 39.92 35.38 39.92 34.48 39.92 33.57 40.83 33.57 40.83 32.66 40.83 31.76 41.74 31.76 41.74 30.85 42.64 30.85 42.64 29.94 43.55 29.94 43.55 29.03 42.64 29.03"
                                                    />
                                                </svg>
                                            </div>

                                            {/* scale handle — левый низ */}
                                            <div
                                                onPointerDown={(e) =>
                                                    handleCropPointerDown(
                                                        e,
                                                        "scale"
                                                    )
                                                }
                                                style={{
                                                    position: "absolute",
                                                    right: 25,
                                                    bottom: 25,
                                                    width: 44,
                                                    height: 44,

                                                    background: "transparent",
                                                    border: "none",
                                                    cursor: "nesw-resize",
                                                    touchAction: "none",
                                                    zIndex: 5,

                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    userSelect: "none",
                                                }}
                                            >
                                                <svg
                                                    width="44"
                                                    height="44"
                                                    viewBox="0 0 44 44"
                                                    style={{ display: "block" }}
                                                    xmlns="http://www.w3.org/2000/svg"
                                                >
                                                    {/* TODO: заменишь на свои пиксельные стрелки */}
                                                    {/* простая “масштаб” иконка-заглушка */}
                                                    <polygon
                                                        fill="#fff"
                                                        points="35.11 0 35.11 .78 34.33 .78 33.55 .78 32.77 .78 32.77 1.56 31.99 1.56 31.21 1.56 31.21 2.34 30.43 2.34 29.65 2.34 28.87 2.34 28.87 3.12 28.09 3.12 27.31 3.12 26.53 3.12 25.75 3.12 25.75 3.9 24.96 3.9 24.18 3.9 23.4 3.9 22.62 3.9 21.84 3.9 21.06 3.9 21.06 4.68 21.84 4.68 21.84 5.46 22.62 5.46 23.4 5.46 23.4 6.24 24.18 6.24 24.96 6.24 24.96 7.02 25.75 7.02 26.53 7.02 26.53 7.8 25.75 7.8 25.75 8.58 24.96 8.58 24.96 9.36 24.18 9.36 24.18 10.14 23.4 10.14 23.4 10.92 22.62 10.92 22.62 11.7 21.84 11.7 21.84 12.48 21.06 12.48 21.06 13.26 20.28 13.26 20.28 14.04 19.5 14.04 19.5 14.82 18.72 14.82 18.72 15.6 17.94 15.6 17.94 14.82 17.16 14.82 17.16 14.04 16.38 14.04 16.38 13.26 15.6 13.26 15.6 12.48 14.82 12.48 14.82 11.7 14.04 11.7 14.04 10.92 13.26 10.92 13.26 10.14 12.48 10.14 12.48 9.36 11.7 9.36 11.7 8.58 10.92 8.58 10.92 7.8 10.14 7.8 10.14 7.02 9.36 7.02 9.36 6.24 10.14 6.24 10.14 5.46 10.92 5.46 11.7 5.46 11.7 4.68 12.48 4.68 13.26 4.68 14.04 4.68 14.04 3.9 13.26 3.9 13.26 3.12 12.48 3.12 11.7 3.12 10.92 3.12 10.14 3.12 9.36 3.12 9.36 2.34 8.58 2.34 7.8 2.34 7.02 2.34 6.24 2.34 6.24 1.56 5.46 1.56 4.68 1.56 3.9 1.56 3.9 .78 3.12 .78 2.34 .78 2.34 0 1.56 0 .78 0 0 0 0 .78 0 1.56 .78 1.56 .78 2.34 .78 3.12 .78 3.9 1.56 3.9 1.56 4.68 1.56 5.46 1.56 6.24 2.34 6.24 2.34 7.02 2.34 7.8 2.34 8.58 3.12 8.58 3.12 9.36 3.12 10.14 3.12 10.92 3.12 11.7 3.12 12.48 3.9 12.48 3.9 13.26 3.9 14.04 4.68 14.04 4.68 13.26 4.68 12.48 5.46 12.48 5.46 11.7 5.46 10.92 5.46 10.14 6.24 10.14 6.24 9.36 7.02 9.36 7.8 9.36 7.8 10.14 8.58 10.14 8.58 10.92 9.36 10.92 9.36 11.7 10.14 11.7 10.14 12.48 10.92 12.48 10.92 13.26 11.7 13.26 11.7 14.04 12.48 14.04 12.48 14.82 13.26 14.82 13.26 15.6 14.04 15.6 14.04 16.38 14.82 16.38 14.82 17.16 15.6 17.16 15.6 17.94 15.6 18.72 14.82 18.72 14.82 19.5 14.04 19.5 14.04 20.28 13.26 20.28 13.26 21.06 12.48 21.06 12.48 21.84 11.7 21.84 11.7 22.62 10.92 22.62 10.92 23.4 10.14 23.4 10.14 24.18 9.36 24.18 9.36 24.96 8.58 24.96 8.58 25.74 7.8 25.74 7.8 26.53 7.02 26.53 6.24 26.53 6.24 25.74 5.46 25.74 5.46 24.96 5.46 24.18 5.46 23.4 4.68 23.4 4.68 22.62 4.68 21.84 3.9 21.84 3.9 22.62 3.9 23.4 3.12 23.4 3.12 24.18 3.12 24.96 3.12 25.74 3.12 26.53 3.12 27.31 2.34 27.31 2.34 28.09 2.34 28.87 2.34 29.65 1.56 29.65 1.56 30.43 1.56 31.21 1.56 31.99 .78 31.99 .78 32.77 .78 33.55 .78 34.33 0 34.33 0 35.11 0 35.89 .78 35.89 1.56 35.89 2.34 35.89 2.34 35.11 3.12 35.11 3.9 35.11 3.9 34.33 4.68 34.33 5.46 34.33 6.24 34.33 6.24 33.55 7.02 33.55 7.8 33.55 8.58 33.55 9.36 33.55 9.36 32.77 10.14 32.77 10.92 32.77 11.7 32.77 12.48 32.77 13.26 32.77 13.26 31.99 14.04 31.99 14.04 31.21 13.26 31.21 12.48 31.21 11.7 31.21 11.7 30.43 10.92 30.43 10.14 30.43 10.14 29.65 9.36 29.65 9.36 28.87 10.14 28.87 10.14 28.09 10.92 28.09 10.92 27.31 11.7 27.31 11.7 26.53 12.48 26.53 12.48 25.74 13.26 25.74 13.26 24.96 14.04 24.96 14.04 24.18 14.82 24.18 14.82 23.4 15.6 23.4 15.6 22.62 16.38 22.62 16.38 21.84 17.16 21.84 17.16 21.06 17.94 21.06 17.94 20.28 18.72 20.28 18.72 21.06 19.5 21.06 19.5 21.84 20.28 21.84 20.28 22.62 21.06 22.62 21.06 23.4 21.84 23.4 21.84 24.18 22.62 24.18 22.62 24.96 23.4 24.96 23.4 25.74 24.18 25.74 24.18 26.53 24.96 26.53 24.96 27.31 25.75 27.31 25.75 28.09 26.53 28.09 26.53 28.87 25.75 28.87 24.96 28.87 24.96 29.65 24.18 29.65 23.4 29.65 23.4 30.43 22.62 30.43 21.84 30.43 21.84 31.21 21.06 31.21 21.06 31.99 21.84 31.99 22.62 31.99 23.4 31.99 24.18 31.99 24.96 31.99 25.75 31.99 25.75 32.77 26.53 32.77 27.31 32.77 28.09 32.77 28.87 32.77 28.87 33.55 29.65 33.55 30.43 33.55 31.21 33.55 31.21 34.33 31.99 34.33 32.77 34.33 32.77 35.11 33.55 35.11 34.33 35.11 35.11 35.11 35.11 35.89 35.89 35.89 35.89 35.11 35.89 34.33 35.11 34.33 35.11 33.55 35.11 32.77 34.33 32.77 34.33 31.99 34.33 31.21 34.33 30.43 33.55 30.43 33.55 29.65 33.55 28.87 33.55 28.09 32.77 28.09 32.77 27.31 32.77 26.53 32.77 25.74 32.77 24.96 31.99 24.96 31.99 24.18 31.99 23.4 31.99 22.62 31.99 21.84 31.99 21.06 31.21 21.06 31.21 21.84 30.43 21.84 30.43 22.62 30.43 23.4 29.65 23.4 29.65 24.18 29.65 24.96 29.65 25.74 28.87 25.74 28.09 25.74 28.09 24.96 27.31 24.96 27.31 24.18 26.53 24.18 26.53 23.4 25.75 23.4 25.75 22.62 24.96 22.62 24.96 21.84 24.18 21.84 24.18 21.06 23.4 21.06 23.4 20.28 22.62 20.28 22.62 19.5 21.84 19.5 21.84 18.72 21.06 18.72 21.06 17.94 21.06 17.16 21.84 17.16 21.84 16.38 22.62 16.38 22.62 15.6 23.4 15.6 23.4 14.82 24.18 14.82 24.18 14.04 24.96 14.04 24.96 13.26 25.75 13.26 25.75 12.48 26.53 12.48 26.53 11.7 27.31 11.7 27.31 10.92 28.09 10.92 28.09 10.14 28.87 10.14 29.65 10.14 29.65 10.92 29.65 11.7 29.65 12.48 30.43 12.48 30.43 13.26 30.43 14.04 31.21 14.04 31.21 14.82 31.99 14.82 31.99 14.04 31.99 13.26 31.99 12.48 31.99 11.7 31.99 10.92 32.77 10.92 32.77 10.14 32.77 9.36 32.77 8.58 32.77 7.8 33.55 7.8 33.55 7.02 33.55 6.24 33.55 5.46 34.33 5.46 34.33 4.68 34.33 3.9 34.33 3.12 35.11 3.12 35.11 2.34 35.11 1.56 35.89 1.56 35.89 .78 35.89 0 35.11 0"
                                                    />
                                                </svg>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* НИЖНЯЯ ПОЛОВИНА: Presets */}
                        <div
                            style={{
                                width: "100%",
                                flex: "1 1 0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <div
                                style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    paddingTop: 6,
                                    paddingBottom: 8,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 26,
                                        justifyContent: "center",
                                    }}
                                >
                                    {(() => {
                                        const chosen = selectedPresetId // null => DEFAULT
                                        const dimOthers = chosen !== null

                                        const opacityFor = (id: PresetId) => {
                                            if (!dimOthers) return 1
                                            return chosen === id ? 1 : 0.5
                                        }
                                        const presetTextBtnStyle: React.CSSProperties =
                                            {
                                                border: "none",
                                                background: "transparent",
                                                padding: 0,
                                                cursor: "pointer",
                                                WebkitTapHighlightColor:
                                                    "transparent",

                                                // компоновка (вместо 110×110)
                                                height: 40,
                                                minWidth: 88,

                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",

                                                // типографика
                                                color: "#FFFFFF",
                                                fontSize: 24,
                                                letterSpacing: 0.5,

                                                // важно: шрифт тот же, что в приложении
                                                // если у тебя в проекте уже есть глобальный fontFamily на body,
                                                // можно НЕ задавать fontFamily здесь вообще.
                                                fontFamily: "inherit",

                                                // и вот это — requested Black
                                                fontWeight: 900,

                                                // чтобы текст не выделялся при случайном свайпе/драгге
                                                userSelect: "none",
                                            }

                                        const togglePreset = (id: PresetId) => {
                                            setSelectedPresetId((prev) =>
                                                prev === id ? null : id
                                            )
                                        }

                                        return (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        togglePreset("NEON")
                                                    }
                                                    style={{
                                                        ...presetTextBtnStyle,
                                                        opacity:
                                                            opacityFor("NEON"),
                                                    }}
                                                    aria-label="NEON"
                                                >
                                                    <span
                                                        style={{
                                                            lineHeight: 1,
                                                        }}
                                                    >
                                                        NEON
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        togglePreset(
                                                            "GRAYSCALE"
                                                        )
                                                    }
                                                    style={{
                                                        ...presetTextBtnStyle,
                                                        opacity:
                                                            opacityFor(
                                                                "GRAYSCALE"
                                                            ),
                                                    }}
                                                    aria-label="GRAYSCALE"
                                                >
                                                    <span
                                                        style={{
                                                            lineHeight: 1,
                                                        }}
                                                    >
                                                        GRAY
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        togglePreset("BW")
                                                    }
                                                    style={{
                                                        ...presetTextBtnStyle,
                                                        opacity:
                                                            opacityFor("BW"),
                                                    }}
                                                    aria-label="B/W"
                                                >
                                                    <span
                                                        style={{
                                                            lineHeight: 1,
                                                        }}
                                                    >
                                                        B/W
                                                    </span>
                                                </button>
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* КНОПКИ ❌ / ✅ */}
                        <div
                            style={{
                                width: "100%",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 8,
                                paddingTop: 4,
                            }}
                        >
                            {importStatus !== "idle" && (
                                <div
                                    style={{
                                        display: "none",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        letterSpacing: 0.2,
                                        textAlign: "center",
                                        color:
                                            importStatus === "applying"
                                                ? "#04E762"
                                                : "#001219",
                                        maxWidth: 280,
                                    }}
                                >
                                    {importStatus === "decoding" &&
                                        "Decoding image…"}
                                    {importStatus === "ready" &&
                                        "Ready to import"}
                                    {importStatus === "applying" &&
                                        "Applying import…"}
                                </div>
                            )}

                            {/* (legacy error hint removed — unified importErrorModal handles errors) */}

                            <div
                                style={{
                                    width: "100%",
                                    display: "flex",
                                    justifyContent: "center",
                                    gap: 28,
                                }}
                            >
                                <button
                                    onClick={cancelCrop}
                                    disabled={
                                        importStatus === "decoding" ||
                                        importStatus === "applying"
                                    }
                                    style={{
                                        width: 96,
                                        height: 96,
                                        border: "none",
                                        background: "transparent",
                                        padding: 0,
                                        cursor:
                                            importStatus === "decoding" ||
                                            importStatus === "applying"
                                                ? "not-allowed"
                                                : "pointer",
                                    }}
                                    aria-label="Cancel"
                                >
                                    <SvgCancelButton
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                        }}
                                    />
                                </button>

                                <button
                                    onClick={confirmCrop}
                                    disabled={
                                        importStatus === "decoding" ||
                                        importStatus === "applying"
                                    }
                                    style={{
                                        width: 96,
                                        height: 96,
                                        border: "none",
                                        background: "transparent",
                                        padding: 0,
                                        cursor:
                                            importStatus === "decoding" ||
                                            importStatus === "applying"
                                                ? "not-allowed"
                                                : "pointer",
                                    }}
                                    aria-label="OK"
                                >
                                    <SvgOkButton
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                        }}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

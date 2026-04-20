import * as React from "react"
import * as ReactDOM from "react-dom"

import { ManualScreen } from "./ManualScreen.tsx"

import SmartReferenceEditor, {
    ZERO_SMART_REFERENCE_ADJUSTMENTS,
    SMART_REFERENCE_VERSION_1,
    type SmartReferenceAdjustments,
    type SmartObjectCommittedState,
    type SmartObjectCommittedStateBridge,
    type ReferenceSnapshotEnvelope,
} from "./SmartReferenceEditor.tsx"

import { parseProjectSnapshotV2Json } from "./projectSnapshotV2.ts"

import {
    createRootHistoryState,
    rootHistoryAbort,
    rootHistoryBegin,
    rootHistoryCanRedo,
    rootHistoryCanUndo,
    rootHistoryClear,
    rootHistoryCommit,
    rootHistoryFinalize,
    rootHistoryRedo,
    rootHistoryUndo,
    type RootHistoryEntryKind,
    type RootHistoryState,
} from "./rootHistory.ts"

import {
    SvgTopButton3,
    SvgTopButton4,
    SvgManualButton,
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
    SvgSmartObject,
} from "./SvgIcons.tsx"

import { track } from "./analytics.ts"

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

const ENABLE_ROOT_HISTORY_LOGS = false

const ENABLE_CORE_LIFECYCLE_DEBUG_LOGS = false

function coreLifecycleLog(stage: string, meta?: Record<string, unknown>) {
    if (!ENABLE_CORE_LIFECYCLE_DEBUG_LOGS) return
    const t = nowMs().toFixed(1)
    try {
        console.log(`[CORE t=${t}] ${stage}`, meta ?? "")
    } catch {
        console.log(`[CORE t=${t}] ${stage}`)
    }
}

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

function get2dReadFrequentlyContext(
    canvas: HTMLCanvasElement
): CanvasRenderingContext2D | null {
    return canvas.getContext("2d", {
        willReadFrequently: true,
    } as CanvasRenderingContext2DSettings)
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

    const ctx = get2dReadFrequentlyContext(tile)!
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
void drawCoverIntoSquare

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
void smoothFade01

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

// ------------------- N2 — NEON_ARCADE palette (with electric yellow) -------------------

const NEON_ARCADE_32: string[] = [
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

    "#F3E6FF",
    "#F2F6FF", // near white (new highlight)

    "#BFD6FF",
    "#9AD8FF",
    "#5BC2FF",

    "#4ED6C4",

    "#FFF34D", // electric yellow

    "#FF6AD5",
]
void NEON_ARCADE_32

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
//const PALETTE_NEON_32: string[] = NEON_ARCADE_32

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
export type { Pixel }
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

const PIX_UI_BUTTON_ANIM_CSS = `
.pxUiAnim {
    transition:
        transform 120ms ease,
        filter 120ms ease;
    transform-origin: center;
    will-change: transform, filter;
}

.pxUiAnim:hover:not(:disabled) {
    transform: translateY(-2px) scale(1.05);
    filter: drop-shadow(0 4px 0px rgba(0, 0, 0, 0.22));
}

.pxUiAnim:active:not(:disabled) {
    transform: translateY(1px) scale(0.97);
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.18));
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

// =====================================================
// OK / CANCEL BUTTON STYLE (shared across the editor)
// =====================================================

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

// =====================================================
// SWATCH EDIT MODAL LAYOUT
// Desktop: fixed square-ish modal.
// Mobile: viewport width minus 30px on each side.
// =====================================================

const SWATCH_EDIT_MODAL_DESKTOP_SIZE = 400
//const SWATCH_EDIT_MODAL_MAX_WIDTH = "min(92vw, 400px)"
const SWATCH_EDIT_MODAL_MOBILE_SIDE_GAP = 30

const SWATCH_EDIT_MODAL_INNER_PADDING = 14
const SWATCH_EDIT_MODAL_CONTENT_GAP = 8

const SWATCH_EDIT_TITLE_FONT = 16
const SWATCH_EDIT_TITLE_LETTER_SPACING = 0.8

const SWATCH_EDIT_HUE_HEIGHT = 14

const SWATCH_EDIT_BORDER = "2px solid rgba(0,0,0,0.75)"

const SWATCH_EDIT_ROW_GAP = 10

const SWATCH_EDIT_BOTTOM_BLOCK_GAP = 8

const SWATCH_EDIT_LABEL_FONT = 11
const SWATCH_EDIT_LABEL_LETTER_SPACING = 0.4

const SWATCH_EDIT_HEX_FONT = 12
const SWATCH_EDIT_HEX_INPUT_HEIGHT = 32
const SWATCH_EDIT_HEX_MAX_WIDTH = 150
const SWATCH_EDIT_HEX_LETTER_SPACING = 0.4

const SWATCH_EDIT_HEX_BOX_WIDTH = SWATCH_EDIT_HEX_MAX_WIDTH

const SWATCH_EDIT_HELP_FONT = 10
const SWATCH_EDIT_HELP_LINE_HEIGHT = 1.35

const SWATCH_EDIT_CHECK_SIZE = 20

const SWATCH_EDIT_PREVIEW_SIZE = 24

const SWATCH_EDIT_SV_THUMB_SIZE = 16
const SWATCH_EDIT_SV_THUMB_OFFSET = 8

const SWATCH_EDIT_HUE_CURSOR_WIDTH = 3
const SWATCH_EDIT_HUE_CURSOR_HEIGHT = 20
const SWATCH_EDIT_HUE_CURSOR_TOP = -3
const SWATCH_EDIT_HUE_CURSOR_OFFSET = 1.5

// ------------------- ALERT MODAL (shared) -------------------

// Пропорции белой подложки (viewBox 1189.63 x 416.35)
const ALERT_BACKING_RATIO = 1189.63 / 416.35
void ALERT_BACKING_RATIO

const ALERT_MODAL_MAX_W = 520
void ALERT_MODAL_MAX_W
const ALERT_MODAL_MIN_W = 280
void ALERT_MODAL_MIN_W

// паддинги текста внутри белой подложки
const ALERT_PAD_X = 22
void ALERT_PAD_X
const ALERT_PAD_Y = 18
void ALERT_PAD_Y

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

const PALETTE_MIN = 10
const PALETTE_MAX = 32

//const DIAG_MAIN_TRACK_FILL = "#FF2D2D"
//const DIAG_MAIN_TRACK_REST = "rgba(255, 45, 45, 0.28)"

const rangeTrackStyle = (
    value: number,
    min: number,
    max: number,
    fillColor: string
) => {
    const pct = ((value - min) / (max - min)) * 100
    return {
        "--px-track-pct": `${pct}%`,
        "--px-track-fill": fillColor, // цветная часть (слева от кружка),
        "--px-track-rest": "rgba(255,255,255,0.25)", // правая часть (как было),
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
void toGrayscaleGrid

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
void warnIfBwPaletteInvalid

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
void toBlackWhiteGrid

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
    const s = max === 0 ? 0 : d / max
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
void rgbToHsvInto01

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
void hsvToRgbInto01

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

    const safePal = pal.filter(
        (p): p is { r: number; g: number; b: number } => p !== null
    )
    if (safePal.length === 0) return pixels.map((row) => [...row])

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

            for (let i = 0; i < safePal.length; i++) {
                const p = safePal[i]
                const dr = r - p.r
                const dg = g - p.g
                const db = b - p.b
                const d = dr * dr + dg * dg + db * db
                if (d < bestDist) {
                    bestDist = d
                    best = i
                }
            }

            const p = safePal[best]
            if (!p) {
                outRow[x] = null
                continue
            }
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

    const centroids = uniqueColors
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
                            (typeof window !== "undefined"
                                ? window.innerWidth
                                : 0)
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
            }}
        >
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
            } catch {
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
    const reportCodeInputRef = React.useRef<HTMLInputElement | null>(null)
    const [taglineFontPx, setTaglineFontPx] = React.useState(20)
    const [isReportCodeOpen, setIsReportCodeOpen] = React.useState(false)
    const [reportCode, setReportCode] = React.useState("")

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

    React.useEffect(() => {
        if (!isReportCodeOpen) return

        const raf = window.requestAnimationFrame(() => {
            reportCodeInputRef.current?.focus()
        })

        return () => window.cancelAnimationFrame(raf)
    }, [isReportCodeOpen])

    const openReportCodeModal = React.useCallback(() => {
        setReportCode("")
        setIsReportCodeOpen(true)
    }, [])

    const closeReportCodeModal = React.useCallback(() => {
        setReportCode("")
        setIsReportCodeOpen(false)
    }, [])

    const submitReportCode = React.useCallback(() => {
        const code = reportCode

        closeReportCodeModal()

        fetch("/api/admin/send-analytics-report", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ code }),
            keepalive: true,
        }).catch(() => {
            // Intentionally silent.
        })
    }, [closeReportCodeModal, reportCode])

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

    const logoButtonStyle: React.CSSProperties = {
        width: "100%",
        height: 52,
        border: "none",
        background: "transparent",
        padding: 0,
        margin: 0,
        display: "block",
        cursor: "default",
        WebkitTapHighlightColor: "transparent",
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

    const reportCodeModal = isReportCodeOpen
        ? ReactDOM.createPortal(
              <div
                  style={ALERT_OVERLAY_STYLE}
                  onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                  }}
              >
                  <form
                      onSubmit={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          submitReportCode()
                      }}
                      style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          pointerEvents: "auto",
                      }}
                      onClick={(e) => {
                          e.stopPropagation()
                      }}
                  >
                      <div
                          style={{
                              position: "relative",
                              width: "min(300px, calc(100vw - 48px))",
                              height: "105px",
                          }}
                      >
                          <div style={{ position: "absolute", inset: 0 }}>
                              <SvgAlertBacking
                                  style={{
                                      width: "100%",
                                      height: "100%",
                                      display: "block",
                                  }}
                                  ariaLabel="Code modal backing"
                              />
                          </div>

                          <div
                              style={{
                                  position: "relative",
                                  width: "100%",
                                  height: "100%",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 10,
                                  padding: "20px 32px",
                                  boxSizing: "border-box",
                              }}
                          >
                              <div
                                  style={{
                                      fontSize: 18,
                                      fontWeight: 900,
                                      letterSpacing: 0,
                                      textAlign: "center",
                                      color: "black",
                                  }}
                              >
                                  Введите код
                              </div>

                              <input
                                  ref={reportCodeInputRef}
                                  type="password"
                                  name="pixtudio-analytics-code"
                                  autoComplete="current-password"
                                  value={reportCode}
                                  onChange={(e) =>
                                      setReportCode(e.currentTarget.value)
                                  }
                                  style={{
                                      width: "100%",
                                      height: 28,
                                      border: "2px solid rgba(0,0,0,0.75)",
                                      borderRadius: 0,
                                      background: "#ffffff",
                                      color: "#000000",
                                      fontSize: 16,
                                      lineHeight: "24px",
                                      letterSpacing: 0,
                                      outline: "none",
                                      padding: "0 8px",
                                      boxSizing: "border-box",
                                      fontFamily:
                                          "Roboto, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                                  }}
                              />
                          </div>
                      </div>

                      <div
                          style={{
                              display: "flex",
                              justifyContent: "center",
                              pointerEvents: "auto",
                              flex: "0 0 auto",
                          }}
                      >
                          <button
                              type="button"
                              onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  closeReportCodeModal()
                              }}
                              style={okCancelButtonStyle}
                              aria-label="Cancel"
                              className="pxUiAnim"
                          >
                              <SvgCancelButton style={okCancelSvgStyle} />
                          </button>

                          <button
                              type="submit"
                              style={okCancelButtonStyle}
                              aria-label="OK"
                              className="pxUiAnim"
                          >
                              <SvgOkButton style={okCancelSvgStyle} />
                          </button>
                      </div>
                  </form>
              </div>,
              document.body
          )
        : null

    return (
        <FitToViewport background={bg}>
            <style>{PIX_UI_BUTTON_ANIM_CSS}</style>

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
                    <button
                        type="button"
                        onClick={openReportCodeModal}
                        style={logoButtonStyle}
                        aria-label="PIXTUDIO"
                    >
                        <SvgLogo style={{ imageRendering: "pixelated" }} />
                    </button>
                    <div ref={taglineRef} style={taglineStyle}>
                        {TAGLINE_TEXT}
                    </div>
                </div>

                <div aria-hidden="true" style={logoButtonsSpacerStyle} />

                <div style={buttonsWrap}>
                    <button
                        type="button"
                        onClick={onPickImage}
                        className="pxUiAnim"
                        style={circleButton}
                        aria-label="Image"
                    >
                        <div style={circleInner}>
                            <SvgCircle style={circleSvgStyle} />
                            <div style={iconStyle}>
                                <SvgImage
                                    style={{ imageRendering: "pixelated" }}
                                />
                            </div>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={onOpenCamera}
                        className="pxUiAnim"
                        style={circleButton}
                        aria-label="Camera"
                    >
                        <div style={circleInner}>
                            <SvgCircle style={circleSvgStyle} />
                            <div style={iconStyle}>
                                <SvgCamera
                                    style={{ imageRendering: "pixelated" }}
                                />
                            </div>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={onOpenDraw}
                        className="pxUiAnim"
                        style={circleButton}
                        aria-label="Draw"
                    >
                        <div style={circleInner}>
                            <SvgCircle style={circleSvgStyle} />
                            <div style={iconStyle}>
                                <SvgPencil
                                    style={{ imageRendering: "pixelated" }}
                                />
                            </div>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={onOpenProject}
                        className="pxUiAnim"
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
            {reportCodeModal}
        </FitToViewport>
    )
}

// ------------------- EDITOR -------------------

type OverlayMode = null | "import" | "export"

type BusyKind = "stream" | "txn" | null

type PendingFlags = {
    repixelize: boolean
    gridCommit: boolean
    overlayRequant: boolean
    gridPolicyBlankCheck: boolean
}

// ------------------- GLOBAL LAYOUT CONSTANTS -------------------
// ширина логотипа стартового экрана (используется и в футере)
const START_LOGO_W = 260

// =====================
// SMART OBJECT ARCHITECTURE CONTRACT — S0
// =====================
//
// Root / gateway:
// - принимает baked reference после import
// - в будущем открывает/закрывает SmartObject
// - получает committed snapshot из SmartObject
// - передаёт committed snapshot в editor
//
// SmartObject module:
// - хранит base
// - хранит adjustments
// - строит preview
// - по Apply отдаёт committed snapshot
// - по Cancel ничего не меняет
// - по Export сохраняет текущее preview 512×512
//
// Editor:
// - получает только committed snapshot
// - работает по старому pipeline
// - ничего не знает о smart-object
//
// S1:
// - SmartObject UI ещё отсутствует
// - математики smart-object ещё нет
// - gateway работает как пустой pass-through adapter

// EDITOR MODULE BOUNDARY:
// PixelEditorFramer получает только committed reference snapshot.
// Он не знает о baked base, gateway-slot, smart-object state,
// preview, adjustments, Apply/Cancel/Export.

// S2 note:
// SmartReferenceEditor создаётся как отдельный .tsx-модуль.
// На этом шаге он ещё не импортируется и не подключается к root/editor.
// Это намеренный NO-OP: сначала создаём контейнер, потом подключаем gateway.

// =====================
// UNDO / REDO (H1/H2: infra only, no UI behavior changes yet)
// module-scope history contracts
// =====================

// S1 FINAL HISTORY CONTRACT:
//
// Единственным источником истины для пользовательской истории
// становится ROOT HISTORY ENGINE.
//
// Это означает:
//
// 1) Любой HistoryEntry описывает согласованное состояние двух доменов:
//    - editor-domain
//    - smart-domain
//
// 2) Undo / Redo пользователя обязаны идти через root history,
//    а не через локальную editor-history.
//
//
// 4) Обычные editor actions в финальной модели тоже должны стать
//    root transactions.
//
// На текущем шаге (S1/S2) мы ещё не мигрируем все editor actions,
// но уже фиксируем root history как user-facing source of truth.
type HistoryEntryKind = RootHistoryEntryKind

type EditorCommittedState = {
    gridSize: number
    paletteCount: number
    brushSize: number
    imagePixels: PixelValue[][]
    overlayPixels: PixelValue[][]
    showImage: boolean
    hasOriginalImageData: boolean
    referenceSnapshot?: ImageData | null
    autoSwatches: Swatch[]
    userSwatches: Swatch[]
    selectedSwatch: SwatchId | "transparent"
    autoOverrides: Record<
        string,
        {
            hex?: string
            isTransparent?: boolean
        }
    >
}

type EditorCommittedStateBridge = {
    captureCommittedState: () => EditorCommittedState
    applyCommittedState: (state: EditorCommittedState) => void

}

type EditorCommittedStateSettledPayload = {
    state: EditorCommittedState
    routeKind: "import" | "load" | "smart-object-apply"
}

type UserActionBeginInput = {
    kind: HistoryEntryKind
    editorBefore: EditorCommittedState | null
    smartBefore?: SmartObjectCommittedState | null
}

type UserActionFinalizeInput = {
    smartAfter?: SmartObjectCommittedState | null
}

type UserActionCommitInput = {
    editorAfter: EditorCommittedState | null
    smartAfter?: SmartObjectCommittedState | null
}

type EditorActionTransaction = {
    kind: "editor-action"
    before: EditorCommittedState
}

type BeginHistoryTransactionInput = {
    kind: HistoryEntryKind
    editorBefore: EditorCommittedState | null
    smartBefore: SmartObjectCommittedState | null
}

function areEditorCommittedStatesEqual(
    a: EditorCommittedState | null,
    b: EditorCommittedState | null
): boolean {
    if (a === b) return true
    if (!a || !b) return false
    if (a.gridSize !== b.gridSize) return false
    if (a.paletteCount !== b.paletteCount) return false
    if ((a as any).brushSize !== (b as any).brushSize) return false
    if (a.showImage !== b.showImage) return false
    if (a.selectedSwatch !== b.selectedSwatch) return false
    if (a.hasOriginalImageData !== b.hasOriginalImageData) return false

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
        if (((av?.hex ?? null) || null) !== ((bv?.hex ?? null) || null))
            return false
        if (!!av?.isTransparent !== !!bv?.isTransparent) return false
    }

    if (a.autoSwatches.length !== b.autoSwatches.length) return false
    for (let i = 0; i < a.autoSwatches.length; i++) {
        const sa = a.autoSwatches[i]
        const sb = b.autoSwatches[i]
        if (!sb) return false
        if (sa.id !== sb.id) return false
        if (sa.color !== sb.color) return false
        if (sa.isTransparent !== sb.isTransparent) return false
        if (sa.isUser !== sb.isUser) return false
    }

    if (a.userSwatches.length !== b.userSwatches.length) return false
    for (let i = 0; i < a.userSwatches.length; i++) {
        const sa = a.userSwatches[i]
        const sb = b.userSwatches[i]
        if (!sb) return false
        if (sa.id !== sb.id) return false
        if (sa.color !== sb.color) return false
        if (sa.isTransparent !== sb.isTransparent) return false
        if (sa.isUser !== sb.isUser) return false
    }

    if (a.imagePixels.length !== b.imagePixels.length) return false
    for (let r = 0; r < a.imagePixels.length; r++) {
        const ra = a.imagePixels[r] || []
        const rb = b.imagePixels[r] || []
        if (ra.length !== rb.length) return false
        for (let c = 0; c < ra.length; c++) {
            if ((ra[c] ?? null) !== (rb[c] ?? null)) return false
        }
    }

    if (a.overlayPixels.length !== b.overlayPixels.length) return false
    for (let r = 0; r < a.overlayPixels.length; r++) {
        const ra = a.overlayPixels[r] || []
        const rb = b.overlayPixels[r] || []
        if (ra.length !== rb.length) return false
        for (let c = 0; c < ra.length; c++) {
            if ((ra[c] ?? null) !== (rb[c] ?? null)) return false
        }
    }

    return true
}

function areSmartObjectCommittedStatesEqual(
    a: SmartObjectCommittedState | null,
    b: SmartObjectCommittedState | null
): boolean {
    if (a === b) return true
    if (!a || !b) return false
    if (a.revision !== b.revision) return false

    const aa = a.adjustments
    const ba = b.adjustments
    return (
        aa.exposure === ba.exposure &&
        aa.whiteBalance === ba.whiteBalance &&
        aa.contrast === ba.contrast &&
        aa.saturation === ba.saturation &&
        aa.shadows === ba.shadows &&
        aa.midtones === ba.midtones &&
        aa.highlights === ba.highlights
    )
}

function PixelEditorFramer({
    initialImageData,
    initialImageRouteKind,
    startWithImageVisible,
    onCaptureSmartReferenceBaseForSave,
    onCaptureSmartObjectCommittedStateForSave,
    onRestoreSmartObjectFromLoad,
    onRequestCamera,
    onRequestCropFromFile,
    onRequestPickImage,
    onRequestBlankImport,
    onRequestOpenProject,
    pendingProjectFile,
    onPendingProjectFileConsumed,
    onShowImportError,
    onOpenSmartReferenceTest,
    onEditorCommittedStateBridgeReady,
    onEditorCommittedStateSettled,
    onBeginUserAction,
    onCommitUserAction,
    onAbortUserAction,
    onCoordinatedUndo,
    onCoordinatedRedo,
    coordinatedCanUndo,
    coordinatedCanRedo,
}: {
    // committed reference snapshot from ROOT gateway
    initialImageData: ImageData | null
    initialImageRouteKind: "import" | "load" | "smart-object-apply" | null
    // save-side bridge:
    // editor не владеет Smart Object base/committed adjustments,
    // поэтому получает их из root только для сериализации save-файла.
    onCaptureSmartReferenceBaseForSave?: () => ImageData | null
    onCaptureSmartObjectCommittedStateForSave?: () => SmartObjectCommittedState | null

    // load-side bridge:
    // editor НЕ имеет права финально писать loaded ref напрямую в себя.
    // Он передаёт restore в root Smart Object gateway.
    onRestoreSmartObjectFromLoad?: (payload: {
        base: ImageData | null
        adjustments: SmartReferenceAdjustments
    }) => boolean
    startWithImageVisible: boolean
    onRequestCamera: () => void
    onRequestCropFromFile: (p: { file: File }) => void
    onRequestPickImage?: () => void
    onRequestBlankImport?: () => void
    onRequestOpenProject?: () => void

    // ✅ NEW: project-open bridge from ROOT
    pendingProjectFile?: File | null
    onPendingProjectFileConsumed?: () => void
    onOpenSmartReferenceTest?: () => void

    // H3:
    // Root получает bridge для capture/apply editor committed-state.
    onEditorCommittedStateBridgeReady?: (
        bridge: EditorCommittedStateBridge | null
    ) => void

    // H3:
    // Editor сообщает Root, что committed reference уже доехал
    // и editor-domain теперь находится в новом committed-state.
    onEditorCommittedStateSettled?: (
        payload: EditorCommittedStateSettledPayload
    ) => void

    // Step 0:
    // editor не пишет root history напрямую.
    // Он работает через единый user-action protocol.
    onBeginUserAction?: (input: UserActionBeginInput) => void
    onFinalizePendingUserAction?: (input?: UserActionFinalizeInput) => void
    onCommitUserAction?: (input: UserActionCommitInput) => void
    onAbortUserAction?: () => void

    // H5:
    // S2:
    // user-facing Undo/Redo приходят из Root History Engine.
    // Если они переданы, editor должен считать их главными.
    onCoordinatedUndo?: () => void
    onCoordinatedRedo?: () => void
    coordinatedCanUndo?: boolean
    coordinatedCanRedo?: boolean

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

        if (doGridCommit) {
            applyPendingGridCommit()
        }
        if (doRepixelize) {
            applyPendingRepixelize()
        }
        if (doOverlayRequant) {
            applyPendingOverlayRequant()
        }
        if (doGridPolicyBlankCheck) {
            applyPendingGridPolicyBlankCheck()
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

    const DEFAULT_EDITOR_GRID_SIZE = 32
    const DEFAULT_EDITOR_PALETTE_COUNT = 16

    const [gridSize, setGridSize] = React.useState(DEFAULT_EDITOR_GRID_SIZE)
    const [paletteCount, setPaletteCount] = React.useState(
        DEFAULT_EDITOR_PALETTE_COUNT
    )
    const [imagePixels, setImagePixels] = React.useState<PixelValue[][]>(() =>
        createEmptyPixels(DEFAULT_EDITOR_GRID_SIZE)
    )
    const [overlayPixels, setOverlayPixels] = React.useState<PixelValue[][]>(
        () => createEmptyPixels(DEFAULT_EDITOR_GRID_SIZE)
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

    const [, setImportStatus] = React.useState<ImportStatus>("idle")

    // legacy diagnostics only (UI must NOT branch on this anymore)
    const [, setImportError] = React.useState<string | null>(null)

    // ---------------------
    // Unified import error (single modal, owned by ROOT)
    // PixelEditorFramer управляет своим importStatus, а ROOT — только показом модалки.
    // ---------------------
    const showImportError = onShowImportError ?? (() => undefined) // fail-safe NO-OP

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
    void failImportInFlow

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

        // 1.5) Новый импорт = новая палитровая сессия
        setUserSwatches([])
        setSelectedSwatch("auto-0")

        // 2) Import context — строго выключаем
        setOriginalImageData(null)
        setHasImportContext(false)
        setImportStatus("idle")
        setImportError(null)

        // 3) Undo/Redo — чистый новый проект
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

            if (initialImageRouteKind === "import") {
                resetAutoOverridesForNewImport()
                setUserSwatches([])
                setSelectedSwatch("auto-0")
            }

            return
        }

        // Новый committed reference = новый объект ImageData
        if (lastInitialImageDataRef.current === initialImageData) return
        lastInitialImageDataRef.current = initialImageData

        // Только настоящий import имеет право сбрасывать import-session state.
        if (initialImageRouteKind === "import") {
            resetAutoOverridesForNewImport()
            setUserSwatches([])
            setSelectedSwatch("auto-0")
        }
    }, [initialImageData, initialImageRouteKind])

    const onSaveProject = React.useCallback(() => {
        const snapshot = buildProjectSnapshotV2()
        const json = JSON.stringify(snapshot)

        coreLifecycleLog("save:initiated", {
            gridSize: snapshot.gridSize,
            palette: snapshot.palette.swatches.length,
            hasRef: !!snapshot.ref,
            hasSmartObjectState: !!snapshot.smartObjectState,
        })

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
        coreLifecycleLog("load:picker-opened")
        onRequestOpenProject?.()
    }, [onRequestOpenProject])

    type LoadPayload = {
        snapshotVersion: 2
        nextState: ReturnType<typeof buildNextStateFromValidatedSnapshotV2>
        loadedSmartAdjustments: SmartReferenceAdjustments
        canonicalChecksum?: string
        fileName?: string
    }

    type LoadLetter = { ok: true; payload: LoadPayload } | { ok: false }

    async function buildLoadLetterFromPixtudioFile(
        file: File
    ): Promise<LoadLetter> {
        coreLifecycleLog("load:initiated", { fileName: file.name })

        try {
            // ==========================
            // LOAD CAPSULE: read + parse
            // ==========================
            const jsonText = await file.text()

            const parsed = parseProjectSnapshotV2Json(jsonText)
            if (!parsed.ok) {
                coreLifecycleLog("load:rejected", {
                    fileName: file.name,
                    code: parsed.error.code,
                    message: parsed.error.message,
                })
                return { ok: false }
            }

            // ==========================
            // LOAD CAPSULE: validate + canonicalize + build payload (V2 only)
            // ==========================
            const validatedV2 = validateProjectSnapshotV2OrThrow(parsed.canonical)
            const canonical = parsed.canonical
            const canonicalChecksum = checksumJsonString(
                JSON.stringify(canonical)
            )

            const nextState = buildNextStateFromValidatedSnapshotV2(validatedV2)

            const loadedSmartAdjustments: SmartReferenceAdjustments =
                validatedV2.smartObjectState
                    ? {
                          ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
                          ...validatedV2.smartObjectState.adjustments,
                      }
                    : { ...ZERO_SMART_REFERENCE_ADJUSTMENTS }

            const payload: LoadPayload = {
                snapshotVersion: 2,
                nextState,
                loadedSmartAdjustments,
                canonicalChecksum,
                fileName: file.name,
            }

            coreLifecycleLog("load:accepted", {
                fileName: file.name,
                gridSize: validatedV2.gridSize,
                palette: validatedV2.palette.swatches.length,
                hasRef: !!validatedV2.ref,
                checksum: canonicalChecksum,
            })

            return { ok: true, payload }
        } catch {
            coreLifecycleLog("load:rejected", {
                fileName: file.name,
                code: "E_READ",
            })
            return { ok: false }
        }
    }

    // ==========================
    // S3 — EDITOR APPLY POINT (single decision point)
    // ==========================

    function applyLoadLetterInEditor(letter: LoadLetter) {
        // Editor — единственное место, где решаем: применить или показать ошибку
        if (!letter.ok) {
            coreLifecycleLog("load:apply-rejected")
            // ✅ ЕДИНАЯ модалка "Неправильный импорт" (как и для неверного изображения)
            onShowImportError?.("Import failed. Please try again.")

            // (опционально) оставляем legacy-стейт, если он ещё где-то используется логикой
            //setImportStatus("error")
            //setImportError("Import failed. Please try again.")
            return
        }

        coreLifecycleLog("load:apply-accepted", {
            checksum: letter.payload.canonicalChecksum,
        })
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

    type ValidatedSnapshotV2 = ProjectSnapshotV2

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

        const smartObjectStateCanon = s.smartObjectState
            ? {
                  version: SMART_REFERENCE_VERSION_1,
                  adjustments: {
                      exposure: s.smartObjectState.adjustments.exposure,
                      whiteBalance: s.smartObjectState.adjustments.whiteBalance,
                      contrast: s.smartObjectState.adjustments.contrast,
                      saturation: s.smartObjectState.adjustments.saturation,
                      shadows: s.smartObjectState.adjustments.shadows,
                      midtones: s.smartObjectState.adjustments.midtones,
                      highlights: s.smartObjectState.adjustments.highlights,
                  },
              }
            : undefined

        return {
            magic: "PIXTUDIO",
            version: 2,
            gridSize: s.gridSize,
            paletteCount:
                typeof s.paletteCount === "number"
                    ? clampInt(s.paletteCount, PALETTE_MIN, PALETTE_MAX)
                    : undefined,
            palette: {
                swatches: sw.map((x, i) => ({
                    index: i,
                    id: x.id,
                    hex: x.hex,
                    isUser: !!x.isUser,
                })),
            },
            smartObjectState: smartObjectStateCanon,
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

        smartObjectState?: {
            version: typeof SMART_REFERENCE_VERSION_1
            adjustments: SmartReferenceAdjustments
        }

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

    function assertFiniteNumberInRange(
        n: any,
        min: number,
        max: number,
        code: LoadGateErrorCode,
        where: string
    ) {
        if (typeof n !== "number" || !Number.isFinite(n)) {
            throw makeLoadGateError(code, `${where}: not finite number`)
        }
        if (n < min || n > max) {
            throw makeLoadGateError(code, `${where}: out of range`)
        }
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

    function validateProjectSnapshotV2OrThrow(raw: any): ValidatedSnapshotV2 {
        if (!isPlainObject(raw)) {
            throw makeLoadGateError("E_ROOT_KEYS", "root: not an object")
        }

        // root keys (V2: version=2). MVP-contract:
        // paletteCount ОБЯЗАТЕЛЕН, autoOverrides ОПЦИОНАЛЕН
        const keys = Object.keys(raw).sort().join("|")

        const allowBase = [
            "magic",
            "version",
            "gridSize",
            "palette",
            "importLayer",
            "strokeLayer",
            "ref",
            "paletteCount",
        ]

        const allowedRootKeySets = new Set([
            [...allowBase].sort().join("|"),
            [...allowBase, "autoOverrides"].sort().join("|"),
            [...allowBase, "smartObjectState"].sort().join("|"),
            [...allowBase, "autoOverrides", "smartObjectState"]
                .sort()
                .join("|"),
        ])

        if (!allowedRootKeySets.has(keys)) {
            throw makeLoadGateError("E_ROOT_KEYS", "root: unexpected keys")
        }

        if (!("paletteCount" in raw)) {
            throw makeLoadGateError("E_PALETTE", "paletteCount: missing")
        }

        assertIntInRange(
            raw.paletteCount,
            PALETTE_MIN,
            PALETTE_MAX,
            "E_PALETTE",
            "paletteCount"
        )

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

        if ("smartObjectState" in raw) {
            const so = raw.smartObjectState
            if (!isPlainObject(so)) {
                throw makeLoadGateError(
                    "E_ROOT_KEYS",
                    "smartObjectState: not object"
                )
            }

            assertExactKeys(
                so,
                ["version", "adjustments"],
                "E_ROOT_KEYS",
                "smartObjectState"
            )

            if (so.version !== SMART_REFERENCE_VERSION_1) {
                throw makeLoadGateError(
                    "E_ROOT_KEYS",
                    "smartObjectState.version: not supported"
                )
            }

            const adj = so.adjustments
            if (!isPlainObject(adj)) {
                throw makeLoadGateError(
                    "E_ROOT_KEYS",
                    "smartObjectState.adjustments: not object"
                )
            }

            assertExactKeys(
                adj,
                [
                    "exposure",
                    "whiteBalance",
                    "contrast",
                    "saturation",
                    "shadows",
                    "midtones",
                    "highlights",
                ],
                "E_ROOT_KEYS",
                "smartObjectState.adjustments"
            )

            assertFiniteNumberInRange(
                adj.exposure,
                -100,
                100,
                "E_ROOT_KEYS",
                "smartObjectState.adjustments.exposure"
            )
            assertFiniteNumberInRange(
                adj.whiteBalance,
                0,
                1,
                "E_ROOT_KEYS",
                "smartObjectState.adjustments.whiteBalance"
            )
            assertFiniteNumberInRange(
                adj.contrast,
                -100,
                100,
                "E_ROOT_KEYS",
                "smartObjectState.adjustments.contrast"
            )
            assertFiniteNumberInRange(
                adj.saturation,
                -100,
                100,
                "E_ROOT_KEYS",
                "smartObjectState.adjustments.saturation"
            )
            assertFiniteNumberInRange(
                adj.shadows,
                0,
                100,
                "E_ROOT_KEYS",
                "smartObjectState.adjustments.shadows"
            )
            assertFiniteNumberInRange(
                adj.midtones,
                -100,
                100,
                "E_ROOT_KEYS",
                "smartObjectState.adjustments.midtones"
            )
            assertFiniteNumberInRange(
                adj.highlights,
                0,
                100,
                "E_ROOT_KEYS",
                "smartObjectState.adjustments.highlights"
            )
        }

        if ("smartObjectState" in raw && raw.ref === null) {
            throw makeLoadGateError(
                "E_REF",
                "ref: must not be null when smartObjectState is present"
            )
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

    // =====================
    // L1 — IMPORT TXN (NO-UI SIDE EFFECTS)
    // =====================

    type LoadNextState = {
        // то, что будем коммитить в L2 через applyProjectState(...)
        project: ProjectState

        // Saved reference base belongs to Smart Object after restore.
        smartObjectBaseForRestore: ImageData | null

        //paletteOrder: Array<{ id: string; isUser: boolean }>

        paletteOrderIds: string[]
    }

    // сюда L1 складывает результат (без setState)
    const loadedCanonicalChecksumRef = React.useRef<string | null>(null)

    const [postLoadCheckNonce, setPostLoadCheckNonce] = React.useState(0)

    const postLoadCheckNonceRef = React.useRef(0)

    const silentLoadHydrationRef = React.useRef(false)

    // B2 restore-trigger nonce: нужен, чтобы один раз прогнать визуальный композит
    // после того, как isRestoringFromSaveRef.current станет false.
    const [restoreVisualNonce, setRestoreVisualNonce] = React.useState(0)

    React.useEffect(() => {
        postLoadCheckNonceRef.current = postLoadCheckNonce
    }, [postLoadCheckNonce])

    const isRestoringFromSaveRef = React.useRef(false)

    const loadTraceSeqRef = React.useRef(0)

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
    // SAVE/LOAD — STRICT SNAPSHOT
    // =====================

    // Единственный допустимый формат — V2
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

    function buildProjectSnapshotV2(): ProjectSnapshotV2 {
        const g = gridSize

        const smartReferenceBaseForSave =
            onCaptureSmartReferenceBaseForSave?.() ?? null

        const smartCommittedStateForSave =
            onCaptureSmartObjectCommittedStateForSave?.() ?? null

        const smartAdjustmentsForSave: SmartReferenceAdjustments | null =
            smartCommittedStateForSave
                ? {
                      ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
                      ...(smartCommittedStateForSave.adjustments ??
                          ZERO_SMART_REFERENCE_ADJUSTMENTS),
                  }
                : null

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
            smartObjectState:
                smartReferenceBaseForSave && smartAdjustmentsForSave
                    ? {
                          version: SMART_REFERENCE_VERSION_1,
                          adjustments: {
                              ...smartAdjustmentsForSave,
                          },
                      }
                    : undefined,
            importLayer: { cells: importCells },
            strokeLayer: { cells: strokeCells },
            autoOverrides: hasAutoOverrides ? autoOverrides : undefined,
            ref: smartReferenceBaseForSave
                ? {
                      w: 512,
                      h: 512,
                      ext: "rgba8",
                      b64: bytesToBase64(smartReferenceBaseForSave.data),
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

    function base64ToBytes(b64: string): Uint8ClampedArray<ArrayBuffer> {
        // L0 уже проверил формат и длину decoded bytes, здесь можно декодировать смело
        const bin = atob(b64)
        const out = new Uint8ClampedArray(bin.length)
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
        return out
    }

    function decodeRefToImageData(
        ref: ProjectSnapshotV2["ref"]
    ): ImageData | null {
        if (!ref) return null
        // ref.ext строго "rgba8", ref.w/h строго 512 — L0 уже гарантировал
        const bytes = base64ToBytes(ref.b64)
        // ImageData ждёт Uint8ClampedArray
        return new ImageData(bytes, 512, 512)
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

        void (
            typeof (validated as any).paletteCount === "number"
                ? (validated as any).paletteCount
                : computePaletteCountFromSwatches(
                      nextAutoSwatches,
                      nextUserSwatches
                  )
        )

        void computePaletteCountFromSwatches(
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
            brushSize: DEFAULT_BRUSH_SIZE,
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
            smartObjectBaseForRestore: original,
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

    function commitPaintRefIfDirty(
        reason: string,
        snapshot?: {
            overlay: PixelValue[][]
            autoSwatches: Swatch[]
            userSwatches: Swatch[]
        }
    ) {
        if (!overlayDirtyRef.current) return

        const overlayForRef = snapshot?.overlay ?? overlayPixels
        const autoSwatchesForRef = snapshot?.autoSwatches ?? autoSwatches
        const userSwatchesForRef = snapshot?.userSwatches ?? userSwatches

        // Снимаем эталон ОДИН РАЗ на завершение штриха
        const snap = renderPaintGridToImageData({
            paintGrid: overlayForRef,
            autoSwatches: autoSwatchesForRef,
            userSwatches: userSwatchesForRef,
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

        const ctx = get2dReadFrequentlyContext(canvas)
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

        let overlayNext: PixelValue[][]

        if (hasSnapToUse && snapToUse) {
            overlayNext = requantizePaintSnapshotToOverlayPixels({
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
                overlayNext = createEmptyPixels(gridSize)
            } else {
                overlayNext = resizePixels(overlayPixels, gridSize)
            }
        }

        publishCanvasFrameAtomic({
            base: imagePixelsNext,
            overlay: overlayNext,
        })

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
        } catch {
            // Ignore blank-check failures; callers keep the current grid state.
        }
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
        if (initialImageRouteKind !== "import") return

        // если пришёл новый ImageData (только реальный import)
        if (lastImportedImageRef.current !== initialImageData) {
            lastImportedImageRef.current = initialImageData

            // import = единственный выключатель сетки
            setGridSuppressed(true, "import-initialImageData")
        }
    }, [initialImageData, initialImageRouteKind])

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
    const [isDrawing, setIsDrawing] = React.useState(false)
    const DEFAULT_BRUSH_SIZE = 3

    const [brushSize, setBrushSize] = React.useState<number>(DEFAULT_BRUSH_SIZE)
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

    // H3:
    // локальный runtime-state editor теперь совпадает
    // с module-scope контрактом EditorCommittedState.
    type ProjectState = EditorCommittedState

    type PendingLoadProjectCommit = {
        project: ProjectState
        canonicalChecksum?: string
        fileName?: string
    }

    const pendingLoadProjectCommitRef =
        React.useRef<PendingLoadProjectCommit | null>(null)

    type SliderTransactionRef = {
        before: ProjectState | null
        keyboardActive: boolean
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

    // S2 LEGACY:
    // но больше не считаются канонической пользовательской историей.
    //
    // Их роль на текущем этапе:
    // - технический fallback
    // - совместимость со старым editor-path
    //
    // user-facing Undo/Redo должны опираться на root history engine.
    const pendingBlankCheckReasonRef = React.useRef<string | null>(null)
    const isRestoringHistoryRef = React.useRef(false)

    function clonePixelsGrid(src: PixelValue[][]): PixelValue[][] {
        return src.map((row) => row.slice())
    }

    function cloneSwatches(src: Swatch[]): Swatch[] {
        return src.map((s) => ({ ...s }))
    }

    // H0:
    // Editor domain contract for future History Engine:
    //
    // makeProjectState()
    //   = capture editor committed-state
    //
    // applyProjectState(state)
    //   = restore editor committed-state
    //
    // На H0-H2 это уже существующий рабочий editor-side фундамент истории.
    // Поведение здесь не меняем.

    function makeProjectState(): ProjectState {
        return {
            gridSize,
            paletteCount,
            brushSize,
            imagePixels: clonePixelsGrid(imagePixels),
            overlayPixels: clonePixelsGrid(overlayPixels),
            showImage,

            autoSwatches: cloneSwatches(autoSwatches),
            userSwatches: cloneSwatches(userSwatches),
            selectedSwatch,
            hasOriginalImageData: hasImportContext,
            referenceSnapshot: originalImageData,

            autoOverrides: { ...autoOverrides },
        } as ProjectState
    }

    const latestProjectStateRef = React.useRef<ProjectState | null>(null)

    React.useEffect(() => {
        latestProjectStateRef.current = makeProjectState()
    }, [
        gridSize,
        paletteCount,
        brushSize,
        imagePixels,
        overlayPixels,
        showImage,
        autoSwatches,
        userSwatches,
        selectedSwatch,
        hasImportContext,
        originalImageData,
        autoOverrides,
    ])

    function makeProjectStateWithOverlay(
        overlayOverride: PixelValue[][] | null
    ): ProjectState {
        const base = makeProjectState()
        if (overlayOverride) {
            base.overlayPixels = clonePixelsGrid(overlayOverride)
        }
        return base
    }

    pendingBlankCheckReasonRef.current = null

    function applyProjectState(state: ProjectState) {
        isRestoringHistoryRef.current = true
        setGridSize(state.gridSize)
        setPaletteCount(state.paletteCount)
        setBrushSize((state as any).brushSize ?? DEFAULT_BRUSH_SIZE)
        setHasImportContext(state.hasOriginalImageData)

        setImagePixels(clonePixelsGrid(state.imagePixels))
        setOverlayPixels(clonePixelsGrid(state.overlayPixels))

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

    function prepareLoadedProjectForCommit(project: ProjectState): ProjectState {
        const stripTransparentSwatches = (list: Swatch[]) =>
            (list || []).filter(
                (s) => s && !s.isTransparent && s.id !== "transparent"
            )

        const fixedProject: ProjectState = {
            ...project,
            autoSwatches: stripTransparentSwatches(project.autoSwatches),
            userSwatches: stripTransparentSwatches(project.userSwatches),
            paletteCount: clampInt(project.paletteCount, PALETTE_MIN, PALETTE_MAX),
        }

        fixedProject.autoSwatches = applyAutoOverrides(
            fixedProject.autoSwatches,
            fixedProject.autoOverrides || {}
        )

        return fixedProject
    }

    function clearEditorStateForLoadRestore(nextGridSize: number) {
        const gs = safeGridSizeOrDefault(nextGridSize)

        setGridSize(gs)
        setImagePixels(createEmptyPixels(gs))
        setOverlayPixels(createEmptyPixels(gs))
        setOriginalImageData(null)
        setShowImage(false)
        setHasImportContext(false)
        setPaintRefImageData(null)

        overlayDirtyRef.current = false
        paintSnapshotNonceRef.current = 0
        p25LastKeyRef.current = null
        p3LastProcessedKeyRef.current = null
        p3InFlightKeyRef.current = null

        const visibleCanvas = canvasRef.current
        if (visibleCanvas) {
            visibleCanvas.width = CANVAS_SIZE
            visibleCanvas.height = CANVAS_SIZE

            const visibleCtx = visibleCanvas.getContext("2d")
            if (visibleCtx) {
                visibleCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
                drawCheckerboard(visibleCtx, CANVAS_SIZE, gs)
            }
        }
    }

    function commitPendingLoadProjectStateAfterReferenceSnapshot() {
        const pending = pendingLoadProjectCommitRef.current
        if (!pending) return false

        pendingLoadProjectCommitRef.current = null

        try {
            const fixedProject = pending.project

            traceLoad("commit: applyProjectState called", {
                gridSize: fixedProject.gridSize,
                paletteCount: fixedProject.paletteCount,
                auto: fixedProject.autoSwatches.length,
                user: fixedProject.userSwatches.length,
            })

            postLoadCheckNonceRef.current = 1

            applyProjectState(fixedProject)

            coreLifecycleLog("restore:project-state-applied", {
                gridSize: fixedProject.gridSize,
                paletteCount: fixedProject.paletteCount,
            })

            syncPaintRefToOverlay({
                overlay: fixedProject.overlayPixels,
                auto: fixedProject.autoSwatches,
                user: fixedProject.userSwatches,
                autoOverrides: fixedProject.autoOverrides || {},
                reason: "load",
            })

            routeLog(
                "L2 commit applied ProjectState after Smart Object snapshot",
                {
                    g: fixedProject.gridSize,
                    imageNonNull: countNonNullCells(fixedProject.imagePixels),
                    overlayNonNull: countNonNullCells(
                        fixedProject.overlayPixels
                    ),
                }
            )

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

            traceLoad("commit: refs cleared")

            requestAnimationFrame(() => {
                isRestoringFromSaveRef.current = false
                setRestoreVisualNonce((x) => x + 1)
                setRestoreVisualNonce((x) => x + 1)

                traceLoad("commit: restoring=false (rAF)")
                coreLifecycleLog("restore:committed", {
                    checksum: pending.canonicalChecksum,
                })
            })

            return true
        } catch (e) {
            traceLoad("commit: failed", e)
            coreLifecycleLog("restore:rejected", { reason: "commit-failed" })
            pendingLoadProjectCommitRef.current = null
            failImport("Import failed. Please try again.")
            isRestoringFromSaveRef.current = false
            setRestoreVisualNonce((x) => x + 1)
            return false
        }
    }

    // H3:
    // editor умеет:
    // 1) capture current committed-state
    // 2) apply committed-state back from Root/History Engine
    const committedStateCaptureRef = React.useRef<() => EditorCommittedState>(
        () => makeProjectState()
    )

    const committedStateApplyRef = React.useRef<
        (state: EditorCommittedState) => void
    >((state) => applyProjectState(state))

    committedStateCaptureRef.current = () => makeProjectState()
    committedStateApplyRef.current = (state) => applyProjectState(state)

    React.useEffect(() => {
        if (!onEditorCommittedStateBridgeReady) return
        onEditorCommittedStateBridgeReady({
            captureCommittedState: () => committedStateCaptureRef.current(),
            applyCommittedState: (state) =>
                committedStateApplyRef.current(state),
        })
        return () => {
            onEditorCommittedStateBridgeReady(null)
        }
    }, [onEditorCommittedStateBridgeReady])

    function restoreProjectFromLoadPayload(payload: LoadPayload) {
        const next = payload.nextState as any

        coreLifecycleLog("restore:started", {
            checksum: payload.canonicalChecksum,
            fileName: payload.fileName,
        })

        traceLoad("commit: start", {
            hasNext: !!next,
            expected:
                payload.canonicalChecksum ?? loadedCanonicalChecksumRef.current,
        })

        if (!next) {
            traceLoad("commit: no nextState -> fail")
            coreLifecycleLog("restore:rejected", { reason: "missing-next-state" })
            failImport("Import failed. Please try again.")
            return
        }

        try {
            if (payload.canonicalChecksum) {
                loadedCanonicalChecksumRef.current = payload.canonicalChecksum
            }

            if (!onRestoreSmartObjectFromLoad) {
                throw new Error(
                    "[LOAD] onRestoreSmartObjectFromLoad is missing"
                )
            }

            isRestoringFromSaveRef.current = true
            traceLoad("commit: restoring=true")

            const fixedProject = prepareLoadedProjectForCommit(next.project)
            pendingLoadProjectCommitRef.current = {
                project: fixedProject,
                canonicalChecksum: payload.canonicalChecksum,
                fileName: payload.fileName,
            }

            clearEditorStateForLoadRestore(fixedProject.gridSize)
            traceLoad("commit: editor state cleared")

            const smartObjectBaseForRestore = next.smartObjectBaseForRestore
            next.smartObjectBaseForRestore = null

            const didRestoreSmartObject = onRestoreSmartObjectFromLoad({
                base: smartObjectBaseForRestore,
                adjustments: payload.loadedSmartAdjustments,
            })

            if (!didRestoreSmartObject) {
                throw new Error(
                    "[LOAD] Smart Object bridge rejected load restore"
                )
            }

            coreLifecycleLog("restore:smart-object-seeded", {
                hasRefBase: smartObjectBaseForRestore != null,
            })

            routeLog("L2 commit restore Smart Object via root gateway", {
                hasRefBase: smartObjectBaseForRestore != null,
                refBaseSize: smartObjectBaseForRestore
                    ? `${smartObjectBaseForRestore.width}x${smartObjectBaseForRestore.height}`
                    : null,
            })

            traceLoad("commit: restored Smart Object via root gateway", {
                hasRefBase: smartObjectBaseForRestore != null,
                refBaseSize: smartObjectBaseForRestore
                    ? `${smartObjectBaseForRestore.width}x${smartObjectBaseForRestore.height}`
                    : null,
            })
            return

        } catch (e) {
            traceLoad("commit: failed", e)
            coreLifecycleLog("restore:rejected", { reason: "commit-failed" })
            pendingLoadProjectCommitRef.current = null

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
        return areEditorCommittedStatesEqual(a, b)
    }

    function isSliderKeyboardDragKey(key: string): boolean {
        return (
            key === "ArrowLeft" ||
            key === "ArrowRight" ||
            key === "ArrowUp" ||
            key === "ArrowDown"
        )
    }

    function beginEditorActionTransaction(
        kind: "editor-action",
        beforeState?: ProjectState
    ) {
        const before = beforeState ?? makeProjectState()

        // если вдруг не закрыли предыдущую — безопасно перезаписываем
        pendingEditorActionTransactionRef.current = {
            kind,
            before,
        }

        onBeginUserAction?.({
            kind,
            editorBefore: before,
        })
    }

    function commitEditorActionTransaction(afterState?: ProjectState) {
        const tx = pendingEditorActionTransactionRef.current
        if (!tx) return

        const after = afterState ?? makeProjectState()

        if (isSameProjectState(tx.before, after)) {
            pendingEditorActionTransactionRef.current = null
            onAbortUserAction?.()
            return
        }

        onCommitUserAction?.({
            editorAfter: after,
        })

        pendingEditorActionTransactionRef.current = null
    }

    function abortEditorActionTransaction() {
        pendingEditorActionTransactionRef.current = null
        onAbortUserAction?.()
    }

    function pushCommit(
        before: ProjectState,
        options?: {
            afterState?: ProjectState
        }
    ) {
        const now = options?.afterState ?? makeProjectState()

        // ✅ STEP 7: защита от пустых коммитов
        if (isSameProjectState(before, now)) {
            abortEditorActionTransaction()
            return
        }

        // S2 LEGACY:
        // локальная editor-history пока ещё живёт внутри редактора
        // как технический fallback.
        // ✅ лимит истории
        // ✅ любое новое действие убивает redo
        pendingBlankCheckReasonRef.current = "commit-allwhite"

        // Step 0:
        // pushCommit больше не пишет root history напрямую.
        // Он только закрывает локальный editor transaction,
        // а root history получает commit через единый user-action protocol.
        commitEditorActionTransaction(now)
    }

    // S2 LEGACY:
    // но не должны считаться главным пользовательским undo/redo path.
    // Пользовательские кнопки уже должны ходить через root engine.

    // ------------------- GRID SIZE COMMIT (UNIFIED) -------------------

    const gridSliderTxRef = React.useRef<SliderTransactionRef>({
        before: null,
        keyboardActive: false,
    })

    // S-MOBILE:
    const gridTouchActiveRef = React.useRef(false)

    function commitGridResizeFromBefore(before: ProjectState) {
        const cleaned = pruneAutoOverridesForCurrentAuto(
            autoSwatches,
            autoOverrides
        )

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

        requestAnimationFrame(() => {
            const afterState = {
                ...(latestProjectStateRef.current ?? makeProjectState()),
                autoOverrides: { ...cleaned },
            }

            pushCommit(before, {
                afterState,
            })
        })
    }

    function beginGridSliderTransactionIfNeeded(
        source: "pointer" | "keyboard"
    ) {
        liveGridPreviewOwnerRef.current = true

        const tx = gridSliderTxRef.current

        if (tx.before) {
            if (source === "keyboard") {
                tx.keyboardActive = true
            }
            return
        }

        const before = latestProjectStateRef.current ?? makeProjectState()

        beginEditorActionTransaction("editor-action", before)

        tx.before = before
        tx.keyboardActive = source === "keyboard"
    }

    function commitGridSliderTransactionIfNeeded() {
        const tx = gridSliderTxRef.current
        const before = tx.before

        liveGridPreviewOwnerRef.current = false

        if (!before) {
            return
        }

        tx.before = null
        tx.keyboardActive = false

        enqueueTxn("gridCommit", () => {
            commitGridResizeFromBefore(before)
        })
    }

    function abortGridSliderTransactionIfNeeded() {
        const tx = gridSliderTxRef.current

        liveGridPreviewOwnerRef.current = false
        tx.before = null
        tx.keyboardActive = false

        abortEditorActionTransaction()
    }
    void abortGridSliderTransactionIfNeeded

    // ------------------- PALETTE SIZE COMMIT (UNIFIED) -------------------

    const paletteSliderTxRef = React.useRef<SliderTransactionRef>({
        before: null,
        keyboardActive: false,
    })

    function commitPruneAutoOverridesAndPush(before: ProjectState) {
        const cleaned = pruneAutoOverridesForCurrentAuto(
            autoSwatches,
            autoOverrides
        )

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

        requestAnimationFrame(() => {
            const afterState = {
                ...(latestProjectStateRef.current ?? makeProjectState()),
                autoOverrides: { ...cleaned },
            }

            pushCommit(before, {
                afterState,
            })
        })
    }

    // S-MOBILE:
    const paletteTouchActiveRef = React.useRef(false)

    function beginPaletteSliderTransactionIfNeeded(
        source: "pointer" | "keyboard"
    ) {
        const tx = paletteSliderTxRef.current

        if (tx.before) {
            if (source === "keyboard") {
                tx.keyboardActive = true
            }
            return
        }

        const before = latestProjectStateRef.current ?? makeProjectState()

        beginEditorActionTransaction("editor-action", before)

        tx.before = before
        tx.keyboardActive = source === "keyboard"
    }

    function commitPaletteSliderTransactionIfNeeded() {
        const tx = paletteSliderTxRef.current
        const before = tx.before

        if (!before) {
            return
        }

        tx.before = null
        tx.keyboardActive = false

        commitPruneAutoOverridesAndPush(before)
    }

    function abortPaletteSliderTransactionIfNeeded() {
        const tx = paletteSliderTxRef.current

        tx.before = null
        tx.keyboardActive = false

        abortEditorActionTransaction()
    }
    void abortPaletteSliderTransactionIfNeeded

    // ------------------- BRUSH SIZE COMMIT (UNIFIED) -------------------

    const brushSliderTxRef = React.useRef<SliderTransactionRef>({
        before: null,
        keyboardActive: false,
    })

    // S-MOBILE:
    const brushTouchActiveRef = React.useRef(false)

    function beginBrushSliderTransactionIfNeeded(
        source: "pointer" | "keyboard"
    ) {
        const tx = brushSliderTxRef.current

        if (tx.before) {
            if (source === "keyboard") {
                tx.keyboardActive = true
            }
            return
        }

        const before = latestProjectStateRef.current ?? makeProjectState()

        beginEditorActionTransaction("editor-action", before)

        tx.before = before
        tx.keyboardActive = source === "keyboard"
    }

    function commitBrushSliderTransactionIfNeeded() {
        const tx = brushSliderTxRef.current
        const before = tx.before

        if (!before) {
            return
        }

        tx.before = null
        tx.keyboardActive = false

        const afterState = {
            ...(latestProjectStateRef.current ?? makeProjectState()),
            brushSize,
        } as ProjectState & { brushSize?: number }

        pushCommit(before, {
            afterState: afterState as ProjectState,
        })
    }

    function abortBrushSliderTransactionIfNeeded() {
        const tx = brushSliderTxRef.current

        tx.before = null
        tx.keyboardActive = false

        abortEditorActionTransaction()
    }
    void abortBrushSliderTransactionIfNeeded

    // ------------------- STROKE UNDO (STEP 6) -------------------

    const strokeBeforeRef = React.useRef<ProjectState | null>(null)

    // S4:
    // текущая открытая транзакция editor action
    const pendingEditorActionTransactionRef =
        React.useRef<EditorActionTransaction | null>(null)
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
            } catch {
                // Ignore browsers that do not support pointer capture here.
            }

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

        // Step 1:
        // before для stroke снимается ОДИН раз в начале жеста.
        const before = makeProjectState()

        beginEditorActionTransaction("editor-action", before)
        strokeBeforeRef.current = before
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
        } catch {
            // Ignore browsers that do not support pointer capture here.
        }
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
            const rgb = hexToRgb(norm)
            if (!rgb) return
            const { r, g, b } = rgb
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

    void iconButton

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

    // H3:
    // после входа committed reference editor должен сообщить наружу,
    // когда новый editor committed-state уже реально собран.
    const pendingCommittedStateSettledKindRef = React.useRef<
        "import" | "load" | "smart-object-apply" | null
    >(null)

    // ------------------- IMAGE INPUT -------------------

    React.useEffect(() => {
        const routeKind = initialImageRouteKind ?? "import"

        // Blank import тоже является полноценным import-entry.
        // А load с null-snapshot всё равно обязан дойти до своей cleanup-ветки.
        // Поэтому ранний return здесь запрещён.
        if (!initialImageData && routeKind == null) return

        // FIX: если раньше был pending blank-check, он не должен доезжать
        // ни в import, ни в SmartObject Apply.
        pendingBlankCheckReasonRef.current = null

        if (routeKind === "load") {
            // LOAD уже восстановил project state отдельно.
            // Он НЕ имеет права входить в import-style pending/history plumbing.
            pendingImportBeforeRef.current = null

            // Но Root всё равно должен получить settled-сигнал,
            // когда committed reference уже доедет до editor.
            pendingCommittedStateSettledKindRef.current = "load"
        } else {
            const before = makeProjectState()
            pendingImportBeforeRef.current = before

            // H3:
            // Root позже должен получить editor committed-state
            // уже ПОСЛЕ того, как этот reference реально доедет в editor pipeline.
            pendingCommittedStateSettledKindRef.current = routeKind
        }

        if (routeKind === "import") {
            // Step 7 + S-K1:
            // import kills both pointer and keyboard slider transactions.
            // A new import starts a completely fresh editor session.
            const nextGridSize = DEFAULT_EDITOR_GRID_SIZE
            const nextPaletteCount = DEFAULT_EDITOR_PALETTE_COUNT

            setGridSize(nextGridSize)
            setPaletteCount(nextPaletteCount)
            setBrushSize(DEFAULT_BRUSH_SIZE)

            abortEditorActionTransaction()

            brushSliderTxRef.current.before = null
            brushSliderTxRef.current.keyboardActive = false

            gridSliderTxRef.current.before = null
            gridSliderTxRef.current.keyboardActive = false

            paletteSliderTxRef.current.before = null
            paletteSliderTxRef.current.keyboardActive = false

            liveGridPreviewOwnerRef.current = false

            setAutoOverrides({})
            setUserSwatches([])
            setSelectedSwatch("auto-0")

            // Blank import = новая пустая сессия.
            if (!initialImageData) {
                // blank import не имеет права наследовать load-only guard'ы
                postLoadCheckNonceRef.current = 0
                silentLoadHydrationRef.current = false

                applyBlankProject(nextGridSize)
                setPaletteCount(nextPaletteCount)
                setBrushSize(DEFAULT_BRUSH_SIZE)
                setGridSuppressed(false, "blank-import")

                // новый import-cycle должен гарантированно иметь rebuild
                setRepixelizeKick((x) => x + 1)

                return
            }

            // Общая часть: editor получает новый committed reference.
            // Import — это новая import-сессия, а не продолжение post-load hydration.
            // Поэтому все load-only guards обязаны быть погашены ДО нового ref-driven rebuild.
            silentLoadHydrationRef.current = false
            postLoadCheckNonceRef.current = 0
            setOriginalImageData(initialImageData)
            setShowImage(true)
            setHasImportContext(true)

			track("import_image", {
                source: "image_import",
                routeKind: "import",
                gridSize: nextGridSize,
                paletteCount: nextPaletteCount,
            })

            setGridSuppressed(true, "import")

            // Очищаем overlay и его эталон, чтобы старые штрихи
            // не переехали на новое импортированное изображение.
            setPaintRefImageData(null)
            overlayDirtyRef.current = false
            paintSnapshotNonceRef.current = 0
            p25LastKeyRef.current = null
            p3LastProcessedKeyRef.current = null
            p3InFlightKeyRef.current = null

            setOverlayPixels(createEmptyPixels(nextGridSize))

            // Страховка: новый import обязан гарантированно запустить rebuild,
            // даже если перед ним была load-hydration цепочка.
            setRepixelizeKick((x) => x + 1)

            return
        }

        if (routeKind === "load") {
            // LOAD уже восстановил ProjectState отдельно.
            // Здесь editor получает только committed reference snapshot,
            // без import-side reset'ов и без визуального rebuild из ref.

            if (initialImageData) {
                // обычный load с reference:
                // допускаем один silent hydration pass
                silentLoadHydrationRef.current = true

                setOriginalImageData(initialImageData)
                setShowImage(true)
                setHasImportContext(true)
            } else {
                // load без reference:
                // никаких load-only guard'ов оставаться не должно
                postLoadCheckNonceRef.current = 0
                silentLoadHydrationRef.current = false

                setOriginalImageData(null)
                setShowImage(false)
                setHasImportContext(false)
            }

            commitPendingLoadProjectStateAfterReferenceSnapshot()
            return
        }

        // SmartObject Apply = НЕ импорт.
        // Слой штрихов и его эталон обязаны сохраниться.
        // Никаких import-side effects здесь не допускается:
        // - no setGridSuppressed(true, "import")
        // - no setAutoOverrides({})
        // - no setPaintRefImageData(null)
        // - no overlay reset

        if (!initialImageData) return

        // Общая часть: editor получает новый committed reference.
        setOriginalImageData(initialImageData)
        setShowImage(true)
        setHasImportContext(true)
    }, [initialImageData, initialImageRouteKind])

    React.useEffect(() => {
        if (!onEditorCommittedStateSettled) return

        const routeKind = pendingCommittedStateSettledKindRef.current
        if (!routeKind) return

        // Пока import/smart-object rebuild ещё не завершён,
        // committed-state наружу отдавать нельзя.
        if (pendingImportBeforeRef.current) return

        pendingCommittedStateSettledKindRef.current = null

        onEditorCommittedStateSettled({
            state: makeProjectState(),
            routeKind,
        })
    }, [
        onEditorCommittedStateSettled,
        gridSize,
        paletteCount,
        imagePixels,
        overlayPixels,
        showImage,
        hasImportContext,
        autoSwatches,
        userSwatches,
        selectedSwatch,
        autoOverrides,
    ])

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

        // LOAD не должен входить в legacy ref-driven repixelize/import pipeline.
        // Первый проход после load нужен только для завершения restore-cycle,
        // но НЕ для rebuild из originalImageData.
        if (postLoadCheckNonceRef.current > 0) {
            postLoadCheckNonceRef.current = 0

            // ВАЖНО:
            // первый post-load skip обязан погасить оба load-only guard'а.
            // Иначе silentLoadHydrationRef может пережить этот return
            // и задушить следующий уже валидный repixelize.
            silentLoadHydrationRef.current = false

            pendingImportBeforeRef.current = null
            return
        }

        // Silent Smart Object load hydration:
        // reference-domain должен восстановиться,
        // но визуальный слой уже восстановлен из save-файла и не должен
        // заново входить в ref-driven rebuild pipeline.
        if (silentLoadHydrationRef.current) {
            traceLoad(
                "repixelizeEffect SKIP (silent load hydration) — blocking rebuild from Smart Object load reference"
            )

            silentLoadHydrationRef.current = false
            pendingImportBeforeRef.current = null
            return
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
                pendingImportBeforeRef.current = null

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
                    step: "setSelectedSwatch (with-original)",
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

        // Во время restore R0 не имеет права перерисовывать старый canvasPixels.
        // Канонический кадр после load будет опубликован позже через B1-SYNC,
        // когда isRestoringFromSaveRef.current станет false.
        if (isRestoringFromSaveRef.current) {
            return
        }

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
        restoreVisualNonce,
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
            const sampleR = Math.max(0, Math.min(gridSize - 1, row0))
            const sampleC = Math.max(0, Math.min(gridSize - 1, col0))
            const beforeSample = prev?.[sampleR]?.[sampleC] ?? null

            let changed = false

            for (let rr = row0; rr < row0 + s; rr++) {
                for (let cc = col0; cc < col0 + s; cc++) {
                    if (rr < 0 || cc < 0 || rr >= gridSize || cc >= gridSize)
                        continue

                    const prevValue = prev[rr]?.[cc] ?? null
                    if (prevValue !== value) {
                        next[rr][cc] = value
                        changed = true
                    }
                }
            }

            if (changed && !strokeDidMutateRef.current) {
                strokeDidMutateRef.current = true
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
    void getCellFromEvent

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
    void paintBrush

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

        let paintRefSnapshot:
            | {
                  overlay: PixelValue[][]
                  autoSwatches: Swatch[]
                  userSwatches: Swatch[]
              }
            | undefined

        if (strokeBeforeRef.current) {
            if (strokeDidMutateRef.current) {
                const before = strokeBeforeRef.current
                const afterOverlayRaw =
                    strokeAfterOverlayRef.current ?? overlayPixels
                const afterState = makeProjectStateWithOverlay(afterOverlayRaw)

                paintRefSnapshot = {
                    overlay: afterState.overlayPixels,
                    autoSwatches: afterState.autoSwatches,
                    userSwatches: afterState.userSwatches,
                }

                pushCommit(before, {
                    afterState,
                })

                postCommitGridHook(
                    {
                        imagePixels: afterState.imagePixels,
                        overlayPixels: afterState.overlayPixels,
                        autoSwatches: afterState.autoSwatches,
                        userSwatches: afterState.userSwatches,
                    },
                    "stroke"
                )
            } else {
                abortEditorActionTransaction()
            }
        }

        // сброс refs stroke
        strokeBeforeRef.current = null
        strokeDidMutateRef.current = false
        strokeAfterOverlayRef.current = null

        // ✅ эталон обновляем на завершение жеста (неважно как он закончился)
        commitPaintRefIfDirty(reason, paintRefSnapshot)

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

    function handleCanvasPointerLeave() {
        pointerRef.current = { ...pointerRef.current, inside: false }
        hideBrushPreview()
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
    void handleClear

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
    void handleImageChange

    function openFileDialog() {
        // единая точка: ROOT держит <input type="file" .../> и общий обработчик ошибок импорта
        onRequestPickImage?.()
    }

    // ------------------- SWATCH EDIT -------------------

    function openColorEditor(swatchId: SwatchId) {
        const sw = swatchById.get(swatchId)
        if (!sw) return

        const hex = cssColorToHex(sw.color).toUpperCase()
        const rgb = hexToRgb(hex)
        if (!rgb) return
        const { r, g, b } = rgb
        const hsv = rgbToHsv(r, g, b)

        setEditingSwatchId(swatchId)
        setPendingTransparent(!!sw.isTransparent)
        setPendingColor(hex)

        setPickerHue(hsv.h)
        setPickerSV({ s: hsv.s, v: hsv.v })

        setHexDraft((hex || "#FF0000").toUpperCase())

        setIsColorModalOpen(true)
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

        const before = latestProjectStateRef.current ?? makeProjectState()

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
        const currentSwatch = swatchById.get(editingSwatchId)
        if (currentSwatch) {
            const currentTransparent = !!currentSwatch.isTransparent
            const nextTransparent = !!pendingTransparent
            const currentHex = cssColorToHex(currentSwatch.color).toUpperCase()
            const sameVisualValue =
                currentTransparent === nextTransparent &&
                (nextTransparent || currentHex === colorUpper)

            if (sameVisualValue) {
                setIsColorModalOpen(false)
                setEditingSwatchId(null)
                return
            }
        }

        const { nextAuto, nextUser } = buildNextSwatchesForEdit(
            editingSwatchId,
            colorUpper,
            pendingTransparent
        )

        // 3) next overrides (тоже локально, синхронно)
        const nextAutoOverrides: AutoSwatchOverridesMap = {
            ...(autoOverrides || {}),
        }
        if (
            typeof editingSwatchId === "string" &&
            editingSwatchId.startsWith("auto-")
        ) {
            const existingOverride = autoOverrides?.[editingSwatchId]
            const sourceAuto = autoSwatches.find((s) => s.id === editingSwatchId)
            const hasHex = /^#[0-9A-F]{6}$/.test(colorUpper)
            const nextIsTransparent = !!pendingTransparent
            const nextHex = colorUpper.toUpperCase()
            const sourceHex = (sourceAuto?.color || "").toUpperCase()

            if (
                !existingOverride &&
                sourceAuto &&
                sourceAuto.isTransparent === nextIsTransparent &&
                (!hasHex || sourceHex === nextHex)
            ) {
                delete nextAutoOverrides[editingSwatchId]
            } else {
                const entry: any = {}
                if (!nextIsTransparent && hasHex) entry.hex = nextHex
                entry.isTransparent = nextIsTransparent
                nextAutoOverrides[editingSwatchId] = entry
            }
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
        const afterState: ProjectState = {
            ...(latestProjectStateRef.current ?? makeProjectState()),
            imagePixels: clonePixelsGrid(collapsed.imagePixels),
            overlayPixels: clonePixelsGrid(collapsed.overlayPixels),
            autoSwatches: cloneSwatches(collapsed.autoSwatches),
            userSwatches: cloneSwatches(collapsed.userSwatches),
            selectedSwatch: collapsed.selectedSwatch as any,
            autoOverrides: { ...collapsed.autoOverrides },
        }

        if (isSameProjectState(before, afterState)) {
            setIsColorModalOpen(false)
            setEditingSwatchId(null)
            return
        }

        beginEditorActionTransaction("editor-action", before)

        setAutoSwatches(collapsed.autoSwatches)
        setUserSwatches(collapsed.userSwatches)
        setImagePixels(collapsed.imagePixels)
        setOverlayPixels(collapsed.overlayPixels)
        setAutoOverrides(collapsed.autoOverrides)
        setSelectedSwatch(collapsed.selectedSwatch as any)

        postCommitGridHook(
            {
                imagePixels: afterState.imagePixels,
                overlayPixels: afterState.overlayPixels,
                autoSwatches: afterState.autoSwatches,
                userSwatches: afterState.userSwatches,
            },
            "swatch-edit"
        )

        pushCommit(before, {
            afterState,
        })

        setIsColorModalOpen(false)
        setEditingSwatchId(null)
    }

    function handleModalCancel() {
        setIsColorModalOpen(false)
        setEditingSwatchId(null)
    }

    // ------------------- ADD SWATCH -------------------

    function addUserSwatch() {
        const before = latestProjectStateRef.current ?? makeProjectState()
        beginEditorActionTransaction("editor-action", before)

        const id = `user-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 8)}`

        const newSwatch: Swatch = {
            id,
            color: bg,
            isTransparent: false,
            isUser: true,
        }

        const nextUserSwatches = [...userSwatches, newSwatch]

        setUserSwatches(nextUserSwatches)
        setSelectedSwatch(id)

        const afterState: ProjectState = {
            ...before,
            imagePixels: clonePixelsGrid(imagePixels),
            overlayPixels: clonePixelsGrid(overlayPixels),
            autoSwatches: cloneSwatches(autoSwatches),
            userSwatches: cloneSwatches(nextUserSwatches),
            selectedSwatch: id,
            autoOverrides: { ...autoOverrides },
        }

        pushCommit(before, {
            afterState,
        })
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
    ): Promise<boolean> {
        // SSR safety
        if (typeof window === "undefined") {
            const b = await produceBlob()
            if (!b) return false
            downloadBlob(b, filename)
            return true
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
                // cancel → считаем экспорт отменённым
                if (e?.name === "AbortError") return false
                // прочие ошибки → fallback download ниже
                handle = null
            }

            // 2) Готовим blob уже после выбора файла
            const blob = await produceBlob()
            if (!blob) return false

            if (handle) {
                try {
                    const writable = await handle.createWritable()
                    await writable.write(blob)
                    await writable.close()
                    return true
                } catch {
                    // permission/прочее → fallback download ниже
                }
            }

            // fallback download
            downloadBlob(blob, filename)
            return true
        }

        // нет API → старый download
        const blob = await produceBlob()
        if (!blob) return false

        downloadBlob(blob, filename)
        return true
    }

    async function imageDataToPngBlob(
        imageData: ImageData | null
    ): Promise<Blob | null> {
        if (!imageData) return null
        if (typeof document === "undefined") return null

        const canvas = document.createElement("canvas")
        canvas.width = imageData.width
        canvas.height = imageData.height

        const ctx = canvas.getContext("2d")
        if (!ctx) return null

        ctx.putImageData(imageData, 0, 0)

        return await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((blob) => resolve(blob), "image/png")
        })
    }
    void imageDataToPngBlob

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
    void saveBlob

    async function exportPNG(p?: {
        includeStroke: boolean
        includeImage: boolean
    }): Promise<boolean> {
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
        if (!ctx) return false

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

        return await saveBlobFromProducer(async () => {
            const blob = await new Promise<Blob | null>((resolve) => {
                out.toBlob((b) => resolve(b), "image/png")
            })
            return blob
        }, "pixtudio.png")
    }

    async function exportSVG(p?: {
        includeStroke: boolean
        includeImage: boolean
    }): Promise<boolean> {
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

        return await saveBlobFromProducer(async () => {
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
            let ok = false

            // 2) SaveAs запускается строго от user gesture:
            // runExport() вызывается только из onClick PNG/SVG
            if (kind === "png") {
                ok = await exportPNG({
                    includeStroke: exportIncludeStroke,
                    includeImage: exportIncludeImage,
                })
            } else {
                ok = await exportSVG({
                    includeStroke: exportIncludeStroke,
                    includeImage: exportIncludeImage,
                })
            }

            if (ok) {
                track("export_image", {
                    kind,
                    includeStroke: exportIncludeStroke,
                    includeImage: exportIncludeImage,
                    gridSize,
                })
            }
        } finally {
            setIsExporting(false)
        }
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
            <style>{PIX_UI_BUTTON_ANIM_CSS}</style>

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
            />
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
                            className="pxUiAnim"
                            style={iconOnlyButton(true)}
                        >
                            <SaveIcon />
                        </button>

                        <button
                            type="button"
                            onClick={onLoadProject}
                            aria-label="Load"
                            className="pxUiAnim"
                            style={iconOnlyButton(true)}
                        >
                            <LoadIcon />
                        </button>
                    </div>

                    {/* Block 1: Undo / Redo */}
                    <div style={{ display: "contents" }}>
                        <button
                            type="button"
                            onClick={onCoordinatedUndo}
                            disabled={!coordinatedCanUndo}
                            aria-label="Undo"
                            className="pxUiAnim"
                            style={{
                                ...iconOnlyButton(!!coordinatedCanUndo),
                                opacity: coordinatedCanUndo ? 1 : 0.35,
                            }}
                        >
                            <UndoIcon />
                        </button>

                        <button
                            type="button"
                            onClick={onCoordinatedRedo}
                            disabled={!coordinatedCanRedo}
                            aria-label="Redo"
                            className="pxUiAnim"
                            style={{
                                ...iconOnlyButton(!!coordinatedCanRedo),
                                opacity: coordinatedCanRedo ? 1 : 0.35,
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
                            className="pxUiAnim"
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
                            className="pxUiAnim"
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
                            className="pxUiAnim"
                            style={iconOnlyButton(true)}
                        >
                            <ZoomOutIcon />
                        </button>

                        <button
                            type="button"
                            onClick={handleZoomIn}
                            aria-label="Zoom in"
                            className="pxUiAnim"
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
                            className="pxUiAnim"
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
                            className="pxUiAnim"
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
                            className="pxUiAnim"
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
                                    // Step 1:
                                    // stroke commit happens only on pointerup/cancel,
                                    // not on pointerleave.
                                    onPointerUp={stopDrawing}
                                    onPointerLeave={handleCanvasPointerLeave}
                                    onPointerCancel={handleCanvasPointerCancel}
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
                    marginTop: 0,
                }}
            >
                <div style={{ width: "100%", maxWidth: canvasMax }}>
                    {/* BRUSH SIZE + Smart Object */}
                    <div style={{ marginBottom: 18 }}>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 20,
                                marginBottom: 18,
                            }}
                        >
                            <div
                                style={{
                                    flex: "1 1 auto",
                                    minWidth: 0,
                                    paddingTop: 18,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "baseline",
                                        marginBottom: 8,
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

                                    const circleUrl =
                                        svgToDataUrl(RANGE_CIRCLE_SVG)

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
                                                parseInt(
                                                    e.currentTarget.value,
                                                    10
                                                )
                                            )
                                        }}
                                        onKeyDown={(e) => {
                                            if (!isSliderKeyboardDragKey(e.key))
                                                return
                                            beginBrushSliderTransactionIfNeeded(
                                                "keyboard"
                                            )
                                        }}
                                        onKeyUp={() => {
                                            if (
                                                !brushSliderTxRef.current
                                                    .keyboardActive
                                            )
                                                return
                                            commitBrushSliderTransactionIfNeeded()
                                        }}
                                        onPointerDown={() => {
                                            if (isMobileUI) return
                                            beginBrushSliderTransactionIfNeeded(
                                                "pointer"
                                            )
                                        }}
                                        onPointerUp={() => {
                                            if (isMobileUI) return
                                            commitBrushSliderTransactionIfNeeded()
                                        }}
                                        onPointerCancel={() => {
                                            if (isMobileUI) return
                                            commitBrushSliderTransactionIfNeeded()
                                        }}
                                        onPointerLeave={() => {
                                            // no-op:
                                            // drag may temporarily leave range bounds;
                                            // commit must happen only on pointerup / pointercancel / touchend / touchcancel / blur.
                                        }}
                                        onTouchStart={() => {
                                            brushTouchActiveRef.current = true
                                            beginBrushSliderTransactionIfNeeded(
                                                "pointer"
                                            )
                                        }}
                                        onTouchEnd={() => {
                                            if (!brushTouchActiveRef.current)
                                                return

                                            brushTouchActiveRef.current = false
                                            commitBrushSliderTransactionIfNeeded()
                                        }}
                                        onTouchCancel={() => {
                                            if (!brushTouchActiveRef.current)
                                                return

                                            brushTouchActiveRef.current = false
                                            commitBrushSliderTransactionIfNeeded()
                                        }}
                                        onBlur={() => {
                                            if (isMobileUI) return

                                            commitBrushSliderTransactionIfNeeded()
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

                            <button
                                type="button"
                                onClick={onOpenSmartReferenceTest}
                                disabled={!onOpenSmartReferenceTest}
                                aria-label="Smart Object"
                                className="pxUiAnim"
                                style={{
                                    width: 60,
                                    height: 60,
                                    flex: "0 0 60px",
                                    alignSelf: "flex-start",
                                    border: "0",
                                    borderRadius: 0,
                                    background: "transparent",
                                    padding: 0,
                                    margin: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: onOpenSmartReferenceTest
                                        ? "pointer"
                                        : "default",
                                    opacity: onOpenSmartReferenceTest
                                        ? 1
                                        : 0.45,
                                }}
                            >
                                <SvgSmartObject
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "block",
                                        color: "#C02C66",
                                    }}
                                />
                            </button>
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
                                        setGridSize(
                                            parseInt(e.currentTarget.value, 10)
                                        )
                                    }}
                                    onKeyDown={(e) => {
                                        if (!isSliderKeyboardDragKey(e.key))
                                            return
                                        beginGridSliderTransactionIfNeeded(
                                            "keyboard"
                                        )
                                    }}
                                    onKeyUp={() => {
                                        if (
                                            !gridSliderTxRef.current
                                                .keyboardActive
                                        )
                                            return
                                        commitGridSliderTransactionIfNeeded()
                                    }}
                                    onPointerDown={() => {
                                        if (isMobileUI) return
                                        beginGridSliderTransactionIfNeeded(
                                            "pointer"
                                        )
                                    }}
                                    onPointerUp={() => {
                                        if (isMobileUI) return
                                        commitGridSliderTransactionIfNeeded()
                                    }}
                                    onPointerCancel={() => {
                                        if (isMobileUI) return
                                        commitGridSliderTransactionIfNeeded()
                                    }}
                                    // S-MOBILE:
                                    // mobile slider history is driven ONLY by touch lifecycle:
                                    // touchstart = begin, touchend/touchcancel = commit.
                                    // Pointer and blur paths must stay desktop-only.
                                    onTouchStart={() => {
                                        gridTouchActiveRef.current = true
                                        beginGridSliderTransactionIfNeeded(
                                            "pointer"
                                        )
                                    }}
                                    onPointerLeave={() => {
                                        // no-op:
                                        // drag may temporarily leave range bounds;
                                        // commit must happen only on pointerup / pointercancel / touchend / touchcancel / blur.
                                    }}
                                    // S-MOBILE-3:
                                    onTouchEnd={() => {
                                        if (!gridTouchActiveRef.current) return

                                        gridTouchActiveRef.current = false
                                        commitGridSliderTransactionIfNeeded()
                                    }}
                                    // S-MOBILE-4:
                                    onTouchCancel={() => {
                                        if (!gridTouchActiveRef.current) return

                                        gridTouchActiveRef.current = false
                                        commitGridSliderTransactionIfNeeded()
                                    }}
                                    // S-MOBILE-5:
                                    onBlur={() => {
                                        if (isMobileUI) return

                                        commitGridSliderTransactionIfNeeded()
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
                                    onKeyDown={(e) => {
                                        if (!isSliderKeyboardDragKey(e.key))
                                            return
                                        beginPaletteSliderTransactionIfNeeded(
                                            "keyboard"
                                        )
                                    }}
                                    onKeyUp={() => {
                                        if (
                                            !paletteSliderTxRef.current
                                                .keyboardActive
                                        )
                                            return
                                        commitPaletteSliderTransactionIfNeeded()
                                    }}
                                    onPointerDown={() => {
                                        if (isMobileUI) return
                                        beginPaletteSliderTransactionIfNeeded(
                                            "pointer"
                                        )
                                    }}
                                    onPointerUp={() => {
                                        if (isMobileUI) return
                                        commitPaletteSliderTransactionIfNeeded()
                                    }}
                                    onPointerCancel={() => {
                                        if (isMobileUI) return
                                        commitPaletteSliderTransactionIfNeeded()
                                    }}
                                    onPointerLeave={() => {
                                        // no-op:
                                        // drag may temporarily leave range bounds;
                                        // commit must happen only on pointerup / pointercancel / touchend / touchcancel / blur.
                                    }}
                                    onBlur={() => {
                                        if (isMobileUI) return

                                        commitPaletteSliderTransactionIfNeeded()
                                    }}
                                    onTouchStart={() => {
                                        paletteTouchActiveRef.current = true
                                        beginPaletteSliderTransactionIfNeeded(
                                            "pointer"
                                        )
                                    }}
                                    onTouchEnd={() => {
                                        if (!paletteTouchActiveRef.current)
                                            return

                                        paletteTouchActiveRef.current = false
                                        commitPaletteSliderTransactionIfNeeded()
                                    }}
                                    onTouchCancel={() => {
                                        if (!paletteTouchActiveRef.current)
                                            return

                                        paletteTouchActiveRef.current = false
                                        commitPaletteSliderTransactionIfNeeded()
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
                                    className="pxUiAnim"
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
                                                        onRequestBlankImport?.()
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

                                                <button
                                                    type="button"
                                                    onClick={closeOverlay}
                                                    style={okCancelButtonStyle}
                                                    aria-label="Close"
                                                    className="pxUiAnim"
                                                >
                                                    <SvgCancelButton
                                                        style={okCancelSvgStyle}
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
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        justifyContent:
                                                            "center",
                                                        pointerEvents: "auto",
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={closeOverlay}
                                                        style={
                                                            okCancelButtonStyle
                                                        }
                                                        aria-label="Close"
                                                        className="pxUiAnim"
                                                    >
                                                        <SvgCancelButton
                                                            style={
                                                                okCancelSvgStyle
                                                            }
                                                        />
                                                    </button>
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
                                    width: isMobileUI
                                        ? `calc(100vw - ${SWATCH_EDIT_MODAL_MOBILE_SIDE_GAP * 2}px)`
                                        : SWATCH_EDIT_MODAL_DESKTOP_SIZE,
                                    height: isMobileUI
                                        ? `calc(100vw - ${SWATCH_EDIT_MODAL_MOBILE_SIDE_GAP * 2}px)`
                                        : SWATCH_EDIT_MODAL_DESKTOP_SIZE,
                                    maxWidth: "100vw",
                                    maxHeight: "100vh",
                                    flex: "0 0 auto",
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
                                        padding:
                                            SWATCH_EDIT_MODAL_INNER_PADDING,
                                        boxSizing: "border-box",
                                        gap: SWATCH_EDIT_MODAL_CONTENT_GAP,
                                        overflow: "hidden",
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div
                                        style={{
                                            fontSize: SWATCH_EDIT_TITLE_FONT,
                                            fontWeight: 900,
                                            letterSpacing:
                                                SWATCH_EDIT_TITLE_LETTER_SPACING,
                                            textAlign: "center",
                                            color: "#0C1720",
                                            lineHeight: 1.1,
                                            flex: "0 0 auto",
                                        }}
                                    >
                                        SWATCH EDIT
                                    </div>

                                    <div
                                        style={{
                                            flex: "1 1 auto",
                                            minHeight: 0,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: SWATCH_EDIT_MODAL_CONTENT_GAP,
                                        }}
                                    >
                                        <div
                                            ref={svRef}
                                            onPointerDown={(e) => {
                                                if (pendingTransparent) return
                                                setDragSV(true)
                                                onSVAt(e.clientX, e.clientY)
                                            }}
                                            style={{
                                                position: "relative",
                                                flex: "1 1 auto",
                                                minHeight: 0,
                                                border: SWATCH_EDIT_BORDER,
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
                                                        ).toFixed(
                                                            2
                                                        )}% - ${SWATCH_EDIT_SV_THUMB_OFFSET}px)`,
                                                        top: `calc(${(
                                                            svY * 100
                                                        ).toFixed(
                                                            2
                                                        )}% - ${SWATCH_EDIT_SV_THUMB_OFFSET}px)`,
                                                        width: SWATCH_EDIT_SV_THUMB_SIZE,
                                                        height: SWATCH_EDIT_SV_THUMB_SIZE,
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
                                                flex: "0 0 auto",
                                                height: SWATCH_EDIT_HUE_HEIGHT,
                                                border: SWATCH_EDIT_BORDER,
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
                                                        ).toFixed(
                                                            2
                                                        )}% - ${SWATCH_EDIT_HUE_CURSOR_OFFSET}px)`,
                                                        top: SWATCH_EDIT_HUE_CURSOR_TOP,
                                                        width: SWATCH_EDIT_HUE_CURSOR_WIDTH,
                                                        height: SWATCH_EDIT_HUE_CURSOR_HEIGHT,
                                                        background: "#fff",
                                                        boxShadow:
                                                            "0 0 0 1px rgba(0,0,0,0.6)",
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: SWATCH_EDIT_ROW_GAP,
                                            marginTop: "auto",
                                            minWidth: 0,
                                            flex: "0 0 auto",
                                        }}
                                    >
                                        <label
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 10,
                                                fontSize:
                                                    SWATCH_EDIT_LABEL_FONT,
                                                fontWeight: 900,
                                                letterSpacing:
                                                    SWATCH_EDIT_LABEL_LETTER_SPACING,
                                                color: "#001219",
                                                userSelect: "none",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: SWATCH_EDIT_CHECK_SIZE,
                                                    height: SWATCH_EDIT_CHECK_SIZE,
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
                                                    aria-label="Transparent"
                                                    style={{
                                                        position: "absolute",
                                                        inset: 0,
                                                        opacity: 0,
                                                        margin: 0,
                                                        cursor: "pointer",
                                                    }}
                                                />

                                                <div
                                                    style={{
                                                        width: SWATCH_EDIT_CHECK_SIZE,
                                                        height: SWATCH_EDIT_CHECK_SIZE,
                                                        display: "grid",
                                                        placeItems: "center",
                                                        pointerEvents: "none",
                                                    }}
                                                >
                                                    <ExportCheckboxIcon
                                                        checked={
                                                            pendingTransparent
                                                        }
                                                        size={
                                                            SWATCH_EDIT_CHECK_SIZE
                                                        }
                                                    />
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    fontSize:
                                                        SWATCH_EDIT_LABEL_FONT,
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

                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 12,
                                                minWidth: 0,
                                                flex: "0 0 auto",
                                                width:
                                                    SWATCH_EDIT_PREVIEW_SIZE +
                                                    12 +
                                                    SWATCH_EDIT_HEX_BOX_WIDTH,
                                                justifyContent: "flex-end",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: SWATCH_EDIT_PREVIEW_SIZE,
                                                    height: SWATCH_EDIT_PREVIEW_SIZE,
                                                    border: SWATCH_EDIT_BORDER,
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
                                                    width: SWATCH_EDIT_HEX_BOX_WIDTH,
                                                    minWidth:
                                                        SWATCH_EDIT_HEX_BOX_WIDTH,
                                                    maxWidth:
                                                        SWATCH_EDIT_HEX_BOX_WIDTH,
                                                    height: SWATCH_EDIT_HEX_INPUT_HEIGHT,
                                                    flex: "0 0 auto",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "flex-end",
                                                }}
                                                aria-label="HEX value"
                                            >
                                                {pendingTransparent ? (
                                                    <div
                                                        style={{
                                                            width: "100%",
                                                            height: "100%",
                                                            border: SWATCH_EDIT_BORDER,
                                                            boxSizing:
                                                                "border-box",
                                                            background:
                                                                "rgba(255,255,255,0.9)",
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            justifyContent:
                                                                "center",
                                                            fontSize:
                                                                SWATCH_EDIT_HEX_FONT,
                                                            fontWeight: 800,
                                                            letterSpacing: 3,
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
                                                            hexIsEditingRef.current = true
                                                        }}
                                                        onBlur={() => {
                                                            commitHexDraft()
                                                            hexIsEditingRef.current = false
                                                        }}
                                                        style={{
                                                            width: "100%",
                                                            minWidth: 0,
                                                            maxWidth:
                                                                SWATCH_EDIT_HEX_BOX_WIDTH,
                                                            height: SWATCH_EDIT_HEX_INPUT_HEIGHT,
                                                            border: SWATCH_EDIT_BORDER,
                                                            background:
                                                                "rgba(255,255,255,0.9)",
                                                            color: "#001219",
                                                            fontSize:
                                                                SWATCH_EDIT_HEX_FONT,
                                                            fontWeight: 900,
                                                            letterSpacing:
                                                                SWATCH_EDIT_HEX_LETTER_SPACING,
                                                            padding: "0 8px",
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
                                            marginTop:
                                                SWATCH_EDIT_BOTTOM_BLOCK_GAP,
                                            fontSize: SWATCH_EDIT_HELP_FONT,
                                            lineHeight:
                                                SWATCH_EDIT_HELP_LINE_HEIGHT,
                                            color: "rgba(0,0,0,0.75)",
                                            flex: "0 0 auto",
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
                                    width: isMobileUI
                                        ? `calc(100vw - ${SWATCH_EDIT_MODAL_MOBILE_SIDE_GAP * 2}px)`
                                        : SWATCH_EDIT_MODAL_DESKTOP_SIZE,
                                    display: "flex",
                                    justifyContent: "center",
                                    pointerEvents: "auto",
                                    flex: "0 0 auto",
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={handleModalCancel}
                                    style={okCancelButtonStyle}
                                    aria-label="Cancel"
                                    className="pxUiAnim"
                                >
                                    <SvgCancelButton style={okCancelSvgStyle} />
                                </button>

                                <button
                                    type="button"
                                    onClick={handleModalApply}
                                    style={okCancelButtonStyle}
                                    aria-label="OK"
                                    className="pxUiAnim"
                                >
                                    <SvgOkButton style={okCancelSvgStyle} />
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
    const [screen, setScreen] = React.useState<
        "start" | "editor" | "smart-reference"
    >("start")
    const [pendingProjectFile, setPendingProjectFile] =
        React.useState<File | null>(null)

    const pendingProjectOpenFromStartRef = React.useRef(false)

    // =====================
    // ROOT / GATEWAY — S1 PASS-THROUGH CUT
    // Пока без SmartObject UI и без математики.
    // bakedReferenceFromImport:
    //   результат import/crop/preprocess до editor
    // gatewayCommittedReference:
    //   будущий committed snapshot от SmartObject;
    //   на S1 это просто pass-through копия baked reference
    // =====================

    // H1 / H2:
    // Import не создаёт HistoryEntry.
    // Import:
    // - очищает past
    // - очищает future
    // - удаляет pending transaction
    // - начинает новую session
    //
    // Undo/redo не имеет права возвращать состояние до импорта.

    // S2: отдельный SmartReferenceEditor существует как внешний модуль, но сюда ещё не подключён.

    const [gatewayCommittedReference, setGatewayCommittedReference] =
        React.useState<ImageData | null>(null)

    const [gatewayCommittedReferenceKind, setGatewayCommittedReferenceKind] =
        React.useState<"import" | "load" | "smart-object-apply" | null>(null)

    const [smartObjectHasBase, setSmartObjectHasBase] = React.useState(false)

    const [cameraOpen, setCameraOpen] = React.useState(false)

    // H1 / H2:
    // Root-level History Engine scaffold.
    //
    // committedHistoryRef:
    //   будущий список committed history entries текущей session
    //
    // redoHistoryRef:
    //   будущий список redo entries текущей session
    //
    // pendingHistoryTransactionRef:
    //   временный before-state между beginTransaction и commit/abort
    const rootHistoryRef = React.useRef<
        RootHistoryState<EditorCommittedState, SmartObjectCommittedState>
    >(createRootHistoryState<EditorCommittedState, SmartObjectCommittedState>())

    const [rootCanUndo, setRootCanUndo] = React.useState(false)
    const [rootCanRedo, setRootCanRedo] = React.useState(false)

    // H3:
    // Root получает прямой bridge к editor committed-state boundary.
    const editorCommittedStateBridgeRef =
        React.useRef<EditorCommittedStateBridge | null>(null)

    // H4:
    // Root получает прямой bridge к smart-object committed-state boundary.
    const smartObjectCommittedStateBridgeRef =
        React.useRef<SmartObjectCommittedStateBridge | null>(null)

    const syncRootHistoryFlags = React.useCallback(() => {
        setRootCanUndo(rootHistoryCanUndo(rootHistoryRef.current))
        setRootCanRedo(rootHistoryCanRedo(rootHistoryRef.current))
    }, [])

    const commitGatewaySnapshotToEditor = React.useCallback(
        (
            snapshot: ImageData | null,
            kind: "import" | "load" | "smart-object-apply"
        ) => {
            // Любой вход эталона в editor идёт через эту точку,
            // но editor обязан знать ПРИЧИНУ входа:
            // обычный import или SmartObject Apply.
            coreLifecycleLog("gateway:commit", {
                kind,
                hasSnapshot: !!snapshot,
            })

            setGatewayCommittedReference(snapshot)
            setGatewayCommittedReferenceKind(kind)

            if (kind === "import" || kind === "load") {
                // Step 7:
                // import/load/open-draw = new life boundary.
                // No previous user action may survive this point.
                rootHistoryClear(rootHistoryRef.current)
                syncRootHistoryFlags()
            }
        },
        [syncRootHistoryFlags]
    )

    const captureEditorCommittedState = React.useCallback(() => {
        return (
            editorCommittedStateBridgeRef.current?.captureCommittedState() ??
            null
        )
    }, [])

    const restoreEditorCommittedState = React.useCallback(
        (state: EditorCommittedState | null) => {
            if (!state) return
            editorCommittedStateBridgeRef.current?.applyCommittedState(state)
        },
        []
    )

    const captureSmartObjectCommittedState = React.useCallback(() => {
        return (
            smartObjectCommittedStateBridgeRef.current?.captureCommittedState() ??
            null
        )
    }, [])

    const restoreSmartObjectCommittedState = React.useCallback(
        (state: SmartObjectCommittedState | null) => {
            if (!state) return
            smartObjectCommittedStateBridgeRef.current?.applyCommittedState(
                state
            )
        },
        []
    )

    const handleRestoreSmartObjectFromLoad = React.useCallback(
        (payload: {
            base: ImageData | null
            adjustments: SmartReferenceAdjustments
        }) => {
            const bridge = smartObjectCommittedStateBridgeRef.current
            if (!bridge) return false

            bridge.restoreFromLoad(payload)
            setSmartObjectHasBase(payload.base != null)
            return true
        },
        []
    )

    const handleCaptureSmartReferenceBaseForSave = React.useCallback(() => {
        return (
            smartObjectCommittedStateBridgeRef.current?.captureBakedBaseForSave() ??
            null
        )
    }, [])

    const handleSmartObjectCommittedStateBridgeReady = React.useCallback(
        (bridge: SmartObjectCommittedStateBridge | null) => {
            smartObjectCommittedStateBridgeRef.current = bridge
            if (bridge) {
                setSmartObjectHasBase(bridge.hasBakedBase())
            }
        },
        []
    )

    const handleCaptureSmartObjectCommittedStateForSave =
        React.useCallback(() => {
            return captureSmartObjectCommittedState()
        }, [captureSmartObjectCommittedState])

    // S1/S2:
    // Root-level History Engine = единственный user-facing источник истины.
    //
    // Что это значит на практике:
    //
    // - beginTransaction / abortTransaction / commitTransaction работают только
    //   с root history.
    //
    // - undo / redo пользователя обязаны идти через этот слой,
    //   потому что только root history знает про оба домена:
    //   editor + smart-object.
    //
    // - внутренняя editor-history пока ещё может существовать,
    //   а не как главная пользовательская история.

    const beginTransaction = React.useCallback(
        (input: BeginHistoryTransactionInput) => {
            rootHistoryBegin(rootHistoryRef.current, input)
            syncRootHistoryFlags()
        },
        [syncRootHistoryFlags]
    )

    const abortTransaction = React.useCallback(() => {
        rootHistoryAbort(rootHistoryRef.current)
        syncRootHistoryFlags()
    }, [syncRootHistoryFlags])

    const commitTransaction = React.useCallback(
        (editorAfter: EditorCommittedState | null) => {
            rootHistoryCommit(rootHistoryRef.current, editorAfter, {
                isEditorEqual: areEditorCommittedStatesEqual,
                isSmartEqual: areSmartObjectCommittedStatesEqual,
            })
            syncRootHistoryFlags()
        },
        [syncRootHistoryFlags]
    )

    // Step 0 canonical user-action protocol:
    // begin → optional finalize metadata → commit / abort
    const beginUserAction = React.useCallback(
        (input: UserActionBeginInput) => {
            beginTransaction({
                kind: input.kind,
                editorBefore: input.editorBefore,
                smartBefore:
                    input.smartBefore ?? captureSmartObjectCommittedState(),
            })
        },
        [beginTransaction, captureSmartObjectCommittedState]
    )

    const finalizePendingUserAction = React.useCallback(
        (input?: UserActionFinalizeInput) => {
            rootHistoryFinalize(
                rootHistoryRef.current,
                input?.smartAfter ?? captureSmartObjectCommittedState()
            )
        },
        [captureSmartObjectCommittedState]
    )

    const commitUserAction = React.useCallback(
        (input: UserActionCommitInput) => {
            finalizePendingUserAction({
                smartAfter: input.smartAfter,
            })
            commitTransaction(input.editorAfter)
        },
        [finalizePendingUserAction, commitTransaction]
    )

    const abortUserAction = React.useCallback(() => {
        abortTransaction()
    }, [abortTransaction])

    const undo = React.useCallback(() => {
        // S2:
        // Это канонический пользовательский Undo.
        // Он обязан восстанавливать ОБА домена из root history.
        const entry = rootHistoryUndo(rootHistoryRef.current)
        if (!entry) return

        restoreEditorCommittedState(entry.editorBefore)
        restoreSmartObjectCommittedState(entry.smartBefore)
        syncRootHistoryFlags()
    }, [
        restoreEditorCommittedState,
        restoreSmartObjectCommittedState,
        syncRootHistoryFlags,
    ])

    const redo = React.useCallback(() => {
        // S2:
        // Это канонический пользовательский Redo.
        // Он обязан восстанавливать ОБА домена из root history.
        const entry = rootHistoryRedo(rootHistoryRef.current)
        if (!entry) return

        restoreEditorCommittedState(entry.editorAfter)
        restoreSmartObjectCommittedState(entry.smartAfter)
        syncRootHistoryFlags()
    }, [
        restoreEditorCommittedState,
        restoreSmartObjectCommittedState,
        syncRootHistoryFlags,
    ])

    const debugHistoryInfo = React.useCallback(() => {
        return {
            committed: rootHistoryRef.current.committed.length,
            redo: rootHistoryRef.current.redo.length,
            hasPending: rootHistoryRef.current.pending != null,
        }
    }, [])
    void debugHistoryInfo

    const closeSmartReferenceEditor = React.useCallback(() => {
        // Step 6:
        // Smart Object = strict modal action.
        // Cancel does not create history entry and must abort
        // the pending user action through the canonical protocol.
        abortUserAction()
        setScreen("editor")
    }, [abortUserAction])

    const openSmartReferenceFromEditorTest = React.useCallback(() => {
        const before = captureEditorCommittedState()
        if (ENABLE_ROOT_HISTORY_LOGS) {
            console.log("H3 editorBefore capture:", before)
        }

        const smartBefore = captureSmartObjectCommittedState()

        // Step 6:
        // open Smart Object = begin modal user action.
        // editorBefore and smartBefore are captured exactly once here.
        beginUserAction({
            kind: "smart-object-apply",
            editorBefore: before,
            smartBefore,
        })

        setScreen("smart-reference")
    }, [
        captureEditorCommittedState,
        captureSmartObjectCommittedState,
        beginUserAction,
    ])

    const handlePublishedReferenceEnvelope = React.useCallback(
        (envelope: ReferenceSnapshotEnvelope) => {
            coreLifecycleLog("smart-reference:published", {
                kind: envelope.kind,
                revision: envelope.revision,
                hasSnapshot: !!envelope.snapshot,
            })

            setSmartObjectHasBase(envelope.snapshot != null)

            // Step 6:
            // Smart Object Apply is a strict modal action:
            // 1) finalize smartAfter
            // 2) route committed snapshot into editor-domain
            // 3) wait for settled editorAfter
            if (envelope.kind === "smart-object-apply") {
                finalizePendingUserAction({
                    smartAfter: captureSmartObjectCommittedState(),
                })
            }

            commitGatewaySnapshotToEditor(envelope.snapshot, envelope.kind)

            if (envelope.kind === "smart-object-apply") {
                setScreen("editor")
            }
        },
        [
            commitGatewaySnapshotToEditor,
            captureSmartObjectCommittedState,
            finalizePendingUserAction,
        ]
    )

    const handleEditorCommittedStateSettled = React.useCallback(
        (payload: EditorCommittedStateSettledPayload) => {
            if (ENABLE_ROOT_HISTORY_LOGS) {
                console.log("H3 settled payload:", payload)
            }

            // Step 6:
            // smart-object-apply commits only after editor-domain
            // finishes its rebuild and yields final editorAfter.
            if (payload.routeKind !== "smart-object-apply") return

            commitUserAction({
                editorAfter: payload.state,
            })

            if (ENABLE_ROOT_HISTORY_LOGS) {
                console.log(
                    "STEP6 committed history entry:",
                    rootHistoryRef.current.committed[
                        rootHistoryRef.current.committed.length - 1
                    ]
                )
            }
        },
        [commitUserAction]
    )

    const handleBeginUserAction = React.useCallback(
        (input: UserActionBeginInput) => {
            beginUserAction(input)
        },
        [beginUserAction]
    )

    const handleFinalizePendingUserAction = React.useCallback(
        (input?: UserActionFinalizeInput) => {
            finalizePendingUserAction(input)
        },
        [finalizePendingUserAction]
    )

    const handleCommitUserAction = React.useCallback(
        (input: UserActionCommitInput) => {
            commitUserAction(input)
        },
        [commitUserAction]
    )

    const handleAbortUserAction = React.useCallback(() => {
        abortUserAction()
    }, [abortUserAction])

    const rootSupportsFileSystemAccess =
        typeof window !== "undefined" && "showSaveFilePicker" in window

    function getRootSavePickerOptionsForFilename(filename: string) {
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

    function downloadBlobFromRoot(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    async function saveBlobFromProducerAtRoot(
        produceBlob: () => Promise<Blob | null>,
        filename: string
    ) {
        if (typeof window === "undefined") {
            const b = await produceBlob()
            if (b) downloadBlobFromRoot(b, filename)
            return
        }

        const anyWin = window as any
        const canSaveAs =
            rootSupportsFileSystemAccess &&
            window.isSecureContext &&
            typeof anyWin.showSaveFilePicker === "function"

        if (canSaveAs) {
            let handle: any = null
            try {
                handle = await anyWin.showSaveFilePicker(
                    getRootSavePickerOptionsForFilename(filename)
                )
            } catch (e: any) {
                if (e?.name === "AbortError") return
                handle = null
            }

            const blob = await produceBlob()
            if (!blob) return

            if (handle) {
                try {
                    const writable = await handle.createWritable()
                    await writable.write(blob)
                    await writable.close()
                    return
                } catch {
                    // Fall back to browser download when picker write fails.
                }
            }

            downloadBlobFromRoot(blob, filename)
            return
        }

        const blob = await produceBlob()
        if (!blob) return
        downloadBlobFromRoot(blob, filename)
    }

    async function imageDataToPngBlobAtRoot(
        imageData: ImageData | null
    ): Promise<Blob | null> {
        if (!imageData) return null
        if (typeof document === "undefined") return null

        const canvas = document.createElement("canvas")
        canvas.width = imageData.width
        canvas.height = imageData.height

        const ctx = canvas.getContext("2d")
        if (!ctx) return null

        ctx.putImageData(imageData, 0, 0)

        return await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((blob) => resolve(blob), "image/png")
        })
    }

    const handleSmartReferenceExport = React.useCallback(
        async (payload: {
            previewImage: ImageData | null
            adjustments: SmartReferenceAdjustments
        }) => {
            await saveBlobFromProducerAtRoot(async () => {
                return await imageDataToPngBlobAtRoot(payload.previewImage)
            }, "pixtudio-smart-object.png")
        },
        []
    )

    const fileInputRef = React.useRef<HTMLInputElement | null>(null)

    const loadFileInputRef = React.useRef<HTMLInputElement | null>(null)

    const cameraInputRef = React.useRef<HTMLInputElement | null>(null)

    const openProjectPicker = React.useCallback(() => {
        pendingProjectOpenFromStartRef.current = screen === "start"
        const el = loadFileInputRef.current
        if (!el) return

        try {
            el.value = ""
        } catch {
            // Some browsers expose a read-only value; click still opens the picker.
        }

        el.click()
    }, [screen])

    // ======================
    // GLOBAL: unified import-error modal (single source of truth)
    // ======================

    const [importErrorModal, setImportErrorModal] = React.useState<{
        message: string
    } | null>(null)

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
                          //gap: 14,
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
                          style={okCancelButtonStyle}
                          aria-label="OK"
                          className="pxUiAnim"
                      >
                          <SvgOkButton style={okCancelSvgStyle} />
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

    // ROOT GATEWAY ENTRY:
    // Именно здесь baked reference после import впервые входит
    // в новый маршрут Root -> (future SmartObject) -> Editor.

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

        const bridge = smartObjectCommittedStateBridgeRef.current
        if (!bridge) {
            failImport("Import failed. Please try again.")
            return preprocessed
        }

        bridge.importBakedBase(preprocessed)
        setSmartObjectHasBase(true)
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

    type PresetId = "DEFAULT" | "NEON" | "GRAYSCALE" | "BW"

    const [selectedPresetId, setSelectedPresetId] =
        React.useState<PresetId | null>(null)
    // null = “ничего не выбрано” => по твоим правилам это DEFAULT

    type ImportStatus = "idle" | "decoding" | "ready" | "applying"

    const [importStatus, setImportStatus] = React.useState<ImportStatus>("idle")

    // legacy diagnostics only (UI must NOT branch on this anymore)
    const [, setImportError] = React.useState<string | null>(null)

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

    // ROOT GATEWAY ENTRY:
    // Альтернативный импортный путь тоже обязан входить в editor
    // только через gateway-slot, без прямого setEditorImageData(...).
    function handleImportArtifact(a: ImportArtifact) {
        const bridge = smartObjectCommittedStateBridgeRef.current
        if (!bridge) {
            failImport("Import failed. Please try again.")
            return
        }

        bridge.importBakedBase(a.bakedRef512)
        setSmartObjectHasBase(true)
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
        const a = null as ImportArtifact | null

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
            void a
        }
    }, [])

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
            validateImportImageDataOrThrow(
                artifact.bakedRef512,
                "artifact.bakedRef512"
            )
            handleImportArtifact(artifact)
            setCropPending(null)
            setSelectedPresetId(null)
            setImportStatus("idle")
            setImportError(null)
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
        const previewCtx = ctx
        const previewSrc = src

        const W = dst.width
        const H = dst.height

        previewCtx.clearRect(0, 0, W, H)

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
            previewCtx.save()
            previewCtx.globalAlpha = alpha
            previewCtx.translate(cx, cy)
            previewCtx.rotate(cropUiRotation)
            previewCtx.drawImage(
                previewSrc,
                -drawW / 2,
                -drawH / 2,
                drawW,
                drawH
            )
            previewCtx.restore()
        }

        // 1) "уши": рисуем ту же картинку, но с opacity ~30% (без клипа)
        drawTransformed(IMPORT_PREVIEW_EARS_OPACITY)

        // 2) viewport: поверх — та же картинка, но только внутри квадратного окна (100% opacity)
        previewCtx.save()
        previewCtx.beginPath()
        previewCtx.rect(vx, vy, vSize, vSize)
        previewCtx.clip()
        drawTransformed(1)
        previewCtx.restore()

        // 3) рамка viewport, чтобы было понятно "вот это будет холст"
        previewCtx.save()
        previewCtx.strokeStyle = "rgba(255,255,255,0.95)"
        previewCtx.lineWidth = Math.max(2, Math.round(W * 0.006))
        const half = previewCtx.lineWidth / 2
        previewCtx.strokeRect(
            vx + half,
            vy + half,
            vSize - previewCtx.lineWidth,
            vSize - previewCtx.lineWidth
        )
        previewCtx.restore()
    }

    const cropPreviewBoxRef = React.useRef<HTMLDivElement | null>(null)
    const [cropPreviewCssPx, setCropPreviewCssPx] = React.useState(0)

    const [isCropDragging, setIsCropDragging] = React.useState(false)

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
            } catch {
                // ResizeObserver disconnect is best-effort during cleanup.
            }
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
            } catch {
                // Ignore style cleanup failures on detached elements.
            }
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
    void closeCropScreen

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
                } catch {
                    // Object URL may already be released by the browser.
                }
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

                    const ctx = get2dReadFrequentlyContext(offCanvas)
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

                const ctx = get2dReadFrequentlyContext(offCanvas)
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

        if (!prepared) {
            console.error("[IMPORT][confirmCrop] applyGeometry returned null")
            failImportInFlow("Failed to apply crop geometry.")
            return
        }

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
    void retryImport

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
    void getLocalPoint

    function getCenterForAngle(e: any) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        return { x: rect.width / 2, y: rect.height / 2 }
    }
    void getCenterForAngle

    function angleBetween(ax: number, ay: number, bx: number, by: number) {
        return Math.atan2(by - ay, bx - ax)
    }
    void angleBetween

    function dist(ax: number, ay: number, bx: number, by: number) {
        const dx = bx - ax
        const dy = by - ay
        return Math.sqrt(dx * dx + dy * dy)
    }
    void dist

    function clamp(n: number, a: number, b: number) {
        return Math.max(a, Math.min(b, n))
    }
    void clamp

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

    // ROOT GATEWAY ENTRY:
    // Даже пустой вход в editor (blank canvas) проходит через тот же gateway-slot.

    // S3 note:
    // SmartReferenceEditor уже подключён в root как отдельный модуль,
    // но в обычный пользовательский UI ещё не врезан.

    function openDraw() {
        // S1: даже blank/open-editor идёт через тот же gateway-slot.
        smartObjectCommittedStateBridgeRef.current?.clearBase("import")
        setSmartObjectHasBase(false)
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
    void onCaptured

    const handlePickedProjectFile = React.useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            if (!file) {
                setScreen(
                    pendingProjectOpenFromStartRef.current ? "start" : "editor"
                )
                return
            }

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
            <StartScreen
                onPickImage={openImagePicker}
                onOpenCamera={openCamera}
                onOpenDraw={openDraw}
                onOpenProject={openProjectPicker}
            />
        ) : (
            <>
                {/* ROOT -> EDITOR:
                Editor должен оставаться смонтированным и при screen === "editor",
                и при screen === "smart-reference".
                Иначе теряется editor-owned state:
                overlay, undo/redo, refs и локальная история редактора. */}
                <PixelEditorFramer
                    initialImageData={gatewayCommittedReference}
                    initialImageRouteKind={gatewayCommittedReferenceKind}
                    onCaptureSmartReferenceBaseForSave={
                        handleCaptureSmartReferenceBaseForSave
                    }
                    onCaptureSmartObjectCommittedStateForSave={
                        handleCaptureSmartObjectCommittedStateForSave
                    }
                    onRestoreSmartObjectFromLoad={
                        handleRestoreSmartObjectFromLoad
                    }
                    startWithImageVisible={true}
                    onRequestCamera={openSystemCameraHead}
                    onRequestCropFromFile={async ({ file }) => {
                        const sourceImage = await decodeToSourceImage(file)
                        openCropFlow(sourceImage)
                    }}
                    onRequestPickImage={openImagePicker}
                    onRequestBlankImport={openDraw}
                    onRequestOpenProject={openProjectPicker}
                    onShowImportError={failImport}
                    onOpenSmartReferenceTest={
                        smartObjectHasBase
                            ? openSmartReferenceFromEditorTest
                            : undefined
                    }
                    onEditorCommittedStateBridgeReady={(bridge) => {
                        if (ENABLE_ROOT_HISTORY_LOGS) {
                            console.log("H3 bridge ready:", bridge)
                        }
                        editorCommittedStateBridgeRef.current = bridge
                    }}
                    onEditorCommittedStateSettled={
                        handleEditorCommittedStateSettled
                    }
                    onBeginUserAction={handleBeginUserAction}
                    onFinalizePendingUserAction={
                        handleFinalizePendingUserAction
                    }
                    onCommitUserAction={handleCommitUserAction}
                    onAbortUserAction={handleAbortUserAction}
                    onCoordinatedUndo={undo}
                    onCoordinatedRedo={redo}
                    coordinatedCanUndo={rootCanUndo}
                    coordinatedCanRedo={rootCanRedo}
                    pendingProjectFile={pendingProjectFile}
                    onPendingProjectFileConsumed={() =>
                        setPendingProjectFile(null)
                    }
                />

            </>
        )

    return (
        <>
            {content}

            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 20000,
                    pointerEvents:
                        screen === "smart-reference" ? "auto" : "none",
                }}
            >
                <SmartReferenceEditor
                    isOpen={screen === "smart-reference"}
                    onCancel={closeSmartReferenceEditor}
                    onSmartObjectCommittedStateBridgeReady={
                        handleSmartObjectCommittedStateBridgeReady
                    }
                    onPublishEnvelope={handlePublishedReferenceEnvelope}
                    onExport={handleSmartReferenceExport}
                />
            </div>

            {/* ROOT shared hidden inputs:
                должны быть смонтированы независимо от текущего экрана,
                потому что root-callbacks openImagePicker/openProjectPicker
                могут вызываться из разных веток UI. */}
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
                                onClick={() => {
                                    if (typeof window === "undefined") return

                                    const isMobile =
                                        /Android|iPhone|iPad|iPod|Mobile/i.test(
                                            navigator.userAgent
                                        )

                                    const mailtoHref =
                                        "mailto:support@pixtudio.app?subject=PIXTUDIO%20support"

                                    const gmailComposeUrl =
                                        "https://mail.google.com/mail/?view=cm&fs=1&to=support@pixtudio.app&su=PIXTUDIO%20support"

                                    if (isMobile) {
                                        window.location.href = mailtoHref
                                        return
                                    }

                                    window.open(
                                        gmailComposeUrl,
                                        "_blank",
                                        "noopener,noreferrer"
                                    )
                                }}
                                style={footerIconStyle}
                                aria-label="Email"
                                className="pxUiAnim"
                            >
                                <svg
                                    viewBox="0 0 103.2 103.2"
                                    width="22"
                                    height="22"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <polygon
                                        fill="#001219"
                                        points="45.2,103.2 45.2,96.8 25.8,96.8 25.8,90.3 19.4,90.3 19.4,83.9 12.9,83.9 12.9,77.4 6.5,77.4 
		6.5,58.1 0,58.1 0,45.2 6.5,45.2 6.5,25.8 12.9,25.8 12.9,19.4 19.4,19.4 19.4,12.9 25.8,12.9 25.8,6.5 45.2,6.5 45.2,0 58.1,0 
		58.1,6.5 77.4,6.5 77.4,12.9 83.9,12.9 83.9,19.4 90.3,19.4 90.3,25.8 96.8,25.8 96.8,45.2 103.2,45.2 103.2,58.1 96.8,58.1 
		96.8,77.4 90.3,77.4 90.3,83.9 83.9,83.9 83.9,90.3 77.4,90.3 77.4,96.8 58.1,96.8 58.1,103.2 	"
                                    />
                                    <path
                                        fill="#ffffff"
                                        d="M69.6,31.1h-36c-4.3,0-7.7,3.5-7.7,7.7v25.7c0,4.3,3.5,7.7,7.7,7.7h36c4.3,0,7.7-3.5,7.7-7.7V38.8
	C77.3,34.5,73.8,31.1,69.6,31.1z M33.6,36.2h36c0.2,0,0.4,0,0.6,0.1L51.6,50L33,36.3C33.2,36.2,33.4,36.2,33.6,36.2z M72.2,64.5
	c0,1.4-1.2,2.6-2.6,2.6h-36c-1.4,0-2.6-1.2-2.6-2.6V41.2l19,14c0.5,0.3,1,0.5,1.5,0.5c0.5,0,1.1-0.2,1.5-0.5l19-14V64.5z"
                                    />
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={async () => {
                                    if (typeof window === "undefined") return

                                    const shareUrl = window.location.origin
                                    const shareData = {
                                        title: "PIXTUDIO",
                                        text: "Create your pixel identity.",
                                        url: shareUrl,
                                    }

                                    try {
                                        if (
                                            navigator.share &&
                                            (!navigator.canShare ||
                                                navigator.canShare(shareData))
                                        ) {
                                            await navigator.share(shareData)
                                            return
                                        }
                                    } catch {
                                        // user cancel / unsupported / other runtime issue
                                    }

                                    try {
                                        if (
                                            navigator.clipboard &&
                                            window.isSecureContext
                                        ) {
                                            await navigator.clipboard.writeText(
                                                shareUrl
                                            )
                                            alert("Link copied")
                                            return
                                        }
                                    } catch {
                                        // Fall through to the prompt fallback.
                                    }

                                    window.prompt("Copy this link:", shareUrl)
                                }}
                                style={footerIconStyle}
                                aria-label="Share"
                                className="pxUiAnim"
                            >
                                <svg
                                    version="1.1"
                                    viewBox="0 0 103.2 103.2"
                                    width="22"
                                    height="22"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <g>
                                        <polygon
                                            fill="#001219"
                                            points="45.2,103.2 45.2,96.8 25.8,96.8 25.8,90.3 19.4,90.3 19.4,83.9 12.9,83.9 12.9,77.4 6.5,77.4 
                6.5,58.1 0,58.1 0,45.2 6.5,45.2 6.5,25.8 12.9,25.8 12.9,19.4 19.4,19.4 19.4,12.9 25.8,12.9 25.8,6.5 45.2,6.5 45.2,0 58.1,0 
                58.1,6.5 77.4,6.5 77.4,12.9 83.9,12.9 83.9,19.4 90.3,19.4 90.3,25.8 96.8,25.8 96.8,45.2 103.2,45.2 103.2,58.1 96.8,58.1 
                96.8,77.4 90.3,77.4 90.3,83.9 83.9,83.9 83.9,90.3 77.4,90.3 77.4,96.8 58.1,96.8 58.1,103.2"
                                        />
                                    </g>
                                    <g transform="translate(-380 -3319)">
                                        <g transform="translate(56 160)">
                                            <path
                                                fill="#FFFFFF"
                                                fillRule="evenodd"
                                                clipRule="evenodd"
                                                d="M357,3206.2c2.6,0,4.7,2.1,4.7,4.7s-2.1,4.7-4.7,4.7c-2.6,0-4.7-2.1-4.7-4.7
                    S354.4,3206.2,357,3206.2 M384.9,3192c2.6,0,4.7,2.1,4.7,4.7c0,2.6-2.1,4.7-4.7,4.7C378.8,3201.3,378.8,3192,384.9,3192
                    M384.9,3219.9c2.6,0,4.7,2.1,4.7,4.7s-2.1,4.7-4.7,4.7C378.8,3229.3,378.8,3219.9,384.9,3219.9 M357,3220.2
                    c2.8,0,5.4-1.3,7.1-3.3l11.7,6.7c-0.6,5.8,3.9,10.3,9.2,10.3c5.1,0,9.3-4.2,9.3-9.3c0-5.1-4.2-9.3-9.3-9.3
                    c-3.1,0-5.9,1.6-7.6,3.9l-11.2-6.5c0.3-1.3,0.2-2.5,0-3.8l11.5-6.6c1.7,2.2,4.3,3.6,7.3,3.6c5.1,0,9.3-4.2,9.3-9.3
                    c0-5.1-4.2-9.3-9.3-9.3c-5.5,0-10.1,4.8-9.2,10.7l-11.8,6.8c-1.7-2-4.2-3.2-7-3.2c-5.1,0-9.3,4.2-9.3,9.3
                    S351.8,3220.2,357,3220.2"
                                            />
                                        </g>
                                    </g>
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
                            //gap: 16,
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
                                                    right: 50,
                                                    top: 50,
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
                                                    width="25"
                                                    height="25"
                                                    viewBox="0 0 63.1 66.8"
                                                    style={{ display: "block" }}
                                                    xmlns="http://www.w3.org/2000/svg"
                                                >
                                                    <path
                                                        fill="#fff"
                                                        d="M32.5,66.8c-17.7,0-32.1-14.4-32.1-32.1c0-17.7,14.4-32,32.1-32c7,0,13.6,2.4,18.9,6.9l3.5,3V0h6.4v25H36.2
	v-6.4h15.7l-4-3.7C43.6,11.1,38.3,9,32.5,9C18.3,9,6.7,20.5,6.7,34.7c0,14.2,11.5,25.7,25.7,25.7c10.7,0,20.3-6.8,24-16.8l6.2,1.7
	C58.3,58.1,46.1,66.8,32.5,66.8z"
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
                                                    right: 50,
                                                    bottom: 50,
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
                                                    width="25"
                                                    height="25"
                                                    viewBox="0 0 66.8 66.8"
                                                    style={{ display: "block" }}
                                                    xmlns="http://www.w3.org/2000/svg"
                                                >
                                                    {/* TODO: заменишь на свои пиксельные стрелки */}
                                                    {/* простая “масштаб” иконка-заглушка */}
                                                    <path
                                                        fill="#fff"
                                                        d="M41.7,66.8v-6.4H57L40.3,43.7l3.4-3.4L60.4,57V41.7h6.4v25.1H41.7z M0,66.8V41.7h6.4V57l16.7-16.7l3.4,3.4
	L9.8,60.4h15.3v6.4H0z M6.4,9.8v15.3H0V0h25.1v6.4H9.8l16.7,16.7l-3.4,3.4L6.4,9.8z M40.3,23.1L57,6.4H41.7V0h25.1v25.1h-6.4V9.8
	L43.7,26.5L40.3,23.1z"
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
                                        //gap: 26,
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
                                //paddingTop: 4,
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
                                    //gap: 28,
                                }}
                            >
                                <button
                                    onClick={cancelCrop}
                                    disabled={
                                        importStatus === "decoding" ||
                                        importStatus === "applying"
                                    }
                                    style={{
                                        ...okCancelButtonStyle,
                                        cursor:
                                            importStatus === "decoding" ||
                                            importStatus === "applying"
                                                ? "not-allowed"
                                                : okCancelButtonStyle.cursor,
                                    }}
                                    aria-label="Cancel"
                                    className="pxUiAnim"
                                >
                                    <SvgCancelButton style={okCancelSvgStyle} />
                                </button>

                                <button
                                    onClick={confirmCrop}
                                    disabled={
                                        importStatus === "decoding" ||
                                        importStatus === "applying"
                                    }
                                    style={{
                                        ...okCancelButtonStyle,
                                        cursor:
                                            importStatus === "decoding" ||
                                            importStatus === "applying"
                                                ? "not-allowed"
                                                : okCancelButtonStyle.cursor,
                                    }}
                                    aria-label="OK"
                                    className="pxUiAnim"
                                >
                                    <SvgOkButton style={okCancelSvgStyle} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

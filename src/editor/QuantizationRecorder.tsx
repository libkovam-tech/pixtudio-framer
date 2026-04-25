import * as React from "react"

import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"

import {
    SvgAlertBacking,
    SvgCancelButton,
    SvgExportSOButton,
    SvgOkButton,
} from "./SvgIcons.tsx"
import {
    runQuantizationExportPipeline,
    type RecorderExportAudioTrack,
    type RecorderExportDebugLog,
    type RecorderExportResult,
    type RecorderExportPngFrame,
} from "./QuantizationRecorder.export.ts"
import {
    buildRecorderSteps,
    type DirectionMode,
} from "./QuantizationRecorder.steps.ts"

type FrozenSwatch = {
    id: string
    color: string
    isTransparent: boolean
    isUser: boolean
}

type AutoOverride = {
    hex?: string
    isTransparent?: boolean
}

export type QuantizationRecorderFrame = {
    imageData: ImageData
    exportSize: number
    gridSize: number
    paletteSize: number
}

export type QuantizationRecorderSeed = {
    referenceSnapshot: ImageData | null
    overlaySnapshot: ImageData | null
    autoSwatches: FrozenSwatch[]
    userSwatches: FrozenSwatch[]
    autoOverrides: Record<string, AutoOverride>
    gridBounds: { min: number; max: number }
    paletteBounds: { min: number; max: number }
    initialGridSize: number
    initialPaletteSize: number
    generateFrame: (params: {
        gridSize: number
        paletteSize: number
    }) => Promise<QuantizationRecorderFrame>
    saveBlob: (
        produceBlob: () => Promise<Blob | null>,
        filename: string
    ) => Promise<void>
}

type SaveFileHandleLike = {
    createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>
        close: () => Promise<void>
    }>
}

type SavePickerOptionsLike = {
    suggestedName: string
    types?: Array<{
        description: string
        accept: Record<string, string[]>
    }>
}

type SavePickerWindowLike = Window & {
    showSaveFilePicker?: (
        options?: SavePickerOptionsLike
    ) => Promise<SaveFileHandleLike>
}

type QuantizationRecorderProps = {
    seed: QuantizationRecorderSeed
    onClose: () => void
}

type GeneratedRecorderFrame = QuantizationRecorderFrame & {
    sourceCanvas: HTMLCanvasElement
}

const CANVAS_TARGET = 256
const EXPORT_FPS = 30
const ENABLE_MP4_CONVERSION = true
const APP_BASE_URL =
    typeof import.meta.env.BASE_URL === "string" && import.meta.env.BASE_URL.length > 0
        ? import.meta.env.BASE_URL
        : "/"
const FFMPEG_CUSTOM_WORKER_URL = `${APP_BASE_URL}vendor/ffmpeg-core-custom/worker.js`
const FFMPEG_CUSTOM_CORE_URL = `${APP_BASE_URL}vendor/ffmpeg-core-custom/ffmpeg-core.js`
const FFMPEG_CUSTOM_WASM_URL = `${APP_BASE_URL}vendor/ffmpeg-core-custom/ffmpeg-core.wasm`
const PORTRAIT_WIDTH = 760
const PREVIEW_SIZE = 690
const SURFACE_BG = "#031219"
const PANEL_BG = SURFACE_BG
const PANEL_BORDER = "2px solid rgba(255, 255, 255, 0.3)"
const PANEL_RADIUS = 0
const TEXT_LIGHT = "#ffffff"
const TEXT_MUTED = "rgba(255,255,255,0.86)"
const TEXT_DIM = "rgba(255,255,255,0.74)"
const TEXT_GREEN = "#69f17c"
const QUANTIZATION_EXPORT_DEBUG = true
const AUDIO_FADE_SECONDS = 0.5
const EXPORT_PROGRESS_PREP_MAX = 12
const EXPORT_PROGRESS_PNG_MAX = 42
const EXPORT_PROGRESS_ENCODE_START = 56
const EXPORT_PROGRESS_ENCODE_MAX = 96
const FFMPEG_CUSTOM_CORE_MIME = "text/javascript"
const FFMPEG_CUSTOM_WASM_MIME = "application/wasm"

const okCancelButtonStyle: React.CSSProperties = {
    width: 50,
    height: 50,
    border: "none",
    background: "transparent",
    padding: 0,
    marginTop: 18,
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

.qrProgress {
    width: 100%;
    height: 12px;
    appearance: none;
    background: linear-gradient(
        to right,
        #c7462b 0%,
        #c7462b var(--qr-progress-pct, 0%),
        rgba(255,255,255,0.98) var(--qr-progress-pct, 0%),
        rgba(255,255,255,0.98) 100%
    );
    outline: none;
    display: block;
}

.qrProgress::-webkit-slider-runnable-track {
    height: 12px;
    background: linear-gradient(
        to right,
        #c7462b 0%,
        #c7462b var(--qr-progress-pct, 0%),
        rgba(255,255,255,0.98) var(--qr-progress-pct, 0%),
        rgba(255,255,255,0.98) 100%
    );
}

.qrProgress::-webkit-slider-thumb {
    appearance: none;
    width: 24px;
    height: 24px;
    margin-top: -6px;
    border-radius: 999px;
    border: none;
    background: #c7462b;
    box-shadow: 0 0 0 4px rgba(199, 70, 43, 0.18);
}

.qrProgress::-moz-range-track {
    height: 12px;
    background: linear-gradient(
        to right,
        #c7462b 0%,
        #c7462b var(--qr-progress-pct, 0%),
        rgba(255,255,255,0.98) var(--qr-progress-pct, 0%),
        rgba(255,255,255,0.98) 100%
    );
}

.qrProgress::-moz-range-thumb {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    border: none;
    background: #c7462b;
    box-shadow: 0 0 0 4px rgba(199, 70, 43, 0.18);
}

.qrProgress:disabled {
    opacity: 0.45;
}

.qrNumberInput {
    width: 80px;
    height: 40px;
    border: none;
    border-radius: 8px;
    background: #ffffff;
    color: #031219;
    padding: 5px 8px;
    box-sizing: border-box;
    font-size: 20px;
    font-weight: 700;
    outline: none;
    text-align: center;
    line-height: 1;
    font-family: inherit;
    appearance: none;
    -moz-appearance: textfield;
}

.qrNumberInput::-webkit-outer-spin-button,
.qrNumberInput::-webkit-inner-spin-button {
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
}

.qrToggle {
    width: 32px;
    height: 32px;
    appearance: none;
    border: 3px solid #ffffff;
    border-radius: 999px;
    background: #ffffff;
    margin: 0;
    position: relative;
    box-sizing: border-box;
    flex: 0 0 auto;
}

.qrToggle[type="checkbox"] {
    border-radius: 6px;
}

.qrToggle:checked::after {
    content: "";
    position: absolute;
    inset: 6px;
    background: #000000;
    border-radius: 999px;
}

.qrToggle[type="checkbox"]:checked::after {
    width: 8px;
    height: 16px;
    background: transparent;
    border-right: 5px solid #000000;
    border-bottom: 5px solid #000000;
    border-radius: 0;
    inset: auto;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -58%) rotate(45deg);
}
`

let ffmpegSingleton: FFmpeg | null = null
let ffmpegLoadPromise: Promise<FFmpeg> | null = null

function clampInt(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Math.round(n)))
}

function clampUnit(n: number) {
    return Math.min(1, Math.max(0, n))
}

function mapRangeProgress(progress: number, from: number, to: number) {
    return Math.round(from + clampUnit(progress) * (to - from))
}

function computeExportSize(gridSize: number) {
    const target = CANVAS_TARGET
    const down = Math.floor(target / gridSize) * gridSize
    const up = Math.ceil(target / gridSize) * gridSize
    const best = Math.abs(down - target) <= Math.abs(up - target) ? down : up
    return best > 0 ? best : gridSize
}

function getExportFilename() {
    return ENABLE_MP4_CONVERSION
        ? "pixtudio-quantization.mp4"
        : "pixtudio-quantization.webm"
}

function getSavePickerOptionsForFilename(filename: string) {
    const lower = filename.toLowerCase()
    const isMp4 = lower.endsWith(".mp4")
    const isWebm = lower.endsWith(".webm")

    const pickerOpts: SavePickerOptionsLike = {
        suggestedName: filename,
    }

    if (isMp4) {
        pickerOpts.types = [
            {
                description: "MP4 Video",
                accept: { "video/mp4": [".mp4"] },
            },
        ]
    } else if (isWebm) {
        pickerOpts.types = [
            {
                description: "WebM Video",
                accept: { "video/webm": [".webm"] },
            },
        ]
    }

    return pickerOpts
}

async function requestEarlySaveTarget(
    filename: string
): Promise<SaveFileHandleLike | null> {
    if (typeof window === "undefined") return null
    const savePickerWindow = window as SavePickerWindowLike
    const canSaveAs =
        window.isSecureContext &&
        typeof savePickerWindow.showSaveFilePicker === "function"

    if (!canSaveAs) return null

    try {
        return await savePickerWindow.showSaveFilePicker!(
            getSavePickerOptionsForFilename(filename)
        )
    } catch (error: unknown) {
        if (
            error instanceof DOMException &&
            error.name === "AbortError"
        ) {
            return null
        }
        throw error
    }
}

async function writeBlobToSaveTarget(
    handle: SaveFileHandleLike,
    blob: Blob
): Promise<boolean> {
    try {
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        return true
    } catch {
        return false
    }
}

function getViewportHeightPx() {
    if (typeof document === "undefined") return 0
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    return Math.round((vv?.height ?? window.innerHeight) || 0)
}

function FitToViewport({
    children,
    background,
}: {
    children: React.ReactNode | ((scale: number) => React.ReactNode)
    background: string
}) {
    const contentRef = React.useRef<HTMLDivElement | null>(null)
    const [viewport, setViewport] = React.useState({ w: 1, h: 1 })
    const [contentSize, setContentSize] = React.useState({ w: 1, h: 1 })
    const [scale, setScale] = React.useState(1)

    React.useLayoutEffect(() => {
        let raf = 0
        const updateViewport = () => {
            if (raf) cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const vv = typeof window !== "undefined" ? window.visualViewport : null
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
                setViewport({
                    w: Math.max(1, vw),
                    h: Math.max(1, vh),
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

    React.useLayoutEffect(() => {
        const el = contentRef.current
        if (!el) return
        let raf = 0
        const measure = () => {
            if (raf) cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                setContentSize({
                    w: Math.max(1, el.scrollWidth),
                    h: Math.max(1, el.scrollHeight),
                })
            })
        }
        measure()
        const ro = new ResizeObserver(() => measure())
        ro.observe(el)
        return () => {
            ro.disconnect()
            if (raf) cancelAnimationFrame(raf)
        }
    }, [])

    React.useEffect(() => {
        const next = Math.min(
            Math.max(0.1, viewport.w / Math.max(1, contentSize.w)),
            Math.max(0.1, viewport.h / Math.max(1, contentSize.h))
        )
        setScale(next)
    }, [viewport, contentSize])

    return (
        <div
            style={{
                width: viewport.w,
                maxWidth: viewport.w,
                height: viewport.h,
                background,
                overflow: "hidden",
                display: "grid",
                placeItems: "start center",
            }}
        >
            <div
                style={{
                    width: Math.max(1, Math.round(contentSize.w * scale)),
                    height: Math.max(1, Math.round(contentSize.h * scale)),
                    position: "relative",
                    overflow: "hidden",
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
                        style={{ display: "inline-block", width: "fit-content" }}
                    >
                        {typeof children === "function" ? children(scale) : children}
                    </div>
                </div>
            </div>
        </div>
    )
}

async function ensureFFmpegLoaded() {
    if (ffmpegSingleton?.loaded) return ffmpegSingleton
    if (ffmpegLoadPromise) return ffmpegLoadPromise

    ffmpegLoadPromise = (async () => {
        const ffmpeg = ffmpegSingleton ?? new FFmpeg()
        if (!ffmpeg.loaded) {
            const coreBlobURL = await toBlobURL(
                FFMPEG_CUSTOM_CORE_URL,
                FFMPEG_CUSTOM_CORE_MIME
            )
            const wasmBlobURL = await toBlobURL(
                FFMPEG_CUSTOM_WASM_URL,
                FFMPEG_CUSTOM_WASM_MIME
            )
            if (QUANTIZATION_EXPORT_DEBUG) {
                console.info("[QuantizationRecorder] About to call ffmpeg.load()", {
                    classWorkerURL: FFMPEG_CUSTOM_WORKER_URL,
                    coreURL: coreBlobURL,
                    wasmURL: wasmBlobURL,
                })
            }
            await ffmpeg.load({
                classWorkerURL: FFMPEG_CUSTOM_WORKER_URL,
                coreURL: coreBlobURL,
                wasmURL: wasmBlobURL,
            })
            if (QUANTIZATION_EXPORT_DEBUG) {
                console.info("[QuantizationRecorder] ffmpeg.load() resolved")
            }
        }
        ffmpegSingleton = ffmpeg
        return ffmpeg
    })()

    try {
        return await ffmpegLoadPromise
    } finally {
        ffmpegLoadPromise = null
    }
}

function createSourceCanvas(frame: QuantizationRecorderFrame) {
    const sourceCanvas = document.createElement("canvas")
    sourceCanvas.width = frame.imageData.width
    sourceCanvas.height = frame.imageData.height
    const sourceCtx = sourceCanvas.getContext("2d")
    if (!sourceCtx) throw new Error("Preview canvas context is unavailable.")
    sourceCtx.putImageData(frame.imageData, 0, 0)
    return sourceCanvas
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
    return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type)
    })
}

function drawFrameIntoCanvas(
    targetCanvas: HTMLCanvasElement,
    frame: GeneratedRecorderFrame,
    targetSize: number
) {
    const ctx = targetCanvas.getContext("2d")
    if (!ctx) return

    if (targetCanvas.width !== targetSize) targetCanvas.width = targetSize
    if (targetCanvas.height !== targetSize) targetCanvas.height = targetSize

    ctx.clearRect(0, 0, targetSize, targetSize)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(frame.sourceCanvas, 0, 0, targetSize, targetSize)
}

function sanitizeAudioExtension(filename: string) {
    const match = /\.[a-z0-9]+$/i.exec(filename)
    return match ? match[0].toLowerCase() : ".mp3"
}

function formatAudioTrackLabel(filename: string | null) {
    if (!filename) return "no file selected"
    const dotIndex = filename.lastIndexOf(".")
    if (dotIndex <= 0 || dotIndex === filename.length - 1) return filename
    const base = filename.slice(0, dotIndex).trim()
    const ext = filename.slice(dotIndex)
    if (base.length <= 10) return filename
    return `${base.slice(0, 10)}....${ext.slice(1)}`
}

function QuantizationRecorderAlert({
    onClose,
}: {
    onClose: () => void
}) {
    const alertBoxWidth = "min(300px, calc(100vw - 48px))"
    const alertBoxHeight = `calc(${alertBoxWidth} * 100 / 300)`

    return (
        <div
            style={{
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
            }}
        >
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    pointerEvents: "auto",
                }}
            >
                <div
                    style={{
                        position: "relative",
                        width: alertBoxWidth,
                        height: alertBoxHeight,
                    }}
                >
                    <div style={{ position: "absolute", inset: 0 }}>
                        <SvgAlertBacking
                            style={{
                                width: "100%",
                                height: "100%",
                                display: "block",
                            }}
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
                            gap: 12,
                            padding: "26px 32px",
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
                                    fontSize: 18,
                                    fontWeight: 900,
                                    letterSpacing: 1,
                                    textAlign: "center",
                                    color: "black",
                                }}
                            >
                                SOMETHING WENT WRONG
                            </div>
                            <div
                                style={{
                                    fontSize: 12,
                                    lineHeight: 1,
                                    fontWeight: 400,
                                    textAlign: "center",
                                    color: "black",
                                }}
                            >
                                Please try again
                            </div>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="OK"
                    className="pxUiAnim"
                    style={okCancelButtonStyle}
                >
                    <SvgOkButton style={okCancelSvgStyle} />
                </button>
            </div>
        </div>
    )
}

function CommittedNumberInput({
    value,
    min,
    max,
    ariaLabel,
    onCommit,
}: {
    value: number
    min: number
    max: number
    ariaLabel: string
    onCommit: (value: number) => void
}) {
    const [draft, setDraft] = React.useState(String(value))

    React.useEffect(() => {
        setDraft(String(value))
    }, [value])

    const commit = React.useCallback(() => {
        const parsed = Number(draft)
        if (!Number.isFinite(parsed)) {
            setDraft(String(value))
            return
        }

        const next = clampInt(parsed, min, max)
        onCommit(next)
        setDraft(String(next))
    }, [draft, max, min, onCommit, value])

    return (
        <input
            className="qrNumberInput"
            aria-label={ariaLabel}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            min={min}
            max={max}
            step={1}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.currentTarget.blur()
                }
                if (e.key === "Escape") {
                    setDraft(String(value))
                    e.currentTarget.blur()
                }
            }}
        />
    )
}

export default function QuantizationRecorder({
    seed,
    onClose,
}: QuantizationRecorderProps) {
    const audioInputRef = React.useRef<HTMLInputElement | null>(null)
    const [includeGridRange, setIncludeGridRange] = React.useState(true)
    const [includePaletteRange, setIncludePaletteRange] = React.useState(true)
    const [gridFrom, setGridFrom] = React.useState(
        Math.max(seed.gridBounds.min, 2)
    )
    const [gridTo, setGridTo] = React.useState(Math.min(seed.gridBounds.max, 128))
    const [gridSingle, setGridSingle] = React.useState(
        Math.max(seed.gridBounds.min, 2)
    )
    const [paletteFrom, setPaletteFrom] = React.useState(
        Math.max(seed.paletteBounds.min, 2)
    )
    const [paletteTo, setPaletteTo] = React.useState(
        Math.min(seed.paletteBounds.max, 32)
    )
    const [paletteSingle, setPaletteSingle] = React.useState(
        Math.max(seed.paletteBounds.min, 2)
    )
    const [direction, setDirection] = React.useState<DirectionMode>("both-ways")
    const [durationSeconds, setDurationSeconds] = React.useState(20)
    const [audioTrackFile, setAudioTrackFile] = React.useState<File | null>(null)
    const [audioTrackLabel, setAudioTrackLabel] = React.useState<string | null>(
        null
    )

    const [frames, setFrames] = React.useState<GeneratedRecorderFrame[]>([])
    const [isPlaying, setIsPlaying] = React.useState(false)
    const [, setIsGenerating] = React.useState(false)
    const [isExporting, setIsExporting] = React.useState(false)
    const [hasEverPlayed, setHasEverPlayed] = React.useState(false)
    const [playbackTimeSec, setPlaybackTimeSec] = React.useState(0)
    const [statusText, setStatusText] = React.useState("Idle")
    const [statusPercent, setStatusPercent] = React.useState<number | null>(
        null
    )
    const [alertMessage, setAlertMessage] = React.useState<string | null>(null)

    const showGenericAlert = React.useCallback(() => {
        setAlertMessage("generic")
    }, [])

    const previewCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
    const framesRef = React.useRef<GeneratedRecorderFrame[]>([])
    const generationRunIdRef = React.useRef(0)
    const generationPromiseRef = React.useRef<Promise<void> | null>(null)
    const playbackTimeRef = React.useRef(0)
    const isExportingRef = React.useRef(false)
    const exportStageRef = React.useRef("Preparing export...")
    const exportDisplayedPercentRef = React.useRef(0)
    const exportPercentRef = React.useRef(0)
    const exportHeartbeatTickRef = React.useRef(0)
    const exportEncodeRef = React.useRef({
        totalFrames: 0,
        lastFrame: 0,
        lastFps: 0,
        lastUpdateAt: 0,
    })

    const safeDurationSeconds = React.useMemo(
        () => Math.max(0.25, durationSeconds),
        [durationSeconds]
    )

    const steps = React.useMemo(
        () =>
            buildRecorderSteps({
                includeGridRange,
                includePaletteRange,
                gridFrom,
                gridTo,
                gridSingle,
                paletteFrom,
                paletteTo,
                paletteSingle,
                direction,
            }),
        [
            includeGridRange,
            includePaletteRange,
            gridFrom,
            gridTo,
            gridSingle,
            paletteFrom,
            paletteTo,
            paletteSingle,
            direction,
        ]
    )

    const previewTargetSize = React.useMemo(() => {
        let max = 1
        for (const step of steps) {
            max = Math.max(max, computeExportSize(step.gridSize))
        }
        return max
    }, [steps])

    const stepDurationSec = React.useMemo(
        () => safeDurationSeconds / Math.max(steps.length, 1),
        [safeDurationSeconds, steps.length]
    )

    const totalDurationSec = React.useMemo(
        () => stepDurationSec * Math.max(steps.length, 1),
        [stepDurationSec, steps.length]
    )

    const currentRequestedFrameIndex = React.useMemo(() => {
        if (steps.length <= 1) return 0
        return Math.min(
            steps.length - 1,
            Math.max(0, Math.floor(playbackTimeSec / stepDurationSec))
        )
    }, [playbackTimeSec, stepDurationSec, steps.length])

    const currentVisibleFrameIndex =
        frames.length <= 0
            ? -1
            : Math.min(currentRequestedFrameIndex, frames.length - 1)

    const readyProgressMax = hasEverPlayed ? Math.max(0, frames.length - 1) : 0
    const progressValue =
        currentVisibleFrameIndex < 0 ? 0 : currentVisibleFrameIndex

    const setPlainStatus = React.useCallback((text: string) => {
        setStatusText(text)
        setStatusPercent(null)
    }, [])

    const invalidatePreview = React.useCallback(() => {
        generationRunIdRef.current += 1
        generationPromiseRef.current = null
        framesRef.current = []
        setIsPlaying(false)
        setIsGenerating(false)
        setFrames([])
        setPlaybackTimeSec(0)
        playbackTimeRef.current = 0
        setHasEverPlayed(false)
        setPlainStatus("Ready")
    }, [setPlainStatus])

    React.useEffect(() => {
        invalidatePreview()
    }, [
        includeGridRange,
        includePaletteRange,
        gridFrom,
        gridTo,
        gridSingle,
        paletteFrom,
        paletteTo,
        paletteSingle,
        direction,
        durationSeconds,
        invalidatePreview,
    ])

    React.useEffect(() => {
        let active = true
        if (QUANTIZATION_EXPORT_DEBUG) {
            console.info("[QuantizationRecorder] Starting ffmpeg preload")
        }
        void ensureFFmpegLoaded()
            .then(() => {
                if (!active) return
                if (QUANTIZATION_EXPORT_DEBUG) {
                    console.info("[QuantizationRecorder] ffmpeg preload completed")
                }
            })
            .catch((error) => {
                if (!active) return
                if (QUANTIZATION_EXPORT_DEBUG) {
                    console.error("[QuantizationRecorder] ffmpeg preload failed", error)
                }
                setPlainStatus("Export unavailable")
            })
        return () => {
            active = false
        }
    }, [setPlainStatus])

    React.useEffect(() => {
        playbackTimeRef.current = playbackTimeSec
    }, [playbackTimeSec])

    React.useEffect(() => {
        framesRef.current = frames
    }, [frames])

    React.useEffect(() => {
        isExportingRef.current = isExporting
    }, [isExporting])

    const updateExportStatus = React.useCallback(
        (stage: string, percent: number, options?: { immediate?: boolean }) => {
            exportStageRef.current = stage
            exportPercentRef.current = percent
            setStatusText(stage)
            if (options?.immediate) {
                exportDisplayedPercentRef.current = percent
                setStatusPercent(percent)
            } else if (statusPercent === null) {
                exportDisplayedPercentRef.current = percent
                setStatusPercent(percent)
            }
        },
        [statusPercent]
    )

    React.useEffect(() => {
        if (!isExporting) return
        const timer = window.setInterval(() => {
            const stage = exportStageRef.current
            const target = exportPercentRef.current
            const current = exportDisplayedPercentRef.current
            let next = current
            const isEncodingStage =
                stage.includes("Encoding MP4") || stage.includes("Building WEBM")
            exportHeartbeatTickRef.current += 1

            if (isEncodingStage) {
                const {
                    totalFrames,
                    lastFrame,
                    lastFps,
                    lastUpdateAt,
                } = exportEncodeRef.current
                if (totalFrames > 0 && lastUpdateAt > 0) {
                    const elapsedSec = Math.max(
                        0,
                        (performance.now() - lastUpdateAt) / 1000
                    )
                    const estimatedFrame = Math.min(
                        totalFrames,
                        lastFrame + elapsedSec * Math.max(0, lastFps)
                    )
                    const estimatedPercent = mapRangeProgress(
                        estimatedFrame / totalFrames,
                        EXPORT_PROGRESS_ENCODE_START,
                        EXPORT_PROGRESS_ENCODE_MAX
                    )
                    exportPercentRef.current = Math.max(
                        exportPercentRef.current,
                        estimatedPercent
                    )
                }
            }

            if (current < target) {
                next = Math.min(
                    target,
                    current + Math.max(1, Math.ceil((target - current) / 5))
                )
            } else if (
                isEncodingStage &&
                current < EXPORT_PROGRESS_ENCODE_MAX &&
                exportHeartbeatTickRef.current % 4 === 0
            ) {
                next = current + 1
            }

            if (next !== current) {
                exportDisplayedPercentRef.current = next
                setStatusPercent(next)
            }
        }, 800)

        return () => {
            window.clearInterval(timer)
        }
    }, [isExporting])

    const exportDebugLog = React.useCallback<RecorderExportDebugLog>(
        (message, payload) => {
            if (!QUANTIZATION_EXPORT_DEBUG) return
            if (payload) {
                console.info("[QuantizationRecorder]", message, payload)
                return
            }
            console.info("[QuantizationRecorder]", message)
        },
        []
    )

    const handleAudioSelection = React.useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ""
            if (!file) return
            try {
                setAudioTrackFile(file)
                setAudioTrackLabel(file.name)
            } catch (error) {
                void error
                showGenericAlert()
            }
        },
        [showGenericAlert]
    )

    const ensureGenerationStarted = React.useCallback(async () => {
        if (generationPromiseRef.current) {
            return generationPromiseRef.current
        }

        const runId = ++generationRunIdRef.current

        const promise = (async () => {
            try {
                setIsGenerating(true)
                if (isExportingRef.current) {
                    updateExportStatus("Preparing export...", 1)
                } else {
                    setPlainStatus("Generating frames...")
                }

                for (
                    let index = framesRef.current.length;
                    index < steps.length;
                    index++
                ) {
                    if (generationRunIdRef.current !== runId) return

                    const frame = await seed.generateFrame(steps[index])
                    if (generationRunIdRef.current !== runId) return

                    const readyFrame: GeneratedRecorderFrame = {
                        ...frame,
                        sourceCanvas: createSourceCanvas(frame),
                    }

                    setFrames((prev) => {
                        const next = [...prev, readyFrame]
                        framesRef.current = next
                        return next
                    })
                    if (isExportingRef.current) {
                        updateExportStatus(
                            "Preparing export...",
                            mapRangeProgress(
                                (index + 1) / Math.max(steps.length, 1),
                                EXPORT_PROGRESS_PREP_MAX,
                                EXPORT_PROGRESS_PNG_MAX
                            )
                        )
                    } else {
                        setPlainStatus(
                            `Generating frames... ${index + 1} / ${steps.length}`
                        )
                    }

                    await new Promise<void>((resolve) => {
                        window.setTimeout(resolve, 0)
                    })
                }

                if (generationRunIdRef.current === runId) {
                    if (isExportingRef.current) {
                        updateExportStatus(
                            "Preparing export...",
                            EXPORT_PROGRESS_PNG_MAX
                        )
                    } else {
                        setPlainStatus("Preview ready")
                    }
                }
            } catch (error) {
                if (generationRunIdRef.current !== runId) return
                void error
                showGenericAlert()
                setPlainStatus("Generation failed")
            } finally {
                if (generationRunIdRef.current === runId) {
                    setIsGenerating(false)
                }
            }
        })()

        generationPromiseRef.current = promise.finally(() => {
            if (generationPromiseRef.current === promise) {
                generationPromiseRef.current = null
            }
        })

        return generationPromiseRef.current
    }, [seed, setPlainStatus, showGenericAlert, steps, updateExportStatus])

    React.useEffect(() => {
        if (!isPlaying) return

        let raf = 0
        let lastTs = performance.now()

        const tick = (ts: number) => {
            const dt = (ts - lastTs) / 1000
            lastTs = ts

            const nextTime = Math.min(
                totalDurationSec,
                playbackTimeRef.current + dt
            )

            playbackTimeRef.current = nextTime
            setPlaybackTimeSec(nextTime)

            if (nextTime >= totalDurationSec) {
                setIsPlaying(false)
                setPlainStatus("Playback finished")
                return
            }

            raf = requestAnimationFrame(tick)
        }

        raf = requestAnimationFrame(tick)
        return () => {
            cancelAnimationFrame(raf)
        }
    }, [isPlaying, setPlainStatus, totalDurationSec])

    React.useEffect(() => {
        const canvas = previewCanvasRef.current
        if (!canvas || currentVisibleFrameIndex < 0) return
        const frame = frames[currentVisibleFrameIndex]
        if (!frame) return
        drawFrameIntoCanvas(canvas, frame, previewTargetSize)
    }, [currentVisibleFrameIndex, frames, previewTargetSize])

    const handlePlay = React.useCallback(() => {
        if (steps.length <= 0) return
        if (playbackTimeRef.current >= totalDurationSec) {
            playbackTimeRef.current = 0
            setPlaybackTimeSec(0)
        }
        setHasEverPlayed(true)
        setIsPlaying(true)
        setPlainStatus("Playing")
        void ensureGenerationStarted()
    }, [ensureGenerationStarted, setPlainStatus, steps.length, totalDurationSec])

    const handleProgressChange = React.useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const nextIndex = clampInt(
                Number(e.currentTarget.value),
                0,
                Math.max(0, frames.length - 1)
            )
            setIsPlaying(false)
            const nextTime =
                steps.length <= 1 ? 0 : nextIndex * stepDurationSec
            playbackTimeRef.current = nextTime
            setPlaybackTimeSec(nextTime)
            setPlainStatus("Preview scrubbed")
        },
        [frames.length, setPlainStatus, stepDurationSec, steps.length]
    )

    const handleToggleGridRange = React.useCallback(() => {
        if (includeGridRange && !includePaletteRange) return
        setIncludeGridRange((prev) => !prev)
    }, [includeGridRange, includePaletteRange])

    const handleTogglePaletteRange = React.useCallback(() => {
        if (includePaletteRange && !includeGridRange) return
        setIncludePaletteRange((prev) => !prev)
    }, [includeGridRange, includePaletteRange])

    const updateGridFrom = React.useCallback(
        (value: number) =>
            setGridFrom(
                clampInt(value, seed.gridBounds.min, seed.gridBounds.max)
            ),
        [seed.gridBounds.max, seed.gridBounds.min]
    )

    const updateGridTo = React.useCallback(
        (value: number) =>
            setGridTo(clampInt(value, seed.gridBounds.min, seed.gridBounds.max)),
        [seed.gridBounds.max, seed.gridBounds.min]
    )

    const updateGridSingle = React.useCallback(
        (value: number) =>
            setGridSingle(
                clampInt(value, seed.gridBounds.min, seed.gridBounds.max)
            ),
        [seed.gridBounds.max, seed.gridBounds.min]
    )

    const updatePaletteFrom = React.useCallback(
        (value: number) =>
            setPaletteFrom(
                clampInt(value, seed.paletteBounds.min, seed.paletteBounds.max)
            ),
        [seed.paletteBounds.max, seed.paletteBounds.min]
    )

    const updatePaletteTo = React.useCallback(
        (value: number) =>
            setPaletteTo(
                clampInt(value, seed.paletteBounds.min, seed.paletteBounds.max)
            ),
        [seed.paletteBounds.max, seed.paletteBounds.min]
    )

    const updatePaletteSingle = React.useCallback(
        (value: number) =>
            setPaletteSingle(
                clampInt(value, seed.paletteBounds.min, seed.paletteBounds.max)
            ),
        [seed.paletteBounds.max, seed.paletteBounds.min]
    )

    const handleExport = React.useCallback(async () => {
        let ffmpegForCleanup: FFmpeg | null = null
        let logListener:
            | ((event: { message: string }) => void)
            | null = null
        let progressListener:
            | ((event: { progress: number; time: number }) => void)
            | null = null
        let earlySaveHandle: SaveFileHandleLike | null = null
        try {
            const expectedFilename = getExportFilename()
            earlySaveHandle = await requestEarlySaveTarget(expectedFilename)
            if (
                typeof window !== "undefined" &&
                window.isSecureContext &&
                typeof (window as SavePickerWindowLike).showSaveFilePicker ===
                    "function" &&
                !earlySaveHandle
            ) {
                return
            }

            exportDebugLog("Handle export invoked", {
                steps: steps.length,
                framesReady: framesRef.current.length,
                durationSeconds: safeDurationSeconds,
                stepDurationSec,
                previewTargetSize,
            })
            setIsPlaying(false)
            setIsExporting(true)
            exportHeartbeatTickRef.current = 0
            exportDisplayedPercentRef.current = 0
            exportPercentRef.current = 0
            exportEncodeRef.current = {
                totalFrames: Math.max(
                    1,
                    Math.round(totalDurationSec * EXPORT_FPS)
                ),
                lastFrame: 0,
                lastFps: 0,
                lastUpdateAt: performance.now(),
            }
            setStatusPercent(0)
            updateExportStatus("Preparing export...", 1, { immediate: true })

            await ensureGenerationStarted()
            if (
                framesRef.current.length < steps.length &&
                generationPromiseRef.current
            ) {
                await generationPromiseRef.current
            }

            const allFrames =
                framesRef.current.length === steps.length
                    ? framesRef.current
                : undefined
            if (!allFrames || allFrames.length !== steps.length) {
                throw new Error("Not all frames are ready for export yet.")
            }

            updateExportStatus("Preparing export...", EXPORT_PROGRESS_PREP_MAX)
            const ffmpeg = await ensureFFmpegLoaded()
            exportDebugLog("FFmpeg instance is ready")
            ffmpegForCleanup = ffmpeg
            updateExportStatus("Preparing export...", EXPORT_PROGRESS_PNG_MAX)

            logListener = ({ message }: { message: string }) => {
                const clean = message.trim()
                if (!clean) return
                const encodeMatch = clean.match(
                    /frame=\s*(\d+).*?fps=\s*([0-9.]+)/
                )
                if (encodeMatch) {
                    const nextFrame = Number(encodeMatch[1] ?? 0)
                    const nextFps = Number(encodeMatch[2] ?? 0)
                    exportEncodeRef.current = {
                        ...exportEncodeRef.current,
                        lastFrame: Number.isFinite(nextFrame) ? nextFrame : 0,
                        lastFps: Number.isFinite(nextFps) ? nextFps : 0,
                        lastUpdateAt: performance.now(),
                    }
                    updateExportStatus(
                        exportStageRef.current,
                        mapRangeProgress(
                            exportEncodeRef.current.lastFrame /
                                Math.max(1, exportEncodeRef.current.totalFrames),
                            EXPORT_PROGRESS_ENCODE_START,
                            EXPORT_PROGRESS_ENCODE_MAX
                        )
                    )
                }
                if (QUANTIZATION_EXPORT_DEBUG) {
                    console.info("[QuantizationRecorder][ffmpeg-log]", clean)
                }
            }
            progressListener = ({
                progress,
                time,
            }: {
                progress: number
                time: number
            }) => {
                const ffmpegProgress =
                    Number.isFinite(progress) && progress > 0
                        ? progress
                        : totalDurationSec > 0
                          ? time / totalDurationSec
                          : 0
                updateExportStatus(
                    exportStageRef.current,
                    mapRangeProgress(
                        ffmpegProgress,
                        EXPORT_PROGRESS_ENCODE_START,
                        88
                    )
                )
                if (QUANTIZATION_EXPORT_DEBUG) {
                    console.info("[QuantizationRecorder][ffmpeg-progress]", {
                        progress,
                        time,
                    })
                }
            }

            ffmpeg.on("log", logListener)
            ffmpeg.on("progress", progressListener)

            const pngFrames: RecorderExportPngFrame[] = []
            for (let i = 0; i < allFrames.length; i++) {
                const pngCanvas = document.createElement("canvas")
                drawFrameIntoCanvas(pngCanvas, allFrames[i], previewTargetSize)
                const pngBlob = await canvasToBlob(pngCanvas, "image/png")
                if (!pngBlob) {
                    throw new Error("A frame could not be encoded as PNG.")
                }

                pngFrames.push({
                    name: `frame-${String(i).padStart(5, "0")}.png`,
                    bytes: new Uint8Array(await pngBlob.arrayBuffer()),
                })
                updateExportStatus(
                    "Preparing export...",
                    mapRangeProgress(
                        (i + 1) / Math.max(allFrames.length, 1),
                        EXPORT_PROGRESS_PNG_MAX,
                        56
                    )
                )
            }
            exportDebugLog("All PNG frames prepared", {
                count: pngFrames.length,
                firstFrame: pngFrames[0]?.name ?? null,
                lastFrame: pngFrames[pngFrames.length - 1]?.name ?? null,
            })

            const exportAudioTrack: RecorderExportAudioTrack | null =
                audioTrackFile
                    ? {
                          name: `audio-track${sanitizeAudioExtension(audioTrackFile.name)}`,
                          bytes: await fetchFile(audioTrackFile),
                      }
                    : null

            if (exportAudioTrack) {
                exportDebugLog("Fresh audio track bytes prepared for export", {
                    name: exportAudioTrack.name,
                    bytes: exportAudioTrack.bytes.byteLength,
                })
            }

            const exportParams = {
                ffmpeg,
                pngFrames,
                frameDurationSec: stepDurationSec,
                fps: EXPORT_FPS,
                videoDurationSec: totalDurationSec,
                onStageChange: (stage: string) => {
                    updateExportStatus(
                        stage,
                        Math.max(
                            exportPercentRef.current,
                            EXPORT_PROGRESS_PNG_MAX
                        )
                    )
                    exportDebugLog("Stage changed", { stage })
                },
                onDebugLog: exportDebugLog,
                ...(exportAudioTrack
                    ? {
                          audioTrack: exportAudioTrack,
                          audioFadeSec: Math.min(
                              AUDIO_FADE_SECONDS,
                              Math.max(0.1, totalDurationSec / 3)
                          ),
                      }
                    : {}),
            }

            const exportResult: RecorderExportResult =
                await runQuantizationExportPipeline({
                    ...exportParams,
                    enableMp4Conversion: ENABLE_MP4_CONVERSION,
                })
            exportDebugLog("Export pipeline produced output bytes", {
                bytes: exportResult.bytes.byteLength,
                format: exportResult.format,
            })

            const outputBytes = new Uint8Array(exportResult.bytes)
            const outputBlob = new Blob([outputBytes], {
                type: exportResult.mimeType,
            })

            updateExportStatus("Finalizing file...", 99, { immediate: true })
            const wroteToPickedTarget = earlySaveHandle
                ? await writeBlobToSaveTarget(earlySaveHandle, outputBlob)
                : false

            if (!wroteToPickedTarget) {
                await seed.saveBlob(
                    async () => outputBlob,
                    exportResult.filename
                )
            }

            updateExportStatus(
                exportResult.format === "webm"
                    ? "WEBM export finished"
                    : "Export finished",
                100,
                { immediate: true }
            )
        } catch (error) {
            if (QUANTIZATION_EXPORT_DEBUG) {
                console.error("[QuantizationRecorder] Export failed", error)
            }
            showGenericAlert()
            setPlainStatus("Export failed")
        } finally {
            if (ffmpegForCleanup && logListener) {
                ffmpegForCleanup.off("log", logListener)
            }
            if (ffmpegForCleanup && progressListener) {
                ffmpegForCleanup.off("progress", progressListener)
            }
            setIsExporting(false)
        }
    }, [
        ensureGenerationStarted,
        exportDebugLog,
        audioTrackFile,
        previewTargetSize,
        safeDurationSeconds,
        seed,
        stepDurationSec,
        totalDurationSec,
        steps.length,
        setPlainStatus,
        showGenericAlert,
        updateExportStatus,
    ])

    const cardStyle: React.CSSProperties = {
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: PANEL_RADIUS,
        padding: "30px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        boxSizing: "border-box",
    }

    const cardTitleStyle: React.CSSProperties = {
        color: TEXT_LIGHT,
        fontSize: 24,
        lineHeight: 1,
        fontWeight: 900,
        textTransform: "uppercase",
    }

    const minorLabelStyle: React.CSSProperties = {
        color: TEXT_LIGHT,
        fontSize: 15,
        fontWeight: 900,
        textTransform: "uppercase",
        lineHeight: 1,
    }

    const inlineValueGroupStyle: React.CSSProperties = {
        display: "grid",
        gridTemplateColumns: "auto 80px auto 80px",
        justifyContent: "start",
        alignItems: "center",
        columnGap: 14,
        rowGap: 15,
    }

    const singleValueGroupStyle: React.CSSProperties = {
        display: "grid",
        gridTemplateColumns: "auto 80px auto",
        alignItems: "center",
        justifyContent: "start",
        columnGap: 14,
        rowGap: 15,
    }

    const optionLabelStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: TEXT_LIGHT,
        fontSize: 16,
        fontWeight: 900,
        lineHeight: 1,
        textTransform: "uppercase",
        cursor: "pointer",
    }

    const checkboxHeaderLabelStyle: React.CSSProperties = {
        ...optionLabelStyle,
        fontSize: cardTitleStyle.fontSize,
    }

    const FieldInput = ({
        value,
        onCommit,
        min,
        max,
        ariaLabel,
    }: {
        value: number
        onCommit: (value: number) => void
        min: number
        max: number
        ariaLabel: string
    }) => (
        <CommittedNumberInput
            ariaLabel={ariaLabel}
            value={value}
            min={min}
            max={max}
            onCommit={onCommit}
        />
    )

    const PreviewOverlayButton = ({
        visible,
        onClick,
    }: {
        visible: boolean
        onClick: () => void
    }) =>
        visible ? (
            <button
                type="button"
                onClick={onClick}
                aria-label="Play preview"
                style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 166,
                    height: 166,
                    borderRadius: "50%",
                    border: "4px solid rgba(255,255,255,0.98)",
                    background: "rgba(255,255,255,0.28)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                }}
            >
                <div
                    style={{
                        width: 0,
                        height: 0,
                        borderTop: "34px solid transparent",
                        borderBottom: "34px solid transparent",
                        borderLeft: "54px solid #031219",
                        marginLeft: 12,
                    }}
                />
            </button>
        ) : null

    const statusDisplayText =
        statusPercent == null
            ? statusText
            : `${statusText} ${Math.round(statusPercent)}%`

    return (
        <>
            <FitToViewport background={SURFACE_BG}>
                {(fitScale) => {
                    const bottomButtonsCompensationScale =
                        fitScale > 1e-6 ? 1 / fitScale : 1

                    const bottomActionButtonStyle: React.CSSProperties = {
                        ...okCancelButtonStyle,
                        width: 50 * bottomButtonsCompensationScale,
                        height: 50 * bottomButtonsCompensationScale,
                        marginTop: 18 * bottomButtonsCompensationScale,
                        marginLeft: 14 * bottomButtonsCompensationScale,
                        marginRight: 14 * bottomButtonsCompensationScale,
                    }

                    return (
                <>
                <style>{SMART_UI_BUTTON_ANIM_CSS}</style>
                <div
                    style={{
                        width: PORTRAIT_WIDTH,
                        minHeight: 1330,
                        padding: 24,
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        gap: 24,
                        fontFamily:
                            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }}
                >
                    <div
                        style={{
                            width: PREVIEW_SIZE,
                            alignSelf: "center",
                            display: "flex",
                            flexDirection: "column",
                            gap: 24,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                            }}
                        >
                            <div
                                style={{
                                    width: PREVIEW_SIZE,
                                    height: PREVIEW_SIZE,
                                    background: "#0b2027",
                                    border: "4px solid rgba(255,255,255,0.98)",
                                    position: "relative",
                                    overflow: "hidden",
                                }}
                            >
                                {currentVisibleFrameIndex >= 0 ? (
                                    <canvas
                                        ref={previewCanvasRef}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            imageRendering: "pixelated",
                                            display: "block",
                                            background: "#0b2027",
                                        }}
                                    />
                                ) : (
                                    <div
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            position: "relative",
                                            color: TEXT_MUTED,
                                            fontSize: 28,
                                            fontWeight: 800,
                                            textAlign: "center",
                                            padding: 32,
                                            boxSizing: "border-box",
                                            background: "#0b2027",
                                        }}
                                    >
                                        <span
                                            style={{
                                                position: "absolute",
                                                left: "50%",
                                                top: "50%",
                                                transform: "translate(-50%, 113px)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            Press Play to generate preview
                                        </span>
                                    </div>
                                )}
                                <PreviewOverlayButton
                                    visible={!isPlaying}
                                    onClick={handlePlay}
                                />
                            </div>

                            <div
                                style={{
                                    width: PREVIEW_SIZE,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 20,
                                    marginTop: 30,
                                }}
                            >
                                <input
                                    className="qrProgress"
                                    type="range"
                                    min={0}
                                    max={Math.max(0, readyProgressMax)}
                                    step={1}
                                    value={Math.min(progressValue, readyProgressMax)}
                                    onChange={handleProgressChange}
                                    disabled={!hasEverPlayed || frames.length === 0}
                                    style={
                                        {
                                            "--qr-progress-pct": `${
                                                readyProgressMax > 0
                                                    ? (Math.min(
                                                          progressValue,
                                                          readyProgressMax
                                                      ) /
                                                          readyProgressMax) *
                                                      100
                                                    : 0
                                            }%`,
                                        } as React.CSSProperties
                                    }
                                />
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        color: TEXT_DIM,
                                        fontSize: 18,
                                        fontWeight: 800,
                                        textTransform: "uppercase",
                                    }}
                                >
                                    <span>
                                        {steps[Math.max(0, currentVisibleFrameIndex)]
                                            ? `Grid ${steps[Math.max(0, currentVisibleFrameIndex)].gridSize}`
                                            : "Grid -"}
                                    </span>
                                    <span>
                                        {steps[Math.max(0, currentVisibleFrameIndex)]
                                            ? `Palette ${steps[Math.max(0, currentVisibleFrameIndex)].paletteSize}`
                                            : "Palette -"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                width: PREVIEW_SIZE,
                                gridTemplateColumns: "1fr 1fr",
                                gap: 28,
                            }}
                        >
                        <div style={cardStyle}>
                            <label style={checkboxHeaderLabelStyle}>
                                <input
                                    className="qrToggle"
                                    type="checkbox"
                                    checked={includeGridRange}
                                    onChange={handleToggleGridRange}
                                />
                                Grid Size
                            </label>
                            <div
                                style={
                                    includeGridRange
                                        ? inlineValueGroupStyle
                                        : singleValueGroupStyle
                                }
                            >
                                <span style={minorLabelStyle}>From</span>
                                <FieldInput
                                    ariaLabel="Grid value"
                                    value={includeGridRange ? gridFrom : gridSingle}
                                    onCommit={
                                        includeGridRange ? updateGridFrom : updateGridSingle
                                    }
                                    min={seed.gridBounds.min}
                                    max={seed.gridBounds.max}
                                />
                                {includeGridRange ? (
                                    <>
                                        <span style={minorLabelStyle}>To</span>
                                        <FieldInput
                                            ariaLabel="Grid end value"
                                            value={gridTo}
                                            onCommit={updateGridTo}
                                            min={seed.gridBounds.min}
                                            max={seed.gridBounds.max}
                                        />
                                    </>
                                ) : (
                                    <span style={{ ...minorLabelStyle, opacity: 0.68 }}>
                                        Fixed
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={cardStyle}>
                            <label style={checkboxHeaderLabelStyle}>
                                <input
                                    className="qrToggle"
                                    type="checkbox"
                                    checked={includePaletteRange}
                                    onChange={handleTogglePaletteRange}
                                />
                                Palette Size
                            </label>
                            <div
                                style={
                                    includePaletteRange
                                        ? inlineValueGroupStyle
                                        : singleValueGroupStyle
                                }
                            >
                                <span style={minorLabelStyle}>From</span>
                                <FieldInput
                                    ariaLabel="Palette value"
                                    value={includePaletteRange ? paletteFrom : paletteSingle}
                                    onCommit={
                                        includePaletteRange
                                            ? updatePaletteFrom
                                            : updatePaletteSingle
                                    }
                                    min={seed.paletteBounds.min}
                                    max={seed.paletteBounds.max}
                                />
                                {includePaletteRange ? (
                                    <>
                                        <span style={minorLabelStyle}>To</span>
                                        <FieldInput
                                            ariaLabel="Palette end value"
                                            value={paletteTo}
                                            onCommit={updatePaletteTo}
                                            min={seed.paletteBounds.min}
                                            max={seed.paletteBounds.max}
                                        />
                                    </>
                                ) : (
                                    <span style={{ ...minorLabelStyle, opacity: 0.68 }}>
                                        Fixed
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={cardStyle}>
                            <div style={cardTitleStyle}>Direction</div>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 16,
                                    marginTop: "auto",
                                }}
                            >
                                <label
                                    style={optionLabelStyle}
                                    onClick={() => setDirection("one-way")}
                                >
                                    <input
                                        className="qrToggle"
                                        type="radio"
                                        name="qr-direction"
                                        checked={direction === "one-way"}
                                        onChange={() => setDirection("one-way")}
                                    />
                                    One Way
                                </label>
                                <label
                                    style={optionLabelStyle}
                                    onClick={() => setDirection("both-ways")}
                                >
                                    <input
                                        className="qrToggle"
                                        type="radio"
                                        name="qr-direction"
                                        checked={direction === "both-ways"}
                                        onChange={() => setDirection("both-ways")}
                                    />
                                    Both Ways
                                </label>
                            </div>
                        </div>

                        <div style={cardStyle}>
                            <div style={cardTitleStyle}>Duration</div>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "80px auto",
                                    justifyContent: "start",
                                    alignItems: "center",
                                    columnGap: 16,
                                }}
                            >
                                <FieldInput
                                    ariaLabel="Duration seconds"
                                    value={durationSeconds}
                                    onCommit={(value) =>
                                        setDurationSeconds(Math.max(0.25, value))
                                    }
                                    min={1}
                                    max={600}
                                />
                                <span style={minorLabelStyle}>Seconds</span>
                            </div>
                        </div>

                        <div
                            style={{
                                ...cardStyle,
                                gridColumn: "1 / -1",
                                display: "grid",
                                gridTemplateColumns: "1.05fr 1fr 0.92fr",
                                alignItems: "center",
                                columnGap: 20,
                            }}
                        >
                            <div style={cardTitleStyle}>Audio Track</div>
                            <button
                                type="button"
                                onClick={() => audioInputRef.current?.click()}
                                style={{
                                    width: 200,
                                    padding: "20px 0",
                                    border: "none",
                                    borderRadius: 8,
                                    background: "#ffffff",
                                    color: "#031219",
                                    fontSize: 16,
                                    fontWeight: 900,
                                    lineHeight: 1,
                                    textTransform: "uppercase",
                                    cursor: "pointer",
                                }}
                            >
                                Open File...
                            </button>
                            <div
                                style={{
                                    color: TEXT_LIGHT,
                                    fontSize: 16,
                                    fontWeight: 900,
                                    lineHeight: 1,
                                    textAlign: "left",
                                    alignSelf: "center",
                                }}
                            >
                                {formatAudioTrackLabel(audioTrackLabel)}
                            </div>
                        </div>
                        </div>

                        <div
                            style={{
                                width: PREVIEW_SIZE,
                                minHeight: 58,
                                display: "flex",
                                alignItems: "baseline",
                                gap: 18,
                            }}
                        >
                            <div style={cardTitleStyle}>Status:</div>
                            <div
                                style={{
                                    color: TEXT_GREEN,
                                    fontSize: 18,
                                    fontWeight: 900,
                                    textTransform: "uppercase",
                                    lineHeight: 1,
                                }}
                            >
                                {statusDisplayText}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 16,
                            paddingTop: 4,
                        }}
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Cancel"
                            className="pxUiAnim"
                            style={bottomActionButtonStyle}
                        >
                            <SvgCancelButton style={okCancelSvgStyle} />
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="OK"
                            className="pxUiAnim"
                            style={bottomActionButtonStyle}
                        >
                            <SvgOkButton style={okCancelSvgStyle} />
                        </button>

                        <button
                            type="button"
                            onClick={() => void handleExport()}
                            disabled={isExporting}
                            aria-label="Export"
                            className="pxUiAnim"
                            style={{
                                ...bottomActionButtonStyle,
                                opacity: isExporting ? 0.45 : 1,
                                cursor: isExporting ? "default" : "pointer",
                            }}
                        >
                            <SvgExportSOButton style={okCancelSvgStyle} />
                        </button>
                    </div>
                </div>
                </>
                    )
                }}
            </FitToViewport>

            <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                style={{ display: "none" }}
                onChange={(event) => void handleAudioSelection(event)}
            />

            {alertMessage && (
                <QuantizationRecorderAlert
                    onClose={() => setAlertMessage(null)}
                />
            )}
        </>
    )
}

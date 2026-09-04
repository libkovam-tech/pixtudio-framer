import * as React from "react"

import {
    SvgCancelButton,
    SvgClipboardPromptBacking,
    SvgOkButton,
} from "./SvgIcons.tsx"
import { ImportActivitySpinner } from "./ImportActivitySpinner.tsx"
import {
    PIXTUDIO_ACTION_BUTTON_SIDE_MARGIN,
    PIXTUDIO_ACTION_BUTTON_VISIBLE_GAP,
    PIXTUDIO_ACTION_BUTTON_VISIBLE_SIZE,
    getViewportCompensatedActionButtonStyle,
    getViewportCompensatedPx,
} from "./viewportActionButtons.ts"

export const CLIPBOARD_PALETTE_CANDIDATE =
    import.meta.env.VITE_CLIPBOARD_PALETTE_CANDIDATE !== "false"
export const RESET_ANDROID_CLIPBOARD_PALETTE_SUPPRESSION_ON_TAB_HIDDEN = true

export type ClipboardPaletteImportRequest = {
    file: File
    displayName?: string
}

export type ClipboardPaletteCandidateTriggerReason =
    | "focus"
    | "visibility"
    | "eligibility"

export type ClipboardPaletteCandidateEventTarget = {
    addEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject
    ) => void
    removeEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject
    ) => void
}

export type ClipboardPaletteCandidateDocumentTarget =
    ClipboardPaletteCandidateEventTarget & {
        visibilityState?: DocumentVisibilityState
        hasFocus?: () => boolean
    }

export type ClipboardPaletteClipboardItem = {
    types: ReadonlyArray<string>
    getType: (type: string) => Promise<Blob>
}

export type ClipboardPaletteRead = () => Promise<
    ReadonlyArray<ClipboardPaletteClipboardItem>
>

export type ClipboardPaletteBrowserBrand = {
    brand: string
}

export type ClipboardPaletteCandidateEnvironment = {
    browserBrands?: ReadonlyArray<ClipboardPaletteBrowserBrand>
    userAgent?: string
    isSecureContext?: boolean
    clipboardRead?: ClipboardPaletteRead
    documentTarget?: ClipboardPaletteCandidateDocumentTarget
}

export type ClipboardPaletteCandidateDetection = {
    mimeType: string
    size: number
    fingerprint: string
}

type ClipboardPaletteCandidatePayload = ClipboardPaletteCandidateDetection & {
    blob: Blob
}

export type ClipboardPaletteCandidateDetectionSession = {
    isHandled: (fingerprint: string) => boolean
    markHandled: (fingerprint: string) => void
    reset: () => void
}

type ClipboardPaletteCandidateDiagnostic = {
    label: string
    details?: string
}

type ClipboardPaletteCandidateDiagnosticSink = (
    diagnostic: ClipboardPaletteCandidateDiagnostic
) => void

export type ClipboardPaletteCandidateLifecycleOptions = {
    isEligible: () => boolean
    inspectClipboard?: (
        reason: ClipboardPaletteCandidateTriggerReason
    ) => Promise<void> | void
    onHidden?: () => void
    windowTarget?: ClipboardPaletteCandidateEventTarget
    documentTarget?: ClipboardPaletteCandidateDocumentTarget
}

export type ClipboardPaletteCandidateProps = {
    isEligible: boolean
    isMobileUI?: boolean
    onImportPalette: (
        request: ClipboardPaletteImportRequest
    ) => Promise<void> | void
    onCandidateUiVisibilityChange?: (isVisible: boolean) => void
    clipboardRead?: ClipboardPaletteRead
    isSecureContext?: boolean
    documentTarget?: ClipboardPaletteCandidateDocumentTarget
    windowTarget?: ClipboardPaletteCandidateEventTarget
    viewportScale?: number
}

type ClipboardPaletteCandidateMountProps = ClipboardPaletteCandidateProps & {
    featureFlag?: boolean
}

export function shouldMountClipboardPaletteCandidate(
    featureFlag = CLIPBOARD_PALETTE_CANDIDATE
) {
    return featureFlag
}

export function createClipboardPaletteCandidateDetectionSession():
    ClipboardPaletteCandidateDetectionSession {
    const handledFingerprints = new Set<string>()

    return {
        isHandled(fingerprint: string) {
            return handledFingerprints.has(fingerprint)
        },
        markHandled(fingerprint: string) {
            handledFingerprints.add(fingerprint)
        },
        reset() {
            handledFingerprints.clear()
        },
    }
}

function findImageClipboardType(item: ClipboardPaletteClipboardItem) {
    return item.types.find((type) => type.toLowerCase().startsWith("image/"))
}

function bytesToHex(bytes: Uint8Array) {
    return [...bytes]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
}

async function readBlobSample(blob: Blob, start: number, length: number) {
    const buffer = await blob.slice(start, start + length).arrayBuffer()
    return bytesToHex(new Uint8Array(buffer))
}

export async function makeClipboardPaletteFingerprint(input: {
    blob: Blob
    mimeType: string
    sampleSize?: number
}) {
    const sampleSize = input.sampleSize ?? 32
    const size = input.blob.size
    const starts =
        size <= sampleSize
            ? [0]
            : [
                  0,
                  Math.max(0, Math.floor((size - sampleSize) / 2)),
                  Math.max(0, size - sampleSize),
              ]

    const uniqueStarts = [...new Set(starts)]
    const samples = await Promise.all(
        uniqueStarts.map((start) =>
            readBlobSample(input.blob, start, Math.min(sampleSize, size - start))
        )
    )

    return `${input.mimeType};size=${size};samples=${samples.join(".")}`
}

async function readClipboardPaletteCandidatePayload(input: {
    readClipboard: ClipboardPaletteRead
    onDiagnostic?: ClipboardPaletteCandidateDiagnosticSink
    inspectNonImagePayload?: boolean
}): Promise<ClipboardPaletteCandidatePayload | null> {
    try {
        input.onDiagnostic?.({ label: "read:start" })
        const items = await input.readClipboard()
        input.onDiagnostic?.({
            label: "read:items",
            details: String(items.length),
        })
        for (const item of items) {
            input.onDiagnostic?.({
                label: "item:types",
                details: item.types.join(", ") || "(none)",
            })
            const mimeType = findImageClipboardType(item)
            if (!mimeType) continue
            input.onDiagnostic?.({ label: "item:image-type", details: mimeType })

            const blob = await item.getType(mimeType)
            input.onDiagnostic?.({
                label: "blob",
                details: `${blob.type || "(no type)"} ${blob.size}b`,
            })
            const fingerprint = await makeClipboardPaletteFingerprint({
                blob,
                mimeType,
            })
            input.onDiagnostic?.({
                label: "fingerprint",
                details: `${mimeType} ${blob.size}b`,
            })

            return {
                blob,
                mimeType,
                size: blob.size,
                fingerprint,
            }
        }

        if (input.inspectNonImagePayload) {
            await inspectFirstNonImageClipboardPayload({
                items,
                onDiagnostic: input.onDiagnostic,
            })
        }
    } catch {
        input.onDiagnostic?.({ label: "read:error" })
        return null
    }

    input.onDiagnostic?.({ label: "read:no-image" })
    return null
}

export async function detectClipboardPaletteCandidate(input: {
    readClipboard: ClipboardPaletteRead
    session?: ClipboardPaletteCandidateDetectionSession
    onDiagnostic?: ClipboardPaletteCandidateDiagnosticSink
    inspectNonImagePayload?: boolean
}): Promise<ClipboardPaletteCandidateDetection | null> {
    const payload = await readClipboardPaletteCandidatePayload({
        readClipboard: input.readClipboard,
        onDiagnostic: input.onDiagnostic,
        inspectNonImagePayload: input.inspectNonImagePayload,
    })
    if (!payload) return null
    if (input.session?.isHandled(payload.fingerprint)) {
        input.onDiagnostic?.({ label: "detect:suppressed" })
        return null
    }
    input.onDiagnostic?.({ label: "detect:candidate" })

    return {
        mimeType: payload.mimeType,
        size: payload.size,
        fingerprint: payload.fingerprint,
    }
}

export function getClipboardPaletteReadCapability(
    environment: ClipboardPaletteCandidateEnvironment
): ClipboardPaletteRead | null {
    if (!isChromiumClipboardPaletteBrowser(environment.browserBrands)) return null
    if (!environment.isSecureContext) return null
    if (environment.documentTarget?.hasFocus?.() === false) return null

    return environment.clipboardRead ?? null
}

export function isChromiumClipboardPaletteBrowser(
    browserBrands: ReadonlyArray<ClipboardPaletteBrowserBrand> | undefined
) {
    return Boolean(
        browserBrands?.some((item) => {
            const brand = item.brand.toLowerCase()
            return (
                brand === "chromium" ||
                brand === "google chrome" ||
                brand === "microsoft edge"
            )
        })
    )
}

export function isAndroidChromiumClipboardPaletteBrowser(input: {
    browserBrands?: ReadonlyArray<ClipboardPaletteBrowserBrand>
    userAgent?: string
}) {
    return (
        isChromiumClipboardPaletteBrowser(input.browserBrands) &&
        /\bAndroid\b/i.test(input.userAgent ?? "")
    )
}

export function shouldResetAndroidClipboardPaletteSuppressionOnTabHidden(
    environment: ClipboardPaletteCandidateEnvironment,
    featureFlag = RESET_ANDROID_CLIPBOARD_PALETTE_SUPPRESSION_ON_TAB_HIDDEN
) {
    return (
        featureFlag &&
        isAndroidChromiumClipboardPaletteBrowser(environment)
    )
}

function sanitizeClipboardTextPreview(text: string) {
    return [...text]
        .map((char) => {
            const code = char.charCodeAt(0)
            return code < 32 || code === 127 ? " " : char
        })
        .join("")
        .slice(0, 80)
}

function describeClipboardTextPayload(text: string) {
    const trimmed = text.trim()
    const markers = [
        trimmed.startsWith("data:image/") ? "data:image" : null,
        /^https?:\/\//i.test(trimmed) ? "http" : null,
        trimmed.startsWith("content://") ? "content://" : null,
        trimmed.startsWith("file://") ? "file://" : null,
        /<img\b/i.test(trimmed) ? "<img" : null,
    ].filter((marker): marker is string => Boolean(marker))

    return [
        markers.length > 0 ? `markers=${markers.join("|")}` : "markers=none",
        `preview=${sanitizeClipboardTextPreview(trimmed)}`,
    ].join(" ")
}

async function inspectFirstNonImageClipboardPayload(input: {
    items: ReadonlyArray<ClipboardPaletteClipboardItem>
    onDiagnostic?: ClipboardPaletteCandidateDiagnosticSink
}) {
    for (const item of input.items) {
        const type = item.types.find(
            (candidate) => !candidate.toLowerCase().startsWith("image/")
        )
        if (!type) continue

        input.onDiagnostic?.({ label: "non-image:type", details: type })
        try {
            const blob = await item.getType(type)
            input.onDiagnostic?.({
                label: "non-image:blob",
                details: `${blob.type || "(no type)"} ${blob.size}b`,
            })
            if (type.toLowerCase() === "text/plain") {
                input.onDiagnostic?.({
                    label: "non-image:text",
                    details: describeClipboardTextPayload(await blob.text()),
                })
            }
        } catch {
            input.onDiagnostic?.({ label: "non-image:error", details: type })
        }
        return
    }

    input.onDiagnostic?.({ label: "non-image:none" })
}

function getBrowserClipboardPaletteEnvironment():
    ClipboardPaletteCandidateEnvironment {
    const nav = typeof navigator === "undefined" ? undefined : navigator
    const navWithUserAgentData = nav as
        | (Navigator & {
              userAgentData?: {
                  brands?: ReadonlyArray<ClipboardPaletteBrowserBrand>
              }
          })
        | undefined
    const clipboardRead =
        nav?.clipboard && "read" in nav.clipboard
            ? () => nav.clipboard.read() as Promise<ClipboardItem[]>
            : undefined

    return {
        browserBrands: navWithUserAgentData?.userAgentData?.brands,
        userAgent: nav?.userAgent,
        isSecureContext:
            typeof window === "undefined" ? false : window.isSecureContext,
        clipboardRead,
        documentTarget:
            typeof document === "undefined" ? undefined : document,
    }
}

const promptContainerStyle: React.CSSProperties = {
    width: "100%",
    position: "relative",
    zIndex: 20,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: 8,
    pointerEvents: "none",
}

const promptBackingFrameStyle: React.CSSProperties = {
    position: "relative",
    width: "min(420px, 74vw)",
    aspectRatio: "710.6 / 88.3",
    filter: "drop-shadow(0 4px 0 rgba(0, 0, 0, 0.18))",
}

const promptBackingStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
}

const promptTextStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#001219",
    fontWeight: 900,
    lineHeight: 1,
    textAlign: "center",
    textTransform: "uppercase",
    pointerEvents: "none",
}

const promptActionsStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
    pointerEvents: "auto",
}

const promptButtonStyle: React.CSSProperties = {
    width: PIXTUDIO_ACTION_BUTTON_VISIBLE_SIZE,
    height: PIXTUDIO_ACTION_BUTTON_VISIBLE_SIZE,
    padding: 0,
    border: 0,
    background: "transparent",
    cursor: "pointer",
    marginTop: 18,
    marginLeft: PIXTUDIO_ACTION_BUTTON_SIDE_MARGIN,
    marginRight: PIXTUDIO_ACTION_BUTTON_SIDE_MARGIN,
    touchAction: "manipulation",
    display: "block",
}

const promptIconStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "block",
}

const clipboardActivitySpinnerStyle: React.CSSProperties = {
    width: "100%",
    position: "relative",
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 92,
    pointerEvents: "none",
}

export function dismissClipboardPaletteDetectedCandidate(input: {
    candidate: ClipboardPaletteCandidateDetection | null
    session: ClipboardPaletteCandidateDetectionSession
}) {
    if (!input.candidate) return null

    input.session.markHandled(input.candidate.fingerprint)
    return null
}

function formatLocalDateForClipboardDisplayName(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

export function makeClipboardPaletteDisplayName(date = new Date()) {
    return `Clipboard image_${formatLocalDateForClipboardDisplayName(date)}`
}

function getClipboardImageExtension(mimeType: string) {
    const normalized = mimeType.toLowerCase()
    if (normalized === "image/jpeg") return "jpg"
    if (normalized === "image/png") return "png"
    if (normalized === "image/webp") return "webp"
    if (normalized === "image/gif") return "gif"
    if (normalized === "image/bmp") return "bmp"
    if (normalized === "image/svg+xml") return "svg"
    return "image"
}

function makeClipboardImageSyntheticFileName(mimeType: string) {
    return `clipboard-image.${getClipboardImageExtension(mimeType)}`
}

export async function acceptClipboardPaletteDetectedCandidate(input: {
    candidate: ClipboardPaletteCandidateDetection | null
    session: ClipboardPaletteCandidateDetectionSession
    readClipboard: ClipboardPaletteRead | null
    now?: Date
    onDiagnostic?: ClipboardPaletteCandidateDiagnosticSink
}): Promise<ClipboardPaletteImportRequest | null> {
    if (!input.candidate) {
        input.onDiagnostic?.({ label: "accept:no-candidate" })
        return null
    }

    input.session.markHandled(input.candidate.fingerprint)
    input.onDiagnostic?.({ label: "accept:handled-detected" })
    if (!input.readClipboard) {
        input.onDiagnostic?.({ label: "accept:no-capability" })
        return null
    }

    const payload = await readClipboardPaletteCandidatePayload({
        readClipboard: input.readClipboard,
        onDiagnostic: input.onDiagnostic,
    })
    if (!payload) {
        input.onDiagnostic?.({ label: "accept:no-payload" })
        return null
    }

    input.session.markHandled(payload.fingerprint)
    input.onDiagnostic?.({
        label: "accept:file",
        details: `${payload.mimeType} ${payload.size}b`,
    })
    return {
        file: new File(
            [payload.blob],
            makeClipboardImageSyntheticFileName(payload.mimeType),
            { type: payload.mimeType }
        ),
        displayName: makeClipboardPaletteDisplayName(input.now),
    }
}

export function ClipboardPalettePrompt({
    isMobileUI = false,
    onAccept,
    onDismiss,
    viewportScale = 1,
}: {
    isMobileUI?: boolean
    onAccept: () => void
    onDismiss: () => void
    viewportScale?: number
}) {
    const actionButtonStyle = getViewportCompensatedActionButtonStyle(
        promptButtonStyle,
        viewportScale
    )
    const actionButtonGap = getViewportCompensatedPx(
        PIXTUDIO_ACTION_BUTTON_VISIBLE_GAP,
        viewportScale
    )

    return (
        <div
            aria-label="Clipboard palette import"
            role="dialog"
            style={promptContainerStyle}
        >
            <div style={promptBackingFrameStyle}>
                <SvgClipboardPromptBacking
                    ariaLabel="Clipboard prompt backing"
                    style={promptBackingStyle}
                />
                <span
                    style={{
                        ...promptTextStyle,
                        fontSize: isMobileUI ? 13 : 20,
                    }}
                >
                    LOAD PALETTE FROM CLIPBOARD?
                </span>
            </div>
            <span style={{ ...promptActionsStyle, gap: actionButtonGap }}>
                <button
                    aria-label="No"
                    className="pxUiAnim"
                    onClick={onDismiss}
                    style={actionButtonStyle}
                    title="No"
                    type="button"
                >
                    <SvgCancelButton style={promptIconStyle} />
                </button>
                <button
                    aria-label="Yes"
                    className="pxUiAnim"
                    onClick={onAccept}
                    style={actionButtonStyle}
                    title="Yes"
                    type="button"
                >
                    <SvgOkButton style={promptIconStyle} />
                </button>
            </span>
        </div>
    )
}

export function ClipboardPaletteDiagnostics(props: {
    diagnostics: ReadonlyArray<ClipboardPaletteCandidateDiagnostic>
}) {
    void props
    return null
}

export function ClipboardPaletteActivitySpinner() {
    return (
        <div
            aria-label="Loading clipboard palette"
            role="status"
            style={clipboardActivitySpinnerStyle}
        >
            <ImportActivitySpinner />
        </div>
    )
}

export function createClipboardPaletteCandidateLifecycle(
    options: ClipboardPaletteCandidateLifecycleOptions
) {
    const inspectClipboard = options.inspectClipboard ?? (() => undefined)
    let disposed = false
    let inFlight = false
    let droppedTriggers = 0
    let wasEligible = options.isEligible()

    const requestInspection = (reason: ClipboardPaletteCandidateTriggerReason) => {
        if (disposed || !options.isEligible()) return

        if (inFlight) {
            droppedTriggers += 1
            return
        }

        inFlight = true
        const inspection = inspectClipboard(reason)
        if (inspection && typeof inspection.then === "function") {
            inspection.finally(() => {
                inFlight = false
            })
            return
        }
        inFlight = false
    }

    const onFocus = () => {
        requestInspection("focus")
    }
    const onVisibilityChange = () => {
        if (options.documentTarget?.visibilityState === "hidden") {
            options.onHidden?.()
            return
        }
        requestInspection("visibility")
    }

    options.windowTarget?.addEventListener("focus", onFocus)
    options.documentTarget?.addEventListener("visibilitychange", onVisibilityChange)

    return {
        updateEligibility(nextEligible: boolean) {
            if (disposed) return
            const becameEligible = !wasEligible && nextEligible
            wasEligible = nextEligible
            if (becameEligible) requestInspection("eligibility")
        },
        getSnapshot() {
            return { inFlight, droppedTriggers }
        },
        dispose() {
            if (disposed) return
            disposed = true
            options.windowTarget?.removeEventListener("focus", onFocus)
            options.documentTarget?.removeEventListener(
                "visibilitychange",
                onVisibilityChange
            )
        },
    }
}

export function ClipboardPaletteCandidate({
    isEligible,
    isMobileUI,
    onImportPalette,
    onCandidateUiVisibilityChange,
    clipboardRead,
    isSecureContext,
    documentTarget,
    windowTarget,
    viewportScale,
}: ClipboardPaletteCandidateProps) {
    const eligibilityRef = React.useRef(isEligible)
    const detectionSessionRef = React.useRef(
        createClipboardPaletteCandidateDetectionSession()
    )
    const lifecycleRef = React.useRef<ReturnType<
        typeof createClipboardPaletteCandidateLifecycle
    > | null>(null)
    const [detectedCandidate, setDetectedCandidate] =
        React.useState<ClipboardPaletteCandidateDetection | null>(null)
    const [isCheckingClipboard, setIsCheckingClipboard] = React.useState(false)
    const [isAcceptingClipboard, setIsAcceptingClipboard] =
        React.useState(false)
    const [diagnostics, setDiagnostics] = React.useState<
        ClipboardPaletteCandidateDiagnostic[]
    >([])

    const pushDiagnostic = React.useCallback(
        (diagnostic: ClipboardPaletteCandidateDiagnostic) => {
            setDiagnostics((prev) => [...prev.slice(-7), diagnostic])
        },
        []
    )

    React.useEffect(() => {
        eligibilityRef.current = isEligible
        if (!isEligible) {
            setDetectedCandidate(null)
            setIsCheckingClipboard(false)
        }
        lifecycleRef.current?.updateEligibility(isEligible)
    }, [isEligible])

    React.useEffect(() => {
        const isCandidateUiVisible =
            isEligible &&
            (isCheckingClipboard ||
                isAcceptingClipboard ||
                detectedCandidate !== null)
        onCandidateUiVisibilityChange?.(isCandidateUiVisible)
    }, [
        detectedCandidate,
        isAcceptingClipboard,
        isCheckingClipboard,
        isEligible,
        onCandidateUiVisibilityChange,
    ])

    React.useEffect(() => {
        return () => {
            onCandidateUiVisibilityChange?.(false)
        }
    }, [onCandidateUiVisibilityChange])

    React.useEffect(() => {
        const resolvedWindowTarget =
            windowTarget ??
            (typeof window === "undefined" ? undefined : window)
        const resolvedDocumentTarget =
            documentTarget ??
            (typeof document === "undefined" ? undefined : document)
        const lifecycle = createClipboardPaletteCandidateLifecycle({
            isEligible: () => eligibilityRef.current,
            inspectClipboard: async () => {
                setIsCheckingClipboard(true)
                const browserEnvironment = getBrowserClipboardPaletteEnvironment()
                const environment: ClipboardPaletteCandidateEnvironment = {
                    ...browserEnvironment,
                    clipboardRead:
                        clipboardRead ?? browserEnvironment.clipboardRead,
                    isSecureContext:
                        isSecureContext ?? browserEnvironment.isSecureContext,
                    documentTarget:
                        resolvedDocumentTarget ??
                        browserEnvironment.documentTarget,
                }
                pushDiagnostic({
                    label: "env",
                    details: [
                        `brands=${environment.browserBrands
                            ?.map((item) => item.brand)
                            .join("|") ?? "(none)"}`,
                        `secure=${String(environment.isSecureContext)}`,
                        `focused=${String(
                            environment.documentTarget?.hasFocus?.() ?? true
                        )}`,
                        `read=${String(Boolean(environment.clipboardRead))}`,
                    ].join(" "),
                })
                const readClipboard =
                    getClipboardPaletteReadCapability(environment)
                try {
                    if (!readClipboard) {
                        pushDiagnostic({ label: "capability:none" })
                        return
                    }

                    const isAndroidChromium =
                        isAndroidChromiumClipboardPaletteBrowser(environment)
                    const nextCandidate = await detectClipboardPaletteCandidate({
                        readClipboard,
                        session: detectionSessionRef.current,
                        onDiagnostic: pushDiagnostic,
                        inspectNonImagePayload: isAndroidChromium,
                    })
                    if (eligibilityRef.current) {
                        setDetectedCandidate(nextCandidate)
                    }
                } finally {
                    setIsCheckingClipboard(false)
                }
            },
            onHidden: () => {
                const browserEnvironment =
                    getBrowserClipboardPaletteEnvironment()
                const environment: ClipboardPaletteCandidateEnvironment = {
                    ...browserEnvironment,
                    clipboardRead:
                        clipboardRead ?? browserEnvironment.clipboardRead,
                    isSecureContext:
                        isSecureContext ?? browserEnvironment.isSecureContext,
                    documentTarget:
                        resolvedDocumentTarget ??
                        browserEnvironment.documentTarget,
                }

                if (
                    shouldResetAndroidClipboardPaletteSuppressionOnTabHidden(
                        environment
                    )
                ) {
                    detectionSessionRef.current.reset()
                    setDetectedCandidate(null)
                    pushDiagnostic({ label: "android:hidden-reset" })
                }
            },
            windowTarget: resolvedWindowTarget,
            documentTarget: resolvedDocumentTarget,
        })
        lifecycleRef.current = lifecycle
        lifecycle.updateEligibility(eligibilityRef.current)

        return () => {
            lifecycleRef.current = null
            lifecycle.dispose()
        }
    }, [
        clipboardRead,
        documentTarget,
        isSecureContext,
        pushDiagnostic,
        windowTarget,
    ])

    const dismissCandidate = () => {
        setDetectedCandidate(
            dismissClipboardPaletteDetectedCandidate({
                candidate: detectedCandidate,
                session: detectionSessionRef.current,
            })
        )
    }

    const getReadClipboardCapability = () => {
        const browserEnvironment = getBrowserClipboardPaletteEnvironment()
        const environment: ClipboardPaletteCandidateEnvironment = {
            ...browserEnvironment,
            clipboardRead: clipboardRead ?? browserEnvironment.clipboardRead,
            isSecureContext:
                isSecureContext ?? browserEnvironment.isSecureContext,
            documentTarget:
                documentTarget ?? browserEnvironment.documentTarget,
        }

        return getClipboardPaletteReadCapability(environment)
    }

    const acceptCandidate = () => {
        const candidate = detectedCandidate
        setDetectedCandidate(null)
        setIsAcceptingClipboard(true)

        void (async () => {
            const request = await acceptClipboardPaletteDetectedCandidate({
                candidate,
                session: detectionSessionRef.current,
                readClipboard: getReadClipboardCapability(),
                onDiagnostic: pushDiagnostic,
            })
            if (!request) return
            pushDiagnostic({
                label: "import:request",
                details: `${request.file.type} ${request.file.size}b`,
            })
            await onImportPalette(request)
        })().finally(() => {
            setIsAcceptingClipboard(false)
        })
    }

    if (!isEligible) {
        return <ClipboardPaletteDiagnostics diagnostics={diagnostics} />
    }

    if (isCheckingClipboard || isAcceptingClipboard) {
        return (
            <>
                <ClipboardPaletteActivitySpinner />
                <ClipboardPaletteDiagnostics diagnostics={diagnostics} />
            </>
        )
    }

    if (!detectedCandidate) {
        return <ClipboardPaletteDiagnostics diagnostics={diagnostics} />
    }

    return (
        <>
            <ClipboardPalettePrompt
                isMobileUI={isMobileUI}
                onAccept={acceptCandidate}
                onDismiss={dismissCandidate}
                viewportScale={viewportScale}
            />
            <ClipboardPaletteDiagnostics diagnostics={diagnostics} />
        </>
    )
}

export function ClipboardPaletteCandidateMount(
    props: ClipboardPaletteCandidateMountProps
) {
    const { featureFlag = CLIPBOARD_PALETTE_CANDIDATE, ...candidateProps } =
        props
    if (!shouldMountClipboardPaletteCandidate(featureFlag)) return null

    return <ClipboardPaletteCandidate {...candidateProps} />
}

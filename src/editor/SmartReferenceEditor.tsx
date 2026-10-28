import * as React from "react"

import { SvgCancelButton, SvgOkButton, SvgExportSOButton } from "./SvgIcons.tsx"
import {
    PIXTUDIO_ACTION_BUTTON_VISIBLE_GAP,
    getViewportCompensatedActionButtonStyle,
    getViewportCompensatedPx,
} from "./viewportActionButtons.ts"
import { PIXTUDIO_INK, PIXTUDIO_INK_RGB } from "../theme.ts"

import {
    ZERO_SMART_REFERENCE_ADJUSTMENTS,
    buildReferenceSnapshot,
    deriveEffectiveWhiteBalanceDomainState,
    initializeWhiteBalanceDomainStateFromBakedBase,
    resolveSmartWhiteBalanceApplyInputs,
    type SmartObjectWhiteBalanceDomainState,
    type SmartReferenceAdjustments,
    type SmartWhiteBalanceApplyInputs,
} from "./smartRender.ts"
export {
    SMART_REFERENCE_VERSION_1,
    ZERO_SMART_REFERENCE_ADJUSTMENTS,
    ZERO_SMARTOBJECT_WB_DOMAIN_STATE,
    buildReferenceSnapshot,
    type SmartObjectWhitePoint,
    type SmartObjectWhiteBalanceDomainState,
    type SmartReferenceAdjustments,
} from "./smartRender.ts"

export type ReferenceSnapshotEnvelope = {
    snapshot: ImageData | null
    revision: number
    kind: "import" | "load" | "smart-object-apply" | "smart-object-history-restore"
}

export type SmartObjectCommittedState = {
    // Latest committed Smart Object state that participates in app history.
    adjustments: SmartReferenceAdjustments
    revision: number
}

export type SmartObjectCommittedStateBridge = {
    captureCommittedState: () => SmartObjectCommittedState
    captureCommittedEffect: () => Readonly<{
        adjustments: SmartReferenceAdjustments
        whiteBalance: SmartWhiteBalanceApplyInputs | null
    }>
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

// =====================================================
// OK / CANCEL / EXPORT BUTTON CANON (Smart Object family)
// =====================================================
//
// This button family must use:
// - the same HTML button container
// - the same SVG sizing style
// - only icon, opacity, cursor, disabled state, and handler may differ
//
// Local one-off Export button styles are not allowed here.

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
    filter: drop-shadow(0 6px 10px rgba(${PIXTUDIO_INK_RGB}, 0.22));
}

.pxUiAnim:active:not(:disabled) {
    transform: translateY(1px) scale(0.97);
    filter: drop-shadow(0 1px 2px rgba(${PIXTUDIO_INK_RGB}, 0.18));
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

const SMART_SLIDER_MAGNET_PCT = 0.015

function snapToDefaultValue(params: {
    value: number
    min: number
    max: number
    defaultValue: number
    magnetPct?: number
}): number {
    const range = params.max - params.min
    if (!Number.isFinite(params.value) || range <= 0) return params.defaultValue
    const magnet = range * (params.magnetPct ?? SMART_SLIDER_MAGNET_PCT)
    return Math.abs(params.value - params.defaultValue) <= magnet
        ? params.defaultValue
        : params.value
}

function smartAdjustmentDefaultValue(
    key: keyof SmartReferenceAdjustments
): number {
    return ZERO_SMART_REFERENCE_ADJUSTMENTS[key]
}

export function snapSmartAdjustmentValue(
    key: keyof SmartReferenceAdjustments,
    value: number
): number {
    if (key === "whiteBalance") {
        return snapToDefaultValue({
            value,
            min: 0,
            max: 1,
            defaultValue: smartAdjustmentDefaultValue(key),
        })
    }

    return snapToDefaultValue({
        value,
        min: -100,
        max: 100,
        defaultValue: smartAdjustmentDefaultValue(key),
    })
}

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
// Scope is restricted to the Smart Object domain:
// - SmartReferenceEditor
// - buildReferenceSnapshot
// - internal WB helpers
// - WB UI track
//
// Do not change:
// - editor
// - root
// - envelope/history contract outside Smart Object
// - Chinese Room
// - import pipeline
//
// White Balance contract:
//
// 1) Visible WB does not auto-normalize the scene.
//    At the slider center the image must remain unchanged.
//
// 2) sourceKelvin / whiteBalanceConfidence are used
//    to compute the adaptive neutral anchor,
//    which only shapes the WB slider trajectory,
//    without correcting the image at the center.
//
// 3) Visible WB is constructed as:
//    adaptiveAnchor -> targetWhite
//    where targetWhite = adaptiveAnchor + signed slider delta (in mired space).
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
//    out-of-gamut values return to the display gamut
//    via continuous soft compression around the same adaptive target-white anchor,
//    without piecewise channel-limited fitting or shifting toward gray.

function get2dReadFrequentlyContext(
    canvas: HTMLCanvasElement
): CanvasRenderingContext2D | null {
    return canvas.getContext("2d", {
        willReadFrequently: true,
    } as CanvasRenderingContext2DSettings)
}

function areSmartAdjustmentsEqual(
    a: SmartReferenceAdjustments,
    b: SmartReferenceAdjustments
): boolean {
    return (
        a.exposure === b.exposure &&
        a.whiteBalance === b.whiteBalance &&
        a.contrast === b.contrast &&
        a.saturation === b.saturation &&
        a.shadows === b.shadows &&
        a.midtones === b.midtones &&
        a.highlights === b.highlights
    )
}

type SmartReferenceEditorProps = {
    bakedBase?: ImageData | null
    seedCommittedAdjustments?: SmartReferenceAdjustments
    loadPublishNonce?: number
    isOpen?: boolean
    onCancel?: () => void

    // H4:
    // Root receives a bridge to capture/apply committed Smart Object state.
    onSmartObjectCommittedStateBridgeReady?: (
        bridge: SmartObjectCommittedStateBridge | null
    ) => void

    // Smart Object publishes a completed snapshot envelope.
    // Revision and adjustment processing remain owned by Smart Object.
    onPublishEnvelope?: (envelope: ReferenceSnapshotEnvelope) => void
    onCommittedEffect?: (effect: Readonly<{
        adjustments: SmartReferenceAdjustments
        whiteBalance: SmartWhiteBalanceApplyInputs | null
    }>) => void

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
    background: PIXTUDIO_INK,
}

const SMART_CONTROL_FONT_SIZE = 20
const SMART_CONTROL_STACK_GAP = 27
const SMART_LABEL_SLIDER_GAP = 8
const PX_RANGE_THUMB_SIZE = 42
const PX_RANGE_TRACK_H = 9

const CONTROLS_STACK: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: SMART_CONTROL_STACK_GAP,
    width: "100%",
}

const CONTROL_BLOCK: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: SMART_LABEL_SLIDER_GAP,
    width: "100%",
}

const CONTROL_LABEL: React.CSSProperties = {
    fontSize: SMART_CONTROL_FONT_SIZE,
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
    height: PX_RANGE_THUMB_SIZE,
    margin: 0,
    //accentColor: DIAG_SMART_TRACK_SOLID,
    accentColor: "#ffffff",
}

const WB_TRACK_AREA: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: PX_RANGE_THUMB_SIZE,
}

const WB_TRACK_LINE: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: PX_RANGE_TRACK_H,
    transform: "translateY(-50%)",
    background: "linear-gradient(to right, #3A7BD5, #FFE082)",
}

const WB_CENTER_MARK: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 2,
    height: 36,
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
        width: PX_RANGE_THUMB_SIZE,
        height: PX_RANGE_THUMB_SIZE,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
    },
    "#f3f3f3"
)

const BUTTON_ROW: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
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
    onCommittedEffect,
    onExport,
}: SmartReferenceEditorProps) {
    // =====================
    // SMART OBJECT MODULE STATE — S3
    // These entities belong to the SmartReferenceEditor module contract,
    // not Root or PixelEditorFramer.
    //
    // H0 / HISTORY ENGINE CONTRACT:
    //
    // SmartReferenceEditor owns its Smart domain state.
    // History distinguishes:
    //
    // 1) committed-state
    //    Published Smart Object state
    //    that participates in undo/redo.
    //    Minimal committed payload:
    //    - adjustments
    //    - revision
    //
    // 2) draft / live UI state
    //    Temporary edits inside the dialog
    //    before Apply must not enter committed history directly.
    //
    // H2:
    /// Open Smart Object = begin pending transaction (in coordinator/Root)
    /// Cancel = abort pending transaction
    /// Apply = publish an envelope; coordinator/Root then
    /// turns the pending transaction into a committed HistoryEntry.
    // =====================
    const [smartObjectBase, setSmartObjectBase] =
        React.useState<ImageData | null>(null)
    const smartObjectBaseRef = React.useRef<ImageData | null>(null)

    // WB domain state holds the session-stable source estimate and metadata.
    // sourceKelvin and whiteBalanceConfidence shape the resolved WB transform.
    // sourceWhitePoint and targetKelvin are not pixel-apply inputs.
    const [whiteBalanceDomainState, setWhiteBalanceDomainState] =
        React.useState<SmartObjectWhiteBalanceDomainState>(() =>
            initializeWhiteBalanceDomainStateFromBakedBase(null)
        )

    // H4:
    // Draft/live UI state inside the open dialog.
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
    const lastHandledLoadPublishNonceRef = React.useRef(0)

    const [fitScale, setFitScale] = React.useState(1)

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
    // Pixel processing lives in the shared smartRender module;
    // this container synchronizes authoring state with incoming data.
    React.useEffect(() => {
        // A new bakedBase begins a new local Smart Object session.
        // Root may seed committed adjustments on import/load.
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
        // Opening the dialog must restore the latest committed state,
        // not an uncommitted draft from the previous session.
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
            captureCommittedEffect: () => {
                const adjustments = { ...committedStateRef.current.adjustments }
                const effect = resolveSmartWhiteBalanceApplyInputs(
                    adjustments,
                    deriveEffectiveWhiteBalanceDomainState(
                        adjustments.whiteBalance,
                        whiteBalanceDomainState
                    )
                )
                return {
                    adjustments,
                    whiteBalance: effect ? {
                        matrix: [...effect.matrix],
                        anchorReference: [...effect.anchorReference],
                    } : null,
                }
            },
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

                // Restore must also synchronize the UI with committed state.
                setSmartAdjustments({ ...safeState.adjustments })

                if (onPublishEnvelope) {
                    const base = smartObjectBaseRef.current
                    const snapshot = buildReferenceSnapshot(
                        base,
                        safeState.adjustments,
                        deriveEffectiveWhiteBalanceDomainState(
                            safeState.adjustments.whiteBalance,
                            whiteBalanceDomainState
                        )
                    )

                    onPublishEnvelope({
                        snapshot,
                        revision: safeState.revision,
                        kind: "smart-object-history-restore",
                    })
                }
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
    }, [
        onSmartObjectCommittedStateBridgeReady,
        onPublishEnvelope,
        resetSmartObjectSession,
        whiteBalanceDomainState,
    ])

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
                const rawNext = Number(e.target.value)
                const next = Number.isFinite(rawNext)
                    ? snapSmartAdjustmentValue(key, rawNext)
                    : smartAdjustmentDefaultValue(key)

                setSmartAdjustments((prev) => ({
                    ...(prev ?? ZERO_SMART_REFERENCE_ADJUSTMENTS),
                    [key]: next,
                }))
            },
        []
    )

    const whiteBalancePct = Math.max(
        0,
        Math.min(100, effectiveAdjustments.whiteBalance * 100)
    )

    const bottomActionButtonStyle = getViewportCompensatedActionButtonStyle(
        okCancelButtonStyle,
        fitScale,
        {
            marginTop: 18,
            marginLeft: 0,
            marginRight: 0,
        }
    )
    const bottomActionButtonGap = getViewportCompensatedPx(
        PIXTUDIO_ACTION_BUTTON_VISIBLE_GAP,
        fitScale
    )

    const handleApply = React.useCallback(() => {
        if (!onPublishEnvelope) {
            return
        }

        const committedAdjustments = committedStateRef.current.adjustments
        if (areSmartAdjustmentsEqual(effectiveAdjustments, committedAdjustments)) {
            onCancel()
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
        // committed-state Smart Object must update before publishing the
        // envelope, so Root can immediately capture the correct smartAfter
        // through the bridge.
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
        if (onCommittedEffect) {
            const effect = resolveSmartWhiteBalanceApplyInputs(
                effectiveAdjustments,
                effectiveWhiteBalanceDomainState
            )
            onCommittedEffect({
                adjustments: { ...effectiveAdjustments },
                whiteBalance: effect
                    ? {
                          matrix: [...effect.matrix],
                          anchorReference: [...effect.anchorReference],
                      }
                    : null,
            })
        }
    }, [
        onCancel,
        onPublishEnvelope,
        onCommittedEffect,
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
                                HIGHLIGHTS: {effectiveAdjustments.highlights}
                            </p>
                            <input
                                className="soRange"
                                type="range"
                                min={-100}
                                max={100}
                                step={1}
                                value={effectiveAdjustments.highlights}
                                onChange={handleAdjustmentChange("highlights")}
                                style={RANGE_INPUT}
                            />
                        </div>

                        <div style={CONTROL_BLOCK}>
                            <p style={CONTROL_LABEL}>
                                MIDTONES: {effectiveAdjustments.midtones}
                            </p>
                            <input
                                className="soRange"
                                type="range"
                                min={-100}
                                max={100}
                                step={1}
                                value={effectiveAdjustments.midtones}
                                onChange={handleAdjustmentChange("midtones")}
                                style={RANGE_INPUT}
                            />
                        </div>

                        <div style={CONTROL_BLOCK}>
                            <p style={CONTROL_LABEL}>
                                SHADOWS: {effectiveAdjustments.shadows}
                            </p>
                            <input
                                className="soRange"
                                type="range"
                                min={-100}
                                max={100}
                                step={1}
                                value={effectiveAdjustments.shadows}
                                onChange={handleAdjustmentChange("shadows")}
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

                    </div>

                    {/* Smart Object bottom action row. */}
                    <div
                        style={{
                            ...BUTTON_ROW,
                            gap: bottomActionButtonGap,
                        }}
                    >
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

                        {onExport && <button
                            type="button"
                            onClick={handleExport}
                            disabled={!previewSnapshot}
                            style={{
                                ...bottomActionButtonStyle,
                                opacity: previewSnapshot ? 1 : 0.45,
                                cursor:
                                    previewSnapshot
                                        ? "pointer"
                                        : "default",
                            }}
                            aria-label="Export"
                            className="pxUiAnim"
                        >
                            <SvgExportSOButton style={okCancelSvgStyle} />
                        </button>}
                    </div>
                </div>
            </div>
        </FitToViewport>
    )
}

export default SmartReferenceEditor

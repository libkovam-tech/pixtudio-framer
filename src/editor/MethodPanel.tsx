import * as React from "react"

import {
    DEFAULT_COLOR_SPACE_ID,
    OKLAB_COLOR_SPACE_ID,
    PIXTUDIO_METHOD_ID,
    getColorSpaceStrategy,
    getDefaultMethodProfileForPaletteContext,
    getQuantizationMethodStrategy,
    isMethodColorSpaceCompatible,
    type ColorSpaceId,
    type MethodProfile,
    type PaletteContextKind,
} from "./QuantizationCore.ts"
import { SvgCancelButton, SvgOkButton } from "./SvgIcons.tsx"
import { useDesktopApplyCancelShortcuts } from "./useApplyCancelShortcuts.ts"

type MethodPanelProps = {
    paletteContext: PaletteContextKind
    selectedProfile: MethodProfile
    status: "ready" | "pending" | "error"
    canApply: boolean
    isMobileUI: boolean
    onSelectProfile: (profile: MethodProfile) => void
    onCancel: () => void
    onApply: () => void
}

type MethodButtonSlot = {
    methodId: string
    label: string
    tooltip: string
}

type ColorSpaceButtonSlot = {
    colorSpaceId: ColorSpaceId
    label: string
    tooltip: string
}

export type MethodPanelCompatibilityState = {
    compatible: boolean
}

const EXTRA_METHOD_BUTTONS: MethodButtonSlot[] = [
    {
        methodId: PIXTUDIO_METHOD_ID,
        label: "PIXTUDIO",
        tooltip: "Use PIXTUDIO's palette method with selected color matching.",
    },
    {
        methodId: "k-means",
        label: "K-Means",
        tooltip: "Group colors around shared centers.",
    },
    {
        methodId: "k-medoids",
        label: "K-Medoids",
        tooltip: "Group colors around real sample colors.",
    },
    {
        methodId: "octree",
        label: "Octree",
        tooltip: "Reduce colors through a color tree.",
    },
    {
        methodId: "median-cut",
        label: "Median Cut",
        tooltip: "Split color ranges into balanced groups.",
    },
    {
        methodId: "fuzzy-c-means",
        label: "Fuzzy C-Means",
        tooltip: "Allow colors to belong partly to groups.",
    },
    {
        methodId: "wu-color-quantizer",
        label: "Wu's Color Quantizer",
        tooltip: "Fast variance-based color reduction.",
    },
]

const DEFAULT_COLOR_SPACE_BUTTON: ColorSpaceButtonSlot = {
    colorSpaceId: DEFAULT_COLOR_SPACE_ID,
    label: "Default",
    tooltip: "Use PIXTUDIO's standard color handling.",
}

const COLOR_SPACE_BUTTONS: ColorSpaceButtonSlot[] = [
    {
        colorSpaceId: OKLAB_COLOR_SPACE_ID,
        label: "OKLAB",
        tooltip: "Match colors by perceived lightness and hue.",
    },
    {
        colorSpaceId: "cielab",
        label: "CIELAB (Lab)",
        tooltip: "Compare colors in a perceptual Lab space.",
    },
    {
        colorSpaceId: "din99",
        label: "DIN99",
        tooltip: "Compare colors with DIN99 perceptual spacing.",
    },
    {
        colorSpaceId: "cam16-ucs",
        label: "CAM16-UCS",
        tooltip: "Compare colors with modern appearance spacing.",
    },
    {
        colorSpaceId: "ycbcr",
        label: "YCbCr",
        tooltip: "Separate brightness from color channels.",
    },
    {
        colorSpaceId: "yuv",
        label: "YUV",
        tooltip: "Use video-style brightness and color channels.",
    },
    {
        colorSpaceId: "yiq",
        label: "YIQ",
        tooltip: "Use broadcast-style brightness and color channels.",
    },
    {
        colorSpaceId: "hsv",
        label: "HSV",
        tooltip: "Compare hue, saturation, and value.",
    },
    {
        colorSpaceId: "hsl",
        label: "HSL",
        tooltip: "Compare hue, saturation, and lightness.",
    },
    {
        colorSpaceId: "hsi",
        label: "HSI",
        tooltip: "Compare hue, saturation, and intensity.",
    },
]

function getContextDefaultMethodButton(
    paletteContext: PaletteContextKind
): MethodButtonSlot {
    const defaultProfile = getDefaultMethodProfileForPaletteContext(paletteContext)
    const strategy = getQuantizationMethodStrategy(defaultProfile.methodId)

    return {
        methodId: defaultProfile.methodId,
        label: "Default",
        tooltip: strategy?.tooltip ?? "Use PIXTUDIO's standard method.",
    }
}

function getColorSpaceLabel(slot: ColorSpaceButtonSlot): string {
    return getColorSpaceStrategy(slot.colorSpaceId)?.label ?? slot.label
}

function getColorSpaceTooltip(slot: ColorSpaceButtonSlot): string {
    return getColorSpaceStrategy(slot.colorSpaceId)?.tooltip ?? slot.tooltip
}

export function getMethodPanelCompatibilityState(
    profile: MethodProfile,
    paletteContext: PaletteContextKind
): MethodPanelCompatibilityState {
    return {
        compatible: isMethodColorSpaceCompatible(
            profile.methodId,
            profile.colorSpaceId,
            paletteContext
        ),
    }
}

function sectionTitleStyle(isMobileUI: boolean): React.CSSProperties {
    return {
        color: "rgba(255,255,255,0.68)",
        fontSize: isMobileUI ? 13 : 14,
        fontWeight: 900,
        letterSpacing: 1.1,
        lineHeight: 1,
        marginBottom: 14,
        textTransform: "uppercase",
    }
}

function optionButtonStyle(params: {
    active: boolean
    disabled: boolean
    isMobileUI: boolean
}): React.CSSProperties {
    const { active, disabled, isMobileUI } = params
    return {
        minHeight: isMobileUI ? 38 : 42,
        padding: isMobileUI ? "0 10px" : "0 18px",
        border: `1px solid ${
            active ? "#ffffff" : "rgba(255,255,255,0.68)"
        }`,
        borderRadius: 0,
        background: active ? "#ffffff" : "transparent",
        color: active ? "#001219" : "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "inherit",
        fontSize: isMobileUI ? 14 : 16,
        fontWeight: 900,
        letterSpacing: 0,
        lineHeight: 1.05,
        opacity: disabled ? 0.34 : 1,
        cursor: disabled ? "default" : "pointer",
        boxSizing: "border-box",
        width: "100%",
        minWidth: 0,
        position: "relative",
        textAlign: "center",
        whiteSpace: isMobileUI ? "normal" : "nowrap",
        overflowWrap: "anywhere",
    }
}

function buttonRowsStyle(isMobileUI: boolean): React.CSSProperties {
    return {
        display: "flex",
        flexDirection: "column",
        gap: isMobileUI ? 10 : 12,
        width: "100%",
    }
}

function buttonRowStyle(
    count: number,
    isMobileUI: boolean
): React.CSSProperties {
    return {
        display: "grid",
        gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
        gap: isMobileUI ? 10 : 12,
        width: "100%",
    }
}

export function MethodPanel({
    paletteContext,
    selectedProfile,
    status,
    canApply,
    isMobileUI,
    onSelectProfile,
    onCancel,
    onApply,
}: MethodPanelProps) {
    useDesktopApplyCancelShortcuts({
        enabled: !isMobileUI,
        canApply,
        onApply,
        onCancel,
    })

    const methodButtons = [
        getContextDefaultMethodButton(paletteContext),
        ...EXTRA_METHOD_BUTTONS,
    ]
    const methodRows = [methodButtons.slice(0, 4), methodButtons.slice(4)]
    const colorSpaceButtons = [DEFAULT_COLOR_SPACE_BUTTON, ...COLOR_SPACE_BUTTONS]
    const colorSpaceRows = [
        colorSpaceButtons.slice(0, 4),
        colorSpaceButtons.slice(4, 8),
        colorSpaceButtons.slice(8),
    ]
    const statusText =
        status === "pending"
            ? "Rendering preview"
            : status === "error"
              ? "Preview unavailable"
              : ""

    return (
        <div
            style={{
                width: "100%",
                color: "#ffffff",
                fontFamily:
                    "Roboto, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                paddingTop: isMobileUI ? 28 : 34,
                paddingBottom: isMobileUI ? 32 : 44,
                boxSizing: "border-box",
            }}
        >
            <div style={{ marginBottom: isMobileUI ? 28 : 34 }}>
                <div style={sectionTitleStyle(isMobileUI)}>METHOD</div>
                <div style={buttonRowsStyle(isMobileUI)}>
                    {methodRows.map((row, index) => (
                        <div
                            key={`method-row-${index}`}
                            style={buttonRowStyle(row.length, isMobileUI)}
                        >
                            {row.map((button) => {
                                const active =
                                    button.methodId === selectedProfile.methodId
                                const profile = {
                                    methodId: button.methodId,
                                    colorSpaceId: selectedProfile.colorSpaceId,
                                }
                                const { compatible } =
                                    getMethodPanelCompatibilityState(
                                        profile,
                                        paletteContext
                                    )
                                const disabled = !compatible
                                const title = disabled
                                    ? "Not compatible with this color space here"
                                    : button.tooltip

                                return (
                                    <button
                                        key={button.methodId}
                                        type="button"
                                        disabled={disabled}
                                        data-axis="method"
                                        data-compatible={
                                            compatible ? "true" : "false"
                                        }
                                        data-color-space-id={
                                            selectedProfile.colorSpaceId
                                        }
                                        data-method-id={button.methodId}
                                        data-palette-context={paletteContext}
                                        title={isMobileUI ? undefined : title}
                                        onClick={() => {
                                            if (disabled) return
                                            onSelectProfile(profile)
                                        }}
                                        style={optionButtonStyle({
                                            active,
                                            disabled,
                                            isMobileUI,
                                        })}
                                    >
                                        {button.label}
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <div style={sectionTitleStyle(isMobileUI)}>COLOR SPACES</div>
                <div style={buttonRowsStyle(isMobileUI)}>
                    {colorSpaceRows.map((row, index) => (
                        <div
                            key={`color-space-row-${index}`}
                            style={buttonRowStyle(row.length, isMobileUI)}
                        >
                            {row.map((button) => {
                                const active =
                                    button.colorSpaceId ===
                                    selectedProfile.colorSpaceId
                                const profile = {
                                    methodId: selectedProfile.methodId,
                                    colorSpaceId: button.colorSpaceId,
                                }
                                const { compatible } =
                                    getMethodPanelCompatibilityState(
                                        profile,
                                        paletteContext
                                    )
                                const disabled = !compatible
                                const title = disabled
                                    ? "Not compatible with this method here"
                                    : getColorSpaceTooltip(button)

                                return (
                                    <button
                                        key={button.colorSpaceId}
                                        type="button"
                                        disabled={disabled}
                                        data-axis="color-space"
                                        data-compatible={
                                            compatible ? "true" : "false"
                                        }
                                        data-color-space-id={button.colorSpaceId}
                                        data-method-id={selectedProfile.methodId}
                                        data-palette-context={paletteContext}
                                        title={isMobileUI ? undefined : title}
                                        onClick={() => {
                                            if (disabled) return
                                            onSelectProfile(profile)
                                        }}
                                        style={optionButtonStyle({
                                            active,
                                            disabled,
                                            isMobileUI,
                                        })}
                                    >
                                        {getColorSpaceLabel(button)}
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <div
                style={{
                    minHeight: 18,
                    marginTop: isMobileUI ? 18 : 22,
                    color: "rgba(255,255,255,0.58)",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 0,
                    textAlign: "center",
                }}
            >
                {statusText}
            </div>

            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: isMobileUI ? 42 : 70,
                    marginTop: isMobileUI ? 8 : 10,
                }}
            >
                <button
                    type="button"
                    aria-label="Cancel METHOD"
                    title={isMobileUI ? undefined : "Cancel"}
                    onClick={onCancel}
                    style={{
                        width: isMobileUI ? 70 : 82,
                        height: isMobileUI ? 70 : 82,
                        border: 0,
                        borderRadius: 0,
                        background: "transparent",
                        padding: 0,
                        cursor: "pointer",
                    }}
                >
                    <SvgCancelButton style={{ width: "100%", height: "100%" }} />
                </button>

                <button
                    type="button"
                    aria-label="Apply METHOD"
                    title={isMobileUI ? undefined : "Apply"}
                    onClick={onApply}
                    disabled={!canApply}
                    style={{
                        width: isMobileUI ? 70 : 82,
                        height: isMobileUI ? 70 : 82,
                        border: 0,
                        borderRadius: 0,
                        background: "transparent",
                        padding: 0,
                        opacity: canApply ? 1 : 0.38,
                        cursor: canApply ? "pointer" : "default",
                    }}
                >
                    <SvgOkButton style={{ width: "100%", height: "100%" }} />
                </button>
            </div>
        </div>
    )
}

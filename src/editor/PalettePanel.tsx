import * as React from "react"

import { PIXTUDIO_INK, pixtudioInk } from "../theme.ts"
import { AddNewSwatch } from "./SvgIcons.tsx"
import { type PaletteTab, type QuantizationSwatch } from "./paletteQuantizationEngine.ts"
import {
    getPresetButtonLabel,
    type FixedPaletteProfile,
} from "./palettePresentation.ts"

const TRANSPARENT_LABEL = "Transparent"
const SWATCH_PX = 26
const SWATCH_GAP = 10
const ACTIVE_SWATCH_SCALE_MOBILE = 1.3
const ACTIVE_SWATCH_SCALE_DESKTOP = 1.4

type PalettePanelProps = {
    activeTab: PaletteTab
    activePresetButtonId: string | null
    autoSwatches: QuantizationSwatch[]
    bg: string
    checkerBackground: string
    disabled: boolean
    importedPresetProfiles: FixedPaletteProfile[]
    isMobileUI: boolean
    paletteCount: number
    paletteCountActual: number
    paletteMax: number
    paletteMin: number
    rangeStyleBase: React.CSSProperties
    rangeTrackStyle: (
        value: number,
        min: number,
        max: number,
        fillColor: string
    ) => React.CSSProperties
    selectedSwatch: string
    shouldShowPresetSwatches: boolean
    trackWrap: React.CSSProperties
    userSwatches: QuantizationSwatch[]
    visibleBuiltinPresetProfiles: FixedPaletteProfile[]
    onAddSwatch: () => void
    onApplyPreset: (profile: FixedPaletteProfile) => void
    onDeletePreset: (profileId: string) => void
    onOpenColorEditor: (swatchId: string) => void
    onOpenPalettePresetFileDialog: () => void
    onPaletteSliderBlur: () => void
    onPaletteSliderChange: (nextPaletteCount: number) => void
    onPaletteSliderKeyDown: (key: string) => void
    onPaletteSliderKeyUp: () => void
    onPaletteSliderPointerCancel: () => void
    onPaletteSliderPointerDown: () => void
    onPaletteSliderPointerLeave: () => void
    onPaletteSliderPointerUp: () => void
    onPaletteSliderTouchCancel: () => void
    onPaletteSliderTouchEnd: () => void
    onPaletteSliderTouchStart: () => void
    onSelectSwatch: (swatchId: string) => void
    onSwitchPaletteTab: (tab: PaletteTab) => void
}

export function PalettePanel({
    activeTab,
    activePresetButtonId,
    autoSwatches,
    bg,
    checkerBackground,
    disabled,
    importedPresetProfiles,
    isMobileUI,
    paletteCount,
    paletteCountActual,
    paletteMax,
    paletteMin,
    rangeStyleBase,
    rangeTrackStyle,
    selectedSwatch,
    shouldShowPresetSwatches,
    trackWrap,
    userSwatches,
    visibleBuiltinPresetProfiles,
    onAddSwatch,
    onApplyPreset,
    onDeletePreset,
    onOpenColorEditor,
    onOpenPalettePresetFileDialog,
    onPaletteSliderBlur,
    onPaletteSliderChange,
    onPaletteSliderKeyDown,
    onPaletteSliderKeyUp,
    onPaletteSliderPointerCancel,
    onPaletteSliderPointerDown,
    onPaletteSliderPointerLeave,
    onPaletteSliderPointerUp,
    onPaletteSliderTouchCancel,
    onPaletteSliderTouchEnd,
    onPaletteSliderTouchStart,
    onSelectSwatch,
    onSwitchPaletteTab,
}: PalettePanelProps) {
    const swatchGridStyle: React.CSSProperties = {
        width: "100%",
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, ${SWATCH_PX}px)`,
        gap: SWATCH_GAP,
        alignItems: "start",
        justifyContent: "start",
    }

    const renderSwatchButton = (swatch: QuantizationSwatch) => {
        const isActive = selectedSwatch === swatch.id
        const activeScale = isMobileUI
            ? ACTIVE_SWATCH_SCALE_MOBILE
            : ACTIVE_SWATCH_SCALE_DESKTOP
        const transform = isActive ? `scale(${activeScale})` : "scale(1)"

        let longPressTimeout: number | null = null
        const cancelLongPress = () => {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout)
                longPressTimeout = null
            }
        }

        return (
            <button
                key={swatch.id}
                type="button"
                onClick={() => onSelectSwatch(swatch.id)}
                onContextMenu={(event) => {
                    event.preventDefault()
                    onOpenColorEditor(swatch.id)
                }}
                onPointerDown={(event) => {
                    if (event.pointerType === "touch") {
                        longPressTimeout = window.setTimeout(() => {
                            onOpenColorEditor(swatch.id)
                        }, 600)
                    }
                }}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                title={
                    swatch.isTransparent
                        ? `${TRANSPARENT_LABEL} Swatch`
                        : swatch.color || ""
                }
                style={{
                    width: SWATCH_PX,
                    height: SWATCH_PX,
                    borderRadius: 0,
                    padding: 0,
                    cursor: "pointer",
                    background: swatch.isTransparent
                        ? checkerBackground
                        : swatch.color || "",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: "border-box",
                    border: isActive
                        ? `2px solid ${pixtudioInk(0.95)}`
                        : `1px solid ${pixtudioInk(0.25)}`,
                    transform,
                    transformOrigin: "center",
                    transition:
                        "transform 120ms ease, box-shadow 120ms ease",
                    position: "relative",
                    zIndex: isActive ? 2 : 1,
                }}
            />
        )
    }

    const renderTransparentSwatchButton = () => {
        const isSelected = selectedSwatch === "transparent"
        const activeScale = isMobileUI
            ? ACTIVE_SWATCH_SCALE_MOBILE
            : ACTIVE_SWATCH_SCALE_DESKTOP
        const transform = isSelected ? `scale(${activeScale})` : "scale(1)"

        return (
            <button
                type="button"
                onClick={() => onSelectSwatch("transparent")}
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
                    border: isSelected
                        ? "2px solid rgba(255,255,255,0.95)"
                        : "2px solid rgba(255,255,255,0.25)",
                    boxShadow: isSelected
                        ? `0 0 0 2px ${pixtudioInk(0.6)}`
                        : `0 0 0 2px ${pixtudioInk(0.35)}`,
                    boxSizing: "border-box",
                    transform,
                    transformOrigin: "center",
                    transition:
                        "transform 120ms ease, box-shadow 120ms ease",
                    position: "relative",
                    zIndex: isSelected ? 2 : 1,
                }}
            />
        )
    }

    const renderAddSwatchButton = () => (
        <button
            type="button"
            onClick={onAddSwatch}
            className="pxUiAnim"
            title="Add swatch"
            style={{
                width: SWATCH_PX,
                height: SWATCH_PX,
                padding: 0,
                border: "none",
                background: "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                userSelect: "none",
                cursor: "pointer",
            }}
        >
            <AddNewSwatch size={SWATCH_PX} />
        </button>
    )

    const presetButtonStyle = (
        label: string,
        secondary = false,
        active = false
    ): React.CSSProperties => {
        const wide = label.length >= 10
        return {
            position: "relative",
            width: isMobileUI
                ? secondary
                    ? 123
                    : wide
                      ? 144
                      : 123
                : secondary
                  ? 145
                  : wide
                    ? 168
                    : 147,
            height: isMobileUI ? 35 : 43,
            border: `2px solid ${PIXTUDIO_INK}`,
            borderRadius: 0,
            background: secondary ? PIXTUDIO_INK : active ? "#FFFFFF" : bg,
            backgroundColor: secondary
                ? PIXTUDIO_INK
                : active
                  ? "#FFFFFF"
                  : bg,
            color: secondary ? "#FFFFFF" : PIXTUDIO_INK,
            fontWeight: 900,
            fontSize: isMobileUI ? 12 : 15,
            letterSpacing: 0,
            cursor: "pointer",
            boxSizing: "border-box",
            padding: 0,
            overflow: "hidden",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
        }
    }

    const presetButtonTextStyle = (
        hasDelete: boolean
    ): React.CSSProperties => ({
        position: "absolute",
        left: 17,
        right: hasDelete ? 32 : 17,
        top: "50%",
        transform: "translateY(-50%)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "center",
        pointerEvents: "none",
    })

    const presetDeleteButtonStyle: React.CSSProperties = {
        position: "absolute",
        right: 0,
        top: 0,
        width: "17%",
        height: "100%",
        border: "none",
        background: "transparent",
        color: PIXTUDIO_INK,
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: isMobileUI ? 13 : 16,
        fontWeight: 900,
        lineHeight: 1,
    }

    const renderPresetButton = (profile: FixedPaletteProfile) => {
        const active = activePresetButtonId === profile.id
        const label = getPresetButtonLabel(profile)

        return (
            <button
                key={profile.id}
                type="button"
                onClick={() => onApplyPreset(profile)}
                className="pxUiAnim"
                title={profile.name}
                style={presetButtonStyle(label, false, active)}
            >
                <span style={presetButtonTextStyle(true)}>{label}</span>
                <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Delete ${profile.name} preset`}
                    title={`Delete ${profile.name}`}
                    onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onDeletePreset(profile.id)
                    }}
                    style={presetDeleteButtonStyle}
                >
                    {"\u00d7"}
                </span>
            </button>
        )
    }

    const renderLoadPaletteButton = () => {
        const label = "Load Palette"

        return (
            <button
                type="button"
                onClick={onOpenPalettePresetFileDialog}
                className="pxUiAnim"
                style={presetButtonStyle(label, true)}
            >
                <span
                    style={{
                        ...presetButtonTextStyle(false),
                        color: "#FFFFFF",
                    }}
                >
                    {label}
                </span>
            </button>
        )
    }

    return (
        <div
            style={{
                marginTop: isMobileUI ? 18 : 30,
                opacity: disabled ? 0.5 : 1,
                pointerEvents: disabled ? "none" : ("auto" as const),
            }}
        >
            <div
                style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    alignItems: "center",
                    height: isMobileUI ? 22 : 30,
                }}
            >
                <div
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 3,
                        height: isMobileUI ? 18 : 24,
                        background: "rgba(30, 43, 47, 0.2)",
                    }}
                />
                <button
                    type="button"
                    onClick={() => onSwitchPaletteTab("size")}
                    style={{
                        height: "100%",
                        background: "transparent",
                        border: "none",
                        color:
                            activeTab === "size"
                                ? PIXTUDIO_INK
                                : "rgba(30, 43, 47, 0.32)",
                        fontWeight: 800,
                        fontSize: isMobileUI ? 13 : 20,
                        lineHeight: 1,
                        letterSpacing: 0.4,
                        textAlign: "left",
                        padding: 0,
                        cursor: "pointer",
                        boxSizing: "border-box",
                    }}
                >
                    AUTO PALETTE{" "}
                    <span style={{ fontWeight: 500 }}>
                        {paletteCountActual} colors
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => onSwitchPaletteTab("presets")}
                    style={{
                        height: "100%",
                        background: "transparent",
                        border: "none",
                        color:
                            activeTab === "presets"
                                ? PIXTUDIO_INK
                                : "rgba(30, 43, 47, 0.32)",
                        fontWeight: 800,
                        fontSize: isMobileUI ? 13 : 20,
                        lineHeight: 1,
                        letterSpacing: 0.4,
                        textAlign: "left",
                        padding: isMobileUI ? "0 10px" : "0 0 0 44px",
                        cursor: "pointer",
                        boxSizing: "border-box",
                    }}
                >
                    PALETTE PRESETS
                </button>
            </div>

            <div
                style={{
                    minHeight: isMobileUI ? 126 : 164,
                    padding: 0,
                    boxSizing: "border-box",
                }}
            >
                {activeTab === "size" ? (
                    <>
                        <div style={{ marginBottom: 14 }}>
                            <div
                                style={{
                                    display: "none",
                                    alignItems: "baseline",
                                }}
                            />

                            <div style={trackWrap}>
                                <input
                                    type="range"
                                    className="pxRange"
                                    min={paletteMin}
                                    max={paletteMax}
                                    step={1}
                                    value={paletteCount}
                                    onChange={(event) =>
                                        onPaletteSliderChange(
                                            parseInt(
                                                event.currentTarget.value,
                                                10
                                            )
                                        )
                                    }
                                    onKeyDown={(event) =>
                                        onPaletteSliderKeyDown(event.key)
                                    }
                                    onKeyUp={onPaletteSliderKeyUp}
                                    onPointerDown={onPaletteSliderPointerDown}
                                    onPointerUp={onPaletteSliderPointerUp}
                                    onPointerCancel={
                                        onPaletteSliderPointerCancel
                                    }
                                    onPointerLeave={
                                        onPaletteSliderPointerLeave
                                    }
                                    onBlur={onPaletteSliderBlur}
                                    onTouchStart={onPaletteSliderTouchStart}
                                    onTouchEnd={onPaletteSliderTouchEnd}
                                    onTouchCancel={onPaletteSliderTouchCancel}
                                    style={
                                        {
                                            ...rangeStyleBase,
                                            ...rangeTrackStyle(
                                                paletteCount,
                                                paletteMin,
                                                paletteMax,
                                                "#d58a1c"
                                            ),
                                            "--px-thumb-color": "#d58a1c",
                                        } as React.CSSProperties
                                    }
                                    disabled={disabled}
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: 6, width: "100%" }}>
                            <div style={swatchGridStyle}>
                                {autoSwatches.map(renderSwatchButton)}
                                {renderTransparentSwatchButton()}
                                {renderAddSwatchButton()}
                                {userSwatches.map(renderSwatchButton)}
                            </div>

                            <div style={{ marginTop: 12, width: "100%" }} />
                        </div>
                    </>
                ) : (
                    <div
                        style={{
                            minHeight: isMobileUI ? 112 : 132,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            gap: isMobileUI ? 14 : 28,
                            paddingTop: 15,
                            boxSizing: "border-box",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexWrap: "wrap",
                                columnGap: isMobileUI ? 10 : 28,
                                rowGap: isMobileUI ? 12 : 26,
                                width: "100%",
                            }}
                        >
                            {visibleBuiltinPresetProfiles.map(renderPresetButton)}
                            {importedPresetProfiles.map(renderPresetButton)}
                            {renderLoadPaletteButton()}
                        </div>

                        <div style={swatchGridStyle}>
                            {shouldShowPresetSwatches &&
                                autoSwatches.map(renderSwatchButton)}
                            {renderTransparentSwatchButton()}
                            {renderAddSwatchButton()}
                            {userSwatches.map(renderSwatchButton)}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

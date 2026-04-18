import * as React from "react"

import {
    SvgTopButton3,
    SvgTopButton4,
    SvgOkButton,
    SaveIcon,
    LoadIcon,
    UndoIcon,
    RedoIcon,
    ZoomOutIcon,
    ZoomInIcon,
    PipetteIcon,
    HandIconOff,
    SvgSmartObject,
    SvgExportSOButton,
} from "./SvgIcons.tsx"

function SaveIconInline({ style }: { style?: React.CSSProperties }) {
    const s = { ...ICON_INLINE, ...style }
    const size = typeof s.width === "number" ? s.width : 20
    return (
        <span style={s}>
            <SaveIcon size={size} />
        </span>
    )
}

function LoadIconInline({ style }: { style?: React.CSSProperties }) {
    const s = { ...ICON_INLINE, ...style }
    const size = typeof s.width === "number" ? s.width : 20
    return (
        <span style={s}>
            <LoadIcon size={size} />
        </span>
    )
}

function UndoIconInline({ style }: { style?: React.CSSProperties }) {
    const s = { ...ICON_INLINE, ...style }
    const size = typeof s.width === "number" ? s.width : 20
    return (
        <span style={s}>
            <UndoIcon size={size} />
        </span>
    )
}

function RedoIconInline({ style }: { style?: React.CSSProperties }) {
    const s = { ...ICON_INLINE, ...style }
    const size = typeof s.width === "number" ? s.width : 20
    return (
        <span style={s}>
            <RedoIcon size={size} />
        </span>
    )
}

function ZoomInIconInline({ style }: { style?: React.CSSProperties }) {
    const s = { ...ICON_INLINE, ...style }
    const size = typeof s.width === "number" ? s.width : 20
    return (
        <span style={s}>
            <ZoomInIcon size={size} />
        </span>
    )
}

function ZoomOutIconInline({ style }: { style?: React.CSSProperties }) {
    const s = { ...ICON_INLINE, ...style }
    const size = typeof s.width === "number" ? s.width : 20
    return (
        <span style={s}>
            <ZoomOutIcon size={size} />
        </span>
    )
}

function PipetteIconInline({
    style,
    active,
}: {
    style?: React.CSSProperties
    active?: boolean
}) {
    const s = { ...ICON_INLINE, ...style }
    const size = typeof s.width === "number" ? s.width : 20
    return (
        <span style={s}>
            <PipetteIcon size={size} active={!!active} />
        </span>
    )
}

function HandIconOffInline({
    style,
}: {
    style?: React.CSSProperties
}) {
    const s = { ...ICON_INLINE, ...style }
    const size = typeof s.width === "number" ? s.width : 20
    return <span style={s}>{<HandIconOff size={size} />}</span>
}

// =====================================================
// OK / CANCEL BUTTON STYLE (shared across the editor)
// =====================================================

const okCancelButtonStyle: React.CSSProperties = {
    width: 50,
    height: 50,

    border: "none",
    background: "transparent",
    padding: 0,

    marginTop: 0,
    marginLeft: 0,
    marginRight: 0,

    cursor: "pointer",
    touchAction: "manipulation",

    display: "block",
}

const okCancelSvgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "block",
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

// ------------------- Typography constants -------------------

const ICON_INLINE: React.CSSProperties = {
    width: 22,
    height: 22,
    //flexShrink: 0,
    display: "inline-block",
    verticalAlign: "middle",
    //marginRight: 8,
}

const ICON_SLOT: React.CSSProperties = {
    width: 28,
    minWidth: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
}

const INLINE_TEXT_SLOT: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
}

const FONT_FAMILY =
    "Roboto, system-ui, -apple-system, Segoe UI, Arial, sans-serif"

const BASE_TEXT_COLOR = "rgba(0,0,0,0.88)"
const MUTED_TEXT_COLOR = "rgba(0,0,0,0.72)"

const H1: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 900,
    letterSpacing: 0.2,
    color: BASE_TEXT_COLOR,
    margin: "0 0 14px 0",
}

const H2: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    lineHeight: 1.2,
    fontWeight: 900,
    letterSpacing: 0.2,
    color: BASE_TEXT_COLOR,
    margin: "22px 0 10px 0",
}

const H3: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: 0.2,
    color: BASE_TEXT_COLOR,
    margin: "14px 0 8px 0",
}

const P: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    lineHeight: 1.45,
    fontWeight: 400,
    color: BASE_TEXT_COLOR,
    margin: "0 0 10px 0",
}

const NOTE: React.CSSProperties = {
    ...P,
    color: MUTED_TEXT_COLOR,
}

const UL: React.CSSProperties = {
    margin: "0 0 12px 0",
    paddingLeft: 18,
}

const UL_ICON: React.CSSProperties = {
    margin: "0 0 12px 0",
    paddingLeft: 0,
}

const LI: React.CSSProperties = {
    ...P,
    margin: "0 0 6px 0",
    paddingLeft: 0,
}

const LI1: React.CSSProperties = {
    listStyle: "none",
    ...P,
    margin: "0 0 6px 0",

    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    minWidth: 0,
}

const HR: React.CSSProperties = {
    border: "none",
    height: 1,
    background: "rgba(0,0,0,0.12)",
    margin: "18px 0",
}

const SECTION: React.CSSProperties = {
    maxWidth: 720,
    width: "100%",
    margin: "0 auto",
}

const H3_WITH_ICON: React.CSSProperties = {
    ...H3,
    display: "flex",
    alignItems: "center",
    gap: 10,
}

// ------------------- Layout constants -------------------

// Требование: текст начинается через 50px от верха экрана
const TOP_GAP_PX = 50

// Кнопка: fixed bottom:24, size 96, scale 0.7 => ~67px фактическая высота.
// Требование: текст заканчивается за 50px над кнопкой.
const BUTTON_BOTTOM_PX = 24
const BUTTON_BOX_PX = 96
const BUTTON_SCALE = 0.7
const TEXT_ABOVE_BUTTON_GAP_PX = 50

const SCROLL_BOTTOM_PX = Math.round(
    BUTTON_BOTTOM_PX + BUTTON_BOX_PX * BUTTON_SCALE + TEXT_ABOVE_BUTTON_GAP_PX
)

// Внутренние поля текста
const CONTENT_PAD_X = 22
const CONTENT_PAD_Y = 18

export function ManualScreen({ onClose }: { onClose: () => void }) {
    return (
        <>
            <style>{PIX_UI_BUTTON_ANIM_CSS}</style>

            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    width: "100%",
                    height: "100%",
                    background: "#FAF6E9",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingBottom: 18,
                    boxSizing: "border-box",
                }}
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                }}
            >
                {/* ------------------- SCROLL VIEWPORT (top 50px; bottom = 50px above button) ------------------- */}
                <div
                    style={{
                        position: "fixed",
                        left: 0,
                        right: 0,
                        top: TOP_GAP_PX,
                        bottom: SCROLL_BOTTOM_PX,

                        overflowY: "auto",
                        WebkitOverflowScrolling: "touch",

                        padding: `${CONTENT_PAD_Y}px ${CONTENT_PAD_X}px`,
                        boxSizing: "border-box",

                        // чтобы скролл был “честный”, а не клики по фону
                        pointerEvents: "auto",
                    }}
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                    }}
                    onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                    }}
                >
                    <div style={SECTION}>
                        <div style={H1}>PIXTUDIO — User Guide</div>

                        <div style={H2}>1. What is PIXTUDIO</div>
                        <p style={P}>
                            PIXTUDIO is an editor that transforms ordinary
                            images into pixel art.
                        </p>
                        <p style={P}>You can:</p>
                        <ul style={UL}>
                            <li style={LI}>upload a photo,</li>
                            <li style={LI}>
                                select an image from your gallery,
                            </li>
                            <li style={LI}>take a picture with your camera,</li>
                            <li style={LI}>or start with a blank canvas.</li>
                        </ul>
                        <p style={P}>
                            Once an image appears on the canvas, it is
                            automatically simplified and converted into a pixel
                            grid. The colors of those pixels form the project
                            palette.
                        </p>
                        <p style={NOTE}>
                            <b>Important:</b> every pixel on the canvas is
                            always linked to a color in the palette. Changing a
                            palette color updates all pixels associated with it.
                        </p>

                        <div style={HR} />

                        <div style={H2}>2. Getting Started</div>
                        <p style={P}>To create an image:</p>
                        <ol style={{ ...UL, paddingLeft: 20 }}>
                            <li style={LI}>
                                Click <b>Import</b> in the top menu or use the
                                image / camera icon.
                            </li>
                            <li style={LI}>
                                Choose an image source or create a blank canvas.
                            </li>
                            <li style={LI}>
                                If needed, adjust scale and rotation on the
                                preparation screen and select a preset.
                            </li>
                            <li style={LI}>
                                After the image appears on the canvas, adjust
                                grid size and palette size.
                            </li>
                            <li style={LI}>
                                Edit colors or draw using the brush tool.
                            </li>
                        </ol>
                        <p style={NOTE}>
                            Changing the grid size or the number of palette
                            colors rebuilds the image.
                        </p>

                        <div style={HR} />

                        <div style={H2}>3. Main Screen</div>
                        <p style={P}>The main screen consists of:</p>
                        <ul style={UL}>
                            <li style={LI}>Top toolbar</li>
                            <li style={LI}>Canvas</li>
                            <li style={LI}>Canvas settings panel</li>
                            <li style={LI}>Palette</li>
                        </ul>

                        <div style={H3}>Canvas</div>
                        <p style={P}>
                            The canvas displays the image and all changes made
                            to it.
                        </p>
                        <p style={P}>
                            When working on a white or transparent canvas, a
                            helper grid is visible. This grid does not affect
                            the image and is not exported — it is only a visual
                            aid.
                        </p>

                        <div style={HR} />

                        <div style={H2}>4. Canvas Settings</div>
                        <p style={P}>
                            Below the canvas, you will find sliders for:
                        </p>
                        <ul style={UL}>
                            <li style={LI}>Brush size</li>
                            <li style={LI}>
                                Grid size (16–128 cells horizontally and
                                vertically)
                            </li>
                            <li style={LI}>Palette size (10–32 colors)</li>
                        </ul>
                        <p style={P}>
                            Changing the grid or palette size rebuilds the
                            image.
                        </p>
                        <p style={P}>
                            A smaller grid results in larger pixels and a more
                            stylized look. Finding the balance between
                            recognizability and abstraction is part of the
                            creative process.
                        </p>

                        <div style={HR} />

                        <div style={H2}>5. Top Toolbar</div>

                        <div style={H3}>Project</div>
                        <ul style={UL_ICON}>
                            <li style={LI1}>
                                <span style={ICON_SLOT}>
                                    <SaveIconInline style={ICON_INLINE} />
                                </span>
                                <span style={INLINE_TEXT_SLOT}>
                                    Saving creates a .pixtudio file containing
                                    all project data.
                                </span>
                            </li>
                            <li style={LI1}>
                                <span style={ICON_SLOT}>
                                    <LoadIconInline style={ICON_INLINE} />
                                </span>
                                <span style={INLINE_TEXT_SLOT}>
                                    Loading a project completely replaces the
                                    current editor state.
                                </span>
                            </li>
                            <li style={LI1}>
                                The undo history is cleared after loading.
                            </li>
                        </ul>

                        <div style={H3}>Undo / Redo</div>

                        <ul style={UL_ICON}>
                            <li style={LI1}>
                                <span style={ICON_SLOT}>
                                    <UndoIconInline style={ICON_INLINE} />
                                </span>
                                <span style={INLINE_TEXT_SLOT}>
                                    Undo reverts one action.
                                </span>
                            </li>
                            <li style={LI1}>
                                <span style={ICON_SLOT}>
                                    <RedoIconInline style={ICON_INLINE} />
                                </span>
                                <span style={INLINE_TEXT_SLOT}>
                                    Redo restores one undone action.
                                </span>
                            </li>
                        </ul>

                        <div style={H3_WITH_ICON}>
                            <span style={ICON_SLOT}>
                                <SvgTopButton3 style={ICON_INLINE} />
                            </span>
                            <span>Import</span>
                        </div>
                        <p style={P}>You can:</p>
                        <ul style={UL}>
                            <li style={LI}>upload JPG/PNG files,</li>
                            <li style={LI}>
                                capture an image using your device camera,
                            </li>
                            <li style={LI}>
                                create a blank transparent canvas.
                            </li>
                        </ul>
                        <p style={P}>
                            Before the image reaches the canvas, a preparation
                            screen appears where you can:
                        </p>
                        <ul style={UL}>
                            <li style={LI}>adjust scale,</li>
                            <li style={LI}>rotate the image,</li>
                            <li style={LI1}>Choose a preset:</li>
                        </ul>
                        <ul style={{ ...UL, marginTop: -6 }}>
                            <li style={LI}>Default</li>
                            <li style={LI}>Neon</li>
                            <li style={LI}>Grayscale</li>
                            <li style={LI}>Black &amp; White</li>
                        </ul>

                        <div style={H3_WITH_ICON}>
                            <span style={ICON_SLOT}>
                                <SvgTopButton4 style={ICON_INLINE} />
                            </span>
                            <span>Export</span>
                        </div>
                        <p style={P}>You can export your work as PNG or SVG.</p>
                        <p style={P}>You can also choose what to export:</p>
                        <ul style={UL}>
                            <li style={LI}>brush strokes only,</li>
                            <li style={LI}>the pixelized base image only,</li>
                            <li style={LI}>or both together (default).</li>
                        </ul>

                        <div style={H3}>Zoom</div>
                        <ul style={UL_ICON}>
                            <li style={LI1}>
                                <span style={ICON_SLOT}>
                                    <ZoomInIconInline style={ICON_INLINE} />
                                </span>
                                <span style={INLINE_TEXT_SLOT}>
                                    Zoom In increases magnification.
                                </span>
                            </li>
                            <li style={LI1}>
                                <span style={ICON_SLOT}>
                                    <ZoomOutIconInline style={ICON_INLINE} />
                                </span>
                                <span style={INLINE_TEXT_SLOT}>
                                    Zoom Out decreases magnification.
                                </span>
                            </li>
                            <li style={LI1}>
                                Long press / right-click on Zoom Out resets the
                                zoom level.
                            </li>
                        </ul>

                        <div style={H3}>Tools</div>
                        <ul style={UL_ICON}>
                            <li style={LI1}>
                                <span style={ICON_SLOT}>
                                    <PipetteIconInline style={ICON_INLINE} />
                                </span>
                                <span style={INLINE_TEXT_SLOT}>
                                    Eyedropper identifies the palette color of a
                                    pixel. Drawing is disabled while it is
                                    active.
                                </span>
                            </li>
                            <li style={LI1}>
                                <span style={ICON_SLOT}>
                                    <HandIconOffInline style={ICON_INLINE} />
                                </span>
                                <span style={INLINE_TEXT_SLOT}>
                                    Hand tool allows panning when zoomed in.
                                    Drawing is disabled while it is active.
                                </span>
                            </li>
                        </ul>
                        <p style={NOTE}>
                            If your brush strokes are not appearing, make sure
                            the Eyedropper or Hand tool is not active.
                        </p>

                        <div style={HR} />

                        <div style={H2}>6. Palette</div>
                        <p style={P}>
                            The palette is located at the bottom of the screen.
                        </p>
                        <p style={P}>
                            All canvas pixels are linked to palette colors.
                        </p>
                        <p style={P}>
                            Long press / right-click a color swatch to edit it.
                            You can:
                        </p>
                        <ul style={UL}>
                            <li style={LI}>
                                choose a new color from the spectrum
                            </li>
                            <li style={LI}>
                                enter a color value in #HEX format
                            </li>
                            <li style={LI}>make the swatch transparent</li>
                        </ul>
                        <p style={P}>
                            Changing a swatch updates all linked pixels.
                        </p>
                        <p style={P}>
                            You can add custom colors by pressing the green “+”
                            button.
                        </p>
                        <p style={P}>The active color is used for drawing.</p>
                        <p style={P}>
                            Using a transparent color creates a “hole” in the
                            image.
                        </p>

                        <div style={HR} />

                        <div style={H2}>7. Reference Edit Screen</div>

                        <div style={H3_WITH_ICON}>
                            <span style={ICON_SLOT}>
                                <SvgSmartObject
                                    style={{
                                        ...ICON_INLINE,
                                        color: "#C02C66",
                                    }}
                                />
                            </span>
                            <span>Reference Edit Screen</span>
                        </div>
                        <p style={P}>
                            This button opens the reference image editor.
                        </p>
                        <p style={P}>
                            Here you can adjust exposure and contrast, increase
                            or reduce saturation, shift white balance toward
                            warmer or cooler tones, and fine-tune shadows,
                            midtones, and highlights.
                        </p>
                        <p style={P}>
                            All changes are saved — you can return anytime and
                            continue from where you left off.
                        </p>

                        <div style={H3_WITH_ICON}>
                            <span style={ICON_SLOT}>
                                <SvgExportSOButton style={ICON_INLINE} />
                            </span>
                            <span>Export</span>
                        </div>
                        <p style={P}>
                            This button saves the current image to your device
                            as a<code>.png</code> file.
                        </p>

                        {/* небольшой “хвост” для комфортного скролла */}
                        <div style={{ height: 12 }} />
                    </div>
                </div>

                {/* ------------------- FIXED OK BUTTON ------------------- */}
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onClose()
                    }}
                    style={okCancelButtonStyle}
                    className="pxUiAnim"
                    aria-label="OK"
                >
                    <SvgOkButton style={okCancelSvgStyle} />
                </button>
            </div>
        </>
    )
}
export default ManualScreen

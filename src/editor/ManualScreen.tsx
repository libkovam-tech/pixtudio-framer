import * as React from "react"

function SvgOkButton({ style }: { style?: React.CSSProperties }) {
    return (
        <svg
            viewBox="0 0 197.2 197.2"
            preserveAspectRatio="xMidYMid meet"
            width="50"
            height="50"
            style={{ display: "block", ...style }}
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                fill="#04E762"
                d="M166.1,77.4V44.2H155V33.1h-11.1v-11h-11.1V11H99.6V-0.1H77.4V11H44.2v11.1H33.1v11.1h-11v11.1H11v33.2H-0.1
    v22.2H11v33.2h11.1v11h11.1V155h11.1v11.1h33.2v11.1h22.2v-11.1h33.2V155h11v-11.1H155v-11.1h11.1V99.6h11.1V77.4H166.1zz"
            />
            <polygon
                fill="#fff"
                points="84.1,126.8 83.6,126.5 44.2,72.6 58,62.5 84,98 119,50.1 132.8,60.2 "
            />
        </svg>
    )
}

// ------------------- Typography constants -------------------

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

const LI: React.CSSProperties = {
    ...P,
    margin: "0 0 6px 0",
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
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                pointerEvents: "auto",
                fontFamily: FONT_FAMILY,

                // бывшие props Frame:
                width: "100%",
                height: "100%",
                background: "#FAF6E9",
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
                        PIXTUDIO is an editor that transforms ordinary images
                        into pixel art.
                    </p>
                    <p style={P}>You can:</p>
                    <ul style={UL}>
                        <li style={LI}>upload a photo,</li>
                        <li style={LI}>select an image from your gallery,</li>
                        <li style={LI}>take a picture with your camera,</li>
                        <li style={LI}>or start with a blank canvas.</li>
                    </ul>
                    <p style={P}>
                        Once an image appears on the canvas, it is automatically
                        simplified and converted into a pixel grid. The colors
                        of those pixels form the project palette.
                    </p>
                    <p style={NOTE}>
                        <b>Important:</b> every pixel on the canvas is always
                        linked to a color in the palette. Changing a palette
                        color updates all pixels associated with it.
                    </p>

                    <div style={HR} />

                    <div style={H2}>2. Getting Started</div>
                    <p style={P}>To create an image:</p>
                    <ol style={{ ...UL, paddingLeft: 20 }}>
                        <li style={LI}>
                            Click <b>Import</b> in the top menu or use the image
                            / camera icon.
                        </li>
                        <li style={LI}>
                            Choose an image source or create a blank canvas.
                        </li>
                        <li style={LI}>
                            If needed, adjust scale and rotation on the
                            preparation screen and select a preset.
                        </li>
                        <li style={LI}>
                            After the image appears on the canvas, adjust grid
                            size and palette size.
                        </li>
                        <li style={LI}>
                            Edit colors or draw using the brush tool.
                        </li>
                    </ol>
                    <p style={NOTE}>
                        Changing the grid size or the number of palette colors
                        rebuilds the image.
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
                        The canvas displays the image and all changes made to
                        it.
                    </p>
                    <p style={P}>
                        When working on a white or transparent canvas, a helper
                        grid is visible. This grid does not affect the image and
                        is not exported — it is only a visual aid.
                    </p>

                    <div style={HR} />

                    <div style={H2}>4. Canvas Settings</div>
                    <p style={P}>
                        Below the canvas, you will find sliders for:
                    </p>
                    <ul style={UL}>
                        <li style={LI}>Brush size</li>
                        <li style={LI}>
                            Grid size (16–128 cells horizontally and vertically)
                        </li>
                        <li style={LI}>Palette size (10–32 colors)</li>
                    </ul>
                    <p style={P}>
                        Changing the grid or palette size rebuilds the image.
                    </p>
                    <p style={P}>
                        A smaller grid results in larger pixels and a more
                        stylized look. Finding the balance between
                        recognizability and abstraction is part of the creative
                        process.
                    </p>

                    <div style={HR} />

                    <div style={H2}>5. Top Toolbar</div>

                    <div style={H3}>Project</div>
                    <ul style={UL}>
                        <li style={LI}>
                            Saving creates a .pixtudio file containing all
                            project data.
                        </li>
                        <li style={LI}>
                            Loading a project completely replaces the current
                            editor state.
                        </li>
                        <li style={LI}>
                            The undo history is cleared after loading.
                        </li>
                    </ul>

                    <div style={H3}>Undo / Redo</div>
                    <ul style={UL}>
                        <li style={LI}>Undo reverts one action.</li>
                        <li style={LI}>Redo restores one undone action.</li>
                    </ul>

                    <div style={H3}>Import</div>
                    <p style={P}>You can:</p>
                    <ul style={UL}>
                        <li style={LI}>upload JPG/PNG files,</li>
                        <li style={LI}>
                            capture an image using your device camera,
                        </li>
                        <li style={LI}>create a blank transparent canvas.</li>
                    </ul>
                    <p style={P}>
                        Before the image reaches the canvas, a preparation
                        screen appears where you can:
                    </p>
                    <ul style={UL}>
                        <li style={LI}>adjust scale,</li>
                        <li style={LI}>rotate the image,</li>
                        <li style={LI}>choose a preset:</li>
                    </ul>
                    <ul style={{ ...UL, marginTop: -6 }}>
                        <li style={LI}>Default</li>
                        <li style={LI}>Neon</li>
                        <li style={LI}>Grayscale</li>
                        <li style={LI}>Black &amp; White</li>
                    </ul>

                    <div style={H3}>Export</div>
                    <p style={P}>You can export your work as PNG or SVG.</p>
                    <p style={P}>You can also choose what to export:</p>
                    <ul style={UL}>
                        <li style={LI}>brush strokes only,</li>
                        <li style={LI}>the pixelized base image only,</li>
                        <li style={LI}>or both together (default).</li>
                    </ul>

                    <div style={H3}>Zoom</div>
                    <ul style={UL}>
                        <li style={LI}>Zoom In increases magnification.</li>
                        <li style={LI}>Zoom Out decreases magnification.</li>
                        <li style={LI}>
                            Long press / right-click on Zoom Out resets the zoom
                            level.
                        </li>
                    </ul>

                    <div style={H3}>Tools</div>
                    <ul style={UL}>
                        <li style={LI}>
                            Eyedropper identifies the palette color of a pixel.
                            Drawing is disabled while it is active.
                        </li>
                        <li style={LI}>
                            Hand tool allows panning when zoomed in. Drawing is
                            disabled while it is active.
                        </li>
                    </ul>
                    <p style={NOTE}>
                        If your brush strokes are not appearing, make sure the
                        Eyedropper or Hand tool is not active.
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
                        Long press / right-click a color swatch to edit it. You
                        can:
                    </p>
                    <ul style={UL}>
                        <li style={LI}>choose a new color from the spectrum</li>
                        <li style={LI}>enter a color value in #HEX format</li>
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
                        Using a transparent color creates a “hole” in the image.
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
                style={{
                    position: "fixed",
                    left: "50%",
                    bottom: BUTTON_BOTTOM_PX,
                    transform: `translateX(-50%) scale(${BUTTON_SCALE})`,

                    width: BUTTON_BOX_PX,
                    height: BUTTON_BOX_PX,
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    touchAction: "manipulation",
                    zIndex: 10000,
                }}
                aria-label="OK"
            >
                <SvgOkButton style={{ width: "100%", height: "100%" }} />
            </button>
        </div>
    )
}
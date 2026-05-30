import * as React from "react"
import { PIXTUDIO_INK, PIXTUDIO_INK_RGB, pixtudioInk } from "../theme.ts"
import googleSansFlex400Url from "../assets/fonts/GoogleSansFlex-400.ttf?url"
import googleSansFlex500Url from "../assets/fonts/GoogleSansFlex-500.ttf?url"
import googleSansFlex700Url from "../assets/fonts/GoogleSansFlex-700.ttf?url"
import googleSansFlex800Url from "../assets/fonts/GoogleSansFlex-800.ttf?url"

import {
    SvgTopButton3,
    SvgTopButton4,
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
    SvgQuantizationRecorderButton,
} from "./SvgIcons.tsx"

const FONT_FAMILY =
    '"Google Sans Flex", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif'

const BG = "#031219"
const EDITOR_SURFACE_BG = "#e9d8a6"
const PANEL_BG = "rgba(255,255,255,0.98)"
const TEXT = PIXTUDIO_INK
const MUTED = pixtudioInk(0.74)
const RADIUS = 12
const PANEL_RADIUS_STYLE: React.CSSProperties = {
    borderRadius: RADIUS,
}

const SITE_H1: React.CSSProperties = {
    margin: 0,
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: "clamp(46px, 4.35vw, 74px)",
    lineHeight: 0.98,
    fontWeight: 800,
    letterSpacing: 0,
    textTransform: "none",
}

const SITE_CARD_TITLE: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    fontSize: "clamp(32px, 2.45vw, 52px)",
    lineHeight: "calc(0.92em + 3pt)",
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "uppercase",
}

const SITE_CARD_TEXT: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    fontSize: "clamp(14px, 1vw, 20px)",
    lineHeight: 1.24,
    fontWeight: 500,
}

const SITE_TOC_TEXT: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    fontSize: "calc(clamp(14px, 1vw, 20px) * 0.75)",
    lineHeight: 1.24,
    fontWeight: 500,
    letterSpacing: 0,
}

const BACK_LINK_TEXT: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    fontSize: "clamp(18px, 1.35vw, 28px)",
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: 0,
}

const PIX_UI_BUTTON_ANIM_CSS = `
@font-face {
    font-family: "Google Sans Flex";
    src: url("${googleSansFlex400Url}") format("truetype");
    font-style: normal;
    font-weight: 400;
    font-display: swap;
}

@font-face {
    font-family: "Google Sans Flex";
    src: url("${googleSansFlex500Url}") format("truetype");
    font-style: normal;
    font-weight: 500;
    font-display: swap;
}

@font-face {
    font-family: "Google Sans Flex";
    src: url("${googleSansFlex700Url}") format("truetype");
    font-style: normal;
    font-weight: 700;
    font-display: swap;
}

@font-face {
    font-family: "Google Sans Flex";
    src: url("${googleSansFlex800Url}") format("truetype");
    font-style: normal;
    font-weight: 800;
    font-display: swap;
}

.pxUiAnim {
    transition:
        transform 120ms ease,
        filter 120ms ease;
    transform-origin: center;
    will-change: transform, filter;
}

.pxUiAnim:hover:not(:disabled) {
    transform: translateY(-2px) scale(1.05);
    filter: drop-shadow(0 4px 0px rgba(${PIXTUDIO_INK_RGB}, 0.22));
}

.pxUiAnim:active:not(:disabled) {
    transform: translateY(1px) scale(0.97);
    filter: drop-shadow(0 1px 1px rgba(${PIXTUDIO_INK_RGB}, 0.18));
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

.manualScrollHidden {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

.manualScrollHidden::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
}
`

const ICON_INLINE: React.CSSProperties = {
    width: 22,
    height: 22,
    display: "inline-block",
    verticalAlign: "middle",
}

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

function PipetteIconInline({ style }: { style?: React.CSSProperties }) {
    const s = { ...ICON_INLINE, ...style }
    const size = typeof s.width === "number" ? s.width : 20
    return (
        <span style={s}>
            <PipetteIcon size={size} />
        </span>
    )
}

function HandIconInline({ style }: { style?: React.CSSProperties }) {
    const s = { ...ICON_INLINE, ...style }
    const size = typeof s.width === "number" ? s.width : 24
    return (
        <span style={s}>
            <HandIconOff size={size} />
        </span>
    )
}

function QuantizationRecorderIconInline({
    style,
}: {
    style?: React.CSSProperties
}) {
    return (
        <span
            style={{
                width: 24,
                height: 24,
                display: "grid",
                placeItems: "center",
                transform: "translateX(-3px)",
                ...style,
            }}
        >
            <SvgQuantizationRecorderButton
                style={{
                    width: 24,
                    height: 24,
                    display: "block",
                }}
            />
        </span>
    )
}

type ManualSection = {
    id: string
    title: string
    navLabel: string
    icon?: React.ReactNode
    content: React.ReactNode
}

function SectionCopy({
    children,
    muted = false,
}: {
    children: React.ReactNode
    muted?: boolean
}) {
    return (
        <p
            style={{
                margin: 0,
                color: muted ? MUTED : TEXT,
                ...SITE_CARD_TEXT,
            }}
        >
            {children}
        </p>
    )
}

function BulletList({
    items,
}: {
    items: React.ReactNode[]
}) {
    return (
        <ul
            style={{
                margin: 0,
                paddingLeft: 24,
                display: "grid",
                gap: 6,
                color: TEXT,
                ...SITE_CARD_TEXT,
            }}
        >
            {items.map((item, idx) => (
                <li key={idx}>{item}</li>
            ))}
        </ul>
    )
}

function OrderedList({
    items,
}: {
    items: React.ReactNode[]
}) {
    return (
        <ol
            style={{
                margin: 0,
                paddingLeft: 24,
                display: "grid",
                gap: 6,
                color: TEXT,
                ...SITE_CARD_TEXT,
            }}
        >
            {items.map((item, idx) => (
                <li key={idx}>{item}</li>
            ))}
        </ol>
    )
}

function SectionStack({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                display: "grid",
                gap: 14,
            }}
        >
            {children}
        </div>
    )
}

export function ManualScreen({ onClose }: { onClose: () => void }) {
    const [viewportWidth, setViewportWidth] = React.useState(() =>
        typeof window === "undefined" ? 1440 : window.innerWidth
    )
    const [viewportHeight, setViewportHeight] = React.useState(() =>
        typeof window === "undefined" ? 900 : window.innerHeight
    )
    const [activeId, setActiveId] = React.useState("about")
    const [navScale, setNavScale] = React.useState(1)
    const [navBox, setNavBox] = React.useState({ width: 0, height: 0 })
    const [navHighlight, setNavHighlight] = React.useState<{
        top: number
        left: number
        width: number
        height: number
    } | null>(null)
    const cardScrollRef = React.useRef<HTMLDivElement | null>(null)
    const navInnerRef = React.useRef<HTMLDivElement | null>(null)
    const navItemRefs = React.useRef<Record<string, HTMLAnchorElement | null>>(
        {}
    )
    const sectionRefs = React.useRef<Record<string, HTMLElement | null>>({})

    const isNarrow = viewportWidth < 980

    React.useEffect(() => {
        const onResize = () => {
            setViewportWidth(window.innerWidth)
            setViewportHeight(window.innerHeight)
        }
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [])

    const sections = React.useMemo<ManualSection[]>(
        () => [
            {
                id: "about",
                title: "What is PIXTUDIO",
                navLabel: "About",
                content: (
                    <SectionStack>
                        <SectionCopy>
                            PIXTUDIO is an editor that transforms ordinary
                            images into editable pixel art.
                        </SectionCopy>
                        <SectionCopy>
                            You can:
                        </SectionCopy>
                        <BulletList
                            items={[
                                "upload a photo,",
                                "select an image from your gallery,",
                                "take a picture with your camera,",
                                "or start with a blank canvas.",
                            ]}
                        />
                        <SectionCopy>
                            Once an image appears on the canvas, it is
                            automatically simplified and converted into a pixel
                            grid. The image keeps a reference source behind the
                            scenes, so grid size, palette size, palette
                            presets, and Smart Object adjustments can rebuild
                            the pixel result without destroying the source.
                        </SectionCopy>
                        <SectionCopy muted>
                            <b style={{ color: TEXT }}>Important:</b> every
                            visible pixel is linked to a palette color. Editing
                            a palette swatch updates every pixel associated with
                            it, while brush strokes stay editable as their own
                            layer.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "getting-started",
                title: "Getting Started",
                navLabel: "Getting Started",
                content: (
                    <SectionStack>
                        <SectionCopy>To create an image:</SectionCopy>
                        <OrderedList
                            items={[
                                <>
                                    Click <b>Import</b> in the top menu or use
                                    the image / camera icon.
                                </>,
                                "Choose an image source or create a blank canvas.",
                                "If needed, crop, move, rotate, or scale the image on the preparation screen.",
                                "After the image appears on the canvas, adjust grid size and palette size.",
                                "Edit colors, apply a palette preset, refine the source image, or draw using the brush tool.",
                            ]}
                        />
                        <SectionCopy>
                            A new import starts a fresh editor session: the view
                            returns to fit-to-canvas, the default brush tool is
                            restored, and temporary tool states such as Hand or
                            Eyedropper are cleared.
                        </SectionCopy>
                        <SectionCopy muted>
                            Palette presets are applied after import from the
                            Palette Presets tab. The crop screen stays neutral.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "main-screen",
                title: "Main Screen",
                navLabel: "Main Screen",
                content: (
                    <SectionStack>
                        <SectionCopy>
                            The main screen consists of four parts:
                        </SectionCopy>
                        <BulletList
                            items={[
                                "Top toolbar",
                                "Canvas",
                                "Canvas settings panel",
                                "Auto Palette / Palette Presets",
                            ]}
                        />
                        <SectionCopy>
                            The canvas displays the image and every change made
                            to it.
                        </SectionCopy>
                        <SectionCopy>
                            The brush is the default drawing tool. On desktop,
                            you can zoom with the mouse wheel when the cursor is
                            over the canvas. On mobile, use a two-finger pinch
                            gesture to zoom. In both cases, zoom cannot go below
                            fit-to-canvas.
                        </SectionCopy>
                        <SectionCopy>
                            On desktop, holding the Space key temporarily turns
                            on the Hand tool while the cursor is over the
                            canvas. Releasing Space returns to the brush.
                        </SectionCopy>
                        <SectionCopy>
                            When working on a white or transparent canvas, a
                            helper grid is visible. This grid does not affect
                            the image and is not exported. It is only a visual
                            aid.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "canvas-settings",
                title: "Canvas Settings",
                navLabel: "Canvas Settings",
                content: (
                    <SectionStack>
                        <SectionCopy>
                            Below the canvas, you will find sliders for:
                        </SectionCopy>
                        <BulletList
                            items={[
                                "Brush size",
                                "Grid size (2-128 cells horizontally and vertically)",
                                "Auto Palette size (2-32 colors)",
                            ]}
                        />
                        <SectionCopy>
                            Changing the grid size rebuilds the image. Changing
                            the palette size rebuilds the Auto Palette world.
                        </SectionCopy>
                        <SectionCopy>
                            A smaller grid results in larger pixels and a more
                            stylized look. Finding the balance between
                            recognizability and abstraction is part of the
                            creative process.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "palette",
                title: "Palette",
                navLabel: "Palette",
                content: (
                    <SectionStack>
                        <SectionCopy>
                            The palette area is located at the bottom of the
                            screen and has two tabs: Auto Palette and Palette
                            Presets.
                        </SectionCopy>
                        <SectionCopy>
                            All canvas pixels are linked to palette colors.
                        </SectionCopy>
                        <SectionCopy>
                            PIXTUDIO can read the colors of the same image in
                            two different ways: it can build a palette
                            automatically from the image, or it can apply a
                            palette that does not come from the current image.
                        </SectionCopy>
                        <SectionCopy>
                            <b>Auto Palette</b> is the default mode. It lets
                            you control the number of colors with the Palette
                            Size slider, from 2 to 32 colors.
                        </SectionCopy>
                        <SectionCopy>
                            In Auto Palette, you can edit palette colors, make a
                            swatch transparent, and add custom user swatches.
                            Long press or right-click a swatch to open Swatch
                            Edit.
                        </SectionCopy>
                        <BulletList
                            items={[
                                "choose a color from the spectrum",
                                "enter a #HEX value by hand",
                                "make the swatch transparent",
                            ]}
                        />
                        <SectionCopy>
                            When you edit an Auto Palette swatch, every canvas
                            pixel linked to that swatch changes with it.
                        </SectionCopy>
                        <SectionCopy>
                            <b>Palette Presets</b> let you apply a different
                            color palette to the image. Built-in presets, such
                            as Sunset, Gray, and Black/White, work as ready-made
                            styles and do not show their internal swatches.
                        </SectionCopy>
                        <SectionCopy>
                            Palettes loaded from images or saved project files
                            become temporary preset buttons. Any image can be
                            used as a palette source, including palette images
                            from color websites, for example popular palette
                            images from{" "}
                            <a
                                href="https://coolors.co/palettes/trending"
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: TEXT, fontWeight: 700 }}
                            >
                                Coolors
                            </a>
                            .
                        </SectionCopy>
                        <SectionCopy>
                            When an imported preset is active, its swatches are
                            shown below the preset buttons. You can edit those
                            swatches, delete a swatch from the active imported
                            palette, and add a custom color with the same Add
                            Swatch button used in Auto Palette. Added colors
                            participate in quantization, so the image can be
                            rebuilt with the imported palette plus your new
                            color.
                        </SectionCopy>
                        <SectionCopy>
                            Imported palette presets exist only during the
                            current session unless they are active when you save
                            the project. You can remove an imported or built-in
                            palette button by pressing the cross on the right
                            side of the button.
                        </SectionCopy>
                        <SectionCopy>
                            When you save a project, PIXTUDIO stores only the
                            palette state that is active at that moment. If Auto
                            Palette is active, that palette is saved. If an
                            imported palette is active, it is stored inside the
                            project file. If a built-in preset is active, only
                            the preset id is saved; the built-in palette is not
                            stored as an imported palette.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "save-project",
                title: "Save Project",
                navLabel: "Save Project",
                icon: <SaveIconInline />,
                content: (
                    <SectionStack>
                        <SectionCopy>
                            Saving creates a <code>.pixtudio</code> file
                            containing all project data: image, palette,
                            drawing, Smart Object state, active palette world,
                            and editor settings.
                        </SectionCopy>
                        <SectionCopy>
                            Use it when you want to continue working later
                            without losing the project state.
                        </SectionCopy>
                        <SectionCopy>
                            A <code>.pixtudio</code> file can also be used as a
                            palette source. In the Palette Presets tab, choose{" "}
                            <b>Load Palette</b> and select a saved project file
                            to import its palette into the current project.
                        </SectionCopy>
                        <SectionCopy muted>
                            Save Project is different from Export: it saves an
                            editable project, not a final PNG, SVG, or video
                            file.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "load-project",
                title: "Load Project",
                navLabel: "Load Project",
                icon: <LoadIconInline />,
                content: (
                    <SectionStack>
                        <SectionCopy>
                            Loading a project completely replaces the current
                            editor state with the contents of a saved{" "}
                            <code>.pixtudio</code> file.
                        </SectionCopy>
                        <SectionCopy>
                            The saved grid, palette, drawings, imported palette
                            state, and Smart Object adjustments are restored
                            together.
                        </SectionCopy>
                        <SectionCopy muted>
                            The undo history is cleared after loading.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "undo",
                title: "Undo",
                navLabel: "Undo",
                icon: <UndoIconInline />,
                content: (
                    <SectionStack>
                        <SectionCopy>
                            Undo reverts one action in the editor.
                        </SectionCopy>
                        <SectionCopy>
                            It is useful when you need to step back through
                            brush strokes, palette edits, or image adjustments.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "redo",
                title: "Redo",
                navLabel: "Redo",
                icon: <RedoIconInline />,
                content: (
                    <SectionStack>
                        <SectionCopy>
                            Redo restores one action that was previously
                            undone.
                        </SectionCopy>
                        <SectionCopy>
                            Use it to move forward again after stepping back
                            with Undo.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "import",
                title: "Import",
                navLabel: "Import",
                icon: <SvgTopButton3 style={ICON_INLINE} />,
                content: (
                    <SectionStack>
                        <SectionCopy>You can:</SectionCopy>
                        <BulletList
                            items={[
                                "upload JPG/PNG files,",
                                "capture an image using your device camera,",
                                "create a blank transparent canvas.",
                            ]}
                        />
                        <SectionCopy>
                            Before the image reaches the canvas, a preparation
                            screen appears where you can adjust scale, rotate
                            the image, and crop it to the square working area.
                        </SectionCopy>
                        <SectionCopy>
                            Drag inside the crop area to position the image. Use
                            the rotate and scale controls, the mouse wheel on
                            desktop, or two fingers on touch devices to refine
                            the crop before applying it.
                        </SectionCopy>
                        <SectionCopy muted>
                            Import does not apply a color preset. Use Palette
                            Presets after the image reaches the editor.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "export",
                title: "Export",
                navLabel: "Export",
                icon: <SvgTopButton4 style={ICON_INLINE} />,
                content: (
                    <SectionStack>
                        <SectionCopy>
                            You can export your work as PNG, SVG, or XLSX.
                            ZIP packages all three files into one archive.
                        </SectionCopy>
                        <SectionCopy>
                            PNG is useful for social media and web use. SVG is
                            better for high-quality printing and merch. XLSX
                            turns the canvas into colored Excel cells for office
                            tasks, report decoration, and unusual spreadsheet
                            headers.
                        </SectionCopy>
                        <SectionCopy>
                            Before exporting, choose which layers to include:
                        </SectionCopy>
                        <BulletList
                            items={[
                                "Stroke layer: only what was painted with the brush, including transparency.",
                                "Image layer: only the quantized base image, without brush strokes.",
                                "Both layers: brush strokes composited over the image.",
                            ]}
                        />
                        <SectionCopy muted>
                            A transparent brush stroke creates holes in the
                            exported composite.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "zoom-out",
                title: "Zoom Out",
                navLabel: "Zoom Out",
                icon: <ZoomOutIconInline />,
                content: (
                    <SectionStack>
                        <SectionCopy>
                            Zoom Out decreases magnification so you can see a
                            larger portion of the image.
                        </SectionCopy>
                        <SectionCopy>
                            On desktop, the mouse wheel also zooms in and out
                            when the cursor is inside the canvas. Zoom Out never
                            makes the image smaller than fit-to-canvas.
                        </SectionCopy>
                        <SectionCopy muted>
                            Long press or right-click on Zoom Out resets the
                            zoom level.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "zoom-in",
                title: "Zoom In",
                navLabel: "Zoom In",
                icon: <ZoomInIconInline />,
                content: (
                    <SectionStack>
                        <SectionCopy>
                            Zoom In increases magnification for more precise
                            work on individual pixels.
                        </SectionCopy>
                        <SectionCopy>
                            On mobile, use a two-finger pinch gesture on the
                            canvas to zoom in or out. Brush drawing is blocked
                            while the two-finger gesture is active.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "eyedropper",
                title: "Eyedropper",
                navLabel: "Eyedropper",
                icon: <PipetteIconInline />,
                content: (
                    <SectionStack>
                        <SectionCopy>
                            Eyedropper identifies the palette color of a pixel.
                        </SectionCopy>
                        <SectionCopy>
                            Drawing is disabled while this tool is active.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "hand",
                title: "Hand",
                navLabel: "Hand",
                icon: <HandIconInline />,
                content: (
                    <SectionStack>
                        <SectionCopy>
                            Hand tool allows panning when the canvas is zoomed
                            in.
                        </SectionCopy>
                        <SectionCopy>
                            On desktop, you can also hold Space while the cursor
                            is inside the canvas to use the Hand tool
                            temporarily. Releasing Space returns to the brush.
                        </SectionCopy>
                        <SectionCopy>
                            Drawing is disabled while this tool is active.
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "quantization-recorder",
                title: "Quantization Recorder",
                navLabel: "Quantization Recorder",
                icon: <QuantizationRecorderIconInline />,
                content: (
                    <SectionStack>
                        <SectionCopy>
                            This button opens the screen for recording the
                            image pixelation process.
                        </SectionCopy>
                        <SectionCopy>
                            It is available when the project has an imported
                            image source. In the recorder, you can animate grid
                            size, palette size, or both. You can also lock one
                            value and animate only the other.
                        </SectionCopy>
                        <SectionCopy>
                            The recorder lets you set the duration, preview the
                            sequence, add an optional audio track, and export
                            the result as a video file.
                        </SectionCopy>
                        <SectionCopy>
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "flex-start",
                                    gap: 8,
                                }}
                            >
                                <SvgExportSOButton
                                    style={{
                                        ...ICON_INLINE,
                                        width: 22,
                                        height: 22,
                                        flex: "0 0 auto",
                                        transform: "translateY(2px)",
                                    }}
                                />
                                <span>
                                    This button saves the current video sequence
                                    to your device as an <code>.mp4</code> file,
                                    ready to publish online without additional
                                    conversion.
                                </span>
                            </span>
                        </SectionCopy>
                    </SectionStack>
                ),
            },
            {
                id: "reference-edit-screen",
                title: "Reference Edit Screen",
                navLabel: "Reference Edit Screen",
                icon: (
                    <span
                        style={{
                            width: 24,
                            height: 24,
                            display: "grid",
                            placeItems: "center",
                            transform: "translateX(-3px)",
                        }}
                    >
                        <SvgSmartObject
                            style={{
                                width: 24,
                                height: 24,
                                display: "block",
                                color: "#C02C66",
                            }}
                        />
                    </span>
                ),
                content: (
                    <SectionStack>
                        <SectionCopy>
                            This button opens the Smart Object / reference image
                            editor.
                        </SectionCopy>
                        <SectionCopy>
                            Here you can adjust exposure and contrast, increase
                            or reduce saturation, shift white balance toward
                            warmer or cooler tones, and fine-tune shadows,
                            midtones, and highlights.
                        </SectionCopy>
                        <SectionCopy>
                            These changes are non-destructive. Apply publishes
                            the adjusted reference back to the pixel editor,
                            Cancel leaves the previous reference unchanged, and
                            the saved project keeps the applied Smart Object
                            state.
                        </SectionCopy>
                        <SectionCopy>
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "flex-start",
                                    gap: 8,
                                }}
                            >
                                <SvgExportSOButton
                                    style={{
                                        ...ICON_INLINE,
                                        width: 22,
                                        height: 22,
                                        flex: "0 0 auto",
                                        transform: "translateY(2px)",
                                    }}
                                />
                                <span>
                                    This button also allows you to save the
                                    current reference image to your device as a{" "}
                            <code>.png</code> file.
                                </span>
                            </span>
                        </SectionCopy>
                    </SectionStack>
                ),
            },
        ],
        []
    )

    React.useLayoutEffect(() => {
        const el = navInnerRef.current
        if (!el) return

        const recompute = () => {
            const naturalWidth = Math.ceil(el.scrollWidth)
            const naturalHeight = Math.ceil(el.scrollHeight)
            const reservedTop = isNarrow ? 18 : 28
            const reservedBottom = 108
            const availableHeight = Math.max(
                120,
                viewportHeight - reservedTop - reservedBottom
            )
            const nextScale =
                naturalHeight > 0
                    ? Math.min(1, availableHeight / naturalHeight)
                    : 1

            setNavBox((prev) =>
                prev.width === naturalWidth && prev.height === naturalHeight
                    ? prev
                    : { width: naturalWidth, height: naturalHeight }
            )
            setNavScale((prev) =>
                Math.abs(prev - nextScale) < 0.001 ? prev : nextScale
            )
        }

        recompute()

        const ro = new ResizeObserver(() => recompute())
        ro.observe(el)

        return () => ro.disconnect()
    }, [sections, isNarrow, viewportHeight, viewportWidth])

    React.useLayoutEffect(() => {
        const root = cardScrollRef.current
        if (!root) return

        let raf = 0

        const syncActiveSection = () => {
            if (raf) window.cancelAnimationFrame(raf)
            raf = window.requestAnimationFrame(() => {
                const rootRect = root.getBoundingClientRect()
                const activationTop = rootRect.top + 6
                const activationBottom = rootRect.bottom

                const visible = sections
                    .map((section) => {
                        const node = sectionRefs.current[section.id]
                        if (!node) return null
                        const rect = node.getBoundingClientRect()
                        if (
                            rect.bottom <= activationTop ||
                            rect.top >= activationBottom
                        ) {
                            return null
                        }
                        return {
                            id: section.id,
                            top: rect.top,
                        }
                    })
                    .filter(
                        (
                            item
                        ): item is {
                            id: string
                            top: number
                        } => item != null
                    )
                    .sort((a, b) => a.top - b.top)

                const nextId = visible[0]?.id
                if (nextId) {
                    setActiveId((prev) => (prev === nextId ? prev : nextId))
                }
            })
        }

        syncActiveSection()
        root.addEventListener("scroll", syncActiveSection, { passive: true })
        window.addEventListener("resize", syncActiveSection)

        return () => {
            if (raf) window.cancelAnimationFrame(raf)
            root.removeEventListener("scroll", syncActiveSection)
            window.removeEventListener("resize", syncActiveSection)
        }
    }, [sections, viewportHeight, viewportWidth])

    React.useLayoutEffect(() => {
        const item = navItemRefs.current[activeId]
        if (!item) {
            setNavHighlight(null)
            return
        }

        const navInner = navInnerRef.current
        const rawLeft = isNarrow ? item.offsetLeft - 6 : item.offsetLeft - 9
        const rawWidth = isNarrow ? item.offsetWidth + 12 : item.offsetWidth + 18
        const safeLeft = Math.max(0, rawLeft)
        const maxWidth =
            isNarrow && navInner
                ? Math.max(0, navInner.clientWidth - safeLeft - 6)
                : rawWidth

        const next = {
            top: item.offsetTop - 5,
            left: safeLeft,
            width: Math.min(rawWidth, maxWidth),
            height: item.offsetHeight + 10,
        }

        setNavHighlight((prev) => {
            if (
                prev &&
                Math.abs(prev.top - next.top) < 0.5 &&
                Math.abs(prev.left - next.left) < 0.5 &&
                Math.abs(prev.width - next.width) < 0.5 &&
                Math.abs(prev.height - next.height) < 0.5
            ) {
                return prev
            }
            return next
        })
    }, [activeId, isNarrow, navBox.height, navBox.width, navScale, sections])

    const scrollToSection = React.useCallback((id: string) => {
        const root = cardScrollRef.current
        const node = sectionRefs.current[id]
        if (!root || !node) return
        setActiveId(id)
        const rootRect = root.getBoundingClientRect()
        const nodeRect = node.getBoundingClientRect()
        const nextTop = root.scrollTop + (nodeRect.top - rootRect.top)

        root.scrollTo({
            top: Math.max(0, nextTop),
            behavior: "smooth",
        })
    }, [])

    const desktopGutter = isNarrow
        ? 18
        : Math.max(80, Math.min(500, Math.floor((viewportWidth - 760) / 2)))
    const contentBottomInset = isNarrow ? 28 : 28
    const desktopBackLeft = Math.max(40, Math.round(desktopGutter * 0.22))
    const navViewportHeight =
        navBox.height > 0 ? Math.round(navBox.height * navScale) : 0
    const desktopNavColumnWidth = 236

    const navBase: React.CSSProperties = {
        display: "grid",
        gap: isNarrow ? 10 : 12,
        padding: isNarrow ? "14px 12px" : "26px 20px",
        boxSizing: "border-box",
        width: isNarrow ? "100%" : "max-content",
    }

    return (
        <>
            <style>{PIX_UI_BUTTON_ANIM_CSS}</style>

            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    background: BG,
                    color: "#ffffff",
                    overflow: "hidden",
                    fontFamily: FONT_FAMILY,
                }}
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                }}
            >
                {!isNarrow ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onClose()
                        }}
                        style={{
                            position: "absolute",
                            left: desktopBackLeft,
                            top: 36,
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: EDITOR_SURFACE_BG,
                            ...BACK_LINK_TEXT,
                            textDecoration: "underline",
                            textUnderlineOffset: 2,
                            textAlign: "left",
                            zIndex: 1,
                        }}
                        aria-label="Back to editor"
                    >
                        Back to Editor
                    </button>
                ) : null}

                <div
                    style={{
                        position: "absolute",
                        left: desktopGutter,
                        right: desktopGutter,
                        top: isNarrow ? 18 : 28,
                        bottom: contentBottomInset,
                        display: "grid",
                        gridTemplateRows: "auto minmax(0, 1fr)",
                        gap: isNarrow ? 18 : 22,
                        boxSizing: "border-box",
                        minWidth: 0,
                    }}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: isNarrow
                                ? "1fr"
                                : "1fr",
                            alignItems: isNarrow ? "start" : "end",
                            gap: isNarrow ? 30 : 36,
                            minWidth: 0,
                        }}
                    >
                        {isNarrow ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    onClose()
                                }}
                                style={{
                                    border: "none",
                                    background: "transparent",
                                    padding: 0,
                                    margin: 0,
                                    cursor: "pointer",
                                    color: EDITOR_SURFACE_BG,
                                    ...BACK_LINK_TEXT,
                                    textDecoration: "underline",
                                    textUnderlineOffset: 2,
                                    justifySelf: "start",
                                    textAlign: "left",
                                }}
                                aria-label="Back to editor"
                            >
                                Back to Editor
                            </button>
                        ) : null}

                        <h1
                            style={{
                                ...SITE_H1,
                                fontSize: isNarrow
                                    ? "clamp(32px, 9vw, 48px)"
                                    : SITE_H1.fontSize,
                                textAlign: "left",
                                minWidth: 0,
                            }}
                        >
                            PIXTUDIO - User Guide
                        </h1>
                    </div>

                    <div
                        style={{
                            minWidth: 0,
                            minHeight: 0,
                            display: "grid",
                            gridTemplateColumns: isNarrow
                                ? "minmax(0, 1fr)"
                                : `${desktopNavColumnWidth}px minmax(0, 1fr)`,
                            gap: isNarrow ? 14 : 36,
                            alignItems: "start",
                            height:
                                isNarrow || navViewportHeight <= 0
                                    ? "100%"
                                    : navViewportHeight,
                        }}
                    >
                        {!isNarrow ? (
                            <aside
                                style={{
                                    position: "sticky",
                                    top: 0,
                                    alignSelf: "start",
                                    background: "transparent",
                                    border: 0,
                                    borderRadius: 0,
                                    width: desktopNavColumnWidth,
                                    height:
                                        navBox.height > 0
                                            ? navBox.height * navScale
                                            : "auto",
                                    overflow: "visible",
                                }}
                            >
                                <div
                                    ref={navInnerRef}
                                    style={{
                                        ...navBase,
                                        position: "relative",
                                        transform: `scale(${navScale})`,
                                        transformOrigin: "top left",
                                    }}
                                >
                                    {navHighlight ? (
                                        <div
                                            aria-hidden="true"
                                            style={{
                                                position: "absolute",
                                                left: 0,
                                                top: 0,
                                                width: navHighlight.width,
                                                height: navHighlight.height,
                                                transform: `translate(${navHighlight.left}px, ${navHighlight.top}px)`,
                                                background: "#ffffff",
                                                borderRadius: 0,
                                                transition:
                                                    "transform 180ms ease, width 180ms ease, height 180ms ease",
                                                pointerEvents: "none",
                                                zIndex: 0,
                                            }}
                                        />
                                    ) : null}

                                    {sections.map((section, idx) => {
                                        const active = section.id === activeId
                                        const isIconRow = !!section.icon
                                        const addTopGap =
                                            idx === 5 || idx === 16

                                        return (
                                            <a
                                                key={section.id}
                                                ref={(node) => {
                                                    navItemRefs.current[
                                                        section.id
                                                    ] = node
                                                }}
                                                href={`#manual-${section.id}`}
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    scrollToSection(section.id)
                                                }}
                                                style={{
                                                    display: "flex",
                                                    position: "relative",
                                                    zIndex: 1,
                                                    alignItems: "center",
                                                    gap: isIconRow ? 10 : 0,
                                                    marginTop: addTopGap
                                                        ? 8
                                                        : 0,
                                                    minWidth: 0,
                                                    maxWidth: "100%",
                                                    boxSizing: "border-box",
                                                    color: active
                                                        ? TEXT
                                                        : "#ffffff",
                                                    textDecoration: "none",
                                                    ...SITE_TOC_TEXT,
                                                    fontWeight: active
                                                        ? 800
                                                        : 500,
                                                    opacity: active ? 1 : 0.9,
                                                }}
                                            >
                                                {section.icon ? (
                                                    <span
                                                        style={{
                                                            width: 30,
                                                            minWidth: 30,
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            justifyContent:
                                                                "center",
                                                        }}
                                                    >
                                                        {section.icon}
                                                    </span>
                                                ) : null}
                                                <span
                                                    style={{
                                                        display: "block",
                                                        minWidth: 0,
                                                        flex: "1 1 auto",
                                                        whiteSpace: "nowrap",
                                                        overflowWrap:
                                                            "break-word",
                                                    }}
                                                >
                                                    {section.navLabel}
                                                </span>
                                            </a>
                                        )
                                    })}
                                </div>
                            </aside>
                        ) : null}

                        <main
                            style={{
                                minHeight: 0,
                                minWidth: 0,
                                height:
                                    isNarrow || navViewportHeight <= 0
                                        ? "100%"
                                        : navViewportHeight,
                            }}
                        >
                            <section
                                className="manualScrollHidden"
                                style={{
                                    overflowY: "auto",
                                    overscrollBehavior: "contain",
                                    WebkitOverflowScrolling: "touch",
                                    minHeight: 0,
                                    height: "100%",
                                    paddingRight: isNarrow ? 0 : 4,
                                    paddingBottom: isNarrow ? 16 : 0,
                                    display: "grid",
                                    gap: isNarrow ? 14 : 18,
                                    alignContent: "start",
                                }}
                                ref={cardScrollRef}
                            >
                                {sections.map((section) => (
                                    <article
                                        key={section.id}
                                        id={`manual-${section.id}`}
                                        data-manual-id={section.id}
                                        ref={(node) => {
                                            sectionRefs.current[section.id] =
                                                node
                                        }}
                                        style={{
                                            background: PANEL_BG,
                                            border: 0,
                                            ...PANEL_RADIUS_STYLE,
                                        padding: isNarrow
                                            ? "18px 16px"
                                            : "26px 28px",
                                        boxSizing: "border-box",
                                        width: "100%",
                                    }}
                                >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: section.icon ? 10 : 0,
                                                marginBottom: 18,
                                                minWidth: 0,
                                            }}
                                        >
                                            {section.icon ? (
                                                <span
                                                    style={{
                                                        width: 30,
                                                        minWidth: 30,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent:
                                                            "center",
                                                    }}
                                                >
                                                    {section.icon}
                                                </span>
                                            ) : null}
                                            <div
                                                style={{
                                                    ...SITE_CARD_TITLE,
                                                    fontSize: isNarrow
                                                        ? "clamp(28px, 8.6vw, 42px)"
                                                        : SITE_CARD_TITLE.fontSize,
                                                    minWidth: 0,
                                                    color: TEXT,
                                                }}
                                            >
                                                {section.title}
                                            </div>
                                        </div>

                                        {section.content}
                                    </article>
                                ))}
                            </section>
                        </main>
                    </div>
                </div>

            </div>
        </>
    )
}

export default ManualScreen

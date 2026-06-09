import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { SiteCloseCrossIcon } from "../editor/SvgIcons"
import { SiteShell } from "./SiteShell"
import {
  JsonLd,
  SITE_OG_IMAGE_URL,
  SITE_ROUTE_SEO,
  SITE_SCHEMA_IDS,
  createBreadcrumbList,
  toAbsoluteSiteUrl,
  usePageSeo,
} from "./structuredData"
import "./hub.css"

type HowModalCopy = {
  title: string
  paragraphs: string[]
}

const HOW_MODAL_COPY: HowModalCopy[] = [
  {
    title: "Start with a Photo",
    paragraphs: [
      "Tap the Open icon on the home screen or in the top menu. All supported files open from the same place - choose an image, crop it to a square, rotate or scale if needed.",
      "PIXTUDIO instantly converts it into beautiful pixel art. Discover your familiar photos from a fresh, unexpected new side - often revealing charm you never noticed before.",
    ],
  },
  {
    title: "Shoot with Camera",
    paragraphs: [
      "Tap the Camera icon on the home screen or the separate Camera button in the top menu. Take a photo directly with your device, crop it to a square, rotate or scale if needed.",
      "Watch as your photo transforms into pixel art in real time - great for spontaneous ideas and quick creative experiments.",
    ],
  },
  {
    title: "Draw from a Blank Canvas",
    paragraphs: [
      "Tap the Blank Canvas icon on the home screen, or open the top-menu Open panel in the editor and choose Blank Canvas. Choose your brush size and start drawing with colors from the auto palette or import your own.",
      "Perfect when you want to create original pixel art completely from scratch and enjoy the pure creative process.",
    ],
  },
  {
    title: "Save Your Project",
    paragraphs: [
      "Tap the Save icon in the top menu anytime.",
      "Save your work as a .pixtudio file so you can continue editing later or share the editable project with friends. Everything is restored exactly as you left it.",
    ],
  },
  {
    title: "Open a Saved Project",
    paragraphs: [
      "Tap the Open icon on the home screen or in the top menu, then select your .pixtudio file.",
      "Quickly return to any of your projects and continue right where you stopped.",
    ],
  },
  {
    title: "Export Your Pixel Art",
    paragraphs: [
      "Tap the Export icon in the top menu.",
      "Export as PNG for social media and web use, SVG for high-quality printing and merch, XLSX for office tasks and spreadsheet decoration, or ZIP to package PNG, SVG, and XLSX together. You can export the base pixel art, your brush drawings, or everything together.",
    ],
  },
  {
    title: "Edit Color Swatches",
    paragraphs: [
      "Click or long-tap any color in the palette.",
      "Change a color, make a swatch transparent, or delete it from the palette. All connected pixels on the canvas update instantly, making experiments with different moods and styles fast and satisfying.",
    ],
  },
  {
    title: "Add New Custom Colors",
    paragraphs: [
      "Tap the Add Swatch button in the palette.",
      "Create your own colors that stay exactly where you placed them - giving you full control and creative freedom even when changing grid size.",
    ],
  },
  {
    title: "Apply Custom Palette",
    paragraphs: [
      "Go to the Palette Presets tab and import a palette from any image or saved project.",
      "Instantly give your artwork a completely new look using your own colors or built-in presets (Sunset, Grayscale, Black & White).",
    ],
  },
  {
    title: "Fine-Tune the Source Image",
    paragraphs: [
      "Tap the reference image button below the canvas to open image adjustment controls.",
      "Non-destructively adjust Exposure, Highlights, Midtones, Shadows, Saturation, and White Balance. These live adjustments let you perfect the mood and quality of the original image before turning it into pixel art.",
    ],
  },
  {
    title: "Record Pixelization Video",
    paragraphs: [
      "Tap the Pixelization Record button below the canvas.",
      "Create a beautiful timelapse video of the pixelization process. Adjust grid and palette ranges, direction, duration, add an audio track, and export as MP4 - perfect for TikTok, Instagram Reels, and YouTube Shorts.",
    ],
  },
  {
    title: "User Manual",
    paragraphs: [
      "Tap the Manual icon in the top menu.",
      "Open the full in-app guide that explains every tool and button - always there when you need help.",
    ],
  },
]

const HOW_BLUEPRINT_CARD_CLASSES = [
  "siteHowItWorksBlueprintCardStartWithPhoto",
  "siteHowItWorksBlueprintCardShootWithCamera",
  "siteHowItWorksBlueprintCardDrawFromBlankCanvas",
  "siteHowItWorksBlueprintCardSaveYourProject",
  "siteHowItWorksBlueprintCardOpenSavedProject",
  "siteHowItWorksBlueprintCardExportPixelArt",
  "siteHowItWorksBlueprintCardEditColorSwatches",
  "siteHowItWorksBlueprintCardAddCustomColors",
  "siteHowItWorksBlueprintCardApplyCustomPalette",
  "siteHowItWorksBlueprintCardFineTuneSourceImage",
  "siteHowItWorksBlueprintCardRecordPixelizationVideo",
  "siteHowItWorksBlueprintCardUserManual",
] as const

export default function HowItWorksPage() {
  usePageSeo(SITE_ROUTE_SEO.how)

  const cardsRef = useRef<HTMLDivElement | null>(null)
  const mobileScrollbarRef = useRef<HTMLDivElement | null>(null)
  const mobileScrollbarThumbRef = useRef<HTMLSpanElement | null>(null)
  const mobileScrollbarDragRef = useRef<{
    pointerId: number
    grabOffset: number
  } | null>(null)
  const [activeModalIndex, setActiveModalIndex] = useState<number | null>(null)
  const [mobileScrollbarThumb, setMobileScrollbarThumb] = useState({
    top: 0,
    height: 0,
    progress: 0,
    visible: false,
  })
  const activeModal =
    activeModalIndex === null ? null : HOW_MODAL_COPY[activeModalIndex]
  const howItWorksStructuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": `${toAbsoluteSiteUrl("/how-it-works/")}#webpage`,
          name: "How PIXTUDIO Works",
          url: toAbsoluteSiteUrl("/how-it-works/"),
          description:
            "Explore PIXTUDIO scenarios for opening images and projects, shooting with a camera, drawing from a blank canvas, saving projects, exporting PNG, SVG, XLSX, or ZIP, editing palettes, and recording the pixelization process.",
          image: SITE_OG_IMAGE_URL,
          isPartOf: { "@id": SITE_SCHEMA_IDS.website },
          publisher: { "@id": SITE_SCHEMA_IDS.organization },
          about: { "@id": SITE_SCHEMA_IDS.software },
          mainEntity: {
            "@type": "ItemList",
            name: "PIXTUDIO feature scenarios",
            itemListElement: HOW_MODAL_COPY.map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: item.title,
              description: item.paragraphs.join(" "),
            })),
          },
        },
        createBreadcrumbList("How It Works", "/how-it-works/"),
      ],
    }),
    []
  )

  useEffect(() => {
    if (activeModalIndex === null) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveModalIndex(null)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [activeModalIndex])

  useLayoutEffect(() => {
    const scroller = cardsRef.current
    const track = mobileScrollbarRef.current
    if (!scroller || !track) return

    let animationFrameId = 0
    const applyMobileScrollbarThumb = (
      next: typeof mobileScrollbarThumb
    ) => {
      const thumb = mobileScrollbarThumbRef.current
      if (!thumb) return

      thumb.style.setProperty("--hiw-scrollbar-thumb-height", `${next.height}px`)
      thumb.style.setProperty("--hiw-scrollbar-thumb-y", `${next.top}px`)
      thumb.style.setProperty(
        "--hiw-scrollbar-thumb-opacity",
        next.visible ? "1" : "0"
      )
    }

    const updateMobileScrollbar = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = window.requestAnimationFrame(() => {
        const maxScrollTop = scroller.scrollHeight - scroller.clientHeight
        const trackHeight = track.clientHeight

        if (maxScrollTop <= 1 || trackHeight <= 0) {
          const next = {
            top: 0,
            height: trackHeight,
            progress: 0,
            visible: false,
          }
          applyMobileScrollbarThumb(next)
          setMobileScrollbarThumb(next)
          return
        }

        const thumbHeight = Math.max(
          28,
          Math.min(
            trackHeight,
            (scroller.clientHeight / scroller.scrollHeight) * trackHeight
          )
        )
        const maxThumbTop = Math.max(1, trackHeight - thumbHeight)
        const top = (scroller.scrollTop / maxScrollTop) * maxThumbTop

        setMobileScrollbarThumb((current) => {
          const next = {
            top,
            height: thumbHeight,
            progress: (scroller.scrollTop / maxScrollTop) * 100,
            visible: true,
          }
          if (
            Math.abs(current.top - next.top) < 0.5 &&
            Math.abs(current.height - next.height) < 0.5 &&
            Math.abs(current.progress - next.progress) < 0.5 &&
            current.visible === next.visible
          ) {
            return current
          }
          applyMobileScrollbarThumb(next)
          return next
        })
      })
    }

    updateMobileScrollbar()
    scroller.addEventListener("scroll", updateMobileScrollbar, { passive: true })
    window.addEventListener("resize", updateMobileScrollbar)

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateMobileScrollbar)

    observer?.observe(scroller)
    observer?.observe(track)

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }
      scroller.removeEventListener("scroll", updateMobileScrollbar)
      window.removeEventListener("resize", updateMobileScrollbar)
      observer?.disconnect()
    }
  }, [])

  const syncMobileScrollbarToPointer = (
    clientY: number,
    grabOffset: number
  ) => {
    const scroller = cardsRef.current
    const track = mobileScrollbarRef.current
    if (!scroller || !track) return

    const maxScrollTop = scroller.scrollHeight - scroller.clientHeight
    const maxThumbTop = track.clientHeight - mobileScrollbarThumb.height
    if (maxScrollTop <= 1 || maxThumbTop <= 0) return

    const trackRect = track.getBoundingClientRect()
    const nextThumbTop = Math.max(
      0,
      Math.min(maxThumbTop, clientY - trackRect.top - grabOffset)
    )

    scroller.scrollTop = (nextThumbTop / maxThumbTop) * maxScrollTop
  }

  const handleMobileScrollbarPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!mobileScrollbarThumb.visible) return

    const target = event.target
    const thumb =
      target instanceof Element
        ? target.closest(".siteHowItWorksMobileScrollbarThumb")
        : null
    const thumbRect = thumb?.getBoundingClientRect()
    const grabOffset = thumbRect
      ? event.clientY - thumbRect.top
      : mobileScrollbarThumb.height / 2

    mobileScrollbarDragRef.current = {
      pointerId: event.pointerId,
      grabOffset,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    syncMobileScrollbarToPointer(event.clientY, grabOffset)
  }

  const handleMobileScrollbarPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const drag = mobileScrollbarDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    event.preventDefault()
    syncMobileScrollbarToPointer(event.clientY, drag.grabOffset)
  }

  const handleMobileScrollbarPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (mobileScrollbarDragRef.current?.pointerId === event.pointerId) {
      mobileScrollbarDragRef.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
  }

  return (
    <SiteShell
      activePage="how"
      className="faqPage siteHowItWorksPage"
      headerClassName="faqHeader"
      mainClassName="siteHowItWorksLayout"
      mainAriaLabel="How PIXTUDIO works"
      footerClassName="faqFooter"
    >
      <JsonLd
        id="pixtudio-how-it-works-jsonld"
        data={howItWorksStructuredData}
      />
      <section
        className="siteHowItWorksBlueprint"
        aria-label="How It Works card block viewport"
      >
        <div className="siteHowItWorksMobileCardsViewport">
          <div
            id="site-how-it-works-cards"
            className="siteHowItWorksBlueprintGrid"
            ref={cardsRef}
          >
            {HOW_BLUEPRINT_CARD_CLASSES.map((cardImageClass, cardIndex) => {
              const card = HOW_MODAL_COPY[cardIndex]

              return (
                <button
                  className={`siteHowItWorksBlueprintCard ${cardImageClass}`}
                  key={cardIndex}
                  type="button"
                  aria-label={card.title}
                  onClick={() => setActiveModalIndex(cardIndex)}
                />
              )
            })}
          </div>
          <div
            className="siteHowItWorksMobileScrollbar"
            aria-label="Scroll How It Works cards"
            role="scrollbar"
            aria-controls="site-how-it-works-cards"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(mobileScrollbarThumb.progress)}
            ref={mobileScrollbarRef}
            onPointerDown={handleMobileScrollbarPointerDown}
            onPointerMove={handleMobileScrollbarPointerMove}
            onPointerUp={handleMobileScrollbarPointerUp}
            onPointerCancel={handleMobileScrollbarPointerUp}
          >
            <span
              className="siteHowItWorksMobileScrollbarThumb"
              ref={mobileScrollbarThumbRef}
            />
          </div>
        </div>
      </section>

      {activeModal ? (
        <div
          className="siteHowItWorksModalOverlay"
          role="presentation"
          onClick={() => setActiveModalIndex(null)}
        >
          <article
            className="siteHowItWorksModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-how-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="siteHowItWorksModalClose"
              type="button"
              aria-label="Close"
              onClick={() => setActiveModalIndex(null)}
            >
              <SiteCloseCrossIcon />
            </button>
            <h2 id="site-how-modal-title">How It Works</h2>
            <h3>{activeModal.title}</h3>
            {activeModal.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>
        </div>
      ) : null}
    </SiteShell>
  )
}

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import galleryAfter1 from "./assets/gallery/gallery-after-1.png"
import galleryAfter10 from "./assets/gallery/gallery-after-10.png"
import galleryAfter11 from "./assets/gallery/gallery-after-11.png"
import galleryAfter5 from "./assets/gallery/gallery-after-5.png"
import galleryAfter6 from "./assets/gallery/gallery-after-6.png"
import galleryAfter7 from "./assets/gallery/gallery-after-7.png"
import galleryAfter8 from "./assets/gallery/gallery-after-8.png"
import galleryAfter9 from "./assets/gallery/gallery-after-9.png"
import galleryBefore1 from "./assets/gallery/gallery-before-1.png"
import galleryBefore10 from "./assets/gallery/gallery-before-10.png"
import galleryBefore11 from "./assets/gallery/gallery-before-11.png"
import galleryBefore5 from "./assets/gallery/gallery-before-5.png"
import galleryBefore6 from "./assets/gallery/gallery-before-6.png"
import galleryBefore7 from "./assets/gallery/gallery-before-7.png"
import galleryBefore8 from "./assets/gallery/gallery-before-8.png"
import galleryBefore9 from "./assets/gallery/gallery-before-9.png"
import { SiteShell } from "./SiteShell"
import {
  JsonLd,
  SITE_ROUTE_SEO,
  SITE_SCHEMA_IDS,
  createBreadcrumbList,
  toAbsoluteSiteUrl,
  usePageSeo,
} from "./structuredData"
import "./hub.css"

type GalleryImagePair = {
  beforeSrc: string
  afterSrc: string
  beforeAlt: string
  afterAlt: string
  caption: string
}

type GalleryStripItem = {
  src: string
  alt: string
  pair?: GalleryImagePair
}

const GALLERY_MAIN_PAIR: GalleryImagePair = {
  beforeSrc: galleryBefore1,
  afterSrc: galleryAfter1,
  beforeAlt: "Original portrait before PIXTUDIO conversion",
  afterAlt: "Pixel art portrait after PIXTUDIO conversion",
  caption:
    "Photo to pixel art: original photo from gallery, adjusted with editing tools and custom palette",
}

const GALLERY_PAIR_5: GalleryImagePair = {
  beforeSrc: galleryBefore5,
  afterSrc: galleryAfter5,
  beforeAlt: "Original warm portrait before PIXTUDIO conversion",
  afterAlt: "Warm pixel art portrait after PIXTUDIO conversion",
  caption:
    "Turn photo into pixel art: gallery image refined with editing tools and auto palette",
}

const GALLERY_PAIR_6: GalleryImagePair = {
  beforeSrc: galleryBefore6,
  afterSrc: galleryAfter6,
  beforeAlt: "Original fashion portrait before PIXTUDIO conversion",
  afterAlt: "Fashion pixel art portrait after PIXTUDIO conversion",
  caption:
    "Pixel art from photo: gallery photo enhanced with editing tools and loaded palette preset",
}

const GALLERY_PAIR_7: GalleryImagePair = {
  beforeSrc: galleryBefore7,
  afterSrc: galleryAfter7,
  beforeAlt: "Original colorful portrait before PIXTUDIO conversion",
  afterAlt: "Colorful pixel art portrait after PIXTUDIO conversion",
  caption:
    "Before and after pixel art: colorful portrait converted with an auto palette",
}

const GALLERY_PAIR_8: GalleryImagePair = {
  beforeSrc: galleryBefore8,
  afterSrc: galleryAfter8,
  beforeAlt: "Original everyday portrait before PIXTUDIO conversion",
  afterAlt: "Black and white pixel art portrait after PIXTUDIO conversion",
  caption:
    "Pixel art portrait made from an everyday photo with the Black and White preset",
}

const GALLERY_PAIR_9: GalleryImagePair = {
  beforeSrc: galleryBefore9,
  afterSrc: galleryAfter9,
  beforeAlt: "Original bird photo before PIXTUDIO conversion",
  afterAlt: "Pixel art bird after PIXTUDIO conversion",
  caption:
    "A real photo turned into pixel art with an auto palette and small adjustments using the app's tools",
}

const GALLERY_PAIR_10: GalleryImagePair = {
  beforeSrc: galleryBefore10,
  afterSrc: galleryAfter10,
  beforeAlt: "Original school portrait before PIXTUDIO conversion",
  afterAlt: "Pixel art school portrait after PIXTUDIO conversion",
  caption:
    "Pixel art portrait created from a school photo with soft in-app retouching and an external palette",
}

const GALLERY_PAIR_11: GalleryImagePair = {
  beforeSrc: galleryBefore11,
  afterSrc: galleryAfter11,
  beforeAlt: "Original flower photo before PIXTUDIO conversion",
  afterAlt: "Pixel art flower after PIXTUDIO conversion",
  caption:
    "Before and after: pixel art created from a real photo with soft in-app retouching and an auto-generated palette",
}

export const GALLERY_STRIP_ITEMS: GalleryStripItem[] = [
  {
    src: GALLERY_MAIN_PAIR.afterSrc,
    alt: GALLERY_MAIN_PAIR.afterAlt,
    pair: GALLERY_MAIN_PAIR,
  },
  {
    src: GALLERY_PAIR_9.afterSrc,
    alt: GALLERY_PAIR_9.afterAlt,
    pair: GALLERY_PAIR_9,
  },
  {
    src: GALLERY_PAIR_5.afterSrc,
    alt: GALLERY_PAIR_5.afterAlt,
    pair: GALLERY_PAIR_5,
  },
  {
    src: GALLERY_PAIR_11.afterSrc,
    alt: GALLERY_PAIR_11.afterAlt,
    pair: GALLERY_PAIR_11,
  },
  {
    src: GALLERY_PAIR_6.afterSrc,
    alt: GALLERY_PAIR_6.afterAlt,
    pair: GALLERY_PAIR_6,
  },
  {
    src: GALLERY_PAIR_8.afterSrc,
    alt: GALLERY_PAIR_8.afterAlt,
    pair: GALLERY_PAIR_8,
  },
  {
    src: GALLERY_PAIR_7.afterSrc,
    alt: GALLERY_PAIR_7.afterAlt,
    pair: GALLERY_PAIR_7,
  },
  {
    src: GALLERY_PAIR_10.afterSrc,
    alt: GALLERY_PAIR_10.afterAlt,
    pair: GALLERY_PAIR_10,
  },
]

const GALLERY_STRIP_REPEAT_COUNT = 5
const GALLERY_STRIP_CENTER_REPEAT = 2

function normalizeLoopOffset(offset: number, cycleWidth: number) {
  if (!cycleWidth) return offset

  let normalized = offset
  while (normalized > cycleWidth / 2) normalized -= cycleWidth
  while (normalized < -cycleWidth / 2) normalized += cycleWidth
  return normalized
}

const loadedGalleryPairKeys = new Set<string>()
const pendingGalleryPairLoads = new Map<string, Promise<void>>()

function getGalleryPairKey(pair: GalleryImagePair) {
  return `${pair.beforeSrc}|${pair.afterSrc}`
}

function preloadGalleryImage(src: string) {
  return new Promise<void>((resolve) => {
    const image = new Image()
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true

      if (typeof image.decode === "function") {
        void image.decode().catch(() => undefined).then(() => resolve())
        return
      }

      resolve()
    }

    image.decoding = "async"
    image.onload = finish
    image.onerror = finish
    image.src = src

    if (image.complete) finish()
  })
}

function preloadGalleryPair(pair: GalleryImagePair) {
  const key = getGalleryPairKey(pair)
  if (loadedGalleryPairKeys.has(key)) return Promise.resolve()

  const pending = pendingGalleryPairLoads.get(key)
  if (pending) return pending

  const load = Promise.all([
    preloadGalleryImage(pair.beforeSrc),
    preloadGalleryImage(pair.afterSrc),
  ]).then(() => {
    loadedGalleryPairKeys.add(key)
    pendingGalleryPairLoads.delete(key)
  })

  pendingGalleryPairLoads.set(key, load)
  return load
}

function BeforeAfterImageSlider({
  pair,
}: {
  pair: GalleryImagePair
}) {
  const sliderRef = useRef<HTMLDivElement | null>(null)
  const [splitPercent, setSplitPercent] = useState(50)

  const updateSplitFromClientX = (clientX: number) => {
    const slider = sliderRef.current
    if (!slider) return

    const rect = slider.getBoundingClientRect()
    const next = ((clientX - rect.left) / rect.width) * 100
    setSplitPercent(Math.min(94, Math.max(6, next)))
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateSplitFromClientX(event.clientX)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return
    updateSplitFromClientX(event.clientX)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <div
      className="siteGalleryCompare"
      ref={sliderRef}
      style={{ "--gallery-split": `${splitPercent}%` } as CSSProperties}
    >
      <img
        className="siteGalleryCompareImage"
        src={pair.beforeSrc}
        alt={pair.beforeAlt}
        draggable={false}
      />
      <img
        className="siteGalleryCompareImage siteGalleryCompareImageAfter"
        src={pair.afterSrc}
        alt={pair.afterAlt}
        draggable={false}
      />
      <button
        className="siteGalleryCompareHandle"
        type="button"
        aria-label="Reveal pixelated version"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="siteGalleryCompareHandleKnob" aria-hidden="true">
          <span className="siteGalleryCompareArrow siteGalleryCompareArrowLeft" />
          <span className="siteGalleryCompareArrow siteGalleryCompareArrowRight" />
        </span>
      </button>
    </div>
  )
}

export default function GalleryPage() {
  usePageSeo(SITE_ROUTE_SEO.gallery)

  const stripViewportRef = useRef<HTMLElement | null>(null)
  const stripCycleWidthRef = useRef(0)
  const stripPointerStartXRef = useRef<number | null>(null)
  const stripStartOffsetRef = useRef(0)
  const pairSelectionRequestRef = useRef(0)
  const [activePair, setActivePair] = useState(GALLERY_MAIN_PAIR)
  const [stripAnchorX, setStripAnchorX] = useState(0)
  const [stripCenterX, setStripCenterX] = useState(0)
  const [stripOffsetX, setStripOffsetX] = useState(0)

  const stripItems = useMemo(
    () =>
      Array.from({ length: GALLERY_STRIP_REPEAT_COUNT }, (_, repeatIndex) =>
        GALLERY_STRIP_ITEMS.map((item, itemIndex) => ({
          ...item,
          itemIndex: repeatIndex * GALLERY_STRIP_ITEMS.length + itemIndex,
        }))
      ).flat(),
    []
  )
  const galleryStructuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "ImageGallery",
          "@id": `${toAbsoluteSiteUrl("/gallery/")}#imagegallery`,
          name: "PIXTUDIO Gallery",
          url: toAbsoluteSiteUrl("/gallery/"),
          description:
            "Before-and-after examples of photos converted into pixel art with PIXTUDIO.",
          isPartOf: { "@id": SITE_SCHEMA_IDS.website },
          publisher: { "@id": SITE_SCHEMA_IDS.organization },
          about: { "@id": SITE_SCHEMA_IDS.software },
          primaryImageOfPage: {
            "@type": "ImageObject",
            url: toAbsoluteSiteUrl(GALLERY_MAIN_PAIR.afterSrc),
            caption: GALLERY_MAIN_PAIR.caption,
          },
          associatedMedia: GALLERY_STRIP_ITEMS.map((item) => ({
            "@type": "ImageObject",
            url: toAbsoluteSiteUrl(item.src),
            caption: item.pair?.caption ?? item.alt,
            name: item.alt,
          })),
        },
        createBreadcrumbList("Gallery", "/gallery/"),
      ],
    }),
    []
  )

  useEffect(() => {
    void preloadGalleryPair(GALLERY_MAIN_PAIR)
  }, [])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    let disposed = false

    const measureStrip = () => {
      const viewport = stripViewportRef.current
      if (!viewport) return

      const targetIndex = GALLERY_STRIP_CENTER_REPEAT * GALLERY_STRIP_ITEMS.length
      const target = viewport.querySelector<HTMLElement>(
        `[data-gallery-strip-item="${targetIndex}"]`
      )
      const cycleStart = viewport.querySelector<HTMLElement>(
        `[data-gallery-strip-item="${GALLERY_STRIP_CENTER_REPEAT * GALLERY_STRIP_ITEMS.length}"]`
      )
      const nextCycleStart = viewport.querySelector<HTMLElement>(
        `[data-gallery-strip-item="${(GALLERY_STRIP_CENTER_REPEAT + 1) * GALLERY_STRIP_ITEMS.length}"]`
      )
      if (!target || !cycleStart || !nextCycleStart) return

      if (!disposed) {
        stripCycleWidthRef.current =
          nextCycleStart.offsetLeft - cycleStart.offsetLeft
        setStripAnchorX(target.offsetLeft)
        setStripCenterX(0)
      }
    }

    const resizeObserver = new ResizeObserver(measureStrip)
    if (stripViewportRef.current) {
      resizeObserver.observe(stripViewportRef.current)
    }

    window.addEventListener("resize", measureStrip)
    measureStrip()

    return () => {
      disposed = true
      resizeObserver.disconnect()
      window.removeEventListener("resize", measureStrip)
    }
  }, [])

  const handleStripPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    stripPointerStartXRef.current = event.clientX
    stripStartOffsetRef.current = stripOffsetX
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleStripPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const startX = stripPointerStartXRef.current
    if (startX === null) return

    const dx = event.clientX - startX
    setStripOffsetX(
      normalizeLoopOffset(
        stripStartOffsetRef.current + dx,
        stripCycleWidthRef.current
      )
    )
  }

  const handleStripPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    stripPointerStartXRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setStripOffsetX((offset) =>
      normalizeLoopOffset(offset, stripCycleWidthRef.current)
    )
  }

  const selectGalleryPair = (pair: GalleryImagePair) => {
    if (pair === activePair) return

    const requestId = pairSelectionRequestRef.current + 1
    pairSelectionRequestRef.current = requestId

    void preloadGalleryPair(pair).then(() => {
      if (pairSelectionRequestRef.current === requestId) {
        setActivePair(pair)
      }
    })
  }

  return (
    <SiteShell
      activePage="gallery"
      className="siteTemplatePage siteGalleryPage"
      headerClassName="siteTemplateHeader"
      mainClassName="siteTemplateMain siteGalleryMain"
      mainAriaLabel="PIXTUDIO Gallery"
      footerClassName="siteTemplateFooter"
    >
      <JsonLd id="pixtudio-gallery-jsonld" data={galleryStructuredData} />
      <section className="siteGalleryDesktop" aria-label="PIXTUDIO Gallery">
        <section className="siteGalleryDesktopStrip" aria-label="Gallery images">
          {GALLERY_STRIP_ITEMS.map((item, itemIndex) => (
            <button
              className={`siteGalleryDesktopStripItem${
                item.pair === activePair ? " siteGalleryDesktopStripItemActive" : ""
              }`}
              type="button"
              key={`${item.alt}-${itemIndex}`}
              onClick={() => {
                if (item.pair) selectGalleryPair(item.pair)
              }}
            >
              <img src={item.src} alt={item.alt} draggable={false} />
            </button>
          ))}
        </section>

        <div className="siteGalleryDesktopCompare">
          <BeforeAfterImageSlider pair={activePair} />
        </div>

        <aside className="siteGalleryDesktopCaption" aria-live="polite">
          <p>{activePair.caption}</p>
        </aside>

        <p className="siteGalleryDesktopDisclaimer siteDisclaimerText">
          Original photos belong to their owners. Used for demonstration
          purposes only.
        </p>
      </section>

      <section className="siteGalleryMobile" aria-label="PIXTUDIO Gallery">
        <BeforeAfterImageSlider pair={activePair} />
        <p className="siteGalleryCaption">{activePair.caption}</p>
        <section
          className="siteGalleryStrip"
          aria-label="Gallery image strip"
          ref={stripViewportRef}
          onPointerDown={handleStripPointerDown}
          onPointerMove={handleStripPointerMove}
          onPointerUp={handleStripPointerUp}
          onPointerCancel={handleStripPointerUp}
        >
          <div
            className="siteGalleryStripRail"
            style={{
              transform: `translateX(${stripCenterX - stripAnchorX + stripOffsetX}px)`,
            }}
          >
            {stripItems.map((item) => (
              <button
                className="siteGalleryStripItem"
                type="button"
                key={item.itemIndex}
                data-gallery-strip-item={item.itemIndex}
                onClick={() => {
                  if (item.pair) selectGalleryPair(item.pair)
                }}
              >
                <img src={item.src} alt={item.alt} draggable={false} />
              </button>
            ))}
          </div>
        </section>
        <p className="siteGalleryDisclaimer siteDisclaimerText">
          Original photos belong to their owners. Used for demonstration
          purposes only.
        </p>
      </section>
    </SiteShell>
  )
}

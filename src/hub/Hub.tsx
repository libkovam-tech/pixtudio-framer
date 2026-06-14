import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import {
  DESKTOP_EDITOR_URL,
  SiteFloatingCta,
  SiteFooter,
  SiteShell,
  SiteTopNav,
} from "./SiteShell"
import {
  JsonLd,
  SITE_ROUTE_SEO,
  SITE_SCHEMA_IDS,
  toAbsoluteSiteUrl,
  usePageSeo,
} from "./structuredData"
import "./hub.css"

const DESKTOP_LANDING_VIDEO_SRC = "/media/landing-preview.mp4?v=20260511-hero43"
const LANDING_VIDEO_ORIGINAL_SRC = "/media/landing-preview.mp4?v=20260511-hero43"
const LANDING_VIDEO_POSTER_SRC = "/media/landing-video-poster.jpg"
const LANDING_VIDEO_UPLOAD_DATE = "2026-05-11T00:00:00Z"
const LANDING_VIDEO_DURATION = "PT30S"
const LANDING_VIDEO_WIDTH = 256
const LANDING_VIDEO_HEIGHT = 256
const LANDING_VIDEO_ENCODING_FORMAT = "video/mp4"
const DESKTOP_HINT_TEXT =
  "* To scroll the info cards please use a mouse wheel, arrow keys, or swipe"
const HEADLINE_FIT_TEXT = "INTO PIXEL ART"
const DESKTOP_ORBIT_AUTOPLAY_INTERVAL_MS = 7200
const DESKTOP_ORBIT_AUTOPLAY_RESUME_MS = 180000
const DESKTOP_ORBIT_QUALITY_STORAGE_KEY = "pixtudio:orbit-quality"
const DESKTOP_ORBIT_RUNTIME_SAMPLES = 3
const DESKTOP_ORBIT_MAX_QUEUED_STEPS = 8
const DESKTOP_LAYOUT_MIN_WIDTH = 761
const MOBILE_SEO_SECOND_SCREEN_ENABLED = true
const TEMP_VIDEO_COMPARISON_ENABLED = false
const HERO_VIDEO_ACCESSIBLE_LABEL =
  "Photo-to-pixel-art conversion preview showing PIXTUDIO turning images into pixel art"
const HERO_VIDEO_TRANSCRIPT_PARAGRAPHS = [
  "Watch ordinary images transform into structured pixel art in real time.",
  "This preview shows the PIXTUDIO editor turning simple shapes, symbols, photos, and colorful compositions into editable pixel-based visuals directly on the canvas.",
  "As the video progresses, different images evolve through changing grid resolutions, limited color palettes, and stylized pixel forms. The result is intentional pixel art, not just a simple filter effect.",
  "PIXTUDIO lets users experiment with pixel grids, reduce and control color palettes, refine shapes, and create unique pixel art from images in seconds. Every transformation happens live and remains editable.",
  "Whether you want to turn a photo into pixel art, experiment with palette-based visuals, or explore a creative image-to-pixel workflow, PIXTUDIO makes the process fast, visual, and easy to control.",
]
const HERO_VIDEO_TRANSCRIPT_TEXT = HERO_VIDEO_TRANSCRIPT_PARAGRAPHS.join("\n\n")
const HERO_VIDEO_SCHEMA_DESCRIPTION =
  "Watch ordinary images transform into structured pixel art in real time. This preview shows PIXTUDIO turning simple shapes, symbols, photos, and colorful compositions into editable pixel-based visuals directly on the canvas."

const MOBILE_HERO_ROWS = [
  "aabbbccddeeebbaa",
  "abbccfggghfcccba",
  "bbccdffgghffcbbb",
  "bccddefghhefccba",
  "ccdeddeeefeedccb",
  "ddddeeeeeeeedddd",
  "cdddhhhhhhhdddcc",
  "cdddhiiihhhhddcc",
  "ccddhijihhhddccb",
  "bcdkhiiihhhddcbb",
  "bcdkhhhhhiiddcbb",
  "bcckhlhhhiidccba",
  "bcckhlllhhidccba",
  "abckhhllhhidcbaa",
  "abbkhhhhhhhdcbaa",
  "aabbbbccccbbbbaa",
] as const

const MOBILE_INFO_CARDS = [
  {
    title: ["LIVE", "TRANSFORMATION"],
    body: "Move sliders and watch your photo turn into pixel art in real time. Mesmerizing and instant.",
  },
  {
    title: ["FULL CREATIVE", "CONTROL"],
    body: "Smart palette, manual drawing, PNG, SVG, XLSX, ZIP export, and savable projects. Real creative tool.",
  },
  {
    title: ["CREATORS & GAME", "DEVS LOVE IT"],
    body: "From viral Reels and TikToks to pro game assets. Loved by creators and indie devs.",
  },
  {
    title: ["RECORD THE", "MAGIC"],
    body: "Capture the live process as MP4 with music in one click. Perfect for Reels, TikTok, and Shorts.",
  },
  {
    title: ["PRE-PRODUCTION", "FOR GAME ARTISTS"],
    body: "Turn references into clean pixel art bases with consistent palettes. Fits next to Aseprite.",
  },
  {
    title: ["READY FOR", "PRODUCTION"],
    body: "SVG export for merch, XLSX for spreadsheet art, and precise color control. Lower production friction.",
  },
  {
    title: ["PALETTE CONTROLS", "EVERYTHING"],
    body: "Change one color — the whole image updates instantly. Import palettes from any photo.",
  },
  {
    title: ["NO DRAWING", "SKILLS NEEDED"],
    body: "Upload any photo and create beautiful personalized pixel art in seconds. Pure fun.",
  },
  {
    title: ["MORE THAN", "A GENERATOR"],
    body: "Manual drawing, project saving, reference image adjustments, and full editing tools. Start fast, finish pro.",
  },
]

const DESKTOP_SEO_COPY = [
  {
    accent:
      "PIXTUDIO is a browser-based pixel art editor",
    text:
      "that turns ordinary photos into high-quality pixel art with real creative control. Unlike regular filters, you control the grid, palette, colors, and details.",
  },
  {
    accent:
      "Perfect for both fast social content and professional work.",
    text:
      "Content creators love it for Reels, avatars, and posts, while indie game developers use it to create consistent pixel art assets quickly.",
  },
  {
    accent:
      "Change palette or grid size and see the whole image update instantly.",
    text:
      "Import palettes from any photo, draw manually, and save projects for later.",
  },
  {
    accent:
      "Export as PNG, SVG, XLSX, or ZIP, or record the live process as MP4 for social media.",
    text:
      "No installation needed — everything works in your browser.",
  },
]

const MOBILE_CARD_TITLE_LINES = MOBILE_INFO_CARDS.flatMap((card) => card.title)
const MOBILE_CAROUSEL_REPEAT_COUNT = 9
const MOBILE_CAROUSEL_CENTER_REPEAT = Math.floor(MOBILE_CAROUSEL_REPEAT_COUNT / 2)
const MOBILE_CAROUSEL_ITEMS = Array.from({
  length: MOBILE_CAROUSEL_REPEAT_COUNT * MOBILE_INFO_CARDS.length,
}).map((_, index) => ({
  itemIndex: index,
  cardIndex: index % MOBILE_INFO_CARDS.length,
}))
const DESKTOP_ORBIT_CARDS = MOBILE_INFO_CARDS
type DesktopOrbitSide = "left" | "right"
type DesktopOrbitDirection = 1 | -1
type DesktopOrbitItem = {
  side: DesktopOrbitSide
  index: number
}
type DesktopOrbitPhase = "enter" | "leave"
type DesktopOrbitAnimation = {
  phase: DesktopOrbitPhase
  direction: DesktopOrbitDirection
  enteringStep: number
  leavingStep: number | null
  overlap?: boolean
}
type DesktopOrbitDragMode = "drag" | "commit" | "cancel"
type DesktopOrbitDrag = {
  mode: DesktopOrbitDragMode
  direction: DesktopOrbitDirection
  progress: number
  enteringStep: number
  leavingStep: number
}
type DesktopOrbitQuality = "measuring" | "full" | "lite"
type FramePacingStats = {
  averageFps: number
  worstFrameMs: number
  slowFrameRatio: number
}
const DESKTOP_ORBIT_INITIAL_STEP = 1

function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo
}

function getDesktopOrbitItem(step: number): DesktopOrbitItem {
  return {
    side: "left",
    index: positiveModulo(step - DESKTOP_ORBIT_INITIAL_STEP, DESKTOP_ORBIT_CARDS.length),
  }
}

function isInteractiveElement(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("a, button, input, textarea, select, label"))
  )
}

function mixNumber(start: number, end: number, progress: number) {
  return start + (end - start) * progress
}

function getDesktopOrbitDragStyle(
  phase: "enter" | "leave",
  direction: DesktopOrbitDirection,
  progress: number
) {
  const clampedProgress = Math.max(0, Math.min(1, progress))
  const enteringFromY = direction === 1 ? -165 : 55
  const leavingToY = direction === 1 ? 55 : -165
  const offscreenScale = direction === 1 ? 1.24 : 0.55
  const progressValue =
    phase === "enter" ? clampedProgress : 1 - clampedProgress
  const y =
    phase === "enter"
      ? mixNumber(enteringFromY, -50, clampedProgress)
      : mixNumber(-50, leavingToY, clampedProgress)
  const scale =
    phase === "enter"
      ? mixNumber(offscreenScale, 1, clampedProgress)
      : mixNumber(1, offscreenScale, clampedProgress)
  const blur = mixNumber(11, 0, progressValue)

  return {
    opacity: progressValue,
    filter: `blur(${blur}px)`,
    transform: `translate(0, ${y}%) scale(${scale})`,
  }
}

function readStoredDesktopOrbitQuality(): DesktopOrbitQuality | null {
  if (typeof window === "undefined") return null

  try {
    const stored = window.sessionStorage.getItem(
      DESKTOP_ORBIT_QUALITY_STORAGE_KEY
    )
    return stored === "full" || stored === "lite" ? stored : null
  } catch {
    return null
  }
}

function isPixtudioE2EVisualRun() {
  if (typeof window === "undefined") return false

  try {
    return window.localStorage.getItem("pixtudio-e2e") === "true"
  } catch {
    return false
  }
}

function writeStoredDesktopOrbitQuality(quality: DesktopOrbitQuality) {
  if (quality === "measuring") return

  try {
    window.sessionStorage.setItem(DESKTOP_ORBIT_QUALITY_STORAGE_KEY, quality)
  } catch {
    // Quality detection is an optimization; it is safe to skip persistence.
  }
}

function getDesktopOrbitQualityFromStats(
  stats: FramePacingStats
): DesktopOrbitQuality {
  if (
    stats.averageFps < 48 ||
    stats.worstFrameMs > 90 ||
    stats.slowFrameRatio > 0.18
  ) {
    return "lite"
  }

  return "full"
}

function measureFramePacing(durationMs = 1400) {
  return new Promise<FramePacingStats>((resolve) => {
    const start = performance.now()
    const deltas: number[] = []
    let lastFrame = 0

    const tick = (now: number) => {
      if (lastFrame > 0) {
        deltas.push(now - lastFrame)
      }
      lastFrame = now

      if (now - start >= durationMs || document.hidden) {
        const elapsed = Math.max(1, now - start)
        const worstFrameMs = deltas.length ? Math.max(...deltas) : 0
        const slowFrames = deltas.filter((delta) => delta > 32).length
        resolve({
          averageFps: (deltas.length / elapsed) * 1000,
          worstFrameMs,
          slowFrameRatio: deltas.length ? slowFrames / deltas.length : 0,
        })
        return
      }

      window.requestAnimationFrame(tick)
    }

    window.requestAnimationFrame(tick)
  })
}

function MobileHeroMosaic() {
  return (
    <div className="hubMobileHeroMosaic" aria-label={HERO_VIDEO_ACCESSIBLE_LABEL}>
      {MOBILE_HERO_ROWS.flatMap((row, rowIndex) =>
        Array.from(row).map((key, columnIndex) => (
          <span
            key={`${rowIndex}-${columnIndex}`}
            className={`hubMobileHeroMosaicCell hubMobileHeroMosaicCell${key}`}
          />
        ))
      )}
    </div>
  )
}

function MobileVideoHero({
  src,
  posterSrc,
  descriptionId,
}: {
  src: string
  posterSrc: string
  descriptionId: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false)
  const [videoReady, setVideoReady] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setShouldLoadVideo(true), 250)
    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    if (!videoReady) return undefined

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!video || !canvas || !context) return undefined

    let animationFrameId = 0
    let videoFrameId = 0
    let stopped = false
    const frameApi = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number
      cancelVideoFrameCallback?: (handle: number) => void
    }

    const drawFrame = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      if (!width || !height) return

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      context.imageSmoothingEnabled = false
      context.drawImage(video, 0, 0, width, height)
    }

    const scheduleNextFrame = () => {
      if (stopped) return

      if (frameApi.requestVideoFrameCallback) {
        videoFrameId = frameApi.requestVideoFrameCallback(() => {
          drawFrame()
          scheduleNextFrame()
        })
        return
      }

      animationFrameId = window.requestAnimationFrame(() => {
        drawFrame()
        scheduleNextFrame()
      })
    }

    drawFrame()
    scheduleNextFrame()

    return () => {
      stopped = true
      if (videoFrameId && frameApi.cancelVideoFrameCallback) {
        frameApi.cancelVideoFrameCallback(videoFrameId)
      }
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [videoReady])

  const tryPlay = () => {
    const video = videoRef.current
    if (!video) return
    video.play().catch(() => {
      // Autoplay can be blocked; the static poster remains visible.
    })
  }

  return (
    <div
      className="hubMobileVideoHero"
      aria-label={HERO_VIDEO_ACCESSIBLE_LABEL}
      aria-describedby={descriptionId}
    >
      <MobileHeroMosaic />
      <img
        className="hubMobileVideoPoster"
        src={posterSrc}
        alt={HERO_VIDEO_ACCESSIBLE_LABEL}
      />
      {shouldLoadVideo ? (
        <video
          ref={videoRef}
          className={`hubMobileVideo${videoReady ? " hubMobileVideoReady" : ""}`}
          src={src}
          poster={posterSrc}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-describedby={descriptionId}
          onLoadedData={() => {
            setVideoReady(true)
            tryPlay()
          }}
          onCanPlay={tryPlay}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className={`hubMobileVideoCanvas${videoReady ? " hubMobileVideoCanvasReady" : ""}`}
        aria-hidden="true"
      />
      <div id={descriptionId} className="siteVisuallyHidden">
        {HERO_VIDEO_TRANSCRIPT_PARAGRAPHS.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </div>
  )
}

function TemporaryVideoComparison() {
  if (!TEMP_VIDEO_COMPARISON_ENABLED) {
    return null
  }

  const videos = [
    {
      title: "57 MB current MP4",
      src: LANDING_VIDEO_ORIGINAL_SRC,
    },
    {
      title: "7.6 MB candidate MP4",
      src: DESKTOP_LANDING_VIDEO_SRC,
    },
  ]

  return (
    <section
      className="hubVideoCompare"
      aria-label="Temporary landing video comparison"
    >
      <div className="hubVideoCompareInner">
        <h2>Temporary Video Comparison</h2>
        <div className="hubVideoCompareGrid">
          {videos.map((video) => (
            <article className="hubVideoCompareItem" key={video.title}>
              <h3>{video.title}</h3>
              <video
                src={video.src}
                poster={LANDING_VIDEO_POSTER_SRC}
                controls
                muted
                loop
                playsInline
                preload="metadata"
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function DesktopOrbitCard({
  side,
  phase,
  direction = 1,
  card,
  runtimeStyle,
  isDragging = false,
}: {
  side: DesktopOrbitSide
  phase: "landed" | "enter" | "leave"
  direction?: DesktopOrbitDirection
  card: (typeof MOBILE_INFO_CARDS)[number]
  runtimeStyle?: CSSProperties
  isDragging?: boolean
}) {
  const cardRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const node = cardRef.current
    if (!node) return undefined

    if (!runtimeStyle) {
      node.style.removeProperty("opacity")
      node.style.removeProperty("filter")
      node.style.removeProperty("transform")
      return undefined
    }

    if (runtimeStyle.opacity != null) {
      node.style.opacity = String(runtimeStyle.opacity)
    }
    if (runtimeStyle.filter != null) {
      node.style.filter = String(runtimeStyle.filter)
    }
    if (runtimeStyle.transform != null) {
      node.style.transform = String(runtimeStyle.transform)
    }

    return () => {
      node.style.removeProperty("opacity")
      node.style.removeProperty("filter")
      node.style.removeProperty("transform")
    }
  }, [runtimeStyle])

  return (
    <article
      ref={cardRef}
      className={`hubDesktopOrbitCard hubDesktopOrbitCard${side === "left" ? "Left" : "Right"} hubDesktopOrbitCard${phase === "landed" ? "Landed" : phase === "enter" ? "Enter" : "Leave"} hubDesktopOrbitCard${direction === 1 ? "Down" : "Up"}${isDragging ? " hubDesktopOrbitCardDragging" : ""}`}
      aria-hidden="true"
    >
      <h2>
        {card.title.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </h2>
      <p>
        {Array.isArray(card.body)
          ? card.body.map((line) => <span key={line}>{line}</span>)
          : card.body}
      </p>
    </article>
  )
}

function DesktopOrbitCards({
  activeStep,
  animation,
  drag,
}: {
  activeStep: number
  animation: DesktopOrbitAnimation | null
  drag: DesktopOrbitDrag | null
}) {
  const getCard = (index: number) => {
    return DESKTOP_ORBIT_CARDS[
      ((index % DESKTOP_ORBIT_CARDS.length) + DESKTOP_ORBIT_CARDS.length) %
        DESKTOP_ORBIT_CARDS.length
    ]
  }

  if (drag) {
    const enteringItem = getDesktopOrbitItem(drag.enteringStep)
    const leavingItem = getDesktopOrbitItem(drag.leavingStep)
    const isAnimating = drag.mode !== "drag"

    return (
      <div className="hubDesktopOrbitLayer" aria-hidden="true">
        <DesktopOrbitCard
          key={`drag-enter-${drag.enteringStep}-${drag.direction}`}
          side={enteringItem.side}
          phase="landed"
          direction={drag.direction}
          card={getCard(enteringItem.index)}
          runtimeStyle={getDesktopOrbitDragStyle(
            "enter",
            drag.direction,
            drag.progress
          )}
          isDragging={isAnimating}
        />
        <DesktopOrbitCard
          key={`drag-leave-${drag.leavingStep}-${drag.direction}`}
          side={leavingItem.side}
          phase="landed"
          direction={drag.direction}
          card={getCard(leavingItem.index)}
          runtimeStyle={getDesktopOrbitDragStyle(
            "leave",
            drag.direction,
            drag.progress
          )}
          isDragging={isAnimating}
        />
      </div>
    )
  }

  if (animation) {
    const enteringItem = getDesktopOrbitItem(animation.enteringStep)
    const leavingItem =
      animation.leavingStep == null
        ? null
        : getDesktopOrbitItem(animation.leavingStep)

    const showEntering = animation.phase === "enter" || animation.overlap
    const showLeaving = Boolean(leavingItem)

    return (
      <div className="hubDesktopOrbitLayer" aria-hidden="true">
        {showLeaving && leavingItem ? (
          <DesktopOrbitCard
            key={`orbit-leave-${animation.leavingStep}-${animation.direction}`}
            side={leavingItem.side}
            phase="leave"
            direction={animation.direction}
            card={getCard(leavingItem.index)}
          />
        ) : null}
        {showEntering ? (
          <DesktopOrbitCard
            key={`orbit-enter-${animation.enteringStep}-${animation.direction}`}
            side={enteringItem.side}
            phase="enter"
            direction={animation.direction}
            card={getCard(enteringItem.index)}
          />
        ) : null}
      </div>
    )
  }

  const activeItem = getDesktopOrbitItem(activeStep)

  return (
    <div className="hubDesktopOrbitLayer" aria-hidden="true">
      <DesktopOrbitCard
        key={`orbit-landed-${activeStep}`}
        side={activeItem.side}
        phase="landed"
        card={getCard(activeItem.index)}
      />
    </div>
  )
}

export default function Hub() {
  usePageSeo(SITE_ROUTE_SEO.home)

  const initialDesktopOrbitAnimation: DesktopOrbitAnimation = {
    phase: "enter",
    direction: 1,
    enteringStep: DESKTOP_ORBIT_INITIAL_STEP,
    leavingStep: null,
  }
  const desktopRootRef = useRef<HTMLDivElement | null>(null)
  const pixelateRef = useRef<HTMLHeadingElement | null>(null)
  const importRef = useRef<HTMLHeadingElement | null>(null)
  const desktopHintRef = useRef<HTMLParagraphElement | null>(null)
  const desktopHintTextRef = useRef<HTMLSpanElement | null>(null)
  const desktopOrbitCardMeasureRef = useRef<HTMLDivElement | null>(null)
  const desktopOrbitTitleMeasureRef = useRef<HTMLSpanElement | null>(null)
  const mobileSwipeStartXRef = useRef<number | null>(null)
  const mobileSwipeStartYRef = useRef<number | null>(null)
  const mobileSwipeStartOffsetXRef = useRef(0)
  const mobileSwipePointerIdRef = useRef<number | null>(null)
  const mobileCarouselBaseOffsetRef = useRef(0)
  const mobileCarouselCycleWidthRef = useRef(0)
  const mobileCarouselInitialPositionedRef = useRef(false)
  const mobileCarouselInitialSnapFrameRef = useRef<number | null>(null)
  const mobileCardsSnapTimeoutRef = useRef<number | null>(null)
  const mobileHeadlineRef = useRef<HTMLHeadingElement | null>(null)
  const mobileCardsRef = useRef<HTMLElement | null>(null)
  const mobileCardRailRef = useRef<HTMLDivElement | null>(null)
  const desktopOrbitTimeoutsRef = useRef<number[]>([])
  const desktopOrbitAutoplayResumeRef = useRef(0)
  const desktopOrbitQueuedDirectionsRef = useRef<DesktopOrbitDirection[]>([])
  const desktopOrbitStepRef = useRef(DESKTOP_ORBIT_INITIAL_STEP)
  const desktopOrbitAnimationRef = useRef<DesktopOrbitAnimation | null>(
    initialDesktopOrbitAnimation
  )
  const desktopOrbitDragRef = useRef<DesktopOrbitDrag | null>(null)
  const runDesktopOrbitTransitionRef = useRef<
    ((direction: DesktopOrbitDirection, fromStep: number) => void) | null
  >(null)
  const desktopOrbitPerformanceSamplesRef = useRef(
    DESKTOP_ORBIT_RUNTIME_SAMPLES
  )
  const desktopOrbitPerformanceSamplingRef = useRef(false)
  const [desktopWordFontSize, setDesktopWordFontSize] = useState(120)
  const [desktopHintFontSize, setDesktopHintFontSize] = useState(16)
  const [desktopOrbitTitleFontSize, setDesktopOrbitTitleFontSize] =
    useState(40)
  const [desktopOrbitQuality, setDesktopOrbitQuality] =
    useState<DesktopOrbitQuality>(
      () => readStoredDesktopOrbitQuality() ?? "measuring"
    )
  const [desktopOrbitAutoplayPaused, setDesktopOrbitAutoplayPaused] =
    useState(false)
  const [desktopOrbitStep, setDesktopOrbitStep] = useState(
    DESKTOP_ORBIT_INITIAL_STEP
  )
  const [desktopOrbitAnimation, setDesktopOrbitAnimation] =
    useState<DesktopOrbitAnimation | null>(initialDesktopOrbitAnimation)
  const [desktopOrbitDrag, setDesktopOrbitDrag] =
    useState<DesktopOrbitDrag | null>(null)
  const [mobileCardTitleFontSize, setMobileCardTitleFontSize] = useState(34)
  const [mobileCardBodyFontSize, setMobileCardBodyFontSize] = useState(14)
  const [mobileHeadlineFontSize, setMobileHeadlineFontSize] = useState(36)
  const [mobileCarouselOffsetX, setMobileCarouselOffsetX] = useState(0)

  useEffect(() => {
    const desktopRoot = desktopRootRef.current
    if (!desktopRoot) return undefined

    desktopRoot.style.setProperty(
      "--hub-desktop-word-font-size",
      `${desktopWordFontSize}px`
    )
    desktopRoot.style.setProperty(
      "--hub-desktop-hint-font-size",
      `${desktopHintFontSize}px`
    )
    desktopRoot.style.setProperty(
      "--hub-orbit-title-font-size",
      `${desktopOrbitTitleFontSize}px`
    )

    return () => {
      desktopRoot.style.removeProperty("--hub-desktop-word-font-size")
      desktopRoot.style.removeProperty("--hub-desktop-hint-font-size")
      desktopRoot.style.removeProperty("--hub-orbit-title-font-size")
    }
  }, [desktopHintFontSize, desktopOrbitTitleFontSize, desktopWordFontSize])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    const desktopRoot = desktopRootRef.current
    const headline = importRef.current
    if (!desktopRoot || !headline) return undefined

    let disposed = false

    const updateDesktopOrbitViewport = () => {
      if (disposed) return
      if (window.innerWidth < DESKTOP_LAYOUT_MIN_WIDTH) {
        desktopRoot.style.removeProperty("--hub-desktop-orbit-viewport-bottom")
        return
      }

      const rootRect = desktopRoot.getBoundingClientRect()
      const headlineRect = headline.getBoundingClientRect()
      const orbitBottom = Math.max(0, headlineRect.top - rootRect.top - 10)
      desktopRoot.style.setProperty(
        "--hub-desktop-orbit-viewport-bottom",
        `${orbitBottom}px`
      )
    }

    const resizeObserver = new ResizeObserver(updateDesktopOrbitViewport)
    resizeObserver.observe(desktopRoot)
    resizeObserver.observe(headline)

    window.addEventListener("resize", updateDesktopOrbitViewport)
    updateDesktopOrbitViewport()
    void document.fonts?.ready.then(updateDesktopOrbitViewport)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      window.removeEventListener("resize", updateDesktopOrbitViewport)
      desktopRoot.style.removeProperty("--hub-desktop-orbit-viewport-bottom")
    }
  }, [desktopWordFontSize])

  useEffect(() => {
    const headline = mobileHeadlineRef.current
    if (!headline) return undefined

    headline.style.setProperty(
      "--hub-mobile-headline-font-size",
      `${mobileHeadlineFontSize}px`
    )

    return () => {
      headline.style.removeProperty("--hub-mobile-headline-font-size")
    }
  }, [mobileHeadlineFontSize])

  useEffect(() => {
    const cards = mobileCardsRef.current
    if (!cards) return undefined

    cards.style.setProperty(
      "--hub-mobile-card-title-font-size",
      `${mobileCardTitleFontSize}px`
    )
    cards.style.setProperty(
      "--hub-mobile-card-body-font-size",
      `${mobileCardBodyFontSize}px`
    )

    return () => {
      cards.style.removeProperty("--hub-mobile-card-title-font-size")
      cards.style.removeProperty("--hub-mobile-card-body-font-size")
    }
  }, [mobileCardBodyFontSize, mobileCardTitleFontSize])

  useLayoutEffect(() => {
    const rail = mobileCardRailRef.current
    if (!rail) return

    rail.style.transform = `translateX(${mobileCarouselOffsetX}px)`
  }, [mobileCarouselOffsetX])

  useEffect(() => {
    return () => {
      if (mobileCardsSnapTimeoutRef.current != null) {
        window.clearTimeout(mobileCardsSnapTimeoutRef.current)
      }
      if (mobileCarouselInitialSnapFrameRef.current != null) {
        window.cancelAnimationFrame(mobileCarouselInitialSnapFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    desktopOrbitStepRef.current = desktopOrbitStep
  }, [desktopOrbitStep])

  useEffect(() => {
    desktopOrbitAnimationRef.current = desktopOrbitAnimation
  }, [desktopOrbitAnimation])

  useEffect(() => {
    desktopOrbitDragRef.current = desktopOrbitDrag
  }, [desktopOrbitDrag])

  useEffect(() => {
    if (!isPixtudioE2EVisualRun()) return

    desktopOrbitTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    desktopOrbitTimeoutsRef.current = []
    desktopOrbitQueuedDirectionsRef.current = []
    window.clearTimeout(desktopOrbitAutoplayResumeRef.current)
    desktopOrbitAutoplayResumeRef.current = 0

    desktopOrbitStepRef.current = DESKTOP_ORBIT_INITIAL_STEP
    desktopOrbitAnimationRef.current = null
    desktopOrbitDragRef.current = null

    const stabilizeTimeout = window.setTimeout(() => {
      setDesktopOrbitStep(DESKTOP_ORBIT_INITIAL_STEP)
      setDesktopOrbitAnimation(null)
      setDesktopOrbitDrag(null)
      setDesktopOrbitAutoplayPaused(true)
    }, 0)

    return () => window.clearTimeout(stabilizeTimeout)
  }, [])

  useEffect(() => {
    const setVisualViewportHeight = () => {
      const viewportHeight =
        window.visualViewport?.height || window.innerHeight || 0
      if (viewportHeight > 0) {
        document.documentElement.style.setProperty(
          "--hub-visual-viewport-h",
          `${viewportHeight}px`
        )
      }
    }

    const themeMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    )
    let navigationBarMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="navigation-bar-color"]'
    )
    const previousThemeColor = themeMeta?.content
    const previousNavigationBarColor = navigationBarMeta?.content
    const createdNavigationBarMeta = !navigationBarMeta

    if (!navigationBarMeta) {
      navigationBarMeta = document.createElement("meta")
      navigationBarMeta.name = "navigation-bar-color"
      document.head.appendChild(navigationBarMeta)
    }

    document.documentElement.classList.add("hubRootLocked")
    document.body.classList.add("hubPageLocked")
    if (TEMP_VIDEO_COMPARISON_ENABLED) {
      document.documentElement.classList.add("hubVideoCompareScrollRoot")
      document.body.classList.add("hubVideoCompareScrollBody")
    }
    setVisualViewportHeight()
    window.addEventListener("resize", setVisualViewportHeight)
    window.addEventListener("orientationchange", setVisualViewportHeight)
    window.visualViewport?.addEventListener("resize", setVisualViewportHeight)
    window.visualViewport?.addEventListener("scroll", setVisualViewportHeight)
    if (themeMeta) {
      themeMeta.content = "#ffffff"
    }
    if (navigationBarMeta) {
      navigationBarMeta.content = "#001219"
    }

    return () => {
      document.documentElement.classList.remove("hubRootLocked")
      document.body.classList.remove("hubPageLocked")
      document.documentElement.classList.remove("hubVideoCompareScrollRoot")
      document.body.classList.remove("hubVideoCompareScrollBody")
      document.documentElement.style.removeProperty("--hub-visual-viewport-h")
      window.removeEventListener("resize", setVisualViewportHeight)
      window.removeEventListener("orientationchange", setVisualViewportHeight)
      window.visualViewport?.removeEventListener(
        "resize",
        setVisualViewportHeight
      )
      window.visualViewport?.removeEventListener(
        "scroll",
        setVisualViewportHeight
      )
      if (themeMeta && previousThemeColor) {
        themeMeta.content = previousThemeColor
      }
      if (navigationBarMeta && createdNavigationBarMeta) {
        navigationBarMeta.remove()
      } else if (navigationBarMeta && previousNavigationBarColor) {
        navigationBarMeta.content = previousNavigationBarColor
      }
    }
  }, [])

  useEffect(() => {
    if (desktopOrbitQuality !== "measuring") return

    let disposed = false
    const timeoutId = window.setTimeout(() => {
      measureFramePacing(1400).then((stats) => {
        if (disposed) return
        const quality = getDesktopOrbitQualityFromStats(stats)
        setDesktopOrbitQuality(quality)
        writeStoredDesktopOrbitQuality(quality)
      })
    }, 350)

    return () => {
      disposed = true
      window.clearTimeout(timeoutId)
    }
  }, [desktopOrbitQuality])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    let disposed = false
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) return

    const measure = () => {
      const importNode = importRef.current

      if (!importNode) return
      if (window.innerWidth < DESKTOP_LAYOUT_MIN_WIDTH) return

      const targetWidth = Math.round(importNode.getBoundingClientRect().width)
      if (!targetWidth) return

      context.font =
        '800 100px "Google Sans Flex", system-ui, Arial, sans-serif'
      const measuredWidth = context.measureText(HEADLINE_FIT_TEXT).width
      if (!measuredWidth) return

      const fittedSize = Math.max(
        24,
        Math.min(220, (targetWidth / measuredWidth) * 100 * 0.995)
      )

      if (!disposed) {
        setDesktopWordFontSize(fittedSize)
      }
    }

    const observer = new ResizeObserver(() => {
      measure()
    })

    if (importRef.current?.parentElement) {
      observer.observe(importRef.current.parentElement)
    }

    window.addEventListener("resize", measure)
    measure()
    void document.fonts?.ready.then(measure)

    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    let disposed = false

    const fitDesktopHint = () => {
      const hint = desktopHintRef.current
      const hintText = desktopHintTextRef.current
      if (!hint || !hintText) return

      const targetWidth = hint.getBoundingClientRect().width
      if (!targetWidth) return

      let low = 8
      let high = 48
      let fitted = low

      for (let i = 0; i < 18; i += 1) {
        const mid = (low + high) / 2
        hintText.style.fontSize = `${mid}px`
        const measuredWidth = hintText.getBoundingClientRect().width

        if (measuredWidth <= targetWidth * 0.995) {
          fitted = mid
          low = mid
        } else {
          high = mid
        }
      }

      if (!disposed) {
        setDesktopHintFontSize(fitted)
      }
      hintText.style.removeProperty("font-size")
    }

    const resizeObserver = new ResizeObserver(fitDesktopHint)
    if (desktopHintRef.current) {
      resizeObserver.observe(desktopHintRef.current)
    }

    window.addEventListener("resize", fitDesktopHint)
    fitDesktopHint()
    void document.fonts?.ready.then(fitDesktopHint)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      window.removeEventListener("resize", fitDesktopHint)
    }
  }, [])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    let disposed = false

    const fitDesktopOrbitTitle = () => {
      const cardMeasure = desktopOrbitCardMeasureRef.current
      const titleMeasure = desktopOrbitTitleMeasureRef.current
      if (!cardMeasure || !titleMeasure) return
      if (window.innerWidth < DESKTOP_LAYOUT_MIN_WIDTH) return

      const cardRect = cardMeasure.getBoundingClientRect()
      const styles = window.getComputedStyle(cardMeasure)
      const targetWidth =
        cardRect.width -
        parseFloat(styles.paddingLeft || "0") -
        parseFloat(styles.paddingRight || "0")

      if (!targetWidth || targetWidth <= 0) return

      let low = 10
      let high = 96
      let fitted = low

      for (let i = 0; i < 18; i += 1) {
        const mid = (low + high) / 2
        titleMeasure.style.fontSize = `${mid}px`
        const measuredWidth = titleMeasure.getBoundingClientRect().width

        if (measuredWidth <= targetWidth * 0.995) {
          fitted = mid
          low = mid
        } else {
          high = mid
        }
      }

      if (!disposed) {
        setDesktopOrbitTitleFontSize(fitted)
      }
    }

    const resizeObserver = new ResizeObserver(fitDesktopOrbitTitle)
    if (desktopOrbitCardMeasureRef.current) {
      resizeObserver.observe(desktopOrbitCardMeasureRef.current)
    }

    window.addEventListener("resize", fitDesktopOrbitTitle)
    fitDesktopOrbitTitle()
    void document.fonts?.ready.then(fitDesktopOrbitTitle)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      window.removeEventListener("resize", fitDesktopOrbitTitle)
    }
  }, [])

  useEffect(() => {
    return () => {
      desktopOrbitTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      desktopOrbitTimeoutsRef.current = []
      desktopOrbitQueuedDirectionsRef.current = []
      window.clearTimeout(desktopOrbitAutoplayResumeRef.current)
    }
  }, [])

  useEffect(() => {
    if (!desktopOrbitAnimation) return
    if (desktopOrbitAnimation.leavingStep != null) return

    const timeoutId = window.setTimeout(() => {
      setDesktopOrbitStep(desktopOrbitAnimation.enteringStep)
      setDesktopOrbitAnimation(null)
    }, 680)

    return () => window.clearTimeout(timeoutId)
  }, [desktopOrbitAnimation])

  const pauseDesktopOrbitAutoplay = useCallback(() => {
    setDesktopOrbitAutoplayPaused(true)
    window.clearTimeout(desktopOrbitAutoplayResumeRef.current)
    desktopOrbitAutoplayResumeRef.current = window.setTimeout(() => {
      setDesktopOrbitAutoplayPaused(false)
    }, DESKTOP_ORBIT_AUTOPLAY_RESUME_MS)
  }, [])

  const sampleDesktopOrbitPerformance = useCallback(() => {
    if (window.innerWidth < DESKTOP_LAYOUT_MIN_WIDTH) return
    if (document.hidden) return
    if (desktopOrbitQuality === "lite") return
    if (desktopOrbitPerformanceSamplingRef.current) return
    if (desktopOrbitPerformanceSamplesRef.current <= 0) return

    desktopOrbitPerformanceSamplingRef.current = true
    desktopOrbitPerformanceSamplesRef.current -= 1
    measureFramePacing(1450).then((stats) => {
      desktopOrbitPerformanceSamplingRef.current = false
      const quality = getDesktopOrbitQualityFromStats(stats)
      if (quality !== "lite") return

      setDesktopOrbitQuality("lite")
      writeStoredDesktopOrbitQuality("lite")
      desktopOrbitPerformanceSamplesRef.current = 0
    })
  }, [desktopOrbitQuality])

  const enqueueDesktopOrbitDirection = useCallback(
    (direction: DesktopOrbitDirection) => {
      desktopOrbitQueuedDirectionsRef.current = [
        ...desktopOrbitQueuedDirectionsRef.current,
        direction,
      ].slice(-DESKTOP_ORBIT_MAX_QUEUED_STEPS)
    },
    []
  )

  const runDesktopOrbitTransition = useCallback(
    (direction: DesktopOrbitDirection, fromStep: number) => {
      sampleDesktopOrbitPerformance()

      const enteringStep = fromStep + direction
      const leavingStep = fromStep

      const leavingAnimation: DesktopOrbitAnimation = {
        phase: "leave",
        direction,
        enteringStep,
        leavingStep,
      }
      desktopOrbitAnimationRef.current = leavingAnimation
      setDesktopOrbitAnimation(leavingAnimation)

      const enterTimeout = window.setTimeout(() => {
        const overlappingAnimation: DesktopOrbitAnimation = {
          phase: "leave",
          direction,
          enteringStep,
          leavingStep,
          overlap: true,
        }
        desktopOrbitAnimationRef.current = overlappingAnimation
        setDesktopOrbitAnimation(overlappingAnimation)
      }, 230)

      const doneTimeout = window.setTimeout(() => {
        const nextDirection = desktopOrbitQueuedDirectionsRef.current.shift()
        desktopOrbitStepRef.current = enteringStep
        setDesktopOrbitStep(enteringStep)

        if (nextDirection) {
          runDesktopOrbitTransitionRef.current?.(nextDirection, enteringStep)
        } else {
          desktopOrbitAnimationRef.current = null
          setDesktopOrbitAnimation(null)
        }

        desktopOrbitTimeoutsRef.current = desktopOrbitTimeoutsRef.current.filter(
          (timeoutId) => timeoutId !== enterTimeout && timeoutId !== doneTimeout
        )
      }, 1360)

      desktopOrbitTimeoutsRef.current.push(enterTimeout, doneTimeout)
    },
    [sampleDesktopOrbitPerformance]
  )

  useEffect(() => {
    runDesktopOrbitTransitionRef.current = runDesktopOrbitTransition
  }, [runDesktopOrbitTransition])

  const advanceDesktopOrbit = useCallback(
    (direction: DesktopOrbitDirection = 1) => {
      if (desktopOrbitAnimationRef.current || desktopOrbitDragRef.current) {
        enqueueDesktopOrbitDirection(direction)
        return
      }

      runDesktopOrbitTransition(direction, desktopOrbitStepRef.current)
    },
    [enqueueDesktopOrbitDirection, runDesktopOrbitTransition]
  )

  useEffect(() => {
    if (desktopOrbitAutoplayPaused) return

    const intervalId = window.setInterval(() => {
      if (document.hidden) return
      if (window.innerWidth < DESKTOP_LAYOUT_MIN_WIDTH) return
      advanceDesktopOrbit(1)
    }, DESKTOP_ORBIT_AUTOPLAY_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [advanceDesktopOrbit, desktopOrbitAutoplayPaused])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (window.innerWidth < DESKTOP_LAYOUT_MIN_WIDTH) return
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return

      event.preventDefault()
      pauseDesktopOrbitAutoplay()
      advanceDesktopOrbit(event.key === "ArrowUp" ? -1 : 1)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [advanceDesktopOrbit, pauseDesktopOrbitAutoplay])

  useEffect(() => {
    if (!desktopOrbitAutoplayPaused) return

    const handleActivity = () => {
      pauseDesktopOrbitAutoplay()
    }

    window.addEventListener("pointerdown", handleActivity)
    window.addEventListener("mousemove", handleActivity)

    return () => {
      window.removeEventListener("pointerdown", handleActivity)
      window.removeEventListener("mousemove", handleActivity)
    }
  }, [desktopOrbitAutoplayPaused, pauseDesktopOrbitAutoplay])

  useEffect(() => {
    const desktopRoot = desktopRootRef.current
    if (!desktopRoot) return

    let startX: number | null = null
    let startY: number | null = null
    let dragDirection: DesktopOrbitDirection | null = null
    let dragProgress = 0
    let dragCommitted = false
    let gestureActive = false

    const resetSwipe = () => {
      startX = null
      startY = null
      dragDirection = null
      dragProgress = 0
      dragCommitted = false
      gestureActive = false
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (window.innerWidth < DESKTOP_LAYOUT_MIN_WIDTH) return
      if (desktopOrbitAnimation) return
      if (event.touches.length !== 1) {
        resetSwipe()
        return
      }
      if (isInteractiveElement(event.target)) {
        resetSwipe()
        return
      }

      const touch = event.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      gestureActive = true
      pauseDesktopOrbitAutoplay()
      sampleDesktopOrbitPerformance()
      setDesktopOrbitDrag(null)
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (!gestureActive || startX == null || startY == null) return
      if (event.touches.length !== 1) return

      const touch = event.touches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (Math.abs(dy) <= 12 || Math.abs(dy) <= Math.abs(dx) * 1.15) return

      event.preventDefault()

      const nextDirection: DesktopOrbitDirection = dy < 0 ? -1 : 1
      const dragDistance = Math.max(
        180,
        Math.min(460, window.innerHeight * 0.38)
      )
      dragDirection = nextDirection
      dragProgress = Math.max(0, Math.min(1, Math.abs(dy) / dragDistance))
      setDesktopOrbitDrag({
        mode: "drag",
        direction: nextDirection,
        progress: dragProgress,
        enteringStep: desktopOrbitStep + nextDirection,
        leavingStep: desktopOrbitStep,
      })
    }

    const handleTouchEnd = (event: TouchEvent) => {
      if (!gestureActive || startX == null || startY == null) {
        resetSwipe()
        return
      }

      const touch = event.changedTouches[0]
      if (!touch) {
        resetSwipe()
        return
      }

      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      const completedDirection = dragDirection
      const completedProgress = dragProgress
      resetSwipe()
      if (
        Math.abs(dy) < 44 ||
        Math.abs(dy) < Math.abs(dx) * 1.15 ||
        completedDirection == null
      ) {
        setDesktopOrbitDrag(null)
        return
      }

      event.preventDefault()
      pauseDesktopOrbitAutoplay()
      const shouldCommit = completedProgress >= 0.26 || Math.abs(dy) > 88
      const finalProgress = shouldCommit ? 1 : 0
      const finalMode: DesktopOrbitDragMode = shouldCommit ? "commit" : "cancel"
      const enteringStep = desktopOrbitStep + completedDirection
      const leavingStep = desktopOrbitStep

      dragCommitted = shouldCommit
      setDesktopOrbitDrag({
        mode: finalMode,
        direction: completedDirection,
        progress: finalProgress,
        enteringStep,
        leavingStep,
      })

      const doneTimeout = window.setTimeout(() => {
        if (dragCommitted) {
          setDesktopOrbitStep(enteringStep)
        }
        setDesktopOrbitDrag(null)
        desktopOrbitTimeoutsRef.current = desktopOrbitTimeoutsRef.current.filter(
          (timeoutId) => timeoutId !== doneTimeout
        )
      }, 230)

      desktopOrbitTimeoutsRef.current.push(doneTimeout)
    }

    desktopRoot.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    })
    desktopRoot.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    })
    desktopRoot.addEventListener("touchend", handleTouchEnd, {
      passive: false,
    })
    desktopRoot.addEventListener("touchcancel", resetSwipe, { passive: true })

    return () => {
      desktopRoot.removeEventListener("touchstart", handleTouchStart)
      desktopRoot.removeEventListener("touchmove", handleTouchMove)
      desktopRoot.removeEventListener("touchend", handleTouchEnd)
      desktopRoot.removeEventListener("touchcancel", resetSwipe)
    }
  }, [
    desktopOrbitAnimation,
    desktopOrbitStep,
    pauseDesktopOrbitAutoplay,
    sampleDesktopOrbitPerformance,
  ])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    let disposed = false
    let initialSnapCompleted = false
    let initialSnapStabilityTimeout: number | null = null
    let initialSnapResizeObserver: ResizeObserver | null = null

    const cancelInitialSnapFrame = () => {
      if (initialSnapStabilityTimeout != null) {
        window.clearTimeout(initialSnapStabilityTimeout)
        initialSnapStabilityTimeout = null
      }
      if (mobileCarouselInitialSnapFrameRef.current != null) {
        window.cancelAnimationFrame(mobileCarouselInitialSnapFrameRef.current)
        mobileCarouselInitialSnapFrameRef.current = null
      }
    }

    const runInitialSnap = () => {
      if (disposed || initialSnapCompleted) return

      const currentViewport = mobileCardsRef.current
      const currentRail = mobileCardRailRef.current
      if (!currentViewport || !currentRail) return

      const currentCycleStart = currentViewport.querySelector<HTMLElement>(
        `[data-carousel-item="${MOBILE_CAROUSEL_CENTER_REPEAT * MOBILE_INFO_CARDS.length}"]`
      )
      const currentNextCycleStart =
        currentViewport.querySelector<HTMLElement>(
          `[data-carousel-item="${(MOBILE_CAROUSEL_CENTER_REPEAT + 1) * MOBILE_INFO_CARDS.length}"]`
        )
      if (!currentCycleStart || !currentNextCycleStart) return

      initialSnapCompleted = true
      initialSnapResizeObserver?.disconnect()
      initialSnapResizeObserver = null

      const currentCycleWidth =
        currentNextCycleStart.offsetLeft - currentCycleStart.offsetLeft
      const currentBaseOffset = -currentCycleStart.offsetLeft
      mobileCarouselCycleWidthRef.current = currentCycleWidth
      mobileCarouselBaseOffsetRef.current = currentBaseOffset
      currentRail.style.setProperty(
        "transform",
        `translateX(${currentBaseOffset}px)`
      )

      const viewportRect = currentViewport.getBoundingClientRect()
      const viewportCenterX = viewportRect.left + viewportRect.width / 2
      const cards = Array.from(
        currentViewport.querySelectorAll<HTMLElement>("[data-carousel-item]")
      )
      let closestDelta = 0
      let closestDistance = Number.POSITIVE_INFINITY

      for (const card of cards) {
        const cardRect = card.getBoundingClientRect()
        const cardCenterX = cardRect.left + cardRect.width / 2
        const delta = cardCenterX - viewportCenterX
        const distance = Math.abs(delta)
        if (distance < closestDistance) {
          closestDelta = delta
          closestDistance = distance
        }
      }

      let normalized = currentBaseOffset - closestDelta
      while (normalized > currentBaseOffset + currentCycleWidth / 2) {
        normalized -= currentCycleWidth
      }
      while (normalized < currentBaseOffset - currentCycleWidth / 2) {
        normalized += currentCycleWidth
      }
      currentRail.style.setProperty("transform", `translateX(${normalized}px)`)
      setMobileCarouselOffsetX(normalized)
    }

    const scheduleInitialSnap = () => {
      if (disposed || initialSnapCompleted) return

      cancelInitialSnapFrame()
      initialSnapStabilityTimeout = window.setTimeout(() => {
        initialSnapStabilityTimeout = null
        if (disposed || initialSnapCompleted) return

        mobileCarouselInitialSnapFrameRef.current =
          window.requestAnimationFrame(() => {
            mobileCarouselInitialSnapFrameRef.current =
              window.requestAnimationFrame(() => {
                mobileCarouselInitialSnapFrameRef.current = null
                runInitialSnap()
              })
          })
      }, 120)
    }

    const measureCarousel = () => {
      const viewport = mobileCardsRef.current
      if (!viewport) return

      const cycleStart = viewport.querySelector<HTMLElement>(
        `[data-carousel-item="${MOBILE_CAROUSEL_CENTER_REPEAT * MOBILE_INFO_CARDS.length}"]`
      )
      const nextCycleStart = viewport.querySelector<HTMLElement>(
        `[data-carousel-item="${(MOBILE_CAROUSEL_CENTER_REPEAT + 1) * MOBILE_INFO_CARDS.length}"]`
      )
      if (!cycleStart || !nextCycleStart) return
      const cycleWidth = nextCycleStart.offsetLeft - cycleStart.offsetLeft

      if (!disposed) {
        mobileCarouselCycleWidthRef.current = cycleWidth

        if (!mobileCarouselInitialPositionedRef.current) {
          mobileCarouselInitialPositionedRef.current = true
          const baseOffset = -cycleStart.offsetLeft
          mobileCarouselBaseOffsetRef.current = baseOffset
          setMobileCarouselOffsetX(baseOffset)
          mobileCardRailRef.current?.style.setProperty(
            "transform",
            `translateX(${baseOffset}px)`
          )

          initialSnapResizeObserver = new ResizeObserver(scheduleInitialSnap)
          viewport
            .querySelectorAll<HTMLElement>(".hubMobileInfoCard")
            .forEach((card) => initialSnapResizeObserver?.observe(card))
          scheduleInitialSnap()
          const fontsReady = document.fonts?.ready ?? Promise.resolve()
          void fontsReady.then(scheduleInitialSnap)
        }
      }
    }

    const resizeObserver = new ResizeObserver(measureCarousel)
    if (mobileCardsRef.current) {
      resizeObserver.observe(mobileCardsRef.current)
    }

    window.addEventListener("resize", measureCarousel)
    measureCarousel()
    void document.fonts?.ready.then(measureCarousel)

    return () => {
      disposed = true
      mobileCarouselInitialPositionedRef.current = false
      initialSnapResizeObserver?.disconnect()
      cancelInitialSnapFrame()
      resizeObserver.disconnect()
      window.removeEventListener("resize", measureCarousel)
    }
  }, [])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    let disposed = false
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) return

    const fitHeadline = () => {
      const headline = mobileHeadlineRef.current
      if (!headline) return

      const targetWidth = headline.getBoundingClientRect().width
      if (!targetWidth) return

      context.font =
        '800 100px "Google Sans Flex", system-ui, Arial, sans-serif'
      const measuredWidth = context.measureText("PIXEL ART INSTANTLY").width
      if (!measuredWidth) return

      const fitted = Math.max(
        24,
        Math.min(44, (targetWidth / measuredWidth) * 100 * 0.995)
      )

      if (!disposed) {
        setMobileHeadlineFontSize(fitted)
      }
    }

    const resizeObserver = new ResizeObserver(fitHeadline)
    if (mobileHeadlineRef.current) {
      resizeObserver.observe(mobileHeadlineRef.current)
    }

    window.addEventListener("resize", fitHeadline)
    fitHeadline()
    void document.fonts?.ready.then(fitHeadline)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      window.removeEventListener("resize", fitHeadline)
    }
  }, [])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    let disposed = false
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) return

    const fitCardTitles = () => {
      const card = mobileCardsRef.current?.querySelector<HTMLElement>(
        ".hubMobileInfoCard"
      )
      if (!card) return

      const styles = window.getComputedStyle(card)
      const availableWidth =
        card.getBoundingClientRect().width -
        parseFloat(styles.paddingLeft) -
        parseFloat(styles.paddingRight)
      const maxTitleHeight = Math.max(58, window.innerHeight * 0.088)

      context.font = '700 100px "Google Sans Flex", system-ui, Arial, sans-serif'
      const widestLine = Math.max(
        ...MOBILE_CARD_TITLE_LINES.map((line) =>
          context.measureText(line).width
        )
      )

      const byWidth = widestLine > 0 ? (availableWidth / widestLine) * 100 : 34
      const byHeight = maxTitleHeight / (2 * 0.9)
      const fitted = Math.max(24, Math.min(48, byWidth * 0.96, byHeight) - 1.333)

      if (!disposed) {
        setMobileCardTitleFontSize(fitted)
      }
    }

    const resizeObserver = new ResizeObserver(fitCardTitles)
    if (mobileCardsRef.current) {
      resizeObserver.observe(mobileCardsRef.current)
    }

    window.addEventListener("resize", fitCardTitles)
    fitCardTitles()
    void document.fonts?.ready.then(fitCardTitles)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      window.removeEventListener("resize", fitCardTitles)
    }
  }, [])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    let disposed = false

    const fitCardBodies = () => {
      const cards = mobileCardsRef.current
      if (!cards) return

      const bodyNodes = Array.from(
        cards.querySelectorAll<HTMLParagraphElement>(".hubMobileInfoCard p")
      )
      if (!bodyNodes.length) return

      const previousBodyFontSize = cards.style.getPropertyValue(
        "--hub-mobile-card-body-font-size"
      )
      cards.style.removeProperty("--hub-mobile-card-body-font-size")
      const baseFontSize = Number.parseFloat(
        window.getComputedStyle(bodyNodes[0]).fontSize || "14"
      )
      if (previousBodyFontSize) {
        cards.style.setProperty(
          "--hub-mobile-card-body-font-size",
          previousBodyFontSize
        )
      }

      let high = Number.isFinite(baseFontSize) ? baseFontSize : 14
      let low = 8
      let fitted = low

      const fitsInThreeLines = (fontSize: number) => {
        let fits = true

        for (const node of bodyNodes) {
          node.style.fontSize = `${fontSize}px`
          const styles = window.getComputedStyle(node)
          const lineHeight = Number.parseFloat(styles.lineHeight || "0")
          const maxHeight = lineHeight > 0 ? lineHeight * 3 : node.clientHeight

          if (node.scrollHeight > maxHeight + 1) {
            fits = false
            break
          }
        }

        for (const node of bodyNodes) {
          node.style.removeProperty("font-size")
        }

        return fits
      }

      for (let i = 0; i < 18; i += 1) {
        const mid = (low + high) / 2

        if (fitsInThreeLines(mid)) {
          fitted = mid
          low = mid
        } else {
          high = mid
        }
      }

      if (!disposed) {
        setMobileCardBodyFontSize(Math.max(8, fitted))
      }
    }

    const resizeObserver = new ResizeObserver(fitCardBodies)
    if (mobileCardsRef.current) {
      resizeObserver.observe(mobileCardsRef.current)
    }

    window.addEventListener("resize", fitCardBodies)
    fitCardBodies()
    void document.fonts?.ready.then(fitCardBodies)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      window.removeEventListener("resize", fitCardBodies)
    }
  }, [])

  const normalizeMobileCarouselOffset = useCallback((offset: number) => {
    const cycleWidth = mobileCarouselCycleWidthRef.current
    if (!cycleWidth) return offset

    const baseOffset = mobileCarouselBaseOffsetRef.current
    let normalized = offset
    while (normalized > baseOffset + cycleWidth / 2) normalized -= cycleWidth
    while (normalized < baseOffset - cycleWidth / 2) normalized += cycleWidth
    return normalized
  }, [])

  const getMobileCarouselSnapOffset = useCallback((offset: number) => {
    const viewport = mobileCardsRef.current
    const cycleWidth = mobileCarouselCycleWidthRef.current
    if (!viewport || !cycleWidth) return normalizeMobileCarouselOffset(offset)

    const viewportRect = viewport.getBoundingClientRect()
    const viewportCenterX = viewportRect.left + viewportRect.width / 2
    const cards = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-carousel-item]")
    )
    let closestDelta = 0
    let closestDistance = Number.POSITIVE_INFINITY

    for (const card of cards) {
      const cardRect = card.getBoundingClientRect()
      const cardCenterX = cardRect.left + cardRect.width / 2
      const delta = cardCenterX - viewportCenterX
      const distance = Math.abs(delta)
      if (distance < closestDistance) {
        closestDelta = delta
        closestDistance = distance
      }
    }

    return normalizeMobileCarouselOffset(offset - closestDelta)
  }, [normalizeMobileCarouselOffset])

  const snapMobileCardsToCenter = useCallback(() => {
    if (mobileCardsSnapTimeoutRef.current != null) {
      window.clearTimeout(mobileCardsSnapTimeoutRef.current)
    }

    setMobileCarouselOffsetX((offset) => getMobileCarouselSnapOffset(offset))
    mobileCardsSnapTimeoutRef.current = window.setTimeout(() => {
      mobileCardsSnapTimeoutRef.current = null
    }, 0)
  }, [getMobileCarouselSnapOffset])

  const handleMobileCardsPointerDown = (event: React.PointerEvent) => {
    if (mobileCardsSnapTimeoutRef.current != null) {
      window.clearTimeout(mobileCardsSnapTimeoutRef.current)
      mobileCardsSnapTimeoutRef.current = null
    }

    mobileSwipeStartXRef.current = event.clientX
    mobileSwipeStartYRef.current = event.clientY
    mobileSwipeStartOffsetXRef.current = mobileCarouselOffsetX
    mobileSwipePointerIdRef.current = event.pointerId
    if (!MOBILE_SEO_SECOND_SCREEN_ENABLED) {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
  }

  const handleMobileCardsPointerMove = (event: React.PointerEvent) => {
    const startX = mobileSwipeStartXRef.current
    const startY = mobileSwipeStartYRef.current
    if (startX == null || startY == null) return

    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (Math.abs(dx) > Math.abs(dy) * 0.65) {
      setMobileCarouselOffsetX(
        normalizeMobileCarouselOffset(mobileSwipeStartOffsetXRef.current + dx)
      )
    }
  }

  const handleMobileCardsPointerUp = (event: React.PointerEvent) => {
    if (
      mobileSwipePointerIdRef.current != null &&
      mobileSwipePointerIdRef.current !== event.pointerId
    ) {
      return
    }

    mobileSwipeStartXRef.current = null
    mobileSwipeStartYRef.current = null
    mobileSwipePointerIdRef.current = null
    if (!MOBILE_SEO_SECOND_SCREEN_ENABLED) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    snapMobileCardsToCenter()
  }

  const handleMobileCardsPointerCancel = (event: React.PointerEvent) => {
    if (
      mobileSwipePointerIdRef.current != null &&
      mobileSwipePointerIdRef.current !== event.pointerId
    ) {
      return
    }

    mobileSwipeStartXRef.current = null
    mobileSwipeStartYRef.current = null
    mobileSwipePointerIdRef.current = null
    snapMobileCardsToCenter()
  }

  const handleDesktopWheel = (event: React.WheelEvent) => {
    if (window.innerWidth < DESKTOP_LAYOUT_MIN_WIDTH) return
    const desktopRoot = desktopRootRef.current
    if (!desktopRoot) return
    const rootRect = desktopRoot.getBoundingClientRect()
    const leftColumnRight = rootRect.left + (rootRect.width * 4) / 13
    if (event.clientX < rootRect.left || event.clientX > leftColumnRight) return
    if (
      TEMP_VIDEO_COMPARISON_ENABLED &&
      event.target instanceof Element &&
      event.target.closest(".hubVideoCompare")
    ) {
      return
    }
    if (Math.abs(event.deltaY) < 8) return

    event.preventDefault()
    pauseDesktopOrbitAutoplay()
    advanceDesktopOrbit(event.deltaY < 0 ? -1 : 1)
  }

  const heroVideoStructuredData = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${toAbsoluteSiteUrl("/")}#hero-video`,
    name: "PIXTUDIO photo to pixel art preview",
    description: HERO_VIDEO_SCHEMA_DESCRIPTION,
    transcript: HERO_VIDEO_TRANSCRIPT_TEXT,
    thumbnailUrl: [toAbsoluteSiteUrl(LANDING_VIDEO_POSTER_SRC)],
    uploadDate: LANDING_VIDEO_UPLOAD_DATE,
    duration: LANDING_VIDEO_DURATION,
    encodingFormat: LANDING_VIDEO_ENCODING_FORMAT,
    width: LANDING_VIDEO_WIDTH,
    height: LANDING_VIDEO_HEIGHT,
    contentUrl: toAbsoluteSiteUrl(DESKTOP_LANDING_VIDEO_SRC),
    isFamilyFriendly: true,
    inLanguage: "en",
    isPartOf: { "@id": SITE_SCHEMA_IDS.website },
    publisher: { "@id": SITE_SCHEMA_IDS.organization },
  }

  return (
    <div
      className={`hubPage${MOBILE_SEO_SECOND_SCREEN_ENABLED ? " hubPageMobileSeoSecondScreenEnabled" : ""}${TEMP_VIDEO_COMPARISON_ENABLED ? " hubPageVideoCompareEnabled" : ""}`}
    >
      <JsonLd id="pixtudio-hero-video-jsonld" data={heroVideoStructuredData} />
      <div
        ref={desktopRootRef}
        className={`hubDesktop hubOrbit${desktopOrbitQuality === "lite" ? "Lite" : desktopOrbitQuality === "measuring" ? "Measuring" : "Full"}`}
        aria-hidden={false}
        onWheel={handleDesktopWheel}
      >
        <div className="hubDesktopShell">
          <section
            className="hubDesktopScene"
          >
            <div
              ref={desktopOrbitCardMeasureRef}
              className="hubDesktopOrbitMeasure"
              aria-hidden="true"
            >
              <span ref={desktopOrbitTitleMeasureRef}>TRANSFORMATION</span>
            </div>
            <DesktopOrbitCards
              activeStep={desktopOrbitStep}
              animation={desktopOrbitAnimation}
              drag={desktopOrbitDrag}
            />
            <section className="hubDesktopSeoCards" aria-label="PIXTUDIO features">
              {MOBILE_INFO_CARDS.map((card) => (
                <article key={card.title.join(" ")}>
                  <h2>{card.title.join(" ")}</h2>
                  <p>
                    {Array.isArray(card.body)
                      ? card.body.join(" ")
                      : card.body}
                  </p>
                </article>
              ))}
            </section>

            <div className="hubDesktopSceneCell hubDesktopLogoCell">
              <SiteTopNav activePage="home" />
            </div>

            <div className="hubDesktopSceneCell hubDesktopImportCell">
              <div className="hubDesktopHeadline">
                <h2
                  ref={importRef}
                  className="hubDesktopWord hubDesktopWordImport"
                >
                  <span>TURN PHOTOS</span>
                  <span>INTO PIXEL ART</span>
                  <span>INSTANTLY</span>
                </h2>
              </div>
            </div>

            <div className="hubDesktopSceneCell hubDesktopVideoCell">
              <div className="hubDesktopVideoFrame">
                <MobileVideoHero
                  src={DESKTOP_LANDING_VIDEO_SRC}
                  posterSrc={LANDING_VIDEO_POSTER_SRC}
                  descriptionId="pixtudio-desktop-hero-video-description"
                />
              </div>
            </div>

            <div className="hubDesktopSceneCell hubDesktopCtaCell">
              <section
                className="hubDesktopSeoCopy"
                aria-label="About PIXTUDIO"
              >
                {DESKTOP_SEO_COPY.map((paragraph) => (
                  <p key={paragraph.accent}>
                    <strong>{paragraph.accent}</strong> {paragraph.text}
                  </p>
                ))}
              </section>
            </div>

            <SiteFloatingCta />

            <div className="hubDesktopSceneCell hubDesktopHintCell">
              <p
                ref={desktopHintRef}
                className="hubDesktopHint siteDisclaimerText"
              >
                <span
                  ref={desktopHintTextRef}
                >
                  {DESKTOP_HINT_TEXT}
                </span>
              </p>
            </div>

            <div className="hubDesktopSceneCell hubDesktopPixelateCell">
              <h2
                ref={pixelateRef}
                className="hubDesktopWord hubDesktopWordPixelate"
              >
                PIXELATE
              </h2>
            </div>

            <div className="hubDesktopSceneCell hubDesktopFooterCell">
              <SiteFooter className="hubDesktopFooter" />
            </div>
          </section>
        </div>
        <TemporaryVideoComparison />
      </div>

      <div className="hubMobile">
        <SiteShell
          activePage="home"
          className={`hubMobileDesign${MOBILE_SEO_SECOND_SCREEN_ENABLED ? " hubMobileSeoSecondScreenEnabled" : ""}`}
          mainClassName="hubMobileScrollArea"
          mainAriaLabel="PIXTUDIO mobile landing"
          footerClassName="hubMobileFooter"
          showCta={false}
        >
          <div className="hubMobileMain">
            <div className="hubMobileBlockVideo">
              <MobileVideoHero
                src={DESKTOP_LANDING_VIDEO_SRC}
                posterSrc={LANDING_VIDEO_POSTER_SRC}
                descriptionId="pixtudio-mobile-hero-video-description"
              />
            </div>

            <div className="hubMobileHeroActionGroup">
              <div className="hubMobileBlockHeadline">
                <h1
                  ref={mobileHeadlineRef}
                  className="hubMobileHeadline"
                >
                  <span className="hubMobileHeadlineJustified">
                    <b>TURN</b>
                    <b>PHOTOS</b>
                    <b>INTO</b>
                  </span>
                  <span>PIXEL ART INSTANTLY</span>
                </h1>
              </div>

              <div className="hubMobileBlockCta">
                <a
                  className="hubMobileCta hubMobileHomeCta"
                  href={DESKTOP_EDITOR_URL}
                  target="_self"
                  rel="noreferrer"
                >
                  <span className="hubCtaText">Try PIXTUDIO Now</span>
                </a>
              </div>
            </div>

            <section
              ref={mobileCardsRef}
              className="hubMobileCards hubMobileBlockCards"
              aria-label="PIXTUDIO feature cards"
              onPointerDown={handleMobileCardsPointerDown}
              onPointerMove={handleMobileCardsPointerMove}
              onPointerUp={handleMobileCardsPointerUp}
              onPointerCancel={handleMobileCardsPointerCancel}
            >
              <div
                ref={mobileCardRailRef}
                className="hubMobileCardRail"
              >
                {MOBILE_CAROUSEL_ITEMS.map(({ itemIndex, cardIndex }) => {
                  const card = MOBILE_INFO_CARDS[cardIndex]
                  return (
                    <article
                      key={itemIndex}
                      data-carousel-item={itemIndex}
                      className="hubMobileInfoCard"
                    >
                      <h2>
                        {card.title.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </h2>
                      <p>
                        {Array.isArray(card.body)
                          ? card.body.map((line) => (
                              <span key={line}>{line}</span>
                            ))
                          : card.body}
                      </p>
                    </article>
                  )
                })}
              </div>
            </section>
          </div>

          {MOBILE_SEO_SECOND_SCREEN_ENABLED && (
            <section className="hubMobileSeoScreen" aria-label="About PIXTUDIO">
              <div className="hubMobileSeoCopy">
                {DESKTOP_SEO_COPY.map((paragraph) => (
                  <p key={paragraph.accent}>
                    <strong>{paragraph.accent}</strong> {paragraph.text}
                  </p>
                ))}
              </div>
            </section>
          )}
          <TemporaryVideoComparison />
        </SiteShell>
      </div>
    </div>
  )
}

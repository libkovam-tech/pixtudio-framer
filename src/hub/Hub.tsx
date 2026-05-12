import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { SvgLogo } from "../editor/SvgIcons"
import "./hub.css"

const DESKTOP_LANDING_VIDEO_SRC = "/media/landing-preview.mp4?v=20260511-hero43"
const LANDING_VIDEO_ORIGINAL_SRC = "/media/landing-preview.mp4?v=20260511-hero43"
const LANDING_VIDEO_POSTER_SRC = "/media/landing-video-poster.jpg"
const DESKTOP_EDITOR_URL = "/editor"
const SITE_SHARE_URL = "https://pixtudio.app"
const SUPPORT_EMAIL = "support@pixtudio.app"
const DESKTOP_HINT_TEXT =
  "* To scroll the info cards please use a mouse wheel, arrow keys, or swipe"
const HEADLINE_FIT_TEXT = "INTO PIXEL ART"
const DESKTOP_ORBIT_AUTOPLAY_INTERVAL_MS = 7200
const DESKTOP_ORBIT_AUTOPLAY_RESUME_MS = 180000
const DESKTOP_ORBIT_QUALITY_STORAGE_KEY = "pixtudio:orbit-quality"
const DESKTOP_ORBIT_RUNTIME_SAMPLES = 3
const DESKTOP_ORBIT_MAX_QUEUED_STEPS = 8
const MOBILE_SEO_SECOND_SCREEN_ENABLED = true
const TEMP_VIDEO_COMPARISON_ENABLED = false
const HERO_VIDEO_ACCESSIBLE_LABEL =
  "Photo-to-pixel-art conversion preview showing PIXTUDIO turning images into pixel art"

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

const MOBILE_HERO_COLORS: Record<string, string> = {
  a: "#a8564d",
  b: "#c88e46",
  c: "#b14d42",
  d: "#d09a59",
  e: "#d4a17d",
  f: "#e9eff0",
  g: "#cbd8d8",
  h: "#214f77",
  i: "#e8edef",
  j: "#8d3131",
  k: "#71848b",
  l: "#b9564c",
}

const MOBILE_INFO_CARDS = [
  {
    title: ["LIVE", "TRANSFORMATION"],
    body: "Move sliders and watch your photo turn into pixel art in real time. Mesmerizing and instant.",
  },
  {
    title: ["FULL CREATIVE", "CONTROL"],
    body: "Smart palette, manual drawing, SVG export, and savable projects. Real creative tool.",
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
    body: "SVG export and precise color control for professional merch. Lower printing costs.",
  },
  {
    title: ["PALETTE", "CONTROLS EVERYTHING"],
    body: "Change one color – the whole image updates instantly. Import palettes from any photo.",
  },
  {
    title: ["NO DRAWING", "SKILLS NEEDED"],
    body: "Upload any photo and create beautiful personalized pixel art in seconds. Pure fun.",
  },
  {
    title: ["MORE THAN", "A GENERATOR"],
    body: "Manual drawing, project saving, Smart Object, and full editing tools. Start fast, finish pro.",
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
      "Export as PNG or SVG, or record the live process as MP4 for social media.",
    text:
      "No installation needed – everything works in your browser.",
  },
]

const DESKTOP_FAQ_COPY = [
  {
    question: "Can I export SVG?",
    answer: "Yes – export PNG or SVG.",
  },
  {
    question: "Can I use my own palette?",
    answer: "Yes – import one from any photo.",
  },
  {
    question: "Can I save MP4?",
    answer: "Yes – record the live process with music.",
  },
  {
    question: "Is it for game assets?",
    answer: "Yes – use exact grids and palettes.",
  },
  {
    question: "Does it work on mobile?",
    answer: "Yes – in a modern browser.",
  },
]

const MOBILE_CARD_TITLE_LINES = MOBILE_INFO_CARDS.flatMap((card) => card.title)
const MOBILE_CAROUSEL_REPEAT_COUNT = 9
const MOBILE_CAROUSEL_CENTER_REPEAT = Math.floor(MOBILE_CAROUSEL_REPEAT_COUNT / 2)
const MOBILE_CAROUSEL_INITIAL_CARD = 1
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
            style={{ background: MOBILE_HERO_COLORS[key] ?? "#c88e46" }}
          />
        ))
      )}
    </div>
  )
}

function MobileVideoHero({
  src,
  posterSrc,
}: {
  src: string
  posterSrc: string
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
    <div className="hubMobileVideoHero" aria-label={HERO_VIDEO_ACCESSIBLE_LABEL}>
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
  style,
  isDragging = false,
}: {
  side: DesktopOrbitSide
  phase: "landed" | "enter" | "leave"
  direction?: DesktopOrbitDirection
  card: (typeof MOBILE_INFO_CARDS)[number]
  style?: CSSProperties
  isDragging?: boolean
}) {
  return (
    <article
      className={`hubDesktopOrbitCard hubDesktopOrbitCard${side === "left" ? "Left" : "Right"} hubDesktopOrbitCard${phase === "landed" ? "Landed" : phase === "enter" ? "Enter" : "Leave"} hubDesktopOrbitCard${direction === 1 ? "Down" : "Up"}${isDragging ? " hubDesktopOrbitCardDragging" : ""}`}
      style={style}
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
          side={enteringItem.side}
          phase="landed"
          direction={drag.direction}
          card={getCard(enteringItem.index)}
          style={getDesktopOrbitDragStyle("enter", drag.direction, drag.progress)}
          isDragging={isAnimating}
        />
        <DesktopOrbitCard
          side={leavingItem.side}
          phase="landed"
          direction={drag.direction}
          card={getCard(leavingItem.index)}
          style={getDesktopOrbitDragStyle("leave", drag.direction, drag.progress)}
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
            side={leavingItem.side}
            phase="leave"
            direction={animation.direction}
            card={getCard(leavingItem.index)}
          />
        ) : null}
        {showEntering ? (
          <DesktopOrbitCard
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
        side={activeItem.side}
        phase="landed"
        card={getCard(activeItem.index)}
      />
    </div>
  )
}

function FooterEmailIcon() {
  return (
    <svg
      viewBox="0 0 103.2 103.2"
      width="33"
      height="33"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <polygon
        fill="#ffffff"
        points="45.2,103.2 45.2,96.8 25.8,96.8 25.8,90.3 19.4,90.3 19.4,83.9 12.9,83.9 12.9,77.4 6.5,77.4
6.5,58.1 0,58.1 0,45.2 6.5,45.2 6.5,25.8 12.9,25.8 12.9,19.4 19.4,19.4 19.4,12.9 25.8,12.9 25.8,6.5 45.2,6.5 45.2,0 58.1,0
58.1,6.5 77.4,6.5 77.4,12.9 83.9,12.9 83.9,19.4 90.3,19.4 90.3,25.8 96.8,25.8 96.8,45.2 103.2,45.2 103.2,58.1 96.8,58.1
96.8,77.4 90.3,77.4 90.3,83.9 83.9,83.9 83.9,90.3 77.4,90.3 77.4,96.8 58.1,96.8 58.1,103.2"
      />
      <path
        fill="#001219"
        d="M69.6,31.1h-36c-4.3,0-7.7,3.5-7.7,7.7v25.7c0,4.3,3.5,7.7,7.7,7.7h36c4.3,0,7.7-3.5,7.7-7.7V38.8
C77.3,34.5,73.8,31.1,69.6,31.1z M33.6,36.2h36c0.2,0,0.4,0,0.6,0.1L51.6,50L33,36.3C33.2,36.2,33.4,36.2,33.6,36.2z M72.2,64.5
c0,1.4-1.2,2.6-2.6,2.6h-36c-1.4,0-2.6-1.2-2.6-2.6V41.2l19,14c0.5,0.3,1,0.5,1.5,0.5c0.5,0,1.1-0.2,1.5-0.5l19-14V64.5z"
      />
    </svg>
  )
}

function FooterShareIcon() {
  return (
    <svg
      version="1.1"
      viewBox="0 0 103.2 103.2"
      width="33"
      height="33"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g>
        <polygon
          fill="#ffffff"
          points="45.2,103.2 45.2,96.8 25.8,96.8 25.8,90.3 19.4,90.3 19.4,83.9 12.9,83.9 12.9,77.4 6.5,77.4
6.5,58.1 0,58.1 0,45.2 6.5,45.2 6.5,25.8 12.9,25.8 12.9,19.4 19.4,19.4 19.4,12.9 25.8,12.9 25.8,6.5 45.2,6.5 45.2,0 58.1,0
58.1,6.5 77.4,6.5 77.4,12.9 83.9,12.9 83.9,19.4 90.3,19.4 90.3,25.8 96.8,25.8 96.8,45.2 103.2,45.2 103.2,58.1 96.8,58.1
96.8,77.4 90.3,77.4 90.3,83.9 83.9,83.9 83.9,90.3 77.4,90.3 77.4,96.8 58.1,96.8 58.1,103.2"
        />
      </g>
      <g transform="translate(-380 -3319)">
        <g transform="translate(56 160)">
          <path
            fill="#001219"
            fillRule="evenodd"
            clipRule="evenodd"
            d="M357,3206.2c2.6,0,4.7,2.1,4.7,4.7s-2.1,4.7-4.7,4.7c-2.6,0-4.7-2.1-4.7-4.7
S354.4,3206.2,357,3206.2 M384.9,3192c2.6,0,4.7,2.1,4.7,4.7c0,2.6-2.1,4.7-4.7,4.7C378.8,3201.3,378.8,3192,384.9,3192
M384.9,3219.9c2.6,0,4.7,2.1,4.7,4.7s-2.1,4.7-4.7,4.7C378.8,3229.3,378.8,3219.9,384.9,3219.9 M357,3220.2
c2.8,0,5.4-1.3,7.1-3.3l11.7,6.7c-0.6,5.8,3.9,10.3,9.2,10.3c5.1,0,9.3-4.2,9.3-9.3c0-5.1-4.2-9.3-9.3-9.3
c-3.1,0-5.9,1.6-7.6,3.9l-11.2-6.5c0.3-1.3,0.2-2.5,0-3.8l11.5-6.6c1.7,2.2,4.3,3.6,7.3,3.6c5.1,0,9.3-4.2,9.3-9.3
c0-5.1-4.2-9.3-9.3-9.3c-5.5,0-10.1,4.8-9.2,10.7l-11.8,6.8c-1.7-2-4.2-3.2-7-3.2c-5.1,0-9.3,4.2-9.3,9.3
S351.8,3220.2,357,3220.2"
          />
        </g>
      </g>
    </svg>
  )
}

export default function Hub() {
  const nav = useNavigate()
  const desktopRootRef = useRef<HTMLDivElement | null>(null)
  const pixelateRef = useRef<HTMLHeadingElement | null>(null)
  const importRef = useRef<HTMLHeadingElement | null>(null)
  const desktopHintRef = useRef<HTMLParagraphElement | null>(null)
  const desktopHintTextRef = useRef<HTMLSpanElement | null>(null)
  const mobileSwipeStartXRef = useRef<number | null>(null)
  const mobileSwipeStartYRef = useRef<number | null>(null)
  const mobileSwipeStartOffsetXRef = useRef(0)
  const mobileSwipePointerIdRef = useRef<number | null>(null)
  const mobileCarouselCycleWidthRef = useRef(0)
  const mobileHeadlineRef = useRef<HTMLHeadingElement | null>(null)
  const mobileCardsRef = useRef<HTMLElement | null>(null)
  const desktopOrbitTimeoutsRef = useRef<number[]>([])
  const desktopOrbitAutoplayResumeRef = useRef(0)
  const desktopOrbitQueuedDirectionsRef = useRef<DesktopOrbitDirection[]>([])
  const desktopOrbitStepRef = useRef(DESKTOP_ORBIT_INITIAL_STEP)
  const desktopOrbitAnimationRef = useRef<DesktopOrbitAnimation | null>({
    phase: "enter",
    direction: 1,
    enteringStep: DESKTOP_ORBIT_INITIAL_STEP,
    leavingStep: null,
  })
  const desktopOrbitDragRef = useRef<DesktopOrbitDrag | null>(null)
  const desktopOrbitPerformanceSamplesRef = useRef(
    DESKTOP_ORBIT_RUNTIME_SAMPLES
  )
  const desktopOrbitPerformanceSamplingRef = useRef(false)
  const [desktopWordFontSize, setDesktopWordFontSize] = useState(120)
  const [desktopHintFontSize, setDesktopHintFontSize] = useState(16)
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
    useState<DesktopOrbitAnimation | null>({
      phase: "enter",
      direction: 1,
      enteringStep: DESKTOP_ORBIT_INITIAL_STEP,
      leavingStep: null,
    })
  const [desktopOrbitDrag, setDesktopOrbitDrag] =
    useState<DesktopOrbitDrag | null>(null)
  const [mobileCardTitleFontSize, setMobileCardTitleFontSize] = useState(34)
  const [mobileHeadlineFontSize, setMobileHeadlineFontSize] = useState(36)
  const [mobileCarouselAnchorX, setMobileCarouselAnchorX] = useState(0)
  const [mobileCarouselCenterX, setMobileCarouselCenterX] = useState(0)
  const [mobileCarouselOffsetX, setMobileCarouselOffsetX] = useState(0)

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
      if (window.innerWidth < 901) return

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

  const pauseDesktopOrbitAutoplay = () => {
    setDesktopOrbitAutoplayPaused(true)
    window.clearTimeout(desktopOrbitAutoplayResumeRef.current)
    desktopOrbitAutoplayResumeRef.current = window.setTimeout(() => {
      setDesktopOrbitAutoplayPaused(false)
    }, DESKTOP_ORBIT_AUTOPLAY_RESUME_MS)
  }

  const sampleDesktopOrbitPerformance = () => {
    if (window.innerWidth < 901) return
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
  }

  const enqueueDesktopOrbitDirection = (direction: DesktopOrbitDirection) => {
    desktopOrbitQueuedDirectionsRef.current = [
      ...desktopOrbitQueuedDirectionsRef.current,
      direction,
    ].slice(-DESKTOP_ORBIT_MAX_QUEUED_STEPS)
  }

  const runDesktopOrbitTransition = (
    direction: DesktopOrbitDirection,
    fromStep: number
  ) => {
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
        runDesktopOrbitTransition(nextDirection, enteringStep)
      } else {
        desktopOrbitAnimationRef.current = null
        setDesktopOrbitAnimation(null)
      }

      desktopOrbitTimeoutsRef.current = desktopOrbitTimeoutsRef.current.filter(
        (timeoutId) => timeoutId !== enterTimeout && timeoutId !== doneTimeout
      )
    }, 1360)

    desktopOrbitTimeoutsRef.current.push(enterTimeout, doneTimeout)
  }

  const advanceDesktopOrbit = (direction: DesktopOrbitDirection = 1) => {
    if (desktopOrbitAnimationRef.current || desktopOrbitDragRef.current) {
      enqueueDesktopOrbitDirection(direction)
      return
    }

    runDesktopOrbitTransition(direction, desktopOrbitStepRef.current)
  }

  useEffect(() => {
    if (desktopOrbitAutoplayPaused) return

    const intervalId = window.setInterval(() => {
      if (document.hidden) return
      if (window.innerWidth < 901) return
      advanceDesktopOrbit(1)
    }, DESKTOP_ORBIT_AUTOPLAY_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [desktopOrbitAutoplayPaused, desktopOrbitAnimation, desktopOrbitStep])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (window.innerWidth < 901) return
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return

      event.preventDefault()
      pauseDesktopOrbitAutoplay()
      advanceDesktopOrbit(event.key === "ArrowUp" ? -1 : 1)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [desktopOrbitAnimation, desktopOrbitStep])

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
  }, [desktopOrbitAutoplayPaused])

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
      if (window.innerWidth < 901) return
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
  }, [desktopOrbitAnimation, desktopOrbitStep])

  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    let disposed = false

    const measureCarousel = () => {
      const viewport = mobileCardsRef.current
      if (!viewport) return

      const targetIndex =
        MOBILE_CAROUSEL_CENTER_REPEAT * MOBILE_INFO_CARDS.length +
        MOBILE_CAROUSEL_INITIAL_CARD
      const target = viewport.querySelector<HTMLElement>(
        `[data-carousel-item="${targetIndex}"]`
      )
      const cycleStart = viewport.querySelector<HTMLElement>(
        `[data-carousel-item="${MOBILE_CAROUSEL_CENTER_REPEAT * MOBILE_INFO_CARDS.length}"]`
      )
      const nextCycleStart = viewport.querySelector<HTMLElement>(
        `[data-carousel-item="${(MOBILE_CAROUSEL_CENTER_REPEAT + 1) * MOBILE_INFO_CARDS.length}"]`
      )
      if (!target || !cycleStart || !nextCycleStart) return

      const anchor = target.offsetLeft + target.offsetWidth / 2
      const cycleWidth = nextCycleStart.offsetLeft - cycleStart.offsetLeft

      if (!disposed) {
        mobileCarouselCycleWidthRef.current = cycleWidth
        setMobileCarouselAnchorX(anchor)
        setMobileCarouselCenterX(viewport.clientWidth / 2)
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

      context.font =
        '100px "Pathway Gothic One", "Arial Narrow", "Google Sans Flex", sans-serif'
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

  const openSupportEmail = () => {
    if (typeof window === "undefined") return

    const isMobile =
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    const mailtoHref = `mailto:${SUPPORT_EMAIL}?subject=PIXTUDIO%20support`
    const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${SUPPORT_EMAIL}&su=PIXTUDIO%20support`

    if (isMobile) {
      window.location.href = mailtoHref
      return
    }

    window.open(gmailComposeUrl, "_blank", "noopener,noreferrer")
  }

  const shareSite = async () => {
    if (typeof window === "undefined") return

    const shareData = {
      title: "PIXTUDIO",
      text: "Import. Pixelate. Export.",
      url: SITE_SHARE_URL,
    }

    try {
      if (
        navigator.share &&
        (!navigator.canShare || navigator.canShare(shareData))
      ) {
        await navigator.share(shareData)
        return
      }
    } catch {
      // user cancel / unsupported / runtime issue
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(SITE_SHARE_URL)
        alert("Link copied")
        return
      }
    } catch {
      // Fall back to the prompt.
    }

    window.prompt("Copy this link:", SITE_SHARE_URL)
  }

  const normalizeMobileCarouselOffset = (offset: number) => {
    const cycleWidth = mobileCarouselCycleWidthRef.current
    if (!cycleWidth) return offset

    let normalized = offset
    while (normalized > cycleWidth / 2) normalized -= cycleWidth
    while (normalized < -cycleWidth / 2) normalized += cycleWidth
    return normalized
  }

  const handleMobileCardsPointerDown = (event: React.PointerEvent) => {
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
    mobileSwipeStartXRef.current = null
    mobileSwipeStartYRef.current = null
    mobileSwipePointerIdRef.current = null
    if (!MOBILE_SEO_SECOND_SCREEN_ENABLED) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    setMobileCarouselOffsetX((offset) => normalizeMobileCarouselOffset(offset))
  }

  const handleDesktopWheel = (event: React.WheelEvent) => {
    if (window.innerWidth < 901) return
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

  return (
    <div
      className={`hubPage${MOBILE_SEO_SECOND_SCREEN_ENABLED ? " hubPageMobileSeoSecondScreenEnabled" : ""}${TEMP_VIDEO_COMPARISON_ENABLED ? " hubPageVideoCompareEnabled" : ""}`}
    >
      <div
        ref={desktopRootRef}
        className={`hubDesktop hubOrbit${desktopOrbitQuality === "lite" ? "Lite" : desktopOrbitQuality === "measuring" ? "Measuring" : "Full"}`}
        aria-hidden={false}
        onWheel={handleDesktopWheel}
      >
        <div className="hubDesktopShell">
          <section className="hubDesktopScene">
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
              <div className="hubDesktopLogoWrap" aria-label="PIXTUDIO">
                <SvgLogo style={{ width: "100%", height: "100%" }} />
              </div>
            </div>

            <div className="hubDesktopSceneCell hubDesktopImportCell">
              <div className="hubDesktopHeadline">
                <h2
                  ref={importRef}
                  className="hubDesktopWord hubDesktopWordImport"
                  style={{ fontSize: desktopWordFontSize }}
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
                <div className="hubDesktopFaqCopy" aria-label="PIXTUDIO quick FAQ">
                  {DESKTOP_FAQ_COPY.map((item) => (
                    <p key={item.question}>
                      <strong>{item.question}</strong> {item.answer}
                    </p>
                  ))}
                </div>
              </section>
              <a
                className="hubMobileCta hubDesktopCta"
                href={DESKTOP_EDITOR_URL}
                target="_self"
                rel="noreferrer"
              >
                <span className="hubCtaText">Try PIXTUDIO Now</span>
              </a>
            </div>

            <div className="hubDesktopSceneCell hubDesktopHintCell">
              <p
                ref={desktopHintRef}
                className="hubDesktopHint"
              >
                <span
                  ref={desktopHintTextRef}
                  style={{ fontSize: desktopHintFontSize }}
                >
                  {DESKTOP_HINT_TEXT}
                </span>
              </p>
            </div>

            <div className="hubDesktopSceneCell hubDesktopPixelateCell">
              <h2
                ref={pixelateRef}
                className="hubDesktopWord hubDesktopWordPixelate"
                style={{ fontSize: desktopWordFontSize }}
              >
                PIXELATE
              </h2>
            </div>

            <div className="hubDesktopSceneCell hubDesktopFooterCell">
              <div className="hubDesktopFooter">
                <span className="hubDesktopFooterText">PIXTUDIO {"\u00a9"}2026</span>
                <div className="hubDesktopFooterActions">
                  <button
                    type="button"
                    onClick={openSupportEmail}
                    aria-label="Email"
                    className="hubDesktopFooterButton"
                  >
                    <FooterEmailIcon />
                  </button>
                  <button
                    type="button"
                    onClick={shareSite}
                    aria-label="Share"
                    className="hubDesktopFooterButton"
                  >
                    <FooterShareIcon />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
        <TemporaryVideoComparison />
      </div>

      <div className="hubMobile">
        <div
          className={`hubMobileDesign${MOBILE_SEO_SECOND_SCREEN_ENABLED ? " hubMobileSeoSecondScreenEnabled" : ""}`}
        >
          <div className="hubMobileScrollArea">
          <main className="hubMobileMain">
            <header className="hubMobileHeader hubMobileBlockLogo">
              <div className="hubMobileLogo" aria-label="PIXTUDIO">
                <SvgLogo style={{ width: "100%", height: "100%" }} />
              </div>
            </header>

            <div className="hubMobileBlockVideo">
              <MobileVideoHero
                src={DESKTOP_LANDING_VIDEO_SRC}
                posterSrc={LANDING_VIDEO_POSTER_SRC}
              />
            </div>

            <div className="hubMobileBlockHeadline">
              <h1
                ref={mobileHeadlineRef}
                className="hubMobileHeadline"
                style={{ fontSize: mobileHeadlineFontSize }}
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
              <button
                type="button"
                className="hubMobileCta"
                onClick={() => nav("/editor")}
              >
                <span className="hubCtaText">Try PIXTUDIO Now</span>
              </button>
            </div>

            <section
              ref={mobileCardsRef}
              className="hubMobileCards hubMobileBlockCards"
              aria-label="PIXTUDIO feature cards"
              onPointerDown={handleMobileCardsPointerDown}
              onPointerMove={handleMobileCardsPointerMove}
              onPointerUp={handleMobileCardsPointerUp}
              onPointerCancel={() => {
                mobileSwipeStartXRef.current = null
                mobileSwipeStartYRef.current = null
                mobileSwipePointerIdRef.current = null
              }}
            >
              <div
                className="hubMobileCardRail"
                style={{
                  transform: `translateX(${
                    mobileCarouselCenterX -
                    mobileCarouselAnchorX +
                    mobileCarouselOffsetX
                  }px)`,
                }}
              >
                {MOBILE_CAROUSEL_ITEMS.map(({ itemIndex, cardIndex }) => {
                  const card = MOBILE_INFO_CARDS[cardIndex]
                  return (
                    <article
                      key={itemIndex}
                      data-carousel-item={itemIndex}
                      className="hubMobileInfoCard"
                    >
                      <h2 style={{ fontSize: mobileCardTitleFontSize }}>
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
          </main>

          {MOBILE_SEO_SECOND_SCREEN_ENABLED && (
            <section className="hubMobileSeoScreen" aria-label="About PIXTUDIO">
              <div className="hubMobileSeoCopy">
                {DESKTOP_SEO_COPY.map((paragraph) => (
                  <p key={paragraph.accent}>
                    <strong>{paragraph.accent}</strong> {paragraph.text}
                  </p>
                ))}
                <div className="hubMobileFaqCopy" aria-label="PIXTUDIO quick FAQ">
                  {DESKTOP_FAQ_COPY.map((item) => (
                    <p key={item.question}>
                      <strong>{item.question}</strong> {item.answer}
                    </p>
                  ))}
                </div>
              </div>
            </section>
          )}
          <TemporaryVideoComparison />
          </div>

          <footer className="hubMobileFooter">
            <div className="hubMobileFooterContent">
              <span>PIXTUDIO {"\u00a9"}2026</span>
              <div className="hubMobileFooterActions">
                <button
                  type="button"
                  onClick={openSupportEmail}
                  aria-label="Email"
                  className="hubMobileFooterButton"
                >
                  <FooterEmailIcon />
                </button>
                <button
                  type="button"
                  onClick={shareSite}
                  aria-label="Share"
                  className="hubMobileFooterButton"
                >
                  <FooterShareIcon />
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

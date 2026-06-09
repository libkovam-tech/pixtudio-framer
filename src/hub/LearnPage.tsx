import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
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
import cyclistSrc from "./assets/article/cyclist.png"
import riderSrc from "./assets/article/rider.png"
import arcadeSrc from "./assets/article/arcade.png"
import rocketSrc from "./assets/article/rocket.png"
import contrastPortraitSrc from "./assets/article/contrast-portrait.png"
import softPortraitSrc from "./assets/article/soft-portrait.png"
import cactusSrc from "./assets/article/cactus.png"
import teddyBearSrc from "./assets/article/teddy-bear.png"
import differentPalettesSourceSrc from "./assets/article/different-palettes-source.png"
import differentPalettes1Src from "./assets/article/different-palettes-1.png"
import differentPalettes2Src from "./assets/article/different-palettes-2.png"
import differentPalettes3Src from "./assets/article/different-palettes-3.png"
import differentPalettes4Src from "./assets/article/different-palettes-4.png"
import differentPalettes5Src from "./assets/article/different-palettes-5.png"
import differentPalettes6Src from "./assets/article/different-palettes-6.png"
import adjustments1Src from "./assets/article/adjustments-1.png"
import adjustments2Src from "./assets/article/adjustments-2.png"
import refinement1Src from "./assets/article/refinement-1.png"
import refinement2Src from "./assets/article/refinement-2.png"
import merch1Src from "./assets/article/merch-1.png"
import merch2Src from "./assets/article/merch-2.png"
import "./hub.css"

type ArticleImagePairKey =
  | "title"
  | "filter"
  | "photo"
  | "pixelSize"
  | "palette"
  | "adjustments"
  | "refinement"
  | "merch"

type ArticleBlock =
  | { type: "p"; content: string }
  | { type: "ul" | "ol"; items: string[] }

type ArticleSection = {
  id: string
  tocLabel: string
  heading: string
  imagePairKey?: ArticleImagePairKey
  blocks: ArticleBlock[]
}

type ArticleTocItem = {
  id: string
  label: string
  imagePairKey?: ArticleImagePairKey
}

type ArticleImageSource = string | string[]

const ARTICLE_TITLE =
  "Turning Photos into Pixel Art Online: How to Create Powerful Retro-Style Images with PIXTUDIO"

const ARTICLE_IMAGE_PAIRS: Record<
  ArticleImagePairKey,
  { left: ArticleImageSource; right: ArticleImageSource; alt: string }
> = {
  title: {
    left: cyclistSrc,
    right: riderSrc,
    alt: "Pixel art illustration for the article about turning photos into pixel art",
  },
  filter: {
    left: arcadeSrc,
    right: rocketSrc,
    alt: "Pixel art examples showing arcade and rocket scenes",
  },
  photo: {
    left: contrastPortraitSrc,
    right: softPortraitSrc,
    alt: "Contrasting pixel portraits showing how photo choice affects pixel art",
  },
  pixelSize: {
    left: cactusSrc,
    right: teddyBearSrc,
    alt: "Pixel art cactus and teddy bear examples for pixel size choices",
  },
  palette: {
    left: [
      differentPalettesSourceSrc,
      differentPalettes1Src,
      differentPalettes2Src,
      differentPalettes3Src,
    ],
    right: [
      differentPalettesSourceSrc,
      differentPalettes4Src,
      differentPalettes5Src,
      differentPalettes6Src,
    ],
    alt: "One portrait transformed into pixel art with different imported color palettes",
  },
  adjustments: {
    left: adjustments2Src,
    right: adjustments1Src,
    alt: "PIXTUDIO adjustment examples showing edited and neutral settings",
  },
  refinement: {
    left: refinement2Src,
    right: refinement1Src,
    alt: "Manual refinement example showing a photo and the final pixel art result",
  },
  merch: {
    left: merch1Src,
    right: merch2Src,
    alt: "Pixel art examples for merch, game art, and print use",
  },
}

const INTRO_BLOCKS: ArticleBlock[] = [
  {
    type: "p",
    content:
      "Pixel art has long since moved beyond being merely a technical limitation of the 8-bit era. Today, it is a conscious artistic choice valued by indie game developers, digital artists, content creators, and anyone who appreciates expressive visuals. Even in the age of hyper-realistic textures and 4K rendering, bold pixels and limited color palettes continue to captivate audiences.",
  },
  {
    type: "p",
    content:
      "Why does this happen? Because pixel art consciously sacrifices fine details in favor of emphasizing the very essence of the image. It occupies a special place in visual art - similar to poetry in literature: brevity here is not poverty, but the highest concentration of meaning. An image built from large squares and painted with clean colors forces the artist to speak concisely, powerfully, and emotionally.",
  },
]

const ARTICLE_SECTIONS: ArticleSection[] = [
  {
    id: "pixel-art-is-more-than-filter",
    tocLabel: "Pixel Art Is Much More Than Just a Filter",
    heading: "Pixel Art Is Much More Than Just a Filter",
    imagePairKey: "filter",
    blocks: [
      {
        type: "p",
        content:
          "Many beginners confuse authentic pixel art with simple pixelation filters. This is a critical mistake that often leads to dull and muddy results.",
      },
      {
        type: "ul",
        items: [
          "A regular filter simply overlays an effect: it mechanically breaks the image into squares and blurs the colors without changing the core nature of the shot.",
          "True pixel art in **PIXTUDIO** works differently: it rebuilds the image from the inside out. The algorithm and the artist work together to decide which details are important, which can be discarded, which color must remain, and which should blend with its neighbor.",
        ],
      },
      {
        type: "p",
        content:
          "Pixelization is not mere decoration or another button in a social media toolkit. It is a full-fledged visual language - the voice with which the author speaks to the viewer. By simplifying the image into large color blocks, it draws attention to the idea and composition rather than technical perfection of the original photo.",
      },
      {
        type: "p",
        content:
          "This is why the genre survived the era of old consoles. Today, games in this aesthetic win prestigious awards, and modern artists deliberately choose limitations that no longer exist technically. Viewers instantly recognize this code and respond to it emotionally - because behind the pixels lies nostalgia for honest, understandable simplicity.",
      },
    ],
  },
  {
    id: "getting-started-right-photo",
    tocLabel: "Getting Started: How to Choose the Right Photo",
    heading: "Getting Started: How to Choose the Right Photo",
    imagePairKey: "photo",
    blocks: [
      {
        type: "p",
        content:
          "Not every photograph is suitable for transformation into low-resolution graphics. If fine textures and microscopic nuances are what make the shot valuable, it's often better to leave it as a regular photo.",
      },
      { type: "p", content: "**Photos that work great:**" },
      {
        type: "ul",
        items: [
          "Close-up portraits with clear silhouettes, expressive facial expressions, and strong directional lighting.",
          "Architecture and urban scenes with rigid geometry and clear perspectives.",
          "Still life and single objects with distinct shapes.",
          "Animals on relatively clean backgrounds.",
          "Dramatic sunset and sunrise scenes with strong contrast.",
        ],
      },
      { type: "p", content: "**Photos that usually don't work well:**" },
      {
        type: "ul",
        items: [
          "Complex macro shots (flowers, insects).",
          "Foggy or blurry landscapes.",
          "Wide shots full of fine foliage.",
          "Distant group portraits.",
        ],
      },
      {
        type: "p",
        content:
          "**Expert tip:** When in doubt - just try it. Sometimes the most unexpected photo from your phone gallery produces the strongest artistic result.",
      },
    ],
  },
  {
    id: "pixel-size-creative-decision",
    tocLabel: "Pixel Size: The Artist's Most Important Creative Decision",
    heading: "Pixel Size: The Artist's Most Important Creative Decision",
    imagePairKey: "pixelSize",
    blocks: [
      {
        type: "p",
        content:
          "If choosing the photo is about selecting the subject, then choosing the pixel size (grid size) is like choosing the literary genre. It largely determines the soul and emotional impact of the final piece.",
      },
      {
        type: "p",
        content:
          "In PIXTUDIO, you can flexibly control the grid size. Here are the three main approaches:",
      },
      {
        type: "p",
        content:
          "**Large pixels (8-16 px)** create a bold, poster-like, symbolic aesthetic. Faces turn into masks, landscapes into symbols. This style is perfect for avatars, sticker packs, merch, and strong visual statements.",
      },
      {
        type: "p",
        content:
          "**Medium pixels (18-32 px)** offer the classic sweet spot. There is enough detail for instant recognition, while the retro feel remains clear and strong. This is the best choice for game assets, sprites, blog illustrations, and social media content.",
      },
      {
        type: "p",
        content:
          '**Small pixels (32+ px)** are closer to a "pixelated photo." They preserve more of the original details. This approach works well for complex architectural shots where you want to keep textures and text recognizable.',
      },
      {
        type: "p",
        content:
          "**Recommendation:** Start experimenting with a relatively large grid. Feel how the image breaks down into basic shapes and colors. Then gradually reduce the pixel size until you find the perfect balance between form and recognizability. This balance is a decision made by the artist, not by an algorithm.",
      },
    ],
  },
  {
    id: "working-with-color-palette",
    tocLabel: "Working with Color Palette - The Heart of Pixel Art",
    heading: "Working with Color Palette - The Heart of Pixel Art",
    imagePairKey: "palette",
    blocks: [
      {
        type: "p",
        content:
          "While a regular photo uses millions of colors, authentic pixel art usually works with 8 to 32 colors. At first glance, this may seem like a limitation, but in practice it is a strict creative discipline that forces you to think seriously about color.",
      },
      {
        type: "p",
        content:
          "When you have few colors, each one carries significant weight. Warm and cool tones either harmonize or create tension - and that tension becomes part of your artistic message. A single well-placed accent color in a limited palette can be far more powerful than dozens of subtle gradients.",
      },
      { type: "p", content: "**Useful techniques in PIXTUDIO:**" },
      {
        type: "ol",
        items: [
          "**Importing external palettes** - a unique feature of the editor. You can import a color scheme from another photo, a classic game, or a reference. Imagine taking a modern portrait and coloring it with the palette of a neon cyberpunk landscape or an old Game Boy game.",
          "**Creating consistent series** - applying the same palette to all your works automatically unites them into a cohesive visual series.",
          "**Manual control** - don't hesitate to change individual color swatches after automatic conversion. If the shadows feel too muddy, replace that color - all related pixels on the canvas will update instantly.",
        ],
      },
    ],
  },
  {
    id: "non-destructive-editing",
    tocLabel: "Non-Destructive Editing: A Modern Approach to Retro Graphics",
    heading: "Non-Destructive Editing: A Modern Approach to Retro Graphics",
    imagePairKey: "adjustments",
    blocks: [
      {
        type: "p",
        content:
          "Automatic pixelation is a powerful tool, but it's only the foundation. The algorithm makes a reasonable technical average, but it doesn't know your artistic intent.",
      },
      {
        type: "p",
        content:
          "One of PIXTUDIO's biggest advantages is its **non-destructive** editing architecture. The original imported image is preserved as an unchanged source. All adjustments are applied on top of it in real time.",
      },
      { type: "p", content: "You can adjust at any moment:" },
      {
        type: "ul",
        items: [
          "Exposure and contrast",
          "Highlights and deep shadows",
          "Midtones",
          "Saturation and white balance",
        ],
      },
      {
        type: "p",
        content:
          'These sliders remain "live" relative to the original. This fundamentally changes the creative process. You no longer need to pre-edit the photo in heavy external programs.',
      },
      {
        type: "p",
        content:
          "Want cleaner, more neon colors? Increase saturation. Need deeper, cleaner shadows? Adjust the dark areas. Shift the white balance toward blue - and the image instantly gains a cold, melancholic, or nostalgic mood. You see the result immediately in the pixel preview.",
      },
    ],
  },
  {
    id: "manual-refinement",
    tocLabel: "Manual Refinement - The Artist's Final Touch",
    heading: "Manual Refinement - The Artist's Final Touch",
    imagePairKey: "refinement",
    blocks: [
      {
        type: "p",
        content:
          "Real digital art is born where mathematical algorithms end and the human hand begins.",
      },
      {
        type: "p",
        content:
          "PIXTUDIO's built-in pixel editor allows you to add the final touches:",
      },
      {
        type: "ul",
        items: [
          "Draw and erase with a square brush",
          "Strengthen important lines and accents",
          "Clean up unwanted artifacts",
          "Create clean, professional contours",
        ],
      },
      {
        type: "p",
        content:
          'It is at this stage that your individual artistic style truly emerges. The image stops looking like "a photo with a filter" and becomes an honest, handmade piece of pixel art.',
      },
    ],
  },
  {
    id: "where-to-use-pixel-art",
    tocLabel: "Where to Use Your Pixel Art",
    heading: "Where to Use Your Pixel Art",
    imagePairKey: "merch",
    blocks: [
      {
        type: "p",
        content:
          "Pixel art created in PIXTUDIO has many practical applications:",
      },
      {
        type: "ul",
        items: [
          "**Game Development**: Creating sprites, items, UI elements, and tilesets for indie games.",
          "**Personal Branding**: Unique avatars and profile pictures for social networks, Telegram, and Discord.",
          "**Content Creation**: Eye-catching visuals for TikTok, Instagram Reels, and YouTube Shorts (especially process videos).",
          "**Merch and Print**: Designs for t-shirts, hoodies, stickers, posters, and postcards.",
          "**Office & Spreadsheet Art**: Export your pixel art directly to Excel - each pixel becomes a colored cell. Use it to decorate reports, create unusual table headers, or just surprise your colleagues with a pixel masterpiece hidden in a spreadsheet.",
          "**Branding**: Logos, mascots, and creatives for gaming, retro, and tech brands.",
        ],
      },
    ],
  },
  {
    id: "browser-based-editor",
    tocLabel: "Why a Browser-Based Editor Is the Best Solution Today",
    heading: "Why a Browser-Based Editor Is the Best Solution Today",
    blocks: [
      {
        type: "p",
        content:
          "The time when you needed to download heavy software and spend weeks learning complex interfaces is over. Browser tools like PIXTUDIO have revolutionized the process.",
      },
      {
        type: "ul",
        items: [
          "**Full cross-platform support**: Works on smartphones, tablets, and computers with just an internet connection.",
          "**Zero learning curve**: You can get your first great result within minutes.",
          "**Instant results**: Every change appears on screen immediately.",
        ],
      },
    ],
  },
  {
    id: "conclusion",
    tocLabel: "Conclusion",
    heading: "Conclusion",
    blocks: [
      {
        type: "p",
        content:
          "Pixel art is not just nostalgia or a tribute to the past. It is a wonderful way to look at the familiar world from a different angle, remove visual noise, and reveal the hidden form and true meaning of things.",
      },
      {
        type: "p",
        content:
          "You don't need to graduate from art school or buy expensive software. All you need is an interesting photo, a bit of imagination, and a convenient tool at hand.",
      },
      {
        type: "p",
        content:
          "Try changing the way you see graphics. Upload your first photo to **PIXTUDIO** right now and watch how an ordinary image turns into something authentic and powerful.",
      },
    ],
  },
]

const ARTICLE_TOC_ITEMS: ArticleTocItem[] = [
  { id: "introduction", label: "Introduction", imagePairKey: "title" },
  ...ARTICLE_SECTIONS.map((section) => ({
    id: section.id,
    label: section.tocLabel,
    imagePairKey: section.imagePairKey,
  })),
]

function renderInlineText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
    }

    return part
  })
}

function renderBlock(block: ArticleBlock, key: string) {
  if (block.type === "p") {
    return <p key={key}>{renderInlineText(block.content)}</p>
  }

  const ListTag = block.type
  return (
    <ListTag key={key}>
      {block.items.map((item) => (
        <li key={item}>{renderInlineText(item)}</li>
      ))}
    </ListTag>
  )
}

function getArticleImageFrames(source: ArticleImageSource) {
  return Array.isArray(source) ? source : [source]
}

function ArticleImageFrames({
  source,
  alt,
  layerClassName = "",
}: {
  source: ArticleImageSource
  alt: string
  layerClassName?: string
}) {
  const frames = getArticleImageFrames(source)
  const hasCycle = frames.length > 1

  return (
    <div
      className={`articleImageFrameLayer${
        hasCycle ? " articleImageFrameLayerCycle" : ""
      }${layerClassName ? ` ${layerClassName}` : ""}`}
    >
      {frames.map((frame, index) => (
        <img
          key={`${frame}-${index}`}
          className={`articleImageFrame${
            hasCycle ? " articleImageFrameCycle" : " articleImageFrameStatic"
          }`}
          src={frame}
          alt={index === 0 ? alt : ""}
          style={
            hasCycle
              ? ({
                  "--article-frame-delay": `${index * 4}s`,
                } as CSSProperties)
              : undefined
          }
        />
      ))}
    </div>
  )
}

function ArticleSideImages({
  side,
  activePairKey,
}: {
  side: "left" | "right"
  activePairKey: ArticleImagePairKey
}) {
  return (
    <div className="articleSideImageStack">
      {(Object.keys(ARTICLE_IMAGE_PAIRS) as ArticleImagePairKey[]).map((key) => {
        const pair = ARTICLE_IMAGE_PAIRS[key]
        return (
          <div
            key={key}
            className={`articleSideImageGroup${
              activePairKey === key ? " articleSideImageGroupActive" : ""
            }`}
          >
            <ArticleImageFrames
              source={side === "left" ? pair.left : pair.right}
              alt=""
            />
          </div>
        )
      })}
    </div>
  )
}

function ArticleMobileHero({
  activePairKey,
}: {
  activePairKey: ArticleImagePairKey
}) {
  return (
    <section className="articleMobileHero" aria-label="Article illustration">
      {(Object.keys(ARTICLE_IMAGE_PAIRS) as ArticleImagePairKey[]).map((key) => {
        const pair = ARTICLE_IMAGE_PAIRS[key]
        return (
          <div
            className={`articleMobileHeroPair${
              activePairKey === key ? " articleMobileHeroPairActive" : ""
            }`}
            key={key}
          >
            <ArticleImageFrames
              source={pair.left}
              alt={pair.alt}
              layerClassName="articleMobileHeroImageA"
            />
            <ArticleImageFrames
              source={pair.right}
              alt=""
              layerClassName="articleMobileHeroImageB"
            />
          </div>
        )
      })}
    </section>
  )
}

export default function LearnPage() {
  usePageSeo(SITE_ROUTE_SEO.learn)

  const cardsRef = useRef<HTMLElement | null>(null)
  const sectionRefs = useRef<Array<HTMLElement | null>>([])
  const tocRef = useRef<HTMLElement | null>(null)
  const tocItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const tocHighlightRef = useRef<HTMLSpanElement | null>(null)
  const mobileScrollbarRef = useRef<HTMLDivElement | null>(null)
  const mobileScrollbarThumbRef = useRef<HTMLSpanElement | null>(null)
  const mobileScrollbarDragRef = useRef<{
    pointerId: number
    grabOffset: number
  } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [activePairKey, setActivePairKey] =
    useState<ArticleImagePairKey>("title")
  const [mobileScrollbarThumb, setMobileScrollbarThumb] = useState({
    top: 0,
    height: 0,
    progress: 0,
    visible: false,
  })

  const articleStructuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          "@id": `${toAbsoluteSiteUrl("/pixel-art-from-photos/")}#article`,
          headline: ARTICLE_TITLE,
          name: "Pixel Art from Photos",
          url: toAbsoluteSiteUrl("/pixel-art-from-photos/"),
          image: [
            toAbsoluteSiteUrl(cyclistSrc),
            toAbsoluteSiteUrl(riderSrc),
            toAbsoluteSiteUrl(arcadeSrc),
            toAbsoluteSiteUrl(rocketSrc),
            toAbsoluteSiteUrl(contrastPortraitSrc),
            toAbsoluteSiteUrl(softPortraitSrc),
            toAbsoluteSiteUrl(cactusSrc),
            toAbsoluteSiteUrl(teddyBearSrc),
            toAbsoluteSiteUrl(differentPalettesSourceSrc),
            toAbsoluteSiteUrl(differentPalettes1Src),
            toAbsoluteSiteUrl(differentPalettes2Src),
            toAbsoluteSiteUrl(differentPalettes3Src),
            toAbsoluteSiteUrl(differentPalettes4Src),
            toAbsoluteSiteUrl(differentPalettes5Src),
            toAbsoluteSiteUrl(differentPalettes6Src),
            toAbsoluteSiteUrl(adjustments1Src),
            toAbsoluteSiteUrl(adjustments2Src),
            toAbsoluteSiteUrl(refinement1Src),
            toAbsoluteSiteUrl(refinement2Src),
            toAbsoluteSiteUrl(merch1Src),
            toAbsoluteSiteUrl(merch2Src),
          ],
          mainEntityOfPage: toAbsoluteSiteUrl("/pixel-art-from-photos/"),
          isPartOf: { "@id": SITE_SCHEMA_IDS.website },
          publisher: { "@id": SITE_SCHEMA_IDS.organization },
          author: { "@id": SITE_SCHEMA_IDS.organization },
        },
        {
          "@type": "WebPage",
          "@id": `${toAbsoluteSiteUrl("/pixel-art-from-photos/")}#webpage`,
          name: "Pixel Art from Photos",
          url: toAbsoluteSiteUrl("/pixel-art-from-photos/"),
          description:
            "A practical guide to turning photos into expressive pixel art with PIXTUDIO.",
          image: SITE_OG_IMAGE_URL,
          isPartOf: { "@id": SITE_SCHEMA_IDS.website },
          about: { "@id": SITE_SCHEMA_IDS.software },
        },
        createBreadcrumbList(
          "Pixel Art from Photos",
          "/pixel-art-from-photos/"
        ),
      ],
    }),
    []
  )

  useEffect(() => {
    const scroller = cardsRef.current
    if (!scroller) return

    const updateActiveSection = () => {
      const scrollTop = scroller.scrollTop
      let nextIndex = 0
      let nextPairKey: ArticleImagePairKey = "title"

      sectionRefs.current.forEach((section, index) => {
        if (!section) return
        const heading = section.querySelector("h1, h2") as HTMLElement | null
        const sectionTop = heading?.offsetTop ?? section.offsetTop
        if (sectionTop <= scrollTop + 4) {
          nextIndex = index
          const pairKey = ARTICLE_TOC_ITEMS[index]?.imagePairKey
          if (pairKey) nextPairKey = pairKey
        }
      })

      setActiveIndex(nextIndex)
      setActivePairKey(nextPairKey)
    }

    updateActiveSection()
    scroller.addEventListener("scroll", updateActiveSection, { passive: true })
    window.addEventListener("resize", updateActiveSection)

    return () => {
      scroller.removeEventListener("scroll", updateActiveSection)
      window.removeEventListener("resize", updateActiveSection)
    }
  }, [])

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

      thumb.style.setProperty(
        "--article-scrollbar-thumb-height",
        `${next.height}px`
      )
      thumb.style.setProperty(
        "--article-scrollbar-thumb-y",
        `${next.top}px`
      )
      thumb.style.setProperty(
        "--article-scrollbar-thumb-opacity",
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

  useLayoutEffect(() => {
    const updateTocHighlight = () => {
      const toc = tocRef.current
      const activeItem = tocItemRefs.current[activeIndex]
      const highlight = tocHighlightRef.current
      if (!toc || !activeItem || !highlight) return

      const tocRect = toc.getBoundingClientRect()
      const itemRect = activeItem.getBoundingClientRect()
      highlight.style.setProperty(
        "--article-toc-highlight-height",
        `${itemRect.height}px`
      )
      highlight.style.setProperty(
        "--article-toc-highlight-y",
        `${itemRect.top - tocRect.top + toc.scrollTop}px`
      )
    }

    updateTocHighlight()
    window.addEventListener("resize", updateTocHighlight)

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateTocHighlight)

    if (observer) {
      if (tocRef.current) observer.observe(tocRef.current)
      tocItemRefs.current.forEach((item) => {
        if (item) observer.observe(item)
      })
    }

    return () => {
      window.removeEventListener("resize", updateTocHighlight)
      observer?.disconnect()
    }
  }, [activeIndex])

  const scrollToSection = (index: number) => {
    const scroller = cardsRef.current
    const target = sectionRefs.current[index]
    if (!scroller || !target) return

    setActiveIndex(index)
    scroller.scrollTo({
      top:
        (target.querySelector("h1, h2") as HTMLElement | null)?.offsetTop ??
        target.offsetTop,
      behavior: "smooth",
    })
  }

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
        ? target.closest(".articleMobileScrollbarThumb")
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
      activePage="learn"
      className="siteTemplatePage siteArticlePage"
      headerClassName="siteTemplateHeader articleHeader"
      mainClassName="siteTemplateMain siteArticleLayout"
      mainAriaLabel="Pixel Art from Photos"
      footerClassName="siteTemplateFooter articleFooter"
    >
      <JsonLd id="pixtudio-article-jsonld" data={articleStructuredData} />

      <section className="articleSideColumn articleSideColumnLeft" aria-hidden="true">
        <ArticleSideImages side="left" activePairKey={activePairKey} />
      </section>

      <div className="articleMobileContentColumn">
        <ArticleMobileHero activePairKey={activePairKey} />

        <section className="articleCenterColumn" aria-label="Pixel Art from Photos content">
          <aside className="articleToc" aria-label="Article sections" ref={tocRef}>
            <span
              className="articleTocHighlight"
              aria-hidden="true"
              ref={tocHighlightRef}
            />
            {ARTICLE_TOC_ITEMS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(index)}
                className="articleTocItem"
                ref={(node) => {
                  tocItemRefs.current[index] = node
                }}
              >
                {item.label}
              </button>
            ))}
          </aside>

          <div className="articleMobileCardsViewport">
            <section
              id="article-content"
              className="articleCards"
              aria-label="Pixel art from photos article"
              ref={cardsRef}
            >
              <article className="articleCard">
                <section
                  id="introduction"
                  className="articleSection articleIntroSection"
                  ref={(node) => {
                    sectionRefs.current[0] = node
                  }}
                >
                  <h1>{ARTICLE_TITLE}</h1>
                  {INTRO_BLOCKS.map((block, blockIndex) =>
                    renderBlock(block, `intro-${blockIndex}`)
                  )}
                </section>

                {ARTICLE_SECTIONS.map((section, sectionIndex) => {
                  const refIndex = sectionIndex + 1
                  return (
                    <section
                      id={section.id}
                      className="articleSection"
                      key={section.id}
                      ref={(node) => {
                        sectionRefs.current[refIndex] = node
                      }}
                    >
                      <h2>{section.heading}</h2>
                      {section.blocks.map((block, blockIndex) =>
                        renderBlock(block, `${section.id}-${blockIndex}`)
                      )}
                    </section>
                  )
                })}
              </article>
            </section>
            <div
              className="articleMobileScrollbar"
              aria-label="Scroll article"
              role="scrollbar"
              aria-controls="article-content"
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
                className="articleMobileScrollbarThumb"
                ref={mobileScrollbarThumbRef}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="articleSideColumn articleSideColumnRight" aria-hidden="true">
        <ArticleSideImages side="right" activePairKey={activePairKey} />
      </section>
    </SiteShell>
  )
}

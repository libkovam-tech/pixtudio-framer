import {
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
  SITE_ROUTE_SEO,
  SITE_SCHEMA_IDS,
  createBreadcrumbList,
  toAbsoluteSiteUrl,
  usePageSeo,
} from "./structuredData"
import "./hub.css"

const FAQ_LEFT_IMAGE_SRC = "/media/faq-left.png"
const FAQ_RIGHT_IMAGE_SRC = "/media/faq-right.png"

export const FAQ_ITEMS = [
  {
    question: "Who is PIXTUDIO made for?",
    tocLabel: "Who is PIXTUDIO for?",
    answer:
      "PIXTUDIO is made for anyone who wants to turn photos or ideas into stylish pixel art - from complete beginners to indie game developers and content creators.",
  },
  {
    question: "Do I need to know how to draw to use PIXTUDIO?",
    tocLabel: "Do I need drawing skills to use it?",
    answer:
      "No. You don't need any drawing skills. Most people start by uploading a photo, which PIXTUDIO automatically turns into pixel art. You can then make adjustments if you want, but drawing from scratch is not required.",
  },
  {
    question: "Can I use PIXTUDIO to create game assets and keep a consistent style?",
    tocLabel: "Can I create consistent game assets?",
    answer:
      "Yes. PIXTUDIO is especially useful for creating game assets because you can use the same grid size and color palette across all your images. You can import a palette from any photo or previous project and apply it instantly - this makes it easy to create consistent tiles, items, characters, and environments in the same visual style.",
  },
  {
    question: "Does the editor support importing custom color palettes?",
    tocLabel: "Does it support custom palettes?",
    answer:
      "Yes. You can extract a palette from any photo or saved project file and apply it instantly. Imported palettes appear as clickable buttons during your current session.",
    note:
      "Imported palettes are only available in the current session. However, any palette applied to the image is saved with the project and will be restored when you reopen it.",
  },
  {
    question: "Are files created in PIXTUDIO suitable for merch and print products?",
    tocLabel: "Are files suitable for merch and print?",
    answer:
      "Yes. You can export your work as SVG. This vector format is perfect for high-quality printing and merch because it scales to any size without losing quality.",
  },
  {
    question: "Can I save my project and continue working on it later?",
    tocLabel: "Can I save and continue projects later?",
    answer:
      "Yes. You can save your project as a .pixtudio file at any time and continue editing it later.",
  },
  {
    question: "Can PIXTUDIO record the pixelization process as a video?",
    tocLabel: "Can it record pixelization as video?",
    answer:
      "Yes. PIXTUDIO lets you record a video of the entire pixelization process. You can adjust speed, add music, and export it as an MP4 file - perfect for sharing your creation.",
  },
  {
    question: "Can I use files exported from PIXTUDIO for publishing online?",
    tocLabel: "Can I use files for online publishing?",
    answer:
      "Yes. PNG images and MP4 recordings work perfectly on social networks and websites. SVG is useful when you need scalable artwork.",
  },
  {
    question: "Does the editor work on mobile devices?",
    tocLabel: "Does it work on mobile?",
    answer:
      "Yes. PIXTUDIO is designed with a Mobile-First approach, so it works smoothly on phones and tablets in any modern browser.",
  },
  {
    question: "Do I need to install any software to use PIXTUDIO?",
    tocLabel: "Do I need to install anything?",
    answer:
      "No. All you need is a modern web browser and an internet connection.",
  },
  {
    question: "Can I manually edit images inside the editor?",
    tocLabel: "Can I edit images manually?",
    answer:
      "Yes. PIXTUDIO offers non-destructive adjustments where you can fine-tune Exposure, Highlights, Midtones, Shadows, Saturation, and White Balance at any time.",
    note:
      "Additionally, you can draw and erase directly on the pixel art with a brush, and you can crop or rotate the source image before importing it onto the canvas.",
  },
  {
    question: "What export formats are available?",
    tocLabel: "What export formats are available?",
    answer:
      "You can export pixel art as PNG, SVG, XLSX, or a ZIP bundle containing all three files. You can also record your process as MP4 video.",
  },
]

function slugifyQuestion(question: string) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export default function FaqPage() {
  usePageSeo(SITE_ROUTE_SEO.faq)

  const cardsRef = useRef<HTMLElement | null>(null)
  const cardRefs = useRef<Array<HTMLElement | null>>([])
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
  const [mobileScrollbarThumb, setMobileScrollbarThumb] = useState({
    top: 0,
    height: 0,
    progress: 0,
    visible: false,
  })
  const faqStructuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "FAQPage",
          "@id": `${toAbsoluteSiteUrl("/faq/")}#faqpage`,
          name: "PIXTUDIO FAQ",
          url: toAbsoluteSiteUrl("/faq/"),
          isPartOf: { "@id": SITE_SCHEMA_IDS.website },
          publisher: { "@id": SITE_SCHEMA_IDS.organization },
          mainEntity: FAQ_ITEMS.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.note
                ? `${item.answer} Note: ${item.note}`
                : item.answer,
            },
          })),
        },
        createBreadcrumbList("FAQ", "/faq/"),
      ],
    }),
    []
  )

  useEffect(() => {
    const scroller = cardsRef.current
    if (!scroller) return

    const updateActiveQuestion = () => {
      const scrollTop = scroller.scrollTop
      let nearestIndex = 0
      let nearestDistance = Number.POSITIVE_INFINITY

      cardRefs.current.forEach((card, index) => {
        if (!card) return
        const distance = Math.abs(card.offsetTop - scrollTop)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = index
        }
      })

      setActiveIndex(nearestIndex)
    }

    updateActiveQuestion()
    scroller.addEventListener("scroll", updateActiveQuestion, { passive: true })
    window.addEventListener("resize", updateActiveQuestion)

    return () => {
      scroller.removeEventListener("scroll", updateActiveQuestion)
      window.removeEventListener("resize", updateActiveQuestion)
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

      thumb.style.setProperty("--faq-scrollbar-thumb-height", `${next.height}px`)
      thumb.style.setProperty("--faq-scrollbar-thumb-y", `${next.top}px`)
      thumb.style.setProperty(
        "--faq-scrollbar-thumb-opacity",
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
          Math.min(trackHeight, (scroller.clientHeight / scroller.scrollHeight) * trackHeight)
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
        "--faq-toc-highlight-height",
        `${itemRect.height}px`
      )
      highlight.style.setProperty(
        "--faq-toc-highlight-y",
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

  const scrollToQuestion = (index: number) => {
    const scroller = cardsRef.current
    const target = cardRefs.current[index]
    if (!scroller || !target) return

    setActiveIndex(index)
    scroller.scrollTo({
      top: target.offsetTop,
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
    const thumb = target instanceof Element
      ? target.closest(".faqMobileScrollbarThumb")
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
      activePage="faq"
      className="faqPage"
      headerClassName="faqHeader"
      mainClassName="faqLayout"
      mainAriaLabel="PIXTUDIO FAQ"
      footerClassName="faqFooter"
    >
      <JsonLd id="pixtudio-faq-jsonld" data={faqStructuredData} />
      <section className="faqSideColumn faqSideColumnLeft" aria-hidden="true">
        <img
          className="faqSideImage faqSideImageLeft"
          src={FAQ_LEFT_IMAGE_SRC}
          alt=""
        />
      </section>

      <div className="faqMobileContentColumn">
        <section className="faqMobileHero" aria-label="PIXTUDIO FAQ preview">
          <img
            className="faqMobileHeroImage faqMobileHeroImageLeft"
            src={FAQ_LEFT_IMAGE_SRC}
            alt=""
          />
          <img
            className="faqMobileHeroImage faqMobileHeroImageRight"
            src={FAQ_RIGHT_IMAGE_SRC}
            alt=""
          />
        </section>

        <section className="faqCenterColumn" aria-label="PIXTUDIO FAQ content">
          <aside className="faqToc" aria-label="FAQ questions" ref={tocRef}>
            <span
              className="faqTocHighlight"
              aria-hidden="true"
              ref={tocHighlightRef}
            />
            {FAQ_ITEMS.map((item, index) => (
              <button
                key={item.question}
                type="button"
                onClick={() => scrollToQuestion(index)}
                className="faqTocItem"
                ref={(node) => {
                  tocItemRefs.current[index] = node
                }}
              >
                {item.tocLabel}
              </button>
            ))}
          </aside>

          <div className="faqMobileCardsViewport">
            <section
              id="faq-cards"
              className="faqCards"
              aria-label="Frequently asked questions"
              ref={cardsRef}
            >
              {FAQ_ITEMS.map((item, index) => {
                const id = slugifyQuestion(item.question)
                return (
                  <article
                    className="faqCard"
                    id={id}
                    key={item.question}
                    ref={(node) => {
                      cardRefs.current[index] = node
                    }}
                  >
                    <h2>{item.question}</h2>
                    <p>{item.answer}</p>
                    {item.note ? (
                      <p>
                        <strong>Note:</strong> {item.note}
                      </p>
                    ) : null}
                  </article>
                )
              })}
            </section>
            <div
              className="faqMobileScrollbar"
              aria-label="Scroll FAQ cards"
              role="scrollbar"
              aria-controls="faq-cards"
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
                className="faqMobileScrollbarThumb"
                ref={mobileScrollbarThumbRef}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="faqSideColumn faqSideColumnRight" aria-hidden="true">
        <img
          className="faqSideImage faqSideImageRight"
          src={FAQ_RIGHT_IMAGE_SRC}
          alt=""
        />
      </section>
    </SiteShell>
  )
}

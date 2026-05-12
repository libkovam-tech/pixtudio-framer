import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const DIST_INDEX = resolve("dist/index.html")
const ROOT_MARKER = '<div id="root"></div>'

const cards = [
  {
    title: "LIVE TRANSFORMATION",
    body: "Move sliders and watch your photo turn into pixel art in real time. Mesmerizing and instant.",
  },
  {
    title: "FULL CREATIVE CONTROL",
    body: "Smart palette, manual drawing, SVG export, and savable projects. Real creative tool.",
  },
  {
    title: "CREATORS & GAME DEVS LOVE IT",
    body: "From viral Reels and TikToks to pro game assets. Loved by creators and indie devs.",
  },
  {
    title: "RECORD THE MAGIC",
    body: "Capture the live process as MP4 with music in one click. Perfect for Reels, TikTok, and Shorts.",
  },
  {
    title: "PRE-PRODUCTION FOR GAME ARTISTS",
    body: "Turn references into clean pixel art bases with consistent palettes. Fits next to Aseprite.",
  },
  {
    title: "READY FOR PRODUCTION",
    body: "SVG export and precise color control for professional merch. Lower printing costs.",
  },
  {
    title: "PALETTE CONTROLS EVERYTHING",
    body: "Change one color – the whole image updates instantly. Import palettes from any photo.",
  },
  {
    title: "NO DRAWING SKILLS NEEDED",
    body: "Upload any photo and create beautiful personalized pixel art in seconds. Pure fun.",
  },
  {
    title: "MORE THAN A GENERATOR",
    body: "Manual drawing, project saving, Smart Object, and full editing tools. Start fast, finish pro.",
  },
]

const seoParagraphs = [
  {
    accent: "PIXTUDIO is a browser-based pixel art editor",
    text:
      "that turns ordinary photos into high-quality pixel art with real creative control. Unlike regular filters, you control the grid, palette, colors, and details.",
  },
  {
    accent: "Perfect for both fast social content and professional work.",
    text:
      "Content creators love it for Reels, avatars, and posts, while indie game developers use it to create consistent pixel art assets quickly.",
  },
  {
    accent:
      "Change palette or grid size and see the whole image update instantly.",
    text: "Import palettes from any photo, draw manually, and save projects for later.",
  },
  {
    accent:
      "Export as PNG or SVG, or record the live process as MP4 for social media.",
    text: "No installation needed – everything works in your browser.",
  },
]

const faqItems = [
  ["Can I export SVG?", "Yes – export PNG or SVG."],
  ["Can I use my own palette?", "Yes – import one from any photo."],
  ["Can I save MP4?", "Yes – record the live process with music."],
  ["Is it for game assets?", "Yes – use exact grids and palettes."],
  ["Does it work on mobile?", "Yes – in a modern browser."],
]

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderCards() {
  return cards
    .map(
      (card) => `
        <article class="prerenderHomeCard">
          <h2>${escapeHtml(card.title)}</h2>
          <p>${escapeHtml(card.body)}</p>
        </article>`
    )
    .join("")
}

function renderSeoCopy() {
  return seoParagraphs
    .map(
      (paragraph) => `
        <p><strong>${escapeHtml(paragraph.accent)}</strong> ${escapeHtml(paragraph.text)}</p>`
    )
    .join("")
}

function renderFaq() {
  return faqItems
    .map(
      ([question, answer]) =>
        `<p><strong>${escapeHtml(question)}</strong> ${escapeHtml(answer)}</p>`
    )
    .join("")
}

const prerenderHtml = `
<div id="root">
  <style>
    .prerenderHome {
      box-sizing: border-box;
      min-height: 100vh;
      padding: 32px 24px 48px;
      background: #e9d8a6;
      color: #001219;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .prerenderHomeInner {
      width: min(1180px, 100%);
      margin: 0 auto;
    }
    .prerenderHomeHero {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) minmax(260px, 520px) minmax(220px, 1fr);
      gap: 32px;
      align-items: end;
    }
    .prerenderHome h1 {
      margin: 0;
      font-size: clamp(42px, 5vw, 88px);
      line-height: 0.95;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .prerenderHomePoster {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      image-rendering: pixelated;
    }
    .prerenderHomeCta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 72px;
      border-radius: 999px;
      background: #ef3728;
      color: #fff;
      font-weight: 800;
      font-size: clamp(24px, 2.8vw, 42px);
      text-decoration: none;
    }
    .prerenderHomeSeo {
      margin-top: 28px;
      font-size: clamp(16px, 1.55vw, 24px);
      line-height: 1.28;
    }
    .prerenderHomeSeo p {
      margin: 0 0 16px;
    }
    .prerenderHomeFaq {
      margin-top: 22px;
      padding-top: 18px;
      border-top: 1px solid rgba(0, 18, 25, 0.32);
      font-size: 0.92em;
    }
    .prerenderHomeCards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-top: 36px;
    }
    .prerenderHomeCard {
      border: 2px solid #001219;
      border-radius: 14px;
      background: #fff;
      padding: 22px;
    }
    .prerenderHomeCard h2 {
      margin: 0 0 12px;
      font-size: 24px;
      line-height: 1.05;
      text-transform: uppercase;
    }
    .prerenderHomeCard p {
      margin: 0;
      font-size: 17px;
      line-height: 1.25;
    }
    @media (max-width: 800px) {
      .prerenderHomeHero {
        grid-template-columns: 1fr;
      }
      .prerenderHomeCta {
        margin-top: 20px;
      }
    }
  </style>
  <main class="prerenderHome" data-prerendered-home="true">
    <div class="prerenderHomeInner">
      <section class="prerenderHomeHero" aria-label="PIXTUDIO photo-to-pixel-art editor">
        <h1>Turn Photos<br />Into Pixel Art<br />Instantly</h1>
        <img
          class="prerenderHomePoster"
          src="/media/landing-video-poster.jpg"
          alt="Photo-to-pixel-art conversion preview showing PIXTUDIO turning images into pixel art"
          width="512"
          height="512"
          decoding="async"
          fetchpriority="high"
        />
        <div>
          <section class="prerenderHomeSeo" aria-label="About PIXTUDIO">
            ${renderSeoCopy()}
            <div class="prerenderHomeFaq" aria-label="PIXTUDIO quick FAQ">
              ${renderFaq()}
            </div>
          </section>
          <a class="prerenderHomeCta" href="/editor">Try PIXTUDIO Now</a>
        </div>
      </section>
      <section class="prerenderHomeCards" aria-label="PIXTUDIO features">
        ${renderCards()}
      </section>
    </div>
  </main>
</div>`

const html = await readFile(DIST_INDEX, "utf8")

if (!html.includes(ROOT_MARKER)) {
  throw new Error(`Cannot find ${ROOT_MARKER} in ${DIST_INDEX}`)
}

await writeFile(DIST_INDEX, html.replace(ROOT_MARKER, prerenderHtml))
console.log("Prerendered home content into dist/index.html")

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const SITE_BASE_URL = "https://pixtudio.app"
const SITE_OG_IMAGE_URL = `${SITE_BASE_URL}/og-image.jpg`
const DIST_INDEX = resolve("dist/index.html")
const ROOT_MARKER = '<div id="root"></div>'

const routeSeo = {
  home: {
    path: "/",
    output: "dist/index.html",
    title: "PIXTUDIO - Turn Photos into Pixel Art Online",
    description:
      "PIXTUDIO is a browser-based pixel art editor that turns photos into pixel art with live grid, palette, color editing, SVG export, and MP4 process recording.",
    ogTitle: "PIXTUDIO - Turn Photos into Pixel Art Online",
    ogDescription:
      "Create pixel art from photos in your browser. Control grid size, palettes, colors, SVG export, and record the live process as MP4.",
    ogType: "website",
  },
  faq: {
    path: "/faq/",
    output: "dist/faq/index.html",
    title: "PIXTUDIO FAQ - Pixel Art Editor Questions",
    description:
      "Answers to common questions about PIXTUDIO, including photo-to-pixel-art conversion, palettes, SVG and PNG export, MP4 recording, mobile use, and saved projects.",
    ogTitle: "PIXTUDIO FAQ - Pixel Art Editor Questions",
    ogDescription:
      "Find answers about PIXTUDIO features, exports, palettes, mobile support, project saving, and browser-based pixel art editing.",
    ogType: "website",
  },
  how: {
    path: "/how-it-works/",
    output: "dist/how-it-works/index.html",
    title: "PIXTUDIO How It Works - Pixel Art Editor Guide",
    description:
      "Explore PIXTUDIO feature scenarios for importing photos, shooting with a camera, drawing from a blank canvas, saving projects, exporting pixel art, editing palettes, and recording video.",
    ogTitle: "PIXTUDIO How It Works - Pixel Art Editor Guide",
    ogDescription:
      "See how PIXTUDIO works: import photos, draw from scratch, edit palettes, export pixel art, save projects, and record the pixelization process.",
    ogType: "website",
  },
  gallery: {
    path: "/gallery/",
    output: "dist/gallery/index.html",
    title: "PIXTUDIO Gallery - Pixel Art Inspiration",
    description:
      "Before-and-after gallery examples showing photos converted into pixel art with PIXTUDIO editing tools, custom palettes, presets, and retouching.",
    ogTitle: "PIXTUDIO Gallery - Pixel Art Inspiration",
    ogDescription:
      "Explore before-and-after examples of photos transformed into pixel art with PIXTUDIO.",
    ogType: "website",
  },
  learn: {
    path: "/pixel-art-from-photos/",
    output: "dist/pixel-art-from-photos/index.html",
    title: "Pixel Art from Photos - PIXTUDIO Guide",
    description:
      "A practical guide to turning photos into expressive pixel art online with PIXTUDIO, including photo choice, pixel size, palettes, non-destructive editing, and final refinement.",
    ogTitle: "Pixel Art from Photos - PIXTUDIO Guide",
    ogDescription:
      "Learn how to create powerful retro-style pixel art from photos using PIXTUDIO's grid, palette, and editing workflow.",
    ogType: "article",
  },
  links: {
    path: "/links/",
    output: "dist/links/index.html",
    title: "PIXTUDIO Links - Palette Resources",
    description:
      "Useful external palette resources for finding color inspiration and experimenting with custom palettes in PIXTUDIO.",
    ogTitle: "PIXTUDIO Links - Palette Resources",
    ogDescription:
      "External palette libraries for color inspiration and custom palette experiments in PIXTUDIO.",
    ogType: "website",
  },
}

const homeCards = [
  [
    "LIVE TRANSFORMATION",
    "Move sliders and watch your photo turn into pixel art in real time. Mesmerizing and instant.",
  ],
  [
    "FULL CREATIVE CONTROL",
    "Smart palette, manual drawing, SVG export, and savable projects. Real creative tool.",
  ],
  [
    "CREATORS & GAME DEVS LOVE IT",
    "From viral Reels and TikToks to pro game assets. Loved by creators and indie devs.",
  ],
  [
    "RECORD THE MAGIC",
    "Capture the live process as MP4 with music in one click. Perfect for Reels, TikTok, and Shorts.",
  ],
  [
    "PRE-PRODUCTION FOR GAME ARTISTS",
    "Turn references into clean pixel art bases with consistent palettes. Fits next to Aseprite.",
  ],
  [
    "READY FOR PRODUCTION",
    "SVG export and precise color control for professional merch. Lower printing costs.",
  ],
  [
    "PALETTE CONTROLS EVERYTHING",
    "Change one color - the whole image updates instantly. Import palettes from any photo.",
  ],
  [
    "NO DRAWING SKILLS NEEDED",
    "Upload any photo and create beautiful personalized pixel art in seconds. Pure fun.",
  ],
  [
    "MORE THAN A GENERATOR",
    "Manual drawing, project saving, Smart Object, and full editing tools. Start fast, finish pro.",
  ],
]

const faqItems = [
  [
    "Who is PIXTUDIO made for?",
    "PIXTUDIO is made for anyone who wants to turn photos or ideas into stylish pixel art - from complete beginners to indie game developers and content creators.",
  ],
  [
    "Do I need to know how to draw to use PIXTUDIO?",
    "No. You don't need any drawing skills. Most people start by uploading a photo, which PIXTUDIO automatically turns into pixel art. You can then make adjustments if you want, but drawing from scratch is not required.",
  ],
  [
    "Can I use PIXTUDIO to create game assets and keep a consistent style?",
    "Yes. PIXTUDIO is especially useful for creating game assets because you can use the same grid size and color palette across all your images. You can import a palette from any photo or previous project and apply it instantly.",
  ],
  [
    "Does the editor support importing custom color palettes?",
    "Yes. You can extract a palette from any photo or saved project file and apply it instantly. Imported palettes appear as clickable buttons during your current session.",
  ],
  [
    "Are files created in PIXTUDIO suitable for merch and print products?",
    "Yes. You can export your work as SVG. This vector format is perfect for high-quality printing and merch because it scales to any size without losing quality.",
  ],
  [
    "Can I save my project and continue working on it later?",
    "Yes. You can save your project as a .pixtudio file at any time and continue editing it later.",
  ],
  [
    "Can PIXTUDIO record the pixelization process as a video?",
    "Yes. PIXTUDIO lets you record a video of the entire pixelization process. You can adjust speed, add music, and export it as an MP4 file - perfect for sharing your creation.",
  ],
  [
    "Can I use files exported from PIXTUDIO for publishing online?",
    "Yes. Both PNG images and MP4 recordings work perfectly on all social networks and websites.",
  ],
  [
    "Does the editor work on mobile devices?",
    "Yes. PIXTUDIO is designed with a Mobile-First approach, so it works smoothly on phones and tablets in any modern browser.",
  ],
  [
    "Do I need to install any software to use PIXTUDIO?",
    "No. All you need is a modern web browser and an internet connection.",
  ],
  [
    "Can I manually edit images inside the editor?",
    "Yes. PIXTUDIO offers non-destructive adjustments where you can fine-tune Exposure, Highlights, Midtones, Shadows, Saturation, and White Balance at any time.",
  ],
  [
    "What export formats are available?",
    "You can export images as PNG or SVG, and record your process as MP4 video.",
  ],
]

const howItems = [
  [
    "Start with a Photo",
    "Choose a photo from your gallery, crop it to a square, rotate or scale if needed, and PIXTUDIO instantly converts it into pixel art.",
  ],
  [
    "Shoot with Camera",
    "Take a photo directly with your device and watch it transform into pixel art in real time.",
  ],
  [
    "Draw from a Blank Canvas",
    "Start drawing from scratch with brush size control, auto palette colors, or your own imported palette.",
  ],
  [
    "Save Your Project",
    "Save your work as a .pixtudio file so you can continue editing later with everything restored.",
  ],
  [
    "Open a Saved Project",
    "Open a .pixtudio file and return to any project exactly where you stopped.",
  ],
  [
    "Export Your Pixel Art",
    "Export PNG for social media and web use, or SVG for high-quality printing and merch.",
  ],
  [
    "Edit Color Swatches",
    "Change any palette color and all connected pixels on the canvas update instantly.",
  ],
  [
    "Add New Custom Colors",
    "Create your own colors and keep full control while changing grid size.",
  ],
  [
    "Apply Custom Palette",
    "Import a palette from an image or saved project and instantly give your artwork a new look.",
  ],
  [
    "Fine-Tune the Source Image",
    "Adjust Exposure, Highlights, Midtones, Shadows, Saturation, and White Balance non-destructively.",
  ],
  [
    "Record Pixelization Video",
    "Create a timelapse video of the pixelization process and export it as MP4.",
  ],
  [
    "User Manual",
    "Open the full in-app guide that explains every tool and button.",
  ],
]

const galleryItems = [
  [
    "Photo to pixel art",
    "Original photo from gallery, adjusted with editing tools and custom palette.",
  ],
  [
    "Pixel art bird",
    "A real photo turned into pixel art with an auto palette and small adjustments using the app's tools.",
  ],
  [
    "Warm portrait",
    "Gallery image refined with editing tools and auto palette.",
  ],
  [
    "Pixel art flower",
    "Pixel art created from a real photo with soft in-app retouching and an auto-generated palette.",
  ],
  [
    "Fashion portrait",
    "Gallery photo enhanced with editing tools and loaded palette preset.",
  ],
  [
    "Black and white portrait",
    "Pixel art portrait made from an everyday photo with the Black and White preset.",
  ],
  [
    "Colorful portrait",
    "Colorful portrait converted with an auto palette.",
  ],
  [
    "School portrait",
    "Pixel art portrait created from a school photo with soft in-app retouching and an external palette.",
  ],
]

const articleTitle =
  "Turning Photos into Pixel Art Online: How to Create Powerful Retro-Style Images with PIXTUDIO"

const articleSections = [
  {
    title: "Introduction",
    paragraphs: [
      "Pixel art has long since moved beyond being merely a technical limitation of the 8-bit era. Today, it is a conscious artistic choice valued by indie game developers, digital artists, content creators, and anyone who appreciates expressive visuals. Even in the age of hyper-realistic textures and 4K rendering, bold pixels and limited color palettes continue to captivate audiences.",
      "Why does this happen? Because pixel art consciously sacrifices fine details in favor of emphasizing the very essence of the image. It occupies a special place in visual art - similar to poetry in literature: brevity here is not poverty, but the highest concentration of meaning. An image built from large squares and painted with clean colors forces the artist to speak concisely, powerfully, and emotionally.",
    ],
  },
  {
    title: "Pixel Art Is Much More Than Just a Filter",
    paragraphs: [
      "Many beginners confuse authentic pixel art with simple pixelation filters. This is a critical mistake that often leads to dull and muddy results.",
      "A regular filter simply overlays an effect: it mechanically breaks the image into squares and blurs the colors without changing the core nature of the shot.",
      "True pixel art in PIXTUDIO works differently: it rebuilds the image from the inside out. The algorithm and the artist work together to decide which details are important, which can be discarded, which color must remain, and which should blend with its neighbor.",
      "Pixelization is not mere decoration or another button in a social media toolkit. It is a full-fledged visual language - the voice with which the author speaks to the viewer. By simplifying the image into large color blocks, it draws attention to the idea and composition rather than technical perfection of the original photo.",
      "This is why the genre survived the era of old consoles. Today, games in this aesthetic win prestigious awards, and modern artists deliberately choose limitations that no longer exist technically. Viewers instantly recognize this code and respond to it emotionally - because behind the pixels lies nostalgia for honest, understandable simplicity.",
    ],
  },
  {
    title: "Getting Started: How to Choose the Right Photo",
    paragraphs: [
      "Not every photograph is suitable for transformation into low-resolution graphics. If fine textures and microscopic nuances are what make the shot valuable, it's often better to leave it as a regular photo.",
      "Photos that work great: close-up portraits with clear silhouettes, expressive facial expressions, and strong directional lighting; architecture and urban scenes with rigid geometry; still life and single objects with distinct shapes; animals on relatively clean backgrounds; dramatic sunset and sunrise scenes with strong contrast.",
      "Photos that usually don't work well include complex macro shots, foggy or blurry landscapes, wide shots full of fine foliage, and distant group portraits.",
      "Expert tip: when in doubt, just try it. Sometimes the most unexpected photo from your phone gallery produces the strongest artistic result.",
    ],
  },
  {
    title: "Pixel Size: The Artist's Most Important Creative Decision",
    paragraphs: [
      "If choosing the photo is about selecting the subject, then choosing the pixel size, or grid size, is like choosing the literary genre. It largely determines the soul and emotional impact of the final piece.",
      "Large pixels create a bold, poster-like, symbolic aesthetic. Faces turn into masks and landscapes into symbols. This style is perfect for avatars, sticker packs, merch, and strong visual statements.",
      "Medium pixels offer the classic sweet spot. There is enough detail for instant recognition, while the retro feel remains clear and strong. This is the best choice for game assets, sprites, blog illustrations, and social media content.",
      "Small pixels are closer to a pixelated photo. They preserve more of the original details and work well for complex architectural shots where you want to keep textures and text recognizable.",
      "Start experimenting with a relatively large grid. Feel how the image breaks down into basic shapes and colors. Then gradually reduce the pixel size until you find the perfect balance between form and recognizability.",
    ],
  },
  {
    title: "Working with Color Palette - The Heart of Pixel Art",
    paragraphs: [
      "While a regular photo uses millions of colors, authentic pixel art usually works with 8 to 32 colors. At first glance, this may seem like a limitation, but in practice it is a strict creative discipline that forces you to think seriously about color.",
      "When you have few colors, each one carries significant weight. Warm and cool tones either harmonize or create tension - and that tension becomes part of your artistic message. A single well-placed accent color in a limited palette can be far more powerful than dozens of subtle gradients.",
      "In PIXTUDIO, importing external palettes is a unique feature of the editor. You can import a color scheme from another photo, a classic game, or a reference and apply it to a modern portrait or object.",
      "Applying the same palette to all your works automatically unites them into a cohesive visual series. Manual color swatch editing lets you replace muddy shadows or weak accents, and all related pixels update instantly.",
    ],
  },
  {
    title: "Non-Destructive Editing: A Modern Approach to Retro Graphics",
    paragraphs: [
      "Automatic pixelation is a powerful tool, but it's only the foundation. The algorithm makes a reasonable technical average, but it doesn't know your artistic intent.",
      "One of PIXTUDIO's biggest advantages is its non-destructive editing architecture. The original imported image is preserved as an unchanged source. All adjustments are applied on top of it in real time.",
      "You can adjust Exposure, Highlights, Midtones, Shadows, Saturation, and White Balance at any moment. These sliders remain live relative to the original and change the creative process.",
      "You no longer need to pre-edit the photo in heavy external programs. Want cleaner, more neon colors? Increase saturation. Need deeper shadows? Adjust the dark areas. Shift white balance and the image instantly gains a cold, melancholic, or nostalgic mood.",
    ],
  },
  {
    title: "Manual Refinement - The Artist's Final Touch",
    paragraphs: [
      "Real digital art is born where mathematical algorithms end and the human hand begins.",
      "PIXTUDIO's built-in pixel editor allows you to draw and erase with a square brush, strengthen important lines and accents, clean up unwanted artifacts, and create clean professional contours.",
      "It is at this stage that your individual artistic style truly emerges. The image stops looking like a photo with a filter and becomes an honest, handmade piece of pixel art.",
    ],
  },
  {
    title: "Where to Use Your Pixel Art",
    paragraphs: [
      "Pixel art created in PIXTUDIO has many practical applications: game development, personal branding, content creation, merch and print, branding, logos, mascots, and creatives for gaming, retro, and tech brands.",
      "Creators can use the results as avatars and profile pictures for social networks, Telegram, and Discord. Content makers can use process videos for TikTok, Instagram Reels, and YouTube Shorts. Game developers can create sprites, items, UI elements, and tilesets.",
    ],
  },
  {
    title: "Why a Browser-Based Editor Is the Best Solution Today",
    paragraphs: [
      "The time when you needed to download heavy software and spend weeks learning complex interfaces is over. Browser tools like PIXTUDIO have revolutionized the process.",
      "A browser-based workflow gives full cross-platform support on smartphones, tablets, and computers. It keeps the learning curve low and makes every change appear on screen immediately.",
    ],
  },
  {
    title: "Conclusion",
    paragraphs: [
      "Pixel art is not just nostalgia or a tribute to the past. It is a wonderful way to look at the familiar world from a different angle, remove visual noise, and reveal the hidden form and true meaning of things.",
      "You don't need to graduate from art school or buy expensive software. All you need is an interesting photo, a bit of imagination, and a convenient tool at hand.",
      "Try changing the way you see graphics. Upload your first photo to PIXTUDIO right now and watch how an ordinary image turns into something authentic and powerful.",
    ],
  },
]

function absoluteUrl(path) {
  return path === "/" ? `${SITE_BASE_URL}/` : `${SITE_BASE_URL}${path}`
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderParagraphs(paragraphs) {
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("")
}

function renderList(items) {
  return items
    .map(([title, body]) => {
      return `<article class="prerenderCard"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></article>`
    })
    .join("")
}

function renderHome() {
  const seoParagraphs = [
    [
      "PIXTUDIO is a browser-based pixel art editor",
      "that turns ordinary photos into high-quality pixel art with real creative control. Unlike regular filters, you control the grid, palette, colors, and details.",
    ],
    [
      "Perfect for both fast social content and professional work.",
      "Content creators love it for Reels, avatars, and posts, while indie game developers use it to create consistent pixel art assets quickly.",
    ],
    [
      "Change palette or grid size and see the whole image update instantly.",
      "Import palettes from any photo, draw manually, and save projects for later.",
    ],
    [
      "Export as PNG or SVG, or record the live process as MP4 for social media.",
      "No installation needed - everything works in your browser.",
    ],
  ]

  return `
    <main class="prerenderPage prerenderHome" data-prerender-route="/">
      <section class="prerenderHero">
        <h1>Turn Photos<br />Into Pixel Art<br />Instantly</h1>
        <img class="prerenderPoster" src="/media/landing-video-poster.jpg" alt="Photo-to-pixel-art conversion preview" width="512" height="512" fetchpriority="high" />
        <div class="prerenderIntro">
          ${seoParagraphs
            .map(
              ([accent, text]) =>
                `<p><strong>${escapeHtml(accent)}</strong> ${escapeHtml(text)}</p>`
            )
            .join("")}
          <a class="prerenderCta" href="/editor">Try PIXTUDIO Now</a>
        </div>
      </section>
      <section class="prerenderGrid" aria-label="PIXTUDIO features">${renderList(homeCards)}</section>
    </main>`
}

function renderFaq() {
  return `
    <main class="prerenderPage" data-prerender-route="/faq/">
      <h1>PIXTUDIO FAQ</h1>
      <section class="prerenderGrid" aria-label="Frequently asked questions">
        ${renderList(faqItems)}
      </section>
    </main>`
}

function renderHow() {
  return `
    <main class="prerenderPage" data-prerender-route="/how-it-works/">
      <h1>How PIXTUDIO Works</h1>
      <p>Explore PIXTUDIO scenarios for importing photos, shooting with a camera, drawing from a blank canvas, saving projects, exporting pixel art, editing palettes, and recording the pixelization process.</p>
      <section class="prerenderGrid" aria-label="PIXTUDIO feature scenarios">
        ${renderList(howItems)}
      </section>
    </main>`
}

function renderGallery() {
  return `
    <main class="prerenderPage" data-prerender-route="/gallery/">
      <h1>PIXTUDIO Gallery</h1>
      <p>Before-and-after examples of photos converted into pixel art with PIXTUDIO editing tools, custom palettes, presets, and retouching.</p>
      <section class="prerenderGrid" aria-label="Pixel art gallery examples">
        ${renderList(galleryItems)}
      </section>
      <p class="prerenderDisclaimer">Original photos belong to their owners. Used for demonstration purposes only.</p>
    </main>`
}

function renderLearn() {
  return `
    <main class="prerenderPage prerenderArticle" data-prerender-route="/pixel-art-from-photos/">
      <article>
        <h1>${escapeHtml(articleTitle)}</h1>
        ${articleSections
          .map((section, index) => {
            const heading =
              index === 0
                ? `<h2>${escapeHtml(section.title)}</h2>`
                : `<h2 id="${section.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/(^-|-$)/g, "")}">${escapeHtml(section.title)}</h2>`
            return `<section>${heading}${renderParagraphs(section.paragraphs)}</section>`
          })
          .join("")}
      </article>
    </main>`
}

function renderLinks() {
  return `
    <main class="prerenderPage" data-prerender-route="/links/">
      <h1>PIXTUDIO Links</h1>
      <section aria-label="Palette resources">
        <h2>Palettes</h2>
        <p>External palette libraries for color inspiration and custom palette experiments.</p>
        <ul>
          <li><a href="https://colrd.com/palette/">https://colrd.com/palette/</a></li>
          <li><a href="https://coolors.co/palettes/trending">https://coolors.co/palettes/trending</a></li>
        </ul>
      </section>
    </main>`
}

const renderers = {
  home: renderHome,
  faq: renderFaq,
  how: renderHow,
  gallery: renderGallery,
  learn: renderLearn,
  links: renderLinks,
}

const routeJsonLdIds = {
  home: "pixtudio-hero-video-jsonld",
  faq: "pixtudio-faq-jsonld",
  how: "pixtudio-how-it-works-jsonld",
  gallery: "pixtudio-gallery-jsonld",
  learn: "pixtudio-article-jsonld",
  links: "pixtudio-links-jsonld",
}

function prerenderStyles() {
  return `
    <style id="pixtudio-prerender-styles">
      .prerenderPage {
        box-sizing: border-box;
        min-height: 100vh;
        padding: 32px 24px 48px;
        background: #e9d8a6;
        color: #001219;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .prerenderPage h1 {
        max-width: 980px;
        margin: 0 auto 24px;
        font-size: clamp(36px, 5vw, 76px);
        line-height: 1.02;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .prerenderPage h2 {
        margin: 0 0 12px;
        font-size: clamp(24px, 3vw, 40px);
        line-height: 1.05;
      }
      .prerenderPage p,
      .prerenderPage li {
        font-size: clamp(17px, 1.7vw, 24px);
        line-height: 1.28;
      }
      .prerenderHero {
        width: min(1180px, 100%);
        margin: 0 auto;
        display: grid;
        grid-template-columns: minmax(220px, 1fr) minmax(260px, 520px) minmax(220px, 1fr);
        gap: 32px;
        align-items: end;
      }
      .prerenderHero h1 {
        margin: 0;
      }
      .prerenderPoster {
        display: block;
        width: 100%;
        aspect-ratio: 1 / 1;
        object-fit: cover;
        image-rendering: pixelated;
      }
      .prerenderIntro p {
        margin: 0 0 16px;
      }
      .prerenderCta {
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
      .prerenderGrid {
        width: min(1180px, 100%);
        margin: 32px auto 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }
      .prerenderCard {
        border: 2px solid #001219;
        border-radius: 12px;
        background: #fff;
        padding: 22px;
      }
      .prerenderCard p {
        margin: 0;
      }
      .prerenderArticle article {
        width: min(860px, 100%);
        margin: 0 auto;
        padding: 32px;
        background: #fff;
      }
      .prerenderArticle h1 {
        margin-left: 0;
        margin-right: 0;
      }
      .prerenderArticle section {
        margin-top: 32px;
      }
      .prerenderDisclaimer {
        width: min(900px, 100%);
        margin: 24px auto 0;
        text-align: center;
        font-size: 16px;
      }
      @media (max-width: 800px) {
        .prerenderHero {
          grid-template-columns: 1fr;
        }
        .prerenderArticle article {
          padding: 24px 18px;
        }
      }
    </style>`
}

function routeStructuredData(routeKey) {
  const seo = routeSeo[routeKey]
  const url = absoluteUrl(seo.path)
  const breadcrumb = {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "PIXTUDIO", item: SITE_BASE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: routeKey === "learn" ? "Pixel Art from Photos" : seo.ogTitle,
        item: url,
      },
    ],
  }

  if (routeKey === "faq") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "FAQPage",
          "@id": `${url}#faqpage`,
          name: "PIXTUDIO FAQ",
          url,
          mainEntity: faqItems.map(([question, answer]) => ({
            "@type": "Question",
            name: question,
            acceptedAnswer: { "@type": "Answer", text: answer },
          })),
        },
        breadcrumb,
      ],
    }
  }

  if (routeKey === "how") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": `${url}#webpage`,
          name: "How PIXTUDIO Works",
          url,
          description: seo.description,
          mainEntity: {
            "@type": "ItemList",
            name: "PIXTUDIO feature scenarios",
            itemListElement: howItems.map(([name, description], index) => ({
              "@type": "ListItem",
              position: index + 1,
              name,
              description,
            })),
          },
        },
        breadcrumb,
      ],
    }
  }

  if (routeKey === "gallery") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "ImageGallery",
          "@id": `${url}#imagegallery`,
          name: "PIXTUDIO Gallery",
          url,
          description: seo.description,
          associatedMedia: galleryItems.map(([name, caption]) => ({
            "@type": "ImageObject",
            name,
            caption,
          })),
        },
        breadcrumb,
      ],
    }
  }

  if (routeKey === "learn") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          "@id": `${url}#article`,
          headline: articleTitle,
          name: "Pixel Art from Photos",
          url,
          image: [SITE_OG_IMAGE_URL],
          mainEntityOfPage: url,
          author: { "@id": `${SITE_BASE_URL}/#organization` },
          publisher: { "@id": `${SITE_BASE_URL}/#organization` },
        },
        {
          "@type": "WebPage",
          "@id": `${url}#webpage`,
          name: "Pixel Art from Photos",
          url,
          description: seo.description,
        },
        breadcrumb,
      ],
    }
  }

  if (routeKey === "links") {
    const paletteLinks = [
      ["ColRD Palettes", "https://colrd.com/palette/"],
      ["Coolors Trending Palettes", "https://coolors.co/palettes/trending"],
    ]

    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": `${url}#webpage`,
          name: "PIXTUDIO Links",
          url,
          description: seo.description,
          mainEntity: {
            "@type": "ItemList",
            name: "Palette resources",
            itemListElement: paletteLinks.map(([name, linkUrl], index) => ({
              "@type": "ListItem",
              position: index + 1,
              name,
              url: linkUrl,
            })),
          },
        },
        breadcrumb,
      ],
    }
  }

  if (routeKey === "home") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "VideoObject",
          "@id": `${url}#hero-video`,
          name: "PIXTUDIO photo to pixel art preview",
          description:
            "Watch ordinary images transform into structured pixel art in real time. This preview shows PIXTUDIO turning simple shapes, symbols, photos, and colorful compositions into editable pixel-based visuals directly on the canvas.",
          transcript:
            "Watch how ordinary images transform into structured pixel art in real time. This preview shows the PIXTUDIO editor turning simple shapes, symbols, and colorful compositions into editable pixel-based visuals directly on the canvas.",
          thumbnailUrl: `${SITE_BASE_URL}/media/landing-video-poster.jpg`,
          uploadDate: "2026-05-11",
          contentUrl: `${SITE_BASE_URL}/media/landing-preview.mp4?v=20260511-hero43`,
          embedUrl: `${url}#hero-video`,
          publisher: { "@id": `${SITE_BASE_URL}/#organization` },
        },
      ],
    }
  }

  return null
}

function replaceOrInsertHead(html, selectorPattern, replacement, fallbackMarker = "</head>") {
  if (selectorPattern.test(html)) {
    return html.replace(selectorPattern, replacement)
  }

  return html.replace(fallbackMarker, `${replacement}\n  ${fallbackMarker}`)
}

function applyMeta(html, seo) {
  const canonical = absoluteUrl(seo.path)
  const ogTitle = seo.ogTitle ?? seo.title
  const ogDescription = seo.ogDescription ?? seo.description

  let next = html
  next = next.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(seo.title)}</title>`)
  next = replaceOrInsertHead(
    next,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`
  )
  next = replaceOrInsertHead(
    next,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${canonical}" />`
  )
  next = replaceOrInsertHead(
    next,
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:type" content="${seo.ogType ?? "website"}" />`
  )
  next = replaceOrInsertHead(
    next,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${canonical}" />`
  )
  next = replaceOrInsertHead(
    next,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(ogTitle)}" />`
  )
  next = replaceOrInsertHead(
    next,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(ogDescription)}" />`
  )
  next = replaceOrInsertHead(
    next,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${SITE_OG_IMAGE_URL}" />`
  )
  next = replaceOrInsertHead(
    next,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />`
  )
  next = replaceOrInsertHead(
    next,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtml(ogDescription)}" />`
  )
  next = replaceOrInsertHead(
    next,
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${SITE_OG_IMAGE_URL}" />`
  )

  return next
}

function renderRouteHtml(template, routeKey) {
  const seo = routeSeo[routeKey]
  const routeData = routeStructuredData(routeKey)
  const routeJsonLd = routeData
    ? `\n    <script id="${routeJsonLdIds[routeKey]}" type="application/ld+json">${JSON.stringify(routeData)}</script>`
    : ""
  const rootHtml = `<div id="root">${prerenderStyles()}${renderers[routeKey]()}</div>`

  return applyMeta(template, seo)
    .replace(ROOT_MARKER, rootHtml)
    .replace("</head>", `${routeJsonLd}\n  </head>`)
}

const template = await readFile(DIST_INDEX, "utf8")

if (!template.includes(ROOT_MARKER)) {
  throw new Error(`Cannot find ${ROOT_MARKER} in ${DIST_INDEX}`)
}

for (const routeKey of Object.keys(routeSeo)) {
  const outputPath = resolve(routeSeo[routeKey].output)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, renderRouteHtml(template, routeKey))
  console.log(`Prerendered ${routeSeo[routeKey].path} -> ${routeSeo[routeKey].output}`)
}

import { useEffect } from "react"

export const SITE_BASE_URL = "https://pixtudio.app"
export const SITE_LOGO_URL = `${SITE_BASE_URL}/logo-pixtudio.png`
export const SITE_OG_IMAGE_URL = `${SITE_BASE_URL}/og-image.jpg`
export const SITE_SUPPORT_EMAIL = "support@pixtudio.app"

export const SITE_SCHEMA_IDS = {
  organization: `${SITE_BASE_URL}/#organization`,
  website: `${SITE_BASE_URL}/#website`,
  software: `${SITE_BASE_URL}/#software`,
}

export type SiteRouteSeo = {
  title: string
  description: string
  path: string
  ogTitle?: string
  ogDescription?: string
  ogType?: "website" | "article"
  image?: string
}

export const SITE_ROUTE_SEO = {
  home: {
    title: "PIXTUDIO - Turn Photos into Pixel Art Online",
    description:
      "PIXTUDIO is a browser-based pixel art editor that turns photos into pixel art with live grid, palette, color editing, PNG, SVG, XLSX, ZIP export, and MP4 process recording.",
    path: "/",
    ogTitle: "PIXTUDIO - Turn Photos into Pixel Art Online",
    ogDescription:
      "Create pixel art from photos in your browser. Control grid size, palettes, colors, export PNG, SVG, XLSX, or ZIP, and record the live process as MP4.",
    ogType: "website",
  },
  faq: {
    title: "PIXTUDIO FAQ - Pixel Art Editor Questions",
    description:
      "Answers to common questions about PIXTUDIO, including photo-to-pixel-art conversion, palettes, PNG, SVG, XLSX, ZIP export, MP4 recording, mobile use, and saved projects.",
    path: "/faq/",
    ogTitle: "PIXTUDIO FAQ - Pixel Art Editor Questions",
    ogDescription:
      "Find answers about PIXTUDIO features, exports, palettes, mobile support, project saving, and browser-based pixel art editing.",
    ogType: "website",
  },
  how: {
    title: "PIXTUDIO How It Works - Pixel Art Editor Guide",
    description:
      "Explore PIXTUDIO feature scenarios for opening images and projects, shooting with a camera, drawing from a blank canvas, saving projects, exporting PNG, SVG, XLSX, or ZIP, editing palettes, and recording video.",
    path: "/how-it-works/",
    ogTitle: "PIXTUDIO How It Works - Pixel Art Editor Guide",
    ogDescription:
      "See how PIXTUDIO works: open files, draw from scratch, edit palettes, export pixel art, save projects, and record the pixelization process.",
    ogType: "website",
  },
  gallery: {
    title: "PIXTUDIO Gallery - Pixel Art Inspiration",
    description:
      "Before-and-after gallery examples showing photos converted into pixel art with PIXTUDIO editing tools, custom palettes, presets, and retouching.",
    path: "/gallery/",
    ogTitle: "PIXTUDIO Gallery - Pixel Art Inspiration",
    ogDescription:
      "Explore before-and-after examples of photos transformed into pixel art with PIXTUDIO.",
    ogType: "website",
  },
  learn: {
    title: "Pixel Art from Photos - PIXTUDIO Guide",
    description:
      "A practical guide to turning photos into expressive pixel art online with PIXTUDIO, including photo choice, pixel size, palettes, non-destructive editing, and final refinement.",
    path: "/pixel-art-from-photos/",
    ogTitle: "Pixel Art from Photos - PIXTUDIO Guide",
    ogDescription:
      "Learn how to create powerful retro-style pixel art from photos using PIXTUDIO's grid, palette, and editing workflow.",
    ogType: "article",
  },
  links: {
    title: "PIXTUDIO Links - Palette Resources",
    description:
      "Useful external palette resources for finding color inspiration and experimenting with custom palettes in PIXTUDIO.",
    path: "/links/",
    ogTitle: "PIXTUDIO Links - Palette Resources",
    ogDescription:
      "External palette libraries for color inspiration and custom palette experiments in PIXTUDIO.",
    ogType: "website",
  },
} satisfies Record<string, SiteRouteSeo>

export function toAbsoluteSiteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  if (pathOrUrl.startsWith("/")) return `${SITE_BASE_URL}${pathOrUrl}`
  return `${SITE_BASE_URL}/${pathOrUrl}`
}

function upsertMeta(
  selector: string,
  createAttribute: "name" | "property",
  createValue: string,
  content: string
) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement("meta")
    element.setAttribute(createAttribute, createValue)
    document.head.appendChild(element)
  }
  element.setAttribute("content", content)
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  )
  if (!element) {
    element = document.createElement("link")
    element.rel = "canonical"
    document.head.appendChild(element)
  }
  element.href = href
}

export function usePageSeo(seo: SiteRouteSeo) {
  useEffect(() => {
    if (typeof document === "undefined") return

    const canonicalUrl = toAbsoluteSiteUrl(seo.path)
    const imageUrl = toAbsoluteSiteUrl(seo.image ?? SITE_OG_IMAGE_URL)
    const ogTitle = seo.ogTitle ?? seo.title
    const ogDescription = seo.ogDescription ?? seo.description

    document.title = seo.title
    upsertMeta('meta[name="description"]', "name", "description", seo.description)
    upsertCanonical(canonicalUrl)
    upsertMeta('meta[property="og:type"]', "property", "og:type", seo.ogType ?? "website")
    upsertMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl)
    upsertMeta('meta[property="og:title"]', "property", "og:title", ogTitle)
    upsertMeta(
      'meta[property="og:description"]',
      "property",
      "og:description",
      ogDescription
    )
    upsertMeta('meta[property="og:image"]', "property", "og:image", imageUrl)
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", ogTitle)
    upsertMeta(
      'meta[name="twitter:description"]',
      "name",
      "twitter:description",
      ogDescription
    )
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", imageUrl)
  }, [seo])
}

export function createBreadcrumbList(
  currentPageName: string,
  currentPagePath: string
) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${toAbsoluteSiteUrl(currentPagePath)}#breadcrumb`,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "PIXTUDIO",
        item: SITE_BASE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: currentPageName,
        item: toAbsoluteSiteUrl(currentPagePath),
      },
    ],
  }
}

export function JsonLd({
  id,
  data,
}: {
  id: string
  data: Record<string, unknown>
}) {
  const json = JSON.stringify(data)

  useEffect(() => {
    if (typeof document === "undefined") return undefined

    Array.from(document.head.children).forEach((element) => {
      if (element.id === id) element.remove()
    })

    const script = document.createElement("script")
    script.id = id
    script.type = "application/ld+json"
    script.text = json
    document.head.appendChild(script)

    return () => {
      script.remove()
    }
  }, [id, json])

  return null
}

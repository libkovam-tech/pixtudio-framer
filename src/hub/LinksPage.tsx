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

const PALETTE_LINKS = [
  {
    label: "ColRD Palettes",
    href: "https://colrd.com/palette/",
  },
  {
    label: "Coolors Trending Palettes",
    href: "https://coolors.co/palettes/trending",
  },
  {
    label: "Palette Inspiration",
    href: "https://paletteinspiration.com/?ref=producthunt",
  },
]

export default function LinksPage() {
  usePageSeo(SITE_ROUTE_SEO.links)

  const linksStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${toAbsoluteSiteUrl("/links/")}#webpage`,
        name: "PIXTUDIO Links",
        url: toAbsoluteSiteUrl("/links/"),
        description: SITE_ROUTE_SEO.links.description,
        isPartOf: { "@id": SITE_SCHEMA_IDS.website },
        publisher: { "@id": SITE_SCHEMA_IDS.organization },
        mainEntity: {
          "@type": "ItemList",
          name: "Palette resources",
          itemListElement: PALETTE_LINKS.map((link, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: link.label,
            url: link.href,
          })),
        },
      },
      createBreadcrumbList("Links", "/links/"),
    ],
  }

  return (
    <SiteShell
      activePage="links"
      className="siteTemplatePage linksPage"
      headerClassName="siteTemplateHeader linksHeader"
      mainClassName="siteTemplateMain linksLayout"
      mainAriaLabel="PIXTUDIO Links"
      footerClassName="siteTemplateFooter linksFooter"
    >
      <JsonLd id="pixtudio-links-jsonld" data={linksStructuredData} />
      <section className="linksContent" aria-labelledby="links-palettes-title">
        <h1 className="siteVisuallyHidden">PIXTUDIO Links</h1>
        <h2 id="links-palettes-title">Palettes</h2>
        <p>
          These resources help you find color ideas before importing or
          rebuilding palettes in PIXTUDIO. Use them to explore harmonious
          combinations, compare palette moods, and prepare custom colors for
          photo-to-pixel-art experiments.
        </p>
        <ul>
          {PALETTE_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} target="_blank" rel="noreferrer">
                {link.href}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </SiteShell>
  )
}

import { type ReactNode, useEffect } from "react"
import { Link } from "react-router-dom"
import {
  SiteFooterEmailIcon,
  SiteFooterShareIcon,
  SvgLogo,
} from "../editor/SvgIcons"

export const DESKTOP_EDITOR_URL = "/editor"
export const SITE_SHARE_URL = "https://pixtudio.app"
export const SUPPORT_EMAIL = "support@pixtudio.app"

export type SitePage = "home" | "faq" | "how" | "gallery" | "learn" | "links"

const SITE_PAGE_LABELS: Record<SitePage, string> = {
  home: "MAIN",
  faq: "FAQ",
  how: "HOW IT WORKS",
  gallery: "GALLERY",
  learn: "LEARN",
  links: "LINKS",
}

const SITE_PAGE_SUMMARY_LABELS: Record<SitePage, string> = {
  home: "MAIN",
  faq: "FAQ",
  how: "HOW",
  gallery: "GALLERY",
  learn: "LEARN",
  links: "LINKS",
}

type SiteMenuLink = { page: SitePage; label: string; to: string }

const SITE_MENU_LINKS: SiteMenuLink[] = [
  { page: "home", label: SITE_PAGE_LABELS.home, to: "/" },
  { page: "faq", label: SITE_PAGE_LABELS.faq, to: "/faq/" },
  { page: "how", label: SITE_PAGE_LABELS.how, to: "/how-it-works/" },
  { page: "gallery", label: SITE_PAGE_LABELS.gallery, to: "/gallery/" },
]

const SITE_MOBILE_MENU_LINKS: SiteMenuLink[] = [
  ...SITE_MENU_LINKS,
  {
    page: "learn",
    label: SITE_PAGE_LABELS.learn,
    to: "/pixel-art-from-photos/",
  },
  {
    page: "links",
    label: SITE_PAGE_LABELS.links,
    to: "/links/",
  },
]

type SiteShellProps = {
  activePage: SitePage
  children?: ReactNode
  className?: string
  headerClassName?: string
  mainClassName?: string
  mainAriaLabel?: string
  ctaClassName?: string
  footerClassName?: string
  showCta?: boolean
}

function openSupportEmail() {
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

async function shareSite() {
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
    // User cancel / unsupported / runtime issue.
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

function useSiteVisualViewportHeight() {
  useEffect(() => {
    if (typeof window === "undefined") return

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

    setVisualViewportHeight()
    window.addEventListener("resize", setVisualViewportHeight)
    window.addEventListener("orientationchange", setVisualViewportHeight)
    window.visualViewport?.addEventListener("resize", setVisualViewportHeight)
    window.visualViewport?.addEventListener("scroll", setVisualViewportHeight)

    return () => {
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
    }
  }, [])
}

export function SiteTopNav({ activePage }: { activePage: SitePage }) {
  const menuLinks = SITE_MOBILE_MENU_LINKS.filter(
    (link) => link.page !== activePage
  )
  const desktopMenuLinks = SITE_MENU_LINKS.filter((link) => link.page !== "home")

  return (
    <nav className="siteTopNav" aria-label="PIXTUDIO site navigation">
      <details className="siteMobileAccordion siteMobileProductsAccordion">
        <summary className="siteMobileAccordionSummary siteMobileProductsSummary">
          <span className="siteMobileChevron" aria-hidden="true" />
          <span>EDITOR</span>
        </summary>
        <div className="siteMobileAccordionPanel siteMobileProductsPanel">
          <span className="siteMobileAccordionItem siteMobileAccordionItemDisabled">
            COMING SOON
          </span>
        </div>
      </details>

      <button className="siteTopEditorButton siteTopDesktopOnly" type="button">
        EDITOR
      </button>
      <Link className="siteTopLogo" to="/" aria-label="PIXTUDIO home">
        <SvgLogo />
      </Link>
      <div className="siteTopNavLinks siteTopDesktopOnly">
        {desktopMenuLinks.map((link) => (
          <Link
            className={`siteTopNavLink${
              activePage === link.page ? " siteTopNavLinkActive" : ""
            }`}
            to={link.to}
            key={link.page}
          >
            <span className="siteTopNavLinkText">{link.label}</span>
          </Link>
        ))}
      </div>

      <details className="siteMobileAccordion siteMobileMenuAccordion">
        <summary className="siteMobileAccordionSummary siteMobileMenuSummary">
          <span>{SITE_PAGE_SUMMARY_LABELS[activePage]}</span>
          <span className="siteMobileChevron" aria-hidden="true" />
        </summary>
        <div className="siteMobileAccordionPanel siteMobileMenuPanel">
          {menuLinks.map((link, index) => (
            <Link
              className="siteMobileAccordionItem"
              to={link.to}
              key={link.page}
            >
              {link.label}
              {index < menuLinks.length - 1 ? (
                <span className="siteMobileAccordionDivider" aria-hidden="true" />
              ) : null}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  )
}

export function SiteFloatingCta({ className = "" }: { className?: string }) {
  return (
    <a
      className={`hubMobileCta siteFloatingCta${className ? ` ${className}` : ""}`}
      href={DESKTOP_EDITOR_URL}
      target="_self"
      rel="noreferrer"
    >
      <span className="hubCtaText">Try PIXTUDIO Now</span>
    </a>
  )
}

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`siteFooter${className ? ` ${className}` : ""}`}>
      <div className="siteFooterContent">
        <span className="siteFooterText">PIXTUDIO {"\u00a9"}2026</span>
        <div className="siteFooterLinks">
          <Link className="siteFooterLink" to="/pixel-art-from-photos/">
            Pixel Art from Photos
          </Link>
          <Link className="siteFooterLink" to="/links/">
            Links
          </Link>
        </div>
        <div className="siteFooterActions">
          <button
            type="button"
            onClick={openSupportEmail}
            aria-label="Email"
            className="siteFooterButton"
          >
            <SiteFooterEmailIcon />
          </button>
          <button
            type="button"
            onClick={shareSite}
            aria-label="Share"
            className="siteFooterButton"
          >
            <SiteFooterShareIcon />
          </button>
        </div>
      </div>
    </footer>
  )
}

export function SiteShell({
  activePage,
  children,
  className = "",
  headerClassName = "",
  mainClassName = "",
  mainAriaLabel,
  ctaClassName = "",
  footerClassName = "",
  showCta = true,
}: SiteShellProps) {
  useSiteVisualViewportHeight()

  return (
    <div className={`siteShell${className ? ` ${className}` : ""}`}>
      <header
        className={`siteShellHeader${headerClassName ? ` ${headerClassName}` : ""}`}
      >
        <div className="siteShellHeaderContent">
          <SiteTopNav activePage={activePage} />
        </div>
      </header>
      <main
        className={`siteShellMain${mainClassName ? ` ${mainClassName}` : ""}`}
        aria-label={mainAriaLabel}
      >
        {children}
      </main>
      {showCta ? <SiteFloatingCta className={ctaClassName} /> : null}
      <SiteFooter
        className={`siteShellFooter${footerClassName ? ` ${footerClassName}` : ""}`}
      />
    </div>
  )
}

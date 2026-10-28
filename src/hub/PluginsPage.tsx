import { Link } from "react-router-dom"
import { SiteShell } from "./SiteShell"
import batchIcon from "./assets/plugins/BatchIcon.png"
import "./hub.css"

export default function PluginsPage() {
  return (
    <SiteShell
      activePage="plugins"
      className="siteTemplatePage sitePluginsPage"
      headerClassName="siteTemplateHeader"
      mainClassName="siteTemplateMain sitePluginsMain"
      mainAriaLabel="PIXTUDIO Plugins"
      footerClassName="siteTemplateFooter"
      showCta={false}
    >
      <section className="sitePluginsContent" aria-labelledby="site-plugins-title">
        <h1 id="site-plugins-title">Plugins</h1>
        <p className="sitePluginsIntro">
          Go beyond a single canvas. PIXTUDIO plugins bring focused tools to
          creative workflows. Start with Batch Pixelation: style one frame,
          process a sequence with the same settings, and download the results
          together.
        </p>
        <div className="sitePluginsGrid">
          <Link className="sitePluginsCard sitePluginsCardActive" to="/plugins/batch-pixelation/">
            <img src={batchIcon} alt="" width="1302" height="1302" />
            <span>Batch Pixelation</span>
          </Link>
          {[1, 2, 3].map((slot) => (
            <div className="sitePluginsCard sitePluginsCardPlaceholder" key={slot}>
              <div className="sitePluginsPlaceholderArt">COMING SOON</div>
              <span>Untitled Plugin</span>
            </div>
          ))}
        </div>
      </section>
    </SiteShell>
  )
}

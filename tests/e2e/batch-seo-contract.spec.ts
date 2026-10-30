import { expect, test } from "@playwright/test"

const batchUrl = "https://pixtudio.app/plugins/batch-pixelation/"
const title = "Batch Image to Pixel Art Converter | PIXTUDIO"

test("direct HTML keeps Batch copy and schema distinct from Core", async ({ request }) => {
  const html = await (await request.get("/plugins/batch-pixelation/")).text()
  expect(html).toContain(`<title>${title}</title>`)
  expect(html).toContain('<h1>BATCH PIXELATION PLUGIN</h1>')
  expect(html).toContain("Export your video as individual image frames using an external tool.")
  expect(html).toContain('<a href="/plugins/">')
  expect(html).toContain('<a href="/">')
  expect(html).toContain('<meta property="og:image:width" content="1600" />')
  expect(html).not.toContain("Supported source images:")
  const schema = JSON.parse(html.match(/<script id="pixtudio-batch-jsonld"[^>]*>(.*?)<\/script>/s)?.[1] ?? "null")
  expect(schema["@graph"].map((node: { "@id": string }) => node["@id"])).toContain(`${batchUrl}#app`)
  expect(schema["@graph"].some((node: { offers?: unknown }) => node.offers)).toBe(false)
  expect(schema["@graph"].find((node: { "@id": string }) => node["@id"] === `${batchUrl}#webpage`).mainEntity).toEqual({ "@id": `${batchUrl}#app` })
  const plugins = await (await request.get("/plugins/")).text()
  expect(plugins).not.toContain('"price":"0"')
  expect(plugins).toContain('<h1>Plugins</h1>')
  const home = await (await request.get("/")).text()
  expect(home).toContain('"price": "0"')
})

test("SPA navigation and history keep route metadata", async ({ page }, testInfo) => {
  await page.goto("/")
  if (testInfo.project.name === "mobile") {
    await page.locator(".siteMobileProductsSummary:visible").click()
    await page.locator(".siteMobileProductsPanel:visible").getByRole("link", { name: "PLUGINS" }).click()
  } else {
    await page.locator('.siteTopPluginsLink:visible').first().click()
  }
  await expect(page).toHaveTitle("PIXTUDIO Plugins — Batch Pixelation")
  await page.locator(".sitePluginsCardActive").click()
  await expect(page).toHaveTitle(title)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", batchUrl)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Convert multiple images into pixel art/)
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${batchUrl}og-image.jpg`)
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", /Batch Pixelation preview/)
  await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute("content", /Batch Pixelation preview/)
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1600")
  await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute("content", /Turn extracted video frames/)
  for (const selector of ['link[rel="canonical"]', 'meta[name="description"]', 'meta[property="og:title"]']) {
    await expect(page.locator(selector)).toHaveCount(1)
  }
  await page.reload()
  await expect(page).toHaveTitle(title)
  await page.locator('.batch-entry-brand a').click()
  await expect(page).toHaveTitle("PIXTUDIO Plugins — Batch Pixelation")
  await page.goBack()
  await expect(page).toHaveTitle(title)
  await page.goBack()
  await expect(page).toHaveTitle("PIXTUDIO Plugins — Batch Pixelation")
})

test("all four Batch steps remain visible on the entry screen", async ({ page }) => {
  await page.goto("/plugins/batch-pixelation/")
  await expect(page.locator(".batch-entry-copy li")).toHaveCount(4)
  await expect(page.locator(".batch-entry-copy li").first()).toHaveText("Use any app you like to split your footage into frames.")
  await expect(page.locator(".batch-entry-copy li").last()).toBeInViewport()
})

import { expect, test } from "@playwright/test"

test("Plugins directory has a distinct server-rendered preview and sitemap entries", async ({ request }) => {
  const response = await request.get("/plugins/")
  const html = await response.text()
  const sitemap = await (await request.get("/sitemap.xml")).text()

  expect(response.ok()).toBe(true)
  expect(html).toContain('<link rel="canonical" href="https://pixtudio.app/plugins/" />')
  expect(html).toContain('<meta property="og:title" content="PIXTUDIO Plugins — Batch Pixelation" />')
  expect(html).toContain('<h1>Plugins</h1>')
  expect(sitemap).toContain('<loc>https://pixtudio.app/plugins/</loc>')
  expect(sitemap).toContain('<loc>https://pixtudio.app/plugins/batch-pixelation/</loc>')
})

test("Plugins directory opens from navigation and leads to Batch Pixelation", async ({ page }, testInfo) => {
  await page.goto("/")

  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".siteMobileProductsSummary:visible")).toContainText("EDITOR")
    await page.locator(".siteMobileProductsSummary:visible span").last().click()
    await expect(page.locator(".siteMobileProductsSummary:visible span").last()).toBeHidden()
    await expect(page.locator(".siteMobileProductsPanel:visible a")).toHaveText(["EDITOR", "PLUGINS"])
    await page.locator(".siteMobileProductsPanel:visible").getByRole("link", { name: "PLUGINS" }).click()
  } else {
    await page.locator(".siteTopPluginsLink").first().click()
  }

  await expect(page).toHaveURL(/\/plugins\/$/)
  await expect(page.getByRole("heading", { name: "Plugins" })).toBeVisible()
  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".siteMobileProductsSummary:visible")).toContainText("PLUGINS")
    await expect(page.locator(".siteMobileMenuAccordion:visible")).toHaveCount(0)
  }
  if (testInfo.project.name !== "mobile") {
    await expect(page.locator(".siteTopProducts:visible .siteTopPluginsLinkActive")).toHaveText("PLUGINS")
  }
  const cards = page.locator(".sitePluginsGrid > *")
  await expect(cards).toHaveCount(4)
  await expect(cards.first()).toHaveText("Batch Pixelation")
  await expect(page.locator(".sitePluginsCardActive img")).toBeVisible()

  const first = await cards.first().boundingBox()
  const second = await cards.nth(1).boundingBox()
  const image = await page.locator(".sitePluginsCardActive img").boundingBox()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(image).not.toBeNull()
  expect(Math.abs(image!.width - image!.height)).toBeLessThan(2)
  if (testInfo.project.name === "mobile") {
    expect(second!.y).toBeGreaterThan(first!.y + first!.height)
  } else {
    expect(second!.x).toBeGreaterThan(first!.x + first!.width)
  }

  await cards.first().click()
  await expect(page).toHaveURL(/\/plugins\/batch-pixelation\/$/)
})

test("Editor and Plugins remain reachable from the mobile section menu", async ({ page }, testInfo) => {
  await page.goto("/plugins/")

  if (testInfo.project.name === "mobile") {
    await page.locator(".siteMobileProductsSummary:visible").click()
    await expect(page.locator(".siteMobileProductsSummary:visible span").last()).toBeHidden()
    await expect(page.locator(".siteMobileProductsPanel:visible a")).toHaveText(["EDITOR", "PLUGINS"])
    await page.locator(".siteMobileProductsPanel:visible").getByRole("link", { name: "EDITOR" }).click()
  } else {
    await page.locator(".siteTopProducts:visible .siteTopEditorButton").click()
  }

  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator(".hubPage")).toBeVisible()

  if (testInfo.project.name !== "mobile") {
    await expect(page.locator(".siteTopProducts:visible .siteTopPluginsLinkActive")).toHaveText("EDITOR")
  }

  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".siteMobileProductsSummary:visible")).toContainText("EDITOR")
    await expect(page.locator(".siteMobileMenuAccordion:visible")).toBeVisible()
  }
})

test("mobile section menu closes when the current section is selected", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  await page.goto("/plugins/")

  const menu = page.locator(".siteMobileProductsAccordion:visible")
  await menu.locator("summary").click()
  await menu.getByRole("link", { name: "PLUGINS" }).click()

  await expect(page).toHaveURL(/\/plugins\/$/)
  await expect(menu).not.toHaveAttribute("open")
  await expect(menu.locator("summary")).toContainText("PLUGINS")
})

test("Batch Pixelation entry logo returns to Plugins", async ({ page }) => {
  await page.goto("/plugins/batch-pixelation/")
  await page.getByRole("button", { name: "PIXTUDIO Plugins" }).click()

  await expect(page).toHaveURL(/\/plugins\/$/)
  await expect(page.getByRole("heading", { name: "Plugins" })).toBeVisible()
})

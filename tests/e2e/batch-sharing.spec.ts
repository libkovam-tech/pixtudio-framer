import { expect, test } from "@playwright/test"

const description = "Turn extracted video frames into pixel art with one shared recipe. Process a batch of images and download the PNG results as a ZIP."
const title = "Batch Image to Pixel Art Converter | PIXTUDIO"

test("Batch Pixelation share action includes its own description and link", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as Window & { sharedBatch?: ShareData }).sharedBatch = data
      },
    })
  })

  await page.goto("/plugins/batch-pixelation/")
  await page.getByRole("button", { name: "Share Batch Pixelation" }).click()

  const shared = await page.evaluate(() => (window as Window & { sharedBatch?: ShareData }).sharedBatch)
  expect(shared).toEqual({
    title,
    text: description,
    url: new URL("/plugins/batch-pixelation/", page.url()).href,
  })
})

test("Batch Pixelation sharing image is publicly available", async ({ request }) => {
  const response = await request.get("/plugins/batch-pixelation/og-image.jpg")
  expect(response.ok()).toBe(true)
  expect(response.headers()["content-type"]).toContain("image/jpeg")
})

test("Batch Pixelation URL serves its own share preview", async ({ request }) => {
  const response = await request.get("/plugins/batch-pixelation/")
  const html = await response.text()
  const imageUrl = html.match(/<meta property="og:image" content="([^"]+)" \/>/)?.[1]

  expect(response.ok()).toBe(true)
  expect(html).toContain(`<meta property="og:title" content="${title}" />`)
  expect(html).toContain(`<meta property="og:description" content="${description}" />`)
  expect(imageUrl).toBeDefined()
  expect(new URL(imageUrl!).pathname).toBe("/plugins/batch-pixelation/og-image.jpg")
  expect(html).not.toContain('<meta property="og:image" content="https://pixtudio.app/og-image.jpg" />')
})

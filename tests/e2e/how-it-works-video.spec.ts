import { expect, test } from "@playwright/test"

test("Start with a Photo shows a looping video in the responsive modal", async ({ page }, testInfo) => {
  await page.goto("/how-it-works/")
  await page.getByRole("button", { name: "Start with a Photo" }).click()

  const modal = page.getByRole("dialog", { name: "How It Works" })
  const copy = modal.locator(".siteHowItWorksModalText")
  const video = modal.locator("video")
  await expect(video).toHaveAttribute("src", /StartWithPhoto(?:-[^/]*)?\.webm/)
  await expect(video).toHaveAttribute("poster", /StartWithPhoto(?:-[^/]*)?\.webp/)
  await expect(video).toHaveJSProperty("autoplay", true)
  await expect(video).toHaveJSProperty("muted", true)
  await expect(video).toHaveJSProperty("loop", true)
  await expect(video).toHaveJSProperty("playsInline", true)
  await expect(video).not.toHaveAttribute("controls")
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0.2)

  const copyBox = await copy.boundingBox()
  const videoBox = await video.boundingBox()
  expect(copyBox).not.toBeNull()
  expect(videoBox).not.toBeNull()
  if (testInfo.project.name === "mobile") {
    expect(copyBox!.y + copyBox!.height).toBeLessThan(videoBox!.y)
    await page.setViewportSize({ width: 390, height: 650 })
    expect(await copy.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0)
    const scrollBefore = await modal.evaluate(element => element.scrollTop)
    const videoY = (await video.boundingBox())!.y
    await copy.evaluate(element => { element.scrollTop = element.scrollHeight })
    expect(await copy.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    expect(await modal.evaluate(element => element.scrollTop)).toBe(scrollBefore)
    expect((await video.boundingBox())!.y).toBe(videoY)

    await page.setViewportSize({ width: 320, height: 568 })
    const narrowModalBox = (await modal.boundingBox())!
    const narrowVideoBox = (await video.boundingBox())!
    expect(narrowVideoBox.y).toBeGreaterThan(narrowModalBox.y)
    expect(narrowVideoBox.y + narrowVideoBox.height).toBeLessThan(narrowModalBox.y + narrowModalBox.height)
  } else {
    expect(videoBox!.x + videoBox!.width).toBeLessThan(copyBox!.x)
  }

  await modal.getByRole("button", { name: "Close" }).click()
  await page.getByRole("button", { name: "Batch Pixelation" }).click()
  await expect(page.getByRole("dialog", { name: "How It Works" }).locator("video")).toHaveCount(0)
})

test("video poster is available while the video cannot load", async ({ page }) => {
  await page.route(/\.webm(?:\?|$)/, route => route.abort())
  await page.goto("/how-it-works/")
  await page.getByRole("button", { name: "Start with a Photo" }).click()

  const video = page.getByRole("dialog", { name: "How It Works" }).locator("video")
  await expect(video).toHaveAttribute("poster", /StartWithPhoto(?:-[^/]*)?\.webp/)
  await expect.poll(() => video.evaluate(element => element.readyState)).toBe(0)
  const posterLoaded = await video.evaluate(async element => {
    const image = new Image()
    image.src = element.poster
    await image.decode()
    return image.naturalWidth > 0 && image.naturalHeight > 0
  })
  expect(posterLoaded).toBe(true)
})

test("desktop video modal grows with a wide viewport without clipping its copy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop")
  await page.setViewportSize({ width: 2560, height: 1272 })
  await page.goto("/how-it-works/")
  await page.getByRole("button", { name: "Start with a Photo" }).click()

  const modal = page.getByRole("dialog", { name: "How It Works" })
  const video = modal.locator("video")
  const title = modal.getByRole("heading", { name: "How It Works" })
  await page.evaluate(() => document.fonts.ready)
  const modalBox = (await modal.boundingBox())!
  const videoBox = (await video.boundingBox())!
  const titleBox = (await title.boundingBox())!

  expect(Math.abs(modalBox.width - 1600)).toBeLessThan(1)
  expect(modalBox.height).toBeGreaterThan(620)
  expect(Math.abs(videoBox.width - videoBox.height)).toBeLessThan(1)
  expect(titleBox.height).toBeLessThan(50)
  expect(await modal.evaluate(element => element.scrollHeight - element.clientHeight)).toBe(0)
})

test("Batch Pixelation leads the grid and swatch editing shares one card", async ({ page }) => {
  await page.goto("/how-it-works/")

  const cards = page.locator("#site-how-it-works-cards > button")
  await expect(cards).toHaveCount(12)
  await expect(cards.nth(0)).toHaveAccessibleName("Batch Pixelation")
  await expect(cards.nth(1)).toHaveAccessibleName("Start with a Photo")
  await expect(page.getByRole("button", { name: "Add New Custom Colors" })).toHaveCount(0)

  await cards.nth(0).click()
  const pluginModal = page.getByRole("dialog", { name: "How It Works" })
  await expect(pluginModal).toContainText("Style one reference frame, then select the frames to process.")
  await expect(pluginModal).toContainText("ZIP")
  await expect(pluginModal).toContainText("Plugins > Batch Pixelation")
  await expect(pluginModal.locator("strong")).toHaveText(["Same As Auto", "Auto Palette"])
  await expect(pluginModal.getByRole("link", { name: "Plugins > Batch Pixelation" })).toHaveAttribute("href", "/plugins/batch-pixelation/")
  await pluginModal.getByRole("button", { name: "Close" }).click()

  await page.getByRole("button", { name: "Edit Color Swatches" }).click()
  const swatchModal = page.getByRole("dialog", { name: "How It Works" })
  await expect(swatchModal).toContainText("Click or long-tap a color")
  await expect(swatchModal).toContainText("Add Swatch")
})

for (const [title, filename] of [
  ["Batch Pixelation", "BatchPixelation"],
  ["Shoot with Camera", "ShootWithCamera_2"],
  ["Draw from a Blank Canvas", "DrawFromBlankCanvas"],
  ["Save Your Project", "SaveYourProject"],
  ["Open a Saved Project", "OpenSavedProject"],
  ["Export Your Pixel Art", "ExportYourPixelArt_2"],
  ["Edit Color Swatches", "EditColorSwatches-AddNewColor2"],
  ["Apply Custom Palette", "ApplyCustomPalette"],
  ["Fine-Tune the Source Image", "FineTuneSourceImage"],
] as const) {
  test(`${title} shows its looping video`, async ({ page }, testInfo) => {
    await page.goto("/how-it-works/")
    await page.getByRole("button", { name: title }).click()

    const modal = page.getByRole("dialog", { name: "How It Works" })
    const copy = modal.locator(".siteHowItWorksModalText")
    const video = modal.locator("video")
    await expect(video).toHaveAttribute("src", new RegExp(`${filename}(?:-[^/]*)?\\.webm`))
    await expect(video).toHaveAttribute("poster", new RegExp(`${filename}(?:-[^/]*)?\\.webp`))
    await expect(video).toHaveAttribute("aria-label", `${title} demonstration`)
    await expect(video).toHaveJSProperty("autoplay", true)
    await expect(video).toHaveJSProperty("muted", true)
    await expect(video).toHaveJSProperty("loop", true)
    await expect(video).toHaveJSProperty("playsInline", true)
    await expect(video).not.toHaveAttribute("controls")
    await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0.2)

    const copyBox = (await copy.boundingBox())!
    const videoBox = (await video.boundingBox())!
    if (testInfo.project.name === "mobile") {
      expect(copyBox.y + copyBox.height).toBeLessThan(videoBox.y)
      const modalBox = (await modal.boundingBox())!
      expect(videoBox.y + videoBox.height).toBeLessThan(modalBox.y + modalBox.height)
    } else {
      expect(videoBox.x + videoBox.width).toBeLessThan(copyBox.x)
    }
  })
}

test("mobile video modal shrinks to short copy and scrolls long copy within 90% of the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile")
  await page.goto("/how-it-works/")

  await page.getByRole("button", { name: "Save Your Project" }).click()
  const shortModal = page.getByRole("dialog", { name: "How It Works" })
  const shortBox = (await shortModal.boundingBox())!
  const tallViewport = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight)
  expect(shortBox.height).toBeLessThan(tallViewport * 0.9)
  expect(Math.abs(shortBox.y + shortBox.height / 2 - tallViewport / 2)).toBeLessThan(2)
  await shortModal.getByRole("button", { name: "Close" }).click()

  await page.setViewportSize({ width: 390, height: 650 })
  await page.getByRole("button", { name: "Start with a Photo" }).click()
  const modal = page.getByRole("dialog", { name: "How It Works" })
  const copy = modal.locator(".siteHowItWorksModalText")
  const video = modal.locator("video")
  const modalBox = (await modal.boundingBox())!
  const copyBox = (await copy.boundingBox())!
  const videoBox = (await video.boundingBox())!
  const viewportHeight = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight)
  expect(modalBox.height).toBeLessThanOrEqual(viewportHeight * 0.9 + 1)
  expect(Math.abs(modalBox.y + modalBox.height / 2 - viewportHeight / 2)).toBeLessThan(2)
  expect(Math.abs(videoBox.width - videoBox.height)).toBeLessThan(1)
  expect(Math.abs(videoBox.y - copyBox.y - copyBox.height - 20)).toBeLessThan(1)
  expect(await copy.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0)

  const videoY = videoBox.y
  await copy.evaluate(element => { element.scrollTop = element.scrollHeight })
  expect(await copy.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  expect(await modal.evaluate(element => element.scrollTop)).toBe(0)
  expect((await video.boundingBox())!.y).toBe(videoY)
})

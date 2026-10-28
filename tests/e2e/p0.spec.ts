import { expect, test, type Page } from "@playwright/test"
import fs from "node:fs/promises"
import path from "node:path"
import {
  collectBrowserErrors,
  fixturesDir,
  installStableVisualEnvironment,
  openBearProject,
  promoDynamicMasks,
  settle,
  snapshotName,
} from "./helpers"

const promoRoutes = [
  { path: "/", name: "home" },
  { path: "/faq/", name: "faq" },
  { path: "/how-it-works/", name: "how-it-works" },
  { path: "/gallery/", name: "gallery" },
  { path: "/pixel-art-from-photos/", name: "article" },
  { path: "/links/", name: "links" },
] as const

test.beforeEach(async ({ page }) => {
  await installStableVisualEnvironment(page)
})

test("start screen is stable", async ({ page }, testInfo) => {
  const errors = collectBrowserErrors(page)

  await page.goto("/editor/")
  await expect(page.getByRole("button", { name: "Open File" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Camera" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Draw" })).toBeVisible()

  await expect(page).toHaveScreenshot(snapshotName(testInfo, "editor-start"))
  expect(errors.flush()).toEqual([])
})

test("start screen stays contained when the viewport gets short", async ({ page }, testInfo) => {
  await page.goto("/editor/")
  const viewports = testInfo.project.name === "mobile"
    ? [{ width: 390, height: 560 }, { width: 360, height: 500 }, { width: 700, height: 400 }]
    : [{ width: 1280, height: 400 }, { width: 700, height: 400 }, { width: 600, height: 360 }]

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await expect(page.getByRole("button", { name: "Draw" })).toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      const brand = document.querySelector(".pxStartLogoBox")!.getBoundingClientRect()
      const tagline = document.querySelector(".pxStartTagline span")!.getBoundingClientRect()
      return tagline.left >= brand.left - 1 && tagline.right <= brand.right + 1
    })).toBe(true)
    const layout = await page.evaluate(() => {
      const bounds = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const logo = bounds(".pxStartLogoBox")
      const logoButton = bounds(".pxStartLogoButton")
      const tagline = bounds(".pxStartTagline")
      const taglineText = document.querySelector<HTMLElement>(".pxStartTagline span")!
      const actions = bounds(".pxStartActions")
      const buttons = [...document.querySelectorAll<HTMLElement>(".pxStartActionButton")].map(button => button.getBoundingClientRect())
      const copyright = [...document.querySelectorAll<HTMLElement>("div")]
        .find(element => element.textContent === "PIXTUDIO ©2026")!.getBoundingClientRect()
      const inside = (rect: DOMRect) => rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
      return {
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        contained: [logo, actions, copyright, ...buttons].every(inside),
        brandChildrenShareWidth: Math.abs(logo.width - logoButton.width) < 1 && Math.abs(logo.width - tagline.width) < 1,
        brandTextRatio: parseFloat(getComputedStyle(taglineText).fontSize) / taglineText.closest<HTMLElement>(".pxStartLogoBox")!.clientWidth,
        taglineTransform: getComputedStyle(taglineText).transform,
        logoAspectRatio: logoButton.height / logoButton.width,
        separated: logo.bottom <= buttons[0].top && buttons[2].bottom <= copyright.top,
        squareButtons: buttons.every(button => Math.abs(button.width - button.height) < 1),
        desktopLogoInLandscape: innerWidth <= innerHeight || logo.width <= 154,
      }
    })
    expect(layout, `${viewport.width}x${viewport.height}`).toMatchObject({
      contained: true, brandChildrenShareWidth: true, taglineTransform: "none", separated: true, squareButtons: true, desktopLogoInLandscape: true,
    })
    expect(layout.brandTextRatio, `${viewport.width}x${viewport.height}`).toBeCloseTo(0.076, 2)
    expect(layout.logoAspectRatio, `${viewport.width}x${viewport.height}`).toBeCloseTo(38 / 154, 2)
    expect(layout.scrollHeight, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportHeight + 1)
  }
  await page.screenshot({ path: testInfo.outputPath("editor-start-short-landscape.png") })
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1920, height: 945 })
    const sizes = await page.evaluate(() => ({
      logo: document.querySelector(".pxStartLogoBox")!.getBoundingClientRect().width,
      action: document.querySelector(".pxStartActionButton")!.getBoundingClientRect().width,
    }))
    expect(sizes.logo).toBeGreaterThanOrEqual(200)
    expect(sizes.action).toBeGreaterThanOrEqual(150)
    await page.screenshot({ path: testInfo.outputPath("editor-start-production-proportions.png") })
  }
})

test("start screen shows a file drop affordance while dragging a file", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page)

  await page.goto("/editor/")
  await expect(page.getByRole("button", { name: "Open File" })).toBeVisible()
  await dispatchWindowFileDrag(page, "dragenter", {
    name: "portrait.png",
    type: "image/png",
    bytes: [137, 80, 78, 71],
  })

  const overlay = page.getByTestId("start-drop-overlay")
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText("Drop your file inside the frame")

  await dispatchWindowFileDrag(page, "dragleave", {
    name: "portrait.png",
    type: "image/png",
    bytes: [137, 80, 78, 71],
  })
  await expect(overlay).toBeHidden()

  expect(errors.flush()).toEqual([])
})

test("start screen opens a dropped PIXTUDIO project file", async ({ page }) => {
  const errors = collectBrowserErrors(page)
  const fixturePath = path.join(fixturesDir, "de-confetti-single-cell.pixtudio")
  const projectBytes = [...(await fs.readFile(fixturePath))]

  await page.goto("/editor/")
  await expect(page.getByRole("button", { name: "Open File" })).toBeVisible()
  await dispatchWindowFileDrag(page, "drop", {
    name: "de-confetti-single-cell.pixtudio",
    type: "application/json",
    bytes: projectBytes,
  })

  await expect(page.getByRole("button", { name: "Export" })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(/BRUSH SIZE/i)).toBeVisible({ timeout: 20_000 })

  expect(errors.flush()).toEqual([])
})

test("editor project, export menu, open menu, and manual are stable", async ({
  page,
}, testInfo) => {
  const errors = collectBrowserErrors(page)

  await openBearProject(page)
  await expect(page).toHaveScreenshot(snapshotName(testInfo, "editor-project"))

  await page.getByRole("button", { name: "Export" }).click()
  await expect(page.getByRole("button", { name: "PNG" })).toBeVisible()
  await expect(page.getByRole("button", { name: "SVG" })).toBeVisible()
  await expect(page.getByRole("button", { name: "XLSX" })).toBeVisible()
  await expect(page.getByRole("button", { name: /ZIP/i })).toBeVisible()
  await expect(page).toHaveScreenshot(snapshotName(testInfo, "editor-export-menu"))
  await page.getByRole("button", { name: "Close" }).click()

  await page.getByRole("button", { name: "Import" }).click()
  await expect(page.getByRole("button", { name: "Open file" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Camera" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Blank canvas" })).toBeVisible()
  await expect(page).toHaveScreenshot(snapshotName(testInfo, "editor-open-menu"))
  await page.getByRole("button", { name: "Close" }).click()

  await page.getByRole("button", { name: "Manual button" }).click()
  await expect(
    page.getByRole("heading", { name: /PIXTUDIO.*User Guide/ })
  ).toBeVisible()
  await expect(page).toHaveScreenshot(snapshotName(testInfo, "editor-manual"))

  expect(errors.flush()).toEqual([])
})

for (const route of promoRoutes) {
  test(`promo route ${route.name} is stable`, async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page)

    await page.goto(route.path)
    await expect(page.locator("body")).toBeVisible()
    await page.waitForLoadState("networkidle")
    await settle(page)
    await waitForMobileHomeCarouselSnap(page, testInfo, route.name)

    await expect(page).toHaveScreenshot(
      snapshotName(testInfo, `promo-${route.name}`),
      {
        mask: promoDynamicMasks(page),
        maskColor: "#e9d8a6",
      }
    )
    expect(errors.flush()).toEqual([])
  })
}

test("how-it-works modal keeps production backdrop blur", async ({ page }) => {
  const errors = collectBrowserErrors(page)

  await page.goto("/how-it-works/")
  await page.getByRole("button", { name: "Draw from a Blank Canvas" }).click()

  const overlay = page.locator(".siteHowItWorksModalOverlay")
  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveCSS("backdrop-filter", /blur\(/)

  expect(errors.flush()).toEqual([])
})

async function waitForMobileHomeCarouselSnap(
  page: Page,
  testInfo: { project: { name: string } },
  routeName: string
) {
  if (routeName !== "home" || testInfo.project.name !== "mobile") return

  const firstCard = page.locator(".hubMobileCards [data-carousel-item]").first()
  await expect
    .poll(
      async () => {
        const box = await firstCard.boundingBox()
        return !!box && box.x > 50 && box.x < 90
      },
      {
        message: "mobile home carousel should finish its initial snap",
        timeout: 5000,
      }
    )
    .toBe(true)
}

async function dispatchWindowFileDrag(
  page: Page,
  type: "dragenter" | "dragleave" | "drop",
  file: { name: string; type: string; bytes: number[] }
) {
  await page.evaluate(
    ({ eventType, fileInput }) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(
        new File([new Uint8Array(fileInput.bytes)], fileInput.name, {
          type: fileInput.type,
        })
      )
      window.dispatchEvent(
        new DragEvent(eventType, {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        })
      )
    },
    { eventType: type, fileInput: file }
  )
}

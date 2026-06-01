import { expect, test, type Page } from "@playwright/test"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.resolve(__dirname, "../fixtures")
const bearProjectPath = path.join(fixturesDir, "Bear-test.pixtudio")

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

  await page.getByRole("button", { name: "Open" }).click()
  await expect(page.getByRole("button", { name: "Open file" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Blank canvas" })).toBeVisible()
  await expect(page).toHaveScreenshot(snapshotName(testInfo, "editor-open-menu"))
  await page.getByRole("button", { name: "Close" }).click()

  await page.getByRole("button", { name: "Manual button" }).click()
  await expect(
    page.getByRole("heading", { name: "PIXTUDIO - User Guide" })
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

async function openBearProject(page: Page) {
  await page.goto("/editor/")
  const fileChooserPromise = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Open File" }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(bearProjectPath)

  await expect(page.getByRole("button", { name: "Export" })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(/BRUSH SIZE/i)).toBeVisible({ timeout: 20_000 })
  await settle(page)
}

async function installStableVisualEnvironment(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("pixtudio-e2e", "true")
    window.sessionStorage.setItem("pixtudio:orbit-quality", "lite")
  })

  await page.route("**/*", async (route) => {
    await route.continue()
  })
}

async function settle(page: Page) {
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation-duration: 0.001s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(250)
}

function snapshotName(
  testInfo: { project: { name: string } },
  name: string
) {
  return `${name}-${testInfo.project.name}.png`
}

function promoDynamicMasks(page: Page) {
  return [
    page.locator(".hubMobileVideoHero"),
    page.locator(".hubDesktopOrbitLayer"),
    page.locator("video"),
    page.locator("canvas"),
  ]
}

function collectBrowserErrors(page: Page) {
  const errors: string[] = []

  page.on("console", (message) => {
    if (message.type() !== "error") return
    errors.push(message.text())
  })

  page.on("pageerror", (error) => {
    errors.push(error.message)
  })

  return {
    flush() {
      return errors
    },
  }
}

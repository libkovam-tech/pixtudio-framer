import { expect, test } from "@playwright/test"
import {
  collectBrowserErrors,
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

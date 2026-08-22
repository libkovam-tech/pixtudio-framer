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

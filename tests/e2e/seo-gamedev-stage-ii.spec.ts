import { expect, test } from "@playwright/test"

const cardTitles = [
  "LIVETRANSFORMATION",
  "FULL CREATIVECONTROL",
  "RECORD THEMAGIC",
  "READY FORPRODUCTION",
  "PALETTE CONTROLSEVERYTHING",
  "NO DRAWINGSKILLS NEEDED",
  "MORE THANA GENERATOR",
]

test("home feature cards remain complete after removing game-development cards", async ({ page }, testInfo) => {
  await page.goto("/")

  const prerenderCards = page.locator('[data-prerender-route="/"] .prerenderGrid article')
  // The prerender shell may be removed after hydration, so check its content in the response separately.
  const html = await (await page.request.get("/")).text()
  expect(html).not.toContain("CREATORS & GAME DEVS LOVE IT")
  expect(html).not.toContain("PRE-PRODUCTION FOR GAME ARTISTS")
  expect(await prerenderCards.count()).toBeLessThanOrEqual(7)

  if (testInfo.project.name === "mobile") {
    const cards = page.locator(".hubMobileCards [data-carousel-item]")
    await expect(cards).toHaveCount(7)
    for (let index = 0; index < cardTitles.length; index += 1) {
      await expect(cards.nth(index)).toContainText(cardTitles[index])
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(cards).toHaveCount(7)
    await expect(cards.first()).toBeVisible()
    return
  }

  const landed = page.locator(".hubDesktopOrbitCardLanded h2")
  for (const title of [...cardTitles, cardTitles[0]]) {
    await expect(landed).toHaveText(title, { timeout: 5000 })
    await page.keyboard.press("ArrowDown")
  }
  await expect(landed).toHaveText(cardTitles[1], { timeout: 5000 })
})

test("prerendered SEO copy and structured data agree", async ({ request }) => {
  const home = await (await request.get("/")).text()
  const faq = await (await request.get("/faq/")).text()
  const gallery = await (await request.get("/gallery/")).text()
  const article = await (await request.get("/pixel-art-from-photos/")).text()
  const homeGrid = home.match(/<section class="prerenderGrid" aria-label="PIXTUDIO features">(.*?)<\/section>/s)?.[1]
  expect(homeGrid?.match(/<article /g)).toHaveLength(7)
  expect(home).toContain("Use PIXTUDIO to turn photos into pixel art for avatars, social posts, and personal projects. You can also record the pixelization process to share as short-form video.")

  const faqSchema = JSON.parse(faq.match(/<script id="pixtudio-faq-jsonld"[^>]*>(.*?)<\/script>/s)?.[1] ?? "null")
  const questions = faqSchema["@graph"].find((item: { "@type": string }) => item["@type"] === "FAQPage").mainEntity
  const expectedFaq = [
    ["Who is PIXTUDIO made for?", "PIXTUDIO is for anyone who wants to turn photos into expressive pixel art, from curious beginners to designers and visual content creators."],
    ["Can I keep a consistent style across multiple images?", "Yes. Use the same canvas aspect ratio, grid size, and color palette for each image to give them a consistent look. You can also import a palette from another image or a saved PIXTUDIO project and apply it to the image you're working on."],
  ]
  for (const [question, answer] of expectedFaq) {
    expect(faq).toContain(`<h2>${question}</h2><p>${answer}</p>`)
    expect(questions).toContainEqual(expect.objectContaining({ name: question, acceptedAnswer: { "@type": "Answer", text: answer } }))
  }

  const gallerySchema = JSON.parse(gallery.match(/<script id="pixtudio-gallery-jsonld"[^>]*>(.*?)<\/script>/s)?.[1] ?? "null")
  const caption = "Toy character transformed into pixel art with simplified shapes and a playful limited palette"
  expect(gallery).toContain(`<h2>Toy character</h2><p>${caption}</p>`)
  expect(gallerySchema["@graph"].find((item: { "@type": string }) => item["@type"] === "ImageGallery").associatedMedia).toContainEqual(expect.objectContaining({ name: "Toy character", caption }))

  expect(article).toContain("This is a good choice for blog illustrations and social media content.")
  expect(article).toContain("office and spreadsheet art")
  expect(article).not.toContain("Game developers can create sprites")
})

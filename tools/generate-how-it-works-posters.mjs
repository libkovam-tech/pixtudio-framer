import { createServer } from "node:http"
import { readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { chromium } from "playwright"

const assetDirectory = resolve("src/hub/assets/how-it-works")
const allFilenames = [
  "BatchPixelation",
  "StartWithPhoto",
  "ShootWithCamera_2",
  "DrawFromBlankCanvas",
  "SaveYourProject",
  "OpenSavedProject",
  "ExportYourPixelArt_2",
  "EditColorSwatches-AddNewColor2",
  "ApplyCustomPalette",
  "FineTuneSourceImage",
]
const filenames = process.argv.length > 2 ? process.argv.slice(2) : allFilenames
if (filenames.some(filename => !allFilenames.includes(filename))) {
  throw new Error("Unknown How It Works video name")
}

const server = createServer(async (request, response) => {
  const filename = decodeURIComponent(new URL(request.url, "http://localhost").pathname.slice(1))
  if (!filenames.some(name => `${name}.webm` === filename)) {
    response.writeHead(404).end()
    return
  }
  const video = await readFile(join(assetDirectory, filename))
  response.writeHead(200, { "Content-Type": "video/webm", "Content-Length": video.length })
  response.end(video)
})

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const port = server.address().port
let browser
try {
  browser = await chromium.launch({ channel: "chrome" })
  const page = await browser.newPage()
  for (const filename of filenames) {
    await page.goto(`http://127.0.0.1:${port}/${filename}.webm`)
    const dataUrl = await page.evaluate(async () => {
      const video = document.querySelector("video")
      if (!video) throw new Error("Browser video element missing")
      video.pause()
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise((resolve, reject) => {
          video.addEventListener("loadeddata", resolve, { once: true })
          video.addEventListener("error", reject, { once: true })
        })
      }
      video.currentTime = 0
      if (video.seeking) await new Promise(resolve => video.addEventListener("seeked", resolve, { once: true }))
      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext("2d").drawImage(video, 0, 0)
      return canvas.toDataURL("image/webp", 0.88)
    })
    await writeFile(join(assetDirectory, `${filename}.webp`), Buffer.from(dataUrl.split(",")[1], "base64"))
    console.log(`Created ${filename}.webp`)
  }
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}

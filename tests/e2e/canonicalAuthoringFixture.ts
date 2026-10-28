import { build } from "esbuild"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { expect, type Page } from "@playwright/test"
import { bearImagePath, settle } from "./helpers"

let artifact: Promise<{ js: string; css: string }> | undefined
function authoringArtifact() {
    return artifact ??= build({ entryPoints: [path.resolve("tests/e2e/canonicalAuthoringHost.tsx")],
        bundle: true, write: false, format: "iife", outfile: "authoring.js", jsx: "automatic",
        define: { "process.env.NODE_ENV": '"production"', "import.meta.env": '{"BASE_URL":"/"}' },
        plugins: [{ name: "inline-test-fonts", setup(builder) {
            builder.onResolve({ filter: /\.ttf\?url$/ }, args => ({
                path: path.resolve(args.resolveDir, args.path.split("?")[0]), namespace: "test-font" }))
            builder.onLoad({ filter: /.*/, namespace: "test-font" }, async args => ({
                contents: `export default ${JSON.stringify("data:font/ttf;base64," + (await readFile(args.path)).toString("base64"))}`, loader: "js" }))
        } }],
    }).then(result => ({ js: result.outputFiles.find(file => file.path.endsWith(".js"))!.text,
        css: result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "" }))
}

/** Exercise the original editor via its host API, not a patched Crop algorithm. */
export async function openCanonicalAuthoringCropScreen(page: Page, options?: { stabilizeStartButton?: boolean }) {
    const { js, css } = await authoringArtifact()
    await page.route("**/__canonical-authoring.js", route => route.fulfill({ contentType: "text/javascript", body: js }))
    await page.route("**/__canonical-authoring.css", route => route.fulfill({ contentType: "text/css", body: css }))
    await page.route("**/__canonical-authoring/", route => route.fulfill({ contentType: "text/html", body:
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__canonical-authoring.css"></head><body><div id="root"></div><script src="/__canonical-authoring.js"></script></body></html>' }))
    await page.goto("/__canonical-authoring/")
    if (options?.stabilizeStartButton) {
        await page.addStyleTag({ content: ".pxStartActionButton { animation: none !important; transform: none !important; }" })
    }
    await page.locator("#canonical-reference-file").setInputFiles(bearImagePath)
    await expect(page.getByRole("button", { name: "OK", exact: true })).toBeVisible({ timeout: 20000 })
    await expect(page.locator("canvas").last()).toBeVisible()
    await settle(page)
}

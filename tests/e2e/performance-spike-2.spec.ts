import { expect, test } from "@playwright/test"
import { build } from "esbuild"
import path from "node:path"
import os from "node:os"
import { writeFile } from "node:fs/promises"
import { installStableVisualEnvironment } from "./helpers"
import { makePerformanceSources, sealPerformanceReference } from "./performanceReferenceFixture"
import type * as Spike2 from "./performanceSpike2Harness"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope"

declare global { interface Window { performanceSpike2: typeof Spike2 } }

let proofBundle: string
test.beforeAll(async () => {
    const built = await build({ entryPoints: [path.resolve("tests/e2e/performanceSpike2Harness.ts")],
        bundle: true, write: false, format: "iife", globalName: "performanceSpike2" })
    proofBundle = built.outputFiles[0].text
})
test.beforeEach(async ({ page }) => installStableVisualEnvironment(page))

for (const round of [1, 2] as const) {
    test(`Performance Spike 2 callback attribution round ${round}`, async ({ page, context, browser }, testInfo) => {
        test.setTimeout(1_200_000)
        const sources = await makePerformanceSources(page)
        const cases: { shape: string; context: string;
            proof: Awaited<ReturnType<typeof Spike2.canonicalControls>> }[] = []
        const controls: { context: string; proof: Awaited<ReturnType<typeof Spike2.freshControls>> }[] = []
        const recipes = new Map<"P1" | "P2", SealedReference>()
        const shapes: ("P1" | "P2")[] = round === 1 ? ["P2", "P1"] : ["P2"]
        for (const shape of shapes) {
            const sealed = await sealPerformanceReference(page, sources[0], shape)
            recipes.set(shape, sealed)
            await page.addScriptTag({ content: proofBundle })
            if (round === 1 && shape === "P2") {
                controls.push({ context: "editor-document", proof: await page.evaluate(() =>
                    window.performanceSpike2.freshControls()) })
            }
            const recipeBefore = JSON.stringify(sealed.recipe)
            const proof = await page.evaluate(({ sealed, source, full }) =>
                window.performanceSpike2.canonicalControls(sealed, source, full),
            { sealed, source: sources[0], full: round === 1 })
            expect(proof.recipeUnchanged).toBe(recipeBefore)
            cases.push({ shape, context: "editor-document", proof })
            console.log("SPIKE2_PROGRESS", testInfo.project.name, round, shape, "editor-document",
                JSON.stringify(proof.series.map(series => ({ label: series.label, stats: series.statistics }))))
        }
        const environment = { chrome: browser.version(), platform: os.platform(), osRelease: os.release(),
            profile: testInfo.project.name, headless: true, workers: 1,
            userAgent: await page.evaluate(() => navigator.userAgent),
            viewport: page.viewportSize(), pageUrl: page.url() }
        if (round === 1) {
            // The blank page has no editor runtime or page-level visual-environment init script.
            await page.close()
            const blank = await context.newPage()
            try {
                await blank.addScriptTag({ content: proofBundle })
                controls.push({ context: "blank-document", proof: await blank.evaluate(() =>
                    window.performanceSpike2.freshControls()) })
                for (const shape of ["P2", "P1"] as const) {
                    const sealed = recipes.get(shape)!
                    const proof = await blank.evaluate(({ sealed, source }) =>
                        window.performanceSpike2.canonicalControls(sealed, source, false),
                    { sealed, source: sources[0] })
                    expect(proof.recipeUnchanged).toBe(JSON.stringify(sealed.recipe))
                    cases.push({ shape, context: "blank-document", proof })
                    console.log("SPIKE2_PROGRESS", testInfo.project.name, round, shape, "blank-document",
                        JSON.stringify(proof.series.map(series => ({ label: series.label, stats: series.statistics }))))
                }
            } finally { await blank.close() }
        }
        for (const row of cases) {
            for (const exact of [row.proof.canonicalExact, row.proof.copyExact,
                row.proof.copiedPngExact, row.proof.runner.exact, ...row.proof.drawProofs]) {
                expect(exact.differentBytes).toBe(0)
                expect(exact.rgbaLength).toBe(exact.width * exact.height * 4)
            }
            for (const series of [...row.proof.series, row.proof.isolatedFresh, row.proof.runner]) {
                expect(series.samples).toHaveLength(10)
                expect(series.samples.every(sample => sample.bytes > 0)).toBe(true)
            }
            expect(row.proof.runner.resources).toMatchObject({ decodedOpened: 10, decodedClosed: 10,
                peakActiveDecoded: 1, sinkWriteAttempts: 10, sinkWriteSucceeded: 10 })
        }
        const artifact = { environment, round, controls, cases }
        const evidencePath = testInfo.outputPath(`spike2-${testInfo.project.name}-round${round}.json`)
        await writeFile(evidencePath, JSON.stringify(artifact, null, 2))
        await testInfo.attach(`spike2-${testInfo.project.name}-round${round}`, {
            contentType: "application/json", path: evidencePath })
        console.log("SPIKE2_EVIDENCE", evidencePath)
    })
}

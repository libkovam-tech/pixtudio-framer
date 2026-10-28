import { pngLatencyDiagnostics as diagnostic } from "./performanceSpike2Harness"
import { runner } from "./performanceSpike3Harness"
import { decodeAndValidateRasterImageFile } from "../../src/editor/fileIntakeSecurity"
import { renderFinalFrame } from "../../src/plugins/batchPixelation/render/finalFrame"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope"
import type { PerformanceSource } from "./performanceReferenceFixture"

type TimelineRow = { name: string; ms: number; visibility: DocumentVisibilityState; focused: boolean;
    detail?: string; trusted?: boolean }
declare global {
    interface Window { spike4Timeline: TimelineRow[]; spike4Mark: (name: string, detail?: string) => void }
}

// Passed to addInitScript: keep this function independent of module closures.
export function installTimeline(observePaint: boolean) {
    window.spike4Timeline = []
    window.spike4Mark = (name, detail) => {
        if (window.spike4Timeline.length < 512) window.spike4Timeline.push({ name, detail, ms: performance.now(),
            visibility: document.visibilityState, focused: document.hasFocus() })
    }
    window.spike4Mark("init-script")
    for (const name of ["DOMContentLoaded", "load", "focus", "blur", "visibilitychange"]) {
        const target = name === "visibilitychange" || name === "DOMContentLoaded" ? document : window
        target.addEventListener(name, () => window.spike4Mark(name))
    }
    for (const name of ["pointermove", "pointerdown", "click", "keydown"]) {
        document.addEventListener(name, event => {
            if (window.spike4Timeline.filter(row => row.name === name).length < 8) {
                window.spike4Timeline.push({ name, ms: performance.now(), visibility: document.visibilityState,
                    focused: document.hasFocus(), trusted: event.isTrusted })
            }
        }, { passive: true })
    }
    if (observePaint) for (const type of ["paint", "long-animation-frame"]) {
        if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) window.spike4Mark(`performance:${entry.name || type}`,
                JSON.stringify({ startTime: entry.startTime, duration: entry.duration, type: entry.entryType }))
        }).observe({ type, buffered: true })
    }
}

let active: { bitmap: ImageBitmap; canvas: HTMLCanvasElement; sealed: SealedReference; source: PerformanceSource } | null = null
export async function prepare(sealed: SealedReference, source: PerformanceSource) {
    if (active) throw new Error("Diagnostic canvas already prepared")
    window.spike4Mark("canonical-prepare-start")
    const bitmap = await decodeAndValidateRasterImageFile(new File([Uint8Array.from(source.bytes)], source.name,
        { type: source.type }))
    try { active = { bitmap, canvas: renderFinalFrame(bitmap, sealed.recipe), sealed, source } }
    catch (error) { bitmap.close(); throw error }
    window.spike4Mark("canonical-ready")
}

export function cleanup() {
    if (active) { diagnostic.release(active.canvas); active.bitmap.close(); active = null }
}

async function sequence(label: string, count: number) {
    if (!active) throw new Error("Missing prepared canvas")
    const samples: { call: number; milliseconds: number; bytes: number; width: number; height: number }[] = []
    let last: Blob | null = null
    for (let call = 1; call <= count; call++) {
        const canvas = active.canvas
        const start = performance.now()
        window.spike4Mark(`${label}-call`, String(call))
        const result = await new Promise<{ blob: Blob; elapsed: number }>((resolve, reject) => {
            canvas.toBlob(blob => {
                const elapsed = performance.now() - start
                window.spike4Mark(`${label}-callback`, String(call))
                if (!blob || blob.type !== "image/png") reject(new Error("Native PNG failed"))
                else resolve({ blob, elapsed })
            }, "image/png")
        })
        samples.push({ call, milliseconds: result.elapsed, bytes: result.blob.size, width: canvas.width, height: canvas.height })
        last = result.blob
    }
    return { samples, statistics: diagnostic.statistics(samples.map(sample => sample.milliseconds)), last: last! }
}

export async function cold() {
    const result = await sequence("cold", 3)
    const expected = diagnostic.pixels(active!.canvas)
    const exact = await diagnostic.provePng(expected, result.last)
    const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(expected.data).buffer)
    const rgbaSha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("")
    const values = result.samples.map(row => row.milliseconds)
    const classification = values.every(value => value < 100) ? "FAST" :
        values.every(value => value >= 900 && value < 1200) ? "SLOW-PLATEAU" : "MIXED"
    const ready = window.spike4Timeline.find(row => row.name === "ready")
    const call = window.spike4Timeline.find(row => row.name === "cold-call")!
    return { samples: result.samples, statistics: result.statistics, classification, exact, rgbaSha256,
        timeSinceReady: ready ? call.ms - ready.ms : null, firstCallMs: call.ms,
        navigation: performance.getEntriesByType("navigation").map(entry => entry.toJSON()),
        paints: performance.getEntriesByType("paint").map(entry => entry.toJSON()),
        timeline: [...window.spike4Timeline], explicitRafBeforeCold: 0 }
}

export async function control(longevity: boolean, checkRunner: boolean) {
    if (!active) throw new Error("Missing prepared canvas")
    const expected = diagnostic.pixels(active.canvas)
    const started = performance.now()
    window.spike4Mark("explicit-raf-request")
    await diagnostic.animationFrame()
    const waitMs = performance.now() - started
    window.spike4Mark("explicit-raf-completed")
    const after = await sequence("plain-after-raf", 10)
    const exact = await diagnostic.provePng(expected, after.last)
    const checks = []
    if (longevity) for (const gap of [1000, 4000]) {
        await new Promise(resolve => setTimeout(resolve, gap))
        const result = await sequence(`longevity-gap-${gap}`, 1)
        checks.push({ gapMs: gap, elapsedSinceRafMs: performance.now() - started,
            samples: result.samples, exact: await diagnostic.provePng(expected, result.last) })
    }
    const runnerProof = checkRunner ? await runner(active.sealed, active.source, expected) : null
    return { waitMs, explicitRafCount: 1, samples: after.samples, statistics: after.statistics, exact, checks, runnerProof }
}

export async function hiddenEncode() {
    if (document.visibilityState !== "hidden") throw new Error("Document is not hidden")
    const before = { visibility: document.visibilityState, focused: document.hasFocus() }
    const result = await sequence("hidden", 1)
    return { before, after: { visibility: document.visibilityState, focused: document.hasFocus() }, samples: result.samples }
}

export function armManual() {
    const button = document.createElement("button")
    button.id = "spike4-manual-start"
    button.textContent = "Start manual measurement"
    Object.assign(button.style, { position: "fixed", top: "12px", left: "12px", zIndex: "999999", padding: "18px" })
    document.body.append(button)
    window.spike4Mark("manual-armed")
    return new Promise<Awaited<ReturnType<typeof cold>> | null>((resolve, reject) => {
        const timeout = setTimeout(() => { button.remove(); resolve(null) }, 180_000)
        button.addEventListener("click", event => {
            if (!event.isTrusted) { clearTimeout(timeout); button.remove(); reject(new Error("Untrusted manual trigger")); return }
            clearTimeout(timeout)
            button.disabled = true
            window.spike4Mark("manual-final-trigger", "trusted event; no automated final action")
            cold().then(resolve, reject).finally(() => button.remove())
        }, { once: true })
    })
}

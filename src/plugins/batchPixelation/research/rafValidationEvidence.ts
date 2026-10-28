import { freezeFinalFrame, validateFinalFrameRecipe } from "../render/finalFrame.ts"
import type { SealedReference } from "../authoring/BatchReferenceEnvelope.ts"

export type ReferenceRecord = Readonly<{ name: string; size: number; lastModified: number }>
export type ReferencePackage = Readonly<{ version: 1; sealed: SealedReference; reference: ReferenceRecord }>

export function classifyPng(ms: number): "FAST" | "SLOW-PLATEAU" | "OTHER" {
    return ms < 100 ? "FAST" : ms >= 900 && ms < 1200 ? "SLOW-PLATEAU" : "OTHER"
}

export function statistics(values: readonly number[]) {
    if (!values.length) return { n: 0, mean: null, median: null, p95: null, max: null }
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return { n: sorted.length, mean: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
        median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted[sorted.length - 1] }
}

export function samplePositions(length: number): number[] {
    if (!length) return []
    return [...new Set([0, Math.max(0, Math.floor(length * 0.1) - 1),
        Math.floor((length - 1) / 2), Math.floor((length - 1) * 0.75), length - 1])]
}

export function canonicalJson(value: unknown): string {
    const normalize = (input: unknown): unknown => {
        if (Array.isArray(input)) return input.map(normalize)
        if (input !== null && typeof input === "object") return Object.fromEntries(
            Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
                .map(([key, nested]) => [key, normalize(nested)]))
        return input
    }
    return JSON.stringify(normalize(value))
}

export async function sha256(bytes: ArrayBuffer): Promise<string> {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map(v => v.toString(16).padStart(2, "0")).join("")
}

export async function referenceIdentity(sealed: SealedReference): Promise<string> {
    return sha256(new TextEncoder().encode(canonicalJson(sealed)).buffer)
}

export function parseReferencePackage(text: string): ReferencePackage {
    if (text.length > 2_000_000) throw new Error("Reference JSON exceeds the research import limit")
    const value = JSON.parse(text) as ReferencePackage
    if (value?.version !== 1 || !value.sealed || !value.reference ||
        typeof value.reference.name !== "string" || value.reference.name.length > 1024 ||
        !Number.isSafeInteger(value.reference.size) || value.reference.size < 0 ||
        !Number.isSafeInteger(value.reference.lastModified) || value.reference.lastModified < 0) {
        throw new Error("Invalid research Reference package")
    }
    const geometry = value.sealed.referenceInputGeometry
    if (!geometry || ![geometry.width, geometry.height].every(v => Number.isSafeInteger(v) && v > 0)) {
        throw new Error("Invalid Reference geometry")
    }
    validateFinalFrameRecipe(value.sealed.recipe)
    const { crop, smart, grid, palette } = value.sealed.recipe
    const recipe = freezeFinalFrame({ crop, smart, grid, palette })
    return Object.freeze({ version: 1, reference: Object.freeze({ ...value.reference }),
        sealed: Object.freeze({ referenceInputGeometry: Object.freeze({ ...geometry }), recipe }) })
}

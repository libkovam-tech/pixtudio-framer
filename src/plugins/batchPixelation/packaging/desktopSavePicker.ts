export type DesktopSaveResult = "saved" | "cancelled" | "unsupported"

export function logBatchSaveFailure(fileKind: "recipe" | "ZIP", stage: string, error: unknown): void {
    const name = error instanceof Error ? error.name : typeof error
    const browserError = error instanceof DOMException || error instanceof TypeError
    console.error(`[Batch Pixelation] Could not save ${fileKind} (${stage})`,
        browserError ? { name, message: error.message } : { name })
}

type SavePickerWindow = Window & {
    showSaveFilePicker?: (options: {
        suggestedName: string
        types: { description: string; accept: Record<string, string[]> }[]
    }) => Promise<{ createWritable(): Promise<{
        write(data: Blob): Promise<void>
        close(): Promise<void>
        abort(): Promise<void>
    }> }>
}

export async function saveWithDesktopPicker(blob: Blob, filename: string): Promise<DesktopSaveResult> {
    if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported"
    // Android's file picker is intentionally not used for Batch exports.
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return "unsupported"
    const picker = (window as SavePickerWindow).showSaveFilePicker
    if (!picker) return "unsupported"

    const isZip = filename.endsWith(".zip")
    let handle: Awaited<ReturnType<NonNullable<SavePickerWindow["showSaveFilePicker"]>>>
    try {
        handle = await picker.call(window, {
            suggestedName: filename,
            types: [{ description: isZip ? "PIXTUDIO Batch ZIP" : "PIXTUDIO Batch Recipe",
                accept: isZip ? { "application/zip": [".zip"] } :
                    { "application/json": [".pixtudiobatch"] } }],
        })
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return "cancelled"
        logBatchSaveFailure(isZip ? "ZIP" : "recipe", "opening Save As dialog", error)
        throw error
    }

    let writable: Awaited<ReturnType<typeof handle.createWritable>>
    try {
        writable = await handle.createWritable()
    } catch (error) {
        logBatchSaveFailure(isZip ? "ZIP" : "recipe", "opening selected file", error)
        throw error
    }
    let stage = "writing file"
    try {
        await writable.write(blob)
        stage = "closing saved file"
        await writable.close()
    } catch (error) {
        try { await writable.abort() } catch { /* Preserve the write error. */ }
        logBatchSaveFailure(isZip ? "ZIP" : "recipe", stage, error)
        throw error
    }
    return "saved"
}

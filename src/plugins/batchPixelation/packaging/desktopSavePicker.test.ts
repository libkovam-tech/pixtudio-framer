import { afterEach, describe, expect, it, vi } from "vitest"
import { saveWithDesktopPicker } from "./desktopSavePicker"

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("desktop Batch save picker", () => {
    it("writes the suggested recipe and ZIP names to user-selected files", async () => {
        const write = vi.fn(async (blob: Blob) => { expect(blob).toBeInstanceOf(Blob) })
        const close = vi.fn(async () => {})
        const picker = vi.fn(async (options: unknown) => {
            expect(options).toBeDefined()
            return { createWritable: async () => ({ write, close, abort: vi.fn() }) }
        })
        vi.stubGlobal("window", { showSaveFilePicker: picker })
        vi.stubGlobal("navigator", { userAgent: "Desktop Chrome" })

        const recipe = new Blob(["recipe"])
        const archive = new Blob(["archive"])
        expect(await saveWithDesktopPicker(recipe, "recipe.pixtudiobatch")).toBe("saved")
        expect(await saveWithDesktopPicker(archive, "result.zip")).toBe("saved")
        expect(picker.mock.calls[0][0]).toMatchObject({ suggestedName: "recipe.pixtudiobatch",
            types: [{ accept: { "application/json": [".pixtudiobatch"] } }] })
        expect(".pixtudiobatch").toMatch(/^\.[a-z0-9]{1,16}$/)
        expect(picker.mock.calls[1][0]).toMatchObject({ suggestedName: "result.zip",
            types: [{ accept: { "application/zip": [".zip"] } }] })
        expect(write.mock.calls.map(call => call[0])).toEqual([recipe, archive])
        expect(close).toHaveBeenCalledTimes(2)
    })

    it("does not open a save picker on Android even when the API exists", async () => {
        const picker = vi.fn()
        vi.stubGlobal("window", { showSaveFilePicker: picker })
        vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome" })
        expect(await saveWithDesktopPicker(new Blob(), "result.zip")).toBe("unsupported")
        expect(picker).not.toHaveBeenCalled()
    })

    it("treats picker dismissal as cancellation and never opens a writable", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        const picker = vi.fn(async () => { throw new DOMException("dismissed", "AbortError") })
        vi.stubGlobal("window", { showSaveFilePicker: picker })
        vi.stubGlobal("navigator", { userAgent: "Desktop Chrome" })
        expect(await saveWithDesktopPicker(new Blob(), "result.zip")).toBe("cancelled")
        expect(log).not.toHaveBeenCalled()
    })

    it("aborts a failed write and reports the failure", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        const failure = new Error("disk full")
        const abort = vi.fn(async () => {})
        vi.stubGlobal("window", { showSaveFilePicker: async () => ({ createWritable: async () => ({
            write: async () => { throw failure }, close: vi.fn(), abort,
        }) }) })
        vi.stubGlobal("navigator", { userAgent: "Desktop Chrome" })
        await expect(saveWithDesktopPicker(new Blob(), "result.zip")).rejects.toBe(failure)
        expect(abort).toHaveBeenCalledOnce()
        expect(log).toHaveBeenCalledWith("[Batch Pixelation] Could not save ZIP (writing file)",
            { name: "Error" })
    })

    it("logs a dialog rejection with its browser error without logging file contents", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        vi.stubGlobal("window", { showSaveFilePicker: async () => { throw new DOMException("Permission denied", "NotAllowedError") } })
        vi.stubGlobal("navigator", { userAgent: "Desktop Chrome" })
        await expect(saveWithDesktopPicker(new Blob(["private recipe"]), "recipe.pixtudio-batch"))
            .rejects.toMatchObject({ name: "NotAllowedError" })
        expect(log).toHaveBeenCalledWith("[Batch Pixelation] Could not save recipe (opening Save As dialog)",
            { name: "NotAllowedError", message: "Permission denied" })
    })
})

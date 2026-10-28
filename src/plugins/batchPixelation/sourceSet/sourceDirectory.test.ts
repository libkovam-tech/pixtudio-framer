import { describe, expect, it } from "vitest"
import { directoryFromInputFiles, directoryFromSelectedFiles, isIOSDevice } from "./sourceDirectory"

function selectedFile(path: string): File {
    const name = path.split("/").at(-1)!
    const file = new File([name], name)
    Object.defineProperty(file, "webkitRelativePath", { value: path })
    return file
}

describe("input directory adapter", () => {
    it("keeps only direct children and retains files for the later batch run", async () => {
        const top = selectedFile("SOURCE/frame1.png")
        const nested = selectedFile("SOURCE/nested/frame2.png")
        const directory = directoryFromInputFiles([nested, top])
        const entries = []
        for await (const entry of directory.values()) entries.push(entry)
        expect(directory.name).toBe("SOURCE")
        expect(entries.map(entry => entry.name)).toEqual(["frame1.png"])
        expect(await (entries[0] as { getFile(): Promise<File> }).getFile()).toBe(top)
    })

    it("rejects a selection without a consistent folder root", () => {
        expect(() => directoryFromInputFiles([selectedFile("first/a.png"), selectedFile("second/b.png")]))
            .toThrow("The selected folder could not be read.")
        expect(() => directoryFromInputFiles([selectedFile("frame.png")]))
            .toThrow("The selected folder could not be read.")
    })
})

describe("selected frame adapter", () => {
    it("retains every selected file without requiring a folder path", async () => {
        const first = new File(["first"], "frame1.png")
        const second = new File(["second"], "frame2.png")
        const source = directoryFromSelectedFiles([first, second])
        const entries = []
        for await (const entry of source.values()) entries.push(entry)
        expect(source.name).toBe("Selected frames")
        expect(entries.map(entry => entry.name)).toEqual(["frame1.png", "frame2.png"])
        expect(await (entries[1] as { getFile(): Promise<File> }).getFile()).toBe(second)
    })

    it("rejects an empty selection", () => {
        expect(() => directoryFromSelectedFiles([])).toThrow("No source frames were selected.")
    })

    it("recognizes iPadOS desktop user agents without enabling Android", () => {
        expect(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5)).toBe(true)
        expect(isIOSDevice("Mozilla/5.0 (iPad; CPU OS 17_6)", 5)).toBe(true)
        expect(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 0)).toBe(false)
        expect(isIOSDevice("Mozilla/5.0 (Linux; Android 15)", 5)).toBe(false)
    })
})

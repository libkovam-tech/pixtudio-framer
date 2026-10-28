export type SourceFileHandle = Readonly<{
    kind: "file"
    name: string
    getFile(): Promise<File>
}>

type SourceDirectoryEntry = SourceFileHandle | Readonly<{ kind: "directory"; name: string }>

export type SourceDirectoryHandle = Readonly<{
    kind: "directory"
    name: string
    values(): AsyncIterable<SourceDirectoryEntry>
}>

type DirectoryPickerWindow = Window & {
    showDirectoryPicker?: (options?: { mode: "read" }) => Promise<SourceDirectoryHandle>
}

export class SourceDirectoryUnavailableError extends Error {
    constructor() {
        super("Folder selection is not supported in this browser.")
        this.name = "SourceDirectoryUnavailableError"
    }
}

export function supportsSourceDirectoryPicker(): boolean {
    return typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function"
}

export function supportsInputDirectoryPicker(): boolean {
    const input = document.createElement("input")
    input.type = "file"
    return typeof input.webkitdirectory === "boolean"
}

export function directoryFromInputFiles(selected: readonly File[]): SourceDirectoryHandle {
    const roots = new Set(selected.map(file => file.webkitRelativePath.split("/")[0]).filter(Boolean))
    if (roots.size !== 1 || selected.some(file => !file.webkitRelativePath.includes("/"))) {
        throw new Error("The selected folder could not be read.")
    }
    const name = [...roots][0]
    const topLevel = selected.filter(file => file.webkitRelativePath === `${name}/${file.name}`)
    return {
        kind: "directory", name,
        async *values() {
            for (const file of topLevel) {
                yield { kind: "file" as const, name: file.name, getFile: async () => file }
            }
        },
    }
}

export function directoryFromSelectedFiles(selected: readonly File[]): SourceDirectoryHandle {
    if (selected.length === 0) throw new Error("No source frames were selected.")
    return {
        kind: "directory", name: "Selected frames",
        async *values() {
            for (const file of selected) {
                yield { kind: "file" as const, name: file.name, getFile: async () => file }
            }
        },
    }
}

export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
    return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
}

export async function chooseSourceDirectory(): Promise<SourceDirectoryHandle | null> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker
    if (typeof picker !== "function") throw new SourceDirectoryUnavailableError()
    try {
        const directory = await picker.call(window, { mode: "read" })
        if (directory.kind !== "directory") throw new Error("The folder picker returned an invalid selection.")
        return directory
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return null
        throw error
    }
}

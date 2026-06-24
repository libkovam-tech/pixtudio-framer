import { describe, expect, it } from "vitest"

import { FILE_INTAKE_MESSAGES } from "./fileIntakeSecurity.ts"
import {
    PROJECT_SNAPSHOT_V2_MAGIC,
    PROJECT_SNAPSHOT_V2_VERSION,
    V2_CELL_NULL,
    type ProjectSnapshotV2,
} from "./projectSnapshotV2.ts"
import {
    loadProjectSnapshotFromFile,
    migrateProjectSnapshotToCurrent,
    prepareProjectSnapshotForSave,
    type ProjectFileLike,
} from "./projectPersistence.ts"

function projectSnapshot(): ProjectSnapshotV2 {
    return {
        magic: PROJECT_SNAPSHOT_V2_MAGIC,
        version: PROJECT_SNAPSHOT_V2_VERSION,
        gridSize: 2,
        paletteCount: 2,
        palette: {
            swatches: [
                { index: 0, id: "auto-0", hex: "#112233", isUser: false },
                { index: 1, id: "user-1", hex: "#AABBCC", isUser: true },
            ],
        },
        importLayer: {
            cells: [0, 1, V2_CELL_NULL, V2_CELL_NULL],
        },
        strokeLayer: {
            cells: [{ cellIndex: 3, swatchIndex: 1 }],
        },
        ref: null,
    }
}

function fileLike(
    text: string,
    options: { name?: string; size?: number } = {}
): ProjectFileLike {
    return {
        name: options.name ?? "project.pixtudio",
        size: options.size ?? text.length,
        text: async () => text,
    }
}

const checksumJsonString = (json: string) => `checksum:${json.length}`

describe("projectPersistence", () => {
    it("loads a valid V2 project snapshot without browser file adapters", async () => {
        const snapshot = projectSnapshot()
        const result = await loadProjectSnapshotFromFile(
            fileLike(JSON.stringify(snapshot), { name: "valid.pixtudio" }),
            { checksumJsonString }
        )

        expect(result.ok).toBe(true)
        if (!result.ok) return

        expect(result.value.fileName).toBe("valid.pixtudio")
        expect(result.value.snapshotVersion).toBe(2)
        expect(result.value.validated.gridSize).toBe(2)
        expect(result.value.canonicalChecksum).toBe(
            checksumJsonString(JSON.stringify(result.value.canonical))
        )
    })

    it("rejects damaged project JSON as a controlled load error", async () => {
        const result = await loadProjectSnapshotFromFile(
            fileLike("{not-json"),
            { checksumJsonString }
        )

        expect(result.ok).toBe(false)
        if (result.ok) return

        expect(result.error.operation).toBe("load")
        expect(result.error.code).toBe("damaged-project")
        expect(result.error.message).toBe(FILE_INTAKE_MESSAGES.damagedProject)
    })

    it("rejects oversized project files before reading text", async () => {
        let read = false
        const result = await loadProjectSnapshotFromFile(
            {
                name: "too-large.pixtudio",
                size: 9 * 1024 * 1024,
                text: async () => {
                    read = true
                    return JSON.stringify(projectSnapshot())
                },
            },
            { checksumJsonString }
        )

        expect(read).toBe(false)
        expect(result.ok).toBe(false)
        if (result.ok) return

        expect(result.error.operation).toBe("load")
        expect(result.error.code).toBe("damaged-project")
    })

    it("routes current V2 snapshots through an explicit migration boundary", () => {
        const result = migrateProjectSnapshotToCurrent(projectSnapshot())

        expect(result.ok).toBe(true)
        if (!result.ok) return

        expect(result.value.snapshotVersion).toBe(2)
        expect(result.value.validated.version).toBe(PROJECT_SNAPSHOT_V2_VERSION)
    })

    it("prepares a valid V2 project snapshot for save without browser adapters", () => {
        const result = prepareProjectSnapshotForSave(projectSnapshot(), {
            checksumJsonString,
            suggestedName: "custom.pixtudio",
            mime: "application/pixtudio+json",
        })

        expect(result.ok).toBe(true)
        if (!result.ok) return

        expect(result.value.suggestedName).toBe("custom.pixtudio")
        expect(result.value.mime).toBe("application/pixtudio+json")
        expect(result.value.summary).toEqual({
            gridSize: 2,
            paletteSize: 2,
            hasRef: false,
            hasSmartObjectState: false,
        })
        expect(result.value.canonicalChecksum).toBe(
            checksumJsonString(result.value.jsonText)
        )
        expect(JSON.parse(result.value.jsonText)).toEqual(result.value.canonical)
    })

    it("rejects invalid save snapshots as controlled save errors", () => {
        const invalidSnapshot = {
            ...projectSnapshot(),
            gridSize: 0,
        } as ProjectSnapshotV2

        const result = prepareProjectSnapshotForSave(invalidSnapshot, {
            checksumJsonString,
        })

        expect(result.ok).toBe(false)
        if (result.ok) return

        expect(result.error.operation).toBe("save")
        expect(result.error.code).toBe("temporarily-unavailable")
    })
})

import {
    FILE_INTAKE_MESSAGES,
    assertProjectSaveFileSize,
    getFileIntakeUserMessage,
} from "./fileIntakeSecurity.ts"
import {
    canonicalizeSnapshotV2,
    parseProjectSnapshotV2Json,
    validateProjectSnapshotV2OrThrow,
    type ProjectSnapshotV2,
    type ValidatedSnapshotV2,
} from "./projectSnapshotV2.ts"
import {
    saveLoadErr,
    saveLoadOk,
    toTemporarySaveLoadError,
    type SaveLoadResult,
} from "./saveLoadResult.ts"

export type ProjectFileLike = {
    name: string
    size: number
    text: () => Promise<string>
}

export type CurrentProjectSnapshot = {
    snapshotVersion: 2
    canonical: ProjectSnapshotV2
    validated: ValidatedSnapshotV2
}

export type LoadedProjectSnapshot = CurrentProjectSnapshot & {
    canonicalChecksum: string
    fileName: string
}

export type LoadProjectSnapshotOptions = {
    checksumJsonString?: (json: string) => string
}

export type PrepareProjectSaveOptions = {
    checksumJsonString?: (json: string) => string
    suggestedName?: string
    mime?: string
}

export type PreparedProjectSave = CurrentProjectSnapshot & {
    suggestedName: string
    mime: string
    jsonText: string
    canonicalChecksum: string
    summary: {
        gridSize: number
        paletteSize: number
        hasRef: boolean
        hasSmartObjectState: boolean
    }
}

function fnv1a32(str: string): string {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(16).padStart(8, "0")
}

export function checksumProjectJsonString(json: string): string {
    return fnv1a32(json)
}

function resolveChecksumJsonString(options?: {
    checksumJsonString?: (json: string) => string
}) {
    return options?.checksumJsonString ?? checksumProjectJsonString
}

export function migrateProjectSnapshotToCurrent(
    canonical: ProjectSnapshotV2
): SaveLoadResult<CurrentProjectSnapshot> {
    if (canonical.version === 2) {
        return saveLoadOk({
            snapshotVersion: 2,
            canonical,
            validated: validateProjectSnapshotV2OrThrow(canonical),
        })
    }

    return saveLoadErr({
        operation: "load",
        code: "damaged-project",
        message: FILE_INTAKE_MESSAGES.damagedProject,
    })
}

export function prepareProjectSnapshotForSave(
    snapshot: ProjectSnapshotV2,
    options: PrepareProjectSaveOptions = {}
): SaveLoadResult<PreparedProjectSave> {
    try {
        const checksumJsonString = resolveChecksumJsonString(options)
        const canonical = canonicalizeSnapshotV2(snapshot)
        const validated = validateProjectSnapshotV2OrThrow(canonical)
        const jsonText = JSON.stringify(canonical)

        return saveLoadOk({
            snapshotVersion: 2,
            canonical,
            validated,
            suggestedName: options.suggestedName ?? "project.pixtudio",
            mime: options.mime ?? "application/json",
            jsonText,
            canonicalChecksum: checksumJsonString(jsonText),
            summary: {
                gridSize: validated.gridSize,
                paletteSize: validated.palette.swatches.length,
                hasRef: !!validated.ref,
                hasSmartObjectState: !!validated.smartObjectState,
            },
        })
    } catch (error) {
        return saveLoadErr(toTemporarySaveLoadError("save", error))
    }
}

export async function loadProjectSnapshotFromFile(
    file: ProjectFileLike,
    options: LoadProjectSnapshotOptions = {}
): Promise<SaveLoadResult<LoadedProjectSnapshot>> {
    try {
        const checksumJsonString = resolveChecksumJsonString(options)
        assertProjectSaveFileSize(file)
        const jsonText = await file.text()
        const parsed = parseProjectSnapshotV2Json(jsonText)

        if (!parsed.ok) {
            return saveLoadErr({
                operation: "load",
                code: "damaged-project",
                message: FILE_INTAKE_MESSAGES.damagedProject,
                cause: parsed.error,
            })
        }

        const migrated = migrateProjectSnapshotToCurrent(parsed.canonical)
        if (!migrated.ok) return migrated

        return saveLoadOk({
            ...migrated.value,
            canonicalChecksum: checksumJsonString(
                JSON.stringify(migrated.value.canonical)
            ),
            fileName: file.name,
        })
    } catch (error) {
        return saveLoadErr({
            operation: "load",
            code: "damaged-project",
            message: getFileIntakeUserMessage(
                error,
                FILE_INTAKE_MESSAGES.damagedProject
            ),
            cause: error,
        })
    }
}

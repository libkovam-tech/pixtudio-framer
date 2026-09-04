import {
    FILE_INTAKE_MESSAGES,
    assertProjectSaveFileSize,
    getFileIntakeUserMessage,
} from "./fileIntakeSecurity.ts"
import { routeOpenFile, type OpenFileRoute } from "./openFileRouter.ts"
import { extractPaletteFromImageFile } from "./paletteFromImage.ts"
import { prepareImportedPalettePresetFromColors } from "./palettePresetExtension.ts"
import { parseProjectSnapshotV2Json } from "./projectSnapshotV2.ts"

type ImportedPalettePresetIngressInput = {
    file: File
    displayName?: string
    makeImportedId: () => string
    targetColors?: number
}

export type ImportedPalettePresetIngressResult =
    | {
          ok: true
          route: Extract<OpenFileRoute, "image" | "project">
          fileName: string
          colors: string[]
          preparedPreset: ReturnType<typeof prepareImportedPalettePresetFromColors>
      }
    | {
          ok: false
          route: OpenFileRoute
          message: string
      }

function prepareImportedPreset(
    input: ImportedPalettePresetIngressInput,
    colors: string[]
) {
    return prepareImportedPalettePresetFromColors({
        fileName: input.file.name,
        displayName: input.displayName,
        colors,
        makeImportedId: input.makeImportedId,
    })
}

async function importPalettePresetFromProjectFile(
    input: ImportedPalettePresetIngressInput
): Promise<ImportedPalettePresetIngressResult> {
    try {
        assertProjectSaveFileSize(input.file)
        const text = await input.file.text()
        const parsed = parseProjectSnapshotV2Json(text)
        if (!parsed.ok) {
            return {
                ok: false,
                route: "project",
                message: FILE_INTAKE_MESSAGES.damagedProject,
            }
        }

        const colors = [...parsed.canonical.palette.swatches]
            .sort((a, b) => a.index - b.index)
            .map((swatch) => swatch.hex.toUpperCase())

        if (colors.length <= 0) {
            return {
                ok: false,
                route: "project",
                message: "Import failed. Please try again.",
            }
        }

        return {
            ok: true,
            route: "project",
            fileName: input.file.name,
            colors,
            preparedPreset: prepareImportedPreset(input, colors),
        }
    } catch (error) {
        return {
            ok: false,
            route: "project",
            message: getFileIntakeUserMessage(
                error,
                FILE_INTAKE_MESSAGES.damagedProject
            ),
        }
    }
}

async function importPalettePresetFromImageFile(
    input: ImportedPalettePresetIngressInput
): Promise<ImportedPalettePresetIngressResult> {
    try {
        const colors = await extractPaletteFromImageFile(input.file, {
            targetColors: input.targetColors ?? 32,
        })

        if (colors.length <= 0) {
            return {
                ok: false,
                route: "image",
                message: "Import failed. Please try again.",
            }
        }

        return {
            ok: true,
            route: "image",
            fileName: input.file.name,
            colors,
            preparedPreset: prepareImportedPreset(input, colors),
        }
    } catch (error) {
        return {
            ok: false,
            route: "image",
            message: getFileIntakeUserMessage(
                error,
                FILE_INTAKE_MESSAGES.imageDecodeFailed
            ),
        }
    }
}

export async function importPalettePresetFromFile(
    input: ImportedPalettePresetIngressInput
): Promise<ImportedPalettePresetIngressResult> {
    const route = routeOpenFile(input.file)

    if (route === "project") {
        return await importPalettePresetFromProjectFile(input)
    }

    if (route === "image") {
        return await importPalettePresetFromImageFile(input)
    }

    return {
        ok: false,
        route,
        message: FILE_INTAKE_MESSAGES.unsupportedFile,
    }
}

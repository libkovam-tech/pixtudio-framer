import {
    isLikelyProjectSaveFile,
    isLikelyRasterImageFile,
    type FileIntakeCandidate,
} from "./fileIntakeSecurity.ts"

export type OpenFileRoute = "project" | "image" | "unsupported"

export { isLikelyProjectSaveFile, isLikelyRasterImageFile }

export function routeOpenFile(
    file: FileIntakeCandidate | null | undefined
): OpenFileRoute {
    if (!file) return "unsupported"

    if (isLikelyProjectSaveFile(file)) return "project"
    if (isLikelyRasterImageFile(file)) return "image"
    return "unsupported"
}


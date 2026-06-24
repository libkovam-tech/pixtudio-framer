export type SaveLoadOperation = "save" | "load"

export type SaveLoadErrorCode =
    | "cancelled"
    | "damaged-project"
    | "temporarily-unavailable"
    | "unsupported-file"

export type SaveLoadError = {
    operation: SaveLoadOperation
    code: SaveLoadErrorCode
    message: string
    cause?: unknown
}

export type SaveLoadResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: SaveLoadError }

export const SAVE_LOAD_TEMPORARILY_UNAVAILABLE_MESSAGE =
    "This function is temporarily unavailable."

export function saveLoadOk<T>(value: T): SaveLoadResult<T> {
    return { ok: true, value }
}

export function saveLoadErr(error: SaveLoadError): SaveLoadResult<never> {
    return { ok: false, error }
}

export function isSaveLoadCancelled(error: SaveLoadError): boolean {
    return error.code === "cancelled"
}

export function getSaveLoadErrorMessage(error: SaveLoadError): string {
    return error.message || SAVE_LOAD_TEMPORARILY_UNAVAILABLE_MESSAGE
}

export function toTemporarySaveLoadError(
    operation: SaveLoadOperation,
    cause?: unknown
): SaveLoadError {
    return {
        operation,
        code: "temporarily-unavailable",
        message: SAVE_LOAD_TEMPORARILY_UNAVAILABLE_MESSAGE,
        cause,
    }
}

import { describe, expect, it } from "vitest"

import {
    SAVE_LOAD_TEMPORARILY_UNAVAILABLE_MESSAGE,
    getSaveLoadErrorMessage,
    isSaveLoadCancelled,
    saveLoadErr,
    saveLoadOk,
    toTemporarySaveLoadError,
} from "./saveLoadResult.ts"

describe("saveLoadResult", () => {
    it("represents successful operation results", () => {
        expect(saveLoadOk({ id: "project" })).toEqual({
            ok: true,
            value: { id: "project" },
        })
    })

    it("represents controlled operation failures", () => {
        const error = toTemporarySaveLoadError("save", new Error("boom"))

        expect(saveLoadErr(error)).toEqual({
            ok: false,
            error,
        })
        expect(getSaveLoadErrorMessage(error)).toBe(
            SAVE_LOAD_TEMPORARILY_UNAVAILABLE_MESSAGE
        )
    })

    it("distinguishes user cancellation from real failures", () => {
        expect(
            isSaveLoadCancelled({
                operation: "load",
                code: "cancelled",
                message: "Cancelled",
            })
        ).toBe(true)
        expect(isSaveLoadCancelled(toTemporarySaveLoadError("load"))).toBe(false)
    })
})

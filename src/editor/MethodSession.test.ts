import { describe, expect, it } from "vitest"

import {
    DEFAULT_METHOD_PROFILE,
    DEFAULT_METHOD_PROFILES_BY_PALETTE_CONTEXT,
    FIXED_PALETTE_MAPPING_METHOD_ID,
    OKLAB_COLOR_SPACE_ID,
    PIXTUDIO_METHOD_ID,
} from "./QuantizationCore.ts"
import {
    applyMethodSession,
    canApplyMethodSession,
    cancelMethodSession,
    completeMethodSessionPreview,
    createMethodSession,
    failMethodSessionPreview,
    requestMethodSessionPreview,
    selectMethodSessionProfile,
} from "./MethodSession.ts"

type BeforeState = {
    label: string
    pixels: string[][]
}

type FrozenSource = {
    sourceId: string
    pixels: string[][]
}

type Preview = {
    pixels: string[][]
}

function beforeState(): BeforeState {
    return {
        label: "before",
        pixels: [["auto-0"]],
    }
}

function frozenSource(): FrozenSource {
    return {
        sourceId: "source-a",
        pixels: [["#000000"]],
    }
}

describe("MethodSession", () => {
    it("creates an auto session with frozen source, frozen context, and context defaults", () => {
        const source = frozenSource()
        const before = beforeState()
        const session = createMethodSession<BeforeState, FrozenSource, Preview>({
            beforeState: before,
            frozenSource: source,
            paletteContext: "auto",
            methodProfilesByPaletteContext:
                DEFAULT_METHOD_PROFILES_BY_PALETTE_CONTEXT,
            cloneBeforeState: (state) => ({
                ...state,
                pixels: state.pixels.map((row) => row.slice()),
            }),
            cloneFrozenSource: (snapshot) => ({
                ...snapshot,
                pixels: snapshot.pixels.map((row) => row.slice()),
            }),
        })

        before.pixels[0][0] = "changed"
        source.pixels[0][0] = "#FFFFFF"

        expect(session.paletteContext).toBe("auto")
        expect(session.frozenPaletteContext).toBe("auto")
        expect(session.contextDefaultProfile).toEqual(DEFAULT_METHOD_PROFILE)
        expect(session.committedProfile).toEqual(DEFAULT_METHOD_PROFILE)
        expect(session.selectedProfile).toEqual(DEFAULT_METHOD_PROFILE)
        expect(session.sessionId).toEqual(expect.any(Number))
        expect(session.beforeState.pixels).toEqual([["auto-0"]])
        expect(session.frozenSource.pixels).toEqual([["#000000"]])
        expect(session.status).toBe("ready")
        expect(session.pendingRequestId).toBeNull()
    })

    it("creates a fixed session without migrating auto profiles into the fixed context", () => {
        const session = createMethodSession<BeforeState, FrozenSource, Preview>({
            beforeState: beforeState(),
            frozenSource: frozenSource(),
            paletteContext: "fixed",
            methodProfilesByPaletteContext: {
                auto: DEFAULT_METHOD_PROFILE,
            },
            selectedProfile: DEFAULT_METHOD_PROFILE,
        })

        expect(session.paletteContext).toBe("fixed")
        expect(session.frozenPaletteContext).toBe("fixed")
        expect(session.contextDefaultProfile).toEqual({
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })
        expect(session.committedProfile).toEqual({
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })
        expect(session.selectedProfile).toEqual({
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })
    })

    it("creates a new session id for each METHOD session", () => {
        const first = createMethodSession<BeforeState, FrozenSource, Preview>({
            beforeState: beforeState(),
            frozenSource: frozenSource(),
            paletteContext: "auto",
        })
        const second = createMethodSession<BeforeState, FrozenSource, Preview>({
            beforeState: beforeState(),
            frozenSource: frozenSource(),
            paletteContext: "auto",
        })

        expect(second.sessionId).not.toBe(first.sessionId)
    })

    it("selects profiles only inside the frozen palette context", () => {
        const session = createMethodSession<BeforeState, FrozenSource, Preview>({
            beforeState: beforeState(),
            frozenSource: frozenSource(),
            paletteContext: "auto",
            requestId: 4,
        })

        const transition = selectMethodSessionProfile(session, {
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })

        expect(transition.session.paletteContext).toBe("auto")
        expect(transition.session.frozenPaletteContext).toBe("auto")
        expect(transition.session.selectedProfile).toEqual(DEFAULT_METHOD_PROFILE)
        expect(transition.session.status).toBe("pending")
        expect(transition.session.requestId).toBe(5)
        expect(transition.session.pendingRequestId).toBe(5)
        expect(transition.request).toEqual({
            sessionId: session.sessionId,
            requestId: 5,
            paletteContext: "auto",
            frozenPaletteContext: "auto",
            selectedProfile: DEFAULT_METHOD_PROFILE,
            frozenSource: session.frozenSource,
        })
    })

    it("keeps requests tied to the same frozen source and frozen palette context", () => {
        const session = createMethodSession<BeforeState, FrozenSource, Preview>({
            beforeState: beforeState(),
            frozenSource: frozenSource(),
            paletteContext: { kind: "fixed" },
            requestId: 10,
        })

        const transition = requestMethodSessionPreview(session)

        expect(transition.request.requestId).toBe(11)
        expect(transition.request.paletteContext).toBe("fixed")
        expect(transition.request.frozenPaletteContext).toBe("fixed")
        expect(transition.request.frozenSource).toBe(session.frozenSource)
        expect(transition.request.selectedProfile).toEqual({
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })
    })

    it("ignores stale preview completions and accepts only the latest request", () => {
        const initial = createMethodSession<BeforeState, FrozenSource, Preview>({
            beforeState: beforeState(),
            frozenSource: frozenSource(),
            paletteContext: "auto",
        })
        const first = requestMethodSessionPreview(initial)
        const second = requestMethodSessionPreview(first.session)

        const stale = completeMethodSessionPreview(second.session, {
            sessionId: first.request.sessionId,
            requestId: first.request.requestId,
            paletteContext: "auto",
            selectedProfile: first.request.selectedProfile,
            preview: { pixels: [["stale"]] },
        })

        expect(stale).toBe(second.session)

        const completed = completeMethodSessionPreview(second.session, {
            sessionId: second.request.sessionId,
            requestId: second.request.requestId,
            paletteContext: "auto",
            selectedProfile: second.request.selectedProfile,
            preview: { pixels: [["fresh"]] },
        })

        expect(completed.status).toBe("ready")
        expect(completed.pendingRequestId).toBeNull()
        expect(completed.lastValidPreview).toEqual({ pixels: [["fresh"]] })
        expect(completed.renderedProfile).toEqual(DEFAULT_METHOD_PROFILE)
    })

    it("ignores preview results from another palette context", () => {
        const pending = requestMethodSessionPreview(
            createMethodSession<BeforeState, FrozenSource, Preview>({
                beforeState: beforeState(),
                frozenSource: frozenSource(),
                paletteContext: "auto",
            })
        ).session

        const completed = completeMethodSessionPreview(pending, {
            sessionId: pending.sessionId,
            requestId: pending.requestId,
            paletteContext: "fixed",
            selectedProfile: pending.selectedProfile,
            preview: { pixels: [["wrong-context"]] },
        })

        expect(completed).toBe(pending)
    })

    it("ignores preview results from another METHOD session", () => {
        const active = requestMethodSessionPreview(
            createMethodSession<BeforeState, FrozenSource, Preview>({
                beforeState: beforeState(),
                frozenSource: frozenSource(),
                paletteContext: "auto",
            })
        )
        const other = requestMethodSessionPreview(
            createMethodSession<BeforeState, FrozenSource, Preview>({
                beforeState: beforeState(),
                frozenSource: frozenSource(),
                paletteContext: "auto",
            })
        )

        const completed = completeMethodSessionPreview(active.session, {
            sessionId: other.request.sessionId,
            requestId: active.request.requestId,
            paletteContext: active.request.frozenPaletteContext,
            selectedProfile: active.request.selectedProfile,
            preview: { pixels: [["other-session"]] },
        })

        expect(completed).toBe(active.session)
    })

    it("ignores preview results for a stale selected profile", () => {
        const pending = requestMethodSessionPreview(
            createMethodSession<BeforeState, FrozenSource, Preview>({
                beforeState: beforeState(),
                frozenSource: frozenSource(),
                paletteContext: "auto",
            })
        )

        const completed = completeMethodSessionPreview(pending.session, {
            sessionId: pending.request.sessionId,
            requestId: pending.request.requestId,
            paletteContext: pending.request.frozenPaletteContext,
            selectedProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
            preview: { pixels: [["stale-profile"]] },
        })

        expect(completed).toBe(pending.session)
    })

    it("retains the last valid preview on failure and blocks apply while failed", () => {
        const pending = requestMethodSessionPreview(
            createMethodSession<BeforeState, FrozenSource, Preview>({
                beforeState: beforeState(),
                frozenSource: frozenSource(),
                paletteContext: "auto",
            })
        )
        const ready = completeMethodSessionPreview(pending.session, {
            sessionId: pending.request.sessionId,
            requestId: pending.request.requestId,
            paletteContext: "auto",
            selectedProfile: pending.request.selectedProfile,
            preview: { pixels: [["valid"]] },
        })
        const failedRequest = requestMethodSessionPreview(ready)
        const failed = failMethodSessionPreview(failedRequest.session, {
            sessionId: failedRequest.request.sessionId,
            requestId: failedRequest.request.requestId,
            paletteContext: "auto",
            selectedProfile: failedRequest.request.selectedProfile,
            error: "preview failed",
        })

        expect(failed.status).toBe("error")
        expect(failed.error).toBe("preview failed")
        expect(failed.lastValidPreview).toEqual({ pixels: [["valid"]] })
        expect(canApplyMethodSession(failed)).toBe(false)
        expect(applyMethodSession(failed)).toEqual({
            ok: false,
            sessionId: failed.sessionId,
            reason: "failed",
            paletteContext: "auto",
            frozenPaletteContext: "auto",
            error: "preview failed",
        })
    })

    it("cancels back to BEFORE without using the selected preview profile", () => {
        const initial = createMethodSession<BeforeState, FrozenSource, Preview>({
            beforeState: beforeState(),
            frozenSource: frozenSource(),
            paletteContext: "fixed",
        })
        const selected = selectMethodSessionProfile(initial, {
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        }).session

        expect(cancelMethodSession(selected)).toEqual({
            sessionId: selected.sessionId,
            paletteContext: "fixed",
            frozenPaletteContext: "fixed",
            beforeState: initial.beforeState,
            committedProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })
    })

    it("applies only a ready current-context preview", () => {
        const pending = requestMethodSessionPreview(
            createMethodSession<BeforeState, FrozenSource, Preview>({
                beforeState: beforeState(),
                frozenSource: frozenSource(),
                paletteContext: "fixed",
            })
        )

        expect(canApplyMethodSession(pending.session)).toBe(false)
        expect(applyMethodSession(pending.session)).toEqual({
            ok: false,
            sessionId: pending.session.sessionId,
            reason: "pending",
            paletteContext: "fixed",
            frozenPaletteContext: "fixed",
        })

        const ready = completeMethodSessionPreview(pending.session, {
            sessionId: pending.request.sessionId,
            requestId: pending.request.requestId,
            paletteContext: "fixed",
            selectedProfile: pending.request.selectedProfile,
            preview: { pixels: [["applied"]] },
        })

        expect(canApplyMethodSession(ready)).toBe(true)
        expect(applyMethodSession(ready)).toEqual({
            ok: true,
            sessionId: ready.sessionId,
            paletteContext: "fixed",
            frozenPaletteContext: "fixed",
            beforeState: ready.beforeState,
            preview: { pixels: [["applied"]] },
            selectedProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
            renderedProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
            committedProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
            methodProfilesByPaletteContextPatch: {
                fixed: {
                    methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                    colorSpaceId: OKLAB_COLOR_SPACE_ID,
                },
            },
        })
    })

    it("returns an apply patch without mutating session state or other contexts", () => {
        const source = frozenSource()
        const before = beforeState()
        const initial = createMethodSession<BeforeState, FrozenSource, Preview>({
            beforeState: before,
            frozenSource: source,
            paletteContext: "auto",
            methodProfilesByPaletteContext: {
                auto: DEFAULT_METHOD_PROFILE,
                fixed: {
                    methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                    colorSpaceId: OKLAB_COLOR_SPACE_ID,
                },
            },
            selectedProfile: {
                methodId: PIXTUDIO_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
            cloneBeforeState: (state) => ({
                ...state,
                pixels: state.pixels.map((row) => row.slice()),
            }),
            cloneFrozenSource: (snapshot) => ({
                ...snapshot,
                pixels: snapshot.pixels.map((row) => row.slice()),
            }),
        })
        const pending = requestMethodSessionPreview(initial)
        const ready = completeMethodSessionPreview(pending.session, {
            sessionId: pending.request.sessionId,
            requestId: pending.request.requestId,
            paletteContext: pending.request.paletteContext,
            selectedProfile: pending.request.selectedProfile,
            preview: { pixels: [["preview"]] },
        })
        const sessionBeforeApply = JSON.parse(JSON.stringify(ready))

        const result = applyMethodSession(ready)

        expect(ready).toEqual(sessionBeforeApply)
        expect(before.pixels).toEqual([["auto-0"]])
        expect(source.pixels).toEqual([["#000000"]])
        expect(result).toMatchObject({
            ok: true,
            paletteContext: "auto",
            frozenPaletteContext: "auto",
            methodProfilesByPaletteContextPatch: {
                auto: {
                    methodId: PIXTUDIO_METHOD_ID,
                    colorSpaceId: OKLAB_COLOR_SPACE_ID,
                },
            },
        })
        if (!result.ok) throw new Error("expected apply result")
        expect(result.methodProfilesByPaletteContextPatch.fixed).toBeUndefined()
        expect(result.beforeState).toEqual({
            label: "before",
            pixels: [["auto-0"]],
        })
        expect(result.preview).toEqual({ pixels: [["preview"]] })
    })
})

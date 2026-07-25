import {
    doesPaletteContextAllowMethodPreview,
    getDefaultMethodProfileForPaletteContext,
    resolveMethodProfile,
    resolvePaletteContextKind,
    type MethodProfile,
    type MethodProfilesByPaletteContext,
    type PaletteContext,
    type PaletteContextKind,
} from "./QuantizationCore.ts"

export type MethodSessionStatus = "ready" | "pending" | "error"
export type MethodSessionId = number

export type MethodSessionState<
    TBeforeState,
    TFrozenSource,
    TPreview,
> = {
    sessionId: MethodSessionId
    beforeState: TBeforeState
    frozenSource: TFrozenSource
    paletteContext: PaletteContextKind
    frozenPaletteContext: PaletteContextKind
    selectedProfile: MethodProfile
    renderedProfile: MethodProfile | null
    committedProfile: MethodProfile
    contextDefaultProfile: MethodProfile
    requestId: number
    pendingRequestId: number | null
    status: MethodSessionStatus
    error: string | null
    lastValidPreview: TPreview | null
}

export type MethodSessionPreviewRequest<TFrozenSource> = {
    sessionId: MethodSessionId
    requestId: number
    paletteContext: PaletteContextKind
    frozenPaletteContext: PaletteContextKind
    selectedProfile: MethodProfile
    frozenSource: TFrozenSource
}

export type MethodSessionTransition<
    TBeforeState,
    TFrozenSource,
    TPreview,
> = {
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>
    request: MethodSessionPreviewRequest<TFrozenSource>
}

export type MethodSessionCreateInput<TBeforeState, TFrozenSource> = {
    beforeState: TBeforeState
    frozenSource: TFrozenSource
    paletteContext: PaletteContext | PaletteContextKind
    methodProfilesByPaletteContext?: MethodProfilesByPaletteContext | null
    selectedProfile?: Partial<MethodProfile> | null
    sessionId?: MethodSessionId
    requestId?: number
    cloneBeforeState?: (state: TBeforeState) => TBeforeState
    cloneFrozenSource?: (source: TFrozenSource) => TFrozenSource
}

export type MethodSessionPreviewCompleteInput<TPreview> = {
    sessionId: MethodSessionId
    requestId: number
    paletteContext: PaletteContext | PaletteContextKind
    selectedProfile: MethodProfile
    preview: TPreview
    renderedProfile?: Partial<MethodProfile> | null
}

export type MethodSessionPreviewFailInput = {
    sessionId: MethodSessionId
    requestId: number
    paletteContext: PaletteContext | PaletteContextKind
    selectedProfile: MethodProfile
    error: string
}

export type MethodSessionCancelResult<TBeforeState> = {
    sessionId: MethodSessionId
    paletteContext: PaletteContextKind
    frozenPaletteContext: PaletteContextKind
    beforeState: TBeforeState
    committedProfile: MethodProfile
}

export type MethodSessionApplyResult<TBeforeState, TPreview> =
    | {
          ok: true
          sessionId: MethodSessionId
          paletteContext: PaletteContextKind
          frozenPaletteContext: PaletteContextKind
          beforeState: TBeforeState
          preview: TPreview
          selectedProfile: MethodProfile
          renderedProfile: MethodProfile
          committedProfile: MethodProfile
          methodProfilesByPaletteContextPatch: MethodProfilesByPaletteContext
      }
    | {
          ok: false
          sessionId: MethodSessionId
          reason: "pending" | "failed" | "missing-preview"
          paletteContext: PaletteContextKind
          frozenPaletteContext: PaletteContextKind
          error?: string
      }

function cloneMethodProfile(profile: MethodProfile): MethodProfile {
    return { methodId: profile.methodId, colorSpaceId: profile.colorSpaceId }
}

let nextMethodSessionId = 1

function createMethodSessionId(): MethodSessionId {
    return nextMethodSessionId++
}

function areMethodProfilesEqual(
    first: MethodProfile,
    second: MethodProfile
): boolean {
    return (
        first.methodId === second.methodId &&
        first.colorSpaceId === second.colorSpaceId
    )
}

function cloneOrIdentity<T>(value: T, clone?: (value: T) => T): T {
    return clone ? clone(value) : value
}

function makePreviewRequest<TBeforeState, TFrozenSource, TPreview>(
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>
): MethodSessionPreviewRequest<TFrozenSource> {
    return {
        sessionId: session.sessionId,
        requestId: session.requestId,
        paletteContext: session.paletteContext,
        frozenPaletteContext: session.frozenPaletteContext,
        selectedProfile: cloneMethodProfile(session.selectedProfile),
        frozenSource: session.frozenSource,
    }
}

function isCurrentSessionRequest<TBeforeState, TFrozenSource, TPreview>(
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>,
    input: {
        sessionId: MethodSessionId
        requestId: number
        paletteContext: PaletteContext | PaletteContextKind
        selectedProfile: MethodProfile
    }
): boolean {
    if (input.sessionId !== session.sessionId) return false
    if (input.requestId !== session.pendingRequestId) return false
    if (
        resolvePaletteContextKind(input.paletteContext) !==
        session.frozenPaletteContext
    ) {
        return false
    }
    return areMethodProfilesEqual(input.selectedProfile, session.selectedProfile)
}

export function createMethodSession<
    TBeforeState,
    TFrozenSource,
    TPreview = unknown,
>(
    input: MethodSessionCreateInput<TBeforeState, TFrozenSource>
): MethodSessionState<TBeforeState, TFrozenSource, TPreview> {
    const paletteContext = resolvePaletteContextKind(input.paletteContext)
    if (!doesPaletteContextAllowMethodPreview(paletteContext)) {
        throw new Error(
            `METHOD preview is not available for ${paletteContext} palette context`
        )
    }

    const contextDefaultProfile =
        getDefaultMethodProfileForPaletteContext(paletteContext)
    const committedProfile = resolveMethodProfile(
        input.methodProfilesByPaletteContext?.[paletteContext],
        paletteContext
    )
    const selectedProfile = resolveMethodProfile(
        input.selectedProfile ?? committedProfile,
        paletteContext
    )

    return {
        sessionId: input.sessionId ?? createMethodSessionId(),
        beforeState: cloneOrIdentity(
            input.beforeState,
            input.cloneBeforeState
        ),
        frozenSource: cloneOrIdentity(
            input.frozenSource,
            input.cloneFrozenSource
        ),
        paletteContext,
        frozenPaletteContext: paletteContext,
        selectedProfile: cloneMethodProfile(selectedProfile),
        renderedProfile: null,
        committedProfile: cloneMethodProfile(committedProfile),
        contextDefaultProfile: cloneMethodProfile(contextDefaultProfile),
        requestId: input.requestId ?? 0,
        pendingRequestId: null,
        status: "ready",
        error: null,
        lastValidPreview: null,
    }
}

export function requestMethodSessionPreview<
    TBeforeState,
    TFrozenSource,
    TPreview,
>(
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>
): MethodSessionTransition<TBeforeState, TFrozenSource, TPreview> {
    const nextRequestId = session.requestId + 1
    const nextSession: MethodSessionState<
        TBeforeState,
        TFrozenSource,
        TPreview
    > = {
        ...session,
        requestId: nextRequestId,
        pendingRequestId: nextRequestId,
        status: "pending",
        error: null,
    }

    return {
        session: nextSession,
        request: makePreviewRequest(nextSession),
    }
}

export function selectMethodSessionProfile<
    TBeforeState,
    TFrozenSource,
    TPreview,
>(
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>,
    profile: Partial<MethodProfile> | null | undefined
): MethodSessionTransition<TBeforeState, TFrozenSource, TPreview> {
    const selectedProfile = resolveMethodProfile(
        profile,
        session.frozenPaletteContext
    )
    return requestMethodSessionPreview({
        ...session,
        selectedProfile: cloneMethodProfile(selectedProfile),
    })
}

export function completeMethodSessionPreview<
    TBeforeState,
    TFrozenSource,
    TPreview,
>(
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>,
    input: MethodSessionPreviewCompleteInput<TPreview>
): MethodSessionState<TBeforeState, TFrozenSource, TPreview> {
    if (
        !isCurrentSessionRequest(session, {
            sessionId: input.sessionId,
            requestId: input.requestId,
            paletteContext: input.paletteContext,
            selectedProfile: input.selectedProfile,
        })
    ) {
        return session
    }

    const renderedProfile = resolveMethodProfile(
        input.renderedProfile ?? session.selectedProfile,
        session.frozenPaletteContext
    )

    return {
        ...session,
        renderedProfile: cloneMethodProfile(renderedProfile),
        pendingRequestId: null,
        status: "ready",
        error: null,
        lastValidPreview: input.preview,
    }
}

export function failMethodSessionPreview<
    TBeforeState,
    TFrozenSource,
    TPreview,
>(
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>,
    input: MethodSessionPreviewFailInput
): MethodSessionState<TBeforeState, TFrozenSource, TPreview> {
    if (
        !isCurrentSessionRequest(session, {
            sessionId: input.sessionId,
            requestId: input.requestId,
            paletteContext: input.paletteContext,
            selectedProfile: input.selectedProfile,
        })
    ) {
        return session
    }

    return {
        ...session,
        pendingRequestId: null,
        status: "error",
        error: input.error,
    }
}

export function cancelMethodSession<TBeforeState, TFrozenSource, TPreview>(
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>
): MethodSessionCancelResult<TBeforeState> {
    return {
        sessionId: session.sessionId,
        paletteContext: session.paletteContext,
        frozenPaletteContext: session.frozenPaletteContext,
        beforeState: session.beforeState,
        committedProfile: cloneMethodProfile(session.committedProfile),
    }
}

export function canApplyMethodSession<TBeforeState, TFrozenSource, TPreview>(
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>
): boolean {
    return session.status === "ready" && session.lastValidPreview != null
}

export function applyMethodSession<TBeforeState, TFrozenSource, TPreview>(
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>
): MethodSessionApplyResult<TBeforeState, TPreview> {
    if (session.status === "pending") {
        return {
            ok: false,
            sessionId: session.sessionId,
            reason: "pending",
            paletteContext: session.paletteContext,
            frozenPaletteContext: session.frozenPaletteContext,
        }
    }
    if (session.status === "error") {
        return {
            ok: false,
            sessionId: session.sessionId,
            reason: "failed",
            paletteContext: session.paletteContext,
            frozenPaletteContext: session.frozenPaletteContext,
            error: session.error ?? undefined,
        }
    }
    if (session.lastValidPreview == null) {
        return {
            ok: false,
            sessionId: session.sessionId,
            reason: "missing-preview",
            paletteContext: session.paletteContext,
            frozenPaletteContext: session.frozenPaletteContext,
        }
    }

    const renderedProfile = cloneMethodProfile(
        session.renderedProfile ?? session.selectedProfile
    )

    return {
        ok: true,
        sessionId: session.sessionId,
        paletteContext: session.paletteContext,
        frozenPaletteContext: session.frozenPaletteContext,
        beforeState: session.beforeState,
        preview: session.lastValidPreview,
        selectedProfile: cloneMethodProfile(session.selectedProfile),
        renderedProfile,
        committedProfile: renderedProfile,
        methodProfilesByPaletteContextPatch: {
            [session.frozenPaletteContext]: renderedProfile,
        },
    }
}

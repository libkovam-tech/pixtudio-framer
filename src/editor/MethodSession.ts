import {
    doesPaletteContextAllowMethodPreview,
    getDefaultMethodProfileForPaletteContext,
    resolveMethodProfile,
    resolveDeConfettiByPaletteContext,
    resolvePaletteContextKind,
    type DeConfettiByPaletteContext,
    type DeConfettiSettings,
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
    selectedDeConfetti: DeConfettiSettings
    renderedDeConfetti: DeConfettiSettings | null
    committedDeConfetti: DeConfettiSettings
    contextDefaultDeConfetti: DeConfettiSettings
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
    selectedDeConfetti: DeConfettiSettings
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
    deConfettiByPaletteContext?: DeConfettiByPaletteContext | null
    selectedProfile?: Partial<MethodProfile> | null
    selectedDeConfetti?: Partial<DeConfettiSettings> | null
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
    selectedDeConfetti?: DeConfettiSettings
    preview: TPreview
    renderedProfile?: Partial<MethodProfile> | null
    renderedDeConfetti?: Partial<DeConfettiSettings> | null
}

export type MethodSessionPreviewFailInput = {
    sessionId: MethodSessionId
    requestId: number
    paletteContext: PaletteContext | PaletteContextKind
    selectedProfile: MethodProfile
    selectedDeConfetti?: DeConfettiSettings
    error: string
}

export type MethodSessionCancelResult<TBeforeState> = {
    sessionId: MethodSessionId
    paletteContext: PaletteContextKind
    frozenPaletteContext: PaletteContextKind
    beforeState: TBeforeState
    committedProfile: MethodProfile
    committedDeConfetti: DeConfettiSettings
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
          selectedDeConfetti: DeConfettiSettings
          renderedDeConfetti: DeConfettiSettings
          committedDeConfetti: DeConfettiSettings
          deConfettiByPaletteContextPatch: DeConfettiByPaletteContext
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

function cloneDeConfettiSettings(
    settings: DeConfettiSettings
): DeConfettiSettings {
    return { enabled: settings.enabled, tieBreaker: settings.tieBreaker }
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

function areDeConfettiSettingsEqual(
    first: DeConfettiSettings,
    second: DeConfettiSettings
): boolean {
    return (
        first.enabled === second.enabled &&
        first.tieBreaker === second.tieBreaker
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
        selectedDeConfetti: cloneDeConfettiSettings(
            session.selectedDeConfetti
        ),
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
        selectedDeConfetti?: DeConfettiSettings
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
    return (
        areMethodProfilesEqual(input.selectedProfile, session.selectedProfile) &&
        (input.selectedDeConfetti == null ||
            areDeConfettiSettingsEqual(
                input.selectedDeConfetti,
                session.selectedDeConfetti
            ))
    )
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
    const contextDefaultDeConfetti =
        resolveDeConfettiByPaletteContext()[paletteContext]
    const committedDeConfetti = resolveDeConfettiByPaletteContext(
        input.deConfettiByPaletteContext
    )[paletteContext]
    const selectedProfile = resolveMethodProfile(
        input.selectedProfile ?? committedProfile,
        paletteContext
    )
    const selectedDeConfetti =
        input.selectedDeConfetti == null
            ? committedDeConfetti
            : resolveDeConfettiByPaletteContext({
                  [paletteContext]: {
                      ...committedDeConfetti,
                      ...input.selectedDeConfetti,
                  },
              })[paletteContext]

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
        selectedDeConfetti: cloneDeConfettiSettings(selectedDeConfetti),
        renderedDeConfetti: null,
        committedDeConfetti: cloneDeConfettiSettings(committedDeConfetti),
        contextDefaultDeConfetti: cloneDeConfettiSettings(
            contextDefaultDeConfetti
        ),
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
            selectedDeConfetti: input.selectedDeConfetti,
        })
    ) {
        return session
    }

    const renderedProfile = resolveMethodProfile(
        input.renderedProfile ?? session.selectedProfile,
        session.frozenPaletteContext
    )
    const renderedDeConfetti =
        input.renderedDeConfetti == null
            ? session.selectedDeConfetti
            : resolveDeConfettiByPaletteContext({
                  [session.frozenPaletteContext]: {
                      ...session.selectedDeConfetti,
                      ...input.renderedDeConfetti,
                  },
              })[session.frozenPaletteContext]

    return {
        ...session,
        renderedProfile: cloneMethodProfile(renderedProfile),
        renderedDeConfetti: cloneDeConfettiSettings(renderedDeConfetti),
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
            selectedDeConfetti: input.selectedDeConfetti,
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
        committedDeConfetti: cloneDeConfettiSettings(
            session.committedDeConfetti
        ),
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
    const renderedDeConfetti = cloneDeConfettiSettings(
        session.renderedDeConfetti ?? session.selectedDeConfetti
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
        selectedDeConfetti: cloneDeConfettiSettings(
            session.selectedDeConfetti
        ),
        renderedDeConfetti,
        committedDeConfetti: renderedDeConfetti,
        deConfettiByPaletteContextPatch: {
            [session.frozenPaletteContext]: renderedDeConfetti,
        },
    }
}

export function selectMethodSessionDeConfettiSettings<
    TBeforeState,
    TFrozenSource,
    TPreview,
>(
    session: MethodSessionState<TBeforeState, TFrozenSource, TPreview>,
    settings: Partial<DeConfettiSettings> | null | undefined
): MethodSessionTransition<TBeforeState, TFrozenSource, TPreview> {
    const selectedDeConfetti = resolveDeConfettiByPaletteContext({
        [session.frozenPaletteContext]: {
            ...session.selectedDeConfetti,
            ...(settings ?? {}),
        },
    })[session.frozenPaletteContext]

    return requestMethodSessionPreview({
        ...session,
        selectedDeConfetti: cloneDeConfettiSettings(selectedDeConfetti),
    })
}

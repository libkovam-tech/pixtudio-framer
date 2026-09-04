import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
    acceptClipboardPaletteDetectedCandidate,
    CLIPBOARD_PALETTE_CANDIDATE,
    ClipboardPaletteDiagnostics,
    ClipboardPalettePrompt,
    ClipboardPaletteCandidateMount,
    createClipboardPaletteCandidateDetectionSession,
    createClipboardPaletteCandidateLifecycle,
    detectClipboardPaletteCandidate,
    dismissClipboardPaletteDetectedCandidate,
    getClipboardPaletteReadCapability,
    isAndroidChromiumClipboardPaletteBrowser,
    isChromiumClipboardPaletteBrowser,
    makeClipboardPaletteDisplayName,
    makeClipboardPaletteFingerprint,
    shouldMountClipboardPaletteCandidate,
    shouldResetAndroidClipboardPaletteSuppressionOnTabHidden,
} from "./clipboardPaletteCandidate.tsx"

class FakeEventTarget {
    listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
    addEventListener = vi.fn(
        (type: string, listener: EventListenerOrEventListenerObject) => {
            const listeners = this.listeners.get(type) ?? new Set()
            listeners.add(listener)
            this.listeners.set(type, listeners)
        }
    )
    removeEventListener = vi.fn(
        (type: string, listener: EventListenerOrEventListenerObject) => {
            this.listeners.get(type)?.delete(listener)
        }
    )

    dispatch(type: string) {
        for (const listener of this.listeners.get(type) ?? []) {
            if (typeof listener === "function") {
                listener(new Event(type))
            } else {
                listener.handleEvent(new Event(type))
            }
        }
    }
}

class FakeDocumentEventTarget extends FakeEventTarget {
    visibilityState: DocumentVisibilityState = "visible"
}

function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((next) => {
        resolve = next
    })
    return { promise, resolve }
}

function makeBlob(bytes: number[], type = "image/png") {
    return new Blob([new Uint8Array(bytes)], { type })
}

function makeClipboardItem(
    typeToBlob: Record<string, Blob>
) {
    return {
        types: Object.keys(typeToBlob),
        getType: vi.fn(async (type: string) => typeToBlob[type]),
    }
}

describe("clipboard palette candidate", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("keeps the candidate unmounted when the feature flag is off", () => {
        const clipboardRead = vi.fn()
        const addEventListener = vi.fn()
        const removeEventListener = vi.fn()
        const onImportPalette = vi.fn()

        vi.stubGlobal("navigator", {
            clipboard: {
                read: clipboardRead,
            },
        })
        vi.stubGlobal("window", {
            addEventListener,
            removeEventListener,
        })

        const markup = renderToStaticMarkup(
            <ClipboardPaletteCandidateMount
                featureFlag={false}
                isEligible={true}
                onImportPalette={onImportPalette}
            />
        )

        expect(CLIPBOARD_PALETTE_CANDIDATE).toBe(true)
        expect(shouldMountClipboardPaletteCandidate(false)).toBe(false)
        expect(markup).toBe("")
        expect(clipboardRead).not.toHaveBeenCalled()
        expect(addEventListener).not.toHaveBeenCalled()
        expect(removeEventListener).not.toHaveBeenCalled()
        expect(onImportPalette).not.toHaveBeenCalled()
    })

    it("registers lifecycle listeners only when the candidate lifecycle exists", () => {
        const windowTarget = new FakeEventTarget()
        const documentTarget = new FakeDocumentEventTarget()
        const inspectClipboard = vi.fn()

        const lifecycle = createClipboardPaletteCandidateLifecycle({
            isEligible: () => false,
            inspectClipboard,
            windowTarget,
            documentTarget,
        })

        expect(windowTarget.addEventListener).toHaveBeenCalledWith(
            "focus",
            expect.any(Function)
        )
        expect(documentTarget.addEventListener).toHaveBeenCalledWith(
            "visibilitychange",
            expect.any(Function)
        )

        windowTarget.dispatch("focus")
        expect(inspectClipboard).not.toHaveBeenCalled()

        lifecycle.dispose()
        expect(windowTarget.removeEventListener).toHaveBeenCalledWith(
            "focus",
            expect.any(Function)
        )
        expect(documentTarget.removeEventListener).toHaveBeenCalledWith(
            "visibilitychange",
            expect.any(Function)
        )
    })

    it("uses event-driven triggers without reading the clipboard directly", () => {
        let eligible = false
        const windowTarget = new FakeEventTarget()
        const documentTarget = new FakeDocumentEventTarget()
        const inspectClipboard = vi.fn()

        const lifecycle = createClipboardPaletteCandidateLifecycle({
            isEligible: () => eligible,
            inspectClipboard,
            windowTarget,
            documentTarget,
        })

        eligible = true
        lifecycle.updateEligibility(true)
        windowTarget.dispatch("focus")
        documentTarget.visibilityState = "hidden"
        documentTarget.dispatch("visibilitychange")
        documentTarget.visibilityState = "visible"
        documentTarget.dispatch("visibilitychange")

        expect(inspectClipboard.mock.calls.map(([reason]) => reason)).toEqual([
            "eligibility",
            "focus",
            "visibility",
        ])
        lifecycle.dispose()
    })

    it("notifies visibility hidden without reading the clipboard", () => {
        const documentTarget = new FakeDocumentEventTarget()
        const inspectClipboard = vi.fn()
        const onHidden = vi.fn()

        const lifecycle = createClipboardPaletteCandidateLifecycle({
            isEligible: () => true,
            inspectClipboard,
            onHidden,
            documentTarget,
        })

        documentTarget.visibilityState = "hidden"
        documentTarget.dispatch("visibilitychange")

        expect(onHidden).toHaveBeenCalledTimes(1)
        expect(inspectClipboard).not.toHaveBeenCalled()

        documentTarget.visibilityState = "visible"
        documentTarget.dispatch("visibilitychange")

        expect(inspectClipboard).toHaveBeenCalledWith("visibility")
        lifecycle.dispose()
    })

    it("drops overlapping triggers and does not catch up after inspection settles", async () => {
        let eligible = true
        const firstInspection = deferred()
        const windowTarget = new FakeEventTarget()
        const documentTarget = new FakeDocumentEventTarget()
        const inspectClipboard = vi.fn<() => Promise<void> | void>(
            () => firstInspection.promise
        )

        const lifecycle = createClipboardPaletteCandidateLifecycle({
            isEligible: () => eligible,
            inspectClipboard,
            windowTarget,
            documentTarget,
        })

        windowTarget.dispatch("focus")
        windowTarget.dispatch("focus")
        documentTarget.dispatch("visibilitychange")

        expect(inspectClipboard).toHaveBeenCalledTimes(1)
        expect(lifecycle.getSnapshot()).toEqual({
            inFlight: true,
            droppedTriggers: 2,
        })

        firstInspection.resolve()
        await firstInspection.promise
        await Promise.resolve()

        expect(inspectClipboard).toHaveBeenCalledTimes(1)
        expect(lifecycle.getSnapshot()).toEqual({
            inFlight: false,
            droppedTriggers: 2,
        })

        inspectClipboard.mockReturnValue(undefined)
        windowTarget.dispatch("focus")
        expect(inspectClipboard).toHaveBeenCalledTimes(2)

        eligible = false
        lifecycle.updateEligibility(false)
        windowTarget.dispatch("focus")
        expect(inspectClipboard).toHaveBeenCalledTimes(2)
        lifecycle.dispose()
    })

    it("exposes clipboard read capability only for supported secure focused Chromium environments", () => {
        const readClipboard = vi.fn()
        const chromiumBrands = [{ brand: "Chromium" }]
        const focusedDocument = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            hasFocus: () => true,
        }
        const blurredDocument = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            hasFocus: () => false,
        }

        expect(
            getClipboardPaletteReadCapability({
                browserBrands: chromiumBrands,
                isSecureContext: true,
                clipboardRead: readClipboard,
                documentTarget: focusedDocument,
            })
        ).toBe(readClipboard)
        expect(
            getClipboardPaletteReadCapability({
                browserBrands: chromiumBrands,
                isSecureContext: false,
                clipboardRead: readClipboard,
                documentTarget: focusedDocument,
            })
        ).toBeNull()
        expect(
            getClipboardPaletteReadCapability({
                browserBrands: chromiumBrands,
                isSecureContext: true,
                clipboardRead: readClipboard,
                documentTarget: blurredDocument,
            })
        ).toBeNull()
        expect(
            getClipboardPaletteReadCapability({
                browserBrands: chromiumBrands,
                isSecureContext: true,
                documentTarget: focusedDocument,
            })
        ).toBeNull()
        expect(
            getClipboardPaletteReadCapability({
                isSecureContext: true,
                clipboardRead: readClipboard,
                documentTarget: focusedDocument,
            })
        ).toBeNull()
    })

    it("treats Firefox and Safari as silent unsupported by design", () => {
        expect(
            isChromiumClipboardPaletteBrowser([
                { brand: "Firefox" },
            ])
        ).toBe(false)
        expect(
            isChromiumClipboardPaletteBrowser([{ brand: "Safari" }])
        ).toBe(false)
        expect(isChromiumClipboardPaletteBrowser(undefined)).toBe(false)
        expect(
            isChromiumClipboardPaletteBrowser([
                { brand: "Chromium" },
                { brand: "Google Chrome" },
            ])
        ).toBe(true)
        expect(
            isChromiumClipboardPaletteBrowser([
                { brand: "Microsoft Edge" },
            ])
        ).toBe(true)
    })

    it("recognizes Android Chromium for temporary non-image diagnostics", () => {
        expect(
            isAndroidChromiumClipboardPaletteBrowser({
                browserBrands: [{ brand: "Chromium" }],
                userAgent:
                    "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/155.0 Mobile Safari/537.36",
            })
        ).toBe(true)
        expect(
            isAndroidChromiumClipboardPaletteBrowser({
                browserBrands: [{ brand: "Chromium" }],
                userAgent:
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0 Safari/537.36",
            })
        ).toBe(false)
        expect(
            isAndroidChromiumClipboardPaletteBrowser({
                browserBrands: [{ brand: "Safari" }],
                userAgent:
                    "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/155.0 Mobile Safari/537.36",
            })
        ).toBe(false)
    })

    it("gates Android tab-hidden suppression reset behind a reversible flag", () => {
        const androidChromiumEnvironment = {
            browserBrands: [{ brand: "Chromium" }],
            userAgent:
                "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/155.0 Mobile Safari/537.36",
        }
        const desktopChromiumEnvironment = {
            browserBrands: [{ brand: "Chromium" }],
            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0 Safari/537.36",
        }

        expect(
            shouldResetAndroidClipboardPaletteSuppressionOnTabHidden(
                androidChromiumEnvironment,
                true
            )
        ).toBe(true)
        expect(
            shouldResetAndroidClipboardPaletteSuppressionOnTabHidden(
                androidChromiumEnvironment,
                false
            )
        ).toBe(false)
        expect(
            shouldResetAndroidClipboardPaletteSuppressionOnTabHidden(
                desktopChromiumEnvironment,
                true
            )
        ).toBe(false)
    })

    it("detects image-like clipboard items without retaining the Blob", async () => {
        const imageBlob = makeBlob([1, 2, 3, 4])
        const imageItem = makeClipboardItem({
            "text/plain": makeBlob([9], "text/plain"),
            "image/png": imageBlob,
        })
        const readClipboard = vi.fn(async () => [imageItem])

        const detection = await detectClipboardPaletteCandidate({
            readClipboard,
        })

        expect(readClipboard).toHaveBeenCalledOnce()
        expect(imageItem.getType).toHaveBeenCalledWith("image/png")
        expect(detection).toEqual({
            mimeType: "image/png",
            size: 4,
            fingerprint: "image/png;size=4;samples=01020304",
        })
        expect(detection).not.toHaveProperty("blob")
    })

    it("silently ignores unsupported or failing clipboard reads", async () => {
        const unsupported = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({
                    "text/plain": makeBlob([1], "text/plain"),
                }),
            ]),
        })
        const failedRead = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => {
                throw new Error("not allowed")
            }),
        })
        const failedBlobRead = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                {
                    types: ["image/png"],
                    getType: vi.fn(async () => {
                        throw new Error("blob unavailable")
                    }),
                },
            ]),
        })

        expect(unsupported).toBeNull()
        expect(failedRead).toBeNull()
        expect(failedBlobRead).toBeNull()
    })

    it("diagnoses Android non-image clipboard payloads without accepting them", async () => {
        const diagnostics: string[] = []
        const result = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({
                    "text/plain": new Blob(
                        ["content://media/external/images/media/42"],
                        { type: "text/plain" }
                    ),
                }),
            ]),
            inspectNonImagePayload: true,
            onDiagnostic: (item) => {
                diagnostics.push(
                    item.details ? `${item.label}: ${item.details}` : item.label
                )
            },
        })

        expect(result).toBeNull()
        expect(diagnostics).toContain("non-image:type: text/plain")
        expect(diagnostics).toContain("non-image:blob: text/plain 40b")
        expect(diagnostics).toContain(
            "non-image:text: markers=content:// preview=content://media/external/images/media/42"
        )
    })

    it("uses sampled bytes so same MIME and size can still detect different content", async () => {
        const first = await makeClipboardPaletteFingerprint({
            blob: makeBlob([1, 2, 3, 4, 5, 6]),
            mimeType: "image/png",
            sampleSize: 2,
        })
        const second = await makeClipboardPaletteFingerprint({
            blob: makeBlob([1, 2, 9, 9, 5, 6]),
            mimeType: "image/png",
            sampleSize: 2,
        })

        expect(first).toBe("image/png;size=6;samples=0102.0304.0506")
        expect(second).toBe("image/png;size=6;samples=0102.0909.0506")
        expect(first).not.toBe(second)
    })

    it("suppresses already handled clipboard fingerprints for the session", async () => {
        const blob = makeBlob([1, 2, 3, 4])
        const session = createClipboardPaletteCandidateDetectionSession()
        const first = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": blob }),
            ]),
            session,
        })

        expect(first).not.toBeNull()
        if (!first) return
        session.markHandled(first.fingerprint)

        const second = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": blob }),
            ]),
            session,
        })

        expect(second).toBeNull()
    })

    it("can reset handled clipboard fingerprints for a new Android tab visit", async () => {
        const blob = makeBlob([1, 2, 3, 4])
        const session = createClipboardPaletteCandidateDetectionSession()
        const first = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": blob }),
            ]),
            session,
        })

        expect(first).not.toBeNull()
        if (!first) return
        session.markHandled(first.fingerprint)

        const suppressed = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": blob }),
            ]),
            session,
        })

        expect(suppressed).toBeNull()
        session.reset()

        const afterReset = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": blob }),
            ]),
            session,
        })

        expect(afterReset).toEqual(first)
    })

    it("renders the clipboard palette prompt with Yes and No icon buttons", () => {
        const markup = renderToStaticMarkup(
            <ClipboardPalettePrompt
                onAccept={vi.fn()}
                onDismiss={vi.fn()}
            />
        )

        expect(markup).toContain("LOAD PALETTE FROM CLIPBOARD?")
        expect(markup).toContain('aria-label="Clipboard prompt backing"')
        expect(markup).toContain('aria-label="Yes"')
        expect(markup).toContain('aria-label="No"')
        expect(markup.indexOf('aria-label="No"')).toBeLessThan(
            markup.indexOf('aria-label="Yes"')
        )
        expect(markup).toContain('fill="#04E762"')
        expect(markup).toContain('fill="#D80032"')
    })

    it("matches prompt message font size to the Palette Presets tab", () => {
        const desktopMarkup = renderToStaticMarkup(
            <ClipboardPalettePrompt
                isMobileUI={false}
                onAccept={vi.fn()}
                onDismiss={vi.fn()}
            />
        )
        const mobileMarkup = renderToStaticMarkup(
            <ClipboardPalettePrompt
                isMobileUI={true}
                onAccept={vi.fn()}
                onDismiss={vi.fn()}
            />
        )

        expect(desktopMarkup).toContain("font-size:20px")
        expect(mobileMarkup).toContain("font-size:13px")
    })

    it("keeps clipboard palette diagnostics out of the UI", () => {
        const markup = renderToStaticMarkup(
            <ClipboardPaletteDiagnostics
                diagnostics={[
                    { label: "env", details: "secure=true read=true" },
                    { label: "blob", details: "image/png 123b" },
                ]}
            />
        )

        expect(markup).toBe("")
    })

    it("marks a rejected detected candidate handled without importing", async () => {
        const blob = makeBlob([1, 2, 3, 4])
        const session = createClipboardPaletteCandidateDetectionSession()
        const onImportPalette = vi.fn()
        const candidate = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": blob }),
            ]),
            session,
        })

        const nextCandidate = dismissClipboardPaletteDetectedCandidate({
            candidate,
            session,
        })
        const repeated = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": blob }),
            ]),
            session,
        })

        expect(nextCandidate).toBeNull()
        expect(repeated).toBeNull()
        expect(onImportPalette).not.toHaveBeenCalled()
    })

    it("builds a fresh clipboard import request on Yes", async () => {
        const session = createClipboardPaletteCandidateDetectionSession()
        const candidate = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": makeBlob([1, 2, 3, 4]) }),
            ]),
            session,
        })

        const request = await acceptClipboardPaletteDetectedCandidate({
            candidate,
            session,
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": makeBlob([5, 6, 7, 8]) }),
            ]),
            now: new Date(2026, 8, 2),
            onDiagnostic: vi.fn(),
        })

        expect(request).not.toBeNull()
        if (!request) return
        expect(request.file).toBeInstanceOf(File)
        expect(request.file.name).toBe("clipboard-image.png")
        expect(request.file.type).toBe("image/png")
        expect(request.file.size).toBe(4)
        expect(request.displayName).toBe("Clipboard image_2026-09-02")
    })

    it("handles detection-time state on Yes even when fresh read fails", async () => {
        const blob = makeBlob([1, 2, 3, 4])
        const session = createClipboardPaletteCandidateDetectionSession()
        const candidate = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": blob }),
            ]),
            session,
        })

        const request = await acceptClipboardPaletteDetectedCandidate({
            candidate,
            session,
            readClipboard: vi.fn(async () => {
                throw new Error("not allowed")
            }),
        })
        const repeated = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": blob }),
            ]),
            session,
        })

        expect(request).toBeNull()
        expect(repeated).toBeNull()
    })

    it("imports fresh clipboard state when clipboard changes before Yes", async () => {
        const session = createClipboardPaletteCandidateDetectionSession()
        const candidate = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({ "image/png": makeBlob([1, 2, 3, 4]) }),
            ]),
            session,
        })

        const request = await acceptClipboardPaletteDetectedCandidate({
            candidate,
            session,
            readClipboard: vi.fn(async () => [
                makeClipboardItem({
                    "image/png": makeBlob([9, 8, 7, 6]),
                }),
            ]),
            now: new Date(2026, 8, 2),
        })
        const bytes = request
            ? [...new Uint8Array(await request.file.arrayBuffer())]
            : []

        expect(bytes).toEqual([9, 8, 7, 6])
    })

    it("keeps the clipboard display label out of the synthetic filename", async () => {
        const session = createClipboardPaletteCandidateDetectionSession()
        const candidate = await detectClipboardPaletteCandidate({
            readClipboard: vi.fn(async () => [
                makeClipboardItem({
                    "image/jpeg": makeBlob([1, 2, 3, 4], "image/jpeg"),
                }),
            ]),
            session,
        })

        const request = await acceptClipboardPaletteDetectedCandidate({
            candidate,
            session,
            readClipboard: vi.fn(async () => [
                makeClipboardItem({
                    "image/jpeg": makeBlob([5, 6, 7, 8], "image/jpeg"),
                }),
            ]),
            now: new Date(2026, 8, 2),
        })

        expect(request?.displayName).toBe("Clipboard image_2026-09-02")
        expect(request?.file.name).toBe("clipboard-image.jpg")
        expect(request?.file.name).not.toContain("Clipboard image")
    })

    it("formats the clipboard label from the local date", () => {
        expect(makeClipboardPaletteDisplayName(new Date(2026, 0, 9))).toBe(
            "Clipboard image_2026-01-09"
        )
    })
})

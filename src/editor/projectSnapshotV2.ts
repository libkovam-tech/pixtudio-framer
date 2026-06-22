import type { SmartReferenceAdjustments } from "./SmartReferenceEditor.tsx"

export const PROJECT_SNAPSHOT_V2_MAGIC = "PIXTUDIO" as const
export const PROJECT_SNAPSHOT_V2_VERSION = 2 as const
export const PROJECT_SNAPSHOT_V2_SMART_REFERENCE_VERSION = 1 as const
export const PROJECT_SNAPSHOT_V2_PALETTE_MIN = 2
export const PROJECT_SNAPSHOT_V2_PALETTE_MAX = 32
export const V2_CELL_NULL = -1 as const
export const V2_CELL_TRANSPARENT = -2 as const

export const PROJECT_SNAPSHOT_V2_REQUIRED_ROOT_KEYS = [
    "magic",
    "version",
    "gridSize",
    "palette",
    "paletteCount",
    "importLayer",
    "strokeLayer",
    "ref",
] as const

export const PROJECT_SNAPSHOT_V2_OPTIONAL_ROOT_KEYS = [
    "autoOverrides",
    "smartObjectState",
    "quantizationProfile",
] as const

export type ImportCellV2 = typeof V2_CELL_NULL | typeof V2_CELL_TRANSPARENT | number
export type StrokeSwatchIndexV2 = typeof V2_CELL_TRANSPARENT | number

export type AutoSwatchOverrideV2 = {
    hex?: string
    isTransparent?: boolean
}

export type AutoSwatchOverridesMapV2 = Record<string, AutoSwatchOverrideV2>

export type ProjectSnapshotV2 = {
    magic: typeof PROJECT_SNAPSHOT_V2_MAGIC
    version: typeof PROJECT_SNAPSHOT_V2_VERSION
    gridSize: number
    palette: {
        swatches: Array<{
            index: number
            id: string
            hex: string
            isUser: boolean
        }>
    }
    paletteCount?: number
    quantizationProfile?:
        | { kind: "extract" }
        | {
              kind: "fixed"
              source: "builtin"
              id: string
              name: string
          }
        | {
              kind: "fixed"
              source: "imported"
              id: string
              name: string
              colors: string[]
          }
    smartObjectState?: {
        version: typeof PROJECT_SNAPSHOT_V2_SMART_REFERENCE_VERSION
        adjustments: SmartReferenceAdjustments
    }
    autoOverrides?: AutoSwatchOverridesMapV2
    importLayer: {
        cells: ImportCellV2[]
    }
    strokeLayer: {
        cells: Array<{
            cellIndex: number
            swatchIndex: StrokeSwatchIndexV2
        }>
    }
    ref: null | {
        w: 512
        h: 512
        ext: "rgba8"
        b64: string
    }
}

export type ValidatedSnapshotV2 = ProjectSnapshotV2
export type ProjectSnapshotV2BuildInput = Omit<
    ProjectSnapshotV2,
    "magic" | "version"
>
export type ProjectSnapshotV2QuantizationProfileInput = NonNullable<
    ProjectSnapshotV2["quantizationProfile"]
>
export type ProjectSnapshotV2ResolvedQuantizationProfile =
    | { kind: "extract" }
    | {
          kind: "fixed"
          id: string
          name: string
          source: "builtin" | "imported"
          colors: string[]
      }
export type ProjectSnapshotV2RuntimeSwatch = {
    id: string
    color: string
    isTransparent: false
    isUser: boolean
}
export type ProjectSnapshotV2RuntimePixel<TTransparent> =
    | string
    | null
    | TTransparent
export type ProjectSnapshotV2RuntimeLayers<TTransparent> = {
    gridSize: number
    paletteOrderIds: string[]
    allSwatches: ProjectSnapshotV2RuntimeSwatch[]
    autoSwatches: ProjectSnapshotV2RuntimeSwatch[]
    userSwatches: ProjectSnapshotV2RuntimeSwatch[]
    paletteCount: number
    imagePixels: ProjectSnapshotV2RuntimePixel<TTransparent>[][]
    overlayPixels: ProjectSnapshotV2RuntimePixel<TTransparent>[][]
    selectedSwatch: string | "transparent"
    autoOverrides: AutoSwatchOverridesMapV2
}

export type LoadGateErrorCode =
    | "E_READ"
    | "E_JSON_PARSE"
    | "E_ROOT_KEYS"
    | "E_MAGIC"
    | "E_VERSION"
    | "E_GRID"
    | "E_PALETTE"
    | "E_IMPORT_LAYER"
    | "E_STROKE_LAYER"
    | "E_REF"

export type LoadGateError = {
    code: LoadGateErrorCode
    message: string
}

export type ProjectSnapshotV2ParseResult =
    | {
          ok: true
          snapshot: ValidatedSnapshotV2
          canonical: ProjectSnapshotV2
      }
    | {
          ok: false
          error: LoadGateError
      }

export function makeLoadGateError(
    code: LoadGateErrorCode,
    message: string
): LoadGateError {
    return { code, message }
}

function clampInt(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n))
}

function createRuntimePixelGrid<TTransparent>(
    size: number
): ProjectSnapshotV2RuntimePixel<TTransparent>[][] {
    return Array.from({ length: size }, () =>
        Array.from(
            { length: size },
            () => null as ProjectSnapshotV2RuntimePixel<TTransparent>
        )
    )
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x)
}

function assertExactKeys(
    obj: Record<string, unknown>,
    allowed: string[],
    code: LoadGateErrorCode,
    where: string
) {
    const keys = Object.keys(obj)
    if (keys.length !== allowed.length) {
        throw makeLoadGateError(code, `${where}: keys length mismatch`)
    }
    for (const k of keys) {
        if (!allowed.includes(k)) {
            throw makeLoadGateError(code, `${where}: unexpected key "${k}"`)
        }
    }
    for (const k of allowed) {
        if (!(k in obj)) {
            throw makeLoadGateError(code, `${where}: missing key "${k}"`)
        }
    }
}

function encodeRootKeys(keys: readonly string[]) {
    return [...keys].sort().join("|")
}

function buildAllowedRootKeySets(
    required: readonly string[],
    optional: readonly string[]
) {
    const out = new Set<string>()
    const count = 1 << optional.length
    for (let mask = 0; mask < count; mask++) {
        const keys = [...required]
        for (let i = 0; i < optional.length; i++) {
            if (mask & (1 << i)) keys.push(optional[i])
        }
        out.add(encodeRootKeys(keys))
    }
    return out
}

const PROJECT_SNAPSHOT_V2_ALLOWED_ROOT_KEY_SETS = buildAllowedRootKeySets(
    PROJECT_SNAPSHOT_V2_REQUIRED_ROOT_KEYS,
    PROJECT_SNAPSHOT_V2_OPTIONAL_ROOT_KEYS
)

function isInt(n: unknown) {
    return Number.isInteger(n)
}

function assertIntInRange(
    n: unknown,
    min: number,
    max: number,
    code: LoadGateErrorCode,
    where: string
) {
    if (!isInt(n)) throw makeLoadGateError(code, `${where}: not integer`)
    if ((n as number) < min || (n as number) > max) {
        throw makeLoadGateError(code, `${where}: out of range`)
    }
}

function assertFiniteNumberInRange(
    n: unknown,
    min: number,
    max: number,
    code: LoadGateErrorCode,
    where: string
) {
    if (typeof n !== "number" || !Number.isFinite(n)) {
        throw makeLoadGateError(code, `${where}: not finite number`)
    }
    if (n < min || n > max) {
        throw makeLoadGateError(code, `${where}: out of range`)
    }
}

function assertString(
    n: unknown,
    code: LoadGateErrorCode,
    where: string
): asserts n is string {
    if (typeof n !== "string") {
        throw makeLoadGateError(code, `${where}: not string`)
    }
}

function assertBool(
    n: unknown,
    code: LoadGateErrorCode,
    where: string
): asserts n is boolean {
    if (typeof n !== "boolean") {
        throw makeLoadGateError(code, `${where}: not boolean`)
    }
}

function base64DecodedLenOrThrow(
    b64: string,
    code: LoadGateErrorCode,
    where: string
): number {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
        throw makeLoadGateError(code, `${where}: invalid base64 charset`)
    }
    if (b64.length === 0) return 0
    if (b64.length % 4 !== 0) {
        throw makeLoadGateError(code, `${where}: base64 length not multiple of 4`)
    }
    const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0
    return (b64.length / 4) * 3 - pad
}

export function encodeProjectSnapshotBytesBase64(bytes: Uint8ClampedArray) {
    let bin = ""
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
        const sub = bytes.subarray(i, i + chunk)
        let s = ""
        for (let j = 0; j < sub.length; j++) {
            s += String.fromCharCode(sub[j])
        }
        bin += s
    }
    return btoa(bin)
}

export function decodeProjectSnapshotBytesBase64(
    b64: string
): Uint8ClampedArray<ArrayBuffer> {
    const bin = atob(b64)
    const out = new Uint8ClampedArray(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

export function decodeProjectSnapshotRefBytes(
    ref: ProjectSnapshotV2["ref"]
): Uint8ClampedArray<ArrayBuffer> | null {
    if (!ref) return null
    return decodeProjectSnapshotBytesBase64(ref.b64)
}

export function serializeQuantizationProfileForSnapshot(
    profile: ProjectSnapshotV2QuantizationProfileInput | undefined,
    normalizeColor: (color: string) => string = (color) => color.toUpperCase()
): ProjectSnapshotV2["quantizationProfile"] | undefined {
    if (!profile || profile.kind === "extract") {
        return undefined
    }

    if (profile.source === "builtin") {
        return {
            kind: "fixed",
            source: "builtin",
            id: profile.id,
            name: profile.name,
        }
    }

    return {
        kind: "fixed",
        source: "imported",
        id: profile.id,
        name: profile.name,
        colors: profile.colors.map((color) => normalizeColor(color)),
    }
}

export function resolveProjectSnapshotV2QuantizationProfile(
    snapshot: Pick<ValidatedSnapshotV2, "quantizationProfile">,
    options: {
        fallback: ProjectSnapshotV2ResolvedQuantizationProfile
        resolveBuiltin: (
            id: string
        ) => ProjectSnapshotV2ResolvedQuantizationProfile | undefined
    }
): ProjectSnapshotV2ResolvedQuantizationProfile {
    const saved = snapshot.quantizationProfile
    if (!saved || saved.kind === "extract") {
        return options.fallback
    }

    if (saved.source === "builtin") {
        return options.resolveBuiltin(saved.id) ?? options.fallback
    }

    return {
        kind: "fixed",
        source: "imported",
        id: saved.id,
        name: saved.name,
        colors: saved.colors,
    }
}

export function buildProjectSnapshotV2RuntimeLayers<TTransparent>(
    snapshot: ValidatedSnapshotV2,
    options: {
        transparentPixel: TTransparent
        paletteMin?: number
        paletteMax?: number
    }
): ProjectSnapshotV2RuntimeLayers<TTransparent> {
    const gridSize = snapshot.gridSize
    const cellsN = gridSize * gridSize
    const paletteMin = options.paletteMin ?? PROJECT_SNAPSHOT_V2_PALETTE_MIN
    const paletteMax = options.paletteMax ?? PROJECT_SNAPSHOT_V2_PALETTE_MAX

    const paletteOrderIds = snapshot.palette.swatches.map((s) => s.id)
    const allSwatches: ProjectSnapshotV2RuntimeSwatch[] =
        snapshot.palette.swatches.map((s) => ({
            id: s.id,
            color: s.hex,
            isTransparent: false,
            isUser: !!s.isUser,
        }))
    const autoSwatches = allSwatches.filter((s) => !s.isUser)
    const userSwatches = allSwatches.filter((s) => s.isUser)

    const paletteCount =
        typeof snapshot.paletteCount === "number"
            ? clampInt(snapshot.paletteCount, paletteMin, paletteMax)
            : clampInt(allSwatches.length || paletteMin, paletteMin, paletteMax)

    const idxToPixelValue = (
        cell: ImportCellV2 | StrokeSwatchIndexV2
    ): ProjectSnapshotV2RuntimePixel<TTransparent> => {
        if (cell === V2_CELL_NULL) return null
        if (cell === V2_CELL_TRANSPARENT) return options.transparentPixel
        if (cell < 0) return null
        const sw = snapshot.palette.swatches[cell]
        return sw ? sw.id : null
    }

    const imagePixels = createRuntimePixelGrid<TTransparent>(gridSize)
    const importCells = snapshot.importLayer.cells
    for (let i = 0; i < cellsN; i++) {
        const r = Math.floor(i / gridSize)
        const c = i - r * gridSize
        imagePixels[r][c] = idxToPixelValue(importCells[i])
    }

    const overlayPixels = createRuntimePixelGrid<TTransparent>(gridSize)
    for (const cell of snapshot.strokeLayer.cells) {
        const r = Math.floor(cell.cellIndex / gridSize)
        const c = cell.cellIndex - r * gridSize
        if (r < 0 || c < 0 || r >= gridSize || c >= gridSize) continue
        overlayPixels[r][c] = idxToPixelValue(cell.swatchIndex)
    }

    return {
        gridSize,
        paletteOrderIds,
        allSwatches,
        autoSwatches,
        userSwatches,
        paletteCount,
        imagePixels,
        overlayPixels,
        selectedSwatch: allSwatches[0]?.id ?? "transparent",
        autoOverrides: snapshot.autoOverrides ?? {},
    }
}

export function createProjectSnapshotV2(
    input: ProjectSnapshotV2BuildInput
): ProjectSnapshotV2 {
    return canonicalizeSnapshotV2({
        magic: PROJECT_SNAPSHOT_V2_MAGIC,
        version: PROJECT_SNAPSHOT_V2_VERSION,
        ...input,
    })
}

export function canonicalizeSnapshotV2(
    s: ProjectSnapshotV2
): ProjectSnapshotV2 {
    const sw = [...s.palette.swatches].sort((a, b) => a.index - b.index)
    const st = [...s.strokeLayer.cells].sort((a, b) => {
        if (a.cellIndex !== b.cellIndex) return a.cellIndex - b.cellIndex
        return a.swatchIndex - b.swatchIndex
    })

    let autoOverridesCanon: AutoSwatchOverridesMapV2 | undefined
    if (s.autoOverrides && Object.keys(s.autoOverrides).length > 0) {
        const keys = Object.keys(s.autoOverrides).sort()
        const out: AutoSwatchOverridesMapV2 = {}
        for (const k of keys) out[k] = s.autoOverrides[k]
        autoOverridesCanon = out
    }

    const smartObjectStateCanon = s.smartObjectState
        ? {
              version: PROJECT_SNAPSHOT_V2_SMART_REFERENCE_VERSION,
              adjustments: {
                  exposure: s.smartObjectState.adjustments.exposure,
                  whiteBalance: s.smartObjectState.adjustments.whiteBalance,
                  contrast: s.smartObjectState.adjustments.contrast,
                  saturation: s.smartObjectState.adjustments.saturation,
                  shadows: s.smartObjectState.adjustments.shadows,
                  midtones: s.smartObjectState.adjustments.midtones,
                  highlights: s.smartObjectState.adjustments.highlights,
              },
          }
        : undefined

    const canonical: ProjectSnapshotV2 = {
        magic: PROJECT_SNAPSHOT_V2_MAGIC,
        version: PROJECT_SNAPSHOT_V2_VERSION,
        gridSize: s.gridSize,
        palette: {
            swatches: sw.map((x, i) => ({
                index: i,
                id: x.id,
                hex: x.hex,
                isUser: !!x.isUser,
            })),
        },
        importLayer: { cells: [...s.importLayer.cells] },
        strokeLayer: {
            cells: st.map((c) => ({
                cellIndex: c.cellIndex,
                swatchIndex: c.swatchIndex,
            })),
        },
        ref: s.ref ? { w: 512, h: 512, ext: "rgba8", b64: s.ref.b64 } : null,
    }

    if (typeof s.paletteCount === "number") {
        canonical.paletteCount = clampInt(
            s.paletteCount,
            PROJECT_SNAPSHOT_V2_PALETTE_MIN,
            PROJECT_SNAPSHOT_V2_PALETTE_MAX
        )
    }
    if (smartObjectStateCanon) {
        canonical.smartObjectState = smartObjectStateCanon
    }
    if (autoOverridesCanon) {
        canonical.autoOverrides = autoOverridesCanon
    }
    if (s.quantizationProfile) {
        if (s.quantizationProfile.kind === "extract") {
            canonical.quantizationProfile = { kind: "extract" }
        } else if (s.quantizationProfile.source === "builtin") {
            canonical.quantizationProfile = {
                kind: "fixed",
                source: "builtin",
                id: s.quantizationProfile.id,
                name: s.quantizationProfile.name,
            }
        } else {
            canonical.quantizationProfile = {
                kind: "fixed",
                source: "imported",
                id: s.quantizationProfile.id,
                name: s.quantizationProfile.name,
                colors: [...s.quantizationProfile.colors],
            }
        }
    }

    return canonical
}

export function validateProjectSnapshotV2OrThrow(
    raw: unknown
): ValidatedSnapshotV2 {
    if (!isPlainObject(raw)) {
        throw makeLoadGateError("E_ROOT_KEYS", "root: not an object")
    }

    const keys = encodeRootKeys(Object.keys(raw))

    if (!PROJECT_SNAPSHOT_V2_ALLOWED_ROOT_KEY_SETS.has(keys)) {
        throw makeLoadGateError("E_ROOT_KEYS", "root: unexpected keys")
    }

    if (!("paletteCount" in raw)) {
        throw makeLoadGateError("E_PALETTE", "paletteCount: missing")
    }
    assertIntInRange(
        raw.paletteCount,
        PROJECT_SNAPSHOT_V2_PALETTE_MIN,
        PROJECT_SNAPSHOT_V2_PALETTE_MAX,
        "E_PALETTE",
        "paletteCount"
    )

    if ("autoOverrides" in raw) {
        const ao = raw.autoOverrides
        if (!isPlainObject(ao)) {
            throw makeLoadGateError("E_ROOT_KEYS", "autoOverrides: not object")
        }

        for (const k of Object.keys(ao)) {
            if (!/^auto-\d+$/.test(k)) {
                throw makeLoadGateError(
                    "E_ROOT_KEYS",
                    `autoOverrides: invalid key "${k}"`
                )
            }

            const v = ao[k]
            if (!isPlainObject(v)) {
                throw makeLoadGateError(
                    "E_ROOT_KEYS",
                    `autoOverrides["${k}"]: not object`
                )
            }

            for (const kk of Object.keys(v)) {
                if (kk !== "hex" && kk !== "isTransparent") {
                    throw makeLoadGateError(
                        "E_ROOT_KEYS",
                        `autoOverrides["${k}"]: unexpected key "${kk}"`
                    )
                }
            }

            if ("hex" in v) {
                const overrideHex = v.hex
                assertString(overrideHex, "E_ROOT_KEYS", `autoOverrides["${k}"].hex`)
                if (!/^#[0-9A-F]{6}$/.test(overrideHex.toUpperCase())) {
                    throw makeLoadGateError(
                        "E_ROOT_KEYS",
                        `autoOverrides["${k}"].hex invalid`
                    )
                }
            }

            if ("isTransparent" in v) {
                assertBool(
                    v.isTransparent,
                    "E_ROOT_KEYS",
                    `autoOverrides["${k}"].isTransparent`
                )
            }

            if (!("hex" in v) && !("isTransparent" in v)) {
                throw makeLoadGateError("E_ROOT_KEYS", `autoOverrides["${k}"] empty`)
            }
        }
    }

    if ("quantizationProfile" in raw) {
        const qp = raw.quantizationProfile
        if (!isPlainObject(qp)) {
            throw makeLoadGateError(
                "E_PALETTE",
                "quantizationProfile: not object"
            )
        }
        if (qp.kind === "extract") {
            assertExactKeys(qp, ["kind"], "E_PALETTE", "quantizationProfile")
        } else if (qp.kind === "fixed") {
            assertString(qp.source, "E_PALETTE", "quantizationProfile.source")
            assertString(qp.id, "E_PALETTE", "quantizationProfile.id")
            assertString(qp.name, "E_PALETTE", "quantizationProfile.name")
            if (qp.source === "builtin") {
                assertExactKeys(
                    qp,
                    ["kind", "source", "id", "name"],
                    "E_PALETTE",
                    "quantizationProfile"
                )
            } else if (qp.source === "imported") {
                assertExactKeys(
                    qp,
                    ["kind", "source", "id", "name", "colors"],
                    "E_PALETTE",
                    "quantizationProfile"
                )
                if (!Array.isArray(qp.colors)) {
                    throw makeLoadGateError(
                        "E_PALETTE",
                        "quantizationProfile.colors: not array"
                    )
                }
                if (qp.colors.length <= 0 || qp.colors.length > 256) {
                    throw makeLoadGateError(
                        "E_PALETTE",
                        "quantizationProfile.colors: invalid length"
                    )
                }
                for (let i = 0; i < qp.colors.length; i++) {
                    const color = qp.colors[i]
                    assertString(
                        color,
                        "E_PALETTE",
                        `quantizationProfile.colors[${i}]`
                    )
                    if (!/^#[0-9A-F]{6}$/.test(color)) {
                        throw makeLoadGateError(
                            "E_PALETTE",
                            `quantizationProfile.colors[${i}]: invalid hex`
                        )
                    }
                }
            } else {
                throw makeLoadGateError(
                    "E_PALETTE",
                    "quantizationProfile.source: invalid"
                )
            }
        } else {
            throw makeLoadGateError(
                "E_PALETTE",
                "quantizationProfile.kind: invalid"
            )
        }
    }

    if ("smartObjectState" in raw) {
        const so = raw.smartObjectState
        if (!isPlainObject(so)) {
            throw makeLoadGateError("E_ROOT_KEYS", "smartObjectState: not object")
        }
        assertExactKeys(so, ["version", "adjustments"], "E_ROOT_KEYS", "smartObjectState")

        if (so.version !== PROJECT_SNAPSHOT_V2_SMART_REFERENCE_VERSION) {
            throw makeLoadGateError(
                "E_ROOT_KEYS",
                "smartObjectState.version: not supported"
            )
        }

        const adj = so.adjustments
        if (!isPlainObject(adj)) {
            throw makeLoadGateError(
                "E_ROOT_KEYS",
                "smartObjectState.adjustments: not object"
            )
        }

        assertExactKeys(
            adj,
            [
                "exposure",
                "whiteBalance",
                "contrast",
                "saturation",
                "shadows",
                "midtones",
                "highlights",
            ],
            "E_ROOT_KEYS",
            "smartObjectState.adjustments"
        )

        assertFiniteNumberInRange(adj.exposure, -100, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.exposure")
        assertFiniteNumberInRange(adj.whiteBalance, 0, 1, "E_ROOT_KEYS", "smartObjectState.adjustments.whiteBalance")
        assertFiniteNumberInRange(adj.contrast, -100, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.contrast")
        assertFiniteNumberInRange(adj.saturation, -100, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.saturation")
        assertFiniteNumberInRange(adj.shadows, -100, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.shadows")
        assertFiniteNumberInRange(adj.midtones, -100, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.midtones")
        assertFiniteNumberInRange(adj.highlights, -100, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.highlights")
    }

    if ("smartObjectState" in raw && raw.ref === null) {
        throw makeLoadGateError(
            "E_REF",
            "ref: must not be null when smartObjectState is present"
        )
    }

    if (raw.magic !== PROJECT_SNAPSHOT_V2_MAGIC) {
        throw makeLoadGateError("E_MAGIC", "magic: not allowed")
    }
    if (raw.version !== PROJECT_SNAPSHOT_V2_VERSION) {
        throw makeLoadGateError("E_VERSION", "version: not allowed")
    }

    assertIntInRange(raw.gridSize, 2, 128, "E_GRID", "gridSize")
    const g = raw.gridSize as number
    const cellsN = g * g

    const pal = raw.palette
    if (!isPlainObject(pal)) {
        throw makeLoadGateError("E_PALETTE", "palette: not object")
    }
    assertExactKeys(pal, ["swatches"], "E_PALETTE", "palette")
    if (!Array.isArray(pal.swatches)) {
        throw makeLoadGateError("E_PALETTE", "palette.swatches: not array")
    }

    const swatches = pal.swatches
    if (swatches.length <= 0 || swatches.length > 256) {
        throw makeLoadGateError("E_PALETTE", "palette.swatches: invalid length")
    }

    const seenSwatchIds = new Set<string>()
    for (let i = 0; i < swatches.length; i++) {
        const sw = swatches[i]
        if (!isPlainObject(sw)) {
            throw makeLoadGateError("E_PALETTE", `swatches[${i}]: not object`)
        }
        assertExactKeys(sw, ["index", "id", "hex", "isUser"], "E_PALETTE", `swatches[${i}]`)

        if (sw.index !== i) {
            throw makeLoadGateError("E_PALETTE", `swatches[${i}].index mismatch`)
        }
        const swatchId = sw.id
        assertString(swatchId, "E_PALETTE", `swatches[${i}].id`)
        if (!swatchId) throw makeLoadGateError("E_PALETTE", `swatches[${i}].id empty`)
        if (seenSwatchIds.has(swatchId)) {
            throw makeLoadGateError("E_PALETTE", `swatches[${i}].id duplicate`)
        }
        seenSwatchIds.add(swatchId)

        const swatchHex = sw.hex
        assertString(swatchHex, "E_PALETTE", `swatches[${i}].hex`)
        if (!/^#[0-9A-F]{6}$/.test(swatchHex)) {
            throw makeLoadGateError("E_PALETTE", `swatches[${i}].hex invalid`)
        }
        assertBool(sw.isUser, "E_PALETTE", `swatches[${i}].isUser`)
    }

    const imp = raw.importLayer
    if (!isPlainObject(imp)) {
        throw makeLoadGateError("E_IMPORT_LAYER", "importLayer: not object")
    }
    assertExactKeys(imp, ["cells"], "E_IMPORT_LAYER", "importLayer")
    if (!Array.isArray(imp.cells)) {
        throw makeLoadGateError("E_IMPORT_LAYER", "importLayer.cells: not array")
    }
    if (imp.cells.length !== cellsN) {
        throw makeLoadGateError("E_IMPORT_LAYER", "importLayer.cells: length mismatch")
    }
    for (let i = 0; i < imp.cells.length; i++) {
        const v = imp.cells[i]
        if (!isInt(v)) {
            throw makeLoadGateError("E_IMPORT_LAYER", `importLayer.cells[${i}]: not int`)
        }
        if (v === V2_CELL_NULL || v === V2_CELL_TRANSPARENT) continue
        assertIntInRange(v, 0, swatches.length - 1, "E_IMPORT_LAYER", `importLayer.cells[${i}]`)
    }

    const st = raw.strokeLayer
    if (!isPlainObject(st)) {
        throw makeLoadGateError("E_STROKE_LAYER", "strokeLayer: not object")
    }
    assertExactKeys(st, ["cells"], "E_STROKE_LAYER", "strokeLayer")
    if (!Array.isArray(st.cells)) {
        throw makeLoadGateError("E_STROKE_LAYER", "strokeLayer.cells: not array")
    }
    if (st.cells.length > cellsN) {
        throw makeLoadGateError("E_STROKE_LAYER", "strokeLayer.cells: too large")
    }

    const seenStrokeCells = new Set<number>()
    for (let i = 0; i < st.cells.length; i++) {
        const cell = st.cells[i]
        if (!isPlainObject(cell)) {
            throw makeLoadGateError(
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}]: not object`
            )
        }
        assertExactKeys(
            cell,
            ["cellIndex", "swatchIndex"],
            "E_STROKE_LAYER",
            `strokeLayer.cells[${i}]`
        )
        assertIntInRange(
            cell.cellIndex,
            0,
            cellsN - 1,
            "E_STROKE_LAYER",
            `strokeLayer.cells[${i}].cellIndex`
        )

        const cellIndex = cell.cellIndex as number
        if (seenStrokeCells.has(cellIndex)) {
            throw makeLoadGateError(
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}].cellIndex duplicate`
            )
        }
        seenStrokeCells.add(cellIndex)

        const si = cell.swatchIndex
        if (!isInt(si)) {
            throw makeLoadGateError(
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}].swatchIndex: not int`
            )
        }
        if (si === V2_CELL_TRANSPARENT) continue
        assertIntInRange(
            si,
            0,
            swatches.length - 1,
            "E_STROKE_LAYER",
            `strokeLayer.cells[${i}].swatchIndex`
        )
    }

    const ref = raw.ref
    if (ref !== null) {
        if (!isPlainObject(ref)) {
            throw makeLoadGateError("E_REF", "ref: not null/object")
        }
        assertExactKeys(ref, ["w", "h", "ext", "b64"], "E_REF", "ref")
        if (ref.w !== 512 || ref.h !== 512) {
            throw makeLoadGateError("E_REF", "ref: invalid size")
        }
        if (ref.ext !== "rgba8") {
            throw makeLoadGateError("E_REF", "ref.ext: not allowed")
        }

        const refB64 = ref.b64
        assertString(refB64, "E_REF", "ref.b64")
        const expectedLen = 512 * 512 * 4
        const decodedLen = base64DecodedLenOrThrow(refB64, "E_REF", "ref.b64")
        if (decodedLen !== expectedLen) {
            throw makeLoadGateError("E_REF", "ref.b64: decoded length mismatch")
        }
    }

    return raw as ValidatedSnapshotV2
}

export function parseProjectSnapshotV2Json(
    jsonText: string
): ProjectSnapshotV2ParseResult {
    let parsed: unknown
    try {
        parsed = JSON.parse(jsonText)
    } catch {
        return {
            ok: false,
            error: makeLoadGateError("E_JSON_PARSE", "json: parse failed"),
        }
    }

    try {
        const snapshot = validateProjectSnapshotV2OrThrow(parsed)
        return {
            ok: true,
            snapshot,
            canonical: canonicalizeSnapshotV2(snapshot),
        }
    } catch (error) {
        const gateError = isPlainObject(error) && "code" in error && "message" in error
            ? (error as LoadGateError)
            : makeLoadGateError("E_ROOT_KEYS", "snapshot: validation failed")

        return { ok: false, error: gateError }
    }
}

import {
    EXTRACT_QUANTIZATION_PROFILE,
    buildDerivedWorld,
    extractPalette,
    getFixedProfilePaletteForApplication,
    getFixedProfilePaletteForDisplay,
    overlayOverBase,
    quantizeWithFixedProfile,
    remapOverlay,
    type QuantizationProfile,
    type QuantizationPixel,
    type QuantizationSwatch,
} from "./paletteQuantizationEngine.ts"
import {
    extractPaletteByStrategy,
    quantizeFixedPaletteByColorSpace,
    type PaletteStrategyColorSpaceId,
    type PaletteStrategyMethodId,
} from "./quantizationMethods/paletteStrategyQuantizers.ts"

export const DEFAULT_QUANTIZATION_METHOD_ID = "default" as const
export const DEFAULT_COLOR_SPACE_ID = "default" as const
export const AUTO_PALETTE_CONTEXT_KIND = "auto" as const
export const FIXED_PALETTE_CONTEXT_KIND = "fixed" as const
export const FIXED_PALETTE_MAPPING_METHOD_ID =
    "fixed-palette-mapping" as const
export const PIXTUDIO_METHOD_ID = "pixtudio" as const
export const K_MEANS_METHOD_ID = "k-means" as const
export const K_MEDOIDS_METHOD_ID = "k-medoids" as const
export const OCTREE_METHOD_ID = "octree" as const
export const MEDIAN_CUT_METHOD_ID = "median-cut" as const
export const FUZZY_C_MEANS_METHOD_ID = "fuzzy-c-means" as const
export const WU_COLOR_QUANTIZER_METHOD_ID = "wu-color-quantizer" as const
export const OKLAB_COLOR_SPACE_ID = "oklab" as const
export const CIELAB_COLOR_SPACE_ID = "cielab" as const
export const DIN99_COLOR_SPACE_ID = "din99" as const
export const CAM16_UCS_COLOR_SPACE_ID = "cam16-ucs" as const
export const YCBCR_COLOR_SPACE_ID = "ycbcr" as const
export const YUV_COLOR_SPACE_ID = "yuv" as const
export const YIQ_COLOR_SPACE_ID = "yiq" as const
export const HSV_COLOR_SPACE_ID = "hsv" as const
export const HSL_COLOR_SPACE_ID = "hsl" as const
export const HSI_COLOR_SPACE_ID = "hsi" as const

export type QuantizationMethodId = string
export type ColorSpaceId = string
export type PaletteContextKind =
    | typeof AUTO_PALETTE_CONTEXT_KIND
    | typeof FIXED_PALETTE_CONTEXT_KIND

export type MethodProfile = {
    methodId: QuantizationMethodId
    colorSpaceId: ColorSpaceId
}

export type AutoPaletteContext = {
    kind: typeof AUTO_PALETTE_CONTEXT_KIND
}

export type FixedPaletteContext = {
    kind: typeof FIXED_PALETTE_CONTEXT_KIND
    profile?: Extract<QuantizationProfile, { kind: "fixed" }>
}

export type PaletteContext = AutoPaletteContext | FixedPaletteContext

export type MethodProfilesByPaletteContext = Partial<
    Record<PaletteContextKind, MethodProfile>
>

export type ResolvedMethodProfilesByPaletteContext = Readonly<
    Record<PaletteContextKind, MethodProfile>
>

export type PaletteContextDefinition = {
    kind: PaletteContextKind
    label: string
    allowsMethodPreview: boolean
    defaultMethodProfile: MethodProfile
}

export type QuantizationMethodStrategy = {
    id: QuantizationMethodId
    label: string
    supportedPaletteContexts: PaletteContextKind[]
    supportedColorSpaces: ColorSpaceId[]
    defaultColorSpace: ColorSpaceId
    tooltip?: string
    run: QuantizationMethodRunner
}

export type ColorSpaceStrategy = {
    id: ColorSpaceId
    label: string
    supportedPaletteContexts?: PaletteContextKind[]
    supportedMethods?: QuantizationMethodId[]
    defaultMethod?: QuantizationMethodId
    tooltip?: string
}

export type QuantizationCompatibilityPair = MethodProfile & {
    paletteContextKind: PaletteContextKind
}

export type QuantizationResult<
    TPixel extends string | null = QuantizationPixel,
> = {
    methodProfile: MethodProfile
    autoSwatches: QuantizationSwatch[]
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    canvasPixels: TPixel[][]
    requestId?: number
}

export type DefaultPaletteQuantizationInput = {
    pixels: QuantizationPixel[][]
    targetColors: number
    excludedColors?: string[]
}

export type DefaultPaletteQuantizationResult = {
    pixels: QuantizationPixel[][]
    palette: string[]
}

export type FixedPaletteQuantizationInput = {
    pixels: QuantizationPixel[][]
    profile: Extract<QuantizationProfile, { kind: "fixed" }>
}

export type FixedPaletteQuantizationResult = {
    pixels: QuantizationPixel[][]
    palette: string[]
    displayPalette: string[]
}

export type QuantizationRunInput<
    TPixel extends string | null = QuantizationPixel,
> = {
    sourcePixels: QuantizationPixel[][]
    overlayPixels: TPixel[][]
    previousSwatches?: QuantizationSwatch[]
    userSwatches?: QuantizationSwatch[]
    paletteCount: number
    methodProfile?: Partial<MethodProfile> | null
    paletteContext?: PaletteContext | PaletteContextKind | null
    fixedPaletteProfile?: Extract<QuantizationProfile, { kind: "fixed" }>
    excludedColors?: string[]
    requestId?: number
    makeAutoSwatchId?: (index: number) => string
}

export type QuantizationStrategyRunInput<
    TPixel extends string | null = QuantizationPixel,
> = Omit<QuantizationRunInput<TPixel>, "methodProfile"> & {
    methodProfile: MethodProfile
    paletteContextKind: PaletteContextKind
}

export type QuantizationMethodRunner = <
    TPixel extends string | null = QuantizationPixel,
>(
    input: QuantizationStrategyRunInput<TPixel>
) => QuantizationResult<TPixel>

const AUTO_PALETTE_STRATEGY_METHOD_IDS = [
    K_MEANS_METHOD_ID,
    K_MEDOIDS_METHOD_ID,
    OCTREE_METHOD_ID,
    MEDIAN_CUT_METHOD_ID,
    FUZZY_C_MEANS_METHOD_ID,
    WU_COLOR_QUANTIZER_METHOD_ID,
] as const

const REAL_COLOR_SPACE_IDS = [
    OKLAB_COLOR_SPACE_ID,
    CIELAB_COLOR_SPACE_ID,
    DIN99_COLOR_SPACE_ID,
    CAM16_UCS_COLOR_SPACE_ID,
    YCBCR_COLOR_SPACE_ID,
    YUV_COLOR_SPACE_ID,
    YIQ_COLOR_SPACE_ID,
    HSV_COLOR_SPACE_ID,
    HSL_COLOR_SPACE_ID,
    HSI_COLOR_SPACE_ID,
] as const

const AUTO_COLOR_SPACE_IDS = [
    DEFAULT_COLOR_SPACE_ID,
    ...REAL_COLOR_SPACE_IDS,
] as const

const DISTANCE_METHOD_COLOR_SPACE_IDS = [
    DEFAULT_COLOR_SPACE_ID,
    ...REAL_COLOR_SPACE_IDS,
] as const

const RGB_STRUCTURE_METHOD_COLOR_SPACE_IDS = [
    DEFAULT_COLOR_SPACE_ID,
] as const

const AUTO_DEFAULT_COLOR_SPACE_METHOD_IDS = [
    DEFAULT_QUANTIZATION_METHOD_ID,
    K_MEANS_METHOD_ID,
    K_MEDOIDS_METHOD_ID,
    OCTREE_METHOD_ID,
    MEDIAN_CUT_METHOD_ID,
    FUZZY_C_MEANS_METHOD_ID,
    WU_COLOR_QUANTIZER_METHOD_ID,
] as const

export const DEFAULT_METHOD_PROFILE: MethodProfile = {
    methodId: DEFAULT_QUANTIZATION_METHOD_ID,
    colorSpaceId: DEFAULT_COLOR_SPACE_ID,
}

export const DEFAULT_METHOD_PROFILES_BY_PALETTE_CONTEXT: Readonly<
    Record<PaletteContextKind, MethodProfile>
> = {
    [AUTO_PALETTE_CONTEXT_KIND]: DEFAULT_METHOD_PROFILE,
    [FIXED_PALETTE_CONTEXT_KIND]: {
        methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
        colorSpaceId: OKLAB_COLOR_SPACE_ID,
    },
}

const PALETTE_CONTEXT_REGISTRY: ReadonlyMap<
    PaletteContextKind,
    PaletteContextDefinition
> = new Map([
    [
        AUTO_PALETTE_CONTEXT_KIND,
        {
            kind: AUTO_PALETTE_CONTEXT_KIND,
            label: "Auto Palette",
            allowsMethodPreview: true,
            defaultMethodProfile:
                DEFAULT_METHOD_PROFILES_BY_PALETTE_CONTEXT[
                    AUTO_PALETTE_CONTEXT_KIND
                ],
        },
    ],
    [
        FIXED_PALETTE_CONTEXT_KIND,
        {
            kind: FIXED_PALETTE_CONTEXT_KIND,
            label: "Palette Presets",
            allowsMethodPreview: true,
            defaultMethodProfile:
                DEFAULT_METHOD_PROFILES_BY_PALETTE_CONTEXT[
                    FIXED_PALETTE_CONTEXT_KIND
                ],
        },
    ],
])

export function runDefaultPaletteQuantization(
    input: DefaultPaletteQuantizationInput
): DefaultPaletteQuantizationResult {
    return extractPalette(input.pixels, input.targetColors, {
        excludedColors: input.excludedColors,
    })
}

export function runFixedPaletteQuantization(
    input: FixedPaletteQuantizationInput
): FixedPaletteQuantizationResult {
    return {
        pixels: quantizeWithFixedProfile(input.pixels, input.profile),
        palette: getFixedProfilePaletteForApplication(input.profile),
        displayPalette: getFixedProfilePaletteForDisplay(input.profile),
    }
}

function parseQuantizationColor(color: string): {
    r: number
    g: number
    b: number
} {
    const rgb = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(color)
    if (rgb) {
        return {
            r: Number(rgb[1]),
            g: Number(rgb[2]),
            b: Number(rgb[3]),
        }
    }
    const hex = color.trim().replace(/^#/, "")
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        }
    }
    return { r: 0, g: 0, b: 0 }
}

function quantizationColorKey(color: string): string {
    const { r, g, b } = parseQuantizationColor(color)
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

function toPaletteStrategyColorSpaceId(
    colorSpaceId: ColorSpaceId
): PaletteStrategyColorSpaceId {
    return AUTO_COLOR_SPACE_IDS.includes(
        colorSpaceId as (typeof AUTO_COLOR_SPACE_IDS)[number]
    )
        ? (colorSpaceId as PaletteStrategyColorSpaceId)
        : DEFAULT_COLOR_SPACE_ID
}

function toPaletteStrategyMethodId(
    methodId: QuantizationMethodId
): PaletteStrategyMethodId {
    return AUTO_PALETTE_STRATEGY_METHOD_IDS.includes(
        methodId as (typeof AUTO_PALETTE_STRATEGY_METHOD_IDS)[number]
    )
        ? (methodId as PaletteStrategyMethodId)
        : K_MEANS_METHOD_ID
}

function buildQuantizationResultFromPalette<
    TPixel extends string | null = QuantizationPixel,
>(input: {
    strategyInput: QuantizationStrategyRunInput<TPixel>
    quantizedPixels: QuantizationPixel[][]
    swatchPalette: string[]
    pixelPalette?: string[]
}): QuantizationResult<TPixel> {
    const makeAutoSwatchId =
        input.strategyInput.makeAutoSwatchId ??
        ((index: number) => `auto-${index}`)
    const pixelPalette = input.pixelPalette ?? input.swatchPalette
    const autoSwatches = input.swatchPalette.map((color, index) => ({
        id: makeAutoSwatchId(index),
        color,
        isTransparent: false,
        isUser: false,
    }))
    const pixelIdByColor = new Map(
        pixelPalette.map((color, index) => [
            quantizationColorKey(color),
            makeAutoSwatchId(index),
        ])
    )
    const overlayPixels = remapOverlay({
        overlayPixels: input.strategyInput.overlayPixels,
        swatches: [
            ...(input.strategyInput.previousSwatches ?? []),
            ...(input.strategyInput.userSwatches ?? []),
        ],
        targetAutoSwatches: autoSwatches,
    })
    const imagePixels = input.quantizedPixels.map((row) =>
        row.map((color) => {
            if (color == null) return null as TPixel
            return (pixelIdByColor.get(quantizationColorKey(color)) ??
                null) as TPixel
        })
    )

    return {
        methodProfile: input.strategyInput.methodProfile,
        autoSwatches,
        imagePixels,
        overlayPixels,
        canvasPixels: overlayOverBase(imagePixels, overlayPixels),
        requestId: input.strategyInput.requestId,
    }
}

function runDefaultQuantizationStrategy<
    TPixel extends string | null = QuantizationPixel,
>(input: QuantizationStrategyRunInput<TPixel>): QuantizationResult<TPixel> {
    const world = buildDerivedWorld<TPixel>({
        profile: EXTRACT_QUANTIZATION_PROFILE,
        sourcePixels: input.sourcePixels,
        overlayPixels: input.overlayPixels,
        previousSwatches: input.previousSwatches ?? [],
        userSwatches: input.userSwatches ?? [],
        paletteCountTarget: input.paletteCount,
        excludedColors: input.excludedColors,
        makeAutoSwatchId: input.makeAutoSwatchId,
    })

    return {
        methodProfile: input.methodProfile,
        autoSwatches: world.autoSwatches,
        imagePixels: world.imagePixels,
        overlayPixels: world.overlayPixels,
        canvasPixels: world.canvasPixels,
        requestId: input.requestId,
    }
}

function runPixtudioQuantizationStrategy<
    TPixel extends string | null = QuantizationPixel,
>(input: QuantizationStrategyRunInput<TPixel>): QuantizationResult<TPixel> {
    const extracted = extractPalette(input.sourcePixels, input.paletteCount, {
        excludedColors: input.excludedColors,
    })
    const quantizedPixels = quantizeFixedPaletteByColorSpace(
        input.sourcePixels,
        extracted.palette,
        toPaletteStrategyColorSpaceId(input.methodProfile.colorSpaceId)
    )

    return buildQuantizationResultFromPalette({
        strategyInput: input,
        quantizedPixels,
        swatchPalette: extracted.palette,
    })
}

function runAutoPaletteMethodStrategy(
    methodId: PaletteStrategyMethodId
): QuantizationMethodRunner {
    return <TPixel extends string | null = QuantizationPixel>(
        input: QuantizationStrategyRunInput<TPixel>
    ): QuantizationResult<TPixel> => {
        const colorSpaceId = toPaletteStrategyColorSpaceId(
            input.methodProfile.colorSpaceId
        )
        const strategyMethodId = toPaletteStrategyMethodId(methodId)
        const result = extractPaletteByStrategy(
            input.sourcePixels,
            input.paletteCount,
            {
                methodId: strategyMethodId,
                colorSpaceId,
                excludedColors: input.excludedColors,
            }
        )

        return buildQuantizationResultFromPalette({
            strategyInput: input,
            quantizedPixels: result.pixels,
            swatchPalette: result.palette,
        })
    }
}

function runFixedPaletteMappingStrategy<
    TPixel extends string | null = QuantizationPixel,
>(input: QuantizationStrategyRunInput<TPixel>): QuantizationResult<TPixel> {
    const fixedProfile =
        input.fixedPaletteProfile ??
        (typeof input.paletteContext === "object" &&
        input.paletteContext?.kind === FIXED_PALETTE_CONTEXT_KIND
            ? input.paletteContext.profile
            : undefined)

    if (!fixedProfile) {
        throw new Error("Fixed palette quantization requires a fixed palette profile")
    }

    const pixelPalette = getFixedProfilePaletteForApplication(fixedProfile)
    const swatchPalette = getFixedProfilePaletteForDisplay(fixedProfile)
    const quantizedPixels =
        input.methodProfile.colorSpaceId === OKLAB_COLOR_SPACE_ID
            ? quantizeWithFixedProfile(input.sourcePixels, fixedProfile)
            : quantizeFixedPaletteByColorSpace(
                  input.sourcePixels,
                  pixelPalette,
                  toPaletteStrategyColorSpaceId(input.methodProfile.colorSpaceId)
              )

    return buildQuantizationResultFromPalette({
        strategyInput: input,
        quantizedPixels,
        swatchPalette,
        pixelPalette,
    })
}

const DEFAULT_METHOD_STRATEGY: QuantizationMethodStrategy = {
    id: DEFAULT_QUANTIZATION_METHOD_ID,
    label: "Default",
    supportedPaletteContexts: [AUTO_PALETTE_CONTEXT_KIND],
    supportedColorSpaces: [DEFAULT_COLOR_SPACE_ID],
    defaultColorSpace: DEFAULT_COLOR_SPACE_ID,
    tooltip: "PIXTUDIO's standard quantization.",
    run: runDefaultQuantizationStrategy,
}

const PIXTUDIO_METHOD_STRATEGY: QuantizationMethodStrategy = {
    id: PIXTUDIO_METHOD_ID,
    label: "PIXTUDIO",
    supportedPaletteContexts: [AUTO_PALETTE_CONTEXT_KIND],
    supportedColorSpaces: [...REAL_COLOR_SPACE_IDS],
    defaultColorSpace: OKLAB_COLOR_SPACE_ID,
    tooltip: "Uses PIXTUDIO's palette method with the selected color matching.",
    run: runPixtudioQuantizationStrategy,
}

function makeAutoQuantizationMethodStrategy(input: {
    id: (typeof AUTO_PALETTE_STRATEGY_METHOD_IDS)[number]
    label: string
    supportedColorSpaces: ReadonlyArray<ColorSpaceId>
    defaultColorSpace?: ColorSpaceId
    tooltip: string
}): QuantizationMethodStrategy {
    return {
        id: input.id,
        label: input.label,
        supportedPaletteContexts: [AUTO_PALETTE_CONTEXT_KIND],
        supportedColorSpaces: [...input.supportedColorSpaces],
        defaultColorSpace: input.defaultColorSpace ?? OKLAB_COLOR_SPACE_ID,
        tooltip: input.tooltip,
        run: runAutoPaletteMethodStrategy(input.id),
    }
}

const K_MEANS_METHOD_STRATEGY = makeAutoQuantizationMethodStrategy({
    id: K_MEANS_METHOD_ID,
    label: "K-Means",
    supportedColorSpaces: DISTANCE_METHOD_COLOR_SPACE_IDS,
    tooltip: "Groups colors around shared centers.",
})

const K_MEDOIDS_METHOD_STRATEGY = makeAutoQuantizationMethodStrategy({
    id: K_MEDOIDS_METHOD_ID,
    label: "K-Medoids",
    supportedColorSpaces: DISTANCE_METHOD_COLOR_SPACE_IDS,
    tooltip: "Groups colors around real sample colors.",
})

const OCTREE_METHOD_STRATEGY = makeAutoQuantizationMethodStrategy({
    id: OCTREE_METHOD_ID,
    label: "Octree",
    supportedColorSpaces: RGB_STRUCTURE_METHOD_COLOR_SPACE_IDS,
    defaultColorSpace: DEFAULT_COLOR_SPACE_ID,
    tooltip: "Reduces colors through a color tree.",
})

const MEDIAN_CUT_METHOD_STRATEGY = makeAutoQuantizationMethodStrategy({
    id: MEDIAN_CUT_METHOD_ID,
    label: "Median Cut",
    supportedColorSpaces: RGB_STRUCTURE_METHOD_COLOR_SPACE_IDS,
    defaultColorSpace: DEFAULT_COLOR_SPACE_ID,
    tooltip: "Splits color ranges into balanced groups.",
})

const FUZZY_C_MEANS_METHOD_STRATEGY = makeAutoQuantizationMethodStrategy({
    id: FUZZY_C_MEANS_METHOD_ID,
    label: "Fuzzy C-Means",
    supportedColorSpaces: DISTANCE_METHOD_COLOR_SPACE_IDS,
    tooltip: "Allows colors to belong partly to groups.",
})

const WU_COLOR_QUANTIZER_METHOD_STRATEGY =
    makeAutoQuantizationMethodStrategy({
        id: WU_COLOR_QUANTIZER_METHOD_ID,
        label: "Wu's Color Quantizer",
        supportedColorSpaces: RGB_STRUCTURE_METHOD_COLOR_SPACE_IDS,
        defaultColorSpace: DEFAULT_COLOR_SPACE_ID,
        tooltip: "Uses variance-based color reduction.",
    })

const FIXED_PALETTE_MAPPING_METHOD_STRATEGY: QuantizationMethodStrategy = {
    id: FIXED_PALETTE_MAPPING_METHOD_ID,
    label: "Fixed Palette Mapping",
    supportedPaletteContexts: [FIXED_PALETTE_CONTEXT_KIND],
    supportedColorSpaces: [...REAL_COLOR_SPACE_IDS],
    defaultColorSpace: OKLAB_COLOR_SPACE_ID,
    tooltip: "Maps the image to the selected palette.",
    run: runFixedPaletteMappingStrategy,
}

const DEFAULT_COLOR_SPACE_STRATEGY: ColorSpaceStrategy = {
    id: DEFAULT_COLOR_SPACE_ID,
    label: "Default",
    supportedPaletteContexts: [AUTO_PALETTE_CONTEXT_KIND],
    supportedMethods: [...AUTO_DEFAULT_COLOR_SPACE_METHOD_IDS],
    defaultMethod: DEFAULT_QUANTIZATION_METHOD_ID,
    tooltip: "PIXTUDIO's standard color handling.",
}

function makeRealColorSpaceStrategy(input: {
    id: (typeof REAL_COLOR_SPACE_IDS)[number]
    label: string
    tooltip: string
}): ColorSpaceStrategy {
    return {
        id: input.id,
        label: input.label,
        supportedPaletteContexts: [
            AUTO_PALETTE_CONTEXT_KIND,
            FIXED_PALETTE_CONTEXT_KIND,
        ],
        supportedMethods: [
            PIXTUDIO_METHOD_ID,
            K_MEANS_METHOD_ID,
            K_MEDOIDS_METHOD_ID,
            FUZZY_C_MEANS_METHOD_ID,
            FIXED_PALETTE_MAPPING_METHOD_ID,
        ],
        defaultMethod:
            input.id === OKLAB_COLOR_SPACE_ID
                ? FIXED_PALETTE_MAPPING_METHOD_ID
                : K_MEANS_METHOD_ID,
        tooltip: input.tooltip,
    }
}

const OKLAB_COLOR_SPACE_STRATEGY = makeRealColorSpaceStrategy({
    id: OKLAB_COLOR_SPACE_ID,
    label: "OKLAB",
    tooltip: "Perceptual color matching for pixel-art palettes.",
})

const CIELAB_COLOR_SPACE_STRATEGY = makeRealColorSpaceStrategy({
    id: CIELAB_COLOR_SPACE_ID,
    label: "CIELAB (Lab)",
    tooltip: "Compares colors in a perceptual Lab space.",
})

const DIN99_COLOR_SPACE_STRATEGY = makeRealColorSpaceStrategy({
    id: DIN99_COLOR_SPACE_ID,
    label: "DIN99",
    tooltip: "Compares colors with DIN99 perceptual spacing.",
})

const CAM16_UCS_COLOR_SPACE_STRATEGY = makeRealColorSpaceStrategy({
    id: CAM16_UCS_COLOR_SPACE_ID,
    label: "CAM16-UCS",
    tooltip: "Compares colors with modern appearance spacing.",
})

const YCBCR_COLOR_SPACE_STRATEGY = makeRealColorSpaceStrategy({
    id: YCBCR_COLOR_SPACE_ID,
    label: "YCbCr",
    tooltip: "Separates brightness from color channels.",
})

const YUV_COLOR_SPACE_STRATEGY = makeRealColorSpaceStrategy({
    id: YUV_COLOR_SPACE_ID,
    label: "YUV",
    tooltip: "Uses video-style brightness and color channels.",
})

const YIQ_COLOR_SPACE_STRATEGY = makeRealColorSpaceStrategy({
    id: YIQ_COLOR_SPACE_ID,
    label: "YIQ",
    tooltip: "Uses broadcast-style brightness and color channels.",
})

const HSV_COLOR_SPACE_STRATEGY = makeRealColorSpaceStrategy({
    id: HSV_COLOR_SPACE_ID,
    label: "HSV",
    tooltip: "Compares hue, saturation, and value.",
})

const HSL_COLOR_SPACE_STRATEGY = makeRealColorSpaceStrategy({
    id: HSL_COLOR_SPACE_ID,
    label: "HSL",
    tooltip: "Compares hue, saturation, and lightness.",
})

const HSI_COLOR_SPACE_STRATEGY = makeRealColorSpaceStrategy({
    id: HSI_COLOR_SPACE_ID,
    label: "HSI",
    tooltip: "Compares hue, saturation, and intensity.",
})

const QUANTIZATION_METHOD_REGISTRY: ReadonlyMap<
    QuantizationMethodId,
    QuantizationMethodStrategy
> = new Map([
    [DEFAULT_METHOD_STRATEGY.id, DEFAULT_METHOD_STRATEGY],
    [PIXTUDIO_METHOD_STRATEGY.id, PIXTUDIO_METHOD_STRATEGY],
    [K_MEANS_METHOD_STRATEGY.id, K_MEANS_METHOD_STRATEGY],
    [K_MEDOIDS_METHOD_STRATEGY.id, K_MEDOIDS_METHOD_STRATEGY],
    [OCTREE_METHOD_STRATEGY.id, OCTREE_METHOD_STRATEGY],
    [MEDIAN_CUT_METHOD_STRATEGY.id, MEDIAN_CUT_METHOD_STRATEGY],
    [FUZZY_C_MEANS_METHOD_STRATEGY.id, FUZZY_C_MEANS_METHOD_STRATEGY],
    [
        WU_COLOR_QUANTIZER_METHOD_STRATEGY.id,
        WU_COLOR_QUANTIZER_METHOD_STRATEGY,
    ],
    [
        FIXED_PALETTE_MAPPING_METHOD_STRATEGY.id,
        FIXED_PALETTE_MAPPING_METHOD_STRATEGY,
    ],
])

const COLOR_SPACE_REGISTRY: ReadonlyMap<ColorSpaceId, ColorSpaceStrategy> =
    new Map([
        [DEFAULT_COLOR_SPACE_STRATEGY.id, DEFAULT_COLOR_SPACE_STRATEGY],
        [OKLAB_COLOR_SPACE_STRATEGY.id, OKLAB_COLOR_SPACE_STRATEGY],
        [CIELAB_COLOR_SPACE_STRATEGY.id, CIELAB_COLOR_SPACE_STRATEGY],
        [DIN99_COLOR_SPACE_STRATEGY.id, DIN99_COLOR_SPACE_STRATEGY],
        [CAM16_UCS_COLOR_SPACE_STRATEGY.id, CAM16_UCS_COLOR_SPACE_STRATEGY],
        [YCBCR_COLOR_SPACE_STRATEGY.id, YCBCR_COLOR_SPACE_STRATEGY],
        [YUV_COLOR_SPACE_STRATEGY.id, YUV_COLOR_SPACE_STRATEGY],
        [YIQ_COLOR_SPACE_STRATEGY.id, YIQ_COLOR_SPACE_STRATEGY],
        [HSV_COLOR_SPACE_STRATEGY.id, HSV_COLOR_SPACE_STRATEGY],
        [HSL_COLOR_SPACE_STRATEGY.id, HSL_COLOR_SPACE_STRATEGY],
        [HSI_COLOR_SPACE_STRATEGY.id, HSI_COLOR_SPACE_STRATEGY],
    ])

export function getRegisteredPaletteContexts(): PaletteContextDefinition[] {
    return Array.from(PALETTE_CONTEXT_REGISTRY.values()).map((context) => ({
        ...context,
        defaultMethodProfile: { ...context.defaultMethodProfile },
    }))
}

export function getPaletteContextDefinition(
    paletteContext?: PaletteContext | PaletteContextKind | null
): PaletteContextDefinition {
    const paletteContextKind = resolvePaletteContextKind(paletteContext)
    const definition = PALETTE_CONTEXT_REGISTRY.get(paletteContextKind)
    if (!definition) {
        throw new Error(`Unknown palette context: ${paletteContextKind}`)
    }
    return {
        ...definition,
        defaultMethodProfile: { ...definition.defaultMethodProfile },
    }
}

export function doesPaletteContextAllowMethodPreview(
    paletteContext?: PaletteContext | PaletteContextKind | null
): boolean {
    return getPaletteContextDefinition(paletteContext).allowsMethodPreview
}

export function getRegisteredQuantizationMethods(): QuantizationMethodStrategy[] {
    return Array.from(QUANTIZATION_METHOD_REGISTRY.values())
}

export function getRegisteredColorSpaces(): ColorSpaceStrategy[] {
    return Array.from(COLOR_SPACE_REGISTRY.values())
}

export function getQuantizationMethodStrategy(
    methodId: QuantizationMethodId
): QuantizationMethodStrategy | undefined {
    return QUANTIZATION_METHOD_REGISTRY.get(methodId)
}

export function getColorSpaceStrategy(
    colorSpaceId: ColorSpaceId
): ColorSpaceStrategy | undefined {
    return COLOR_SPACE_REGISTRY.get(colorSpaceId)
}

export function resolvePaletteContextKind(
    paletteContext?: PaletteContext | PaletteContextKind | null
): PaletteContextKind {
    if (paletteContext === FIXED_PALETTE_CONTEXT_KIND) {
        return FIXED_PALETTE_CONTEXT_KIND
    }
    if (
        typeof paletteContext === "object" &&
        paletteContext?.kind === FIXED_PALETTE_CONTEXT_KIND
    ) {
        return FIXED_PALETTE_CONTEXT_KIND
    }
    return AUTO_PALETTE_CONTEXT_KIND
}

export function getDefaultMethodProfileForPaletteContext(
    paletteContext?: PaletteContext | PaletteContextKind | null
): MethodProfile {
    return {
        ...getPaletteContextDefinition(paletteContext).defaultMethodProfile,
    }
}

export function getCompatibilityBridgeProfileForPaletteContext(
    paletteContext?: PaletteContext | PaletteContextKind | null
): MethodProfile {
    return getDefaultMethodProfileForPaletteContext(paletteContext)
}

export function isMethodColorSpaceCompatible(
    methodId: QuantizationMethodId,
    colorSpaceId: ColorSpaceId,
    paletteContext: PaletteContext | PaletteContextKind | null =
        AUTO_PALETTE_CONTEXT_KIND
): boolean {
    const paletteContextKind = resolvePaletteContextKind(paletteContext)
    const method = getQuantizationMethodStrategy(methodId)
    const colorSpace = getColorSpaceStrategy(colorSpaceId)
    if (!method || !colorSpace) return false
    if (!method.supportedPaletteContexts.includes(paletteContextKind)) {
        return false
    }
    if (
        colorSpace.supportedPaletteContexts &&
        !colorSpace.supportedPaletteContexts.includes(paletteContextKind)
    ) {
        return false
    }
    if (!method.supportedColorSpaces.includes(colorSpaceId)) return false
    if (
        colorSpace.supportedMethods &&
        !colorSpace.supportedMethods.includes(methodId)
    ) {
        return false
    }
    return true
}

export function getQuantizationCompatibilityPairs(
    paletteContext?: PaletteContext | PaletteContextKind | null
): QuantizationCompatibilityPair[] {
    const paletteContexts = paletteContext
        ? [resolvePaletteContextKind(paletteContext)]
        : ([AUTO_PALETTE_CONTEXT_KIND, FIXED_PALETTE_CONTEXT_KIND] as const)
    const pairs: QuantizationCompatibilityPair[] = []
    for (const paletteContextKind of paletteContexts) {
        for (const method of getRegisteredQuantizationMethods()) {
            for (const colorSpaceId of method.supportedColorSpaces) {
                if (
                    isMethodColorSpaceCompatible(
                        method.id,
                        colorSpaceId,
                        paletteContextKind
                    )
                ) {
                    pairs.push({
                        methodId: method.id,
                        colorSpaceId,
                        paletteContextKind,
                    })
                }
            }
        }
    }
    return pairs
}

export function getEnabledMethodIdsForColorSpace(
    colorSpaceId: ColorSpaceId,
    paletteContext?: PaletteContext | PaletteContextKind | null
): QuantizationMethodId[] {
    return getRegisteredQuantizationMethods()
        .filter((method) =>
            isMethodColorSpaceCompatible(
                method.id,
                colorSpaceId,
                paletteContext
            )
        )
        .map((method) => method.id)
}

export function getEnabledColorSpaceIdsForMethod(
    methodId: QuantizationMethodId,
    paletteContext?: PaletteContext | PaletteContextKind | null
): ColorSpaceId[] {
    return getRegisteredColorSpaces()
        .filter((colorSpace) =>
            isMethodColorSpaceCompatible(
                methodId,
                colorSpace.id,
                paletteContext
            )
        )
        .map((colorSpace) => colorSpace.id)
}

export function resolveMethodProfile(
    profile?: Partial<MethodProfile> | null,
    paletteContext?: PaletteContext | PaletteContextKind | null
): MethodProfile {
    const defaultProfile = getDefaultMethodProfileForPaletteContext(paletteContext)
    const method =
        profile?.methodId &&
        getQuantizationMethodStrategy(profile.methodId)

    if (!method) return defaultProfile

    const requestedColorSpaceId = profile?.colorSpaceId
    if (
        requestedColorSpaceId &&
        isMethodColorSpaceCompatible(
            method.id,
            requestedColorSpaceId,
            paletteContext
        )
    ) {
        return {
            methodId: method.id,
            colorSpaceId: requestedColorSpaceId,
        }
    }

    if (
        isMethodColorSpaceCompatible(
            method.id,
            method.defaultColorSpace,
            paletteContext
        )
    ) {
        return {
            methodId: method.id,
            colorSpaceId: method.defaultColorSpace,
        }
    }

    return defaultProfile
}

export function resolveMethodProfilesByPaletteContext(
    profiles?: MethodProfilesByPaletteContext | null
): ResolvedMethodProfilesByPaletteContext {
    return {
        [AUTO_PALETTE_CONTEXT_KIND]: resolveMethodProfile(
            profiles?.[AUTO_PALETTE_CONTEXT_KIND],
            AUTO_PALETTE_CONTEXT_KIND
        ),
        [FIXED_PALETTE_CONTEXT_KIND]: resolveMethodProfile(
            profiles?.[FIXED_PALETTE_CONTEXT_KIND],
            FIXED_PALETTE_CONTEXT_KIND
        ),
    }
}

export function validateQuantizationCoreRegistries(): string[] {
    const errors: string[] = []
    const paletteContexts = getRegisteredPaletteContexts()
    const methods = getRegisteredQuantizationMethods()
    const colorSpaces = getRegisteredColorSpaces()
    const paletteContextKinds = [
        AUTO_PALETTE_CONTEXT_KIND,
        FIXED_PALETTE_CONTEXT_KIND,
    ] as const

    for (const paletteContext of paletteContexts) {
        if (!paletteContextKinds.includes(paletteContext.kind)) {
            errors.push(`unknown palette context ${paletteContext.kind}`)
        }
        if (typeof paletteContext.allowsMethodPreview !== "boolean") {
            errors.push(
                `palette context ${paletteContext.kind} must declare allowsMethodPreview`
            )
        }
    }
    for (const paletteContextKind of paletteContextKinds) {
        if (!PALETTE_CONTEXT_REGISTRY.has(paletteContextKind)) {
            errors.push(`palette context ${paletteContextKind} is missing`)
        }
    }

    if (!getQuantizationMethodStrategy(DEFAULT_QUANTIZATION_METHOD_ID)) {
        errors.push("default quantization method is missing")
    }
    if (!getColorSpaceStrategy(DEFAULT_COLOR_SPACE_ID)) {
        errors.push("default color space is missing")
    }
    for (const paletteContextKind of paletteContextKinds) {
        const defaultProfile =
            DEFAULT_METHOD_PROFILES_BY_PALETTE_CONTEXT[paletteContextKind]
        if (
            !isMethodColorSpaceCompatible(
                defaultProfile.methodId,
                defaultProfile.colorSpaceId,
                paletteContextKind
            )
        ) {
            errors.push(
                `default method profile for ${paletteContextKind} palette context is incompatible`
            )
        }
    }

    for (const method of methods) {
        if (!method.supportedPaletteContexts.length) {
            errors.push(`method ${method.id} has no supported palette contexts`)
        }
        if (!method.supportedColorSpaces.length) {
            errors.push(`method ${method.id} has no supported color spaces`)
        }
        if (!getColorSpaceStrategy(method.defaultColorSpace)) {
            errors.push(
                `method ${method.id} references missing default color space`
            )
        }
        if (
            !method.supportedPaletteContexts.some((paletteContextKind) =>
                isMethodColorSpaceCompatible(
                    method.id,
                    method.defaultColorSpace,
                    paletteContextKind
                )
            )
        ) {
            errors.push(`method ${method.id} default color space is incompatible`)
        }
        for (const colorSpaceId of method.supportedColorSpaces) {
            if (!getColorSpaceStrategy(colorSpaceId)) {
                errors.push(
                    `method ${method.id} references missing color space ${colorSpaceId}`
                )
            }
        }
    }

    for (const colorSpace of colorSpaces) {
        if (
            colorSpace.defaultMethod &&
            !getQuantizationMethodStrategy(colorSpace.defaultMethod)
        ) {
            errors.push(
                `color space ${colorSpace.id} references missing default method`
            )
        }
        for (const paletteContextKind of colorSpace.supportedPaletteContexts ?? []) {
            if (!paletteContextKinds.includes(paletteContextKind)) {
                errors.push(
                    `color space ${colorSpace.id} references unknown palette context ${paletteContextKind}`
                )
            }
        }
        for (const methodId of colorSpace.supportedMethods ?? []) {
            if (!getQuantizationMethodStrategy(methodId)) {
                errors.push(
                    `color space ${colorSpace.id} references missing method ${methodId}`
                )
            }
        }
    }

    for (const paletteContextKind of paletteContextKinds) {
        if (
            !isQuantizationCompatibilityGraphConnectedFromBridge(
                paletteContextKind
            )
        ) {
            errors.push(
                `compatibility graph for ${paletteContextKind} palette context is not connected from its default bridge profile`
            )
        }
    }

    return errors
}

function pairKey(pair: QuantizationCompatibilityPair): string {
    return `${pair.paletteContextKind}\u0000${pair.methodId}\u0000${pair.colorSpaceId}`
}

export function isQuantizationCompatibilityGraphConnectedFromBridge(
    paletteContextKind: PaletteContextKind,
    pairs: QuantizationCompatibilityPair[] =
        getQuantizationCompatibilityPairs(paletteContextKind),
    bridgeProfile: MethodProfile =
        getCompatibilityBridgeProfileForPaletteContext(paletteContextKind)
): boolean {
    if (pairs.length === 0) return true

    const allPairKeys = new Set(pairs.map(pairKey))
    const visited = new Set<string>()
    const bridgePair: QuantizationCompatibilityPair = {
        ...bridgeProfile,
        paletteContextKind,
    }
    const bridgeKey = pairKey(bridgePair)
    if (!allPairKeys.has(bridgeKey)) return false
    if (pairs.length === 1) return true

    const queue = [bridgePair]

    while (queue.length) {
        const current = queue.shift()
        if (!current) continue
        const currentKey = pairKey(current)
        if (visited.has(currentKey)) continue
        visited.add(currentKey)

        for (const next of pairs) {
            const nextKey = pairKey(next)
            if (visited.has(nextKey)) continue
            const singleAxisMove =
                next.methodId === current.methodId ||
                next.colorSpaceId === current.colorSpaceId
            if (singleAxisMove && allPairKeys.has(nextKey)) {
                queue.push(next)
            }
        }
    }

    return visited.size === allPairKeys.size
}

export function runQuantization<
    TPixel extends string | null = QuantizationPixel,
>(input: QuantizationRunInput<TPixel>): QuantizationResult<TPixel> {
    const paletteContextKind = resolvePaletteContextKind(input.paletteContext)
    const methodProfile = resolveMethodProfile(
        input.methodProfile,
        paletteContextKind
    )
    const method = getQuantizationMethodStrategy(methodProfile.methodId)

    if (!method) {
        throw new Error(
            `Unsupported quantization profile: ${methodProfile.methodId}/${methodProfile.colorSpaceId}`
        )
    }

    return method.run({
        ...input,
        methodProfile,
        paletteContextKind,
    })
}

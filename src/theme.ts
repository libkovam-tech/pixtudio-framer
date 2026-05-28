export const PIXTUDIO_INK = "#001219"
export const PIXTUDIO_INK_RGB = "0, 18, 25"

export function pixtudioInk(alpha: number) {
    return `rgba(${PIXTUDIO_INK_RGB}, ${alpha})`
}

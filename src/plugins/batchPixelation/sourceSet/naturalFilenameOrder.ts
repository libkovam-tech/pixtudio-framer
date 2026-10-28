function isDigit(code: number): boolean {
    return code >= 48 && code <= 57
}

function ordinalCompare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0
}

export function compareNaturalFilename(a: string, b: string): number {
    let left = 0
    let right = 0
    let paddingTie = 0
    while (left < a.length && right < b.length) {
        const leftCode = a.charCodeAt(left)
        const rightCode = b.charCodeAt(right)
        if (isDigit(leftCode) && isDigit(rightCode)) {
            const leftStart = left
            const rightStart = right
            while (left < a.length && isDigit(a.charCodeAt(left))) left++
            while (right < b.length && isDigit(b.charCodeAt(right))) right++
            let leftSignificant = leftStart
            let rightSignificant = rightStart
            while (leftSignificant < left - 1 && a.charCodeAt(leftSignificant) === 48) leftSignificant++
            while (rightSignificant < right - 1 && b.charCodeAt(rightSignificant) === 48) rightSignificant++
            const lengthDifference = (left - leftSignificant) - (right - rightSignificant)
            if (lengthDifference) return Math.sign(lengthDifference)
            const numericDifference = ordinalCompare(
                a.slice(leftSignificant, left), b.slice(rightSignificant, right))
            if (numericDifference) return numericDifference
            if (!paddingTie) paddingTie = Math.sign((left - leftStart) - (right - rightStart))
            continue
        }
        if (leftCode !== rightCode) return Math.sign(leftCode - rightCode)
        left++
        right++
    }
    if (left !== a.length || right !== b.length) return left === a.length ? -1 : 1
    return paddingTie || ordinalCompare(a, b)
}

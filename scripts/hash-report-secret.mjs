import { createHash } from "node:crypto"
import readline from "node:readline"

const input = process.stdin
const output = process.stdout

readline.emitKeypressEvents(input)
if (input.isTTY) input.setRawMode(true)

let value = ""

output.write("Enter analytics report code: ")

input.on("keypress", (str, key) => {
    if (key?.name === "return" || key?.name === "enter") {
        if (input.isTTY) input.setRawMode(false)
        output.write("\n")

        const hash = createHash("sha256").update(value, "utf8").digest("hex")
        output.write(`SHA-256 hash:\n${hash}\n`)
        process.exit(0)
    }

    if (key?.name === "backspace") {
        value = value.slice(0, -1)
        return
    }

    if (key?.ctrl && key.name === "c") {
        if (input.isTTY) input.setRawMode(false)
        output.write("\n")
        process.exit(130)
    }

    if (typeof str === "string" && str >= " ") {
        value += str
    }
})

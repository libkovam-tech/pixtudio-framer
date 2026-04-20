import { createHash } from "node:crypto"
import readline from "node:readline"

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

rl.question("Enter analytics report code: ", (value) => {
    const hash = createHash("sha256").update(value, "utf8").digest("hex")
    process.stdout.write(`SHA-256 hash:\n${hash}\n`)
    rl.close()
})

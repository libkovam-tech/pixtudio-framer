import { afterEach, describe, expect, it, vi } from "vitest"
import reporter from "./pixtudio-analytics-reporter"

type Event = { event_name: "import_image" | "export_image" | "batch_pixelation_download_click"; country: string | null; created_at: string }
type SentMessage = { subject: string; html: string; text: string }

function makeEvents(count: number): Event[] {
    const countries = ["US", "IL", "DE", "GB", "FR", "CA", "JP", "IN", "BR", "AU", "ES", null]
    return Array.from({ length: count }, (_, index) => ({
        event_name: index < 1144 ? "import_image" : "export_image",
        country: countries[index % countries.length],
        created_at: new Date(Date.UTC(2026, 8, 30, 20) - index * 60_000)
            .toISOString().slice(0, 19).replace("T", " "),
    }))
}

function makeEnv(events: Event[], send: (message: SentMessage) => Promise<void>, onBind?: (values: unknown[]) => void) {
    return {
        ANALYTICS_DB: {
            prepare: () => ({ bind: (...values: unknown[]) => {
                onBind?.(values)
                return { all: async () => ({ results: events }) }
            } }),
        },
        REPORT_EMAIL: { send },
        ANALYTICS_REPORT_SENDER: "sender@example.test",
        ANALYTICS_REPORT_RECIPIENT: "recipient@example.test",
    } as unknown as Parameters<typeof reporter.scheduled>[1]
}

afterEach(() => vi.useRealTimers())

describe("analytics email report", () => {
    it("exposes only the monthly scheduled handler", () => {
        expect(Object.keys(reporter)).toEqual(["scheduled"])
    })

    it("sends all 2224 September events in ordered, numbered messages with full-month totals", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-10-01T09:00:00Z"))
        const sent: SentMessage[] = []
        const env = makeEnv(makeEvents(2224), async (message) => { sent.push(message) })

        await reporter.scheduled({} as ScheduledEvent, env)

        expect(sent).toHaveLength(12)
        expect((sent[0].html.match(/2026-09-\d{2} \d{2}:\d{2}/g) || [])).toHaveLength(200)
        expect((sent[11].html.match(/2026-09-\d{2} \d{2}:\d{2}/g) || [])).toHaveLength(24)
        const dates = sent.flatMap(({ html }) => html.match(/2026-09-\d{2} \d{2}:\d{2}/g) || [])
        expect(dates).toHaveLength(2224)
        expect(new Set(dates).size).toBe(2224)
        sent.forEach((message, index) => {
            expect(message.subject).toContain(`${index + 1}/12`)
            expect(message.html).toContain("1144")
            expect(message.html).toContain("1080")
            expect(message.html).toContain("Топ-10 стран за месяц")
            expect(message.html).toContain(">186</td>")
            expect(message.text).toContain("Импорт 1144 | Экспорт 1080")
            expect((message.html.match(/<tr><td style="border:1px solid/g) || [])).toHaveLength(10)
            expect(new TextEncoder().encode(message.html).length).toBeLessThanOrEqual(80_000)
        })
    })

    it("keeps an empty month to one readable message", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-10-01T09:00:00Z"))
        const sent: SentMessage[] = []

        await reporter.scheduled({} as ScheduledEvent, makeEnv([], async (message) => { sent.push(message) }))

        expect(sent).toHaveLength(1)
        expect(sent[0].subject).toContain("1/1")
        expect(sent[0].html).toContain("Нет событий")
        expect(sent[0].text).toContain("Импорт 0 | Экспорт 0")
    })

    it("counts Batch DOWNLOAD clicks separately in the monthly report without sending mail", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-10-01T09:00:00Z"))
        const sent: SentMessage[] = []
        const bindings: unknown[][] = []
        const send = vi.fn(async (message: SentMessage) => { sent.push(message) })
        const event: Event = {
            event_name: "batch_pixelation_download_click",
            country: "IL",
            created_at: "2026-09-15 12:00:00",
        }

        await reporter.scheduled({} as ScheduledEvent, makeEnv([event, event], send, values => bindings.push(values)))

        expect(bindings[0]).toContain("batch_pixelation_download_click")
        expect(send).toHaveBeenCalledOnce()
        const message = sent[0]
        expect(message.html).toContain("Batch Pixelation — Download clicks</td>")
        expect(message.html).toContain(">2</td>")
        expect(message.text).toContain("Импорт 0 | Экспорт 0 | Batch Pixelation — Download clicks 2")
        expect(message.text.match(/Batch Pixelation — Download clicks \|/g)).toHaveLength(2)
    })

    it("stops on a send failure instead of claiming that later pages were sent", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-10-01T09:00:00Z"))
        const send = vi.fn(async (message: SentMessage) => {
            if (message.subject.endsWith("2/3")) throw new Error("mail unavailable")
        })

        await expect(reporter.scheduled({} as ScheduledEvent, makeEnv(makeEvents(401), send)))
            .rejects.toThrow("mail unavailable")
        expect(send).toHaveBeenCalledTimes(2)
    })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import reporter from "./pixtudio-analytics-reporter"

type Event = { event_name: "import_image" | "export_image"; country: string | null; created_at: string }
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

function makeEnv(events: Event[], send: (message: SentMessage) => Promise<void>) {
    return {
        ANALYTICS_DB: {
            prepare: () => ({ bind: () => ({ all: async () => ({ results: events }) }) }),
        },
        REPORT_EMAIL: { send },
        ANALYTICS_REPORT_SENDER: "sender@example.test",
        ANALYTICS_REPORT_RECIPIENT: "recipient@example.test",
    } as unknown as Parameters<typeof reporter.scheduled>[1]
}

afterEach(() => vi.useRealTimers())

describe("analytics email report", () => {
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

    it("allows the authenticated post-deploy call to request the previous month", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-10-01T09:00:00Z"))
        const sent: SentMessage[] = []
        const rateKeys: string[] = []
        const secretHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("test-code"))
        const env = {
            ANALYTICS_DB: {
                prepare: (sql: string) => ({
                    bind: (...values: string[]) => {
                        if (sql.includes("rate_key")) rateKeys.push(values[0])
                        return {
                            all: async () => ({ results: makeEvents(2224) }),
                            first: async () => null,
                            run: async () => ({}),
                        }
                    },
                    run: async () => ({}),
                }),
            },
            REPORT_EMAIL: { send: async (message: SentMessage) => { sent.push(message) } },
            ANALYTICS_REPORT_SECRET_HASH: [...new Uint8Array(secretHash)]
                .map((byte) => byte.toString(16).padStart(2, "0")).join(""),
            ANALYTICS_REPORT_SENDER: "sender@example.test",
            ANALYTICS_REPORT_RECIPIENT: "recipient@example.test",
        } as unknown as Parameters<typeof reporter.fetch>[1]

        const response = await reporter.fetch(new Request("https://example.test", {
            method: "POST",
            body: JSON.stringify({ code: "test-code", period: "previous" }),
        }), env)

        expect(response.status).toBe(204)
        expect(sent).toHaveLength(12)
        expect(sent[0].subject).toContain("2026-09 | 1/12")
        expect(rateKeys).toEqual(["manual_report_previous", "manual_report_previous"])

        sent.length = 0
        await reporter.fetch(new Request("https://example.test", {
            method: "POST",
            body: JSON.stringify({ code: "test-code" }),
        }), env)
        expect(sent).toHaveLength(1)
        expect(sent[0].subject).toContain("2026-10 | 1/1")
        expect(rateKeys.slice(2)).toEqual(["manual_report", "manual_report"])
    })
})

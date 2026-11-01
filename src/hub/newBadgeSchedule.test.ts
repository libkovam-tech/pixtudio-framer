import { describe, expect, it } from "vitest"
import { isNewBadgeVisible, millisecondsUntilNextSiteDay } from "./newBadgeSchedule"

describe("temporary NEW badges", () => {
  it("starts on publication day and ends two calendar months later in Israel", () => {
    expect(isNewBadgeVisible("2026-10-31", new Date("2026-10-30T21:59:59Z"))).toBe(false)
    expect(isNewBadgeVisible("2026-10-31", new Date("2026-10-30T22:00:00Z"))).toBe(true)
    expect(isNewBadgeVisible("2026-10-31", new Date("2026-12-30T21:59:59Z"))).toBe(true)
    expect(isNewBadgeVisible("2026-10-31", new Date("2026-12-30T22:00:00Z"))).toBe(false)
  })

  it("clamps to the last day when the expiry month is shorter", () => {
    expect(isNewBadgeVisible("2027-07-31", new Date("2027-09-29T12:00:00Z"))).toBe(true)
    expect(isNewBadgeVisible("2027-07-31", new Date("2027-09-30T12:00:00Z"))).toBe(false)
  })

  it("stays hidden without a valid publication date", () => {
    expect(isNewBadgeVisible(undefined)).toBe(false)
    expect(isNewBadgeVisible("2026-02-30")).toBe(false)
  })

  it("reschedules at the next Israel calendar day", () => {
    expect(millisecondsUntilNextSiteDay(new Date("2026-12-30T21:59:59Z"))).toBe(1000)
  })
})

export function openSupportEmail(email: string, subject: string): void {
    if (typeof window === "undefined") return

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    const encodedSubject = encodeURIComponent(subject)
    if (isMobile) {
        window.location.href = `mailto:${email}?subject=${encodedSubject}`
        return
    }

    window.open(
        `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodedSubject}`,
        "_blank",
        "noopener,noreferrer"
    )
}

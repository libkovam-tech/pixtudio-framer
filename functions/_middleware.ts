type PagesMiddlewareContext = {
  request: Request
  next: () => Promise<Response>
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy":
    "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()",
}

export async function onRequest(
  context: PagesMiddlewareContext
): Promise<Response> {
  const response = await context.next()
  const nonce = createCspNonce()
  const headers = new Headers(response.headers)
  const url = new URL(context.request.url)
  const isHtml = isHtmlResponse(headers)

  applySecurityHeaders(headers, url, nonce)

  if (!isHtml) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  const html = addNonceToScriptTags(await response.text(), nonce)
  headers.delete("Content-Length")
  headers.delete("ETag")

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function applySecurityHeaders(
  headers: Headers,
  url: URL,
  nonce: string
): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }

  headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce))

  if (url.pathname === "/editor" || url.pathname.startsWith("/editor/")) {
    headers.set("X-Robots-Tag", "noindex, nofollow")
  }
}

function buildContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "child-src blob:",
    `script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "connect-src 'self' https://cloudflareinsights.com",
    "manifest-src 'self'",
    "form-action 'self'",
  ].join("; ")
}

function isHtmlResponse(headers: Headers): boolean {
  return (headers.get("Content-Type") ?? "").toLowerCase().includes("text/html")
}

function addNonceToScriptTags(html: string, nonce: string): string {
  return html.replace(
    /<script\b(?![^>]*\bnonce=)/giu,
    `<script nonce="${escapeHtmlAttribute(nonce)}"`
  )
}

function createCspNonce(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)

  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "")
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
}

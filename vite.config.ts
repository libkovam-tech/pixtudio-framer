import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ViteDevServer } from 'vite'
import { batchProductionBoundary } from './tools/batchProductionBoundary.ts'
import batchShareMetadata from './src/plugins/batchPixelation/shareMetadata.json'

const batchSharePath = '/plugins/batch-pixelation/'

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function batchShareDevHtml(html: string, origin: string) {
  const pageUrl = `${origin}${batchSharePath}`
  const imageUrl = `${origin}${batchShareMetadata.imagePath}`
  const replaceMeta = (source: string, attribute: 'name' | 'property', key: string, content: string) => {
    const tag = `<meta ${attribute}="${key}" content="${escapeHtmlAttribute(content)}" />`
    const pattern = new RegExp(`<meta\\s+${attribute}="${key}"[^>]*>`, 'i')
    return pattern.test(source) ? source.replace(pattern, tag) : source.replace('</head>', `${tag}\n</head>`)
  }

  let next = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${batchShareMetadata.title}</title>`)
  next = next.replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${pageUrl}" />`)
  for (const [attribute, key, content] of [
    ['name', 'description', batchShareMetadata.description],
    ['property', 'og:url', pageUrl],
    ['property', 'og:title', batchShareMetadata.title],
    ['property', 'og:description', batchShareMetadata.description],
    ['property', 'og:image', imageUrl],
    ['property', 'og:image:width', String(batchShareMetadata.imageWidth)],
    ['property', 'og:image:height', String(batchShareMetadata.imageHeight)],
    ['property', 'og:image:alt', batchShareMetadata.imageAlt],
    ['name', 'twitter:title', batchShareMetadata.title],
    ['name', 'twitter:description', batchShareMetadata.description],
    ['name', 'twitter:image', imageUrl],
    ['name', 'twitter:image:alt', batchShareMetadata.imageAlt],
  ] as const) {
    next = replaceMeta(next, attribute, key, content)
  }
  return next
}

function batchShareDevPreview() {
  return {
    name: 'batch-share-dev-preview',
    apply: 'serve' as const,
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' || !req.url || new URL(req.url, 'http://localhost').pathname !== batchSharePath) return next()

        const forwardedHost = req.headers['x-forwarded-host']
        const localHost = req.headers.host
        const tunnelHost = typeof forwardedHost === 'string' && /^[a-z0-9-]+\.trycloudflare\.com$/i.test(forwardedHost)
          ? forwardedHost : null
        if (!tunnelHost && (!localHost || !/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(localHost))) return next()

        const origin = tunnelHost ? `https://${tunnelHost}` : `http://${localHost}`
        try {
          const template = await readFile(resolve(server.config.root, 'index.html'), 'utf8')
          const transformed = await server.transformIndexHtml('/index.html', template)
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(batchShareDevHtml(transformed, origin))
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), batchProductionBoundary(), batchShareDevPreview()],
  worker: { plugins: () => [batchProductionBoundary(true)] },
  build: {
    cssMinify: "esbuild",
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/tests/e2e/**",
      "**/tools/ffmpeg-core-custom/upstream/**",
    ],
  },
})

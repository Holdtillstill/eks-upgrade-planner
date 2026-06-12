import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

const defaultSiteUrl = 'http://localhost:8080'
const enabledFlags = new Set(['1', 'true', 'yes', 'on'])

function normalizeSiteUrl(value?: string) {
  const url = new URL(value || defaultSiteUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`SITE_URL must use http or https, received ${value}`)
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

function isLocalSiteUrl(siteUrl: string) {
  const host = new URL(siteUrl).hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
  return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
}

function requireProductionSiteUrl(siteUrl: string, env: Record<string, string>, mode: string) {
  if (mode === 'production' && isLocalSiteUrl(siteUrl) && !enabledFlags.has(String(env.SITE_URL_ALLOW_LOCALHOST || process.env.SITE_URL_ALLOW_LOCALHOST || '').trim().toLowerCase())) {
    throw new Error('Production builds require SITE_URL to be a public http(s) origin. Set SITE_URL_ALLOW_LOCALHOST=true only for local/demo builds.')
  }
  return siteUrl
}

// Keep the MVP deliberately simple: Vite's esbuild transform handles TSX.
// Avoid React Fast Refresh injection in this environment, which can fail when
// the refresh preamble is not initialized by the browser harness.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = requireProductionSiteUrl(
    normalizeSiteUrl(process.env.SITE_URL || env.SITE_URL || process.env.VITE_SITE_URL || env.VITE_SITE_URL),
    env,
    mode,
  )

  return {
    base: '/',
    plugins: [
      {
        name: 'site-url-metadata',
        transformIndexHtml(html) {
          return html.replaceAll('__SITE_URL__', siteUrl)
        },
      },
      {
        name: 'local-visitor-events',
        configureServer(server) {
          server.middlewares.use('/api/events', (_request, response) => {
            response.statusCode = 202
            response.setHeader('content-type', 'application/json; charset=utf-8')
            response.end('{}')
          })
        },
      },
    ],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})

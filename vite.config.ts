import { defineConfig, loadEnv } from 'vite'

const defaultSiteUrl = 'http://localhost:8080'

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

// Keep the MVP deliberately simple: Vite's esbuild transform handles TSX.
// Avoid React Fast Refresh injection in this environment, which can fail when
// the refresh preamble is not initialized by the browser harness.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = normalizeSiteUrl(process.env.SITE_URL || env.SITE_URL || process.env.VITE_SITE_URL || env.VITE_SITE_URL)

  return {
    base: '/',
    plugins: [{
      name: 'site-url-metadata',
      transformIndexHtml(html) {
        return html.replaceAll('__SITE_URL__', siteUrl)
      },
    }],
  }
})

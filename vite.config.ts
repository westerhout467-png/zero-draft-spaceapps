import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Which AI pipeline outputs (M7) exist. The app fetches only these, so a file that hasn't been
// generated never costs a 404 in the console; once the pipeline writes one, the next build (or dev
// server start) shows it. Read by src/lib/generatedData.ts.
const generated = (name: string) => existsSync(fileURLToPath(new URL(`./public/data/${name}`, import.meta.url)))

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** Reads GEMINI_API_KEY and GEMINI_MODEL from .env.local into process.env, once. Vercel sets its own. */
let envLoaded = false
function loadLocalEnv() {
  const path = fileURLToPath(new URL('./.env.local', import.meta.url))
  if (!envLoaded && existsSync(path)) process.loadEnvFile(path)
  envLoaded = true
}

/**
 * Serves POST /api/lab-partner on this machine, as Vercel does when deployed: `npm run dev` runs
 * the TypeScript source (api/_src/lab-partner.ts); `npm run preview` runs the bundle Vercel runs
 * (api/lab-partner.js, from `npm run build:api`).
 */
function labPartnerApi(): Plugin {
  const serve = (load: () => Promise<{ default: Handler }>) => async (req: IncomingMessage, res: ServerResponse) => {
    loadLocalEnv()
    try {
      await (await load()).default(req, res)
    } catch (error) {
      console.error(error)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    }
  }
  return {
    name: 'lab-partner-api',
    configureServer(server) {
      server.middlewares.use('/api/lab-partner', serve(() => server.ssrLoadModule('/api/_src/lab-partner.ts') as Promise<{ default: Handler }>))
    },
    configurePreviewServer(server) {
      const bundle = pathToFileURL(fileURLToPath(new URL('./api/lab-partner.js', import.meta.url))).href
      server.middlewares.use('/api/lab-partner', serve(() => import(bundle)))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), labPartnerApi()],
  define: {
    __GENERATED_DATA__: JSON.stringify({
      briefing: generated('briefing.json'),
      testOutcomes: generated('test-outcomes.json'),
      investigations: generated('investigations.json'),
    }),
  },
})

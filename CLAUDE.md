# Entropos

Complexity Router & Model Context Protocol Gateway (OpenAI /v1 & MCP HTTP/SSE).
Task tracking: beads — run `bd prime` for the workflow.

## Commands
- `npm test` corre la suite completa de 77 tests de contrato y persistencia (`tsx --test`).
- `npm run dev` y `npm start` son lo mismo: `tsx server.ts` (Express en el puerto 3000, o `PORT`). Con `NODE_ENV != production` monta Vite como middleware; con `NODE_ENV=production` sirve `dist/` (hay que correr `npm run build` antes).
- `npm run lint` es `tsc --noEmit` (verificación de tipos de TypeScript).
- `npm run build` genera el bundle de producción en `dist/`.
- `DISABLE_HMR=true` apaga el HMR de Vite.
- Instalar con `npm ci` (lockfile `package-lock.json`). `tsx` es dependencia de runtime: `npm start` funciona tras `npm ci --omit=dev`. `esbuild` va en `^0.28` por el peer de vite 8; bajarlo vuelve a dar `ERESOLVE`.

## Arquitectura y Componentes
- **Motor de Enrutamiento (`src/lib/routerEngine.ts`):** Clasificación por entropía de Shannon sobre caracteres del prompt + Thompson Sampling Beta-Bernoulli (+2/+1, +3/+1.5).
- **Persistencia (`src/server/sqliteStore.ts`):** SQLite en modo WAL (`data/entropos_production_store.db`) con cifrado en reposo AES-256-GCM para claves de proveedores.
- **Protocolos Soportados:** Endpoint MCP HTTP/SSE en `/mcp` con herramienta `smart_generate`, y proxy virtual compatible con OpenAI en `/v1/chat/completions` y `/v1/models`.
- **Zero Data Retention (ZDR):** Política de retención por defecto (`metadata_only`) que no persiste snippets ni prompts completos en almacenamiento persistente.
- **Navegación de Consola:** 6 pestañas canónicas (Inicio, Conectar, Actividad, Enrutamiento, Proveedores, Plan) con menú desplegable responsive para móviles (< 768px).

## Gotchas y Reglas Críticas
- El servidor arranca sin `GEMINI_API_KEY` (solo registra un aviso). Si ningún proveedor responde, `/api/route`, `/v1/chat/completions` y `/api/chat` devuelven 503 y `smart_generate` devuelve `isError: true`; nada se registra como ahorro. Cero respuestas simuladas en producción.
- Los nombres de modelo del motor no son ids de API: `src/server/modelCatalog.ts` los traduce. Las claves salen de `providerKey()` (env `*_API_KEY`, luego el store cifrado en SQLite).
- Hay dos tipos de credenciales:
  1. Token de admin (`ENTROPOS_ADMIN_TOKEN`, `requireAdmin` en `src/server/guards.ts`): para rutas `/api/*` que mutan o gastan crédito.
  2. Clave de workspace (`Bearer entropos_...`): para `/v1`, `/mcp` y `/mcp/sse`. Solo se muestra una vez al generarse y se almacena hasheada en SQLite.
- El navegador nunca importa `src/lib/routerEngine.ts` directamente. Todo lo público pasa por `src/server/publicView.ts`.
- Tras tocar cliente o endpoints: `npm run build` y verificar que ningún identificador interno del motor se filtre al bundle.

## Never
- No forzar `git add -f data/*.db` ni commitear `.env*` (solo `.env.example`).

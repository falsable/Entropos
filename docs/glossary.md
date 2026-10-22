# Glosario y Estándares Canónicos de Entropos

Este documento define la nomenclatura canónica, cifras de referencia y estándares de datos de **Entropos**. Todo componente de frontend, documentación pública y API del servidor debe respetar estrictamente estas definiciones para garantizar coherencia y honestidad ante el usuario.

---

## 1. Planes de Suscripción

| Identificador (`id`) | Nombre Canónico | Precio Mensual | Cuota Mensual | Audiencia / Enfoque |
| :--- | :--- | :--- | :--- | :--- |
| `developer` | **Developer** | $0 / mes | 50.000 peticiones | Desarrolladores individuales conectando Claude Code, Cursor o Windsurf. |
| `pro` | **Pro** | $29 / mes ($24/mes anual) | 1.000.000 peticiones | Ingenieros activos con alto volumen diario y uso de claves propias (BYOK). |
| `enterprise` | **Enterprise** | $199 / mes ($159/mes anual) | Ilimitado org-wide | Equipos y empresas con gobernanza centralizada, aislamiento estricto y SLAs. |

> **Regla de nomenclatura:** Nunca utilizar variantes como *"Developer Free"*, *"Pro Engineer"* o *"Team & Enterprise"* fuera de textos descriptivos. En la UI, cabeceras y bases de datos, los nombres son unívocamente **Developer**, **Pro** y **Enterprise**.

---

## 2. Modos de Enrutamiento (`RoutingMode`)

| Identificador (`id`) | Nombre Canónico | Nombre Corto | Ahorro Proyectado | Comportamiento |
| :--- | :--- | :--- | :--- | :--- |
| `adaptive` | **Adaptive Control Plane** | Adaptive | ~82% proyectado | *(Flagship)* Clasificación en lazo cerrado con calibración bayesiana continua a partir del feedback de agentes. |
| `balanced` | **Balanced Smart Heuristic** | Balanced | ~82% proyectado | Clasificación dinámica de complejidad sintáctica por AST y palabras clave. |
| `cost_saver` | **Speed & Cost Saver** | Cost Saver | ~95% proyectado | Máximo throughput y menor coste; prioriza modelos de borde como Gemini Flash-Lite y Claude Haiku. |
| `max_quality` | **Maximum Quality** | Max Quality | ~50% proyectado | Despacho exclusivo hacia modelos de razonamiento y frontera (Claude Sonnet/Opus, GPT-6, DeepSeek R1). |

---

## 3. Catálogo de Modelos Soportados

| Proveedor | Nombre de Catálogo | Identificador API | Rol Típico |
| :--- | :--- | :--- | :--- |
| **Anthropic** | `Claude Sonnet 5.5` | `claude-sonnet-5-5` | Codificación avanzada y razonamiento de memoria segura |
| **Anthropic** | `Claude Opus 5.5` | `claude-opus-5-5` | Modelo de frontera de referencia para baseline de costes |
| **Anthropic** | `Claude Haiku 5.5` | `claude-haiku-5-5` | Tareas rápidas y resúmenes de bajo coste |
| **Google Gemini** | `Gemini 3.8 Flash` | `gemini-3.8-flash` | Peticiones generales de ultra-baja latencia (sub-120ms) |
| **Google Gemini** | `Gemini 3.1 Flash-Lite`| `gemini-3.1-flash-lite` | Consultas de extracción masiva y throughput extremo |
| **Google Gemini** | `Gemini 3.1 Pro Preview` | `gemini-3.1-pro-preview`| Tareas complejas multimodal y contexto extendido |
| **Google Gemini** | `Gemini 3.5 Flash` | `gemini-3.5-flash` | Asistente conversacional de la consola |
| **OpenAI** | `GPT-6 Astra` | `gpt-6-astra` | Razonamiento general de frontera |
| **OpenAI** | `GPT-6.1 Sol` | `gpt-6.1-sol` | Tareas de alto volumen y velocidad |
| **OpenAI** | `o3-mini` | `o3-mini` | Razonamiento matemático y lógica formal |
| **DeepSeek** | `DeepSeek R1` | `deepseek-v4-pro` | Razonamiento matemático y código competitivo |

> **Regla de modelos:** No usar nombres deprecados o inexistentes como *"Claude 3.5 Sonnet"* o *"Gemini 4 Argon"*. Si un proveedor actualiza su API, se documenta en el catálogo y se mapea mediante `modelCatalog.ts`.

---

## 4. Prefijos de Claves y Tokens

| Entidad | Prefijo Canónico | Ejemplo | Uso |
| :--- | :--- | :--- | :--- |
| Clave de Workspace | `entropos_live_` | `entropos_live_xK9...` | Token de autorización de cliente para `/mcp` y `/v1`. |
| Token de Administrador | `entropos_admin_` | `entropos_admin_...` | Autenticación en rutas de gestión interna `/api/*`. |
| Petición Real | `req_` | `req_mcp_1a2b3c`, `req_v1_...` | Identificador de ejecución registrada en el historial. |
| Petición Simulada | `sim_` | `sim_mcp_1a2b3c` | Ejecución de demostración (marcada con chip `Simulado`). |

> **Regla de prefijos:** El prefijo legado `jev_live_` ha sido sustituido por `entropos_live_`.

---

## 5. Cifras Públicas y Fórmulas de ROI

Toda métrica comercial o técnica mostrada al usuario se rige por una única fórmula centralizada en `src/constants/roi.ts`:

1. **Tarifa Base de Frontera (Frontier Baseline):**
   - **$14.00 USD por millón de tokens** (tarifa combinada estimada de modelos monolíticos como Claude Opus / Sonnet).
2. **Tarifa Combinada con Entropos (Blended Cost):**
   - **$2.52 USD por millón de tokens** (mezcla ponderada de modelos inteligentes y modelos de borde).
3. **Porcentaje de Ahorro Proyectado:**
   - **82% proyectado**
   - Fórmula matemática exacta:
     $$\text{Ahorro} = \frac{14.00 - 2.52}{14.00} = \frac{11.48}{14.00} = 82\%$$
4. **Etiquetado de Honestidad:**
   - Toda cifra pública de ahorro o rendimiento no proveniente de mediciones de telemetría en vivo debe llevar la etiqueta explícita **"(proyectado)"** o **"(estimado)"**.
   - Los contadores de la consola (`totalRequests`, `totalSavedUsd`, `averageDiscountPct`) solo computan peticiones reales y mediatas de clientes conectados y del Playground.

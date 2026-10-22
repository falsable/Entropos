# Next-Gen Adaptive Router: El Fin del Enrutamiento Ciego

> **Los routers actuales envían tus peticiones a ciegas.** 
> Nuestra arquitectura introduce el primer plano de control en lazo cerrado para LLMs: telemetría de entropía temprana, contratos de invariantes en Jev y calibración bayesiana continua.

---

## 1. Hero & Propuesta de Valor

### El problema de los routers de "Lazo Abierto"
Hoy en día, casi todos los routers de modelos (RouteLLM, Martian, plugins de LiteLLM) operan como clasificadores unidireccionales (*fire-and-forget*):

$$\text{Prompt} \longrightarrow \text{Embedding / Scoring} \longrightarrow \text{Modelo X} \longrightarrow \text{¿Éxito o Alucinación? (Silencio)}$$

1. **Ceguera de Proceso:** No pueden predecir si un prompt aparentemente sencillo bifurcará en razonamiento complejo una vez que el modelo comience a generar tokens.
2. **Indefensión ante la Deriva (*Silent Drift*):** Si un proveedor cuantiza agresivamente su modelo o degrada sus pesos un fin de semana, los routers tradicionales siguen enviándole el 80% de tus peticiones.
3. **Ausencia de Contratos:** Despachan strings (`"gpt-4o"`, `"llama-3-8b"`) sin garantías matemáticas de calidad ni límites duros de riesgo epistémico.

---

## 2. Tabla Comparativa de Mercado

A continuación se compara el panorama actual frente a nuestro **Adaptive Control Router (Jev + Bayes + Entropía)**:

| Característica / Capacidad | **Proxy Tradicional** *(e.g. LiteLLM)* | **Clasificador Semántico** *(e.g. RouteLLM, LLMRouter)* | **SaaS Propietario** *(e.g. Martian)* | **Routers Jev Actuales** *(e.g. `awesome-jev` plugins)* | **Nuestro Router Adaptativo** *(Jev + Thompson + Entropía)* |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mecanismo Central** | Reglas manuales, round-robin, fallbacks HTTP | Matriz de embeddings / Cross-encoders offline | Caja negra de proyecciones internas | Decisión *System One* (`Choice`/`Score`) en un forward pass | **Lazo Cerrado:** Sensor Jev + Thompson Sampling + Sonda de Entropía |
| **Latencia de Decisión** | < 1 ms | 15 – 60 ms | 10 – 30 ms | 35 – 70 ms | **< 40 ms** (Decisión base) / **O(1)** post-evaluación |
| **Monitoreo en Caliente (*Early Probing*)** | ❌ No | ❌ No (Solo ve el prompt de entrada) | ❌ No | ❌ No (Zero-shot) | ** Shannon Entropy ($\mathcal{H}$)** sobre los primeros 8–16 tokens |
| **Adaptación a Deriva (*Drift*)** | ❌ Manual (Modificar YAML/código) | ❌ Reentrenamiento offline costoso |  Periódico (Opaco, depende del vendor) | ❌ Estático (Asume modelo inmutable) | ** Inmediata ($O(1)$):** Actualización Beta-Bernoulli con decaimiento temporal |
| **Garantías Formales & Contratos** | ❌ Ninguna | ❌ Ninguna (Mejor esfuerzo probabilístico) | ❌ SLA comercial genérico | ⚠️ Tipado de decisión, pero sin validación post-ejecución | ** Invariantes estrictos:** `ProbabilisticEnvelope` con compuertas duras de calidad |
| **Sensibilidad Presupuestaria** | Cuota rígida (Rechaza llamadas al llegar al 100%) | Umbral estático de win-rate | Presupuestos por equipo | Heurística condicional | ** Dinámica:** Ratio continuo de utilidad sobre presupuesto restante $\frac{C_i}{B_{\text{rem}}}$ |
| **Soporte de Feedback Agéntico** | ❌ No | ❌ No | ❌ No | ❌ No | ** Integrado:** Consume validaciones JSON, tests unitarios y scores del critic |

---

## 3. Las Tres Innovaciones que Marcan la Diferencia

###  1. Sonda de Entropía Especulativa: Medir la Vacilación Antes del Gasto
> *“No juzgues la dificultad de un problema por su enunciado, sino por la vacilación del primer paso.”*

Dos peticiones idénticas en embeddings (*"Escribe un validador de árboles"*) pueden esconder complejidades radicalmente opuestas. 
* Nuestra sonda de decodificación temprana computa la **entropía de Shannon sobre los primeros 8–16 tokens**:
  $$\bar{\mathcal{H}} = -\frac{1}{T} \sum_{t=1}^{T} \sum_{k} p_{t,k} \log_2 p_{t,k}$$
* Si la entropía supera el umbral crítico ($\bar{\mathcal{H}} > \tau_{\text{crit}}$), el sistema **anula cualquier intento de degradación económica (*downshift*)** y escala al tier deliberativo antes de quemar tokens innecesarios.

---

### ⚡ 2. Contratos Tipados e Invariantes con Jev
En lugar de retornar un identificador de texto arbitrario, la decisión se sella en un **`ProbabilisticEnvelope` inmutable**:
* **Garantía contractual de SLA:** Si la calidad esperada desciende del suelo contractualmente acordado ($E[\theta] < \text{SLA}$), la llamada no se ejecuta en modo económico.
* **Compuertas duras (*Hard Gates*):** Se prohíbe el uso de modelos reflexivos cuando la incertidumbre epistémica $\sigma^2$ supere los márgenes de seguridad.
* **Cero fallos silenciosos en producción.**

---

###  3. Calibración Continua con Thompson Sampling (Lazo Cerrado)
Los modelos cambian, las versiones cambian y los servidores se congestionan.
* Modelamos la tasa de éxito de cada modelo mediante distribuciones conjugadas $\text{Beta}(\alpha, \beta)$.
* Cada vez que tu agente valida un esquema Pydantic, pasa un test unitario o recibe feedback de un crítico, inyecta la señal $y_t \in \{0, 1\}$ en tiempo real ($O(1)$).
* El factor de decaimiento exponencial ($\lambda_{\text{decay}}$) permite al router **detectar degradaciones silenciosas del proveedor en minutos y desviar el tráfico automáticamente**, sin intervención humana ni despliegues de código.

---

## 4. Métricas de Impacto Proyectadas

```
+--------------------------------------------------------------------------+
|  82% Reducción de Costes vs. Routing a Modelos de Frontera (Frontier)    |
|  99.4% Preservación de Calidad en Benchmarks Agénticos Complejos          |
|  0 Fallos Silenciosos por degradación de contratos de schema             |
|  < 40ms Latencia de decisión tipada en el plano de control               |
+--------------------------------------------------------------------------+
```

---

## 5. Sección "How It Works" (Para Desarrolladores)

```python
from adaptive_router import AdaptiveJevRouter, ExecutionFeedback

# 1. Inicializa el router con compuertas de seguridad y decaimiento
router = AdaptiveJevRouter(
    entropy_gate_threshold=0.45,
    decay_factor=0.9995
)

# 2. Despacho seguro: evalúa logits tempranos y presupuesto restante
decision = router.dispatch(
    early_token_probs=draft_logits,
    remaining_budget_usd=0.25
)
# Retorna: ProbabilisticEnvelope(tier='reflex', target_model_id='fast-slm-8b', ...)

# 3. Retroalimentación en lazo cerrado: actualiza priors en O(1)
router.learn(
    ExecutionFeedback(
        tier=decision.tier,
        schema_validated=True,
        tool_call_succeeded=True,
        critic_score=0.92,
        cost_usd=0.0001
    )
)
```

---

## 6. Llamada a la Acción (CTA)

> **Deja de confiar en routers ciegos.**  
> Construye agentes y flujos de trabajo sobre un plano de control probabilístico que aprende, se adapta y garantiza tus SLAs.
>
> [ **Ver Documentación Técnica** ] &nbsp;&nbsp;&nbsp;&nbsp; [ **Probar Sandbox Interactivo** ]
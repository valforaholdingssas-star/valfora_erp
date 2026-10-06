# Especificación técnica — Módulo de IA (Seeds ERP)

Documento para **replicar el comportamiento** en otra herramienta. Stack real: Django + Celery + Redis + OpenAI SDK + React. **No usa pgvector**; los embeddings viven en `JSONField` y el ranking es cosine en Python (numpy).

---

## 1. Vista general

El módulo tiene **4 capas**:

| Capa | App / área | Responsabilidad |
|------|------------|-----------------|
| Configuración de agentes | `apps.ai_config` | Perfiles LLM (prompt, tono, modelo, RAG, cuota, moderación) + runtime (API key, embeddings, modo IA global, Calendar, Unipile) |
| RAG | `apps.rag` | Indexar docs CRM → chunks + embeddings; retrieval top-K |
| Orquestación chat | `apps.chat` | Auto-respuesta, handoff, debounce, locks, persistencia `ai_bot` |
| Extensiones | CRM / Calendar | Resumen comercial de deals; booking por Google Calendar (corta el LLM) |

**Principio de seguridad:** la API key del LLM **nunca** va al frontend. Todas las llamadas OpenAI pasan por el backend.

### Estructura de archivos relevante

#### `BACKEND/apps/ai_config/`

| Archivo | Rol |
|---------|-----|
| `models.py` | `EncryptedTextField`, `AIConfiguration`, `AIRuntimeSettings` |
| `services.py` | Prompt build, OpenAI completion, moderación |
| `runtime.py` | Resolvers DB-first / env-fallback |
| `quota.py` | Presupuesto diario de tokens en Redis |
| `viewsets.py` | CRUD + test + runtime settings API |
| `serializers.py` | Serializers de config y runtime |
| `permissions.py` | `HasAIConfigPermission` (módulo `ai_config`) |
| `urls.py` | Montado en `/api/v1/ai-config/` |

#### `BACKEND/apps/rag/`

| Archivo | Rol |
|---------|-----|
| `models.py` | `DocumentChunk` |
| `chunking.py` | `CHUNK_SIZE=1000`, `CHUNK_OVERLAP=120` |
| `embeddings.py` | Embeddings OpenAI |
| `retrieval.py` | Cosine top-K |
| `services.py` | `index_document` |
| `text_extract.py` | Extracción PDF/txt |
| `tasks.py` | `rag.tasks.index_crm_document` |
| `signals.py` | Reindex al guardar `Document` |
| — | **No hay `urls.py` / viewsets** (sin API HTTP dedicada) |

#### Chat IA (`BACKEND/apps/chat/`)

| Archivo | Rol |
|---------|-----|
| `models.py` | `ai_mode_enabled`, `ai_configuration`, handoff, `is_ai_generated` |
| `signals.py` | Keywords de handoff + encolar reply IA |
| `tasks.py` | Pipeline `generate_ai_reply_for_message` |
| `ai_reply_guard.py` | Debounce / lock / staleness |
| `handoff.py` | Patrones de keywords |
| `viewsets.py` | `toggle-ai`, `ai-mode-global`, `clear-handoff` |

#### Frontend

| Ruta | Rol |
|------|-----|
| `FRONTEND/src/features/ai-config/pages/AIConfigPage.jsx` | UI de configuración IA |
| `FRONTEND/src/api/aiConfig.js` | Cliente API |
| Chat (`ChatView.jsx`, `ChatThread.jsx`, `api/chat.js`) | Toggle modo IA, agente, handoff |
| Ruta UI | `/settings/ai` |

---

## 2. Arquitectura (flujo)

```
Mensaje entrante (WhatsApp / UI / LinkedIn)
        │
        ▼
Message(sender_type=contact) persistido
        │
        ├─► ¿keywords handoff? ──sí──► Conversation.human_handoff_requested=true  (no IA)
        │
        └─► ¿ai_mode_enabled && !handoff?
                │
                ▼
        Celery apply_async(countdown=4s)
        generate_ai_reply_for_message(inbound_id)
                │
                ├─ guards: latest inbound, no reply previa, Redis lock
                ├─ maybe_handle_calendar_booking → si aplica: Message(ai_bot) + WhatsApp
                ├─ pre-check cuota tokens
                ├─ build_openai_messages:
                │     system (rol/objetivo/tono/estilo/prompt [+ política Calendar])
                │     + contexto CRM
                │     + RAG top-K (si rag_enabled)
                │     + historial N mensajes
                │     + user = inbound
                ├─ OpenAI chat.completions
                ├─ reserve tokens Redis
                ├─ moderación OpenAI (si moderation_enabled)
                └─ Message(ai_bot, is_ai_generated=true, ai_context_used=audit)
                        └─► WhatsApp send / WebSocket

Paralelo admin:
  /settings/ai → CRUD AIConfiguration + RuntimeSettings + docs KB
Paralelo CRM:
  Document save → Celery index_crm_document
  Deal → etapa llamada / ventana WA → generate_business_summary_for_deal
```

---

## 3. Modelos de datos (exactos)

Todos heredan `BaseModel`: `id` UUID, `created_at`, `updated_at`, `is_active=True`.

### 3.1 `AIConfiguration` — perfil de agente

| Campo | Tipo | Default |
|-------|------|---------|
| `name` | Char(120) | `"Default"` |
| `system_prompt` | Text | blank |
| `objective` | Text | blank |
| `role` | Text | blank |
| `tone` | Text | blank |
| `style` | Text | blank |
| `temperature` | Float | `0.7` |
| `max_tokens` | PositiveInt | `512` |
| `llm_model` | Char(80) | **`gpt-4o-mini`** |
| `is_default` | Bool (index) | `False` — al guardar `True`, desmarca otros |
| `max_history_messages` | PositiveSmall | `20` |
| `moderation_enabled` | Bool | `True` |
| `daily_token_budget_per_conversation` | PositiveInt | **`100_000`** (0 = ilimitado) |
| `rag_enabled` | Bool | `True` |
| `rag_top_k` | PositiveSmall | `5` |

Relaciones: `Conversation.ai_configuration` (SET_NULL), `Document.ai_configuration` (KB del agente).

### 3.2 `AIRuntimeSettings` — singleton `singleton_key="default"`

| Campo | Tipo | Default / notas |
|-------|------|-----------------|
| `openai_api_key` | EncryptedText | Fernet derivado de `SECRET_KEY`, prefijo `enc::` |
| `openai_embedding_model` | Char(120) | **`text-embedding-3-small`** |
| `openai_moderation_disabled` | Bool | `False` |
| `global_ai_mode_enabled` | Bool | `False` |
| Google Calendar | enabled, calendar_id, tz=`America/Bogota`, slot=`30` min, window=`7` días, SA JSON encrypted, delegated user email | |
| Unipile/LinkedIn | base URL, keys, caps diarios 40/1000/50 | |

Resolución de secretos: **DB primero**, fallback a env (`OPENAI_API_KEY`, etc.).

### 3.3 `DocumentChunk` (RAG)

| Campo | Tipo | Default |
|-------|------|---------|
| `document` | FK → `crm.Document` CASCADE | |
| `chunk_index` | PositiveInt | unique con document |
| `text` | Text | truncado a ~12000 al indexar |
| `embedding` | **JSONField** (lista float) | `[]` — **no pgvector** |
| `embedding_model` | Char(80) | `text-embedding-3-small` |
| `token_count` | PositiveInt | approx palabras |

Dimensión típica: **1536** (`text-embedding-3-small`).

### 3.4 Chat

**`Conversation`:**

- `ai_mode_enabled` Bool default `False`
- `ai_configuration` FK nullable
- `human_handoff_requested` Bool default `False`
- `human_handoff_at` DateTime nullable

**`Message`:**

- `sender_type` incluye `"ai_bot"`
- `is_ai_generated` Bool default `False`
- `ai_context_used` JSON — audit (usage, moderation, model, quota)

### 3.5 Fuente RAG — `crm.Document`

Campos relevantes: `ai_configuration`, `is_global_knowledge`, `contact`, `deal`, archivo.

**Gap a replicar conscientemente:** el retrieval usa  
`contact_id OR deal.contact_id OR ai_configuration_id`.  
**No** OR-ea `is_global_knowledge` (el flag existe en UI pero no entra en la query de retrieval).

### 3.6 Cuotas

No hay tabla de usage. Redis:

- Uso: `ai:tokens:conv:{conversation_id}:{YYYY-MM-DD}` — `INCRBY`, TTL 2 días
- Lock: `ai:reply:lock:{conversation_id}` — TTL `AI_REPLY_LOCK_TTL_SECONDS` (default **120**)

---

## 4. Construcción del prompt

Función: `build_openai_messages(trigger_message, config)` en `apps.ai_config.services`.

### 4.1 System prompt (`_build_system_prompt`)

Bloques concatenados (si no vacíos):

```
Rol: {role}
Objetivo: {objective}
Tono: {tone}
Estilo: {style}
{system_prompt}
[+ política Google Calendar si calendar ready]
```

Fallback si todo vacío:

> `Eres un asistente comercial profesional. Responde en español, de forma breve y útil.`

### 4.2 Contexto CRM (inyectado al system)

```
--- Contexto CRM ---
Contacto: {nombre} · email: {email}
Etapa: {lifecycle_stage} · intención: {intent_level}
Empresa: {opcional}
Notas CRM: {notes[:4000]}
```

### 4.3 RAG (si `rag_enabled`)

1. Query = contenido inbound `[:2000]`
2. `embed_query(query)`
3. `retrieve_relevant_chunks(contact_id, ai_configuration_id=config.id, top_k=clamp(1..20))`
4. Inyectar:

```
--- Documentos CRM (RAG) ---
[sim 0.xxx] {chunk_text[:1200]}
...
```

### 4.4 Historial

- Últimos `max_history_messages` (default 20), orden cronológico
- Mapeo roles: `contact` → `user`; `user` / `ai_bot` → `assistant`
- El inbound actual se añade al final como `user` (no se duplica del historial)

### 4.5 Completion

```python
client.chat.completions.create(
    model=config.llm_model,      # default gpt-4o-mini
    temperature=config.temperature,
    max_tokens=config.max_tokens,
    messages=[...]
)
```

Retorno tipado: `CompletionResult(text, prompt_tokens, completion_tokens, total_tokens)`.

Otras funciones clave en `apps.ai_config.services`:

- `get_default_ai_configuration()`
- `resolve_ai_configuration_for_conversation(conv)` — FK por conversación o default
- `build_openai_test_messages(...)` — system + user (sandbox)
- `generate_chat_completion(...)`
- `moderate_openai_text(text)` → `(allowed, audit)`

---

## 5. Pipeline RAG (indexación)

Trigger: `post_save` de `crm.Document` → Celery `rag.tasks.index_crm_document`.

```
extract_text (txt / PDF / fallback utf-8[:500k])
  → chunk_text(CHUNK_SIZE=1000, CHUNK_OVERLAP=120)  # por caracteres
  → embed_texts en batches de 16
  → borrar chunks viejos del document
  → bulk_create DocumentChunk
```

**Retrieval** (`apps.rag.retrieval.retrieve_relevant_chunks`):

1. Docs candidatos: `documents_for_contact(contact_id, ai_configuration_id)`
2. Carga **todos** los chunks activos de esos docs
3. Cosine: `dot / (||a|| * ||b||)` (numpy)
4. Sort desc → top-K

Sin ANN, sin índice vectorial en DB.

---

## 6. Auto-respuesta de chat (detalle operativo)

### 6.1 Encolado

Tras guardar mensaje `contact`:

1. Detectar handoff por keywords
2. Si `ai_mode_enabled && !human_handoff_requested` →  
   `generate_ai_reply_for_message.apply_async(countdown=AI_REPLY_DEBOUNCE_SECONDS)`  
   Default debounce: **4 segundos**

### 6.2 Keywords handoff (`apps.chat.handoff`)

Regex (ES/EN), ejemplos:

- `\b(humano|persona|agente|operador|asesor|representante)\b`
- `\b(hablar con alguien|atención humana|no quiero (un )?bot)\b`
- `\b(human|agent|representative|real person)\b`

### 6.3 Guards en la task `generate_ai_reply_for_message`

1. Skip si handoff / `!ai_mode_enabled` / no es contact / ya es AI
2. Solo responde al **último** mensaje contact de la conversación
3. Skip si ya hay reply AI posterior al inbound
4. Redis lock por conversación; retry 3× cada 5s; fail-open si Redis cae
5. Tras lock, revalidar “sigue siendo el latest”
6. Resolver config: FK conversación → else `is_default`
7. **Calendar short-circuit** (`maybe_handle_calendar_booking`) antes del LLM genérico
8. Pre-check cuota: `usage + 4000 + max_tokens > budget` → mensaje de cuota agotada
9. Completion → sanitizar ofertas Calendar inventadas si aplica
10. Si inbound ya no es latest → soft-delete reply y re-encolar latest
11. `try_reserve_conversation_tokens` post-completion
12. Si `moderation_enabled`: `moderations.create(model="omni-moderation-latest")`; si flag → handoff + respuesta segura
13. Persistir `Message(sender_type="ai_bot", is_ai_generated=True, ai_context_used=...)`
14. Canal WhatsApp → `send_whatsapp_outbound.delay`

### 6.4 Modo IA global vs por conversación

- `POST .../ai-mode-global/` (admin): setea `AIRuntimeSettings.global_ai_mode_enabled` y **bulk-update** `Conversation.ai_mode_enabled`
- La task **solo mira** `conversation.ai_mode_enabled` (el global es un “bulk setter”, no un override permanente)

### 6.5 Moderación

- Por perfil: `AIConfiguration.moderation_enabled` (default `True`)
- Kill-switch global: env `OPENAI_MODERATION_DISABLED` o runtime `openai_moderation_disabled`
- Sin API key → allow + audit `"skipped_no_api_key"`

### 6.6 Tareas Celery relacionadas

| Nombre | Módulo |
|--------|--------|
| `chat.tasks.generate_ai_reply_for_message` | chat |
| `rag.tasks.index_crm_document` | rag |
| `crm.tasks.generate_business_summary_for_deal` | CRM summaries |
| `crm.tasks.advance_closed_whatsapp_conversations` | puede encolar summaries |

---

## 7. API HTTP a replicar

Base: `/api/v1/ai-config/` — permisos: admin/super_admin + módulo `ai_config`.

| Método | Path | Notas |
|--------|------|-------|
| CRUD | `/configurations/` | Soft delete → `is_active=False` |
| POST | `/configurations/{id}/test/` | body `{message}` max 8000 → `{reply, prompt_tokens, completion_tokens, total_tokens}` |
| GET/PATCH | `/runtime-settings/current/` | secrets write-only; lectura enmascarada `••••last4` |
| POST | `/runtime-settings/test-google-calendar/` | probe de conexión |

**Campos del serializer de config:** id, name, system_prompt, objective, role, tone, style, temperature, max_tokens, llm_model, is_default, max_history_messages, moderation_enabled, daily_token_budget_per_conversation, rag_enabled, rag_top_k, timestamps.

Chat (`/api/v1/chat/conversations/`):

| Método | Path | Efecto |
|--------|------|--------|
| POST | `{id}/toggle-ai/` | flip `ai_mode_enabled` |
| GET/POST | `ai-mode-global/` | GET `{enabled}`; POST `{enabled}` admin |
| POST | `{id}/clear-handoff/` | limpia handoff |
| PATCH | `{id}/` | puede setear `ai_configuration` |

Los mensajes exponen `is_ai_generated` y `ai_context_used` (se omiten en payloads WebSocket sensibles).

**No hay** endpoints REST `/rag/*`. El RAG es biblioteca + Celery; los docs se suben por API CRM de documentos (`ai_configuration`, `is_global_knowledge`).

---

## 8. Variables de entorno

| Variable | Uso | Default |
|----------|-----|---------|
| `OPENAI_API_KEY` | Fallback si no hay key en DB | vacío |
| `OPENAI_EMBEDDING_MODEL` | Fallback embedding | `text-embedding-3-small` |
| `OPENAI_MODERATION_DISABLED` | Kill-switch moderación | false |
| `OPENAI_DEFAULT_MODEL` | Solo documentación; el modelo real es DB `llm_model` | `gpt-4o-mini` |
| `REDIS_CACHE_URL` | Cuotas + locks | `redis://127.0.0.1:6379/2` |
| `AI_REPLY_DEBOUNCE_SECONDS` | Countdown Celery | `4` |
| `AI_REPLY_LOCK_TTL_SECONDS` | TTL lock | `120` |

### DB vs env

- **Por agente** (prompts, modelo, temp, RAG, budget): DB `AIConfiguration`
- **Runtime** (API key, embedding model, moderation off, IA global, Google Calendar, Unipile): DB `AIRuntimeSettings` con fallback env para keys/modelos

---

## 9. Frontend (qué replicar en UI)

| Ruta / UI | Comportamiento |
|-----------|----------------|
| `/settings/ai` | CRUD perfiles; dropdown modelos `gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini`, `gpt-4.1`; runtime key/embedding/moderation/IA global/Calendar/Unipile; upload docs KB ligados a `ai_configuration`; sandbox `test` |
| Chat thread | Botón **Modo IA** → `toggle-ai`; selector de agente → patch `ai_configuration`; banner handoff → `clear-handoff`; switch **IA global** (admin) |
| Mensajes | Marcar visualmente `is_ai_generated` |

Permisos UI: edición admin/super_admin; módulo `ai_config.view` para ver.

---

## 10. Extensiones adyacentes (incluir si quieres paridad)

1. **Resumen comercial CRM** — `crm.tasks.generate_business_summary_for_deal`: LLM → `Deal.business_notes` (típ. deals WhatsApp que entran a etapa llamada).
2. **Booking Calendar** — `calendar_app/booking_ai.py`: NLU + slots Google; puede responder **sin** pasar por el completion genérico; también inyecta política en el system prompt.
3. **LinkedIn/Unipile** — credenciales y caps en `AIRuntimeSettings` (no es el core del chat IA, pero vive en el mismo runtime).

---

## 11. Constantes cheat-sheet (para portar 1:1)

| Concepto | Valor |
|----------|-------|
| LLM default | `gpt-4o-mini` |
| Embedding | `text-embedding-3-small` (~1536d) |
| Moderación | `omni-moderation-latest` |
| Chunk / overlap | 1000 / 120 **chars** |
| Batch embeddings | 16 |
| RAG top_k | 5 (clamp 1–20) |
| Historial | 20 msgs |
| Temp / max_tokens | 0.7 / 512 |
| Budget diario/conv | 100_000 tokens |
| Debounce reply | 4 s |
| Lock TTL | 120 s |
| Vector store | JSON + numpy cosine |
| Cifrado secrets | Fernet(SHA256(SECRET_KEY)) + prefijo `enc::` |

---

## 12. Checklist de replicación mínima

1. Tabla/perfil de agente con los campos de §3.1
2. Runtime singleton con API key cifrada + embedding model
3. Indexador docs → chunks + embeddings
4. Retrieval cosine top-K scoped por contacto/agente
5. Builder de messages: system + CRM + RAG + history
6. Worker asíncrono con debounce, lock, “solo latest inbound”
7. Handoff por keywords + flag conversación
8. Cuota Redis por conversación/día
9. Moderación post-completion
10. Toggle IA por conversación + bulk global
11. UI admin + toggle en inbox
12. Nunca exponer API keys al cliente

---

## 13. Referencias de código

| Concepto | Ubicación |
|----------|-----------|
| Modelos IA | `BACKEND/apps/ai_config/models.py` |
| Prompt + completion | `BACKEND/apps/ai_config/services.py` |
| Runtime resolvers | `BACKEND/apps/ai_config/runtime.py` |
| Cuotas Redis | `BACKEND/apps/ai_config/quota.py` |
| Chunking | `BACKEND/apps/rag/chunking.py` |
| Embeddings | `BACKEND/apps/rag/embeddings.py` |
| Retrieval | `BACKEND/apps/rag/retrieval.py` |
| Task reply IA | `BACKEND/apps/chat/tasks.py` |
| Guards / locks | `BACKEND/apps/chat/ai_reply_guard.py` |
| Handoff keywords | `BACKEND/apps/chat/handoff.py` |
| UI settings | `FRONTEND/src/features/ai-config/pages/AIConfigPage.jsx` |

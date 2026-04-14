# SEEDS ERP — Documento de Contrato y Planificación del Proyecto

> **Proyecto**: Seeds ERP  
> **Empresa**: Valfora Holdings  
> **Versión del documento**: 1.1  
> **Fecha**: Marzo 2026  
> **Tipo**: Contrato de contexto y planificación para agente de IA (Cursor)

---

## 1. DESCRIPCIÓN GENERAL DEL PROYECTO

### 1.1 Visión
Seeds ERP es una plataforma multifuncional de gestión empresarial (ERP) diseñada para Valfora Holdings. Su objetivo es centralizar las operaciones de ventas, comunicación con clientes e inteligencia artificial en una sola plataforma modular, escalable y dockerizada.

### 1.2 Objetivo Técnico
Crear una aplicación web fullstack con arquitectura modular que permita:
- Gestión de relaciones con clientes (CRM)
- Comunicación en tiempo real vía WhatsApp y chat interno
- Automatización de respuestas con inteligencia artificial (RAG)
- Sistema de roles y permisos granular
- Administración centralizada
- Escalabilidad para agregar nuevos módulos en el futuro

### 1.3 Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend | Python + Django | 3.12+ / 5.x |
| API | Django REST Framework | 3.15+ |
| Frontend | React JS | 18+ |
| Template UI | Jampack React-Bootstrap SaaS App | Última estable |
| Base de datos | PostgreSQL | 15+ |
| Cache / Broker | Redis | 7+ |
| Tareas asíncronas | Celery + Celery Beat | 5.x |
| WebSockets | Django Channels | 4.x |
| Contenedores | Docker + Docker Compose | Latest |
| Servidor web | Nginx | 1.25+ |
| Autenticación | JWT (simplejwt) | Latest |
| IA / LLM | OpenAI API (o compatible) | Latest |
| Vector Store | pgvector (imagen Docker) + embeddings en JSON (`DocumentChunk`) | Ver §3.4 |
| API WhatsApp | Meta Cloud API (WhatsApp Business) | v18+ |

### 1.4 Alineación documento ↔ código (implementación actual)

Este documento combina la **visión objetivo** con el **estado real del repositorio**. Donde hay diferencia, prima lo implementado; lo pendiente queda explícito en §3 (roadmap) o en **FASE 5**.

- **Backend**: la carpeta del proyecto Django es `backend/` (raíz del repo). Apps activas incluyen `accounts`, `common`, `crm`, `chat`, `ai_config`, **`rag`** (RAG sobre documentos CRM), además de `notifications` solo como **roadmap** (no existe aún la app).
- **API de IA**: prefijo real **`/api/v1/ai-config/`** (ViewSet `configurations`), no `/api/v1/ai/...`.
- **RAG**: modelo **`DocumentChunk`** en `apps.rag`, enlazado a `crm.Document`; embeddings como lista JSON y similitud en aplicación (la imagen PostgreSQL incluye pgvector para evolución futura).
- **Conversación**: no hay FK **`Conversation` → `AIConfiguration`**; se usa la configuración marcada **`is_default`** (extensión futura: por conversación).
- **WebSockets**: rutas reales `ws/chat/<uuid>/` y `ws/user/`; canal dedicado de *typing* **no implementado** aún.
- **Frontend**: contexto global activo **`AuthContext`**; `ThemeContext` / `WebSocketContext` / `NotificationContext` y **`RoleRoute`** son roadmap o uso parcial (p. ej. permisos en página sin componente dedicado). Chat: vista **`ChatView.jsx`** (no subcomponentes con nombres del borrador inicial).
- **Scripts**: `scripts/wait_for_db.py` y `scripts/seed_data.py` existen en el repo; `seed_data` es opcional (config IA por defecto).
- **OpenAPI**: expone **`/api/v1/schema/`** y **`/api/v1/docs/`** (adelantado respecto a la checklist de FASE 5).

---

## 2. ARQUITECTURA DEL SISTEMA

### 2.1 Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────┐
│                    NGINX (Reverse Proxy)             │
│              Static Files / Media / SSL              │
└──────────┬────────────────────┬──────────────────────┘
           │                    │
    ┌──────▼──────┐    ┌───────▼───────┐
    │   React JS  │    │  Django API   │
    │  (Frontend) │    │  (Backend)    │
    │  Port 3000  │    │  Port 8000    │
    └─────────────┘    └───┬───┬───┬───┘
                           │   │   │
              ┌────────────┘   │   └────────────┐
              │                │                │
       ┌──────▼──────┐ ┌──────▼──────┐ ┌───────▼───────┐
       │ PostgreSQL  │ │    Redis    │ │ Celery Worker │
       │   (DB)      │ │  (Cache +   │ │ + Celery Beat │
       │  Port 5432  │ │   Broker)   │ │               │
       └─────────────┘ │  Port 6379  │ └───────────────┘
                       └─────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Django Channels  │
                    │   (WebSockets)    │
                    └───────────────────┘
```

### 2.2 Estructura de Directorios del Proyecto

```
seeds_erp/
├── backend/                          # Proyecto Django
│   ├── config/                       # Configuración del proyecto Django
│   │   ├── __init__.py
│   │   ├── asgi.py                   # ASGI config (Channels)
│   │   ├── celery.py                 # Configuración de Celery
│   │   ├── urls.py                   # URLs raíz
│   │   ├── wsgi.py
│   │   └── settings/
│   │       ├── __init__.py
│   │       ├── base.py               # Settings comunes
│   │       ├── development.py        # Settings de desarrollo
│   │       ├── production.py         # Settings de producción
│   │       └── testing.py            # Settings de testing
│   ├── apps/
│   │   ├── accounts/                 # App de usuarios y autenticación
│   │   │   ├── __init__.py
│   │   │   ├── admin.py
│   │   │   ├── apps.py
│   │   │   ├── models.py             # User, Role, Permission
│   │   │   ├── managers.py           # Custom User Manager
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── viewsets.py
│   │   │   ├── urls.py
│   │   │   ├── permissions.py
│   │   │   ├── signals.py
│   │   │   ├── services.py
│   │   │   ├── tests/
│   │   │   └── migrations/
│   │   ├── crm/                      # App de CRM
│   │   │   ├── __init__.py
│   │   │   ├── admin.py
│   │   │   ├── apps.py
│   │   │   ├── models.py             # Contact, Company, Deal, Activity, Document
│   │   │   ├── managers.py
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── viewsets.py
│   │   │   ├── urls.py
│   │   │   ├── permissions.py
│   │   │   ├── signals.py
│   │   │   ├── services.py
│   │   │   ├── filters.py
│   │   │   ├── tasks.py
│   │   │   ├── tests/
│   │   │   └── migrations/
│   │   ├── chat/                     # App de Chat y WhatsApp
│   │   │   ├── __init__.py
│   │   │   ├── admin.py
│   │   │   ├── apps.py
│   │   │   ├── models.py             # Conversation, Message, MessageAttachment
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   ├── consumers.py          # WebSocket consumers
│   │   │   ├── routing.py            # WebSocket routing
│   │   │   ├── services.py           # WhatsApp API service
│   │   │   ├── tasks.py              # Tareas async de mensajería
│   │   │   ├── signals.py
│   │   │   ├── tests/
│   │   │   └── migrations/
│   │   ├── ai_config/                # App de Configuración de IA (LLM)
│   │   │   ├── __init__.py
│   │   │   ├── admin.py
│   │   │   ├── apps.py
│   │   │   ├── models.py             # AIConfiguration
│   │   │   ├── serializers.py
│   │   │   ├── viewsets.py
│   │   │   ├── urls.py
│   │   │   ├── services.py           # LLM, moderación
│   │   │   ├── tests/
│   │   │   └── migrations/
│   │   ├── rag/                      # Chunks y embeddings (RAG sobre CRM Document)
│   │   │   ├── models.py             # DocumentChunk
│   │   │   ├── services.py           # chunk, embed, retrieve
│   │   │   ├── tasks.py              # Celery: indexación
│   │   │   ├── signals.py
│   │   │   ├── tests/
│   │   │   └── migrations/
│   │   ├── notifications/            # Roadmap (FASE 5) — no presente aún
│   │   │   ├── __init__.py
│   │   │   ├── models.py             # Notification
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── consumers.py          # WebSocket para notificaciones
│   │   │   ├── services.py
│   │   │   ├── tasks.py
│   │   │   └── migrations/
│   │   └── common/                   # App compartida
│   │       ├── __init__.py
│   │       ├── models.py             # BaseModel, AuditLog
│   │       ├── permissions.py        # Permisos base reutilizables
│   │       ├── pagination.py         # Paginación estándar
│   │       ├── exceptions.py         # Excepciones personalizadas
│   │       ├── mixins.py             # Mixins reutilizables
│   │       ├── utils.py              # Utilidades generales
│   │       └── middleware.py         # Middleware personalizado
│   ├── manage.py
│   ├── requirements/
│   │   ├── base.txt                  # Dependencias comunes
│   │   ├── development.txt           # Dependencias de desarrollo
│   │   ├── production.txt            # Dependencias de producción
│   │   └── testing.txt               # Dependencias de testing
│   ├── scripts/
│   │   ├── entrypoint.sh             # Script de entrada Docker
│   │   ├── wait_for_db.py            # Esperar PostgreSQL
│   │   └── seed_data.py              # Datos iniciales
│   └── media/                        # Archivos subidos (gitignored)
├── frontend/                         # Proyecto React
│   ├── public/
│   ├── src/
│   │   ├── api/
│   │   │   ├── axiosConfig.js        # Configuración base de axios
│   │   │   ├── auth.js               # Endpoints de autenticación
│   │   │   ├── crm.js                # Endpoints de CRM
│   │   │   ├── chat.js               # Endpoints de chat
│   │   │   └── aiConfig.js           # Endpoints de config IA
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── common/               # Componentes reutilizables
│   │   │   ├── layout/               # Layout principal (sidebar, header, footer)
│   │   │   └── ui/                   # Componentes del template Jampack
│   │   ├── contexts/
│   │   │   ├── AuthContext.jsx        # Contexto de autenticación (implementado)
│   │   │   ├── ThemeContext.jsx       # Roadmap
│   │   │   ├── WebSocketContext.jsx   # Roadmap (WS usado localmente en chat)
│   │   │   └── NotificationContext.jsx # Roadmap (FASE 5)
│   │   ├── features/
│   │   │   ├── auth/                 # Login, registro, password reset
│   │   │   │   ├── pages/
│   │   │   │   ├── components/
│   │   │   │   └── hooks/
│   │   │   ├── dashboard/            # Dashboard principal
│   │   │   ├── crm/                  # Módulo CRM completo
│   │   │   │   ├── pages/
│   │   │   │   │   ├── ContactsList.jsx
│   │   │   │   │   ├── ContactDetail.jsx
│   │   │   │   │   └── ContactForm.jsx
│   │   │   │   ├── components/
│   │   │   │   │   ├── ContactTable.jsx
│   │   │   │   │   ├── ContactFilters.jsx
│   │   │   │   │   ├── PipelineView.jsx
│   │   │   │   │   └── DocumentsPanel.jsx
│   │   │   │   └── hooks/
│   │   │   ├── chat/                 # Módulo de chat
│   │   │   │   └── pages/
│   │   │   │       └── ChatView.jsx  # Vista principal (UI agregada en un solo archivo)
│   │   │   ├── ai-config/            # Configuración de IA
│   │   │   │   ├── pages/
│   │   │   │   └── components/
│   │   │   └── settings/             # Configuración de la plataforma
│   │   ├── hooks/                    # Hooks globales
│   │   ├── routes/
│   │   │   ├── AppRoutes.jsx
│   │   │   └── PrivateRoute.jsx      # RoleRoute: roadmap (roles vía AuthContext)
│   │   ├── store/                    # Estado global
│   │   ├── styles/                   # SCSS variables, overrides
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── index.js
│   ├── package.json
│   └── .env
├── nginx/
│   ├── nginx.conf                    # Configuración base
│   ├── nginx.dev.conf                # Config desarrollo
│   └── nginx.prod.conf               # Config producción
├── docker/
│   ├── backend/
│   │   └── Dockerfile
│   ├── frontend/
│   │   └── Dockerfile
│   └── nginx/
│       └── Dockerfile
├── docker-compose.yml                # Desarrollo
├── docker-compose.prod.yml           # Producción
├── Makefile                          # Comandos comunes
├── .env.example                      # Template de variables de entorno
├── .gitignore
├── README.md
└── SEEDS_ERP_CONTRACT.md             # Este documento
```

---

## 3. MÓDULOS DEL SISTEMA

### 3.1 MÓDULO: Accounts (Usuarios y Autenticación)

#### 3.1.1 Descripción
Sistema de gestión de usuarios con autenticación JWT, registro, login, recuperación de contraseña, y sistema de roles y permisos granular.

#### 3.1.2 Modelos de Datos

**User** (hereda de AbstractUser):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| email | EmailField (unique) | Email del usuario (usado como username) |
| first_name | CharField | Nombre |
| last_name | CharField | Apellido |
| phone_number | CharField | Teléfono |
| avatar | ImageField | Foto de perfil |
| role | CharField (choices) | Rol: super_admin, admin, collaborator |
| is_active | BooleanField | Estado activo |
| last_login_ip | GenericIPAddressField | Última IP de login |
| created_at | DateTimeField | Fecha de creación |
| updated_at | DateTimeField | Fecha de actualización |

**Role** (Modelo para roles personalizados futuros):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| name | CharField (unique) | Nombre del rol |
| description | TextField | Descripción |
| permissions | ManyToManyField | Permisos asociados |

**Permission** (Permisos granulares):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| codename | CharField | Código del permiso (ej: crm.view_contacts) |
| module | CharField | Módulo al que pertenece |
| action | CharField | Acción: view, create, edit, delete |
| description | CharField | Descripción legible |

#### 3.1.3 Endpoints de API

| Método | Endpoint | Descripción | Permisos |
|--------|----------|-------------|----------|
| POST | /api/v1/auth/login/ | Login con email + password → JWT tokens | Público |
| POST | /api/v1/auth/register/ | Registro de usuario (solo admin puede crear) | Admin+ |
| POST | /api/v1/auth/refresh/ | Refresh del access token | Autenticado |
| POST | /api/v1/auth/logout/ | Logout (blacklist refresh token) | Autenticado |
| POST | /api/v1/auth/password-reset/ | Solicitar reset de contraseña | Público |
| POST | /api/v1/auth/password-reset-confirm/ | Confirmar reset con token | Público |
| GET | /api/v1/auth/me/ | Perfil del usuario actual | Autenticado |
| PATCH | /api/v1/auth/me/ | Actualizar perfil propio | Autenticado |
| GET | /api/v1/users/ | Listar usuarios | Admin+ |
| POST | /api/v1/users/ | Crear usuario | Admin+ |
| GET | /api/v1/users/{id}/ | Detalle de usuario | Admin+ |
| PATCH | /api/v1/users/{id}/ | Editar usuario | Admin+ |
| DELETE | /api/v1/users/{id}/ | Desactivar usuario (soft delete) | SuperAdmin |
| GET | /api/v1/roles/ | Listar roles | Admin+ |
| POST | /api/v1/roles/ | Crear rol | SuperAdmin |
| GET | /api/v1/permissions/ | Listar permisos disponibles | Admin+ |

#### 3.1.4 Roles y Permisos Base

| Rol | Descripción | Permisos generales |
|-----|-------------|-------------------|
| super_admin | Acceso total a toda la plataforma | CRUD completo en todos los módulos, gestión de usuarios y roles |
| admin | Administrador de módulos | CRUD en CRM, Chat, Config IA. Puede crear/editar collaborators |
| collaborator | Usuario operativo | View + Create + Edit en módulos asignados. No puede eliminar ni gestionar usuarios |

---

### 3.2 MÓDULO: CRM

#### 3.2.1 Descripción
Módulo de gestión de relaciones con clientes. Permite registrar negociaciones vigentes, hacer seguimiento del ciclo de vida de ventas, y mantener un historial completo de interacciones.

#### 3.2.2 Modelos de Datos

**Contact** (Contacto / Lead):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| first_name | CharField | Nombre del contacto |
| last_name | CharField | Apellido del contacto |
| email | EmailField | Correo electrónico |
| phone_number | CharField | Número de teléfono |
| whatsapp_number | CharField | Número de WhatsApp (puede diferir del teléfono) |
| company | ForeignKey(Company) | Empresa asociada |
| position | CharField | Cargo en la empresa |
| source | CharField (choices) | Origen: website, referral, social_media, cold_call, event, other |
| intent_level | CharField (choices) | Nivel de intención: cold, warm, hot, very_hot |
| lifecycle_stage | CharField (choices) | Etapa: new_lead, contacted, qualified, proposal, negotiation, won, lost |
| assigned_to | ForeignKey(User) | Usuario responsable |
| last_contact_date | DateTimeField | Última fecha de contacto |
| days_since_last_contact | Propiedad calculada | Días desde último contacto |
| days_since_creation | Propiedad calculada | Días desde la creación |
| notes | TextField | Notas generales |
| tags | ArrayField(CharField) | Etiquetas para categorización |
| custom_fields | JSONField | Campos personalizados |
| is_active | BooleanField | Estado activo |
| created_at | DateTimeField | Fecha de creación |
| updated_at | DateTimeField | Última modificación |
| created_by | ForeignKey(User) | Creado por |

**Company** (Empresa):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| name | CharField | Nombre de la empresa |
| industry | CharField | Industria/sector |
| website | URLField | Sitio web |
| address | TextField | Dirección |
| city | CharField | Ciudad |
| country | CharField | País |
| employee_count | IntegerField | Número de empleados |
| annual_revenue | DecimalField | Ingresos anuales estimados |
| notes | TextField | Notas |
| created_at | DateTimeField | Fecha de creación |

**Deal** (Negociación/Oportunidad):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| title | CharField | Título de la negociación |
| contact | ForeignKey(Contact) | Contacto principal |
| company | ForeignKey(Company) | Empresa |
| value | DecimalField | Valor estimado del deal |
| currency | CharField | Moneda (COP, USD, EUR) |
| stage | CharField (choices) | Etapa: qualification, proposal, negotiation, closed_won, closed_lost |
| probability | IntegerField | Probabilidad de cierre (0-100%) |
| expected_close_date | DateField | Fecha esperada de cierre |
| assigned_to | ForeignKey(User) | Responsable |
| description | TextField | Descripción |
| lost_reason | CharField | Razón de pérdida (si aplica) |
| created_at | DateTimeField | Fecha de creación |
| updated_at | DateTimeField | Última modificación |

**Activity** (Actividades de seguimiento):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| contact | ForeignKey(Contact) | Contacto relacionado |
| deal | ForeignKey(Deal, null) | Deal relacionado (opcional) |
| activity_type | CharField (choices) | Tipo: call, email, meeting, note, task, whatsapp |
| subject | CharField | Asunto |
| description | TextField | Descripción |
| due_date | DateTimeField | Fecha programada |
| completed_at | DateTimeField | Fecha de completado |
| is_completed | BooleanField | Completada |
| assigned_to | ForeignKey(User) | Responsable |
| created_by | ForeignKey(User) | Creado por |
| created_at | DateTimeField | Fecha de creación |

**Document** (Documentos adjuntos):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| contact | ForeignKey(Contact, null) | Contacto relacionado |
| deal | ForeignKey(Deal, null) | Deal relacionado |
| name | CharField | Nombre del documento |
| file | FileField | Archivo subido |
| file_type | CharField | Tipo de archivo (auto-detectado) |
| file_size | IntegerField | Tamaño en bytes |
| description | TextField | Descripción |
| uploaded_by | ForeignKey(User) | Subido por |
| created_at | DateTimeField | Fecha de subida |

#### 3.2.3 Endpoints de API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET/POST | /api/v1/crm/contacts/ | Listar/crear contactos |
| GET/PATCH/DELETE | /api/v1/crm/contacts/{id}/ | Detalle/editar/desactivar contacto |
| GET/POST | /api/v1/crm/companies/ | Listar/crear empresas |
| GET/PATCH/DELETE | /api/v1/crm/companies/{id}/ | Detalle/editar/desactivar empresa |
| GET/POST | /api/v1/crm/deals/ | Listar/crear deals |
| GET/PATCH/DELETE | /api/v1/crm/deals/{id}/ | Detalle/editar/desactivar deal |
| GET/POST | /api/v1/crm/activities/ | Listar/crear actividades |
| GET/PATCH | /api/v1/crm/activities/{id}/ | Detalle/editar actividad |
| POST | /api/v1/crm/activities/{id}/complete/ | Marcar como completada |
| GET/POST | /api/v1/crm/documents/ | Listar/subir documentos |
| GET/DELETE | /api/v1/crm/documents/{id}/ | Detalle/eliminar documento |
| GET | /api/v1/crm/dashboard/ | Métricas del CRM (pipeline, conversión, etc.) |
| GET | /api/v1/crm/contacts/{id}/timeline/ | Timeline de actividades de un contacto |

#### 3.2.4 Funcionalidades Clave del Frontend

- **Vista de lista de contactos**: Tabla con filtros y búsqueda; **bulk actions** (*roadmap*).
- **Vista Kanban del Pipeline**: Drag-and-drop de deals entre etapas del pipeline
- **Vista de detalle de contacto**: Tabs con información general, actividades, deals, documentos, timeline (historial); enlace a **Chat** en cabecera (historial de chat embebido en tab: *roadmap*)
- **Indicador visual de "días sin contacto"**: Badge con color según urgencia (verde < 7 días, amarillo 7-14, rojo > 14)
- **Dashboard CRM**: Gráficos de pipeline, conversión por etapa, deals por responsable, actividad reciente

---

### 3.3 MÓDULO: Chat y WhatsApp

#### 3.3.1 Descripción
Sistema de mensajería integrado que permite comunicarse con contactos del CRM a través de WhatsApp (vía API oficial de Meta) y también mantener conversaciones internas. Incluye modo IA para respuestas automatizadas con RAG.

#### 3.3.2 Modelos de Datos

**Conversation**:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| contact | ForeignKey(Contact) | Contacto del CRM |
| channel | CharField (choices) | Canal: whatsapp, internal |
| status | CharField (choices) | Estado: active, archived, blocked |
| ai_mode_enabled | BooleanField | Modo IA activado |
| ai_config | ForeignKey(AIConfiguration) | *Roadmap:* en código se usa `AIConfiguration` con `is_default=True` (sin FK por conversación aún) |
| assigned_to | ForeignKey(User) | Usuario responsable actual |
| last_message_at | DateTimeField | Timestamp del último mensaje |
| unread_count | IntegerField | Mensajes no leídos |
| created_at | DateTimeField | Fecha de creación |

**Message**:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| conversation | ForeignKey(Conversation) | Conversación padre |
| sender_type | CharField (choices) | Tipo de remitente: user, contact, ai_bot |
| sender_user | ForeignKey(User, null) | Usuario remitente (si es interno) |
| content | TextField | Contenido del mensaje |
| message_type | CharField (choices) | Tipo: text, image, document, audio, video, location |
| whatsapp_message_id | CharField | ID del mensaje en WhatsApp (si aplica) |
| status | CharField (choices) | Estado: pending, sent, delivered, read, failed |
| metadata | JSONField | Metadata adicional (errores, info de WhatsApp, etc.) |
| is_ai_generated | BooleanField | Generado por IA |
| ai_context_used | JSONField | Contexto RAG usado para generar (para auditoría) |
| created_at | DateTimeField | Fecha de envío |

**MessageAttachment**:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| message | ForeignKey(Message) | Mensaje padre |
| file | FileField | Archivo adjunto |
| file_name | CharField | Nombre original |
| file_type | CharField | MIME type |
| file_size | IntegerField | Tamaño en bytes |

#### 3.3.3 Endpoints de API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/v1/chat/conversations/ | Listar conversaciones |
| POST | /api/v1/chat/conversations/ | Iniciar nueva conversación |
| GET | /api/v1/chat/conversations/{id}/ | Detalle de conversación |
| PATCH | /api/v1/chat/conversations/{id}/ | Actualizar (archivar, cambiar asignado) |
| GET | /api/v1/chat/conversations/{id}/messages/ | Listar mensajes de una conversación |
| POST | /api/v1/chat/conversations/{id}/messages/ | Enviar mensaje |
| POST | /api/v1/chat/conversations/{id}/toggle-ai/ | Activar/desactivar modo IA |
| POST | /api/v1/chat/conversations/{id}/mark-read/ | Marcar como leído |
| POST | /api/v1/chat/webhooks/whatsapp/ | Webhook de WhatsApp (entrada de mensajes) |

#### 3.3.4 WebSocket Channels

| Ruta / grupo | Propósito |
|---------|-----------|
| `ws/chat/<conversation_id>/` | Mensajes en tiempo real de una conversación (Channels) |
| `ws/user/` | Notificaciones ligadas al usuario autenticado (JWT en query) |

*Roadmap:* canal o grupo dedicado a *typing* (`chat.typing.{id}`) aún no implementado.

#### 3.3.5 Flujo del Modo IA

1. Usuario activa modo IA en una conversación
2. Llega mensaje entrante de WhatsApp (webhook)
3. El sistema detecta que el modo IA está activo
4. Celery task se ejecuta:
   a. Recupera configuración de IA activa (system prompt, tono, restricciones)
   b. Recupera historial reciente de la conversación (últimos N mensajes)
   c. Ejecuta búsqueda RAG: busca documentos relevantes del contacto y chunks indexados
   d. Construye prompt completo: system prompt + contexto RAG + historial + mensaje entrante
   e. Llama al LLM (OpenAI o compatible)
   f. Guarda respuesta en DB con flag is_ai_generated=True
   g. Envía respuesta via WhatsApp API
   h. Notifica via WebSocket al usuario asignado
5. El usuario puede ver toda la conversación y tomar el control en cualquier momento

---

### 3.4 MÓDULO: Configuración de IA y RAG

#### 3.4.1 Descripción
Configuración del LLM (prompt del sistema, modelo, límites, moderación, RAG) y **retrieval** sobre fragmentos de documentos del CRM. La indexación se dispara al crear/actualizar documentos CRM; los chunks viven en la app **`rag`**.

#### 3.4.2 Modelos de datos (implementados)

**AIConfiguration** (`apps.ai_config`):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| name | CharField | Nombre (p. ej. "Default") |
| system_prompt | TextField | Instrucciones base (idioma, tono, límites) |
| temperature | FloatField | Temperatura del modelo |
| max_tokens | PositiveIntegerField | Máximo de tokens por respuesta |
| llm_model | CharField | Modelo OpenAI (p. ej. `gpt-4o-mini`) |
| is_default | BooleanField | Una sola config por defecto (desmarcando otras al guardar) |
| max_history_messages | PositiveSmallIntegerField | Mensajes de historial en el prompt |
| moderation_enabled | BooleanField | Moderación OpenAI en respuestas |
| daily_token_budget_per_conversation | PositiveIntegerField | Presupuesto diario por conversación (UTC) |
| rag_enabled | BooleanField | Incluir fragmentos RAG en el prompt |
| rag_top_k | PositiveSmallIntegerField | Máximo de chunks a inyectar |
| created_at / updated_at | DateTimeField | Auditoría (BaseModel) |

**DocumentChunk** (`apps.rag`):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| document | ForeignKey(crm.Document) | Documento CRM origen |
| chunk_index | PositiveIntegerField | Orden del fragmento |
| text | TextField | Texto del chunk |
| embedding | JSONField | Vector de embedding (lista numérica; portable) |
| embedding_model | CharField | Modelo de embeddings usado |
| token_count | PositiveIntegerField | Tokens aproximados |

#### 3.4.3 Endpoints de API (implementados)

Prefijo base: **`/api/v1/ai-config/`**

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET / POST | `/api/v1/ai-config/configurations/` | Listar / crear configuraciones |
| GET / PATCH / DELETE | `/api/v1/ai-config/configurations/{id}/` | Detalle / actualizar / borrar lógico |

La **reindexación** y el **retrieval** no se exponen como REST público dedicado; se ejecutan vía servicios, señales y tareas Celery al gestionar documentos CRM.

#### 3.4.4 Roadmap (no implementado aún)

- **AIPromptTemplate** y **RAGDocument** como modelos independientes del borrador inicial.
- Endpoint **`.../configurations/{id}/test/`** para probar prompts desde la API.
- UI completa: CRUD de varias configuraciones, pantalla de test, gestión de templates; hoy existe edición de la config por defecto en **`AIConfigPage`**.

---

### 3.5 MÓDULO: Notificaciones

#### 3.5.1 Descripción
Sistema de notificaciones en tiempo real y persistentes. Notifica a los usuarios sobre eventos relevantes en la plataforma.

#### 3.5.2 Tipos de Notificaciones
- Nuevo mensaje de chat recibido
- Contacto CRM sin actividad por X días (configurable)
- Deal próximo a fecha de cierre esperada
- Actividad programada próxima a vencer
- Nuevo contacto asignado
- IA tomó control de una conversación / IA no pudo responder

#### 3.5.3 Modelo de Datos

**Notification**:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| recipient | ForeignKey(User) | Destinatario |
| notification_type | CharField (choices) | Tipo de notificación |
| title | CharField | Título |
| message | TextField | Contenido |
| is_read | BooleanField | Leída |
| action_url | CharField | URL de acción (ej: /crm/contacts/123) |
| related_object_type | CharField | Tipo de objeto relacionado |
| related_object_id | UUIDField | ID del objeto relacionado |
| created_at | DateTimeField | Fecha de creación |

---

### 3.6 MÓDULO: Audit Log (Registro de Auditoría)

#### 3.6.1 Descripción
Registro automático de todas las acciones significativas en la plataforma para seguridad y trazabilidad.

#### 3.6.2 Modelo de Datos

**AuditLog**:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUIDField (PK) | Identificador único |
| user | ForeignKey(User) | Usuario que realizó la acción |
| action | CharField (choices) | Acción: create, update, delete, login, logout, export |
| model_name | CharField | Nombre del modelo afectado |
| object_id | UUIDField | ID del objeto afectado |
| changes | JSONField | Cambios realizados (before/after) |
| ip_address | GenericIPAddressField | IP del usuario |
| user_agent | CharField | User agent del navegador |
| created_at | DateTimeField | Timestamp |

---

## 4. CONFIGURACIÓN DEL ENTORNO

### 4.1 Variables de Entorno (.env.example)

```bash
# === Django ===
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_SETTINGS_MODULE=config.settings.development

# === Database (PostgreSQL) ===
POSTGRES_DB=seeds_erp
POSTGRES_USER=seeds_user
POSTGRES_PASSWORD=your-db-password
POSTGRES_HOST=db
POSTGRES_PORT=5432

# === Redis ===
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1

# === JWT ===
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=15
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7

# === CORS ===
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# === WhatsApp API (Meta Cloud API) ===
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_VERIFY_TOKEN=your-verify-token
WHATSAPP_WEBHOOK_SECRET=your-webhook-secret

# === OpenAI API (para IA) ===
OPENAI_API_KEY=your-openai-key
OPENAI_DEFAULT_MODEL=gpt-4
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# === Email (para password reset, notificaciones) ===
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password

# === File Storage ===
MAX_UPLOAD_SIZE_MB=10
MEDIA_URL=/media/
STATIC_URL=/static/
```

### 4.2 Requirements Backend (requirements/base.txt)

```
# Core
Django>=5.0,<6.0
djangorestframework>=3.15
django-cors-headers>=4.3
django-filter>=24.0
djangorestframework-simplejwt>=5.3
python-dotenv>=1.0

# Database
psycopg2-binary>=2.9
django-db-connection-pool>=1.2

# Async / Tasks
celery>=5.4
redis>=5.0
channels>=4.0
channels-redis>=4.2
daphne>=4.0

# AI / LLM
openai>=1.0
tiktoken>=0.5
pgvector>=0.2

# File handling
Pillow>=10.0
python-magic>=0.4

# Utilities
django-extensions>=3.2
django-import-export>=3.3

# Security
django-ratelimit>=4.1

# Monitoring
django-health-check>=3.18
sentry-sdk>=1.40
```

### 4.3 Docker Compose (docker-compose.yml)

```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    container_name: seeds_erp_db
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: seeds_erp_redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  web:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
    container_name: seeds_erp_web
    command: >
      bash -c "python manage.py migrate &&
               python manage.py collectstatic --noinput &&
               daphne -b 0.0.0.0 -p 8000 config.asgi:application"
    volumes:
      - ./backend:/app
      - static_volume:/app/staticfiles
      - media_volume:/app/media
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  celery_worker:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
    container_name: seeds_erp_celery_worker
    command: celery -A config worker -l INFO --concurrency=4
    volumes:
      - ./backend:/app
      - media_volume:/app/media
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  celery_beat:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
    container_name: seeds_erp_celery_beat
    command: celery -A config beat -l INFO --scheduler django_celery_beat.schedulers:DatabaseScheduler
    volumes:
      - ./backend:/app
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build:
      context: .
      dockerfile: docker/frontend/Dockerfile
    container_name: seeds_erp_frontend
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:8000/api/v1
      - REACT_APP_WS_URL=ws://localhost:8000/ws

  nginx:
    image: nginx:1.25-alpine
    container_name: seeds_erp_nginx
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.dev.conf:/etc/nginx/conf.d/default.conf
      - static_volume:/app/staticfiles
      - media_volume:/app/media
    depends_on:
      - web
      - frontend

volumes:
  postgres_data:
  static_volume:
  media_volume:
```

---

## 5. PLAN DE EJECUCIÓN (FASES)

### FASE 1: Fundación (Semana 1-2)
**Objetivo**: Proyecto funcional con autenticación y estructura base

1. Inicializar proyecto Django con la estructura de directorios definida
2. Configurar settings split (base, development, production, testing)
3. Configurar Docker Compose con todos los servicios
4. Implementar app `common` (BaseModel, excepciones, paginación, middleware)
5. Implementar app `accounts` completa:
   - Modelo User personalizado con AbstractUser
   - Autenticación JWT (login, register, refresh, logout)
   - Sistema de roles y permisos
   - Endpoints de gestión de usuarios
   - Admin de Django configurado
6. Configurar Celery + Redis
7. Inicializar proyecto React con el template Jampack
8. Implementar layout base (Sidebar, Header, Footer)
9. Implementar autenticación en frontend (login, rutas protegidas)
10. Escribir tests de autenticación y permisos
11. Verificar funcionamiento completo con Docker Compose

**Entregable**: Login funcional, gestión de usuarios, Docker operativo

**Estado (v1.1):** Cumplido. Contextos extra del árbol inicial (tema, WS global, notificaciones) quedan para FASE 5. OpenAPI ya disponible en `/api/v1/docs/`. Scripts `wait_for_db.py` y `seed_data.py` presentes bajo `backend/scripts/`.

### FASE 2: CRM (Semana 3-4)
**Objetivo**: Módulo CRM completo con frontend

1. Implementar modelos: Contact, Company, Deal, Activity, Document
2. Implementar serializers con validaciones
3. Implementar ViewSets con filtros, búsqueda, paginación
4. Implementar servicios de negocio CRM
5. Implementar permisos por rol para CRM
6. Crear admin de Django para todos los modelos CRM
7. Implementar frontend:
   - Lista de contactos con filtros y búsqueda
   - Formulario de creación/edición de contacto
   - Vista detalle con tabs (info, actividades, deals, docs)
   - Vista Kanban del pipeline de deals
   - Subida de documentos
   - Indicador de días sin contacto
   - Dashboard CRM con métricas
8. Implementar tareas Celery: alertas de contactos sin actividad
9. Escribir tests del módulo CRM
10. Implementar Audit Log automático

**Entregable**: CRM funcional con pipeline, seguimiento y documentos

**Estado (v1.1):** Cumplido salvo *bulk actions* en lista de contactos. Audit log aplicado en operaciones CRM; extensión global → FASE 5.

### FASE 3: Chat y WhatsApp (Semana 5-7)
**Objetivo**: Sistema de chat en tiempo real con integración WhatsApp

1. Implementar modelos: Conversation, Message, MessageAttachment
2. Configurar Django Channels (ASGI, channel layers)
3. Implementar WebSocket consumers para chat
4. Implementar servicio de WhatsApp (envío y recepción)
5. Implementar webhook de WhatsApp
6. Implementar endpoints REST para historial de mensajes
7. Implementar frontend de chat:
   - Sidebar con lista de conversaciones
   - Ventana de chat con mensajes
   - Input con envío de texto y archivos
   - Toggle de modo IA
   - Indicador de typing y estado de mensajes
   - Integración con la vista de contacto del CRM
8. Implementar notificaciones de nuevos mensajes
9. Escribir tests del módulo chat
10. Testear integración con WhatsApp (sandbox de Meta)

**Entregable**: Chat funcional con WhatsApp y tiempo real

**Estado (v1.1):** Core cumplido (`ChatView`, WS `ws/chat/…`, WhatsApp). Pendiente: canal dedicado de *typing*, notificaciones in-app de mensajes nuevos (ver FASE 5), descomposición UI en subcomponentes nombrados en el borrador.

### FASE 4: IA y RAG (Semana 8-9)
**Objetivo**: IA funcional con RAG para chat automático

1. Implementar modelos: AIConfiguration; RAG vía **DocumentChunk** (`apps.rag`) ligado a documentos CRM
2. Imagen PostgreSQL **pgvector** en Docker; embeddings almacenados como JSON en `DocumentChunk` (evolución a columna vectorial posible)
3. Implementar servicio de embeddings (OpenAI)
4. Implementar servicio RAG (indexación, búsqueda, retrieval)
5. Implementar servicio LLM (generación de respuestas)
6. Implementar flujo completo de modo IA en chat
7. Implementar frontend:
   - Edición de configuración IA (`AIConfigPage`; CRUD completo / test / templates → roadmap §3.4.4)
   - Gestión explícita de chunks: vía documentos CRM + indexación automática
8. Implementar tarea Celery de indexación de documentos
9. Escribir tests del módulo IA
10. Testear calidad de respuestas con diferentes configuraciones

**Entregable**: IA respondiendo en chat con contexto RAG

**Estado (v1.1):** Cumplido en flujo LLM + RAG + modo IA en chat. Pendiente respecto al listado original: templates dedicados, pantalla de test API, CRUD multi-config en UI; opcional FK `Conversation` → `AIConfiguration`.

### FASE 5: Notificaciones y Polish (Semana 10)
**Objetivo**: Notificaciones, audit log, pulido general

1. Implementar sistema de notificaciones completo
2. WebSocket para notificaciones en tiempo real
3. Centro de notificaciones en el frontend
4. Completar Audit Log para todas las acciones
5. Dashboard general de la plataforma
6. Optimización de performance (queries, caching)
7. Revisión de seguridad completa
8. Documentación de API: ya cubierta en desarrollo (`/api/v1/docs/`); revisar cierre en producción
9. Seed data: script opcional `backend/scripts/seed_data.py`; ampliar fixtures demo si hace falta
10. Tests de integración end-to-end

**Entregable**: Plataforma completa, documentada y optimizada

### FASE 6: Producción (Semana 11-12)
**Objetivo**: Despliegue en producción

1. Configurar settings de producción
2. Docker Compose de producción con SSL
3. Configurar Nginx para producción
4. Configurar backups automáticos de PostgreSQL
5. Configurar monitoring (Sentry, health checks)
6. Configurar CI/CD (GitHub Actions)
7. Documentación de despliegue
8. Manual de usuario básico
9. Despliegue en servidor
10. Testing en producción

**Entregable**: Plataforma en producción

### FASE 7: Evolución post‑MVP (implementación en repo)
**Objetivo:** calidad de código, seguridad incremental, roadmap de producto y operación.

| Área | Estado |
|------|--------|
| CI backend: pytest + cobertura (`pytest-cov`, umbral mínimo en `pytest.ini`) | Hecho |
| CI frontend: ESLint (`eslint.config.js`) + `vite build` | Hecho |
| API: throttling global (usuario/anónimo); health sin límite | Hecho |
| CRM: acciones masivas `POST /crm/contacts/bulk-assign/` y `bulk-stage/` | Hecho |
| Chat: WebSocket `typing` (payload `event: typing`) | Hecho |
| Nginx prod: cabecera CSP (ajustar si hay scripts externos) | Hecho |
| Compose `docker-compose.production.yml`, docs `docs/DEPLOYMENT.md`, backup script | FASE 6 previa |

**Entregable:** pipeline CI verde, listas CRM con selección masiva, indicador de escritura en chat.

---

## 6. REQUERIMIENTOS NO FUNCIONALES

### 6.1 Rendimiento
- Tiempo de respuesta API < 200ms para operaciones CRUD simples
- Tiempo de carga de página < 3 segundos
- WebSocket latency < 100ms
- Soporte para al menos 50 usuarios concurrentes
- Paginación en todas las listas (20 items por defecto, configurable)

### 6.2 Seguridad
- HTTPS obligatorio en producción
- JWT con refresh token rotation
- Rate limiting en todos los endpoints
- Input validation en backend y frontend
- CORS restrictivo
- Content Security Policy headers
- SQL injection prevention (ORM)
- XSS prevention (escape de outputs)
- CSRF protection
- Audit trail completo

### 6.3 Disponibilidad
- Uptime objetivo: 99.5%
- Health check endpoints: /api/v1/health/
- Graceful degradation si servicios externos fallan (WhatsApp, OpenAI)
- Retry automático con backoff exponencial para servicios externos

### 6.4 Mantenibilidad
- Código documentado con docstrings
- Coverage de tests > 80%
- Conventional Commits
- Code review obligatorio
- Linting automático (black, isort, eslint, prettier)

### 6.5 Escalabilidad
- Arquitectura modular (apps Django independientes)
- Stateless API (JWT, no sesiones en servidor)
- Celery para procesamiento pesado
- Redis para caching
- Preparado para horizontal scaling (múltiples workers)

---

## 7. CONVENCIONES DE CÓDIGO Y ESTILO

### 7.1 Formato de Respuesta API Estándar

**Éxito:**
```json
{
  "status": "success",
  "data": { ... },
  "message": "Operación exitosa"
}
```

**Éxito con lista paginada:**
```json
{
  "status": "success",
  "data": {
    "count": 150,
    "next": "http://api/v1/crm/contacts/?page=2",
    "previous": null,
    "results": [ ... ]
  }
}
```

**Error:**
```json
{
  "status": "error",
  "message": "Descripción del error",
  "errors": {
    "email": ["Este campo es requerido"],
    "phone": ["Formato inválido"]
  },
  "code": "VALIDATION_ERROR"
}
```

### 7.2 Códigos de Error Estándar
| Código | HTTP Status | Descripción |
|--------|------------|-------------|
| VALIDATION_ERROR | 400 | Error de validación de datos |
| AUTHENTICATION_ERROR | 401 | No autenticado |
| PERMISSION_DENIED | 403 | Sin permisos |
| NOT_FOUND | 404 | Recurso no encontrado |
| CONFLICT | 409 | Conflicto (ej: email ya existe) |
| RATE_LIMITED | 429 | Demasiadas solicitudes |
| INTERNAL_ERROR | 500 | Error interno del servidor |
| SERVICE_UNAVAILABLE | 503 | Servicio externo no disponible |

### 7.3 Naming Conventions Resumido
| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Modelo Django | PascalCase singular | `Contact`, `ChatMessage` |
| Tabla DB | snake_case plural (auto) | `crm_contacts`, `chat_messages` |
| Serializer | PascalCase + Serializer | `ContactSerializer` |
| ViewSet | PascalCase + ViewSet | `ContactViewSet` |
| URL path | kebab-case | `/api/v1/crm-contacts/` |
| Task Celery | snake_case con prefijo módulo | `crm_check_stale_contacts` |
| Componente React | PascalCase | `ContactTable`, `ChatWindow` |
| Hook React | camelCase con prefijo use | `useContacts`, `useWebSocket` |
| Archivo Python | snake_case | `contact_service.py` |
| Archivo React | PascalCase | `ContactTable.jsx` |

---

## 8. INSTRUCCIONES PARA EL AGENTE

### 8.1 Reglas de Ejecución

1. **Antes de escribir código**: Lee siempre el documento de contrato (este archivo) y las reglas de Cursor aplicables
2. **Cada cambio debe**:
   - Seguir la estructura de directorios definida
   - Respetar las convenciones de naming
   - Incluir docstrings
   - Incluir tests
   - No romper funcionalidad existente
3. **Al crear un nuevo modelo**: Crea también su serializer, viewset, urls, admin, y tests mínimos
4. **Al crear un nuevo endpoint**: Documenta en este archivo o en un archivo de API docs
5. **Al modificar modelos**: Crea la migración correspondiente
6. **Al instalar una nueva dependencia**: Agrégala al archivo de requirements correcto
7. **No hagas cambios en múltiples módulos a la vez**: Trabaja un módulo o feature a la vez, testea, y luego avanza

### 8.2 Prioridades del Agente

1. **Funcionalidad correcta** > Código elegante
2. **Seguridad** > Velocidad de desarrollo
3. **Tests** > Features nuevos
4. **Código simple y legible** > Optimización prematura
5. **Consistencia con el proyecto** > Preferencias personales

### 8.3 Lo que el Agente NO Debe Hacer

- No instalar dependencias que no están en el plan sin justificación
- No cambiar la estructura de directorios definida
- No ignorar las convenciones de naming
- No omitir validaciones de seguridad
- No hardcodear valores que deben ser configurables
- No crear endpoints sin autenticación (excepto los explícitamente públicos)
- No modificar migraciones ya aplicadas
- No commitear archivos .env, secrets, o credenciales
- No usar `any` en TypeScript (si se migra a TS en el futuro)
- No hacer `print()` para debugging (usar logging)

---

## 9. GLOSARIO

| Término | Definición |
|---------|-----------|
| CRM | Customer Relationship Management — gestión de relaciones con clientes |
| RAG | Retrieval-Augmented Generation — técnica de IA que combina búsqueda de documentos con generación de texto |
| LLM | Large Language Model — modelo de lenguaje como GPT-4 |
| JWT | JSON Web Token — estándar de autenticación sin estado |
| DRF | Django REST Framework — framework para APIs REST en Django |
| Celery | Framework de tareas asíncronas distribuidas para Python |
| pgvector | Extensión de PostgreSQL para almacenar y buscar vectores (embeddings) |
| WebSocket | Protocolo de comunicación bidireccional en tiempo real |
| RBAC | Role-Based Access Control — control de acceso basado en roles |
| Pipeline | Flujo de etapas por las que pasa un deal/negociación |
| Webhook | Callback HTTP que notifica eventos en tiempo real |

---

## 10. NOTAS FINALES

- Este documento es el **contrato vivo** del proyecto. Se actualiza conforme avanza el desarrollo.
- Cualquier decisión técnica que se desvíe de lo aquí definido debe documentarse con justificación.
- El agente de IA (Cursor) debe usar este documento como **fuente de verdad** para planificación y ejecución.
- Los módulos futuros (facturación, inventario, RRHH, etc.) seguirán la misma arquitectura y convenciones aquí definidas.

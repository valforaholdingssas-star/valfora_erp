# VALFORA DESIGN SYSTEM v1.1

## Enterprise UX Extension

### ERP · Dashboard · Data Dense Interfaces

---

# Design Philosophy

## Information First

La interfaz no compite con el contenido.

---

## Progressive Disclosure

Mostrar únicamente lo necesario.

Más detalle → más profundidad.

Nunca más elementos.

---

## Single Surface Rule

Evitar tarjetas dentro de tarjetas.

Máximo:

Canvas
→ Sección
→ Contenido

No:

Canvas
→ Card
→ Card
→ Widget
→ Tabla

---

## Motion Over Decoration

El sistema se siente moderno por movimiento y transición.

No por sombras.

---

# Layout Architecture

## ERP Shell

```yaml
shell:

topbar:
  height: 64

sidebar:
  expanded: 280
  collapsed: 72

content:
  maxWidth: none

pagePadding:
  desktop: 32
  tablet: 24
  mobile: 16
```

---

## Page Structure

```txt
Header

Actions

Filters

Content

Footer
```

Espaciado:

```yaml
header_to_actions: 24

actions_to_filters: 24

filters_to_content: 32

sections: 48
```

---

# Tables

## Philosophy

Las tablas NO son hojas de Excel.

Son vistas de trabajo.

Objetivos:

* escanear rápido
* editar rápido
* encontrar rápido

---

## Table Layout

```yaml
table:

rowHeight:
  compact: 44
  default: 56
  comfortable: 72

header:
  height: 48

border:
  none

divider:
  subtle

radius:
  18
```

---

## Visual Rules

NO:

❌ gridlines completas

❌ bordes verticales

❌ zebra extrema

❌ texto centrado

SI:

✅ separación por espacio

✅ hover suave

✅ columnas respiradas

---

## Density Modes

### Comfortable

Para usuarios nuevos.

```yaml
padding:
  24
```

---

### Compact

Para operación.

```yaml
padding:
  16
```

---

### Dense

Para analítica.

```yaml
padding:
  12
```

---

## Row Behavior

```yaml
default:
  background: white

hover:
  background: soft

selected:
  background: primary-soft

pressed:
  background: elevated
```

Duración:

```yaml
200ms
```

---

## Sticky Table

Siempre:

```yaml
header:
 sticky

firstColumn:
 sticky
```

Scroll horizontal:

Permitido.

Nunca reducir columnas.

---

## Bulk Actions

Acciones aparecen SOLO al seleccionar.

Ejemplo:

```txt
✓ 14 seleccionados

Exportar
Mover
Eliminar
```

---

# Filters

## Philosophy

Filtros deben sentirse como búsqueda.

No formularios.

---

## Filter Bar

```yaml
height: 56

radius: pill

background: white
```

Estructura:

```txt
Buscar

Filtros

Vista

Exportar
```

---

## Filter Chips

```yaml
height: 36

padding:
  16

radius:
  pill
```

Estados:

```yaml
default:
 white

hover:
 soft

active:
 primary-soft

selected:
 primary
```

---

## Advanced Filters

NO abrir acordeón.

Abrir:

Right Drawer

```yaml
width:
  420
```

Contenido:

```txt
Condiciones

Operadores

Guardar Vista
```

---

## Saved Views

```txt
Todos

Activos

Pendientes

Mis registros
```

Persisten.

---

# Search

Siempre visible.

```yaml
height:
  56

radius:
  pill
```

Incluye:

* búsqueda
* atajos
* acciones

Ejemplo:

```txt
⌘K
```

---

# Popups

## Philosophy

Nada bloquea trabajo.

Preferir:

Drawer

Sobre

Modal

---

## Modal

Para decisiones.

```yaml
width:

sm: 480

md: 640

lg: 840
```

---

## Rules

Máximo:

2 acciones

```txt
Cancelar

Guardar
```

Nunca:

3 botones.

---

## Drawer

Para edición.

```yaml
width:
  480
```

Animación:

```yaml
250ms
```

---

## Side Sheet

Para detalle.

No navegar.

Ejemplo:

```txt
Cliente

Actividad

Notas
```

---

## Toast

```yaml
position:
 top-right

duration:
 3000
```

Stack:

máximo 3.

---

# Empty States

Siempre explicar.

Estructura:

```txt
Título

Descripción

Acción
```

Ejemplo:

```txt
No hay proyectos

Crea tu primer proyecto

[ Crear ]
```

---

# Forms

## Rules

1 columna por defecto.

2 columnas máximo.

---

## Inputs

```yaml
height:
  56

label:
  top

helper:
  visible
```

---

## Validation

Mostrar:

error cercano.

No rojo global.

---

# Navigation

## Sidebar

Jerarquía:

```txt
Dashboard

Operación

Finanzas

CRM

Analítica

Configuración
```

Máximo:

7 categorías.

---

## Submenu

No más de:

6 ítems.

---

## Breadcrumb

Siempre.

Ejemplo:

```txt
Empresas

Cliente

Contrato
```

---

# KPI Blocks

No usar tarjetas gigantes.

```yaml
height:
  120

radius:
  18
```

Contenido:

```txt
Valor

Variación

Detalle
```

---

# Loading

Nunca spinner.

Usar:

Skeleton

Duración:

```yaml
800–1200ms
```

---

# Responsive ERP

Desktop:
1200+

Tablet:
768–1199

Mobile:
0–767

---

# Accessibility

Contraste:
AA

Click:
48x48

Focus:
visible

Teclado:
100%

---

# Anti Patterns

NO:

❌ tablas infinitas

❌ 10 KPIs arriba

❌ filtros escondidos

❌ 3 sidebars

❌ cards dentro de cards

❌ dashboards oscuros

❌ popups sobre popups

❌ menús de 40 módulos

---

# Final Rule

Remove before adding.

Cada elemento nuevo debe justificar su existencia.

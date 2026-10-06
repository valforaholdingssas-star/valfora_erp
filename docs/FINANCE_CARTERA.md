# Finanzas y Cartera — Seeds ERP (Valfora)

## Flujo operativo

```
Cliente (CRM Contact)
   └── Contrato (valor + cronograma de cuotas)
         └── Factura(s) (emisión / vencimiento / saldo)
               └── Pago(s) (ingresos de cartera)
```

## Qué hay en la app

| Área | Ruta UI | Capacidad |
|------|---------|-----------|
| Contratos | `/finance/contracts` | Cliente, valor, estado, cronograma de pagos editable |
| Facturas | `/finance/invoices` | Ligadas a contrato/cliente, ítems, saldo |
| Pagos | `/finance/payments` | Aplicación a facturas abiertas (enviada/parcial/vencida) |
| **Cartera** | `/finance/receivables` | Por cobrar, vencido, aging, por cliente, ingresos y facturación del periodo |
| Dashboard | `/finance/dashboard` | KPIs + ingresos mensuales + facturación mensual + aging |

## APIs clave

- `GET /api/v1/finance/receivables/` — facturas abiertas + métricas + aging
- `GET /api/v1/finance/portfolio/` — consolidado por cliente (contratos, facturado, cobrado, saldo)
- `GET /api/v1/finance/cash-flow/?period=month|quarter|year` — ingresos y facturación por mes
- `GET /api/v1/finance/dashboard/` — panel completo
- CRUD `contracts`, `invoices`, `payments`, `contract-documents`

## Prácticas alineadas (Acumatica / Dynamics AR)

- Aging buckets: al día, 1–30, 31–60, 61–90, 90+
- Contrato como origen de valor y cuotas
- Factura como documento de cobro
- Pago aplicado a factura (actualiza saldo y estado)
- Reportes por periodo (mes / trimestre / año)
- Marcado automático de vencidas (Celery Beat cada 6 h)

## Moneda

Default **COP**. Formato `es-CO` en UI.

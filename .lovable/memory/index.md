# Project Memory

## Core
- Multi-tenant system (Datta) isolated by `establishment_id`. Superadmin has global access.
- Stack: React, Tailwind CSS, shadcn/ui, Supabase (Auth, DB, Realtime, Storage, Edge Functions).
- Design: Dark mode default, Orange primary. Space Grotesk (headings) & Inter (body).
- Images: Supabase Storage public bucket, RLS limits edits to authenticated admins.
- Public Menu: Mobile-first, high-res photos, public access via QR with no auth required.

## Memories
- [Roles](mem://features/roles) — 5 roles: superadmin, admin, caja, mesero, cocina
- [Analytics](mem://features/analytics) — Explore/Compare modes, expandable charts, granular aggregation
- [QR Modes](mem://features/modos-qr) — Table QR (orders) vs General QR (read-only menu)
- [Kitchen Operations](mem://features/operaciones-cocina) — Programmatic sound alerts, individual prep timers
- [Waiter Orders](mem://features/toma-pedidos-mesero) — Waiter UI: mobile-first, manual states, 3s sync
- [Table Automation](mem://logic/automatizacion-mesas) — Auto-transitions and manual overrides
- [Edge Function Security](mem://tech/seguridad-edge-functions) — JWT validation in Edge Functions for admin actions
- [Realtime Tables](mem://features/monitoreo-realtime-mesas) — Sectors: Green (Free), Red (Occupied), Yellow (Prep)
- [Table Organization](mem://features/organizacion-mesas) — Tables grouped by sectors, dynamic guest count
- [Admin Staff Management](mem://features/gestion-personal-admin) — Staff management, default password resets
- [Costs & Pricing](mem://features/gestion-costos-precios) — Cost/margin/VAT calculation, mass adjustments
- [AI Assistant](mem://features/asistente-ia-admin) — Gemini Flash chatbot via SSE, tool-calling for DB updates
- [Customer Feedback](mem://features/feedback-y-banners-cliente) — Public 1-5 star reviews, promo banners
- [Finances](mem://features/gestion-financiera) — Cash control, income/expense tracking, auto-sync
- [Shift Management](mem://features/gestion-turnos) — Constraints, block close on active tables, KPIs
- [Audio Notifications](mem://tech/notificaciones-audio) — Web Audio API triple bell, requires interaction
- [SaaS Management](mem://features/gestion-datta-saas) — Superadmin dashboard: MRR, clients, plans
- [Client Payments](mem://features/control-pagos-clientes) — Subscription tracking, unique per month/year
- [Cash Reconciliation](mem://features/arqueo-caja) — Expected vs physical cash on shift close
- [Vigencia de pedidos](mem://features/vigencia-pedidos-turno) — Pedidos solo del turno abierto; quitar ítems de la cuenta
- [Cuentas de cortesías](mem://features/cuentas-cortesias) — Personas con invitaciones, consumo a precio de venta, reflejo en cierre de turno
- [Floor Plan Editor](mem://features/plano-visual) — Drag-drop layout with SVG cutouts, 45-deg rotation
- [Billing & Invoicing](mem://features/facturacion) — Immutable invoices, 80mm thermal printer CSS
- [Tips Management](mem://features/propinas) — Pool vs individual modes, settlement panel with auto expense
- [Table Reservations](mem://features/reservas-mesas) — Caja/Admin registran reservas; no reemplazan estado operativo de mesa
- [Menú del día y combos](mem://features/menu-del-dia-combos) — Menú del día con precio propio y combos plato+postre+bebida
- [Credentials](mem://auth/credentials) — Test accounts for superadmin, caja, and mesero
- [Margen y punto de equilibrio](mem://features/margen-contribucion) — Margen contribución/ganancia, PE, ranking de gastos en /admin/analytics
- [Delivery](mem://features/delivery-plataformas) — Módulo Rappi/PedidosYa por establecimiento, comisiones y analíticas por canal

# Calculadora flotante para el usuario cajero

## Objetivo
Agregar una calculadora de bolsillo que el cajero pueda abrir y cerrar al instante, con un botón flotante fijo abajo a la derecha, idéntico en estilo al botón naranja del ChatBot del admin.

## Qué se va a construir

1. **Nuevo componente `src/components/cashier/FloatingCalculator.tsx`**
   - Botón flotante (círculo naranja `bg-primary`, 56px, esquina inferior derecha, `z-50`) con ícono `Calculator` de lucide-react. Reutiliza el mismo patrón visual del ChatBot (`fixed bottom-6 right-6 z-50 flex h-14 w-14 ...`).
   - Al pulsarlo abre un panel flotante (mismo estilo que el panel del chat: `fixed bottom-6 right-6`, borde, `bg-card`, sombra).
   - Display de una línea que muestra la entrada actual y, cuando corresponde, el resultado.
   - Teclado: dígitos `0–9`, coma decimal `,` (usar coma para coincidir con el formato del sistema), operaciones `+ − × ÷`, `=`, `C` (borrar todo), `⌫` (borrar último), `±` (cambiar signo) y `%`.
   - Lógica de cálculo robusta: respeta la operación pendiente, permite encadenar (`2 + 3 × 4`), maneja división por cero mostrando "Error", y permite iniciar de nuevo con `C`.
   - Botón `X` para cerrar el panel (mismo header del chat: barra `bg-primary` con ícono y título "Calculadora").
   - Sin dependencias externas: solo React + Tailwind + shadcn `Button`.

2. **Montaje en `src/layouts/CashierLayout.tsx`**
   - Importar `FloatingCalculator` y renderizarlo dentro del `SidebarProvider` (igual que AdminLayout monta `<ChatBot />`), para que aparezca en todas las páginas del cajero.

## Detalles técnicos
- No toca lógica de negocio ni base de datos; es solo utilidad de cálculo visual.
- No interactúa con Supabase ni con la caja: es independiente, para cuentas improvisadas.
- Estilo consistente con el resto de la app (tokens `primary`, `card`, `muted`, `border`).
- Se reutiliza el ícono `Calculator` de lucide-react (ya importado en el layout).

## Verificación
- Build/typecheck sin errores.
- En preview: el círculo naranja aparece abajo a la derecha en cualquier página del cajero; al pulsar abre la calculadora; operaciones básicas devuelven resultados correctos; `C` reinicia; `X` cierra.

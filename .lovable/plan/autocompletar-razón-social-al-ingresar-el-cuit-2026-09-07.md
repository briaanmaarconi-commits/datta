# Autocompletar razón social al ingresar el CUIT

Al cargar el CUIT del receptor en cualquier factura, el sistema consulta el padrón de ARCA y completa la razón social automáticamente.

## Qué va a ver

En todos los lugares donde hoy se pide **CUIT del receptor** (Factura manual, facturación por mesa desde caja y Facturación del administrador):

- Al terminar de escribir el CUIT (o con un botoncito de búsqueda), se consulta ARCA y la **Razón Social se completa sola**.
- El campo queda editable por si ARCA devuelve un nombre distinto al que quieren mostrar.
- Si el CUIT no existe o ARCA no responde, se avisa y se puede cargar a mano como ahora.
- También puede traer la condición de IVA del receptor (dato útil para saber si corresponde Factura A).

## Un paso tuyo en ARCA (una sola vez)

El padrón es otro servicio de ARCA, igual que hiciste con "Facturación Electrónica (wsfe)":

1. Entrá a ARCA con tu CUIT → **Administrador de Relaciones de Clave Fiscal**.
2. Buscá el servicio **"Padrón de contribuyentes - Constanciación"** (ws_sr_padron_a5 / "Consulta de Padrón").
3. Asocialo al mismo alias/certificado que usás para facturar (datta).

Sin ese paso, la consulta devuelve "no autorizado" igual que pasó con wsfe al principio.

## Detalles técnicos

- Nueva edge function `afip-padron`: reutiliza el login WSAA existente (mismo certificado/clave del establecimiento) y llama a `getPersona` del servicio **ws_sr_padron_a5** (homologación o producción según `afip_environment`).
- Respeta multi-tenant: toma el certificado del `establishment_id` del usuario, valida sesión como `afip-invoice`.
- Frontend: un hook chiquito `useCuitLookup` con debounce al completar 11 dígitos + botón de lupa, integrado en:
  - `src/components/cashier/ManualInvoiceDialog.tsx`
  - `src/components/cashier/FiscalInvoiceDialog.tsx`
  - `src/pages/admin/Billing.tsx`
- El valor autocompletado pisa el campo de razón social pero queda editable; errores solo como toast, sin bloquear.
- No requiere migración de base de datos.

# Barra con 6 lugares para tomar pedidos

## Idea
La barra se sigue dibujando como una sola pieza larga (para que se note que es la barra), pero pasa a tener 6 "lugares" numerados 101 a 106. Cada lugar funciona igual que una mesa: se le toma pedido, se cobra y se cierra por separado.

## Qué se hace

1. **Crear 6 mesas de barra** (números 101 a 106, capacidad 1), en el mismo sector donde está la barra.
2. **Nuevo elemento de plano "Lugar de barra"**: un asiento chico y clickeable que se vincula a una de esas mesas. Se colocan los 6 a lo largo del mostrador dibujado.
   - Se pintan con los mismos colores de estado (verde libre, rojo ocupada, amarillo en preparación).
   - Muestran la etiqueta "101"…"106" y la cantidad de pedidos activos.
3. **Botón "Generar barra"** en el editor de plano: con un click crea las 6 mesas faltantes y las ubica alineadas sobre la barra seleccionada, respetando su rotación.
4. **Vista de mozo y monitoreo**: los lugares de barra se ven y se clickean igual que las mesas, así el mozo abre el pedido desde el plano.
5. **Caja**: aparecen en la lista de mesas como "Mesa 101…106" y se cobran/cierran individualmente, sin cambios en la lógica de facturación.

```text
   [101] [102] [103] [104] [105] [106]
  ┌──────────────────────────────────┐
  │             BARRA                │
  └──────────────────────────────────┘
```

## Detalle técnico
- `src/components/admin/FloorPlanEditor.tsx`: nuevo tipo de elemento `bar-seat` (con `tableId`), acción "Generar lugares de barra" que inserta las mesas faltantes en `tables` y agrega los elementos al `layout_data`, distribuidos sobre el ancho de la barra.
- `src/components/waiter/FloorPlanView.tsx`: tratar `bar-seat` como mesa (color por estado, contador de pedidos, `onTableClick`).
- Sin cambios de esquema: se reutiliza la tabla `tables` (mismo `sector_id` que la barra) y `floor_plans.layout_data`.

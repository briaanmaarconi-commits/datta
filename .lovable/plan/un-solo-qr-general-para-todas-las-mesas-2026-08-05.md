# Un solo QR general para todas las mesas

## Situación actual (verificada)

- La pestaña QR del Menú muestra un QR general **y** un QR por cada mesa.
- El QR general ya apunta a una URL fija: `https://dattagestion.lovable.app/carta/<id-del-restaurante>`. Esa dirección no cambia cuando editás platos o precios, así que el impreso sigue sirviendo para siempre.
- La carta pública ya puede leerse sin iniciar sesión: los datos del restaurante, las categorías y los productos responden correctamente a un visitante anónimo.
- Lo que falla en el celular es la **versión publicada**: el sitio en el dominio público todavía tiene el código viejo, por eso se ve la carta vacía o con pantalla de Lovable. Hace falta publicar de nuevo.

## Cambios a implementar

1. Dejar en la pestaña QR **un único QR general**, grande, y quitar la grilla de QR por mesa.
2. Mostrar debajo la URL fija y un aviso claro: "Esta dirección no cambia. Podés imprimir este QR una sola vez y pegarlo en todas las mesas; los cambios de la carta se reflejan solos."
3. Mantener los botones Descargar PNG (alta resolución para imprimir), Abrir carta e Imprimir.
4. La URL siempre usa el dominio público, aunque el QR se genere desde la vista previa.
5. Publicar la app para que el celular abra la carta con todos los productos.

## Detalles técnicos

- `src/components/admin/MenuQRCodes.tsx`: eliminar la consulta de mesas y el bloque de QR por mesa; dejar sólo la tarjeta del QR general con tamaño mayor y el texto explicativo.
- La URL se mantiene como `${publicOrigin}/carta/${establishmentId}` con `publicOrigin` forzado a `https://dattagestion.lovable.app` en entornos de vista previa.
- No se tocan la ruta pública `/carta/:establishmentId` ni los permisos de base de datos: ya funcionan para visitantes sin sesión.
- Al terminar, publicar el proyecto y verificar escaneando el QR nuevo.

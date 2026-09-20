# Corregir el QR de la carta general

## Diagnóstico confirmado

- El enlace publicado `/carta/:establecimiento` sí abre Datta; no redirige al editor de Lovable.
- La versión publicada está desactualizada y todavía consulta todos los campos de productos (`select=*`). Esa consulta pública recibe `401` y la carta no llega a mostrar los platos.
- El cambio reciente que hace que el QR apunte al dominio público todavía requiere una nueva publicación. Los QR impresos anteriormente conservan para siempre la URL vieja y deben regenerarse.

## Implementación

1. Ajustar la carta pública para consultar únicamente las columnas públicas de productos y obtener los datos visibles del restaurante desde la vista pública, sin depender de tablas privadas.
2. Manejar explícitamente los errores de categorías y productos para evitar una pantalla vacía o un cargador permanente.
3. Mantener el QR general apuntando a `https://dattagestion.lovable.app/carta/:establecimiento`, incluso cuando se genera desde la vista previa.
4. Verificar sin iniciar sesión que la URL muestra el nombre del restaurante, categorías y platos.
5. Publicar la nueva versión y generar nuevamente el QR general; el QR anterior que contiene una URL de vista previa debe reemplazarse.

## Resultado esperado

Al escanear el QR nuevo desde cualquier teléfono se abrirá directamente la carta pública con sus platos, sin login ni acceso al proyecto de Lovable.
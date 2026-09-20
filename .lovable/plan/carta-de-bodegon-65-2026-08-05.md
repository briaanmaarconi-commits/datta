# Carta de BODEGON 65

Cargar la carta completa del bodegón en el establecimiento "BODEGON 65", que hoy no tiene ninguna categoría ni plato cargado. Todo se carga como datos (no hay cambios de diseño ni de código): la carta pública ya se ve prolija y sin fotos, porque cada plato queda sin imagen.

## Categorías (en este orden)

1. Entradas
2. Milanesas
3. Hamburguesas
4. Pastas
5. Salsas
6. Carnes asadas
7. Pizzas
8. Guarniciones
9. Postres
10. Bebidas

## Platos

- **Entradas**: papas fritas simples, papas fritas con cheddar y panceta, papas fritas con crema, bastones de queso, empanadas de jamón y queso, empanadas de picadillo.
- **Milanesas**: simple (con limón), napolitana (con descripción: salsa, jamón, queso, tomate, ajo y perejil; opcional huevo frito), a caballo.
- **Hamburguesas**: simple o clásica, completa (con descripción de ingredientes), doble, con cheddar.
- **Pastas**: capricho o marrano, ravioles de verdura, sorrentinos de jamón y queso, tallarines, ñoquis simples, ñoquis rellenos.
- **Salsas** (todas a $0, son opciones incluidas): bolognesa, estofado (con descripción), crema, crema y pimentón, crema y champiñones, fileto, salsa rosa.
- **Carnes asadas**: chuleta o bife de chorizo, lomo, entraña, banderita, matambre.
- **Pizzas**: muzzarella, especial, napolitana.
- **Guarniciones**: papas fritas, puré de papas, ensalada de rúcula, ensalada de huevo y tomate, ensalada de tomate y lechuga, ensalada de zanahoria y huevo.
- **Postres**: flan, budín de pan, chocotorta, tiramisú, lemon pie.
- **Bebidas** (variantes separadas): Coca-Cola 1L, Coca-Cola 500ml, Coca-Cola Zero 1L, Coca-Cola Zero 500ml, Sprite 1L, Sprite 500ml, agua saborizada naranja, agua saborizada pomelo, agua sin gas, soda o agua con gas, limonada.

## Criterios de carga

- Todos los precios en **$0** para que los completes desde Admin → Menú.
- Sin fotos: ningún plato lleva imagen, ni las categorías.
- Todos los platos quedan disponibles y las categorías activas.
- Las descripciones se usan solo donde aportan (napolitana, hamburguesa completa, estofado); el resto va con el nombre solo, para que la carta se lea limpia.

## Detalle técnico

Inserción de datos en las tablas `categories` y `products` con `establishment_id = 5a56bc2d-c69b-49e7-96b4-7ff690ad8140`, respetando `sort_order` por categoría y dejando `price = 0`, `image_url = null`, `is_available = true`, `is_active = true`. No se modifica ningún archivo de código ni el esquema de la base.

# Referencias para Antoja2 POS

Consulta de páginas públicas: 22 de octubre de 2026. Estas referencias orientan el
flujo, no constituyen integraciones ni una promesa de compatibilidad con hardware.

| Referencia | Qué se observó | Aplicación en Antoja2 |
| --- | --- | --- |
| [Toast Restaurant POS](https://pos.toasttab.com/restaurant-pos) | Órdenes dine-in, takeout y delivery, cocina conectada, modificadores, cuentas divididas, gestión de menú e informes | Menú táctil junto a la cuenta, retiros y extras, comandas incrementales y jornada operativa |
| [Square for Restaurants](https://squareup.com/us/en/point-of-sale/restaurants) | Pantallas configurables y fotos de menú, mesas, división por persona/artículo/importes, KDS y reportes de cierre y ventas en vivo | Categorías y productos configurables, división por importes/personas/métodos, cocina y reportes diario/mensual |
| [Loyverse](https://loyverse.com/) | Referencia alternativa para POS móvil; la ruta específica de restaurantes consultada devolvió 404 | No se asumen prestaciones, costos o disponibilidad comercial no verificados |

También se usó como referencia la imagen de Toast aportada por el usuario:
botones táctiles y modificadores con la cuenta visible al lado. Antoja2 mantiene
el estilo y componentes de la base de clínica y se adapta a teléfonos y tablets.

Alcance de esta versión: se registran cobros de tarjeta y transferencia; no se
procesan transacciones con bancos o terminales de pago. PedidosYa, WhatsApp y
Valazo identifican el origen del pedido introducido manualmente; no hay conexión
automática con sus APIs. La impresión usa controladores del dispositivo y diálogo
del navegador, con perfiles separados de caja/cocina y papel de 58/80 mm. El envío
silencioso ESC/POS o a dos impresoras por red requiere un puente local y pruebas
con los modelos físicos. Esta versión necesita conexión al servidor; no promete
sincronización offline.

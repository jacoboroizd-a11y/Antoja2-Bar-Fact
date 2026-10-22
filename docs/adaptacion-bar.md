# Adaptación de clínica a Antoja2

Base inspeccionada: jacoboroizd-a11y/MariaraulFacturacion, main,
e7acffbf28006ac9a3daa2637c1ff5fa466a08e9. Se conserva una copia del código,
no se modifica ni se conecta a la base de producción de la clínica.

## Reutilización

- Sesiones JOSE/PostgreSQL, bcrypt, membresías y aislamiento por empresa.
- Layout, estilos verdes, botones, campos, tablas y formularios existentes.
- Decimal.js, reglas de descuentos/impuestos y moneda NIO/USD.
- Facturas y recibos, snapshots, secuencias transaccionales, impresión y PDF.
- Auditoría y transacciones serializables con reintentos.
- Clientes, configuración, impuestos, cotizaciones y reportes originales.

## Extensiones y modelos nuevos

Product conserva identidad, precios e impuestos. BarProduct agrega tipo de venta,
costo, presentación, existencias decimales, mínimo, proveedor y disponibilidad.
BarCategory y Supplier separan catálogo operativo; RecipePart permite combos y
recetas por medida. El consumo se congela en la línea de orden al agregarla.

BusinessDay contiene fecha operativa, apertura y cierre inmutable. BarOrder,
BarOrderItem y BarPayment añaden consumo acumulable, cocina y pagos por persona.
DiningTable representa reserva y su orden activa. InventoryMovement registra el
kardex. La caja y las estadísticas del bar usan BusinessDay, nunca la fecha civil
ni el cierre automático de las 20:00 de la clínica.

## Decisiones operativas

Zona America/Managua. Apertura 11:30; a las 00:00–00:29 sigue la fecha anterior.
A las 00:30 no se aceptan nuevas órdenes ni consumo; se permite cobrar pendientes
y contar/cerrar una jornada atrasada. No se cierra automáticamente sin conteo.
Una sola caja abierta por empresa y una sola orden activa por mesa, reforzadas
por índices únicos parciales. Corrección de cierre exclusiva de ADMIN, con motivo
y auditoría; se conserva la versión original. Una segunda apertura exige ADMIN
y motivo; si hay una caja abierta debe cerrarse con conteo y sin órdenes pendientes.
Cada turno conserva su cierre y los reportes agrupan por fecha operativa.

El inventario se descuenta una sola vez al completar el pago (incluye cortesías).
No se cancelan órdenes con abonos: se exige completar el cobro; devoluciones de
órdenes pagadas requieren un flujo fiscal posterior, no eliminación de pagos.
Una orden con abonos queda congelada para preservar lo cobrado. Cada pago tiene
clave de idempotencia. Los precios e impuestos se obtienen del servidor; descuentos
y cambios de precio requieren MANAGER/ADMIN y motivo.

Los recibos y pagos reutilizan los modelos anteriores. La factura interna del
cobro lleva número de ticket ORD; emitir factura restaurante asigna FAC una sola
vez. El usuario pidió comprobantes térmicos de restaurante, sin formato legal.
Se implementan 58/80 mm y comandas incrementales a otra impresora, sin precios.

La interfaz principal cambia a bar. Se conservan módulos originales para consulta
y compatibilidad, pero se impide modificar cobros del bar desde rutas heredadas.
Recetas avanzadas, integraciones de delivery y devoluciones fiscales no se habilitan
automáticamente. No se migra información de pacientes ni se copian credenciales.

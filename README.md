# Antoja2 POS · Bar & restaurante

Evolución de `jacoboroizd-a11y/MariaraulFacturacion` (main,
`e7acffbf28006ac9a3daa2637c1ff5fa466a08e9`). Reutiliza autenticación,
membresías, estilos, componentes, cálculos con Decimal, facturación, secuencias,
recibos, PDFs y auditoría. La clínica y su despliegue no se modifican.

## Desarrollo

Requiere Node 22/24, npm, Docker y PostgreSQL 17. Chromium es necesario para E2E.

```bash
npm ci
npm run local:env
npm run db:start
npm run db:generate
npm run db:migrate
npm run db:seed
npx tsx scripts/prepare-pos-demo.ts
npm run dev
```

`local:env` preserva un `.env` existente y genera valores aleatorios si no existe.
No usar el seed demo contra producción. `DATABASE_URL`, `AUTH_SECRET` y `APP_URL`
se configuran para cada despliegue. Las claves no forman parte del repositorio.
Se requiere acceso a registry.npmjs.org y binaries.prisma.sh, manteniendo TLS y
verificación de checksums. Docker descarga la imagen oficial `postgres:17`.

En este entorno se aprovisionó además la empresa original **Antoja2** y su
administrador `admin`. Su acceso privado está en
`/workspace/.cloud/Antoja2-acceso.txt`, fuera del repositorio. El script
`npx tsx scripts/provision-bar.ts` crea esa empresa solo si no existe; nunca cambia
contraseñas o datos de una empresa existente. La demo es una empresa distinta.
El usuario puede cambiar su contraseña en Configuración → Mi contraseña.

## Demostración

La demo contiene menú, modificadores, combos, 12 mesas, órdenes abiertas,
comandas y cuatro jornadas cerradas con ventas ficticias de septiembre/octubre de
2026. Los accesos están en `/workspace/.cloud/Antoja2-demo-acceso.txt`.
La preparación es repetible y no borra ventas ni modifica usuarios existentes.

- `/bar/pos`: menú táctil y cuenta al lado; en teléfono vertical se alternan paneles.
- `/bar/tables`: mesas libres, ocupadas, reservadas o pendientes de pago.
- `/bar/orders`: órdenes, consumo acumulado, descuentos, pagos y documentos.
- `/bar/kitchen`: preparación por plato; recibe retiros, extras y notas.
- `/bar/cash`: apertura, conteo, cierre y diferencias.
- `/bar/reports?kind=day&period=2026-10-19`: reporte diario de ejemplo.
- `/bar/reports?kind=month&period=2026-10`: reporte mensual de ejemplo.

La empresa demo tiene un indicador de demostración y permite operar fuera del
horario para presentar el producto. Ese modo está desactivado por defecto y en
la empresa original; no puede activarse desde la API pública de configuración.

## Flujo operativo

1. Abrir caja con fondo inicial. Horario real: 11:30 AM–00:30 AM, Managua.
2. Seleccionar mesa o canal: comer en local, barra, llevar, recoger o delivery.
3. Si es delivery, indicar PedidosYa, WhatsApp, Valazo, directo u otro y referencia.
4. Tocar productos del menú y elegir retiros, extras, cantidad y notas.
5. Enviar platos nuevos a cocina. La comanda conserva su número para reimpresión.
6. Preparar, marcar listo y servido; agregar consumo mientras la orden no tenga abonos.
7. Cobrar por uno o varios métodos y personas; cada pago genera recibo.
8. Al completar el pago se descuentan bebidas/ingredientes/combos en una transacción.
9. Imprimir factura restaurante en térmica 58/80 mm, sin formato ni validez fiscal.
10. Resolver todas las órdenes, contar efectivo y cerrar; ADMIN corrige con auditoría.

Las ventas después de medianoche y antes de 00:30 pertenecen a la jornada anterior.
No se inventa un cierre sin conteo. ADMIN puede autorizar una segunda apertura con
motivo; si hay caja abierta exige conteo y resolución de sus órdenes, conservando
su cierre. Solo puede haber una caja abierta y una orden activa por mesa.

Los recibos/PDFs y la numeración reutilizan los modelos anteriores. Una orden
pagada tiene comprobante interno ORD; emitir factura restaurante asigna FAC una
sola vez. Las cantidades y modificaciones del menú se validan en servidor. Los
abonos congelan el consumo. Cortesías requieren encargado o administrador y
consumen inventario. No se borran cobros ni ventas pagadas desde rutas heredadas.

Los reportes diario/mensual consultan el período completo en base de datos, no el
historial limitado de la pantalla de órdenes. Distinguen ventas pagadas de cobros
(incluidos abonos/cortesías), impuestos, propinas, descuentos y anulaciones, e
incluyen productos, categorías, empleados, horas, inventario y cierres. Exportan
CSV protegido contra fórmulas e impresión/PDF desde el navegador.

## Usuarios

ADMIN, MANAGER, CASHIER, WAITER, KITCHEN y VIEWER. Configuración permite crear
administradores y empleados con PIN personal, asignar roles y revocar membresías.
Se mantienen BILLING y ACCOUNTANT para compatibilidad con módulos originales.
Los permisos se aplican en servidor y las consultas se limitan por empresa.

## Impresoras y dispositivos

La interfaz es responsive y táctil: tablet/celular en horizontal y vertical.
La factura y la comanda tienen perfiles locales independientes de papel y nombre
de referencia de impresora. El navegador controla la selección real. Para imprimir
usar escala 100%, sin encabezados/pies y sin márgenes. No se confirma impresión
física por el mero hecho de crear la comanda. Reimpresión disponible sin duplicar
platos enviados. La integración silenciosa con impresoras requiere puente local.

## Validación

```bash
npm run lint
npm run typecheck
npm test
npm run test:bar
npm run test:integration
npm run build
# Con npm run dev activo:
npx playwright test tests/e2e/bar.spec.ts
```

Las pruebas del bar usan empresas temporales aisladas y eliminan solo sus datos.
E2E verifica menú y modificadores, delivery, comanda incremental, factura térmica,
reportes, administración y cuatro resoluciones sin desbordamiento horizontal.
Los E2E originales de clínica se conservan; sus flujos iniciales/navegación no son
el criterio de aceptación del POS.

## Respaldo y publicación cloud

`npm run db:backup` crea un dump privado en `/workspace/.cloud/mariaraul.dump`.
El nombre interno del contenedor/base y del backup se conserva por compatibilidad
con scripts heredados. No se usa ni se conecta la base de producción de la clínica.
`db:start` restaura el dump únicamente cuando no existe el esquema de aplicación.

La publicación conserva archivos y dependencias; reiniciar Docker y Next es
necesario en una nueva instancia. Cada tarea cloud ya está aislada: usar el
checkout existente y no crear worktrees salvo petición expresa.

En Vercel configurar `DATABASE_URL`, `AUTH_SECRET` y `APP_URL` del nuevo POS, aplicar
migraciones y aprovisionar usuarios en la base de destino. Esta implementación
local no publica ni modifica los sitios de la clínica.

Ver [decisiones de adaptación](docs/adaptacion-bar.md) y
[referencias de POS y límites de integración](docs/referencias-pos.md).

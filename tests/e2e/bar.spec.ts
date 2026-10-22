import 'dotenv/config';
import {test,expect} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {hash} from 'bcryptjs';
import {mkdirSync} from 'node:fs';
import {db} from '../../server/db';
const companyId='pos-e2e-'+randomUUID();
const password=randomBytes(20).toString('base64url');
const email=companyId+'@example.invalid';
let userId='';let foodId='';let categoryId='';
const origin=process.env.E2E_BASE_URL||'http://localhost:3000';
test.beforeAll(async()=>{
 await db.company.create({data:{id:companyId,name:'Antoja2 · Prueba de presentación',settings:{create:{sandboxDemo:true}}}});
 const user=await db.user.create({data:{name:'Administrador de prueba',email,passwordHash:await hash(password,12),memberships:{create:{companyId,role:'ADMIN'}}}});userId=user.id;
 const category=await db.barCategory.create({data:{companyId,name:'Hamburguesas',kind:'FOOD'}});categoryId=category.id;
 const drink=await db.barCategory.create({data:{companyId,name:'Cervezas',kind:'DRINK'}});
 const food=await db.product.create({data:{companyId,name:'Hamburguesa de la casa',sku:'H',price:'220',description:'Carne, queso y vegetales con papas',type:'SERVICE'}});foodId=food.id;
 await db.barProduct.create({data:{id:food.id,companyId,kind:'FOOD',categoryId,cost:'90',customizations:[{key:'no-onion',label:'cebolla',kind:'REMOVE',price:'0'},{key:'cheese',label:'queso',kind:'EXTRA',price:'25'}]}});
 const beer=await db.product.create({data:{companyId,name:'Cerveza Toña',sku:'T',price:'65'}});
 await db.barProduct.create({data:{id:beer.id,companyId,kind:'DRINK',categoryId:drink.id,cost:'38',trackStock:true,stock:'100',minimum:'10'}});
 await db.diningTable.create({data:{companyId,name:'Mesa 01',seats:4}});
 const now=new Date();const localDate=new Date(now.getTime()-6*3600000).toISOString().slice(0,10);
 await db.businessDay.create({data:{companyId,date:new Date(localDate),openedBy:userId,opening:'500'}});
 mkdirSync('/workspace/.cloud/demo-capturas',{recursive:true});
});
async function login(page:import('@playwright/test').Page){await page.goto('/login');await page.getByLabel('Usuario o correo').fill(email);await page.getByLabel('PIN o contraseña').fill(password);await page.getByRole('button',{name:'Iniciar sesión'}).click();await expect(page).toHaveURL(/\/bar$/);}
test('POS táctil, modificaciones, comanda, factura térmica y reportes',async({page})=>{
 await login(page);await page.goto('/bar/pos');
 await expect(page.getByRole('heading',{name:'¿Qué tipo de pedido es?'})).toBeVisible();await expect(page.getByPlaceholder('Buscar en el menú…')).toHaveCount(0);await page.getByRole('button',{name:/^Delivery/}).click();
 await page.getByRole('button',{name:'WhatsApp',exact:true}).click();
 await page.getByLabel('Referencia del pedido').fill('WA-DEMO-12');await page.getByRole('button',{name:'Comidas',exact:true}).click();
 await page.getByRole('button',{name:/Hamburguesa de la casa/}).click();
 await page.getByLabel('Sin cebolla').check();await page.getByLabel(/Extra queso/).check();await page.getByPlaceholder('Salsa aparte, término de la carne…').fill('Salsa aparte');
 await page.getByRole('button',{name:'Agregar 1 a la orden'}).click();
 await expect(page.locator('dialog')).toHaveCount(0);
 await expect(page.locator('.pos-cart')).toContainText('Sin cebolla');
 await expect(page.locator('.pos-cart')).toContainText('Extra queso');
 await expect(page.locator('.pos-cart')).toContainText('C$ 245.00');
 await expect(page.locator('.pos-cart')).toContainText('Delivery · WhatsApp');
 for(const [name,width,height] of [['tablet-horizontal',1180,820],['tablet-vertical',820,1180],['celular-horizontal',844,390],['celular-vertical',390,844]] as const){
  await page.setViewportSize({width,height});
  const tabs=page.locator('.pos-mobile-tabs');if(await tabs.isVisible())await page.getByRole('button',{name:'Menú',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/workspace/.cloud/demo-capturas/'+name+'.png',fullPage:true});
 }
 await page.setViewportSize({width:1180,height:820});
 await page.getByRole('button',{name:'Enviar a cocina',exact:true}).click();
 await expect(page).toHaveURL(/\/bar\/print\/kitchen\//);
 await expect(page.locator('.thermal-paper')).toContainText('Sin cebolla');await expect(page.locator('.thermal-paper')).toContainText('WhatsApp');await expect(page.locator('.thermal-paper')).not.toContainText('C$');
 await expect(page.getByRole('button',{name:'Imprimir comanda',exact:true})).toBeDisabled();await page.getByLabel('Impresora de cocina',{exact:true}).selectOption('system');await page.evaluate(()=>{window.print=()=>{(window as unknown as {printCalled:boolean}).printCalled=true;};});await page.getByRole('button',{name:'Imprimir comanda',exact:true}).click();expect(await page.evaluate(()=>(window as unknown as {printCalled:boolean}).printCalled)).toBe(true);await page.getByLabel('Ancho del rollo').selectOption('58');await page.reload();await expect(page.getByLabel('Ancho del rollo')).toHaveValue('58');
 await page.screenshot({path:'/workspace/.cloud/demo-capturas/comanda.png',fullPage:true});
 const order=await db.barOrder.findFirstOrThrow({where:{companyId}});
 const paid=await page.request.post('/api/bar/pay',{headers:{origin},data:{orderId:order.id,requestId:randomUUID(),payments:[{method:'CASH',amount:'100',person:'Persona 1'},{method:'CARD',amount:'145',person:'Persona 2'}]}});expect(paid.ok()).toBe(true);
 await page.goto('/bar/print/invoice/'+order.id);await expect(page.getByRole('button',{name:'Imprimir factura',exact:true})).toBeDisabled();await expect(page.locator('.thermal-paper')).toContainText('FACTURA RESTAURANTE');await expect(page.locator('.thermal-paper')).toContainText('C$ 245.00');await expect(page.locator('.thermal-paper')).toContainText('WhatsApp');
 await page.emulateMedia({media:'print'});const pdf=await page.pdf({preferCSSPageSize:true});expect(pdf.subarray(0,4).toString()).toBe('%PDF');await page.emulateMedia({media:'screen'});
 await page.goto('/bar/reports?kind=month&period='+new Date(new Date().getTime()-6*3600000).toISOString().slice(0,7));await expect(page.getByRole('heading',{name:'Reporte mensual'})).toBeVisible();await expect(page.locator('main')).toContainText('C$ 245.00');await page.screenshot({path:'/workspace/.cloud/demo-capturas/reporte-mensual.png',fullPage:true});
 await page.getByRole('link',{name:'Diario',exact:true}).click();await expect(page.getByRole('heading',{name:'Reporte diario'})).toBeVisible();
 const noOrigin=await page.request.post('/api/bar/stock',{data:{productId:foodId,type:'ENTRY',quantity:'1',reason:'No origin'}});expect(noOrigin.status()).toBe(403);
});
test('navegación agrupada y compras dentro de caja',async({page})=>{
 await login(page);await page.goto('/bar/menu');
 await expect(page.getByRole('heading',{name:'Menú',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Secciones del menú'})).toBeVisible();
 await page.getByRole('link',{name:'Bebidas',exact:true}).click();await expect(page).toHaveURL(/tab=drinks/);
 await page.goto('/bar/inventory');await page.getByRole('link',{name:'Historial de movimientos',exact:true}).click();await expect(page.getByRole('heading',{name:'Inventario',exact:true})).toBeVisible();
 await expect(page.locator('aside').getByRole('link',{name:'Proveedores',exact:true})).toHaveCount(0);
 await page.goto('/bar/cash');await page.getByText('+ Registrar gasto o factura de compra',{exact:true}).click();
 await page.getByLabel(/^Tipo/).selectOption('PURCHASE');await page.getByLabel('Monto (C$)',{exact:true}).fill('25');await page.getByLabel('Concepto',{exact:true}).fill('Compra E2E');
 await page.getByLabel('N.º de factura / referencia').fill('TEST-001');
 await page.getByLabel(/Comprobante \(PDF/).setInputFiles({name:'factura.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nDemo')});
 await page.getByRole('button',{name:'Guardar gasto',exact:true}).click();await expect(page.getByText('Compra E2E',{exact:true})).toBeVisible();
 const e=await db.barExpense.findFirstOrThrow({where:{companyId}});const r=await page.request.get('/api/bar/expenses/'+e.id+'/receipt');expect(r.ok()).toBe(true);expect(r.headers()['content-type']).toBe('application/pdf');
 await page.setViewportSize({width:390,height:844});await page.goto('/bar/menu');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('pedido guiado, formulario sencillo y personalización desde Órdenes',async({page})=>{
 await login(page);await page.goto('/bar/pos');await page.getByRole('button',{name:/^Mesa/}).click();await page.getByRole('button',{name:/Mesa 01/}).click();await page.getByRole('button',{name:'Comidas',exact:true}).click();await expect(page.getByPlaceholder('Buscar en el menú…')).toBeVisible();
 await page.getByRole('button',{name:/Hamburguesa de la casa/}).click();await page.getByRole('button',{name:'Agregar 1 a la orden'}).click();await expect(page.locator('dialog')).toHaveCount(0);
 const o=await db.barOrder.findFirstOrThrow({where:{companyId,channel:'TABLE'}});await page.goto('/bar/orders?order='+o.id);await page.getByRole('button',{name:'Personalizar',exact:true}).click();await page.getByLabel('Sin cebolla').check();await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await expect(page.getByText('Sin cebolla',{exact:true})).toBeVisible();
 await page.goto('/bar/menu');await page.getByText('Agregar plato',{exact:true}).click();const name=page.getByLabel('Nombre',{exact:true});await expect(name).toBeVisible();await expect(page.getByLabel('Código (se genera solo)')).not.toBeVisible();await name.fill('Plato sencillo E2E');await page.locator('select[name=categoryId]').selectOption(categoryId);await page.getByLabel('Precio de venta (C$)',{exact:true}).fill('125');await page.getByRole('button',{name:'Guardar',exact:true}).last().click();await expect(page.getByText('Plato sencillo E2E',{exact:true})).toBeVisible();
 await page.goto('/bar');await expect(page.getByRole('region',{name:'Proyección de ventas'})).toBeVisible();await page.goto('/bar/cash');await expect(page.getByLabel('Contado Cerveza Toña',{exact:true}).first()).toBeVisible();await page.locator('aside').getByRole('link',{name:'Inventario',exact:true}).click();await page.getByRole('link',{name:'Ingredientes · opcional',exact:true}).click();await page.getByRole('button',{name:'Activar inventario de ingredientes',exact:true}).click();await page.getByText('+ Agregar ingrediente',{exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Pollo E2E');await page.getByLabel('Costo de 1 unidad (C$)',{exact:true}).fill('10');await page.getByLabel('Cantidad comprada',{exact:true}).fill('1');await page.getByRole('button',{name:'Guardar ingrediente',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'Pollo E2E'})).toContainText('C$ 10.00');await page.getByRole('link',{name:'Almacén',exact:true}).click();const beer=await db.barProduct.findFirstOrThrow({where:{companyId,kind:'DRINK'}});await page.getByLabel(/^Producto/).selectOption(beer.id);await page.getByLabel('Cantidad',{exact:true}).fill('10');await page.getByLabel('Ingresar cantidad en').selectOption('boxes');await page.getByLabel('Unidades por caja',{exact:true}).fill('24');await page.getByLabel('Factura o motivo').fill('Compra E2E');await page.getByRole('button',{name:'Guardar movimiento',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'Cerveza Toña'})).toContainText('240');await page.getByLabel('¿Qué vas a hacer?').selectOption('TO_SALE');await page.getByLabel('Cantidad',{exact:true}).fill('2');await page.getByRole('button',{name:'Guardar movimiento',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'Cerveza Toña'})).toContainText('192');
});
test('admin original y usuarios con roles de empleados',async({page})=>{await login(page);await page.goto('/settings');await expect(page.getByText('Usuarios y acceso')).toBeVisible();await page.getByText('Crear usuario',{exact:true}).click();const options=await page.locator('select').allTextContents();expect(options.join(' ')).toContain('Mesero');expect(options.join(' ')).toContain('Cocina');expect(options.join(' ')).toContain('Cajero');await expect(page.getByText('Mi contraseña',{exact:true})).toBeVisible();});
test.afterAll(async()=>{
 await db.kitchenDispatch.deleteMany({where:{companyId}});await db.barPayment.deleteMany({where:{companyId}});await db.barOrderItem.deleteMany({where:{companyId}});await db.barOrder.deleteMany({where:{companyId}});await db.receipt.deleteMany({where:{companyId}});await db.payment.deleteMany({where:{companyId}});await db.invoiceItem.deleteMany({where:{companyId}});await db.invoice.deleteMany({where:{companyId}});await db.inventoryMovement.deleteMany({where:{companyId}});await db.recipePart.deleteMany({where:{companyId}});await db.barProduct.deleteMany({where:{companyId}});await db.product.deleteMany({where:{companyId}});await db.barCategory.deleteMany({where:{companyId}});await db.supplier.deleteMany({where:{companyId}});await db.diningTable.deleteMany({where:{companyId}});await db.barExpense.deleteMany({where:{companyId}});await db.businessDay.deleteMany({where:{companyId}});await db.customer.deleteMany({where:{companyId}});await db.auditLog.deleteMany({where:{companyId}});await db.membership.deleteMany({where:{companyId}});if(userId){await db.session.deleteMany({where:{userId}});await db.user.delete({where:{id:userId}});}await db.companySettings.deleteMany({where:{companyId}});await db.company.deleteMany({where:{id:companyId}});await db.$disconnect();
});

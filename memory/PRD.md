# Sistema POS Ecuador - PRD

## Problema Original
Aplicación web de gestión de inventario y punto de venta (POS) para múltiples negocios en Ecuador, con facturación electrónica SRI, multi-tenant, soporte offline, y roles de usuario.

## Arquitectura
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python) + Motor (async MongoDB driver)
- **DB**: MongoDB (single instance, tenant isolation via business_id field)
- **Auth**: JWT con httpOnly cookies + refresh tokens
- **Storage**: Emergent Object Storage (logos, imágenes productos)
- **Diseño**: Swiss/High-Contrast Light Theme, tipografía Inter

## User Personas
1. **Superadmin (Dueño)**: Acceso total, configura negocio, crea usuarios
2. **Administrador de Local**: Gestión de un local específico
3. **Vendedor/Cajero**: POS y consulta inventario
4. **Bodeguero**: Gestión de inventario sin POS
5. **Contador**: Reportes y facturación, solo lectura

## Core Requirements (Estáticos)
- Multi-tenant con aislamiento por business_id
- Validación RUC/cédula ecuatoriana
- IVA: 0%, 5%, 15%
- Moneda: USD, Zona horaria: America/Guayaquil
- Facturación electrónica XML (formato SRI v1.1.0)
- PDF RIDE (Representación Impresa del Documento Electrónico)
- Cierre de caja con cuadre

## Lo Implementado (15 Mayo 2026)
### Módulo 1 - Setup del Negocio ✅
- Wizard 3 pasos: datos negocio, sucursales, admin
- Validación RUC ecuatoriano, provincias/cantones
- Sectores y regímenes tributarios

### Módulo 2 - Usuarios y Roles ✅
- CRUD usuarios, asignación de roles
- 5 roles: superadmin, administrador, vendedor, bodeguero, contador
- Permisos por rol en cada endpoint

### Módulo 3 - Inventario ✅
- CRUD productos con categorías
- Búsqueda por nombre, código, código de barras
- Ajuste de stock (entrada/salida/ajuste)
- Alertas de stock bajo
- Filtros por categoría

### Módulo 4 - Punto de Venta ✅
- Interfaz tipo caja registradora
- Búsqueda de productos en tiempo real
- Carrito con cantidades, descuentos
- Múltiples métodos de pago (efectivo, tarjeta, transferencia)
- Cálculo de cambio
- Apertura/cierre de caja

### Módulo 5 - Facturación ✅
- Generación XML formato SRI Ecuador
- Clave de acceso 49 dígitos (algoritmo módulo 11)
- PDF RIDE descargable
- Secuenciales por establecimiento/punto emisión
- Anulación lógica de comprobantes

## Backlog Priorizado
### P0 (Crítico - Próxima iteración)
- [ ] Módulo 6: Reportes (ventas por período, por local, inventario valorizado)
- [ ] Módulo 7: Proveedores y Compras
- [ ] Soporte offline (PWA + IndexedDB + cola de sincronización)

### P1 (Importante)
- [ ] Importación masiva CSV/Excel de productos
- [ ] Escaneo de código de barras con cámara (ZXing/QuaggaJS)
- [ ] Transferencia de stock entre locales
- [ ] Historial de movimientos detallado por producto
- [ ] Exportación a Excel/PDF de reportes

### P2 (Deseable)
- [ ] Logs de auditoría
- [ ] Backups automáticos
- [ ] Cierre de caja imprimible
- [ ] PWA completa con Service Workers
- [ ] Subdominio por tenant

## Next Tasks
1. Implementar Módulo 6 (Reportes)
2. Implementar Módulo 7 (Proveedores)
3. Agregar funcionalidad offline/PWA
4. Importación masiva de productos
5. Escaneo de código de barras por cámara

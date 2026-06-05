# Sistema POS Ecuador

Sistema de punto de venta multi-tenant con facturación electrónica SRI, control de inventario, gestión de caja y soporte offline (PWA).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 19 + Craco + Tailwind + Shadcn/UI + Recharts + html5-qrcode |
| Backend | FastAPI + Motor (MongoDB async) + JWT httpOnly + fpdf2 |
| DB | MongoDB (multi-tenant via `business_id`) |
| Offline | Service Worker + IndexedDB (productos) + Sync Queue (ventas) |
| Storage | Emergent Object Storage (logos, imágenes) |

## Estructura

```
.
├── backend/
│   ├── server.py              # FastAPI app + arranque + seed admin
│   ├── auth.py                # JWT, bcrypt, get_current_user
│   ├── database.py            # Mongo connection
│   ├── requirements.txt
│   ├── .env                   # MONGO_URL, JWT_SECRET, ADMIN_*
│   ├── routes/                # auth, business, inventory, pos, invoices, etc.
│   ├── utils/                 # ecuador.py (validación RUC/cédula/clave acceso)
│   └── tests/                 # pytest
├── frontend/
│   ├── package.json
│   ├── craco.config.js
│   ├── public/                # manifest.json + service-worker.js
│   └── src/
│       ├── App.js             # Rutas + AuthProvider
│       ├── components/        # Layout, BarcodeScanner, ConnectionStatus, etc.
│       ├── pages/             # Login, Setup, Dashboard, POS, Inventory, ...
│       ├── contexts/          # AuthContext
│       ├── hooks/             # use-toast
│       └── lib/               # api (axios), offlineDb (IndexedDB), syncQueue
├── memory/PRD.md
└── test_reports/              # Reportes previos de testing
```

## Cómo correrlo

### 1) Backend

```bash
cd backend
python -m venv venv          # o usar el que ya existe
source venv/bin/activate
pip install -r requirements.txt

# Variables de entorno (crear .env si no existe)
cat > .env <<EOF
MONGO_URL=mongodb://localhost:27017/pos_ecuador
DB_NAME=pos_ecuador
JWT_SECRET=<cualquier-string-largo-aleatorio>
ADMIN_EMAIL=admin@sistema.com
ADMIN_PASSWORD=Admin123!
CREDENTIALS_DIR=/tmp/pos_creds   # opcional, donde escribir test_credentials.md
STRIPE_SECRET_KEY=sk_test_dummy  # opcional, solo para payment_routes
EOF

# Levantar MongoDB (si no está corriendo)
#   docker run -d -p 27017:27017 --name mongo mongo:7
# o usar uno local ya iniciado.

# Arrancar el server
CREDENTIALS_DIR=/tmp/pos_creds venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
```

El seed crea automáticamente un superadmin (`admin@sistema.com` / `Admin123!`).

### 2) Frontend

```bash
cd frontend
yarn install        # o npm install
REACT_APP_BACKEND_URL=http://localhost:8000 yarn start
# Abre http://localhost:3000
```

`REACT_APP_BACKEND_URL` debe apuntar al backend. Las cookies httpOnly se manejan con `withCredentials: true` en `frontend/src/lib/api.js`.

### 3) Tests

```bash
cd backend
source venv/bin/activate
pip install pytest requests
REACT_APP_BACKEND_URL=http://localhost:8000 pytest tests/ -v
```

Los tests asumen que el backend está corriendo y que existe el admin seed. Crean dinámicamente tenants con RUCs únicos (RUC `1714616123001` ya se usa en tests legacy).

## Roles

| Rol | Acceso |
|-----|--------|
| `superadmin` | Dueño del negocio: todo, incluido desactivar usuarios |
| `administrador` | Admin de local: todo excepto desactivar usuarios |
| `vendedor` | POS, ventas, caja |
| `bodeguero` | Inventario, compras, transferencias |
| `contador` | Comprobantes, reportes, auditoría |

## Funcionalidades implementadas

- **Módulo 1**: Setup wizard (negocio + sucursal + admin) con validación de RUC/cédula ecuatoriana
- **Módulo 2**: 5 roles + CRUD de usuarios con `branch_ids`
- **Módulo 3**: Inventario (productos, categorías, stock, import CSV/Excel, plantilla descargable, escaneo cámara)
- **Módulo 4**: POS (carrito, pagos múltiples, caja abrir/cerrar, ticket imprimible PDF 80mm, ticket HTML, sync offline)
- **Módulo 5**: Facturación electrónica SRI (clave acceso 49 dígitos, XML, RIDE PDF, anulación con motivo)
- **Módulo 6**: Reportes (ventas, top productos, por categoría, por vendedor, valorización inventario, cierres caja) + export Excel/PDF
- **Módulo 7**: Proveedores + órdenes de compra + recepción con actualización de stock
- **Offline**: PWA manifest + Service Worker + IndexedDB (productos) + sync queue (ventas)
- **Auditoría**: log automático de acciones (crear/editar/eliminar producto, ventas, anulación, etc.)
- **Transferencias**: entre sucursales con movimientos de inventario

## Endpoints clave

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login (httpOnly cookies) |
| POST | `/api/auth/logout` | Logout |
| GET  | `/api/auth/me` | Usuario actual |
| POST | `/api/business/setup` | Wizard de setup inicial |
| GET  | `/api/business/my-business` | Datos del negocio + sucursales |
| GET/POST/PUT/DELETE | `/api/inventory/products[/{id}]` | CRUD productos |
| POST | `/api/inventory/stock-adjustment` | Ajustar stock (entrada/salida/ajuste) |
| POST | `/api/inventory/import-csv` | Importar productos desde CSV/Excel |
| GET  | `/api/inventory/export-template` | Plantilla Excel |
| GET  | `/api/inventory/low-stock` | Productos con stock bajo |
| POST | `/api/pos/open-register` | Abrir caja |
| POST | `/api/pos/close-register` | Cerrar caja |
| POST | `/api/pos/cash-movement` | Ingreso/egreso manual |
| POST | `/api/pos/sell` | Crear venta + bajar stock |
| GET  | `/api/pos/sales[/{id}]` | Historial de ventas |
| GET  | `/api/pos/dashboard-stats` | Métricas para dashboard |
| GET  | `/api/pos/register-ticket/{id}` | Datos para ticket HTML |
| GET  | `/api/pos/register-ticket-pdf/{id}` | PDF 80mm del cierre |
| POST | `/api/invoices/generate` | Generar factura/nota de venta |
| POST | `/api/invoices/annul` | Anular comprobante |
| GET  | `/api/invoices/{id}/xml` | XML SRI |
| GET  | `/api/invoices/{id}/pdf` | PDF RIDE |
| GET  | `/api/reports/sales-summary` | Resumen de ventas |
| GET  | `/api/reports/sales-by-{category,product,vendor}` | Reportes específicos |
| GET  | `/api/reports/inventory-valuation` | Valorización de stock |
| GET  | `/api/reports/cash-register-history` | Historial de cierres |
| GET  | `/api/reports/export/{sales-excel,sales-pdf,inventory-excel}` | Exportes |
| GET/POST/PUT/DELETE | `/api/users[/{id}]` | CRUD de usuarios |
| GET  | `/api/users/roles` | Roles disponibles |
| GET  | `/api/suppliers[/{id}]` | CRUD proveedores |
| GET/POST | `/api/suppliers/purchase-orders` | Órdenes de compra |
| POST | `/api/suppliers/receive-merchandise` | Recibir mercadería (sube stock) |
| POST/GET | `/api/transfers/` | Transferencias entre sucursales |
| GET  | `/api/audit/logs` | Logs de auditoría |
| POST | `/api/payments/create-link` | Link de pago Stripe (mock si key=dummy) |

## Decisiones / notas

- **Multi-tenant**: cada query filtra por `business_id` del JWT. Las sucursales y los productos están scopeados al negocio.
- **CORS**: configurado a un único origen (`FRONTEND_URL`); en producción suele ser el mismo dominio a través del ingress.
- **Caracteres especiales**: el RIDE PDF sanitiza texto con `_safe_pdf_text()` (latin-1) porque la fuente por defecto de fpdf2 (Helvetica) no soporta UTF-8 directamente. Si quieres ñ/á/é/etc. nativas, hay que registrar una TTF unicode (p. ej. `pdf.add_font("DejaVu", "", "DejaVuSans.ttf")`).
- **Offline**: el `POSPage` cachea productos en IndexedDB al estar online; las ventas sin conexión se guardan en `pendingSales` y se reintentan vía `syncQueue` cada 30s.
- **Caja esperada vs contada**: `close-register` calcula `monto_inicial + ventas_efectivo + ingresos_manuales - egresos_manuales` y compara con el efectivo contado; la diferencia se persiste.

## Pendientes / ideas

Ver `PROPOSED_FEATURES.md` para una lista. Las prioridades P1 del PRD son:
- Historial detallado de movimientos por producto (ya está parcialmente vía `/api/inventory/movements`)
- Logs de auditoría (ya está en `/api/audit/logs`)
- Cierre de caja imprimible (ya está con ticket HTML + PDF 80mm)
- Service Worker completo con cache de assets (básico hecho, falta stale-while-revalidate para chunks)
- Subdominio por tenant
- Backups automáticos
- Notificaciones de stock bajo por email/WhatsApp

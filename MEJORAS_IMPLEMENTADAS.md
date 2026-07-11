# Mejoras implementadas

## Producción y seguridad

- `.env`, `node_modules`, logs y archivos del sistema están excluidos mediante `.gitignore`.
- `.env.example` contiene únicamente nombres de variables, sin credenciales.
- Las páginas `/admin` y `/admin/*` redirigen a `/login/` sin una sesión válida.
- Las APIs administrativas responden `401` cuando no existe sesión.
- Las sesiones usan cookies `HttpOnly`, `SameSite=Strict` y `Secure` en producción.

## Productos

- La fuente oficial es MySQL (`articulo_servicio`); no hay precios estáticos activos.
- El catálogo público exige `activo`, `catalogo`, `presentar_facturacion` y `disponible`.
- El admin puede consultar todos los productos y filtrar por existencia o visibilidad.
- El precio público incluye ITBIS y se calcula desde `precio_d` y `porciento_itbis`.
- El detalle consulta un solo producto mediante `GET /api/products/:id`.
- El catálogo mantiene búsqueda, filtros, orden y paginación de 12 productos.
- Al crear un producto, `codigo` y `articulo_codigo` se reservan automáticamente y se guardan en MySQL.
- El precio es opcional al crear; si se omite se guarda en `0` y se muestra como “Consultar precio”.
- La garantía solo se muestra cuando el campo `garantia` del producto en MySQL es mayor que cero.
- La existencia se obtiene desde `SUM(existencia.existencia)` y limita las cantidades del carrito y del backend.

## Cotizaciones

- Solo el envío completo desde “Mi Cotización” crea registros.
- El backend exige nombre, teléfono y al menos un item válido.
- Los productos y precios se vuelven a consultar en MySQL antes de guardar.
- Los totales se calculan en el servidor, no se confía en importes del navegador.
- Cabecera e items se guardan juntos en una transacción.
- La numeración diaria usa `ULTRA-YYYY-MM-DD-001`.

## Imágenes

- Las rutas públicas son relativas (`/IMAGENES/...`).
- `UPLOAD_DIR` permite usar almacenamiento persistente en producción.
- Las cargas nuevas aceptan JPG, PNG y WEBP, con verificación del contenido real.
- El límite por archivo es 8 MB; se recomienda WEBP para producción.

## Estado del servicio

`GET /api/health` informa estado, conexión, modo, cantidad de productos, fecha y versión.

## Ejecución

```bash
npm install
npm start
```

Configura primero las variables indicadas en `.env.example`. Nunca distribuyas `.env`.
# Preparación para producción y administración integral

- Contenido, sesiones administrativas, solicitudes y taxonomías persistentes en MySQL.
- Categorías y marcas asignadas explícitamente, sin clasificación pública por nombre.
- Administración de testimonios y preguntas frecuentes desde el panel.
- Solicitudes de ULTRASOFT guardadas aunque falle temporalmente el correo.
- Historial de auditoría y respaldo JSON descargable.
- Encabezados de seguridad, protección de origen, límite de intentos de acceso y sesiones con cookie segura.
- `robots.txt`, `sitemap.xml`, URL canónica configurable y endpoint `/api/health`.
- Cierre seguro del proceso, mensaje claro para puertos ocupados y prueba automatizada con `npm run smoke`.
- Guía de despliegue y respaldo en `PRODUCCION.md`.
- Usuarios administrativos con contraseñas cifradas mediante scrypt y roles.
- Biblioteca multimedia central con subida, copia de ruta y eliminación.
- SEO, sitemap de productos, contenido de ambas marcas y datos empresariales editables.
- Restauración transaccional de respaldos sin alterar el inventario central del ERP.
- Seguimiento de solicitudes con notas internas, estados y eliminación.
- Páginas de privacidad, términos y error 404.

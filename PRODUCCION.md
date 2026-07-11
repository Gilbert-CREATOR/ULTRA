# Publicación de ULTRA

## Requisitos

- Node.js LTS (22 o superior recomendado).
- MySQL accesible desde el servidor.
- Dominio con HTTPS.
- Un volumen persistente para las imágenes.

## Variables obligatorias

Copia `.env.example` como `.env` y configura, como mínimo:

- `NODE_ENV=production`
- `SITE_URL=https://tu-dominio.com`
- conexión `MYSQL_*`
- `ADMIN_EMAIL` y una `ADMIN_PASSWORD` larga y exclusiva
- `SMTP_*`
- `UPLOAD_DIR` apuntando a un volumen persistente

No publiques `.env`. La carpeta indicada por `UPLOAD_DIR` debe conservarse entre
reinicios y despliegues; de lo contrario se perderán las imágenes subidas por el
administrador.

## Inicio y verificación

```bash
npm ci --omit=dev
npm run check
npm start
```

Comprueba `https://tu-dominio.com/api/health`. Debe responder con estado `ok` y
la base de datos `connected`.

## Operación sin tocar código

El panel permite administrar productos, imágenes, precios, ofertas, categorías,
marcas, banners, destacados, cotizaciones, solicitudes, contenido de ambas
marcas, preguntas frecuentes, testimonios, SEO, medios, usuarios administrativos
y configuración general. La existencia se consulta desde el ERP y no se altera
desde la web para evitar descuadres.

Descarga periódicamente el respaldo JSON desde **Configuración → Descargar
respaldo completo**. Además, programa respaldos externos de MySQL y del volumen
de `UPLOAD_DIR`; el archivo JSON guarda datos y rutas, no copias binarias de las
imágenes.

El panel permite restaurar el JSON desde **Respaldos**. La restauración no altera
las tablas centrales del ERP (`articulo_servicio` y `existencia`).

## Recomendaciones del hosting

- Ejecutar Node detrás de Nginx, Caddy o el proxy del proveedor.
- Mantener una sola instancia si no se utiliza almacenamiento de sesión central.
- Reiniciar automáticamente el proceso ante fallos (systemd, PM2 o servicio del proveedor).
- Hacer respaldo diario de MySQL e imágenes y conservar varias versiones.

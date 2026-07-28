# Operación segura de ULTRA sin modificar el ERP

Esta guía cubre tareas de aplicación, archivos y hosting. Ninguna instrucción
requiere cambiar la estructura ni los datos centrales del ERP.

## Límites respetados

- No ejecutar scripts con `--apply` contra MySQL sin autorización del propietario.
- No alterar `articulo_servicio`, `existencia` ni otras tablas del ERP.
- No eliminar asociaciones de imágenes automáticamente.
- Usar `npm run audit-images` para diagnósticos de solo lectura basados en el respaldo JSON más reciente.

## Render y archivos persistentes

Configura un Persistent Disk y apunta `UPLOAD_DIR` a una carpeta dentro de ese
disco, por ejemplo `/var/data/IMAGENES`. `BACKUP_DIR` también debe apuntar a una
ruta persistente si se desean conservar respaldos locales después de reinicios.

Comprueba después de cada despliegue:

1. Subir una imagen de prueba desde Medios.
2. Reiniciar el servicio.
3. Confirmar que la imagen continúa disponible.
4. Eliminar la imagen de prueba desde el panel.

Si el registro muestra que se está usando `/tmp/ultra-imagenes`, las cargas son
temporales y deben detenerse hasta corregir el montaje del disco.

## Respaldo externo

El respaldo JSON no contiene las imágenes. Programa, desde el proveedor y con
autorización de la empresa, copias separadas de:

- la base MySQL;
- la carpeta indicada por `UPLOAD_DIR`;
- las variables y configuración del servicio, almacenadas en un gestor seguro.

Una retención razonable es 7 copias diarias, 4 semanales y 6 mensuales. La
restauración debe probarse primero en un entorno aislado, nunca directamente
sobre la base empresarial.

## Comandos seguros de verificación

```bash
npm run check
npm test
npm run audit-images
```

`npm run audit-images` no escribe en MySQL ni elimina archivos. Informa archivos
faltantes, imágenes sin asociación según el respaldo y duplicados por contenido.

## Protección pública

En producción usa `TRUST_PROXY=true` únicamente detrás del proxy de Render. ULTRA
limita solicitudes de contacto, cotizaciones y actualizaciones de carrito por IP.
El formulario de ULTRASOFT incluye un honeypot y ya no guarda datos personales en
`localStorage` ni los expone mediante atajos de consola.

## Imágenes

- Una imagen solo se publica si está asignada explícitamente al producto.
- Los archivos sin asociación no se asignan por nombre o similitud.
- No borres los archivos reportados como duplicados sin revisar cada asociación.
- Para optimización futura, usa WebP y conserva una copia externa del original.
- Un CDN o almacenamiento de objetos requiere autorización y credenciales de la empresa; no debe configurarse desde este repositorio sin ellas.

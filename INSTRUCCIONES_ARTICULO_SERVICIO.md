# ULTRACOMP conectado solo a MySQL

La fuente oficial de productos es `dbenterpriseultrasoft.articulo_servicio` por medio de `/api/products`.

Para cotizaciones, el único código que se muestra y se envía es `articulo_codigo`.

`ULTRACOMP/productos-data.js` está desactivado y no contiene productos reales.

Después de reemplazar archivos, ejecutar en el navegador:

```js
localStorage.removeItem('ultraQuoteCart');
localStorage.removeItem('ultraQuotes');
```

Luego recargar con Command + Shift + R.

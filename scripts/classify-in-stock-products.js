const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function loadEnv(filePath) {
    const env = {};
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        if (!line || line.trim().startsWith('#')) continue;
        const index = line.indexOf('=');
        if (index < 0) continue;
        env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return env;
}

function normalized(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
}

function categorize(name) {
    const text = normalized(name);
    const has = pattern => pattern.test(text);
    const categories = new Set();

    if (has(/\bTABLET\b|\bFIRE HD\b|\bTAB A\b/)) categories.add('tablets');
    else if (has(/^LAPTOP\b|\bMACBOOK\b|\bTHINKPAD\b|^LENOVO L\d|^LENOVO P\d/)) categories.add('laptops');
    else if (has(/^SERVIDOR\b|PRINT SERVER/)) categories.add('servers');
    else if (has(/^CPU\b|^MINI CPU\b|\bPRODESK\b/)) categories.add('computers');
    else if (has(/^MONITOR\b|^PANTALLA\b/)) categories.add('monitors');
    else if (has(/IMPRESOR|PRINTER ZEBRA/)) categories.add('printers');
    else if (has(/^TONER\b/)) categories.add('toners');
    else if (has(/BOTELLA DE TINTA|^TINTA\b|^CARTUCHO\b|CINTA EPSON|CINTA CONY|CINTA STAR|CINTA MATRICIAL/)) categories.add('inks');
    else if (has(/\bROUTER\b|\bSWITCH\b|\bREPETIDOR\b|\bMESH WIFI\b|ACCESS POINT|USB WIFI|WIFI CON ANTENA/)) categories.add('network');
    else if (has(/^CABLE\b|^PATCH CORD\b|^PATCH CABLE\b|^EXTENSION .*USB|^EXTENSION ARGOM DE SONIDO|EXTENCION HDMI|^JACLINK CABLE|^JACKLINK CABLE|TERMINAL P\/CABLE|RJ-45 (CONECTOR|JACK|FACE)|CONECTOR JACK.*CAT/)) categories.add('cables');
    else if (has(/^ADAPTADOR\b|ADAPTADOR DP|ADAPTADOR HDMI|^JACKLINK ADAPTADOR|SPLITTER HDMI|ESPANSOR HDMI|USB TO RJ45|USB RJ45/)) categories.add('adapters');
    else if (has(/CARGADOR|CARDADOR|CABEZA DE CARRO|CABEZA DE TELEFONO/)) categories.add('chargers');
    else if (has(/^HUB\b|USB 3\.0 HUB/)) categories.add('hubs');
    else if (has(/^MEMORIA (RAM|DDR|PC3|PC4)|^MEMORIA .*DDR|\bDDR[34]\b.*(DESKTOP|LAPTOP|RAM)|^RYZEN\b/)) {
        categories.add('memory');
        categories.add('components');
    } else if (has(/^DISCO\b|^MEMORIA (USB|MICRO|SD)|^PEN ?DRIVE\b|^PENDRIVE\b|CAJA (EXTERNA|.*DISCO)|USB A HDD|LECTOR DE MEMORIA/)) categories.add('storage');
    else if (has(/MOTHERBOARD|^GRAFICA\b|^CASE (GAMER|JACL)|PASTA TERMICA|FAN COOLER|POWER SUPPLY|^POWER  |FUENTE DE COMPUTADORA|PILA MOTHER BOARD|BATERIA DELL/)) categories.add('components');
    else if (has(/BOCINA|BARRA DE SONIDO|SISTEMA DE SONIDO|REPRODUCTOR.*SONIDO|PEDESTAL PARA BOCINA|RADIO MIDLAND/)) categories.add('audio');
    else if (has(/CAMARA|SURICAM|VIDEO BALUN|\bXVR\b/)) categories.add('security');
    else if (has(/MOUSE|TECLADO|TACLADO|HEADSET|HEADPHONE|AUDIFONO|MICROFONO|WEBCAM|ESCANER|LECTOR (2D|DE CODIGO|DIGITAL)|CONTROL (FANTECH|GAME)|VOLANTE FANTECH|COMBO GAMIN/)) categories.add('peripherals');
    else if (has(/\bUPS\b|BATERIA UPS|BATERIA XCON|FUENTE \d|FUENTE RUDO|FUENTE UNIVERS/)) categories.add('power');
    else if (has(/SILLA|SILLON|ESCRITORIO|^MESA\b|MUEBLE PC|RUEDA PARA SILLA|BOTELLA HIDRAULICA|BEBEDERO/)) categories.add('furniture');
    else if (has(/CASH DRAWER|LABEL CODIGO|ROLLO.*TERMICO|ROLLO DE PAPEL|^ROLLO PAPEL|PAPEL.*CONTINU|TALONARIO|LECTOR DE PRECIOS/)) categories.add('pos');
    else if (has(/PROYECTOR/)) categories.add('projectors');
    else if (has(/ESTACION DE SOLDADURA|PINZA|MICROSCOPIO|ULTRASONIC CLEANER|SONDA PARA PROGRAMADORA|CLIP SOIC/)) categories.add('tools');
    else if (has(/BULTO|MOCHILA|FUNDA .*14|SLEEVE LAPTOP/)) categories.add('bags');
    else if (has(/BOLIGRAFO|LAPICERO|LAPIZ|MARCADOR|GRAPADORA|GRAPAS|SACAGRAPAS|FOLDER|CLIPS|NOTA ADH|POST IT|RESMA|SOBRE |TIJERA|CORRECTOR|CINTA ADH|MASKING TAPE|PEGAMENTO|ARCHIVO ACOR|GOMAS|GANCHOS P\/FOLDER|RESALTADOR|DISPENSADOR DE CINTA|CORDON PARA CARNET/)) categories.add('stationery');
    else if (has(/AIRE COMPRIMIDO|ALMOHADILLA|MOUSE PAD|SPAY PROTECTOR|PILA BATERIA|PILAS MAXELL/)) categories.add('supplies');
    else if (has(/TELEFONO IP|CABLE.*TELEFONO|CONTROL REMOTO.*TV|RADIO|CABEZA VERIZONE/)) categories.add('phones');
    else if (has(/BOMBILLO|LAMPARA|\bLED\b/)) categories.add('lighting');
    else if (has(/BASE |SOPORTE |COVER |CONECTOR |TAPA PLASTICA|BLUETOOHT|TARJETA USB SONIDO|FUNDA |TRIPODE|CALCULADORA/)) categories.add('accessories');
    else categories.add('other');

    if (has(/GAMER|GAMING|GAME PAD|VOLANTE FANTECH/)) categories.add('gaming');
    return [...categories];
}

async function main() {
    const env = loadEnv(path.join(__dirname, '..', '.env'));
    const pool = mysql.createPool({
        host: env.MYSQL_HOST,
        port: Number(env.MYSQL_PORT || 3306),
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        database: env.MYSQL_DATABASE,
        decimalNumbers: true
    });

    const [products] = await pool.query(`
        SELECT a.codigo, a.nombre
        FROM articulo_servicio a
        LEFT JOIN (
            SELECT articulo_codigo, SUM(existencia) AS existencia_total
            FROM existencia
            GROUP BY articulo_codigo
        ) e ON e.articulo_codigo = a.codigo
        WHERE a.activo = 1
          AND a.catalogo = 1
          AND a.presentar_facturacion = 1
          AND a.disponible = 1
          AND COALESCE(e.existencia_total, 0) > 0
          AND a.tipo_articulo_servicio = 'Articulo'
          AND NOT EXISTS (
              SELECT 1 FROM web_product_categories wpc
              WHERE wpc.codigo_articulo = a.codigo
          )
        ORDER BY a.nombre
    `);

    const assignments = products.map(product => ({ ...product, categories: categorize(product.nombre) }));
    const counts = {};
    for (const assignment of assignments) {
        for (const category of assignment.categories) counts[category] = (counts[category] || 0) + 1;
    }
    console.log(`Productos sin clasificación: ${assignments.length}`);
    console.table(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })));
    const otherProducts = assignments.filter(item => item.categories.includes('other'));
    if (otherProducts.length) {
        console.log('Productos revisados como Otros:');
        console.table(otherProducts.map(item => ({ codigo: item.codigo, nombre: item.nombre })));
    }

    if (!process.argv.includes('--apply')) {
        console.log('Vista previa solamente. Usa --apply para guardar.');
        await pool.end();
        return;
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (const assignment of assignments) {
            for (const category of assignment.categories) {
                await connection.query(
                    'INSERT INTO web_product_categories (codigo_articulo, category_slug) VALUES (?, ?)',
                    [assignment.codigo, category]
                );
            }
        }
        await connection.commit();
        console.log(`Clasificación guardada para ${assignments.length} productos.`);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');
const ONLY_IN_STOCK = process.argv.includes('--in-stock');

const DEFAULT_CATEGORIES = {
    computers: 'Computadoras',
    laptops: 'Laptops',
    gaming: 'Gaming',
    monitors: 'Monitores',
    components: 'Componentes',
    peripherals: 'Periféricos',
    printers: 'Impresoras',
    accessories: 'Accesorios',
    adapters: 'Adaptadores',
    supplies: 'Suministros',
    inks: 'Tintas',
    toners: 'Tóner',
    network: 'Redes',
    storage: 'Almacenamiento',
    bags: 'Bultos',
    office: 'Oficina',
    stationery: 'Papelería',
    cables: 'Cables',
    chargers: 'Cargadores',
    memory: 'Memorias',
    hubs: 'Hubs',
    lighting: 'Iluminación',
    tablets: 'Tablets',
    audio: 'Audio',
    security: 'Seguridad y cámaras',
    furniture: 'Mobiliario',
    power: 'Energía y UPS',
    pos: 'Punto de venta',
    projectors: 'Proyectores',
    tools: 'Herramientas',
    servers: 'Servidores',
    phones: 'Telefonía',
    climate: 'Climatización',
    sports: 'Deportes',
    other: 'Otros'
};

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

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function slugPart(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function createMatcher(text) {
    return pattern => pattern.test(text);
}

function add(set, ...categories) {
    categories.filter(Boolean).forEach(category => set.add(category));
}

function remove(set, ...categories) {
    categories.forEach(category => set.delete(category));
}

function categorize(product) {
    const text = normalize(`${product.nombre || ''} ${product.referencia || ''}`);
    const has = createMatcher(text);
    const categories = new Set();

    // Reglas muy específicas primero. Estas evitan falsos positivos importantes.
    if (has(/\bTONER\b|\bTONER\b|TONNER|CARTUCHO TONER|LASERJET/)) {
        add(categories, 'toners');
    } else if (has(/\bBOTELLA DE TINTA\b|\bBOTELLA (CANON|EPSON|HP|BROTHER|CONY)\b|\bTINTA\b|TINTACANON|INK BOTTLE|\bCARTUCHO\b|CARTUCHO HP|CARTUCHO CANON|CARTUCHO EPSON|CINTA EPSON|CINTA CONY|CINTA STAR|CINTA MATRICIAL|RIBBON/)) {
        add(categories, 'inks');
    }

    if (has(/\bTABLET\b|FIRE HD|IPAD|GALAXY TAB|\bTAB\s?[A-Z0-9]/)) add(categories, 'tablets');

    if (has(/\bBASE\s+(VENTILADOR\s+)?LAPTOP\b|COOLING PAD|SOPORTE\s+LAPTOP|SLEEVE LAPTOP|FUNDA\s+LAPTOP|BULTO\s+LAPTOP|MOCHILA/)) {
        if (has(/BULTO|MOCHILA|SLEEVE|FUNDA/)) add(categories, 'bags');
        else add(categories, 'accessories');
    } else if (has(/^LAPTOP\b|\bLAPTOP\s+(HP|DELL|LENOVO|ASUS|ACER)\b|MACBOOK|THINKPAD|IDEAPAD|PROBOOK|ELITEBOOK|LATITUDE|INSPIRON|CHROMEBOOK/)) {
        add(categories, 'laptops');
    }

    if (has(/^MINI CPU\b|^CPU\b|DESKTOP\b|PRODESK|OPTIPLEX|THINKCENTRE|COMPUTADORA|PC COMPLETA|ALL IN ONE|AIO\b/)) add(categories, 'computers');
    if (has(/^SERVIDOR\b|\bSERVER\b|PRINT SERVER|DELL POWEREDGE|HP PROLIANT/)) add(categories, 'servers');
    if (has(/^MONITOR\b|\bMONITOR\b|PANTALLA\b|TELEVISOR|^TV KTC|SMART TV/) || (has(/\bDISPLAY\b/) && !has(/DISPLAYPORT|ADAPTADOR|CABLE/))) add(categories, 'monitors');

    if (has(/IMPRESORA|IMPRESOR\b|PRINTER|PLOTTER|MULTIFUNCIONAL|ZEBRA|EPSON TM|POS80|LP427B/)) add(categories, 'printers');
    if (has(/ESCANER|SCANNER|LECTOR\s+(2D|CODIGO|C[OÓ]DIGO|BARRA|BARRAS)|LECTOR DE CODIGO|LECTOR DE C[OÓ]DIGO|LECTOR DE BARRA|BARCODE/)) add(categories, 'peripherals');

    if (has(/\bROUTER\b|\bSWITCH\b|\bSWITTCH\b|\bACCESS POINT\b|\bAP\b|REPETIDOR|MESH WIFI|WIFI|WIRELESS ROUTER|PATCH PANEL|FACE PLATE|TARJETA DE RED|JACK.*CAT[56]|CONECTOR.*RJ-?45|VIDEO BALUN|NVR\b|DVR\b|XVR\b/)) add(categories, 'network');
    if (has(/^PATCH CORD\b|^PACH CORD\b|^PACHD CORD\b|^PATCH CABLE\b|CABLE DE RED|CAT ?5|CAT ?6|RJ-?45|CONECTOR JACK.*CAT|JACK.*CAT/)) add(categories, 'cables', 'network');

    if (has(/^CABLE\b|CABLE HDMI|CABLE VGA|CABLE USB|CABLE DP|DISPLAYPORT.*CABLE|CABLE POWER|CABLE SATA|CABLE TELEFONO|EXTENSION .*USB|EXTENCION .*USB|EXTENSION.*SONIDO|EXTENCION.*SONIDO|EXTENSION X-TECH VGA|JACLINK CABLE|JACKLINK CABLE|LIGHTNING TO USB|MICRO HDMI|USB 2\.0|USB 3\.0.*MALE|TERMINAL P\/CABLE/)) add(categories, 'cables');
    if (has(/^ADAPTADOR\b|ADAPTADOR|CONVERTIDOR|DONGLE|DISPLAYPORT TO|DP TO|DVI A|HDMI A|VGA A|USB TO|TYPE C TO|USB-C TO|SPLITTER|EXTENSOR HDMI|ESPANSOR HDMI/)) add(categories, 'adapters');
    if (has(/^HUB\b|\bHUB\b|USB HUB|TIPO C \d+ EN \d+|TYPE C \d+ IN \d+|MULTIPUERTO/)) add(categories, 'hubs');
    if (has(/CARGADOR|CHARGER|ADAPTADOR CORRIENTE|FUENTE LAPTOP|FUENTE PARA LAPTOP|FUENTE DE CARRO|CABEZA DE (CARRO|TELEFONO|TEL[EÉ]FONO)|PLUG PEQUENO|PUNTA FINA|PUNTA GRUESA/)) add(categories, 'chargers');

    if (has(/\bMEMORIA RAM\b|\bRAM\b|\bDDR[2345]\b|\bPC3\b|\bPC3L\b|\bPC4\b|\bPC4L\b|SODIMM|DIMM/)) add(categories, 'memory', 'components');
    if (has(/^MEMORIA (USB|MICRO|SD)|PEN ?DRIVE|PENDRIVE|USB HIKSEMI|USB KINGSTON|FLASH DRIVE|MICRO SD|SD SANDISK|DISCO\b|SSD\b|HDD\b|CAJA (EXTERNA|DISCO)|ENCLOSURE|LECTOR DE MEMORIA/)) add(categories, 'storage');
    if (has(/MOTHERBOARD|BOARD|PROCESADOR|RYZEN|INTEL CORE|GRAFICA|GR[ÁA]FICA|GTX|RTX|CASE GAMER|CASE JACL|PASTA TERMICA|THERMAL|FAN COOLER|COOLER|POWER SUPPLY|FUENTE DE COMPUTADORA|PILA MOTHER|BATERIA DELL|COVER TAB|COVER TABLET/)) add(categories, 'components');

    if (has(/MOUSE|TECLADO|KEYBOARD|COMBO TECLADO|HEADSET|HEADPHONE|AUDIFONO|AURICULAR|MICROFONO|WEBCAM|CAMARA WEB|GAMEPAD|CONTROL FANTECH|VOLANTE|MOUSE PAD/)) add(categories, 'peripherals');
    if (has(/GAMER|GAMING|GAME ?PAD|VOLANTE|RGB|RAIGOR|FANTECH|XTRIKE|HQ53|HQ54|K612|MK|TRE-\d+/)) add(categories, 'gaming');

    if (has(/BOCINA|SPEAKER|BARRA DE SONIDO|SISTEMA DE SONIDO|AUDIO|RADIO MIDLAND|REPRODUCTOR.*SONIDO|PEDESTAL PARA BOCINA/)) add(categories, 'audio');
    if (has(/CAMARA|CAMERA|C[ÁA]MARA|SURICAM|VIDEO BALUN|DOME|TURRET|IPC|HIKVISION|DAHUA|FULL COLOR|SEGURIDAD|CCTV|CERRADURA|BIOMETRICO|BIOM[EÉ]TRICO|LECTOR DE HUELLAS|LECTOR DIGITAL PERSONA|CONTROL-?ZL|CONTROL-?CERRADURA|SENSOR IR/)) add(categories, 'security');

    if (has(/\bUPS\b|BATERIA UPS|BATERIA XCON|BATERIA RECARGABLE|BATERIA RECARGABLES|BATERIA REGARGABLES|INVERSOR|REGULADOR|REGLETA|PROTECTOR DE VOLTAJE|POWER STRIP|POWER SUPLY|POWER SUPPLY|\bPOWER\s+\d+|FUENTE \d+|FUENTE RUDO|FUENTE UNIVERSAL|FUENTE UNIVERSL|ADAPTADOR AC/)) add(categories, 'power');
    if (has(/BOMBILLO|LAMPARA|L[ÁA]MPARA|ILUMINACION|ILUMINACI[OÓ]N|\bLED\b|TIRA LED/)) add(categories, 'lighting');
    if (has(/PROYECTOR|PROJECTOR/)) add(categories, 'projectors');
    if (has(/AIRE KTC|SPLIT SEER|SPLIT INVERTER|COMPRESOR KTC SPLIT|CONSOLA KTC SPLIT/)) add(categories, 'climate');

    if (has(/CASH DRAWER|CAJON DE DINERO|CAJA REGISTRADORA|PUNTO DE VENTA|LAMP DETECTORA DINERO|LECTOR DE PRECIOS|ROLLO.*TERMICO|ROLLO PAPEL|PAPEL TERMICO|TALONARIO|LABEL CODIGO|ETIQUETA|IMPRESORA ETIQUETA|IMPRESORA RECIBO|POS\b/)) add(categories, 'pos');

    if (has(/SILLA|SILLON|SILL[ÓO]N|ESCRITORIO|MESA\b|MUEBLE PC|MUEBLE \(PC\)|MUEBLE FOOR PC|MUEBLE FOR PC|RUEDA PARA SILLA|BOTELLA HIDRAULICA|BEBEDERO|SOPORTE TV|BASE TV|ARCHIVERO|ARCHIVO METAL|ARCHIVO MODULAR|GAVETAS|GABETAS/)) add(categories, 'furniture');
    if (has(/BULTO|MOCHILA|MALETIN|SLEEVE|FUNDA.*LAPTOP|FUNDA KLIPX|FUNDA .*14/)) add(categories, 'bags');

    if (has(/BOLIGRAFO|BOL[ÍI]GRAFO|LAPICERO|LAPIZ|L[ÁA]PIZ|MARCADOR|GRAPADORA|GRAPAS|SACAGRAPAS|FOLDER|CLIPS|NOTA ADH|POST IT|RESMA|SOBRE\b|TIJERA|CORRECTOR|CINTA ADH|MASKING TAPE|PEGAMENTO|TAPE DOBLE CARA|SELLO CODIGO|ARCHIVO ACOR|GOMAS|GANCHOS P\/FOLDER|GANCHOS METALICOS|CARPETA|RESALTADOR|DISPENSADOR|DISPENSADOR DE CINTA|CORDON PARA CARNET|CALCULADORA|GUILLOTINA|HOJA DE PAPEL|PAPEL NOTARIAL|PAPEL CONTINUO|PAPEL FORMA CONTINUA|PLASTICO P\/LAMINAR/)) add(categories, 'stationery');
    if (has(/AIRE COMPRIMIDO|LIMPIADOR|ALMOHADILLA|SPRAY|SPAY|PILA BATERIA|PILAS MAXELL|PAÑO|TOALLA|LIMPIEZA/)) add(categories, 'supplies');
    if (has(/TELEFONO|TEL[EÉ]FONO|TELEFONO IP|TEL[EÉ]FONO IP|CABLE.*TELEFONO|CABEZA VERIZONE|CONTROL REMOTO.*TV/)) add(categories, 'phones');
    if (has(/ESTACION DE SOLDADURA|SOLDADURA|PINZA|CRIMPING|MICROSCOPIO|ULTRASONIC CLEANER|PROGRAMADORA|SONDA PARA PROGRAMADORA|CLIP SOIC|HERRAMIENTA|TESTER|MULTIMETRO|DESTORNILLADOR/)) add(categories, 'tools');

    if (has(/CASE XCON|CASE JAMA|CASE GAMER|CASE ATX|CASE MICRO/)) add(categories, 'components');
    if (has(/BOMBA AIRE|BOMBA COMPRESOR/)) add(categories, 'tools');
    if (has(/CUERDA DE SALTAR/)) add(categories, 'sports');
    if (has(/COMBO GAMIN|COMBO GAMING|COMBO GAMER/)) add(categories, 'gaming', 'peripherals');
    if (has(/CAJON AMPLIFICADO|CAJON .*BOC|CAJON .*AMP|CAJON .*USB|BOC\.|BOCINA|SPEAKER/)) add(categories, 'audio');
    if (has(/DVD EN BLANCO|CD EN BLANCO/)) add(categories, 'storage');
    if (has(/CARDADOR|CARGADO\b|CABEZA DE DOBLE CARRO|CABEZA DE CARRO/)) add(categories, 'chargers');
    if (has(/BLUETOOHT|BLUETOOTH POR USB|ADAPTADOR BLUETOOTH/)) add(categories, 'adapters');
    if (has(/GABINETE DE PARED|GABINETE GAB|RACK\b/)) add(categories, 'network');
    if (has(/IMAC\b/)) add(categories, 'computers');
    if (has(/FIRE TV STICK|STREAMING MEDIA PLAYER|TV BOX|SMART WATCH/)) add(categories, 'accessories');
    if (has(/BASE\b|SOPORTE\b|COVER\b|CONECTOR\b|TAPA PLASTICA|BLUETOOTH|BLUETOOHT|TARJETA USB SONIDO|TRIPODE|CONTROL REMOTO/) && categories.size === 0) add(categories, 'accessories');

    // Limpieza de falsos positivos.
    if (categories.has('toners')) remove(categories, 'inks');
    if (categories.has('tablets')) remove(categories, 'computers', 'laptops', 'components', 'memory', 'storage');
    if (categories.has('bags')) remove(categories, 'laptops', 'computers');
    if (categories.has('accessories') && has(/BASE\s+(VENTILADOR\s+)?LAPTOP|SOPORTE\s+LAPTOP/)) remove(categories, 'laptops', 'computers');
    if (categories.has('chargers')) remove(categories, 'adapters');
    if (categories.has('cables')) remove(categories, 'phones');
    if (categories.has('printers')) remove(categories, 'peripherals');
    if (categories.has('pos') && has(/IMPRESORA|LECTOR|ROLLO|PAPEL|LABEL|ETIQUETA/)) remove(categories, 'stationery');

    if (!categories.size) add(categories, 'other');
    return [...categories].sort();
}

async function main() {
    const env = loadEnv(path.join(__dirname, '..', '.env'));
    const pool = mysql.createPool(env.MYSQL_URL ? { uri: env.MYSQL_URL } : {
        host: env.MYSQL_HOST,
        port: Number(env.MYSQL_PORT || 3306),
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD || '',
        database: env.MYSQL_DATABASE,
        decimalNumbers: true
    });

    for (const [slug, name] of Object.entries(DEFAULT_CATEGORIES)) {
        await pool.query(
            'INSERT INTO web_categories (name, slug, active) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE name = VALUES(name), active = 1',
            [name, slug]
        );
    }

    const stockFilter = ONLY_IN_STOCK ? 'AND COALESCE(e.existencia_total, 0) > 0' : '';
    const [products] = await pool.query(`
        SELECT a.codigo, a.articulo_codigo, a.codigo_usr, a.referencia, a.nombre,
               COALESCE(e.existencia_total, 0) AS existencia_total,
               GROUP_CONCAT(wpc.category_slug ORDER BY wpc.category_slug SEPARATOR ',') AS categorias_actuales
        FROM articulo_servicio a
        LEFT JOIN (
            SELECT articulo_codigo, SUM(existencia) AS existencia_total
            FROM existencia
            GROUP BY articulo_codigo
        ) e ON e.articulo_codigo = a.codigo
        LEFT JOIN web_product_categories wpc ON wpc.codigo_articulo = a.codigo
        WHERE a.activo = 1
          AND a.tipo_articulo_servicio = 'Articulo'
          ${stockFilter}
        GROUP BY a.codigo
        ORDER BY a.nombre
    `);

    const assignments = products.map(product => ({
        ...product,
        actual: String(product.categorias_actuales || '').split(',').filter(Boolean).sort(),
        nueva: categorize(product)
    }));

    const counts = {};
    for (const assignment of assignments) {
        for (const category of assignment.nueva) counts[category] = (counts[category] || 0) + 1;
    }
    const changed = assignments.filter(item => item.actual.join(',') !== item.nueva.join(','));
    const others = assignments.filter(item => item.nueva.includes('other'));
    const reviewKeywords = /(TONER|TINTA|TABLET|BASE.*LAPTOP|LAPTOP|GRAPADORA|CABLE|CARGADOR|IMPRESORA)/i;
    const review = changed
        .filter(item => reviewKeywords.test(item.nombre))
        .slice(0, 60)
        .map(item => ({
            codigo: item.codigo,
            articulo_codigo: item.articulo_codigo,
            nombre: item.nombre,
            antes: item.actual.join(',') || '(sin categoría)',
            ahora: item.nueva.join(',')
        }));

    console.log(JSON.stringify({
        modo: APPLY ? 'APLICADO' : 'SIMULACION',
        alcance: ONLY_IN_STOCK ? 'solo productos con existencia' : 'todos los artículos activos',
        productos: assignments.length,
        cambiados: changed.length,
        otros: others.length,
        conteo_nuevo: Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1])),
        muestra_cambios_importantes: review,
        muestra_otros: others.slice(0, 40).map(item => ({
            codigo: item.codigo,
            articulo_codigo: item.articulo_codigo,
            nombre: item.nombre
        }))
    }, null, 2));

    if (!APPLY) {
        await pool.end();
        return;
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (const assignment of assignments) {
            await connection.query('DELETE FROM web_product_categories WHERE codigo_articulo = ?', [assignment.codigo]);
            for (const category of assignment.nueva) {
                await connection.query(
                    'INSERT INTO web_product_categories (codigo_articulo, category_slug) VALUES (?, ?)',
                    [assignment.codigo, category]
                );
            }
        }
        await connection.commit();
        console.log(`Categorías actualizadas para ${assignments.length} productos.`);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

main().catch(error => {
    console.error(error.code || error.name, error.message);
    process.exit(1);
});

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const rootDir = path.resolve(__dirname, '..');
const imagesDir = path.join(rootDir, 'IMAGENES');
const APPLY = process.argv.includes('--apply');
const MIN_NAME_SCORE = 14;
const VALID_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.svg']);

function loadEnv(filePath) {
    const env = {};
    if (!fs.existsSync(filePath)) return env;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        if (!line || line.trim().startsWith('#')) continue;
        const index = line.indexOf('=');
        if (index === -1) continue;
        env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return env;
}

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function tokens(value) {
    return normalize(value)
        .split(/\s+/)
        .filter(token => token.length >= 2 && !['de', 'del', 'la', 'el', 'y', 'en', 'con', 'para', 'por', 'the'].includes(token));
}

function slug(value) {
    return normalize(value).replace(/\s+/g, '-');
}

function walk(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        if (!VALID_EXT.has(ext)) return [];
        if (entry.name === 'producto-sin-imagen.svg') return [];
        return [fullPath];
    });
}

function publicPath(filePath) {
    return '/' + path.relative(rootDir, filePath).split(path.sep).map(encodeURIComponent).join('/');
}

function imageMeta(filePath) {
    const file = path.basename(filePath);
    const ext = path.extname(file);
    const base = file.slice(0, -ext.length);
    const normalized = normalize(base);
    const productPrefix = normalized.match(/^producto\s+(\d+)\b/);
    const allNumbers = [...normalized.matchAll(/\b\d+\b/g)].map(match => Number(match[0]));
    return {
        file,
        path: publicPath(filePath),
        base,
        normalized,
        slug: slug(base),
        tokens: tokens(base),
        productPrefix: productPrefix ? Number(productPrefix[1]) : null,
        numbers: allNumbers
    };
}

function scoreImage(product, image) {
    const codigo = Number(product.codigo);
    const articuloCodigo = Number(product.articulo_codigo);

    if (image.productPrefix && articuloCodigo && image.productPrefix === articuloCodigo) return { score: 1000, reason: `prefijo producto-${articuloCodigo} = articulo_codigo` };

    if (image.productPrefix) return { score: 0, reason: 'prefijo producto no corresponde a este producto' };

    const productTokens = tokens(`${product.nombre} ${product.referencia || ''}`);
    const imageTokenSet = new Set(image.tokens);
    let overlap = 0;
    for (const token of productTokens) {
        if (imageTokenSet.has(token) || image.normalized.includes(token)) {
            overlap += token.length >= 5 ? 2 : 1;
        }
    }

    const productSlug = slug(product.nombre);
    if (productSlug && image.slug.includes(productSlug.slice(0, Math.min(productSlug.length, 32)))) overlap += 8;

    return {
        score: overlap,
        reason: overlap >= MIN_NAME_SCORE ? `similitud de nombre (${overlap})` : `baja similitud (${overlap})`
    };
}

async function main() {
    const env = loadEnv(path.join(rootDir, '.env'));
    const connection = await mysql.createConnection(env.MYSQL_URL ? { uri: env.MYSQL_URL } : {
        host: env.MYSQL_HOST,
        port: Number(env.MYSQL_PORT || 3306),
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD || '',
        database: env.MYSQL_DATABASE
    });

    const [products] = await connection.query(`
        SELECT a.codigo, a.articulo_codigo, a.codigo_usr, a.referencia, a.nombre
        FROM articulo_servicio a
        WHERE a.tipo_articulo_servicio = 'Articulo'
    `);
    const [existing] = await connection.query(`
        SELECT codigo_articulo
        FROM producto_imagenes
        WHERE activo = 1
    `).catch(() => [[], []]);
    const productsWithImage = new Set(existing.map(row => Number(row.codigo_articulo)));
    const images = walk(imagesDir).map(imageMeta);

    const assignments = [];
    const uncertain = [];
    const usedImages = new Set();

    for (const product of products) {
        if (productsWithImage.has(Number(product.codigo))) continue;
        let best = null;
        for (const image of images) {
            if (usedImages.has(image.path)) continue;
            const result = scoreImage(product, image);
            if (!best || result.score > best.score) best = { image, ...result };
        }
        if (!best) continue;
        const confident = best.score >= 900 || best.score >= MIN_NAME_SCORE;
        if (confident) {
            assignments.push({ product, image: best.image, score: best.score, reason: best.reason });
            usedImages.add(best.image.path);
        } else {
            uncertain.push({ product, image: best.image, score: best.score, reason: best.reason });
        }
    }

    if (APPLY) {
        await connection.beginTransaction();
        try {
            for (const item of assignments) {
                await connection.query(`
                    INSERT INTO producto_imagenes (codigo_articulo, imagen_url, es_principal, activo)
                    VALUES (?, ?, 1, 1)
                `, [item.product.codigo, item.image.path]);
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        }
    }

    const preview = assignments.slice(0, 30).map(item => ({
        codigo: item.product.codigo,
        articulo_codigo: item.product.articulo_codigo,
        nombre: item.product.nombre,
        imagen: item.image.path,
        razon: item.reason
    }));
    const byReason = assignments.reduce((acc, item) => {
        const key = item.reason.startsWith('prefijo') ? 'prefijo_codigo' : 'similitud_nombre';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const namePreview = assignments
        .filter(item => !item.reason.startsWith('prefijo'))
        .slice(0, 20)
        .map(item => ({
            codigo: item.product.codigo,
            articulo_codigo: item.product.articulo_codigo,
            nombre: item.product.nombre,
            imagen: item.image.path,
            razon: item.reason
        }));

    console.log(JSON.stringify({
        modo: APPLY ? 'APLICADO' : 'SIMULACION',
        productos: products.length,
        imagenes_en_carpeta: images.length,
        productos_ya_con_imagen: productsWithImage.size,
        asignaciones: assignments.length,
        asignaciones_por_tipo: byReason,
        sin_confianza: uncertain.length,
        muestra: preview,
        muestra_por_nombre: namePreview
    }, null, 2));

    await connection.end();
}

main().catch(error => {
    console.error(error.code || error.name, error.message);
    process.exit(1);
});

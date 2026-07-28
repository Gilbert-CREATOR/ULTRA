const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const imagesDir = path.join(rootDir, 'IMAGENES');
const backupsDir = path.join(rootDir, 'backups');
const validExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.svg']);

function latestBackup() {
    if (!fs.existsSync(backupsDir)) return null;
    const files = fs.readdirSync(backupsDir)
        .filter(file => file.endsWith('.json'))
        .sort()
        .reverse();
    return files[0] ? path.join(backupsDir, files[0]) : null;
}

function normalizeImageName(value) {
    const raw = String(value || '').replace(/\\/g, '/').split('/').pop() || '';
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const files = fs.existsSync(imagesDir)
    ? fs.readdirSync(imagesDir).filter(file => validExtensions.has(path.extname(file).toLowerCase()))
    : [];
const fileSet = new Set(files);
const backupPath = latestBackup();
let associations = [];

if (backupPath) {
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    associations = Array.isArray(backup.tables && backup.tables.producto_imagenes)
        ? backup.tables.producto_imagenes.filter(row => Number(row.activo) === 1)
        : [];
}

const referenced = new Set(associations.map(row => normalizeImageName(row.imagen_url)).filter(Boolean));
const missingFiles = associations
    .filter(row => !fileSet.has(normalizeImageName(row.imagen_url)))
    .map(row => ({ codigoArticulo: row.codigo_articulo, imagen: row.imagen_url }));
const unreferencedFiles = files.filter(file => !referenced.has(file) && file !== 'producto-sin-imagen.svg');

const hashes = new Map();
for (const file of files) {
    const filePath = path.join(imagesDir, file);
    const hash = sha256(filePath);
    if (!hashes.has(hash)) hashes.set(hash, []);
    hashes.get(hash).push(file);
}
const duplicateGroups = [...hashes.values()].filter(group => group.length > 1);

console.log(JSON.stringify({
    modo: 'solo lectura',
    respaldo: backupPath ? path.relative(rootDir, backupPath) : null,
    archivosImagen: files.length,
    asociacionesActivasEnRespaldo: associations.length,
    asociacionesConArchivoFaltante: missingFiles.length,
    archivosSinAsociacionEnRespaldo: unreferencedFiles.length,
    gruposDuplicadosPorContenido: duplicateGroups.length,
    muestras: {
        asociacionesConArchivoFaltante: missingFiles.slice(0, 25),
        archivosSinAsociacion: unreferencedFiles.slice(0, 25),
        duplicados: duplicateGroups.slice(0, 15)
    }
}, null, 2));

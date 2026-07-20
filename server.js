const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const packageInfo = require('./package.json');

const rootDir = __dirname;

loadEnv(path.join(rootDir, '.env'));
// Nota: .env.example es solo plantilla/documentación. No se carga como configuración real.

const PORT = Number(process.env.PORT || 3000);
const SITE_URL = String(process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const SESSION_COOKIE = 'ultra_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OWNER_EMAIL = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const OWNER_NAME = process.env.OWNER_NAME || 'Owner Ultra';
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE || '8095726552';
const WHATSAPP_ULTRACOMP = process.env.WHATSAPP_ULTRACOMP || WHATSAPP_PHONE || '8095726552';
const WHATSAPP_ULTRASOFT = process.env.WHATSAPP_ULTRASOFT || WHATSAPP_PHONE || '8095726552';
const ULTRASOFT_CONTACT_EMAIL = process.env.ULTRASOFT_CONTACT_EMAIL || 'ultrasoftsolicitud@gmail.com';
const UPLOAD_DIR = path.resolve(rootDir, process.env.UPLOAD_DIR || './IMAGENES');
const BACKUP_DIR = path.resolve(rootDir, process.env.BACKUP_DIR || './backups');
const BACKUP_RETENTION_DAYS = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 14));
const DEFAULT_WEB_CATEGORIES = {
    computers: 'Computadoras', laptops: 'Laptops', gaming: 'Gaming', monitors: 'Monitores',
    components: 'Componentes', peripherals: 'Periféricos', printers: 'Impresoras',
    accessories: 'Accesorios', adapters: 'Adaptadores', supplies: 'Suministros',
    inks: 'Tintas', toners: 'Tóner', network: 'Redes', storage: 'Almacenamiento',
    bags: 'Bultos', office: 'Oficina', stationery: 'Papelería', cables: 'Cables',
    chargers: 'Cargadores', memory: 'Memorias', hubs: 'Hubs', lighting: 'Iluminación',
    tablets: 'Tablets', audio: 'Audio', security: 'Seguridad y cámaras',
    furniture: 'Mobiliario', power: 'Energía y UPS', pos: 'Punto de venta',
    projectors: 'Proyectores', tools: 'Herramientas', servers: 'Servidores',
    phones: 'Telefonía', climate: 'Climatización', sports: 'Deportes', other: 'Otros'
};

const memoryStore = {
    products: [],
    content: null,
    quotes: [],
    quoteCarts: []
};
const adminSessions = new Map();
const contactAttempts = new Map();
const loginAttempts = new Map();
let mailTransporter = null;

// dbReady queda apagado para que el contenido, login y cotizaciones sigan usando fallback local.
// Los productos ahora leen directamente desde MySQL: dbenterpriseultrasoft.articulo_servicio.
let dbReady = false;
let productDbReady = false;
let mysqlPool = null;
const imageIndex = buildImageIndex();

function warnMissingOwnerCredentials() {
    if (OWNER_EMAIL && OWNER_PASSWORD) return;
    console.warn(
        'Owner no configurado. Agrega OWNER_EMAIL y OWNER_PASSWORD en .env, no en .env.example, y reinicia el servidor para activar el acceso owner.'
    );
}

function getMissingRequiredEnv() {
    return [
        ['ADMIN_EMAIL', ADMIN_EMAIL],
        ['ADMIN_PASSWORD', ADMIN_PASSWORD]
    ].filter(([, value]) => !value).map(([key]) => key);
}

function getEnvAdminProfile(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();
    const adminEmail = String(ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = String(ADMIN_PASSWORD || '').trim();
    const ownerPassword = String(OWNER_PASSWORD || '').trim();

    if (OWNER_EMAIL && ownerPassword && cleanEmail === OWNER_EMAIL && cleanPassword === ownerPassword) {
        return {
            email: OWNER_EMAIL,
            name: OWNER_NAME.slice(0, 120),
            role: 'owner',
            password: ownerPassword
        };
    }

    if (adminEmail && adminPassword && cleanEmail === adminEmail && cleanPassword === adminPassword) {
        return {
            email: adminEmail,
            name: 'Administrador principal',
            role: 'superadmin',
            password: adminPassword
        };
    }

    return null;
}

function loadEnv(filePath) {
    if (!fs.existsSync(filePath)) return;

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        if (!line || line.trim().startsWith('#')) continue;
        const index = line.indexOf('=');
        if (index === -1) continue;
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        if (!process.env[key]) process.env[key] = value;
    }
}

function loadStaticProducts() {
    // Productos estáticos desactivados: la fuente oficial es MySQL/articulo_servicio.
    return [];
}

async function initDatabase() {
    const missingRequiredEnv = getMissingRequiredEnv();
    if (missingRequiredEnv.length) {
        console.warn(`Variables administrativas faltantes: ${missingRequiredEnv.join(', ')}. El sitio público seguirá usando fallback; el panel admin no estará disponible.`);
    }
    warnMissingOwnerCredentials();
    memoryStore.content = getDefaultContent();

    const config = getMysqlConfig();
    if (!config) {
        console.warn('MySQL no configurado. No se cargarán productos estáticos.');
        return;
    }

    mysqlPool = mysql.createPool(config);

    const [rows] = await mysqlPool.query(`
        SELECT COUNT(*) AS count
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
    `);

    await ensureUltraTables();
    await hydratePersistentState();
    dbReady = true;
    productDbReady = true;
    scheduleAutomaticBackups();
    console.log(`MySQL conectado. Productos disponibles desde articulo_servicio: ${rows[0].count}.`);
}

const BACKUP_TABLES = [
    'web_content', 'web_categories', 'web_brands', 'web_product_categories', 'web_product_brands',
    'web_product_flags', 'producto_imagenes', 'web_quotes', 'web_quote_items', 'web_quote_carts',
    'web_contact_requests', 'web_audit_log'
];

async function buildDataBackup() {
    const backup = { exportedAt: new Date().toISOString(), version: packageInfo.version, tables: {} };
    for (const table of BACKUP_TABLES) {
        const [rows] = await mysqlPool.query(`SELECT * FROM \`${table}\``);
        backup.tables[table] = rows;
    }
    return backup;
}

async function createAutomaticBackup() {
    if (!mysqlPool) return;
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = await buildDataBackup();
    const filename = `ultra-auto-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(BACKUP_DIR, filename), JSON.stringify(backup));
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 86400000;
    fs.readdirSync(BACKUP_DIR).filter(name => name.startsWith('ultra-auto-')).forEach(name => {
        const file = path.join(BACKUP_DIR, name);
        if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
    });
}

function scheduleAutomaticBackups() {
    createAutomaticBackup().catch(error => console.error('Respaldo automático falló:', error.message));
    setInterval(() => {
        createAutomaticBackup().catch(error => console.error('Respaldo automático falló:', error.message));
    }, 24 * 60 * 60 * 1000).unref();
}

function getMysqlConfig() {
    const hasMysqlUrl = Boolean(process.env.MYSQL_URL);
    const hasParts = Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);

    if (!hasMysqlUrl && !hasParts) return null;

    const common = {
        waitForConnections: true,
        connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
        queueLimit: 0,
        connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 10000),
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        decimalNumbers: true,
        timezone: process.env.MYSQL_TIMEZONE || 'Z'
    };

    if (process.env.MYSQL_CHARSET) {
        common.charset = process.env.MYSQL_CHARSET;
    }

    if (hasMysqlUrl) {
        return {
            uri: process.env.MYSQL_URL,
            ...common
        };
    }

    return {
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE,
        ...common
    };
}

function isTransientMysqlConnectionError(error) {
    return ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST']
        .includes(error && error.code);
}

function getDefaultContent() {
    return {
        bannerProductIds: [
            'impresora-termica-recibos-2connect-2c-pos8-01-v6',
            'impresora-termica-etiqueta-2connect-2c-lp427b',
            'headset-fantech-hq53',
            'headset-fantech-hq54',
            'barra-sonido-subwoofer-jamatech',
            'bocina-havit',
            'almohadilla-mouse-cony',
            'aire-comprimido-sabo',
            'bocina-fantech-gs205',
            'boligrafo-deli-q0009',
            'boligrafo-deli-q3'
        ],
        featuredProductIds: [
            'impresora-termica-etiqueta-2connect-2c-lp427b',
            'impresora-termica-recibos-2connect-2c-pos8-01-v6',
            'tablet-amazon-fire-hd-8-plus-32gb',
            'aire-comprimido-sabo',
            'almohadilla-mouse-cony',
            'headset-fantech-hq53',
            'headset-fantech-hq54',
            'barra-sonido-subwoofer-jamatech',
            'bocina-havit',
            'bocina-fantech-gs205',
            'boligrafo-deli-q0009',
            'boligrafo-deli-q3'
        ],
        ultrasoft: {
            servicios: [
                'Desarrollo de Software',
                'Aplicaciones Web',
                'Aplicaciones Móviles',
                'Automatización de Procesos',
                'Integraciones de Sistemas',
                'Consultoría Tecnológica'
            ],
            soluciones: [
                'Sistema de Gestión Empresarial',
                'Sistema de Ventas',
                'Sistema de Inventario',
                'Sistema de Cuentas por Cobrar',
                'Sistema de Nómina',
                'Sistema de Contabilidad'
            ],
            paquetes: [
                'Diagnóstico inicial',
                'Desarrollo a medida',
                'Implementación y capacitación',
                'Soporte y mejoras'
            ],
            challenges: [
                '🧾 | Procesos manuales | Tus equipos pierden tiempo en tareas repetitivas y operativas.',
                '📉 | Pérdida de información | No hay visibilidad clara ni datos confiables para tomar decisiones.',
                '📦 | Inventario desorganizado | La gestión de stock es ineficiente y los costos aumentan por errores.',
                '⚙️ | Falta de control operativo | Los procesos no están alineados, lo que genera retrasos y fallos de coordinación.',
                '⏱️ | Demasiado tiempo en tareas repetitivas | El trabajo manual consume horas que podrían destinarse a crecimiento.',
                '📊 | Falta de reportes | No tienes métricas claras para medir el desempeño del negocio.'
            ],
            workflow: [
                'Reunión Inicial | Escuchamos tu negocio y definimos objetivos estratégicos.',
                'Análisis | Mapeamos procesos, identificamos oportunidades y evaluamos requerimientos.',
                'Diseño | Generamos prototipos visuales y experiencia de usuario efectiva.',
                'Desarrollo | Implementamos la solución con calidad, seguridad y rendimiento.',
                'Pruebas | Verificamos cada función para garantizar un lanzamiento sin fallos.',
                'Implementación | Desplegamos la solución y acompañamos la adopción del equipo.',
                'Soporte | Ofrecemos mantenimiento continuo y mejoras a medida.'
            ],
            advantages: ['Soluciones a medida', 'Tecnología moderna', 'Escalabilidad', 'Soporte continuo', 'Seguridad', 'Experiencia empresarial'],
            landing: {
                heroTitle: 'Transformamos Empresas con Tecnología',
                heroSubtitle: 'Desarrollamos soluciones digitales que automatizan procesos, aumentan la productividad y ayudan a tu empresa a crecer.',
                cta: 'Solicitar Cotización'
            },
            faqs: [
                { question: '¿Cuánto cuesta un sistema?', answer: 'El costo depende del alcance. Evaluamos tus necesidades y ofrecemos una propuesta a medida sin compromisos.' },
                { question: '¿Cuánto tiempo toma?', answer: 'El tiempo de implementación varía según la complejidad. Generalmente entregamos primeras versiones en pocas semanas.' },
                { question: '¿Ofrecen soporte?', answer: 'Sí, brindamos soporte continuo, mantenimiento y mejoras para que la solución se mantenga estable y actualizada.' },
                { question: '¿Trabajan proyectos personalizados?', answer: 'Sí, desarrollamos soluciones personalizadas para tu industria y procesos internos.' },
                { question: '¿Pueden modernizar sistemas existentes?', answer: 'Claro, analizamos tu sistema actual y proponemos mejoras, integraciones o migraciones según tu objetivo.' }
            ]
        },
        testimonials: {
            ultracomp: [
                { id: 1, name: 'Juan Pérez', role: 'Gerente de operaciones', company: 'Empresa comercial', avatar: '👨🏽‍💼', rating: 5, reviewText: 'Ultracomp entendió exactamente lo que necesitábamos. Recibimos equipos confiables, configurados y listos para trabajar desde el primer día.' },
                { id: 2, name: 'María Rodríguez', role: 'Emprendedora', company: 'Negocio independiente', avatar: '👩🏻‍💻', rating: 5, reviewText: 'La asesoría hizo toda la diferencia. Me ayudaron a elegir la computadora correcta sin venderme cosas que realmente no necesitaba.' },
                { id: 3, name: 'Carlos Gómez', role: 'Creador de contenido', company: 'Estudio creativo', avatar: '🧑🏾‍🎮', rating: 4.9, reviewText: 'Mi equipo para gaming y edición quedó excelente. El rendimiento, la atención y el seguimiento después de la compra fueron impecables.' },
                { id: 4, name: 'Laura Méndez', role: 'Coordinadora académica', company: 'Centro educativo', avatar: '👩🏽‍🏫', rating: 5, reviewText: 'Equipamos nuestro laboratorio con el acompañamiento de Ultracomp. Todo llegó organizado y el soporte ha sido rápido cuando lo necesitamos.' }
            ],
            ultrasoft: [
                { id: 1, name: 'Andrés Castillo', role: 'Director comercial', company: 'Distribuidora regional', avatar: '👨🏻‍💼', rating: 5, reviewText: 'Pasamos de reportes manuales a información centralizada en tiempo real. Ahora el equipo decide más rápido y con datos confiables.' },
                { id: 2, name: 'Paola Jiménez', role: 'Líder de procesos', company: 'Servicios empresariales', avatar: '👩🏾‍🔬', rating: 4.9, reviewText: 'Ultrasoft convirtió un proceso lento y repetitivo en un flujo simple. La implementación fue clara y el equipo siempre estuvo disponible.' },
                { id: 3, name: 'Miguel Santos', role: 'Fundador', company: 'Startup tecnológica', avatar: '🧑🏻‍🚀', rating: 5, reviewText: 'Construimos nuestra primera versión en menos tiempo del esperado. El producto se siente sólido, moderno y preparado para crecer.' },
                { id: 4, name: 'Sofía Valdez', role: 'Gerente administrativa', company: 'Grupo empresarial', avatar: '👩🏼‍💼', rating: 5, reviewText: 'La nueva plataforma nos dio control sobre inventario, ventas y cuentas. Hoy tenemos una operación mucho más ordenada y medible.' }
            ]
        },
        ultracomp: {
            landing: {
                heroTitle: 'Tu destino para equipos y componentes confiables.',
                heroSubtitle: 'Computadoras, periféricos y soluciones tecnológicas para empresas, profesionales y gamers, con asesoría antes y después de tu compra.',
                primaryCta: 'Explorar productos',
                secondaryCta: 'Solicitar cotización'
            },
            benefits: [
                '🔒 | Garantía registrada | Disponible únicamente en los productos que la incluyen.',
                '🛠️ | Soporte especializado | Técnicos certificados para instalación y mantenimiento.',
                '✅ | Productos originales | Solo marcas y componentes confiables.',
                '🤝 | Asesoría personalizada | Soluciones diseñadas para tu empresa o uso personal.'
            ]
        },
        seo: {
            ultracompTitle: 'Ultracomp | Equipos y componentes confiables',
            ultracompDescription: 'Computadoras, componentes, periféricos y soluciones tecnológicas con asesoría especializada.',
            ultrasoftTitle: 'Ultrasoft | Transformamos Empresas con Tecnología',
            ultrasoftDescription: 'Soluciones digitales personalizadas, automatización y desarrollo de software para empresas.',
            socialImage: '/GENERAL/logo-ultrasoft.svg'
        },
        settings: {
            whatsapp: '8095726552',
            ultracompWhatsapp: WHATSAPP_ULTRACOMP,
            ultrasoftWhatsapp: WHATSAPP_ULTRASOFT,
            email: 'ultrasoftsolicitud@gmail.com',
            company: 'ULTRACOMP / ULTRASOFT',
            logo: '/GENERAL/logo-ultrasoft.svg',
            favicon: '/GENERAL/logo-ultrasoft.svg',
            address: '',
            schedule: '',
            instagram: '',
            facebook: '',
            linkedin: '',
            copyright: '© 2026 ULTRA - Todos los derechos reservados',
            siteStatus: 'active',
            siteStatusTitle: '',
            siteStatusMessage: ''
        }
    };
}

async function getSiteContent() {
    if (!dbReady) return memoryStore.content || getDefaultContent();

    await ensureContentStorage();
    const [rows] = await mysqlPool.query('SELECT data FROM web_content WHERE content_key = ? LIMIT 1', ['site']);
    if (!rows.length) return memoryStore.content || getDefaultContent();
    let stored = {};
    try {
        stored = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    } catch (error) {
        console.warn('Contenido web inválido en MySQL. Se usará contenido por defecto:', error.message);
        stored = {};
    }
    return {
        ...getDefaultContent(),
        ...stored,
        ultrasoft: {
            ...getDefaultContent().ultrasoft,
            ...(stored.ultrasoft || {}),
            landing: {
                ...getDefaultContent().ultrasoft.landing,
                ...((stored.ultrasoft || {}).landing || {})
            }
        },
        settings: {
            ...getDefaultContent().settings,
            ...(stored.settings || {})
        },
        testimonials: {
            ...getDefaultContent().testimonials,
            ...(stored.testimonials || {})
        },
        ultracomp: {
            ...getDefaultContent().ultracomp,
            ...(stored.ultracomp || {}),
            landing: {
                ...getDefaultContent().ultracomp.landing,
                ...((stored.ultracomp || {}).landing || {})
            }
        },
        seo: {
            ...getDefaultContent().seo,
            ...(stored.seo || {})
        }
    };
}

async function saveSiteContent(content) {
    if (!dbReady) {
        memoryStore.content = mergeContent(memoryStore.content || getDefaultContent(), content);
        return memoryStore.content;
    }

    await ensureContentStorage();
    const current = await getSiteContent();
    const merged = mergeContent(current, content);

    await mysqlPool.query(
        `INSERT INTO web_content (content_key, data, updated_at) VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
        ['site', JSON.stringify(merged)]
    );
    memoryStore.content = merged;
    return merged;
}

async function ensureContentStorage() {
    if (!mysqlPool) return;
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_content (
        content_key VARCHAR(100) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at DATETIME NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function mergeContent(currentContent, content) {
    const merged = {
        ...currentContent,
        ...content,
        ultrasoft: {
            ...currentContent.ultrasoft,
            ...(content.ultrasoft || {}),
            landing: {
                ...currentContent.ultrasoft.landing,
                ...((content.ultrasoft || {}).landing || {})
            }
        },
        settings: {
            ...currentContent.settings,
            ...(content.settings || {})
        },
        testimonials: {
            ...currentContent.testimonials,
            ...(content.testimonials || {})
        },
        ultracomp: {
            ...currentContent.ultracomp,
            ...(content.ultracomp || {}),
            landing: {
                ...currentContent.ultracomp.landing,
                ...((content.ultracomp || {}).landing || {})
            }
        },
        seo: {
            ...currentContent.seo,
            ...(content.seo || {})
        }
    };
    return merged;
}

function stripOwnerOnlyContent(content) {
    const clone = JSON.parse(JSON.stringify(content || {}));
    if (clone.settings) {
        delete clone.settings.siteStatus;
        delete clone.settings.siteStatusTitle;
        delete clone.settings.siteStatusMessage;
    }
    return clone;
}

async function syncMissingProducts() {
    const products = productDbReady ? await getProductsFromMysql() : [];
    return {
        inserted: 0,
        count: products.length,
        source: productDbReady ? 'articulo_servicio' : 'disabled',
        message: 'La sincronización estática fue desactivada. Los productos deben leerse desde MySQL.'
    };
}

function sendJson(res, status, payload, extraHeaders = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        ...securityHeaders(),
        ...extraHeaders
    });
    res.end(body);
}

function securityHeaders() {
    const headers = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data: https://images.simplycodes.com; frame-ancestors 'self'"
    };
    if (process.env.NODE_ENV === 'production') {
        headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
    return headers;
}

function hasValidRequestOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
        return new URL(origin).host === req.headers.host;
    } catch {
        return false;
    }
}

function readBody(req, maxBytes = 2_000_000) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > maxBytes) {
                req.destroy();
                reject(new Error('Body too large'));
            }
        });
        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    const [algorithm, salt, expected] = String(storedHash || '').split(':');
    if (algorithm !== 'scrypt' || !salt || !expected) return false;
    const actual = crypto.scryptSync(String(password), salt, 64);
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function safeMediaFilename(name) {
    return path.basename(String(name || '')).replace(/[^a-zA-Z0-9._-]/g, '-');
}

function escapeXml(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    })[character]);
}

function getMailTransporter() {
    if (mailTransporter) return mailTransporter;

    const host = String(process.env.SMTP_HOST || '').trim();
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    if (!host || !user || !pass) return null;

    const port = Number(process.env.SMTP_PORT || 465);
    mailTransporter = nodemailer.createTransport({
        host,
        port,
        secure: String(process.env.SMTP_SECURE || port === 465).toLowerCase() === 'true',
        family: 4,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        auth: { user, pass }
    });
    return mailTransporter;
}

function isContactRateLimited(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const client = forwarded || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const recent = (contactAttempts.get(client) || []).filter(timestamp => now - timestamp < windowMs);
    recent.push(now);
    contactAttempts.set(client, recent);
    return recent.length > 5;
}

function cleanContactField(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
}

function isAdmin(req) {
    const token = getCookie(req, SESSION_COOKIE);
    if (!token) return false;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = adminSessions.get(tokenHash);
    const expiresAt = typeof session === 'object' ? session.expiresAt : session;
    if (!expiresAt || expiresAt <= Date.now()) {
        adminSessions.delete(tokenHash);
        return false;
    }
    return true;
}

function currentAdmin(req) {
    const token = getCookie(req, SESSION_COOKIE);
    if (!token) return null;
    const session = adminSessions.get(crypto.createHash('sha256').update(token).digest('hex'));
    return typeof session === 'object' ? session : { expiresAt: session, role: 'superadmin', userId: null };
}

function isOwner(req) {
    const admin = currentAdmin(req);
    return Boolean(admin && admin.role === 'owner');
}

function isOwnerRole(role) {
    return role === 'owner';
}

function getSiteAccessSettings() {
    const content = memoryStore.content || getDefaultContent();
    const settings = content.settings || {};
    const allowedStatuses = ['active', 'maintenance', 'suspended'];
    const status = allowedStatuses.includes(settings.siteStatus) ? settings.siteStatus : 'active';
    return {
        status,
        title: settings.siteStatusTitle || (status === 'suspended' ? 'Servicio temporalmente suspendido' : 'Sitio en mantenimiento'),
        message: settings.siteStatusMessage || (status === 'suspended'
            ? 'Esta página no está disponible temporalmente. Por favor, vuelve más tarde.'
            : 'Estamos realizando ajustes para mejorar la experiencia. Volveremos pronto.')
    };
}

function isPublicHtmlRequest(url) {
    const ext = path.extname(url.pathname).toLowerCase();
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/owner') || url.pathname.startsWith('/login') || url.pathname.startsWith('/api/')) return false;
    if (url.pathname.startsWith('/IMAGENES/') || url.pathname.startsWith('/GENERAL/') || url.pathname.startsWith('/ULTRACOMP/eva')) return false;
    return !ext || ext === '.html';
}

function renderSiteUnavailablePage(statusSettings) {
    const title = escapeXml(statusSettings.title);
    const message = escapeXml(statusSettings.message);
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex,nofollow">
    <title>${title}</title>
    <style>
        :root { color-scheme: light; --blue:#123fbd; --text:#0f172a; --muted:#64748b; }
        * { box-sizing:border-box; }
        body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:linear-gradient(135deg,#f8fbff,#eef4ff); color:var(--text); padding:24px; }
        main { width:min(720px,100%); background:#fff; border:1px solid rgba(18,63,189,.12); border-radius:32px; padding:42px; box-shadow:0 28px 80px rgba(15,23,42,.12); text-align:center; }
        img { width:86px; height:auto; margin-bottom:18px; }
        h1 { margin:0 0 14px; font-size:clamp(34px,6vw,62px); letter-spacing:-.06em; line-height:.92; }
        p { margin:0 auto; max-width:560px; color:var(--muted); font-size:18px; line-height:1.65; }
        .pill { display:inline-flex; margin-bottom:22px; padding:10px 16px; border-radius:999px; background:#eef4ff; color:var(--blue); font-weight:900; letter-spacing:.12em; text-transform:uppercase; font-size:12px; }
    </style>
</head>
<body>
    <main>
        <img src="/GENERAL/logo-ultrasoft.svg" alt="Ultra">
        <span class="pill">${statusSettings.status === 'suspended' ? 'Servicio suspendido' : 'Mantenimiento'}</span>
        <h1>${title}</h1>
        <p>${message}</p>
    </main>
</body>
</html>`;
}

function isRateLimited(store, key, maxAttempts, windowMs) {
    const now = Date.now();
    const recent = (store.get(key) || []).filter(timestamp => now - timestamp < windowMs);
    recent.push(now);
    store.set(key, recent);
    return recent.length > maxAttempts;
}

async function hydratePersistentState() {
    const [contentRows] = await mysqlPool.query('SELECT data FROM web_content WHERE content_key = ? LIMIT 1', ['site']);
    if (contentRows.length) {
        memoryStore.content = mergeContent(
            getDefaultContent(),
            typeof contentRows[0].data === 'string' ? JSON.parse(contentRows[0].data) : contentRows[0].data
        );
    } else {
        memoryStore.content = getDefaultContent();
        await mysqlPool.query(
            'INSERT INTO web_content (content_key, data) VALUES (?, ?)',
            ['site', JSON.stringify(memoryStore.content)]
        );
    }

    await mysqlPool.query('DELETE FROM web_admin_sessions WHERE expires_at <= NOW()');
    const [sessions] = await mysqlPool.query('SELECT token_hash, expires_at, user_id, role FROM web_admin_sessions WHERE expires_at > NOW()');
    adminSessions.clear();
    sessions.forEach(session => adminSessions.set(session.token_hash, {
        expiresAt: new Date(session.expires_at).getTime(),
        userId: session.user_id,
        role: session.role || 'editor'
    }));
}

function getCookie(req, name) {
    const cookies = String(req.headers.cookie || '').split(';');
    for (const cookie of cookies) {
        const index = cookie.indexOf('=');
        if (index < 0) continue;
        if (cookie.slice(0, index).trim() === name) return decodeURIComponent(cookie.slice(index + 1).trim());
    }
    return '';
}

function sessionCookie(token, maxAge = Math.floor(SESSION_TTL_MS / 1000)) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function parseBoundedInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

async function handleApi(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/api/health') {
        const timestamp = new Date().toISOString();
        const missingEnv = getMissingRequiredEnv();
        if (productDbReady) {
            try {
                const [rows] = await mysqlPool.query(`
                    SELECT COUNT(*) AS productsCount
                    FROM articulo_servicio a
                    LEFT JOIN (
                        SELECT articulo_codigo, SUM(existencia) AS existencia_total
                        FROM existencia
                        GROUP BY articulo_codigo
                    ) e ON e.articulo_codigo = a.codigo
                    WHERE a.activo = 1 AND a.catalogo = 1 AND a.presentar_facturacion = 1
                      AND a.disponible = 1
                      AND COALESCE(e.existencia_total, 0) > 0
                      AND a.tipo_articulo_servicio = 'Articulo'
                `);
                sendJson(res, 200, {
                    status: 'ok',
                    database: 'connected',
                    mode: 'mysql',
                    productsCount: Number(rows[0].productsCount || 0),
                    adminConfigured: missingEnv.length === 0,
                    ownerConfigured: Boolean(OWNER_EMAIL && String(OWNER_PASSWORD || '').trim()),
                    missingEnv,
                    timestamp,
                    version: packageInfo.version
                });
            } catch (error) {
                console.error('Health check de MySQL falló:', error.message);
                sendJson(res, 503, {
                    status: 'degraded',
                    database: 'disconnected',
                    mode: 'mysql',
                    productsCount: null,
                    adminConfigured: missingEnv.length === 0,
                    ownerConfigured: Boolean(OWNER_EMAIL && String(OWNER_PASSWORD || '').trim()),
                    missingEnv,
                    timestamp,
                    version: packageInfo.version
                });
            }
            return true;
        }

        sendJson(res, 503, {
            status: 'degraded',
            database: 'disconnected',
            mode: 'memory',
            productsCount: 0,
            adminConfigured: missingEnv.length === 0,
            ownerConfigured: Boolean(OWNER_EMAIL && String(OWNER_PASSWORD || '').trim()),
            missingEnv,
            timestamp,
            version: packageInfo.version
        });
        return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/contact') {
        if (isContactRateLimited(req)) {
            sendJson(res, 429, { message: 'Has enviado demasiadas solicitudes. Inténtalo nuevamente en unos minutos.' });
            return true;
        }

        const body = await readBody(req);
        const contact = {
            name: cleanContactField(body.name, 120),
            email: cleanContactField(body.email, 254),
            phone: cleanContactField(body.phone, 40),
            service: cleanContactField(body.service, 160),
            message: cleanContactField(body.message, 5000)
        };
        const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email);
        if (!contact.name || !validEmail || !contact.service || !contact.message) {
            sendJson(res, 400, { message: 'Completa correctamente los campos obligatorios.' });
            return true;
        }

        const sentAt = new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' });
        const [savedRequest] = await mysqlPool.query(
            `INSERT INTO web_contact_requests
             (name, email, phone, service, message, status, source_ip)
             VALUES (?, ?, ?, ?, ?, 'pendiente', ?)`,
            [contact.name, contact.email, contact.phone, contact.service, contact.message, req.socket.remoteAddress || '']
        );
        const transporter = getMailTransporter();
        if (!transporter) {
            await mysqlPool.query(
                `UPDATE web_contact_requests SET status = 'error', error_message = ? WHERE id = ?`,
                ['SMTP no configurado', savedRequest.insertId]
            );
            sendJson(res, 503, { saved: true, message: 'Guardamos tu solicitud, pero el correo está temporalmente fuera de servicio.' });
            return true;
        }
        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || `"Formulario Ultrasoft" <${process.env.SMTP_USER}>`,
                to: ULTRASOFT_CONTACT_EMAIL,
                replyTo: contact.email,
                subject: `Nueva solicitud Ultrasoft: ${contact.service}`,
                text: [
                    'Nueva solicitud desde el sitio web de Ultrasoft', '',
                    `Nombre: ${contact.name}`, `Correo: ${contact.email}`,
                    `Teléfono: ${contact.phone || 'No proporcionado'}`, `Servicio: ${contact.service}`,
                    '', 'Mensaje:', contact.message, '', `Fecha: ${sentAt}`
                ].join('\n')
            });
            await mysqlPool.query(
                `UPDATE web_contact_requests SET status = 'enviado', emailed_at = NOW() WHERE id = ?`,
                [savedRequest.insertId]
            );
        } catch (error) {
            await mysqlPool.query(
                `UPDATE web_contact_requests SET status = 'error', error_message = ? WHERE id = ?`,
                [String(error.message || error).slice(0, 500), savedRequest.insertId]
            );
            console.error('No se pudo enviar el correo de contacto:', error.message);
            sendJson(res, 502, {
                saved: true,
                message: 'Guardamos tu solicitud, pero no pudimos enviar el correo. El administrador podrá verla en el panel.'
            });
            return true;
        }

        sendJson(res, 200, { ok: true, message: 'Solicitud enviada correctamente.' });
        return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
        const client = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
        if (isRateLimited(loginAttempts, client, 8, 15 * 60 * 1000)) {
            sendJson(res, 429, { ok: false, message: 'Demasiados intentos. Espera 15 minutos.' });
            return true;
        }
        const body = await readBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        const envProfile = getEnvAdminProfile(email, password);
        if (envProfile) {
            let userId = null;
            try {
                if (!mysqlPool) throw new Error('MySQL no está inicializado');
                await mysqlPool.query(
                    `INSERT INTO web_admin_users (email, name, password_hash, role, active)
                     VALUES (?, ?, ?, ?, 1)
                     ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        password_hash = VALUES(password_hash),
                        role = VALUES(role),
                        active = 1,
                        updated_at = NOW()`,
                    [envProfile.email, envProfile.name, hashPassword(envProfile.password), envProfile.role]
                );
                const [syncedUsers] = await mysqlPool.query(
                    'SELECT id, password_hash, role FROM web_admin_users WHERE email = ? AND active = 1 LIMIT 1',
                    [envProfile.email]
                );
                userId = syncedUsers[0]?.id || null;
            } catch (error) {
                console.warn('No se pudo sincronizar usuario admin desde variables de entorno:', error.message);
            }

            const token = crypto.randomBytes(32).toString('base64url');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const expiresAt = Date.now() + SESSION_TTL_MS;
            adminSessions.set(tokenHash, { expiresAt, userId, role: envProfile.role });

            if (userId) {
                try {
                    await mysqlPool.query(
                        'INSERT INTO web_admin_sessions (token_hash, expires_at, user_id, role) VALUES (?, ?, ?, ?)',
                        [tokenHash, new Date(expiresAt), userId, envProfile.role]
                    );
                    await mysqlPool.query('UPDATE web_admin_users SET last_login_at = NOW() WHERE id = ?', [userId]);
                } catch (error) {
                    console.warn('No se pudo guardar la sesión admin en MySQL:', error.message);
                }
            }

            loginAttempts.delete(client);
            sendJson(res, 200, { ok: true, role: envProfile.role, owner: envProfile.role === 'owner' }, { 'Set-Cookie': sessionCookie(token) });
            return true;
        }

        if (!mysqlPool) {
            sendJson(res, 503, { ok: false, message: 'Base de datos no disponible. Revisa las variables MYSQL_* del servidor.' });
            return true;
        }

        const [users] = await mysqlPool.query(
            'SELECT id, password_hash, role FROM web_admin_users WHERE email = ? AND active = 1 LIMIT 1',
            [email]
        );
        const user = users[0];
        const ok = Boolean(user && verifyPassword(password, user.password_hash));
        if (!ok) {
            sendJson(res, 401, { ok: false, message: 'Credenciales incorrectas' });
            return true;
        }
        const token = crypto.randomBytes(32).toString('base64url');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = Date.now() + SESSION_TTL_MS;
        adminSessions.set(tokenHash, { expiresAt, userId: user.id, role: user.role });
        await mysqlPool.query(
            'INSERT INTO web_admin_sessions (token_hash, expires_at, user_id, role) VALUES (?, ?, ?, ?)',
            [tokenHash, new Date(expiresAt), user.id, user.role]
        );
        await mysqlPool.query('UPDATE web_admin_users SET last_login_at = NOW() WHERE id = ?', [user.id]);
        loginAttempts.delete(client);
        sendJson(res, 200, { ok: true, role: user.role, owner: user.role === 'owner' }, { 'Set-Cookie': sessionCookie(token) });
        return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/session') {
        const authenticated = isAdmin(req);
        sendJson(res, authenticated ? 200 : 401, {
            authenticated,
            role: authenticated ? currentAdmin(req).role : null,
            owner: authenticated ? isOwner(req) : false
        });
        return true;
    }

    if (url.pathname === '/api/admin/license' && req.method === 'GET') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        if (!isOwner(req)) { sendJson(res, 403, { message: 'Solo el owner puede ver el estado de licencia.' }); return true; }
        sendJson(res, 200, getSiteAccessSettings());
        return true;
    }

    if (url.pathname === '/api/admin/license' && req.method === 'PUT') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        if (!isOwner(req)) { sendJson(res, 403, { message: 'Solo el owner puede cambiar el estado de licencia.' }); return true; }
        try {
            const body = await readBody(req);
            const status = ['active', 'maintenance', 'suspended'].includes(body.status) ? body.status : 'active';
            const currentContent = await getSiteContent();
            const nextSettings = {
                ...(currentContent.settings || {}),
                siteStatus: status,
                siteStatusTitle: String(body.title || '').trim().slice(0, 160),
                siteStatusMessage: String(body.message || '').trim().slice(0, 600)
            };
            const content = await saveSiteContent({ settings: nextSettings });
            try {
                await recordAudit('license_status_update', 'web_content', 'site', {
                    status,
                    by: currentAdmin(req).userId || 'owner'
                });
            } catch (auditError) {
                console.warn('No se pudo registrar auditoría de licencia:', auditError.message);
            }
            sendJson(res, 200, { ok: true, settings: content.settings, license: getSiteAccessSettings() });
        } catch (error) {
            console.error('Error actualizando estado del sitio:', error);
            sendJson(res, 500, { message: 'No se pudo guardar el estado del sitio. Revisa la conexión MySQL en Render.' });
        }
        return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
        const token = getCookie(req, SESSION_COOKIE);
        if (token) {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            adminSessions.delete(tokenHash);
            if (mysqlPool) await mysqlPool.query('DELETE FROM web_admin_sessions WHERE token_hash = ?', [tokenHash]);
        }
        sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
        return true;
    }

    const taxonomyMatch = url.pathname.match(/^\/api\/admin\/(categories|brands)(?:\/(\d+))?$/);
    if (taxonomyMatch) {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }
        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }
        const table = taxonomyMatch[1] === 'categories' ? 'web_categories' : 'web_brands';
        if (req.method === 'GET' && !taxonomyMatch[2]) {
            const [items] = await mysqlPool.query(`SELECT id, name, slug, active FROM ${table} ORDER BY active DESC, name`);
            sendJson(res, 200, { items });
            return true;
        }
        if (req.method === 'POST' && !taxonomyMatch[2]) {
            const body = await readBody(req);
            const name = String(body.name || '').trim();
            if (!name) {
                sendJson(res, 400, { message: 'El nombre es obligatorio' });
                return true;
            }
            const slug = slugPart(body.slug || name);
            try {
                const [result] = await mysqlPool.query(`INSERT INTO ${table} (name, slug) VALUES (?, ?)`, [name, slug]);
                sendJson(res, 201, { item: { id: result.insertId, name, slug, active: 1 } });
            } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') sendJson(res, 409, { message: 'Ya existe un registro con ese nombre o slug' });
                else throw error;
            }
            return true;
        }
        if (req.method === 'PUT' && taxonomyMatch[2]) {
            const body = await readBody(req);
            const name = String(body.name || '').trim();
            const slug = slugPart(body.slug || name);
            const active = body.active === false || body.active === 0 ? 0 : 1;
            if (!name || !slug) {
                sendJson(res, 400, { message: 'Nombre y slug son obligatorios' });
                return true;
            }
            try {
                const id = Number(taxonomyMatch[2]);
                const [[previous]] = await mysqlPool.query(`SELECT slug FROM ${table} WHERE id = ?`, [id]);
                const [result] = await mysqlPool.query(
                    `UPDATE ${table} SET name = ?, slug = ?, active = ? WHERE id = ?`,
                    [name, slug, active, id]
                );
                if (result.affectedRows && previous && previous.slug !== slug && taxonomyMatch[1] === 'categories') {
                    await mysqlPool.query(
                        'UPDATE web_product_categories SET category_slug = ? WHERE category_slug = ?',
                        [slug, previous.slug]
                    );
                }
                if (result.affectedRows && previous && previous.slug !== slug && taxonomyMatch[1] === 'brands') {
                    await mysqlPool.query(
                        'UPDATE web_product_brands SET brand_slug = ? WHERE brand_slug = ?',
                        [slug, previous.slug]
                    );
                }
                sendJson(res, result.affectedRows ? 200 : 404, result.affectedRows
                    ? { ok: true, item: { id, name, slug, active } }
                    : { message: 'Registro no encontrado' });
            } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') sendJson(res, 409, { message: 'Ya existe ese nombre o slug' });
                else throw error;
            }
            return true;
        }
        if (req.method === 'DELETE' && taxonomyMatch[2]) {
            const id = Number(taxonomyMatch[2]);
            if (url.searchParams.get('permanent') === '1') {
                const [[item]] = await mysqlPool.query(`SELECT slug FROM ${table} WHERE id = ?`, [id]);
                if (item && taxonomyMatch[1] === 'categories') {
                    await mysqlPool.query('DELETE FROM web_product_categories WHERE category_slug = ?', [item.slug]);
                }
                if (item && taxonomyMatch[1] === 'brands') {
                    await mysqlPool.query('DELETE FROM web_product_brands WHERE brand_slug = ?', [item.slug]);
                }
                await mysqlPool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
            } else {
                await mysqlPool.query(`UPDATE ${table} SET active = 0 WHERE id = ?`, [id]);
            }
            sendJson(res, 200, { ok: true });
            return true;
        }
    }

    if (req.method === 'GET' && url.pathname === '/api/products') {
        if (productDbReady) {
            sendJson(res, 200, await getProductsFromMysql({
                search: url.searchParams.get('search') || '',
                category: url.searchParams.get('category') || '',
                page: parseBoundedInteger(url.searchParams.get('page'), 1, 1, 1_000_000),
                limit: parseBoundedInteger(url.searchParams.get('limit'), 5000, 1, 5000)
            }));
            return true;
        }

        sendJson(res, 200, { products: memoryStore.products });
        return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/sync-products') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }
        sendJson(res, 200, { ok: true, ...await syncMissingProducts() });
        return true;
    }

    // Admin: Listar productos con búsqueda avanzada
    if (req.method === 'GET' && url.pathname === '/api/admin/products') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        const search = url.searchParams.get('search') || '';
        const availability = url.searchParams.get('availability') || '';
        const issue = url.searchParams.get('issue') || '';
        const sort = url.searchParams.get('sort') || 'created_desc';
        const page = parseBoundedInteger(url.searchParams.get('page'), 1, 1, 1_000_000);
        const limit = parseBoundedInteger(url.searchParams.get('limit'), 100, 10, 500);
        const offset = (page - 1) * limit;

        try {
            const result = await searchProductsInMysql(search, limit, offset, { availability, issue, sort });
            sendJson(res, 200, result);
        } catch (error) {
            console.error('Error buscando productos:', error);
            sendJson(res, 500, { message: 'No se pudieron buscar los productos' });
        }
        return true;
    }

    // Admin: Listar productos sin imagen
    if (req.method === 'GET' && url.pathname === '/api/admin/products/without-image') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        try {
            const products = await getProductsWithoutImage();
            sendJson(res, 200, { products });
        } catch (error) {
            console.error('Error obteniendo productos sin imagen:', error);
            sendJson(res, 500, { message: 'No se pudieron obtener los productos sin imagen' });
        }
        return true;
    }

    // Admin: Soft delete de producto
    if (req.method === 'DELETE' && url.pathname.match(/^\/api\/admin\/products\/\d+$/)) {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        const id = parseInt(url.pathname.split('/').pop(), 10);
        try {
            const deleted = await softDeleteProductInMysql(id);
            if (!deleted) {
                sendJson(res, 404, { message: 'Producto no encontrado' });
                return true;
            }
            sendJson(res, 200, { ok: true, message: 'Producto desactivado correctamente' });
        } catch (error) {
            console.error('Error desactivando producto:', error);
            sendJson(res, 500, { message: 'No se pudo desactivar el producto' });
        }
        return true;
    }

    // Admin: Gestión de imágenes de producto
    const productImagesMatch = url.pathname.match(/^\/api\/admin\/products\/(\d+)\/images$/);
    if (productImagesMatch) {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        const productId = parseInt(productImagesMatch[1], 10);

        // GET: Listar imágenes de un producto
        if (req.method === 'GET') {
            try {
                const images = await getProductImages(productId);
                sendJson(res, 200, { images });
            } catch (error) {
                console.error('Error obteniendo imágenes:', error);
                sendJson(res, 500, { message: 'No se pudieron obtener las imágenes' });
            }
            return true;
        }

        // POST: Agregar imagen a un producto
        if (req.method === 'POST') {
            try {
                const body = await readBody(req);
                if (!body.imagen_url) {
                    sendJson(res, 400, { message: 'imagen_url es obligatorio' });
                    return true;
                }
                const image = await addProductImage(productId, body.imagen_url, body.es_principal);
                sendJson(res, 201, { ok: true, image });
            } catch (error) {
                console.error('Error agregando imagen:', error);
                if (error.code === 'ER_DUP_ENTRY') {
                    sendJson(res, 409, { message: 'Ya existe una imagen principal para este producto' });
                } else {
                    sendJson(res, 500, { message: 'No se pudo agregar la imagen' });
                }
            }
            return true;
        }

        // PUT: Actualizar imagen principal
        if (req.method === 'PUT') {
            try {
                const body = await readBody(req);
                if (body.image_id === undefined) {
                    sendJson(res, 400, { message: 'image_id es obligatorio' });
                    return true;
                }
                const updated = await setMainProductImage(productId, body.image_id);
                if (!updated) {
                    sendJson(res, 404, { message: 'Imagen no encontrada' });
                    return true;
                }
                sendJson(res, 200, { ok: true, message: 'Imagen principal actualizada' });
            } catch (error) {
                console.error('Error actualizando imagen principal:', error);
                sendJson(res, 500, { message: 'No se pudo actualizar la imagen principal' });
            }
            return true;
        }

        // DELETE: Eliminar imagen
        if (req.method === 'DELETE' && url.searchParams.has('image_id')) {
            try {
                const imageId = parseInt(url.searchParams.get('image_id'), 10);
                const deleted = await deleteProductImage(productId, imageId);
                if (!deleted) {
                    sendJson(res, 404, { message: 'Imagen no encontrada' });
                    return true;
                }
                sendJson(res, 200, { ok: true, message: 'Imagen eliminada' });
            } catch (error) {
                console.error('Error eliminando imagen:', error);
                sendJson(res, 500, { message: 'No se pudo eliminar la imagen' });
            }
            return true;
        }
    }


    if (req.method === 'GET' && url.pathname === '/api/admin/status') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        sendJson(res, 200, await getAdminStatus());
        return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/audit') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        const limit = Math.min(200, Math.max(20, parseInt(url.searchParams.get('limit') || '80', 10)));
        sendJson(res, 200, { audit: await getAuditLog(limit, isOwner(req)) });
        return true;
    }

    if (url.pathname === '/api/admin/contact-requests' && req.method === 'GET') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        const [requests] = await mysqlPool.query(`
            SELECT id, name, email, phone, service, message, status, admin_status,
                   admin_notes, emailed_at, created_at, updated_at
            FROM web_contact_requests ORDER BY created_at DESC LIMIT 500
        `);
        sendJson(res, 200, { requests });
        return true;
    }

    const contactRequestMatch = url.pathname.match(/^\/api\/admin\/contact-requests\/(\d+)$/);
    if (contactRequestMatch && req.method === 'PATCH') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        const body = await readBody(req);
        const status = ['nuevo', 'contactado', 'cerrado'].includes(body.status) ? body.status : 'nuevo';
        await mysqlPool.query(
            'UPDATE web_contact_requests SET admin_status = ?, admin_notes = ? WHERE id = ?',
            [status, String(body.notes || '').slice(0, 5000), Number(contactRequestMatch[1])]
        );
        await recordAudit('contact_request_update', 'web_contact_requests', contactRequestMatch[1], { status });
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (url.pathname === '/api/admin/backup' && req.method === 'GET') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        const backup = await buildDataBackup();
        sendJson(res, 200, backup, {
            'Content-Disposition': `attachment; filename="ultra-backup-${new Date().toISOString().slice(0, 10)}.json"`
        });
        return true;
    }

    if (url.pathname === '/api/admin/restore' && req.method === 'POST') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        const body = await readBody(req, 25_000_000);
        const allowedTables = new Set([
            'web_content', 'web_categories', 'web_brands', 'web_product_categories',
            'web_product_brands', 'web_product_flags', 'producto_imagenes',
            'web_quotes', 'web_quote_items', 'web_quote_carts', 'web_contact_requests'
        ]);
        if (!body.tables || typeof body.tables !== 'object') {
            sendJson(res, 400, { message: 'El archivo de respaldo no es válido.' });
            return true;
        }
        const connection = await mysqlPool.getConnection();
        try {
            await connection.beginTransaction();
            const restored = [];
            for (const [table, rows] of Object.entries(body.tables)) {
                if (!allowedTables.has(table) || !Array.isArray(rows)) continue;
                await connection.query(`DELETE FROM \`${table}\``);
                for (const row of rows) {
                    const columns = Object.keys(row);
                    if (!columns.length) continue;
                    const placeholders = columns.map(() => '?').join(',');
                    await connection.query(
                        `INSERT INTO \`${table}\` (${columns.map(column => `\`${column}\``).join(',')}) VALUES (${placeholders})`,
                        columns.map(column => row[column])
                    );
                }
                restored.push(table);
            }
            await connection.commit();
            await hydratePersistentState();
            await recordAudit('backup_restore', 'database', 'site', { restored });
            sendJson(res, 200, { ok: true, restored });
        } catch (error) {
            await connection.rollback();
            console.error('Error restaurando respaldo:', error);
            sendJson(res, 400, { message: `No se pudo restaurar: ${error.message}` });
        } finally {
            connection.release();
        }
        return true;
    }

    if (url.pathname === '/api/admin/media' && req.method === 'GET') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        const files = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })
            .filter(entry => entry.isFile() && /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(entry.name))
            .map(entry => {
                const stat = fs.statSync(path.join(UPLOAD_DIR, entry.name));
                return { name: entry.name, url: `/IMAGENES/${encodeURIComponent(entry.name)}`, size: stat.size, updatedAt: stat.mtime };
            })
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        sendJson(res, 200, { files });
        return true;
    }

    if (url.pathname === '/api/admin/media/upload' && req.method === 'POST') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        try {
            const upload = await readMultipartImage(req);
            if (!upload || !upload.buffer) { sendJson(res, 400, { message: 'Selecciona una imagen válida.' }); return true; }
            const extension = path.extname(upload.filename || '').toLowerCase() || '.jpg';
            const base = safeMediaFilename(path.basename(upload.filename || 'imagen', extension)) || 'imagen';
            const filename = `${Date.now()}-${base}${extension}`;
            fs.writeFileSync(path.join(UPLOAD_DIR, filename), upload.buffer);
            await recordAudit('media_upload', 'media', filename, { size: upload.buffer.length });
            sendJson(res, 201, { ok: true, file: { name: filename, url: `/IMAGENES/${encodeURIComponent(filename)}` } });
        } catch (error) {
            sendJson(res, 400, { message: error.message || 'No se pudo subir la imagen.' });
        }
        return true;
    }

    const mediaMatch = url.pathname.match(/^\/api\/admin\/media\/(.+)$/);
    if (mediaMatch && req.method === 'DELETE') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        const filename = safeMediaFilename(decodeURIComponent(mediaMatch[1]));
        const target = path.join(UPLOAD_DIR, filename);
        if (!filename || !target.startsWith(UPLOAD_DIR) || !fs.existsSync(target)) {
            sendJson(res, 404, { message: 'Archivo no encontrado.' });
            return true;
        }
        const publicPath = `/IMAGENES/${filename}`;
        const [references] = await mysqlPool.query(
            'SELECT COUNT(*) AS total FROM producto_imagenes WHERE imagen_url IN (?, ?)',
            [publicPath, `/IMAGENES/${encodeURIComponent(filename)}`]
        );
        const content = await getSiteContent();
        if (Number(references[0].total) > 0 || JSON.stringify(content).includes(publicPath)) {
            sendJson(res, 409, { message: 'La imagen está en uso. Cambia primero las referencias desde productos o contenido.' });
            return true;
        }
        fs.unlinkSync(target);
        await recordAudit('media_delete', 'media', filename, {});
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (url.pathname === '/api/admin/users' && req.method === 'GET') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        if (!['owner', 'superadmin'].includes(currentAdmin(req).role)) { sendJson(res, 403, { message: 'Solo un superadministrador puede gestionar usuarios.' }); return true; }
        const includeOwner = isOwner(req);
        const [users] = await mysqlPool.query(
            `SELECT id, email, name, role, active, last_login_at, created_at
             FROM web_admin_users
             ${includeOwner ? '' : "WHERE role <> 'owner'"}
             ORDER BY created_at`
        );
        sendJson(res, 200, { users });
        return true;
    }

    if (url.pathname === '/api/admin/users' && req.method === 'POST') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        if (!['owner', 'superadmin'].includes(currentAdmin(req).role)) { sendJson(res, 403, { message: 'Solo un superadministrador puede gestionar usuarios.' }); return true; }
        const body = await readBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const allowedRoles = isOwner(req) ? ['owner', 'superadmin', 'editor', 'ventas'] : ['superadmin', 'editor', 'ventas'];
        const role = allowedRoles.includes(body.role) ? body.role : 'editor';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) {
            sendJson(res, 400, { message: 'Correo inválido o contraseña menor de 10 caracteres.' });
            return true;
        }
        try {
            const [result] = await mysqlPool.query(
                'INSERT INTO web_admin_users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
                [email, String(body.name || 'Administrador').slice(0, 120), hashPassword(password), role]
            );
            await recordAudit('admin_user_create', 'web_admin_users', result.insertId, { email, role });
            sendJson(res, 201, { ok: true, id: result.insertId });
        } catch (error) {
            sendJson(res, 400, { message: error.code === 'ER_DUP_ENTRY' ? 'Ese correo ya existe.' : error.message });
        }
        return true;
    }

    const userMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userMatch && req.method === 'PATCH') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        if (!['owner', 'superadmin'].includes(currentAdmin(req).role)) { sendJson(res, 403, { message: 'Solo un superadministrador puede gestionar usuarios.' }); return true; }
        const body = await readBody(req);
        const [[targetUser]] = await mysqlPool.query('SELECT role FROM web_admin_users WHERE id = ? LIMIT 1', [Number(userMatch[1])]);
        if (!targetUser) { sendJson(res, 404, { message: 'Usuario no encontrado.' }); return true; }
        if (targetUser.role === 'owner' && !isOwner(req)) { sendJson(res, 403, { message: 'No puedes modificar el usuario owner.' }); return true; }
        const fields = [];
        const values = [];
        if (body.name !== undefined) { fields.push('name = ?'); values.push(String(body.name).slice(0, 120)); }
        const allowedRoles = isOwner(req) ? ['owner', 'superadmin', 'editor', 'ventas'] : ['superadmin', 'editor', 'ventas'];
        if (body.role !== undefined && allowedRoles.includes(body.role)) { fields.push('role = ?'); values.push(body.role); }
        if (body.active !== undefined) { fields.push('active = ?'); values.push(body.active ? 1 : 0); }
        if (body.password) {
            if (String(body.password).length < 10) { sendJson(res, 400, { message: 'La contraseña debe tener al menos 10 caracteres.' }); return true; }
            fields.push('password_hash = ?'); values.push(hashPassword(body.password));
        }
        if (!fields.length) { sendJson(res, 400, { message: 'No hay cambios.' }); return true; }
        values.push(Number(userMatch[1]));
        await mysqlPool.query(`UPDATE web_admin_users SET ${fields.join(', ')} WHERE id = ?`, values);
        await recordAudit('admin_user_update', 'web_admin_users', userMatch[1], { fields });
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (contactRequestMatch && req.method === 'DELETE') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        await mysqlPool.query('DELETE FROM web_contact_requests WHERE id = ?', [Number(contactRequestMatch[1])]);
        await recordAudit('contact_request_delete', 'web_contact_requests', contactRequestMatch[1], {});
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/product-issues') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        sendJson(res, 200, await getProductIssues());
        return true;
    }

    const uploadImageMatch = url.pathname.match(/^\/api\/admin\/products\/(\d+)\/upload-image$/);
    if (uploadImageMatch && req.method === 'POST') {
        if (!isAdmin(req)) { sendJson(res, 401, { message: 'No autorizado' }); return true; }
        try {
            const productId = Number(uploadImageMatch[1]);
            const upload = await readMultipartImage(req);
            if (!upload || !upload.buffer) { sendJson(res, 400, { message: 'Debes seleccionar una imagen válida.' }); return true; }
            const saved = await saveUploadedImage(productId, upload);
            const image = await addProductImage(productId, saved.publicPath, true);
            await recordAudit('product_image_upload', 'articulo_servicio', productId, { image: saved.publicPath });
            sendJson(res, 201, { ok: true, image, publicPath: saved.publicPath });
        } catch (error) {
            console.error('Error subiendo imagen:', error);
            sendJson(res, 500, { message: 'No se pudo subir la imagen' });
        }
        return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/content') {
        const content = await getSiteContent();
        sendJson(res, 200, { content: isOwner(req) ? content : stripOwnerOnlyContent(content) });
        return true;
    }

    // POST /api/quotes - Guardar cotización desde el frontend público
    if (req.method === 'POST' && url.pathname === '/api/quotes') {
        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        try {
            const body = await readBody(req);
            const quote = await saveQuoteToMysql(body);
            sendJson(res, 201, { success: true, quote });
        } catch (error) {
            if (!error.statusCode || error.statusCode >= 500) {
                console.error('Error guardando cotización:', error);
            }
            sendJson(
                res,
                error.statusCode || 500,
                { success: false, message: error.statusCode ? error.message : 'No se pudo guardar la cotización' }
            );
        }
        return true;
    }

    // Admin: Listar cotizaciones
    if (req.method === 'GET' && url.pathname === '/api/admin/quotes') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        const search = url.searchParams.get('search') || '';
        const status = url.searchParams.get('status') || '';
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get('limit') || '50', 10)));
        const offset = (page - 1) * limit;

        try {
            const result = await searchQuotesInMysql(search, status, limit, offset);
            sendJson(res, 200, result);
        } catch (error) {
            console.error('Error buscando cotizaciones:', error);
            sendJson(res, 500, { message: 'No se pudieron buscar las cotizaciones' });
        }
        return true;
    }

    // Admin: Obtener detalle de cotización
    const quoteMatch = url.pathname.match(/^\/api\/admin\/quotes\/(\d+)$/);
    if (quoteMatch && req.method === 'GET') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        const quoteId = parseInt(quoteMatch[1], 10);
        try {
            const quote = await getQuoteDetailFromMysql(quoteId);
            if (!quote) {
                sendJson(res, 404, { message: 'Cotización no encontrada' });
                return true;
            }
            sendJson(res, 200, quote);
        } catch (error) {
            console.error('Error obteniendo cotización:', error);
            sendJson(res, 500, { message: 'No se pudo obtener la cotización' });
        }
        return true;
    }

    // Admin: Actualizar estado de cotización
    if (quoteMatch && req.method === 'PUT') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        const quoteId = parseInt(quoteMatch[1], 10);
        try {
            const body = await readBody(req);
            const updated = await updateQuoteStatusInMysql(quoteId, body.status);
            if (!updated) {
                sendJson(res, 404, { message: 'Cotización no encontrada' });
                return true;
            }
            sendJson(res, 200, { ok: true, quote: updated });
        } catch (error) {
            console.error('Error actualizando cotización:', error);
            sendJson(res, 500, { message: 'No se pudo actualizar la cotización' });
        }
        return true;
    }

    // Admin: Guardar flags de producto
    if (req.method === 'POST' && url.pathname === '/api/admin/products/flags') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        try {
            const body = await readBody(req);
            const flags = await saveProductFlagsInMysql(body);
            sendJson(res, 201, { ok: true, flags });
        } catch (error) {
            console.error('Error guardando flags:', error);
            sendJson(res, 500, { message: 'No se pudieron guardar los indicadores del producto' });
        }
        return true;
    }

    // Admin: Obtener flags de un producto
    if (req.method === 'GET' && url.pathname === '/api/admin/products/flags') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        const codigo = url.searchParams.get('codigo');
        if (!codigo) {
            sendJson(res, 400, { message: 'Código es requerido' });
            return true;
        }

        try {
            const flags = await getProductFlagsFromMysql(Number(codigo));
            sendJson(res, 200, { flags });
        } catch (error) {
            console.error('Error obteniendo flags:', error);
            sendJson(res, 500, { message: 'No se pudieron obtener los indicadores del producto' });
        }
        return true;
    }

    // Público: Obtener productos por flag
    if (req.method === 'GET' && url.pathname.match(/^\/api\/products\/(featured|offer|new|bestseller|recommended)$/)) {
        const flagType = url.pathname.split('/').pop();
        const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '12', 10));

        if (!productDbReady) {
            sendJson(res, 503, { message: 'Base de datos MySQL no disponible' });
            return true;
        }

        try {
            const products = await getProductsByFlag(flagType, limit);
            sendJson(res, 200, { products });
        } catch (error) {
            if (isTransientMysqlConnectionError(error)) {
                console.warn(`MySQL no respondió al cargar productos "${flagType}": ${error.code}. Se devolverá lista vacía temporalmente.`);
                sendJson(res, 200, {
                    products: [],
                    warning: 'MySQL no respondió a tiempo. Intenta nuevamente en unos segundos.'
                });
                return true;
            }
            console.error('Error obteniendo productos por flag:', error);
            sendJson(res, 500, { message: 'No se pudieron obtener los productos' });
        }
        return true;
    }

    if (req.method === 'PUT' && url.pathname === '/api/admin/content') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }
        const body = await readBody(req);
        if (!isOwner(req) && body && body.settings) {
            delete body.settings.siteStatus;
            delete body.settings.siteStatusTitle;
            delete body.settings.siteStatusMessage;
        }
        const content = await saveSiteContent(body);
        await recordAudit('content_update', 'ultra_content', 'site', body);
        sendJson(res, 200, { ok: true, content: isOwner(req) ? content : stripOwnerOnlyContent(content) });
        return true;
    }

    const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch && req.method === 'GET') {
        const id = decodeURIComponent(productMatch[1]);
        if (!/^\d+$/.test(id) || Number(id) <= 0) {
            sendJson(res, 400, { message: 'El id del producto no es válido' });
            return true;
        }
        if (productDbReady) {
            const product = await getProductFromMysql(id);
            if (!product) sendJson(res, 404, { message: 'Producto no encontrado' });
            else sendJson(res, 200, { product });
            return true;
        }

        const product = memoryStore.products.find(item => item.id === id);
        if (!product) sendJson(res, 404, { message: 'Producto no encontrado' });
        else sendJson(res, 200, { product });
        return true;
    }

    if (productMatch && req.method === 'PUT') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        const id = decodeURIComponent(productMatch[1]);
        const body = await readBody(req);
        const product = sanitizeProduct({ ...body, id });

        if (productDbReady) {
            const updated = await updateProductInMysql(id, product);
            if (!updated) {
                sendJson(res, 404, { message: 'Producto no encontrado' });
                return true;
            }
            sendJson(res, 200, { ok: true, product: updated });
            return true;
        }

        if (!dbReady) {
            const index = memoryStore.products.findIndex(item => item.id === id);
            if (index === -1) {
                sendJson(res, 404, { message: 'Producto no encontrado' });
                return true;
            }
            memoryStore.products[index] = product;
            sendJson(res, 200, { ok: true, product });
            return true;
        }

        sendJson(res, 503, { message: 'Base de datos de productos no disponible' });
        return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/products') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        const product = sanitizeProduct(await readBody(req));
        if (!product.name || (!productDbReady && !product.id)) {
            sendJson(res, 400, { message: productDbReady ? 'Nombre es obligatorio' : 'ID y nombre son obligatorios' });
            return true;
        }

        if (productDbReady) {
            try {
                const created = await createProductInMysql(product);
                sendJson(res, 201, { ok: true, product: created });
            } catch (error) {
                if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
                    sendJson(res, 409, { message: 'Ya existe un producto con ese nombre o código de artículo' });
                } else if (error.statusCode) {
                    sendJson(res, error.statusCode, { message: error.message });
                } else {
                    throw error;
                }
            }
            return true;
        }

        if (!dbReady) {
            if (memoryStore.products.some(item => item.id === product.id)) {
                sendJson(res, 409, { message: 'Ya existe un producto con ese ID' });
                return true;
            }
            memoryStore.products.push(product);
            sendJson(res, 201, { ok: true, product });
            return true;
        }

        sendJson(res, 503, { message: 'Base de datos de productos no disponible' });
        return true;
    }

    if (productMatch && req.method === 'DELETE') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        const id = decodeURIComponent(productMatch[1]);
        if (productDbReady) {
            const deleted = await deactivateProductInMysql(id);
            sendJson(res, deleted ? 200 : 404, deleted ? { ok: true } : { message: 'Producto no encontrado' });
            return true;
        }

        if (!dbReady) {
            const before = memoryStore.products.length;
            memoryStore.products = memoryStore.products.filter(product => product.id !== id);
            sendJson(res, before === memoryStore.products.length ? 404 : 200, before === memoryStore.products.length ? { message: 'Producto no encontrado' } : { ok: true });
            return true;
        }

        sendJson(res, 503, { message: 'Base de datos de productos no disponible' });
        return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/export-products') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }
        sendJson(res, 410, { message: 'La exportación a productos-data.js fue desactivada. La fuente oficial es MySQL/articulo_servicio.' });
        return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/quotes') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (productDbReady) {
            const result = await searchQuotesInMysql('', '', 500, 0);
            sendJson(res, 200, { quotes: result.quotes });
            return true;
        }

        if (!dbReady) {
            sendJson(res, 200, { quotes: memoryStore.quotes });
            return true;
        }

        const result = await searchQuotesInMysql('', '', 500, 0);
        sendJson(res, 200, { quotes: result.quotes });
        return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/quote-carts') {
        const body = await readBody(req);
        if (!dbReady) {
            memoryStore.quoteCarts.unshift({
                id: Date.now(),
                products: body.products || [],
                totalItems: body.totalItems || 0,
                status: body.status || 'Pendiente',
                timestamp: new Date().toISOString()
            });
            sendJson(res, 201, { ok: true });
            return true;
        }
        await mysqlPool.query(
            'INSERT INTO web_quote_carts (products, total_items, status) VALUES (?, ?, ?)',
            [JSON.stringify(body.products || []), body.totalItems || 0, body.status || 'Pendiente']
        );
        sendJson(res, 201, { ok: true });
        return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/quote-carts') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        if (!dbReady) {
            sendJson(res, 200, { quoteCarts: memoryStore.quoteCarts });
            return true;
        }

        const [rows] = await mysqlPool.query(`
            SELECT id, products, total_items AS totalItems, status, created_at AS timestamp
            FROM web_quote_carts
            ORDER BY created_at DESC
            LIMIT 500
        `);
        sendJson(res, 200, {
            quoteCarts: rows.map(row => ({
                ...row,
                products: typeof row.products === 'string' ? JSON.parse(row.products) : row.products
            }))
        });
        return true;
    }

    const quoteCartMatch = url.pathname.match(/^\/api\/quote-carts\/(\d+)$/);
    if (quoteCartMatch && req.method === 'PUT') {
        if (!isAdmin(req)) {
            sendJson(res, 401, { message: 'No autorizado' });
            return true;
        }

        const id = parseInt(quoteCartMatch[1], 10);
        const body = await readBody(req);

        if (!dbReady) {
            const index = memoryStore.quoteCarts.findIndex(item => item.id === id);
            if (index === -1) {
                sendJson(res, 404, { message: 'Cotización no encontrada' });
                return true;
            }
            memoryStore.quoteCarts[index].status = body.status || memoryStore.quoteCarts[index].status;
            sendJson(res, 200, { ok: true });
            return true;
        }

        const [result] = await mysqlPool.query(
            'UPDATE web_quote_carts SET status = ?, updated_at = NOW() WHERE id = ?',
            [body.status || 'Pendiente', id]
        );

        if (!result.affectedRows) {
            sendJson(res, 404, { message: 'Cotización no encontrada' });
            return true;
        }

        sendJson(res, 200, { ok: true });
        return true;
    }

    return false;
}


async function ensureUltraTables() {
    if (!mysqlPool) return;
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS producto_imagenes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo_articulo INT NOT NULL,
        imagen_url VARCHAR(500) NOT NULL,
        es_principal TINYINT(1) NOT NULL DEFAULT 0,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        fecha_hora_crea TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        fecha_hora_actualiza DATETIME NULL DEFAULT NULL,
        INDEX idx_producto_imagenes_codigo (codigo_articulo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_product_flags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo_articulo INT NOT NULL UNIQUE,
        es_destacado TINYINT(1) NOT NULL DEFAULT 0,
        es_oferta TINYINT(1) NOT NULL DEFAULT 0,
        es_nuevo TINYINT(1) NOT NULL DEFAULT 0,
        es_mas_vendido TINYINT(1) NOT NULL DEFAULT 0,
        es_recomendado TINYINT(1) NOT NULL DEFAULT 0,
        precio_oferta DECIMAL(12,2) NULL,
        fecha_inicio_oferta DATE NULL,
        fecha_fin_oferta DATE NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        fecha_hora_crea TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        fecha_hora_actualiza DATETIME NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(140) NOT NULL UNIQUE,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_product_categories (
        codigo_articulo INT NOT NULL,
        category_slug VARCHAR(140) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (codigo_articulo, category_slug),
        INDEX idx_web_product_categories_slug (category_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_brands (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(140) NOT NULL UNIQUE,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_product_brands (
        codigo_articulo INT PRIMARY KEY,
        brand_slug VARCHAR(140) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_web_product_brands_slug (brand_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [[categoryCount]] = await mysqlPool.query('SELECT COUNT(*) AS total FROM web_categories');
    if (Number(categoryCount.total) === 0) {
        for (const [slug, name] of Object.entries(DEFAULT_WEB_CATEGORIES)) {
            await mysqlPool.query(
                'INSERT INTO web_categories (name, slug, active) VALUES (?, ?, 1)',
                [name, slug]
            );
        }
    }
    const [[brandCount]] = await mysqlPool.query('SELECT COUNT(*) AS total FROM web_brands');
    if (Number(brandCount.total) === 0) {
        const [brandProducts] = await mysqlPool.query(`
            SELECT nombre FROM articulo_servicio
            WHERE activo = 1 AND tipo_articulo_servicio = 'Articulo'
        `);
        const brands = [...new Set(brandProducts.map(product => inferBrand(product.nombre)).filter(Boolean))];
        for (const brand of brands) {
            await mysqlPool.query(
                'INSERT IGNORE INTO web_brands (name, slug, active) VALUES (?, ?, 1)',
                [brand, slugPart(brand)]
            );
        }
    }
    const [productsWithoutBrand] = await mysqlPool.query(`
        SELECT a.codigo, a.nombre
        FROM articulo_servicio a
        WHERE a.tipo_articulo_servicio = 'Articulo'
          AND NOT EXISTS (
              SELECT 1 FROM web_product_brands wpb WHERE wpb.codigo_articulo = a.codigo
          )
    `);
    for (const product of productsWithoutBrand) {
        const brandName = inferBrand(product.nombre);
        if (!brandName) continue;
        const brandSlug = slugPart(brandName);
        await mysqlPool.query(
            'INSERT IGNORE INTO web_brands (name, slug, active) VALUES (?, ?, 1)',
            [brandName, brandSlug]
        );
        await mysqlPool.query(
            'INSERT INTO web_product_brands (codigo_articulo, brand_slug) VALUES (?, ?)',
            [product.codigo, brandSlug]
        );
    }
    await mysqlPool.query(`
        INSERT IGNORE INTO web_product_categories (codigo_articulo, category_slug)
        SELECT a.codigo, 'toners'
        FROM articulo_servicio a
        WHERE UPPER(a.nombre) LIKE '%TONER%'
    `);
    await mysqlPool.query(`
        DELETE wpc FROM web_product_categories wpc
        INNER JOIN articulo_servicio a ON a.codigo = wpc.codigo_articulo
        WHERE wpc.category_slug = 'inks' AND UPPER(a.nombre) LIKE '%TONER%'
    `);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_quotes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quote_number VARCHAR(40) NULL UNIQUE,
        client_name VARCHAR(200) NOT NULL DEFAULT '',
        client_phone VARCHAR(80) NOT NULL DEFAULT '',
        client_email VARCHAR(200) NULL,
        client_message TEXT NULL,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(40) NOT NULL DEFAULT 'pendiente',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL,
        INDEX idx_web_quotes_number (quote_number),
        INDEX idx_web_quotes_status (status),
        INDEX idx_web_quotes_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_quote_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quote_id INT NOT NULL,
        product_codigo INT NULL,
        product_name VARCHAR(500) NOT NULL DEFAULT '',
        product_code VARCHAR(120) NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        INDEX idx_web_quote_items_quote (quote_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_quote_carts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        products LONGTEXT NOT NULL,
        total_items INT NOT NULL DEFAULT 0,
        status VARCHAR(40) NOT NULL DEFAULT 'Pendiente',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL,
        INDEX idx_web_quote_carts_status (status),
        INDEX idx_web_quote_carts_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        entity VARCHAR(100) NULL,
        entity_id VARCHAR(100) NULL,
        details LONGTEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_web_audit_created (created_at),
        INDEX idx_web_audit_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_content (
        content_key VARCHAR(100) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at DATETIME NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_admin_sessions (
        token_hash CHAR(64) PRIMARY KEY,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_web_admin_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(190) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('owner','superadmin','editor','ventas') NOT NULL DEFAULT 'editor',
        active TINYINT(1) NOT NULL DEFAULT 1,
        last_login_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlPool.query(`
        ALTER TABLE web_admin_users
        MODIFY role ENUM('owner','superadmin','editor','ventas') NOT NULL DEFAULT 'editor'
    `);
    const [adminCount] = await mysqlPool.query('SELECT COUNT(*) AS total FROM web_admin_users');
    if (!Number(adminCount[0].total) && ADMIN_EMAIL && ADMIN_PASSWORD) {
        await mysqlPool.query(
            `INSERT INTO web_admin_users (email, name, password_hash, role, active)
             VALUES (?, 'Administrador principal', ?, 'superadmin', 1)`,
            [ADMIN_EMAIL.toLowerCase(), hashPassword(ADMIN_PASSWORD)]
        );
    }
    if (OWNER_EMAIL && OWNER_PASSWORD) {
        await mysqlPool.query(
            `INSERT INTO web_admin_users (email, name, password_hash, role, active)
             VALUES (?, ?, ?, 'owner', 1)
             ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                password_hash = VALUES(password_hash),
                role = 'owner',
                active = 1,
                updated_at = NOW()`,
            [OWNER_EMAIL, OWNER_NAME.slice(0, 120), hashPassword(OWNER_PASSWORD)]
        );
    }
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS web_contact_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        email VARCHAR(254) NOT NULL,
        phone VARCHAR(80) NULL,
        service VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pendiente',
        admin_status VARCHAR(30) NOT NULL DEFAULT 'nuevo',
        admin_notes TEXT NULL,
        source_ip VARCHAR(100) NULL,
        error_message VARCHAR(500) NULL,
        emailed_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL,
        INDEX idx_web_contact_status (admin_status),
        INDEX idx_web_contact_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await ensureColumn('web_quotes', 'quote_number', 'VARCHAR(40) NULL UNIQUE');
    await ensureColumn('web_admin_sessions', 'user_id', 'INT NULL');
    await ensureColumn('web_admin_sessions', 'role', "VARCHAR(30) NOT NULL DEFAULT 'editor'");
}

async function ensureColumn(table, column, definition) {
    const [rows] = await mysqlPool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
    if (!rows.length) await mysqlPool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

function pad3(value) { return String(value).padStart(3, '0'); }
function quoteDateString(date = new Date()) {
    return `${date.getFullYear()}-${pad3(date.getMonth() + 1).slice(-2)}-${pad3(date.getDate()).slice(-2)}`;
}
function formatQuoteNumber(id, createdAt) {
    const date = createdAt ? new Date(createdAt) : new Date();
    return `ULTRA-${quoteDateString(date)}-${pad3(id || 1)}`;
}
async function generateQuoteNumber(connection) {
    const date = quoteDateString(new Date());
    const prefix = `ULTRA-${date}-`;
    const lockName = `ultra_quote_${date}`;
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
    if (Number(lockRows[0].acquired) !== 1) {
        const error = new Error('No se pudo reservar el número de cotización. Intenta nuevamente.');
        error.statusCode = 503;
        throw error;
    }
    const [rows] = await connection.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number, ?) AS UNSIGNED)), 0) AS lastNumber
        FROM web_quotes
        WHERE quote_number LIKE ?
    `, [prefix.length + 1, `${prefix}%`]);
    return { quoteNumber: `${prefix}${pad3(Number(rows[0].lastNumber || 0) + 1)}`, lockName };
}

async function recordAudit(action, entity, entityId, details = {}) {
    if (!mysqlPool) return;
    await mysqlPool.query(`INSERT INTO web_audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)`, [action, entity, String(entityId || ''), JSON.stringify(details || {})]);
}
async function recordAuditWithConnection(connection, action, entity, entityId, details = {}) {
    await connection.query(`INSERT INTO web_audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)`, [action, entity, String(entityId || ''), JSON.stringify(details || {})]);
}
async function getAuditLog(limit = 80, includeOwnerOnly = false) {
    const [rows] = await mysqlPool.query(`
        SELECT id, action, entity, entity_id, details, created_at
        FROM web_audit_log
        ${includeOwnerOnly ? '' : "WHERE action <> 'license_status_update'"}
        ORDER BY created_at DESC
        LIMIT ?
    `, [limit]);
    return rows.map(row => ({ id: row.id, action: row.action, entity: row.entity, entityId: row.entity_id, details: row.details, createdAt: row.created_at }));
}
async function getAdminStatus() {
    const [p] = await mysqlPool.query(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN a.activo=1 AND a.catalogo=1 AND a.disponible=1 AND a.presentar_facturacion=1
            AND COALESCE(e.existencia_total, 0) > 0
            THEN 1 ELSE 0 END) AS visible,
        SUM(CASE WHEN a.activo<>1 OR a.catalogo<>1 OR a.disponible<>1 OR a.presentar_facturacion<>1
            OR COALESCE(e.existencia_total, 0) <= 0
            THEN 1 ELSE 0 END) AS hidden,
        SUM(CASE WHEN a.precio_d IS NULL OR a.precio_d <= 0 THEN 1 ELSE 0 END) AS priceIssues
        FROM articulo_servicio a
        LEFT JOIN (
            SELECT articulo_codigo, SUM(existencia) AS existencia_total
            FROM existencia
            GROUP BY articulo_codigo
        ) e ON e.articulo_codigo = a.codigo
        WHERE a.tipo_articulo_servicio='Articulo'`);
    const [q] = await mysqlPool.query(`SELECT COUNT(*) AS totalQuotes FROM web_quotes`);
    const [img] = await mysqlPool.query(`SELECT COUNT(*) AS uploadedImages FROM producto_imagenes WHERE activo=1`);
    return { products: p[0], quotes: q[0].totalQuotes, uploadedImages: img[0].uploadedImages, productSource: 'articulo_servicio', databaseType: 'mysql', uploadsDir: UPLOAD_DIR };
}
async function getProductIssues() {
    const [rows] = await mysqlPool.query(`SELECT
        SUM(CASE WHEN precio_d IS NULL OR precio_d <= 0 THEN 1 ELSE 0 END) AS precioCero,
        SUM(CASE WHEN articulo_codigo IS NULL OR articulo_codigo='' OR articulo_codigo='0' THEN 1 ELSE 0 END) AS sinCodigo,
        SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM producto_imagenes pi WHERE pi.codigo_articulo = articulo_servicio.codigo AND pi.activo=1) THEN 1 ELSE 0 END) AS sinImagen,
        SUM(CASE WHEN activo=1 AND catalogo=1 AND disponible=1 AND presentar_facturacion=1 THEN 1 ELSE 0 END) AS visibles,
        SUM(CASE WHEN activo<>1 OR catalogo<>1 OR disponible<>1 OR presentar_facturacion<>1 THEN 1 ELSE 0 END) AS ocultos
        FROM articulo_servicio WHERE tipo_articulo_servicio='Articulo'`);
    return rows[0] || {};
}

function parseMultipart(req, maxBytes = 8_000_000) {
    return new Promise((resolve, reject) => {
        const type = req.headers['content-type'] || '';
        const match = type.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
        if (!match) return reject(new Error('Formulario inválido.'));
        const boundary = Buffer.from('--' + (match[1] || match[2]));
        const chunks = [];
        let total = 0;
        req.on('data', chunk => { total += chunk.length; if (total > maxBytes) { req.destroy(); reject(new Error('La imagen es demasiado pesada. Máximo 8 MB.')); return; } chunks.push(chunk); });
        req.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const parts = [];
            let start = buffer.indexOf(boundary) + boundary.length + 2;
            while (start > boundary.length) {
                const end = buffer.indexOf(boundary, start);
                if (end < 0) break;
                const part = buffer.slice(start, end - 2);
                const sep = part.indexOf(Buffer.from('\r\n\r\n'));
                if (sep > -1) {
                    const headers = part.slice(0, sep).toString('utf8');
                    const content = part.slice(sep + 4);
                    parts.push({ headers, content });
                }
                start = end + boundary.length + 2;
            }
            resolve(parts);
        });
        req.on('error', reject);
    });
}
async function readMultipartImage(req) {
    const parts = await parseMultipart(req);
    for (const part of parts) {
        const disposition = (part.headers.match(/Content-Disposition:\s*([^\r\n]+)/i) || [])[1] || '';
        const fieldName = (disposition.match(/(?:^|;\s*)name="([^"]+)"/i) || [])[1] || '';
        const regularFilename = (disposition.match(/(?:^|;\s*)filename="([^"]*)"/i) || [])[1] || '';
        const encodedFilename = (disposition.match(/(?:^|;\s*)filename\*=UTF-8''([^;\r\n]+)/i) || [])[1] || '';
        let filename = regularFilename;
        if (!filename && encodedFilename) {
            try {
                filename = decodeURIComponent(encodedFilename);
            } catch (error) {
                filename = encodedFilename;
            }
        }

        if (fieldName === 'image' && filename) {
            const contentType = (part.headers.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || '';
            const ext = path.extname(filename).toLowerCase() || (contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg');
            if (!['.jpg','.jpeg','.png','.webp'].includes(ext)) throw new Error('Formato no permitido. Usa JPG, PNG o WEBP.');
            const isJpeg = part.content[0] === 0xFF && part.content[1] === 0xD8 && part.content[2] === 0xFF;
            const isPng = part.content.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]));
            const isWebp = part.content.subarray(0, 4).toString() === 'RIFF'
                && part.content.subarray(8, 12).toString() === 'WEBP';
            const validContent = (['.jpg', '.jpeg'].includes(ext) && isJpeg)
                || (ext === '.png' && isPng)
                || (ext === '.webp' && isWebp);
            if (!validContent) throw new Error('El contenido del archivo no corresponde a una imagen válida.');
            return { filename, ext, contentType, buffer: part.content };
        }
    }
    return null;
}
function slugPart(value) { return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'producto'; }
async function saveUploadedImage(productId, upload) {
    const [rows] = await mysqlPool.query('SELECT articulo_codigo, nombre FROM articulo_servicio WHERE codigo = ? LIMIT 1', [productId]);
    const row = rows[0] || {};
    const code = row.articulo_codigo || productId;
    const file = `producto-${slugPart(code)}-${slugPart(row.nombre || productId)}-${Date.now()}${upload.ext}`;
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, file), upload.buffer);
    return { filename: file, publicPath: `/IMAGENES/${file}` };
}

function buildImageIndex() {
    const imagesDir = path.join(rootDir, 'IMAGENES');
    if (!fs.existsSync(imagesDir)) return [];
    const extensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.svg']);
    return fs.readdirSync(imagesDir)
        .filter(file => extensions.has(path.extname(file).toLowerCase()))
        .map(file => ({
            file,
            path: `/IMAGENES/${file}`,
            normalized: normalizeText(file.replace(path.extname(file), '')),
            tokens: new Set(normalizeText(file.replace(path.extname(file), '')).split(' ').filter(Boolean))
        }));
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value).trim();
    const hasComma = raw.includes(',');
    const hasDot = raw.includes('.');
    const normalized = hasComma && !hasDot ? raw.replace(',', '.') : raw.replace(/,/g, '');
    const cleaned = normalized
        .replace(/RD\$/gi, '')
        .replace(/US\$/gi, '')
        .replace(/[^0-9.-]/g, '')
        .trim();
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
}

function formatMoney(value, currencyCode) {
    const number = toNumber(value);
    const symbol = String(currencyCode) === '2' ? 'US$' : 'RD$';
    const hasDecimals = Math.abs(number - Math.round(number)) > 0.001;
    return `${symbol}${number.toLocaleString('es-DO', {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2
    })}`;
}

function formatDecimal(value) {
    return toNumber(value).toLocaleString('es-DO', { maximumFractionDigits: 2 });
}

function inferBrand(name) {
    const stopWords = new Set([
        'MOUSE', 'TECLADO', 'TECLADO/MOUSE', 'IMPRESORA', 'TERMICA', 'TINTA', 'TONER', 'CABLE',
        'ADAPTADOR', 'ADAPTER', 'BULTO', 'MOCHILA', 'LAPTOP', 'COMPUTADORA', 'COMPUTADOR', 'PC',
        'MONITOR', 'MEMORIA', 'RAM', 'SSD', 'HDD', 'BOCINA', 'AUDIFONO', 'AUDIFONOS', 'HEADSET',
        'MICROFONO', 'CAMARA', 'CÁMARA', 'ROUTER', 'SWITCH', 'SILLA', 'SILLON', 'SILLÓN', 'TABLET',
        'DISCO', 'BATERIA', 'BATERÍA', 'FUENTE', 'LECTOR', 'BARRA', 'SISTEMA', 'USB', 'HUB', 'PARA',
        'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'CON', 'Y', 'EN', 'A', 'TO', 'OF', 'PIES', 'PIE',
        'PULG', 'PULGADA', 'PULGADAS', 'COLOR', 'CAT', 'EXTERIORES', 'INTERIORES', 'CCA', 'WIRELESS',
        'INALAMBRICO', 'INALÁMBRICO', 'OPTICO', 'ÓPTICO', 'GAMING', 'NEGRO', 'BLACK', 'BLANCO', 'WHITE'
    ]);

    const rawTokens = String(name || '').split(/[\s/\-()]+/).filter(Boolean);
    for (const token of rawTokens) {
        const clean = normalizeText(token);
        if (!clean || /^\d+$/.test(clean) || stopWords.has(clean)) continue;
        return token.replace(/[,:;.]+$/g, '');
    }
    return rawTokens[0] || 'GENERAL';
}

function findImageForProduct(row) {
    const modelTokens = normalizeText(row.nombre)
        .split(' ')
        .filter(token => token.length >= 4 && /[A-Z]/.test(token) && /[0-9]/.test(token));

    const directCandidates = [row.articulo_codigo, ...modelTokens]
        .map(normalizeText)
        .filter(value => value && value !== '0')
        .filter(value => value.length >= 4 || (/[A-Z]/.test(value) && /[0-9]/.test(value) && value.length >= 3));

    for (const candidate of directCandidates) {
        const found = imageIndex.find(image => image.normalized.includes(candidate));
        if (found) return found.path;
    }

    const nameTokens = normalizeText(row.nombre)
        .split(' ')
        .filter(token => token.length >= 3 && !/^\d+$/.test(token));

    let best = null;
    for (const image of imageIndex) {
        let score = 0;
        for (const token of nameTokens) {
            if (image.tokens.has(token) || image.normalized.includes(token)) score += token.length >= 5 ? 2 : 1;
        }
        if (score >= 8 && (!best || score > best.score)) best = { score, image };
    }

    return best ? best.image.path : '/IMAGENES/producto-sin-imagen.svg';
}

function getArticuloCode(row) {
    const value = row.articulo_codigo;
    if (value === null || value === undefined || value === '' || String(value) === '0') {
        return String(row.codigo || '');
    }
    return String(value);
}

function buildSpecs(row) {
    const specs = [];
    specs.push(`Código artículo: ${getArticuloCode(row)}`);
    if (toNumber(row.garantia) > 0) specs.push(`Garantía: ${row.garantia}`);
    return specs;
}

function normalizeProduct(row, includeAdminPrices = false) {
    const articuloCode = getArticuloCode(row);
    const specs = buildSpecs(row);
    const basePrice = toNumber(row.precio_d);
    const taxRate = toNumber(row.porciento_itbis);
    const netPrice = row.precio_neto === null || row.precio_neto === undefined
        ? basePrice * (1 + (taxRate / 100))
        : toNumber(row.precio_neto);
    const priceTiers = ['a', 'b', 'c', 'd'].reduce((prices, tier) => {
        const baseValue = toNumber(row[`precio_${tier}`]);
        const netColumn = row[`precio_${tier}_neto`];
        const netValue = netColumn === null || netColumn === undefined
            ? baseValue * (1 + (taxRate / 100))
            : toNumber(netColumn);
        prices[tier.toUpperCase()] = {
            baseNumeric: baseValue,
            netNumeric: netValue,
            net: baseValue > 0 ? formatMoney(netValue, row.moneda_codigo) : 'Sin precio'
        };
        return prices;
    }, {});
    const stock = Math.max(0, Math.floor(toNumber(row.existencia_total ?? row.existencia_real)));
    const enabled = Number(row.disponible) === 1;

    const assignedCategories = String(row.assigned_categories || '')
        .split(',')
        .map(category => category.trim())
        .filter(Boolean);
    const product = {
        id: String(row.codigo),
        code: articuloCode,
        codigoUsr: row.codigo_usr || null,
        reference: row.referencia || articuloCode,
        articuloCode,
        productCode: articuloCode,
        name: row.nombre,
        brand: row.assigned_brand || inferBrand(row.nombre),
        categories: assignedCategories,
        description: row.uso && row.uso !== '.' ? row.uso : row.nombre,
        shortDescription: row.nombre,
        price: basePrice > 0 ? formatMoney(netPrice, row.moneda_codigo) : 'Consultar precio',
        priceNumeric: netPrice,
        basePriceNumeric: basePrice,
        hasPrice: basePrice > 0,
        taxRate,
        warranty: toNumber(row.garantia) > 0 ? row.garantia : null,
        hasWarranty: toNumber(row.garantia) > 0,
        stock,
        existence: stock,
        image: row.imagen_url || findImageForProduct(row),
        specs,
        shortSpecs: specs.slice(0, 4),
        features: [
            'Producto leído directamente desde articulo_servicio',
            'Código de artículo listo para cotización',
            'Disponibilidad sujeta a confirmación'
        ],
        databaseAvailable: enabled,
        available: enabled && stock > 0 && Number(row.activo) === 1,
        inStock: stock > 0,
        visible: Number(row.activo) === 1 && Number(row.catalogo) === 1
            && Number(row.presentar_facturacion) === 1 && enabled && stock > 0,
        unit: row.unidad || '',
        catalogo: Number(row.catalogo) === 1,
        activo: Number(row.activo) === 1,
        sourceTable: 'articulo_servicio',
        createdAtSource: row.fecha_hora_crea || null,
        updatedAtSource: row.fecha_hora_actualiza || row.fecha_hora_crea || null
    };

    if (includeAdminPrices) product.priceTiers = priceTiers;

    if (row.es_destacado !== undefined || row.es_oferta !== undefined) {
        product.flags = {
            esDestacado: row.es_destacado === 1,
            esOferta: row.es_oferta === 1,
            esNuevo: row.es_nuevo === 1,
            esMasVendido: row.es_mas_vendido === 1,
            esRecomendado: row.es_recomendado === 1
        };
    }

    if (row.precio_oferta && row.es_oferta === 1) {
        const offerNetPrice = toNumber(row.precio_oferta) * (1 + (taxRate / 100));
        product.originalPrice = product.price;
        product.price = formatMoney(offerNetPrice, row.moneda_codigo);
        product.priceNumeric = offerNetPrice;
    }

    return product;
}

function getProductSelectSql(whereClause = '') {
    return `
        SELECT
            a.codigo,
            a.codigo_usr,
            a.referencia,
            a.articulo_codigo,
            a.nombre,
            a.uso,
            a.unidad,
            a.garantia,
            a.porciento_itbis,
            a.precio_a,
            a.precio_b,
            a.precio_c,
            a.precio_d,
            a.precio_a * (1 + (COALESCE(a.porciento_itbis, 0) / 100)) AS precio_a_neto,
            a.precio_b * (1 + (COALESCE(a.porciento_itbis, 0) / 100)) AS precio_b_neto,
            a.precio_c * (1 + (COALESCE(a.porciento_itbis, 0) / 100)) AS precio_c_neto,
            a.precio_d * (1 + (COALESCE(a.porciento_itbis, 0) / 100)) AS precio_d_neto,
            a.precio_d * (1 + (COALESCE(a.porciento_itbis, 0) / 100)) AS precio_neto,
            COALESCE(e.existencia_total, 0) AS existencia_total,
            a.moneda_codigo,
            a.disponible,
            a.activo,
            a.catalogo,
            a.presentar_facturacion,
            a.tipo_articulo_servicio,
            a.fecha_hora_actualiza,
            a.fecha_hora_crea,
            (SELECT pi.imagen_url FROM producto_imagenes pi WHERE pi.codigo_articulo = a.codigo AND pi.activo = 1 ORDER BY pi.es_principal DESC, pi.id DESC LIMIT 1) AS imagen_url,
            (
                SELECT GROUP_CONCAT(wpc.category_slug ORDER BY wpc.category_slug SEPARATOR ',')
                FROM web_product_categories wpc
                INNER JOIN web_categories wc ON wc.slug = wpc.category_slug AND wc.active = 1
                WHERE wpc.codigo_articulo = a.codigo
            ) AS assigned_categories,
            (
                SELECT wb.name
                FROM web_product_brands wpb
                INNER JOIN web_brands wb ON wb.slug = wpb.brand_slug AND wb.active = 1
                WHERE wpb.codigo_articulo = a.codigo
                LIMIT 1
            ) AS assigned_brand,
            (SELECT pf.es_destacado FROM web_product_flags pf WHERE pf.codigo_articulo = a.codigo AND pf.activo = 1 LIMIT 1) AS es_destacado,
            (SELECT pf.es_oferta FROM web_product_flags pf WHERE pf.codigo_articulo = a.codigo AND pf.activo = 1 LIMIT 1) AS es_oferta,
            (SELECT pf.es_nuevo FROM web_product_flags pf WHERE pf.codigo_articulo = a.codigo AND pf.activo = 1 LIMIT 1) AS es_nuevo,
            (SELECT pf.es_mas_vendido FROM web_product_flags pf WHERE pf.codigo_articulo = a.codigo AND pf.activo = 1 LIMIT 1) AS es_mas_vendido,
            (SELECT pf.es_recomendado FROM web_product_flags pf WHERE pf.codigo_articulo = a.codigo AND pf.activo = 1 LIMIT 1) AS es_recomendado,
            (SELECT pf.precio_oferta FROM web_product_flags pf WHERE pf.codigo_articulo = a.codigo AND pf.activo = 1 LIMIT 1) AS precio_oferta
        FROM articulo_servicio a
        LEFT JOIN (
            SELECT articulo_codigo, SUM(existencia) AS existencia_total
            FROM existencia
            GROUP BY articulo_codigo
        ) e ON e.articulo_codigo = a.codigo
        ${whereClause}
    `;
}

async function getProductsFromMysql(options = {}) {
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(5000, Math.max(1, Number(options.limit || 5000)));
    const offset = (page - 1) * limit;
    let whereClause = `WHERE a.activo = 1
          AND a.catalogo = 1
          AND a.presentar_facturacion = 1
          AND a.disponible = 1
          AND COALESCE(e.existencia_total, 0) > 0
          AND a.tipo_articulo_servicio = 'Articulo'`;
    const params = [];

    if (options.search && String(options.search).trim()) {
        const term = `%${String(options.search).trim()}%`;
        whereClause += ` AND (a.nombre LIKE ? OR a.articulo_codigo LIKE ? OR a.codigo LIKE ? OR a.codigo_usr LIKE ? OR a.referencia LIKE ?)`;
        params.push(term, term, term, term, term);
    }

    const [rows] = await mysqlPool.query(getProductSelectSql(`${whereClause} ORDER BY a.nombre ASC LIMIT ? OFFSET ?`), [...params, limit, offset]);
    const [countRows] = await mysqlPool.query(`
        SELECT COUNT(*) AS total
        FROM articulo_servicio a
        LEFT JOIN (
            SELECT articulo_codigo, SUM(existencia) AS existencia_total
            FROM existencia
            GROUP BY articulo_codigo
        ) e ON e.articulo_codigo = a.codigo
        ${whereClause}
    `, params);
    return {
        products: rows.map(row => normalizeProduct(row)),
        total: Number(countRows[0].total || 0),
        page,
        limit,
        hasMore: offset + rows.length < Number(countRows[0].total || 0)
    };
}

async function getProductFromMysql(id) {
    const [rows] = await mysqlPool.query(getProductSelectSql(`
        WHERE a.codigo = ?
          AND a.activo = 1
          AND a.catalogo = 1
          AND a.presentar_facturacion = 1
          AND a.disponible = 1
          AND COALESCE(e.existencia_total, 0) > 0
          AND a.tipo_articulo_servicio = 'Articulo'
        LIMIT 1
    `), [Number(id)]);
    return rows.length ? normalizeProduct(rows[0]) : null;
}

async function updateProductInMysql(id, product) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return null;

    const price = toNumber(product.priceNumeric ?? product.price);
    const available = product.available === false ? 0 : 1;
    const catalogo = product.catalogo === false ? 0 : 1;
    const activo = product.activo === false ? 0 : 1;

    const [result] = await mysqlPool.query(`
        UPDATE articulo_servicio
        SET
            nombre = ?,
            articulo_codigo = ?,
            uso = ?,
            unidad = ?,
            precio_d = ?,
            disponible = ?,
            catalogo = ?,
            presentar_facturacion = 1,
            activo = ?,
            fecha_hora_actualiza = NOW()
        WHERE codigo = ?
        LIMIT 1
    `, [
        product.name || '',
        product.code || product.articuloCode || '',
        product.description || product.shortDescription || product.name || '.',
        product.unit || 'UNIDAD',
        price,
        available,
        catalogo,
        activo,
        numericId
    ]);

    if (!result.affectedRows) return null;
    await saveProductCategories(numericId, product.categories);
    await saveProductBrand(numericId, product.brand);
    await recordAudit('product_update', 'articulo_servicio', numericId, { name: product.name, code: product.code || product.articuloCode, price, available, catalogo, activo });
    const publicProduct = await getProductFromMysql(numericId);
    if (publicProduct) return publicProduct;
    const [fallbackRows] = await mysqlPool.query(getProductSelectSql('WHERE a.codigo = ? LIMIT 1'), [numericId]);
    return fallbackRows.length ? normalizeProduct(fallbackRows[0], true) : null;
}

async function getNextArticuloCode(connection = mysqlPool) {
    const [rows] = await connection.query(`
        SELECT GREATEST(
            IFNULL(MAX(codigo), 0),
            IFNULL(MAX(CAST(articulo_codigo AS UNSIGNED)), 0)
        ) + 1 AS nextCode
        FROM articulo_servicio
    `);
    return Number(rows[0].nextCode || 1);
}

async function createProductInMysql(product) {
    const price = toNumber(product.priceNumeric ?? product.price);
    const available = product.available === false ? 0 : 1;
    const connection = await mysqlPool.getConnection();
    const lockName = 'ultra_create_articulo';
    let lockAcquired = false;
    let nextCode;

    try {
        await connection.beginTransaction();
        const [lockRows] = await connection.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
        lockAcquired = Number(lockRows[0].acquired) === 1;
        if (!lockAcquired) {
            const error = new Error('No se pudo reservar el código del artículo. Intenta nuevamente.');
            error.statusCode = 503;
            throw error;
        }

        nextCode = await getNextArticuloCode(connection);
        await connection.query(`
            INSERT INTO articulo_servicio (
                codigo,
                activo,
                articulo_codigo,
                nombre,
                otros,
                departamento_codigo,
                perfil_cnt_codigo,
                tipo_ingreso_dgii_codigo,
                moneda_codigo,
                modelo_codigo,
                fabricante_codigo,
                factor_grupal_codigo,
                distribuidor_codigo,
                grupo_impresion_codigo,
                sub_grupo_codigo,
                uso,
                unidad,
                precio_d,
                disponible,
                catalogo,
                presentar_facturacion,
                tipo_articulo_servicio,
                fecha_hora_crea
            ) VALUES (?, ?, ?, ?, '', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ?, ?, ?, ?, ?, 1, 'Articulo', NOW())
        `, [
            nextCode,
            product.activo === false ? 0 : 1,
            nextCode,
            product.name || '',
            product.description || product.shortDescription || product.name || '.',
            product.unit || 'UNIDAD',
            price,
            available,
            product.catalogo === false ? 0 : 1
        ]);

        await recordAuditWithConnection(connection, 'product_create', 'articulo_servicio', nextCode, {
            name: product.name,
            code: nextCode,
            price
        });
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
        connection.release();
    }

    await saveProductCategories(nextCode, product.categories);
    await saveProductBrand(nextCode, product.brand);
    const publicProduct = await getProductFromMysql(nextCode);
    if (publicProduct) return publicProduct;
    const [fallbackRows] = await mysqlPool.query(getProductSelectSql('WHERE a.codigo = ? LIMIT 1'), [nextCode]);
    return fallbackRows.length ? normalizeProduct(fallbackRows[0], true) : null;
}

async function saveProductCategories(codigoArticulo, categories) {
    const code = Number(codigoArticulo);
    if (!Number.isInteger(code) || code <= 0 || !Array.isArray(categories)) return;

    const normalized = [...new Set(categories
        .map(category => slugPart(category))
        .filter(Boolean))];
    const connection = await mysqlPool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM web_product_categories WHERE codigo_articulo = ?', [code]);
        for (const category of normalized) {
            await connection.query(
                'INSERT INTO web_product_categories (codigo_articulo, category_slug) VALUES (?, ?)',
                [code, category]
            );
        }
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function saveProductBrand(codigoArticulo, brand) {
    const code = Number(codigoArticulo);
    const name = String(brand || '').trim();
    if (!Number.isInteger(code) || code <= 0 || !name) return;
    const slug = slugPart(name);
    await mysqlPool.query(
        'INSERT INTO web_brands (name, slug, active) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE name = VALUES(name)',
        [name, slug]
    );
    await mysqlPool.query(
        `INSERT INTO web_product_brands (codigo_articulo, brand_slug) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE brand_slug = VALUES(brand_slug)`,
        [code, slug]
    );
}

// Funciones para admin avanzado

async function searchProductsInMysql(search, limit, offset, filters = {}) {
    let whereClause = `WHERE a.tipo_articulo_servicio = 'Articulo'`;
    const params = [];

    if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        whereClause += ` AND (a.nombre LIKE ? OR a.codigo LIKE ? OR a.articulo_codigo LIKE ?
            OR a.codigo_usr LIKE ? OR a.referencia LIKE ? OR a.uso LIKE ?)`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (filters.availability === 'in_stock') {
        whereClause += ` AND COALESCE(e.existencia_total, 0) > 0`;
    } else if (filters.availability === 'out_of_stock') {
        whereClause += ` AND COALESCE(e.existencia_total, 0) <= 0`;
    } else if (filters.availability === 'visible') {
        whereClause += ` AND a.activo = 1 AND a.catalogo = 1 AND a.disponible = 1
            AND a.presentar_facturacion = 1 AND COALESCE(e.existencia_total, 0) > 0`;
    } else if (filters.availability === 'hidden') {
        whereClause += ` AND (a.activo <> 1 OR a.catalogo <> 1 OR a.disponible <> 1
            OR a.presentar_facturacion <> 1 OR COALESCE(e.existencia_total, 0) <= 0)`;
    }

    if (filters.issue === 'sin_imagen') {
        whereClause += ` AND NOT EXISTS (SELECT 1 FROM producto_imagenes pi WHERE pi.codigo_articulo = a.codigo AND pi.activo = 1)`;
    } else if (filters.issue === 'precio_cero') {
        whereClause += ` AND (a.precio_d IS NULL OR a.precio_d <= 0)`;
    } else if (filters.issue === 'sin_codigo') {
        whereClause += ` AND (a.articulo_codigo IS NULL OR a.articulo_codigo = '' OR a.articulo_codigo = '0')`;
    }

    const orderByOptions = {
        created_desc: 'a.fecha_hora_crea DESC, a.codigo DESC',
        created_asc: 'a.fecha_hora_crea ASC, a.codigo ASC',
        updated_desc: 'a.fecha_hora_actualiza DESC, a.codigo DESC',
        updated_asc: 'a.fecha_hora_actualiza ASC, a.codigo ASC',
        name_asc: 'a.nombre ASC',
        name_desc: 'a.nombre DESC',
        code_desc: 'a.codigo DESC',
        code_asc: 'a.codigo ASC',
        price_desc: 'a.precio_d DESC, a.nombre ASC',
        price_asc: 'a.precio_d ASC, a.nombre ASC',
        stock_desc: 'COALESCE(e.existencia_total, 0) DESC, a.nombre ASC',
        stock_asc: 'COALESCE(e.existencia_total, 0) ASC, a.nombre ASC'
    };
    const orderBy = orderByOptions[filters.sort] || orderByOptions.created_desc;
    const [rows] = await mysqlPool.query(getProductSelectSql(whereClause + ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`), [...params, limit, offset]);
    const [countRows] = await mysqlPool.query(`
        SELECT COUNT(*) AS total
        FROM articulo_servicio a
        LEFT JOIN (
            SELECT articulo_codigo, SUM(existencia) AS existencia_total
            FROM existencia
            GROUP BY articulo_codigo
        ) e ON e.articulo_codigo = a.codigo
        ${whereClause}
    `, params);

    return {
        products: rows.map(row => normalizeProduct(row, true)),
        total: countRows[0].total,
        page: Math.floor(offset / limit) + 1,
        limit,
        hasMore: offset + limit < countRows[0].total
    };
}

async function getProductsWithoutImage() {
    const [rows] = await mysqlPool.query(`
        SELECT
            a.codigo,
            a.articulo_codigo,
            a.nombre,
            a.uso,
            a.unidad,
            a.garantia,
            a.porciento_itbis,
            a.precio_d,
            a.moneda_codigo,
            a.disponible,
            a.activo,
            a.catalogo,
            a.presentar_facturacion,
            a.tipo_articulo_servicio,
            a.fecha_hora_actualiza,
            a.fecha_hora_crea,
            (
                SELECT pi.imagen_url
                FROM producto_imagenes pi
                WHERE pi.codigo_articulo = a.codigo
                  AND pi.activo = 1
                  AND TRIM(COALESCE(pi.imagen_url, '')) <> ''
                ORDER BY pi.es_principal DESC, pi.id DESC
                LIMIT 1
            ) AS imagen_url
        FROM articulo_servicio a
        WHERE a.tipo_articulo_servicio = 'Articulo'
        ORDER BY a.nombre ASC
    `);

    return rows
        .map(row => ({ row, resolvedImage: row.imagen_url || findImageForProduct(row) }))
        .filter(item => item.resolvedImage === '/IMAGENES/producto-sin-imagen.svg')
        .map(item => ({
            id: String(item.row.codigo),
            name: item.row.nombre,
            code: item.row.articulo_codigo ? String(item.row.articulo_codigo) : String(item.row.codigo),
            active: Number(item.row.activo) === 1,
            catalog: Number(item.row.catalogo) === 1
        }));
}

async function softDeleteProductInMysql(id) {
    const [result] = await mysqlPool.query(`
        UPDATE articulo_servicio
        SET
            activo = 0,
            catalogo = 0,
            disponible = 0,
            fecha_hora_actualiza = NOW()
        WHERE codigo = ?
          AND tipo_articulo_servicio = 'Articulo'
        LIMIT 1
    `, [Number(id)]);

    return result.affectedRows > 0;
}

async function getProductImages(codigoArticulo) {
    const [rows] = await mysqlPool.query(`
        SELECT id, codigo_articulo, imagen_url, es_principal, activo, fecha_hora_crea
        FROM producto_imagenes
        WHERE codigo_articulo = ? AND activo = 1
        ORDER BY es_principal DESC, fecha_hora_crea ASC
    `, [Number(codigoArticulo)]);

    return rows.map(row => ({
        id: row.id,
        codigoArticulo: row.codigo_articulo,
        imagenUrl: row.imagen_url,
        esPrincipal: row.es_principal === 1,
        activo: row.activo === 1,
        fechaHoraCrea: row.fecha_hora_crea
    }));
}

async function addProductImage(codigoArticulo, imagenUrl, esPrincipal = false) {
    // Si se va a marcar como principal, primero desmarcar la actual
    if (esPrincipal) {
        await mysqlPool.query(`
            UPDATE producto_imagenes
            SET es_principal = 0
            WHERE codigo_articulo = ?
        `, [Number(codigoArticulo)]);
    }

    const [result] = await mysqlPool.query(`
        INSERT INTO producto_imagenes (codigo_articulo, imagen_url, es_principal, activo)
        VALUES (?, ?, ?, 1)
    `, [Number(codigoArticulo), imagenUrl, esPrincipal ? 1 : 0]);

    const [newRow] = await mysqlPool.query(`
        SELECT id, codigo_articulo, imagen_url, es_principal, activo, fecha_hora_crea
        FROM producto_imagenes
        WHERE id = ?
    `, [result.insertId]);

    return {
        id: newRow[0].id,
        codigoArticulo: newRow[0].codigo_articulo,
        imagenUrl: newRow[0].imagen_url,
        esPrincipal: newRow[0].es_principal === 1,
        activo: newRow[0].activo === 1,
        fechaHoraCrea: newRow[0].fecha_hora_crea
    };
}

async function setMainProductImage(codigoArticulo, imageId) {
    // Primero desmarcar todas las imágenes de este producto
    await mysqlPool.query(`
        UPDATE producto_imagenes
        SET es_principal = 0
        WHERE codigo_articulo = ?
    `, [Number(codigoArticulo)]);

    // Marcar la imagen específica como principal
    const [result] = await mysqlPool.query(`
        UPDATE producto_imagenes
        SET es_principal = 1
        WHERE id = ? AND codigo_articulo = ?
        LIMIT 1
    `, [Number(imageId), Number(codigoArticulo)]);

    return result.affectedRows > 0;
}

async function deleteProductImage(codigoArticulo, imageId) {
    const [result] = await mysqlPool.query(`
        UPDATE producto_imagenes
        SET activo = 0
        WHERE id = ? AND codigo_articulo = ?
        LIMIT 1
    `, [Number(imageId), Number(codigoArticulo)]);

    return result.affectedRows > 0;
}

// Funciones para gestión de cotizaciones

async function saveQuoteToMysql(quoteData) {
    const validated = validateQuoteRequest(quoteData);
    const connection = await mysqlPool.getConnection();
    let quoteLockName = '';
    try {
        await connection.beginTransaction();
        const numberReservation = await generateQuoteNumber(connection);
        const quoteNumber = numberReservation.quoteNumber;
        quoteLockName = numberReservation.lockName;
        const resolvedItems = [];

        for (const item of validated.items) {
            const [productRows] = await connection.query(`
                SELECT a.codigo, a.articulo_codigo, a.nombre, a.precio_d, a.porciento_itbis,
                       a.activo, a.catalogo, a.presentar_facturacion, a.disponible,
                       COALESCE(e.existencia_total, 0) AS existencia_total
                FROM articulo_servicio a
                LEFT JOIN (
                    SELECT articulo_codigo, SUM(existencia) AS existencia_total
                    FROM existencia
                    GROUP BY articulo_codigo
                ) e ON e.articulo_codigo = a.codigo
                WHERE (a.codigo = ? OR a.articulo_codigo = ?)
                  AND a.tipo_articulo_servicio = 'Articulo'
                ORDER BY (a.codigo = ?) DESC
                LIMIT 1
            `, [item.productCodigo, item.productCode, item.productCodigo]);
            const product = productRows[0];
            if (!product) {
                const error = new Error(`El producto con código ${item.productCode} no existe`);
                error.statusCode = 400;
                throw error;
            }
            const availableStock = Math.max(0, Math.floor(toNumber(product.existencia_total)));
            if (Number(product.activo) !== 1 || Number(product.catalogo) !== 1
                || Number(product.presentar_facturacion) !== 1 || Number(product.disponible) !== 1
                || availableStock <= 0) {
                const error = new Error(`El producto "${product.nombre}" ya no está disponible`);
                error.statusCode = 409;
                throw error;
            }
            if (item.quantity > availableStock) {
                const error = new Error(`Solo hay ${availableStock} unidades disponibles de "${product.nombre}"`);
                error.statusCode = 409;
                throw error;
            }
            const unitPrice = toNumber(product.precio_d) * (1 + (toNumber(product.porciento_itbis) / 100));
            resolvedItems.push({
                productCodigo: Number(product.codigo),
                productCode: String(product.articulo_codigo || product.codigo),
                productName: String(product.nombre || ''),
                quantity: item.quantity,
                unitPrice,
                subtotal: unitPrice * item.quantity
            });
        }
        const totalAmount = resolvedItems.reduce((total, item) => total + item.subtotal, 0);

        const [quoteResult] = await connection.query(`
            INSERT INTO web_quotes (
                quote_number,
                client_name,
                client_phone,
                client_email,
                client_message,
                total_amount,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, 'pendiente')
        `, [
            quoteNumber,
            validated.clientName,
            validated.clientPhone,
            validated.clientEmail,
            validated.clientMessage,
            totalAmount
        ]);

        const quoteId = quoteResult.insertId;

        for (const item of resolvedItems) {
            await connection.query(`
                INSERT INTO web_quote_items (
                    quote_id, product_codigo, product_name, product_code, quantity, unit_price, subtotal
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                quoteId, item.productCodigo, item.productName, item.productCode,
                item.quantity, item.unitPrice, item.subtotal
            ]);
        }

        await recordAuditWithConnection(connection, 'quote_create', 'web_quotes', quoteId, {
            quoteNumber, clientName: validated.clientName, totalAmount, itemCount: resolvedItems.length
        });
        await connection.commit();
        return await getQuoteDetailFromMysql(quoteId);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        if (quoteLockName) {
            await connection.query('SELECT RELEASE_LOCK(?)', [quoteLockName]).catch(() => {});
        }
        connection.release();
    }
}

function validateQuoteRequest(quoteData) {
    const data = quoteData && typeof quoteData === 'object' ? quoteData : {};
    const clientName = String(data.clientName || '').trim();
    const clientPhone = String(data.clientPhone || '').trim();
    const phoneDigits = clientPhone.replace(/\D/g, '');
    const clientEmail = String(data.clientEmail || '').trim() || null;
    const clientMessage = String(data.clientMessage || '').trim() || null;

    const invalid = message => {
        const error = new Error(message);
        error.statusCode = 400;
        throw error;
    };

    if (clientName.length < 2 || clientName.length > 200) invalid('El nombre del cliente es obligatorio');
    if (phoneDigits.length < 7 || phoneDigits.length > 20) invalid('El teléfono del cliente es obligatorio y debe ser válido');
    if (clientEmail && (clientEmail.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail))) {
        invalid('El correo electrónico no es válido');
    }
    if (clientMessage && clientMessage.length > 2000) invalid('El mensaje es demasiado largo');
    if (!Array.isArray(data.items) || data.items.length === 0) invalid('La cotización debe tener al menos un producto');
    if (data.items.length > 100) invalid('La cotización supera el máximo de 100 productos');

    const items = data.items.map(item => {
        const productCodigo = String(item?.productCodigo || item?.productId || '').trim();
        const productCode = String(item?.productCode || item?.code || productCodigo).trim();
        const quantity = Number(item?.quantity);
        if (!productCodigo || productCodigo.length > 120 || !productCode || productCode.length > 120) {
            invalid('Todos los productos deben tener un código válido');
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) invalid('La cantidad de cada producto debe estar entre 1 y 999');
        return { productCodigo, productCode, quantity };
    });

    return { clientName, clientPhone, clientEmail, clientMessage, items };
}

async function searchQuotesInMysql(search, status, limit, offset) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        whereClause += ` AND (
            client_name LIKE ? OR
            client_phone LIKE ? OR
            client_email LIKE ? OR
            quote_number LIKE ? OR
            id LIKE ?
        )`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status && status.trim()) {
        whereClause += ` AND status = ?`;
        params.push(status);
    }

    const [rows] = await mysqlPool.query(`
        SELECT
            id,
            quote_number,
            client_name,
            client_phone,
            client_email,
            total_amount,
            status,
            created_at,
            updated_at
        FROM web_quotes
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const [countRows] = await mysqlPool.query(`
        SELECT COUNT(*) AS total FROM web_quotes ${whereClause}
    `, params);

    return {
        quotes: rows.map(row => ({
            id: row.id,
            quoteNumber: row.quote_number || formatQuoteNumber(row.id, row.created_at),
            clientName: row.client_name,
            clientPhone: row.client_phone,
            clientEmail: row.client_email,
            totalAmount: parseFloat(row.total_amount),
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        })),
        total: countRows[0].total,
        page: Math.floor(offset / limit) + 1,
        limit,
        hasMore: offset + limit < countRows[0].total
    };
}

async function getQuoteDetailFromMysql(quoteId) {
    const [quoteRows] = await mysqlPool.query(`
        SELECT
            id,
            quote_number,
            client_name,
            client_phone,
            client_email,
            client_message,
            total_amount,
            status,
            created_at,
            updated_at
        FROM web_quotes
        WHERE id = ?
    `, [Number(quoteId)]);

    if (quoteRows.length === 0) return null;

    const quote = quoteRows[0];

    const [itemRows] = await mysqlPool.query(`
        SELECT
            id,
            product_codigo,
            product_name,
            product_code,
            quantity,
            unit_price,
            subtotal
        FROM web_quote_items
        WHERE quote_id = ?
        ORDER BY id ASC
    `, [Number(quoteId)]);

    return {
        id: quote.id,
        quoteNumber: quote.quote_number || formatQuoteNumber(quote.id, quote.created_at),
        clientName: quote.client_name,
        clientPhone: quote.client_phone,
        clientEmail: quote.client_email,
        clientMessage: quote.client_message,
        totalAmount: parseFloat(quote.total_amount),
        status: quote.status,
        createdAt: quote.created_at,
        updatedAt: quote.updated_at,
        items: itemRows.map(row => ({
            id: row.id,
            productCodigo: row.product_codigo,
            productName: row.product_name,
            productCode: row.product_code,
            quantity: row.quantity,
            unitPrice: parseFloat(row.unit_price),
            subtotal: parseFloat(row.subtotal)
        }))
    };
}

async function updateQuoteStatusInMysql(quoteId, status) {
    const validStatuses = ['pendiente', 'contactado', 'en_proceso', 'vendida', 'cancelada'];
    if (!validStatuses.includes(status)) {
        throw new Error('Estado no válido');
    }

    const [result] = await mysqlPool.query(`
        UPDATE web_quotes
        SET status = ?, updated_at = NOW()
        WHERE id = ?
        LIMIT 1
    `, [status, Number(quoteId)]);

    if (result.affectedRows === 0) return null;
    await recordAudit('quote_status_update', 'web_quotes', quoteId, { status });

    return await getQuoteDetailFromMysql(quoteId);
}

// Funciones para gestión de flags de productos

async function saveProductFlagsInMysql(flagsData) {
    const codigoArticulo = Number(flagsData.codigoArticulo);
    if (!codigoArticulo || codigoArticulo <= 0) {
        throw new Error('Código de artículo inválido');
    }

    // Verificar si ya existe un registro
    const [existing] = await mysqlPool.query(`
        SELECT id FROM web_product_flags WHERE codigo_articulo = ?
    `, [codigoArticulo]);

    const data = {
        es_destacado: flagsData.esDestacado ? 1 : 0,
        es_oferta: flagsData.esOferta ? 1 : 0,
        es_nuevo: flagsData.esNuevo ? 1 : 0,
        es_mas_vendido: flagsData.esMasVendido ? 1 : 0,
        es_recomendado: flagsData.esRecomendado ? 1 : 0,
        precio_oferta: flagsData.precioOferta ? parseFloat(flagsData.precioOferta) : null,
        fecha_inicio_oferta: flagsData.fechaInicioOferta || null,
        fecha_fin_oferta: flagsData.fechaFinOferta || null
    };

    if (existing.length > 0) {
        // Actualizar registro existente
        await mysqlPool.query(`
            UPDATE web_product_flags
            SET es_destacado = ?, es_oferta = ?, es_nuevo = ?, es_mas_vendido = ?, es_recomendado = ?,
                precio_oferta = ?, fecha_inicio_oferta = ?, fecha_fin_oferta = ?, fecha_hora_actualiza = NOW()
            WHERE codigo_articulo = ?
        `, [
            data.es_destacado, data.es_oferta, data.es_nuevo, data.es_mas_vendido, data.es_recomendado,
            data.precio_oferta, data.fecha_inicio_oferta, data.fecha_fin_oferta,
            codigoArticulo
        ]);
    } else {
        // Insertar nuevo registro
        await mysqlPool.query(`
            INSERT INTO web_product_flags (
                codigo_articulo, es_destacado, es_oferta, es_nuevo, es_mas_vendido, es_recomendado,
                precio_oferta, fecha_inicio_oferta, fecha_fin_oferta
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            codigoArticulo, data.es_destacado, data.es_oferta, data.es_nuevo, data.es_mas_vendido, data.es_recomendado,
            data.precio_oferta, data.fecha_inicio_oferta, data.fecha_fin_oferta
        ]);
    }

    return await getProductFlagsFromMysql(codigoArticulo);
}

async function getProductFlagsFromMysql(codigoArticulo) {
    const [rows] = await mysqlPool.query(`
        SELECT
            id, codigo_articulo, es_destacado, es_oferta, es_nuevo, es_mas_vendido, es_recomendado,
            precio_oferta, fecha_inicio_oferta, fecha_fin_oferta, activo
        FROM web_product_flags
        WHERE codigo_articulo = ?
    `, [Number(codigoArticulo)]);

    if (rows.length === 0) {
        return {
            codigoArticulo,
            esDestacado: false,
            esOferta: false,
            esNuevo: false,
            esMasVendido: false,
            esRecomendado: false,
            precioOferta: null,
            fechaInicioOferta: null,
            fechaFinOferta: null
        };
    }

    const row = rows[0];
    return {
        id: row.id,
        codigoArticulo: row.codigo_articulo,
        esDestacado: row.es_destacado === 1,
        esOferta: row.es_oferta === 1,
        esNuevo: row.es_nuevo === 1,
        esMasVendido: row.es_mas_vendido === 1,
        esRecomendado: row.es_recomendado === 1,
        precioOferta: row.precio_oferta ? parseFloat(row.precio_oferta) : null,
        fechaInicioOferta: row.fecha_inicio_oferta,
        fechaFinOferta: row.fecha_fin_oferta,
        activo: row.activo === 1
    };
}

async function getProductsByFlag(flagType, limit) {
    const flagColumnMap = {
        'featured': 'es_destacado',
        'offer': 'es_oferta',
        'new': 'es_nuevo',
        'bestseller': 'es_mas_vendido',
        'recommended': 'es_recomendado'
    };

    const column = flagColumnMap[flagType];
    if (!column) {
        throw new Error('Tipo de flag no válido');
    }

    const today = new Date().toISOString().split('T')[0];

    let whereClause = `WHERE pf.${column} = 1 AND pf.activo = 1`;
    const params = [];

    // Si es oferta, verificar fechas
    if (flagType === 'offer') {
        whereClause += ` AND (pf.fecha_inicio_oferta IS NULL OR pf.fecha_inicio_oferta <= ?)`;
        whereClause += ` AND (pf.fecha_fin_oferta IS NULL OR pf.fecha_fin_oferta >= ?)`;
        params.push(today, today);
    }

    const [rows] = await mysqlPool.query(`
        SELECT
            a.codigo, a.articulo_codigo, a.nombre, a.uso, a.unidad,
            a.garantia, a.porciento_itbis, a.precio_d,
            a.precio_d * (1 + (COALESCE(a.porciento_itbis, 0) / 100)) AS precio_neto,
            COALESCE(e.existencia_total, 0) AS existencia_total,
            a.moneda_codigo, a.disponible,
            (
                SELECT pi.imagen_url
                FROM producto_imagenes pi
                WHERE pi.codigo_articulo = a.codigo
                  AND pi.activo = 1
                  AND TRIM(COALESCE(pi.imagen_url, '')) <> ''
                ORDER BY pi.es_principal DESC, pi.id DESC
                LIMIT 1
            ) AS imagen_url,
            (
                SELECT GROUP_CONCAT(wpc.category_slug ORDER BY wpc.category_slug SEPARATOR ',')
                FROM web_product_categories wpc
                INNER JOIN web_categories wc ON wc.slug = wpc.category_slug AND wc.active = 1
                WHERE wpc.codigo_articulo = a.codigo
            ) AS assigned_categories,
            (
                SELECT wb.name
                FROM web_product_brands wpb
                INNER JOIN web_brands wb ON wb.slug = wpb.brand_slug AND wb.active = 1
                WHERE wpb.codigo_articulo = a.codigo
                LIMIT 1
            ) AS assigned_brand,
            pf.es_destacado, pf.es_oferta, pf.es_nuevo, pf.es_mas_vendido, pf.es_recomendado,
            pf.precio_oferta
        FROM articulo_servicio a
        LEFT JOIN web_product_flags pf ON a.codigo = pf.codigo_articulo
        LEFT JOIN (
            SELECT articulo_codigo, SUM(existencia) AS existencia_total
            FROM existencia
            GROUP BY articulo_codigo
        ) e ON e.articulo_codigo = a.codigo
        ${whereClause}
        AND a.activo = 1
        AND a.catalogo = 1
        AND a.presentar_facturacion = 1
        AND a.disponible = 1
        AND COALESCE(e.existencia_total, 0) > 0
        AND a.tipo_articulo_servicio = 'Articulo'
        ORDER BY a.nombre ASC
        LIMIT ?
    `, [...params, limit]);

    return rows.map(row => {
        const product = normalizeProduct(row);
        // Agregar flags al producto
        product.flags = {
            esDestacado: row.es_destacado === 1,
            esOferta: row.es_oferta === 1,
            esNuevo: row.es_nuevo === 1,
            esMasVendido: row.es_mas_vendido === 1,
            esRecomendado: row.es_recomendado === 1
        };
        return product;
    });
}

async function deactivateProductInMysql(id) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return false;

    const [result] = await mysqlPool.query(`
        UPDATE articulo_servicio
        SET activo = 0,
            catalogo = 0,
            disponible = 0,
            fecha_hora_actualiza = NOW()
        WHERE codigo = ?
        LIMIT 1
    `, [numericId]);

    if (result.affectedRows > 0) {
        await recordAudit('product_delete', 'articulo_servicio', numericId, {
            mode: 'soft_delete',
            activo: 0,
            catalogo: 0,
            disponible: 0
        });
    }
    return result.affectedRows > 0;
}

function buildProductsDataJs() {
    return '// productos-data.js desactivado. La fuente oficial es /api/products desde MySQL/articulo_servicio.\nwindow.ultracompProducts = [];\n';
}

function sanitizeProduct(product) {
    return {
        ...product,
        id: String(product.id || '').trim(),
        code: String(product.code || product.articuloCode || product.productCode || '').trim(),
        articuloCode: String(product.articuloCode || product.code || product.productCode || '').trim(),
        name: String(product.name || '').trim(),
        price: String(product.price || '').trim(),
        priceNumeric: product.priceNumeric,
        image: String(product.image || '').trim(),
        description: String(product.description || '').trim(),
        shortDescription: String(product.shortDescription || '').trim(),
        brand: String(product.brand || '').trim(),
        categories: Array.isArray(product.categories)
            ? product.categories.map(String).map(item => item.trim()).filter(Boolean)
            : String(product.categories || '').split(',').map(item => item.trim()).filter(Boolean),
        specs: Array.isArray(product.specs) ? product.specs : [],
        shortSpecs: Array.isArray(product.shortSpecs) ? product.shortSpecs : [],
        features: Array.isArray(product.features) ? product.features : [],
        available: typeof product.available === 'boolean' ? product.available : true
    };
}

function resolveStaticPath(urlPath) {
    const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
    const routes = {
        '/': '/ULTRACOMP/index.html',
        '/login': '/login/index.html',
        '/admin': '/admin/index.html',
        '/owner': '/owner/index.html',
        '/mi-cotizacion': '/ULTRACOMP/mi-cotizacion.html'
    };

    if (routes[cleanPath]) return path.join(rootDir, routes[cleanPath]);

    if (cleanPath.startsWith('/admin/') && !path.extname(cleanPath)) {
        const adminRouteFile = path.join(rootDir, cleanPath, 'index.html');
        return fs.existsSync(adminRouteFile) ? adminRouteFile : path.join(rootDir, 'admin/index.html');
    }

    if (cleanPath.startsWith('/login/') && !path.extname(cleanPath)) {
        return path.join(rootDir, 'login/index.html');
    }

    let filePath = path.join(rootDir, cleanPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }
    return filePath;
}

function serveStatic(req, res, url) {
    const adminPageRequest = (url.pathname === '/admin' || url.pathname.startsWith('/admin/'))
        && (!path.extname(url.pathname) || path.extname(url.pathname).toLowerCase() === '.html');
    const ownerPageRequest = (url.pathname === '/owner' || url.pathname.startsWith('/owner/'))
        && (!path.extname(url.pathname) || path.extname(url.pathname).toLowerCase() === '.html');
    if (adminPageRequest && !isAdmin(req)) {
        res.writeHead(302, { Location: '/login/' });
        res.end();
        return;
    }
    if (ownerPageRequest && !isOwner(req)) {
        res.writeHead(302, { Location: '/login/' });
        res.end();
        return;
    }

    const siteAccess = getSiteAccessSettings();
    if (siteAccess.status !== 'active' && isPublicHtmlRequest(url)) {
        const html = renderSiteUnavailablePage(siteAccess);
        res.writeHead(503, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': Buffer.byteLength(html),
            'Cache-Control': 'no-store',
            ...securityHeaders()
        });
        res.end(html);
        return;
    }

    let filePath = resolveStaticPath(url.pathname);
    if (url.pathname.startsWith('/IMAGENES/')) {
        const uploadCandidate = path.join(UPLOAD_DIR, decodeURIComponent(url.pathname.replace('/IMAGENES/', '')));
        if (fs.existsSync(uploadCandidate)) filePath = uploadCandidate;
    }
    const normalized = path.normalize(filePath);

    if ((url.pathname.startsWith('/IMAGENES/') ? !normalized.startsWith(UPLOAD_DIR) : !normalized.startsWith(rootDir)) || path.basename(normalized).startsWith('.')) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
        const notFound = path.join(rootDir, '404.html');
        if (fs.existsSync(notFound)) {
            const body = fs.readFileSync(notFound);
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, ...securityHeaders() });
            res.end(body);
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
        return;
    }

    const ext = path.extname(normalized).toLowerCase();
    const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.tiff': 'image/tiff',
        '.glb': 'model/gltf-binary',
        '.gltf': 'model/gltf+json'
    };

    const headers = {
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        ...securityHeaders()
    };
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/owner') || url.pathname.startsWith('/login')) {
        headers['Cache-Control'] = 'no-store';
    }
    if (ext === '.html') {
        const content = memoryStore.content || getDefaultContent();
        const isUltrasoft = url.pathname.toLowerCase().includes('ultrasoft');
        const seoTitle = isUltrasoft ? content.seo.ultrasoftTitle : content.seo.ultracompTitle;
        const seoDescription = isUltrasoft ? content.seo.ultrasoftDescription : content.seo.ultracompDescription;
        let html = fs.readFileSync(normalized, 'utf8')
            .replaceAll('https://ultrasoft.example.com', SITE_URL)
            .replaceAll('{{SITE_URL}}', SITE_URL);
        if (!adminPageRequest && !ownerPageRequest && !url.pathname.startsWith('/login')) {
            html = html
                .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeXml(seoTitle)}</title>`)
                .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeXml(seoDescription)}">`)
                .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escapeXml(seoTitle)}">`)
                .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${escapeXml(seoDescription)}">`)
                .replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${SITE_URL}${escapeXml(content.seo.socialImage)}">`);
        }
        headers['Content-Length'] = Buffer.byteLength(html);
        res.writeHead(200, headers);
        res.end(html);
        return;
    }
    if (!url.pathname.startsWith('/IMAGENES/')) {
        headers['Cache-Control'] = headers['Cache-Control'] || 'public, max-age=3600';
    }
    res.writeHead(200, headers);
    fs.createReadStream(normalized).pipe(res);
}

let initPromise = null;

async function prepareApp() {
    if (!initPromise) {
        initPromise = initDatabase().catch(error => {
            console.error('Could not initialize database. Using memory fallback:', error.message);
        });
    }
    return initPromise;
}

async function requestHandler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
        await prepareApp();
        if (url.pathname === '/robots.txt') {
            const body = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /login/\nSitemap: ${SITE_URL}/sitemap.xml\n`;
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders() });
            res.end(body);
            return;
        }
        if (url.pathname === '/sitemap.xml') {
            const paths = ['/', '/ULTRACOMP/index.html', '/ULTRACOMP/productos.html', '/ULTRASOFT/ultrasoft.html'];
            if (productDbReady) {
                const [products] = await mysqlPool.query(`
                    SELECT a.codigo FROM articulo_servicio a
                    WHERE a.activo = 1 AND a.catalogo = 1 AND a.tipo_articulo_servicio = 'Articulo'
                    ORDER BY a.codigo
                `);
                products.forEach(product => paths.push(`/ULTRACOMP/producto-detalle.html?id=${product.codigo}`));
            }
            const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(item => `<url><loc>${SITE_URL}${item}</loc></url>`).join('')}</urlset>`;
            res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', ...securityHeaders() });
            res.end(body);
            return;
        }
        if (url.pathname.startsWith('/api/')) {
            const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
            const isProtectedMutation = url.pathname.startsWith('/api/admin/')
                || url.pathname === '/api/products'
                || /^\/api\/products\//.test(url.pathname);
            if (isMutation && isProtectedMutation && !hasValidRequestOrigin(req)) {
                sendJson(res, 403, { message: 'Origen de solicitud no permitido' });
                return;
            }
            if (url.pathname.startsWith('/api/admin/') && isAdmin(req)) {
                const role = currentAdmin(req).role;
                const salesAllowed = [
                    '/api/admin/session', '/api/admin/logout', '/api/admin/status',
                    '/api/admin/quotes', '/api/admin/contact-requests'
                ].some(prefix => url.pathname.startsWith(prefix));
                if (role === 'ventas' && !salesAllowed) {
                    sendJson(res, 403, { message: 'Tu rol solo permite gestionar ventas y solicitudes.' });
                    return;
                }
                if (role === 'editor' && (url.pathname.startsWith('/api/admin/users') || url.pathname === '/api/admin/restore')) {
                    sendJson(res, 403, { message: 'Esta acción requiere rol de superadministrador.' });
                    return;
                }
            }
            const handled = await handleApi(req, res, url);
            if (!handled) sendJson(res, 404, { message: 'API no encontrada' });
            return;
        }

        serveStatic(req, res, url);
    } catch (error) {
        console.error(error);
        sendJson(res, 500, { message: 'Error interno del servidor' });
    }
}

const server = http.createServer(requestHandler);

server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
        console.error(`El puerto ${PORT} ya está ocupado. Cierra el proceso anterior o configura otro PORT.`);
    } else {
        console.error('Error del servidor HTTP:', error);
    }
    process.exitCode = 1;
});

async function shutdown(signal) {
    console.log(`${signal}: cerrando Ultra de forma segura...`);
    server.close(async () => {
        if (mysqlPool) await mysqlPool.end().catch(() => {});
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
}

if (require.main === module) {
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    prepareApp()
        .then(() => {
        server.listen(PORT, () => {
            console.log(`Ultra server running at http://localhost:${PORT}`);
        });
        })
        .catch(() => {
            process.exitCode = 1;
        });
}

module.exports = requestHandler;
module.exports.server = server;

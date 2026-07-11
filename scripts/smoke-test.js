const fs = require('fs');
const path = require('path');

function loadEnv() {
    const file = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
        if (!line || line.trim().startsWith('#')) return;
        const separator = line.indexOf('=');
        if (separator < 1) return;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (!process.env[key]) process.env[key] = value;
    });
}

async function expectResponse(url, options, expected = 200) {
    const response = await fetch(url, options);
    if (response.status !== expected) {
        throw new Error(`${options && options.method || 'GET'} ${url}: se esperaba ${expected}, llegó ${response.status}`);
    }
    return response;
}

async function run() {
    loadEnv();
    const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
    const health = await expectResponse(`${base}/api/health`).then(response => response.json());
    if (health.database !== 'connected') throw new Error('MySQL no está conectado');

    await Promise.all([
        expectResponse(`${base}/api/content`),
        expectResponse(`${base}/api/products`),
        expectResponse(`${base}/ULTRACOMP/index.html`),
        expectResponse(`${base}/ULTRACOMP/productos.html`),
        expectResponse(`${base}/ULTRASOFT/ultrasoft.html`),
        expectResponse(`${base}/robots.txt`),
        expectResponse(`${base}/sitemap.xml`)
    ]);

    const login = await expectResponse(`${base}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
    });
    const cookie = login.headers.get('set-cookie');
    if (!cookie) throw new Error('El login no entregó cookie de sesión');
    const headers = { Cookie: cookie.split(';')[0] };

    await Promise.all([
        expectResponse(`${base}/api/admin/session`, { headers }),
        expectResponse(`${base}/api/admin/categories`, { headers }),
        expectResponse(`${base}/api/admin/brands`, { headers }),
        expectResponse(`${base}/api/admin/contact-requests`, { headers }),
        expectResponse(`${base}/api/admin/audit`, { headers }),
        expectResponse(`${base}/api/admin/backup`, { headers }),
        expectResponse(`${base}/api/admin/media`, { headers }),
        expectResponse(`${base}/api/admin/users`, { headers }),
        expectResponse(`${base}/admin/testimonios/`, { headers }),
        expectResponse(`${base}/admin/ultrasoft/preguntas/`, { headers }),
        expectResponse(`${base}/admin/ultracomp/contenido/`, { headers }),
        expectResponse(`${base}/admin/medios/`, { headers }),
        expectResponse(`${base}/admin/usuarios/`, { headers }),
        expectResponse(`${base}/admin/seo/`, { headers }),
        expectResponse(`${base}/admin/respaldos/`, { headers })
    ]);

    const currentContent = await expectResponse(`${base}/api/content`).then(response => response.json());
    await expectResponse(`${base}/api/admin/content`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify(currentContent.content)
    });

    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const form = new FormData();
    form.append('image', new Blob([pixel], { type: 'image/png' }), 'smoke-test.png');
    const uploaded = await expectResponse(`${base}/api/admin/media/upload`, {
        method: 'POST', headers: { Cookie: headers.Cookie, Origin: base }, body: form
    }, 201).then(response => response.json());
    await expectResponse(`${base}/api/admin/media/${encodeURIComponent(uploaded.file.name)}`, {
        method: 'DELETE', headers: { ...headers, Origin: base }
    });

    await expectResponse(`${base}/api/admin/logout`, {
        method: 'POST',
        headers: { ...headers, Origin: base }
    });
    console.log(`Smoke test correcto: MySQL conectado y ${health.productsCount} productos disponibles.`);
}

run().catch(error => {
    console.error(`Smoke test falló: ${error.message}`);
    process.exitCode = 1;
});

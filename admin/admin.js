(function () {
    const data = window.ultraAdminData;
    const sessionKey = data.sessionKey;
    let adminProducts = Array.isArray(window.ultracompProducts) ? window.ultracompProducts.slice() : [];
    let adminQuotes = [];
    let adminQuoteCarts = [];
    let adminRequests = [];
    let adminAudit = [];
    let adminMedia = [];
    let adminUsers = [];
    let adminSystemStatus = null;
    let adminRole = sessionStorage.getItem('ultraAdminRole') || 'editor';
    let adminContent = {
        bannerProductIds: data.bannerProductIds,
        featuredProductIds: data.featuredProductIds,
        ultrasoft: data.ultrasoft,
        settings: data.settings
    };

    function normalizePath(pathname) {
        if (pathname === '/admin') return '/admin/';
        if (pathname === '/login') return '/login/';
        return pathname.endsWith('/') ? pathname : `${pathname}/`;
    }

    function hasSession() {
        return localStorage.getItem(sessionKey) === 'true';
    }

    function adminHeaders() {
        return {
            'Content-Type': 'application/json'
        };
    }

    async function validateSession() {
        try {
            const response = await fetch('/api/admin/session');
            if (response.ok) {
                const payload = await response.json();
                adminRole = payload.role || 'editor';
                sessionStorage.setItem('ultraAdminRole', adminRole);
                localStorage.setItem(sessionKey, 'true');
                return true;
            }
        } catch (error) {
            console.warn('No se pudo validar la sesión:', error.message);
        }
        localStorage.removeItem(sessionKey);
        return false;
    }

    function redirect(path) {
        window.location.href = path;
    }

    function getDefaultAdminPath() {
        return adminRole === 'owner' ? (data.ownerPath || '/owner/') : data.adminPath;
    }

    function protectAdminRoute() {
        if (window.location.pathname.startsWith('/admin') && !hasSession()) {
            redirect(data.loginPath);
        }
    }

    function initLogin(authenticated = false) {
        const form = document.getElementById('loginForm');
        if (!form) return;

        if (authenticated) {
            redirect(getDefaultAdminPath());
            return;
        }

        const error = document.getElementById('loginError');
        const sessionMessage = sessionStorage.getItem('ultraAdminSessionMessage');
        if (sessionMessage) {
            error.textContent = sessionMessage;
            error.style.display = 'block';
            sessionStorage.removeItem('ultraAdminSessionMessage');
        }

        form.addEventListener('submit', function (event) {
            event.preventDefault();

            const email = form.email.value.trim();
            const password = form.password.value;

            fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })
                .then(response => {
                    if (!response.ok) throw new Error('Credenciales incorrectas');
                    return response.json();
                })
                .then(payload => {
                    adminRole = payload.role || 'editor';
                    sessionStorage.setItem('ultraAdminRole', adminRole);
                    localStorage.setItem(sessionKey, 'true');
                    redirect(getDefaultAdminPath());
                })
                .catch(() => {
                    error.textContent = 'Credenciales incorrectas';
                    error.style.display = 'block';
                });
        });
    }

    function getCurrentRoute() {
        const currentPath = normalizePath(window.location.pathname);
        return data.routes.find(route => route.path === currentPath) || data.routes[0];
    }

    function getSectionRoutes(section) {
        const routes = data.routes.filter(route => route.section === section && (!route.ownerOnly || adminRole === 'owner'));
        if (adminRole === 'ventas') {
            return routes.filter(route => ['/admin/', '/admin/cotizaciones/', '/admin/ultrasoft/solicitudes/', '/admin/leads/'].includes(route.path));
        }
        if (adminRole === 'editor') {
            return routes.filter(route => !['/admin/usuarios/', '/admin/respaldos/'].includes(route.path));
        }
        return routes;
    }

    function renderNav(currentRoute) {
        const groups = [
            { title: 'General', routes: getSectionRoutes('general') },
            { title: 'ULTRACOMP', routes: getSectionRoutes('ultracomp') },
            { title: 'ULTRASOFT', routes: getSectionRoutes('ultrasoft') }
        ];

        return groups.map(group => `
            <div class="nav-group">
                <h2>${group.title}</h2>
                ${group.routes.map(route => `
                    <a href="${route.path}" class="${route.path === currentRoute.path ? 'active' : ''}">${route.label}</a>
                `).join('')}
            </div>
        `).join('');
    }

    function getProducts() {
        return adminProducts;
    }

    async function loadProductsFromApi() {
        try {
            const response = await fetch('/api/products');
            if (!response.ok) throw new Error('No se pudieron cargar productos');
            const payload = await response.json();
            if (Array.isArray(payload.products)) {
                adminProducts = payload.products;
                window.ultracompProducts = payload.products;
            }
        } catch (error) {
            console.warn('Usando productos locales por fallback:', error.message);
        }
    }

    async function loadQuotesFromApi() {
        try {
            const response = await fetch('/api/quotes', { headers: adminHeaders() });
            if (!response.ok) throw new Error('No se pudieron cargar cotizaciones');
            const payload = await response.json();
            adminQuotes = Array.isArray(payload.quotes) ? payload.quotes : [];
        } catch (error) {
            adminQuotes = getLocalList('ultraQuotes');
        }
    }

    async function loadQuoteCartsFromApi() {
        try {
            const response = await fetch('/api/quote-carts', { headers: adminHeaders() });
            if (!response.ok) throw new Error('No se pudieron cargar cotizaciones múltiples');
            const payload = await response.json();
            adminQuoteCarts = Array.isArray(payload.quoteCarts) ? payload.quoteCarts : [];
        } catch (error) {
            adminQuoteCarts = [];
        }
    }

    async function loadContentFromApi() {
        try {
            const response = await fetch('/api/content');
            if (!response.ok) throw new Error('No se pudo cargar contenido');
            const payload = await response.json();
            if (payload.content) {
                adminContent = {
                    ...adminContent,
                    ...payload.content,
                    ultrasoft: {
                        ...adminContent.ultrasoft,
                        ...(payload.content.ultrasoft || {}),
                        landing: {
                            ...(adminContent.ultrasoft.landing || {}),
                            ...((payload.content.ultrasoft || {}).landing || {})
                        }
                    },
                    settings: {
                        ...adminContent.settings,
                        ...(payload.content.settings || {})
                    }
                };
            }
        } catch (error) {
            console.warn('Usando contenido local por fallback:', error.message);
        }
    }

    async function loadRequestsAndAudit() {
        try {
            const [requestsResponse, auditResponse, mediaResponse, usersResponse, statusResponse] = await Promise.all([
                fetch('/api/admin/contact-requests', { headers: adminHeaders() }),
                fetch('/api/admin/audit?limit=200', { headers: adminHeaders() }),
                fetch('/api/admin/media', { headers: adminHeaders() }),
                fetch('/api/admin/users', { headers: adminHeaders() }),
                fetch('/api/admin/status', { headers: adminHeaders() })
            ]);
            if (requestsResponse.ok) {
                const payload = await requestsResponse.json();
                adminRequests = payload.requests || [];
            }
            if (auditResponse.ok) {
                const payload = await auditResponse.json();
                adminAudit = payload.audit || [];
            }
            if (mediaResponse.ok) adminMedia = (await mediaResponse.json()).files || [];
            if (usersResponse.ok) adminUsers = (await usersResponse.json()).users || [];
            if (statusResponse.ok) adminSystemStatus = await statusResponse.json();
        } catch (error) {
            console.warn('No se pudieron cargar solicitudes o auditoría:', error.message);
        }
    }

    async function saveContent(partialContent) {
        const response = await fetch('/api/admin/content', {
            method: 'PUT',
            headers: adminHeaders(),
            body: JSON.stringify(partialContent)
        });

        if (!response.ok) throw new Error('No se pudo guardar el contenido');
        const payload = await response.json();
        adminContent = payload.content;
        return payload.content;
    }

    function getBrands() {
        return new Set(getProducts().map(getBrandName).filter(Boolean));
    }

    function getCategories() {
        return new Set(getProducts().flatMap(product => product.categories || []));
    }

    function getBrandName(product) {
        return product.brand || (product.name || '').split(' ')[0] || 'Sin marca';
    }

    function getLocalList(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || '[]');
        } catch (error) {
            return [];
        }
    }

    function formatCategory(category) {
        return data.categoryLabels[category] || category;
    }

    function productById(id) {
        return getProducts().find(product => product.id === id) || null;
    }

    function slugify(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/-{2,}/g, '-');
    }

    function uniqueProductId(base, currentId = '') {
        const cleanBase = slugify(base) || 'producto';
        const ids = new Set(getProducts().map(product => product.id).filter(id => id !== currentId));
        let candidate = cleanBase;
        let index = 2;
        while (ids.has(candidate)) {
            candidate = `${cleanBase}-${index}`;
            index += 1;
        }
        return candidate;
    }

    function renderStatusNote() {
        return `
            <div class="admin-note">
                <strong>Conexión actual:</strong>
                productos, contenido, solicitudes, cotizaciones y sesiones guardados mediante Node + MySQL.
                Las credenciales permanecen exclusivamente en el servidor.
            </div>
        `;
    }

    function renderDashboard() {
        const products = getProducts();
        const quotes = adminQuotes;
        const leads = adminRequests;
        return `
            <div class="admin-grid">
                <div class="admin-card"><span>Productos</span><strong>${products.length}</strong></div>
                <div class="admin-card"><span>Categorías</span><strong>${getCategories().size}</strong></div>
                <div class="admin-card"><span>Marcas</span><strong>${getBrands().size}</strong></div>
                <div class="admin-card"><span>Cotizaciones</span><strong>${quotes.length}</strong></div>
                <div class="admin-card"><span>Leads Ultrasoft</span><strong>${leads.length}</strong></div>
            </div>
            <section class="admin-panel">
                <h2>Panel general</h2>
                <p>Desde aquí se administrarán ULTRACOMP, ULTRASOFT, clientes, leads y configuración del negocio.</p>
                ${renderStatusNote()}
                <button class="admin-link" id="syncProductsButton" type="button">Sincronizar productos faltantes</button>
                <div class="admin-form-message" id="syncProductsMessage"></div>
            </section>
            <section class="admin-panel">
                <h2>Diagnóstico del sistema</h2>
                <div class="admin-grid">
                    <div class="admin-card"><span>Base de datos</span><strong>${adminSystemStatus ? 'Conectada' : 'Sin verificar'}</strong></div>
                    <div class="admin-card"><span>Productos</span><strong>${adminSystemStatus?.products?.total ?? products.length}</strong></div>
                    <div class="admin-card"><span>Imágenes subidas</span><strong>${adminSystemStatus?.uploadedImages ?? adminMedia.length}</strong></div>
                    <div class="admin-card"><span>Solicitudes</span><strong>${leads.length}</strong></div>
                </div>
                <p>Carpeta de imágenes: <code>${escapeHtml(adminSystemStatus?.uploadsDir || 'No disponible')}</code></p>
                <p><a class="admin-link" href="/api/health" target="_blank">Abrir verificación pública</a></p>
            </section>
        `;
    }

    function renderProductsAdmin() {
        const rows = getProducts().map(product => `
            <tr>
                <td><img class="admin-thumb" src="${product.image}" alt=""></td>
                <td>
                    <strong>${product.name}</strong>
                    <small>${product.shortDescription || product.description || ''}</small>
                </td>
                <td><code>${product.id}</code></td>
                <td>${(product.categories || []).map(formatCategory).join(', ')}</td>
                <td>${getBrandName(product)}</td>
                <td>${product.price || 'Sin precio'}</td>
                <td>
                    <div class="admin-actions">
                        <button class="admin-link admin-edit-product" type="button" data-product-id="${product.id}">Editar</button>
                        <button class="admin-link admin-delete-product" type="button" data-product-id="${product.id}">Eliminar</button>
                        <a class="admin-link" href="/ULTRACOMP/producto-detalle.html?id=${encodeURIComponent(product.id)}" target="_blank" rel="noopener">Ver</a>
                    </div>
                </td>
            </tr>
        `).join('');

        return `
            <section class="admin-panel">
                <div class="admin-panel-header">
                    <div>
                        <h2>Productos ULTRACOMP</h2>
                        <p>Mostrando ${getProducts().length} productos conectados desde MySQL.</p>
                    </div>
                    <div class="admin-actions">
                        <button class="admin-link" id="createProductButton" type="button">Crear producto</button>
                        <button class="admin-link" id="exportProductsButton" type="button">Exportación estática desactivada</button>
                        <a class="admin-link" href="/ULTRACOMP/productos.html" target="_blank" rel="noopener">Ver catálogo público</a>
                    </div>
                </div>
                <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead><tr><th>Imagen</th><th>Producto</th><th>ID</th><th>Categorías</th><th>Marca</th><th>Precio</th><th>Acciones</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                </div>
            </section>
            <div class="admin-modal" id="productEditModal" aria-hidden="true">
                <div class="admin-modal-card">
                    <div class="admin-modal-header">
                        <h2 id="productModalTitle">Editar producto</h2>
                        <button class="admin-modal-close" type="button" id="closeProductModal">&times;</button>
                    </div>
                    <form id="productEditForm" class="admin-form">
                        <input type="hidden" name="mode" value="edit">
                        <input type="hidden" name="originalId">
                        <label>ID
                            <input name="id" type="text" required>
                        </label>
                        <label>Nombre
                            <input name="name" type="text" required>
                        </label>
                        <div class="admin-form-grid">
                            <label>Precio
                                <input name="price" type="text" required>
                            </label>
                            <label>Marca
                                <input name="brand" type="text">
                            </label>
                        </div>
                        <div class="admin-form-grid">
                            <label>Imagen
                                <input name="image" type="text" required>
                            </label>
                            <label>Categorías separadas por coma
                                <input name="categories" type="text" required>
                            </label>
                        </div>
                        <label>Descripción corta
                            <textarea name="shortDescription" rows="2"></textarea>
                        </label>
                        <label>Descripción completa
                            <textarea name="description" rows="4"></textarea>
                        </label>
                        <div class="admin-form-grid">
                            <label>Especificaciones, una por línea
                                <textarea name="specs" rows="4"></textarea>
                            </label>
                            <label>Beneficios, uno por línea
                                <textarea name="features" rows="4"></textarea>
                            </label>
                        </div>
                        <label class="admin-checkbox">
                            <input name="available" type="checkbox"> Disponible
                        </label>
                        <div class="admin-form-grid compact">
                            <label class="admin-checkbox">
                                <input name="isNew" type="checkbox"> Nuevo
                            </label>
                            <label class="admin-checkbox">
                                <input name="onSale" type="checkbox"> Oferta
                            </label>
                            <label class="admin-checkbox">
                                <input name="bestSeller" type="checkbox"> Destacado en filtros
                            </label>
                        </div>
                        <div class="admin-form-actions">
                            <button class="primary-button" type="submit">Guardar producto</button>
                        </div>
                        <div class="admin-form-message" id="productEditMessage"></div>
                    </form>
                </div>
            </div>
        `;
    }

    function renderCategoriesAdmin() {
        const counts = {};
        getProducts().forEach(product => (product.categories || []).forEach(category => {
            counts[category] = (counts[category] || 0) + 1;
        }));

        const rows = Object.entries(counts)
            .sort((a, b) => formatCategory(a[0]).localeCompare(formatCategory(b[0])))
            .map(([category, count]) => `
                <tr><td>${formatCategory(category)}</td><td><code>${category}</code></td><td>${count}</td></tr>
            `).join('');

        return `
            <section class="admin-panel">
                <h2>Categorías</h2>
                <p>Categorías detectadas desde la base de datos.</p>
                <table class="admin-table">
                    <thead><tr><th>Nombre</th><th>Slug</th><th>Productos</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>
        `;
    }

    function renderBrandsAdmin() {
        const counts = {};
        getProducts().forEach(product => {
            const brand = getBrandName(product);
            counts[brand] = (counts[brand] || 0) + 1;
        });

        const rows = Object.entries(counts)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([brand, count]) => `<tr><td>${brand}</td><td>${count}</td></tr>`)
            .join('');

        return `
            <section class="admin-panel">
                <h2>Marcas</h2>
                <p>Marcas generadas desde los productos existentes.</p>
                <table class="admin-table">
                    <thead><tr><th>Marca</th><th>Productos</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>
        `;
    }

    function renderProductIdList(title, ids, description) {
        const rows = ids.map((id, index) => {
            const product = productById(id);
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${product ? `<img class="admin-thumb" src="${product.image}" alt="">` : ''}</td>
                    <td>${product ? product.name : 'Producto no encontrado'}</td>
                    <td><code>${id}</code></td>
                    <td>${product ? product.price : 'Revisar ID'}</td>
                </tr>
            `;
        }).join('');

        return `
            <section class="admin-panel">
                <h2>${title}</h2>
                <p>${description}</p>
                <table class="admin-table">
                    <thead><tr><th>#</th><th>Imagen</th><th>Producto</th><th>ID</th><th>Precio</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>
        `;
    }

    function renderProductIdEditor(title, fieldName, description) {
        const ids = adminContent[fieldName] || [];
        return `
            ${renderProductIdList(title, ids, description)}
            <section class="admin-panel">
                <h2>Editar ${title.toLowerCase()}</h2>
                <form class="admin-form admin-content-form" data-content-type="${fieldName}">
                    <label>IDs de productos, uno por línea
                        <textarea name="ids" rows="10">${ids.join('\n')}</textarea>
                    </label>
                    <div class="admin-form-actions">
                        <button class="primary-button" type="submit">Guardar</button>
                    </div>
                    <div class="admin-form-message"></div>
                </form>
            </section>
        `;
    }

    function renderQuotesAdmin() {
        const quotes = adminQuotes;
        const rows = quotes.map(quote => `
            <tr>
                <td>${new Date(quote.timestamp).toLocaleString()}</td>
                <td>${quote.productName}</td>
                <td><code>${quote.productId}</code></td>
                <td>${quote.source || 'Catálogo'}</td>
            </tr>
        `).join('');

        return `
            <section class="admin-panel">
                <h2>Cotizaciones</h2>
                <p>Se registran cuando un cliente toca “Cotizar” en el catálogo o detalle.</p>
                ${quotes.length ? `
                    <table class="admin-table">
                        <thead><tr><th>Fecha</th><th>Producto</th><th>ID</th><th>Origen</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                ` : '<p>No hay cotizaciones registradas todavía.</p>'}
            </section>
        `;
    }

    function renderUltraSoftList(title, items) {
        return `
            <section class="admin-panel">
                <h2>${title}</h2>
                <div class="admin-list">
                    ${items.map(item => `<div class="admin-list-item">${item}</div>`).join('')}
                </div>
                <form class="admin-form admin-content-form" data-content-type="ultrasoft-list" data-list-key="${getUltraSoftKeyByTitle(title)}">
                    <label>Editar lista, un elemento por línea
                        <textarea name="items" rows="8">${items.join('\n')}</textarea>
                    </label>
                    <div class="admin-form-actions">
                        <button class="primary-button" type="submit">Guardar</button>
                    </div>
                    <div class="admin-form-message"></div>
                </form>
            </section>
        `;
    }

    function getUltraSoftKeyByTitle(title) {
        if (title === 'Servicios') return 'servicios';
        if (title === 'Soluciones / Sistemas') return 'soluciones';
        return 'paquetes';
    }

    function renderUltraSoftRequests() {
        const requests = adminRequests;
        const rows = requests.map(request => `
            <tr>
                <td>${new Date(request.created_at).toLocaleString()}</td>
                <td>${request.name}</td>
                <td>${request.email}</td>
                <td>${request.phone}</td>
                <td>${request.service}</td>
                <td>${escapeHtml(request.message || '')}</td>
                <td>
                    <select class="request-status" data-id="${request.id}">
                        ${['nuevo', 'contactado', 'cerrado'].map(status => `<option value="${status}"${request.admin_status === status ? ' selected' : ''}>${status}</option>`).join('')}
                    </select>
                    <textarea class="request-notes" data-id="${request.id}" placeholder="Notas internas">${escapeHtml(request.admin_notes || '')}</textarea>
                    <button class="admin-link request-save" data-id="${request.id}" type="button">Guardar</button>
                    <button class="admin-link request-delete" data-id="${request.id}" type="button">Eliminar</button>
                </td>
            </tr>
        `).join('');

        return `
            <section class="admin-panel">
                <h2>Solicitudes de clientes</h2>
                <p>Solicitudes guardadas permanentemente en MySQL.</p>
                ${requests.length ? `
                    <table class="admin-table">
                        <thead><tr><th>Fecha</th><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Servicio</th><th>Mensaje</th><th>Seguimiento</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                ` : '<p>No hay solicitudes registradas todavía.</p>'}
            </section>
        `;
    }

    function renderLeadsAdmin() {
        const quotes = adminQuotes;
        const requests = adminRequests;
        return `
            <div class="admin-grid">
                <div class="admin-card"><span>Cotizaciones ULTRACOMP</span><strong>${quotes.length}</strong></div>
                <div class="admin-card"><span>Solicitudes ULTRASOFT</span><strong>${requests.length}</strong></div>
            </div>
            ${renderQuotesAdmin()}
            ${renderUltraSoftRequests()}
        `;
    }

    function renderAuditAdmin() {
        return `<section class="admin-panel">
            <h2>Historial administrativo</h2>
            <p>Últimas acciones registradas por el sistema.</p>
            <table class="admin-table">
                <thead><tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>ID</th><th>Detalles</th></tr></thead>
                <tbody>${adminAudit.map(item => `<tr>
                    <td>${new Date(item.createdAt).toLocaleString()}</td>
                    <td>${item.action}</td><td>${item.entity || ''}</td><td>${item.entityId || ''}</td>
                    <td><code>${JSON.stringify(item.details || {}).slice(0, 180)}</code></td>
                </tr>`).join('')}</tbody>
            </table>
        </section>`;
    }

    function renderConfigAdmin() {
        const settings = adminContent.settings;
        return `
            <section class="admin-panel">
                <h2>Configuración</h2>
                ${settings.whatsapp ? '' : '<div class="admin-note warning"><strong>WhatsApp no configurado:</strong> agrega el número real con código de país para activar los botones públicos.</div>'}
                <form class="admin-form admin-content-form" data-content-type="settings">
                    <label>WhatsApp general <input name="whatsapp" value="${settings.whatsapp || ''}" placeholder="8095726552"></label>
                    <label>WhatsApp ULTRACOMP <input name="ultracompWhatsapp" value="${settings.ultracompWhatsapp || settings.whatsapp || ''}" placeholder="8095726552"></label>
                    <label>WhatsApp ULTRASOFT <input name="ultrasoftWhatsapp" value="${settings.ultrasoftWhatsapp || settings.whatsapp || ''}" placeholder="8095726552"></label>
                    <label>Email <input name="email" value="${settings.email || ''}"></label>
                    <label>Logo <input name="logo" value="${settings.logo || ''}"></label>
                    <label>Favicon <input name="favicon" value="${settings.favicon || ''}"></label>
                    <label>Datos de empresa <input name="company" value="${settings.company || ''}"></label>
                    <label>Dirección <input name="address" value="${settings.address || ''}"></label>
                    <label>Horario <input name="schedule" value="${settings.schedule || ''}"></label>
                    <label>Instagram <input name="instagram" value="${settings.instagram || ''}"></label>
                    <label>Facebook <input name="facebook" value="${settings.facebook || ''}"></label>
                    <label>LinkedIn <input name="linkedin" value="${settings.linkedin || ''}"></label>
                    <label>Copyright <input name="copyright" value="${settings.copyright || ''}"></label>
                    <div class="admin-form-actions">
                        <button class="primary-button" type="submit">Guardar configuración</button>
                    </div>
                    <div class="admin-form-message"></div>
                </form>
                <div class="admin-form-actions">
                    <a class="primary-button" href="/api/admin/backup">Descargar respaldo completo</a>
                </div>
                ${renderStatusNote()}
            </section>
        `;
    }

    function renderLicenseAdmin() {
        const settings = adminContent.settings || {};
        const siteStatus = settings.siteStatus || 'active';
        return `
            <section class="admin-panel">
                <h2>Licencia / Estado del sitio</h2>
                <p>Esta sección solo aparece para el usuario owner. Permite pausar la parte pública del sitio sin afectar el acceso al panel.</p>
                <div class="admin-note warning">
                    <strong>Uso recomendado:</strong> utiliza “Mantenimiento” para ajustes técnicos y “Suspendido” solo cuando el contrato/servicio lo permita.
                </div>
                <form class="admin-form admin-content-form" data-content-type="license">
                    <label>Estado del sitio
                        <select name="siteStatus">
                            <option value="active" ${siteStatus === 'active' ? 'selected' : ''}>Activo</option>
                            <option value="maintenance" ${siteStatus === 'maintenance' ? 'selected' : ''}>Mantenimiento</option>
                            <option value="suspended" ${siteStatus === 'suspended' ? 'selected' : ''}>Suspendido</option>
                        </select>
                    </label>
                    <label>Título de pantalla
                        <input name="siteStatusTitle" value="${escapeHtml(settings.siteStatusTitle || '')}" placeholder="Servicio temporalmente no disponible">
                    </label>
                    <label>Mensaje público
                        <textarea name="siteStatusMessage" rows="4" placeholder="Estamos realizando ajustes. Volveremos pronto.">${escapeHtml(settings.siteStatusMessage || '')}</textarea>
                    </label>
                    <div class="admin-form-actions">
                        <button class="primary-button" type="submit">Guardar estado</button>
                        <a class="admin-link" href="/" target="_blank">Ver sitio público</a>
                    </div>
                    <div class="admin-form-message"></div>
                </form>
            </section>
        `;
    }

    function renderLandingContent() {
        const landing = (adminContent.ultrasoft && adminContent.ultrasoft.landing) || {};
        const ultrasoft = adminContent.ultrasoft || {};
        return `
            <section class="admin-panel">
                <h2>Contenido de la landing</h2>
                <p>Contenido principal conectado desde la administración.</p>
                <form class="admin-form admin-content-form" data-content-type="landing">
                    <label>Título principal <input name="heroTitle" value="${landing.heroTitle || ''}"></label>
                    <label>Subtítulo <textarea name="heroSubtitle" rows="3">${landing.heroSubtitle || ''}</textarea></label>
                    <label>Texto del botón <input name="cta" value="${landing.cta || ''}"></label>
                    <label>Desafíos: Emoji | Título | Descripción
                        <textarea name="challenges" rows="10">${escapeHtml((ultrasoft.challenges || []).join('\n'))}</textarea>
                    </label>
                    <label>Proceso: Título | Descripción
                        <textarea name="workflow" rows="10">${escapeHtml((ultrasoft.workflow || []).join('\n'))}</textarea>
                    </label>
                    <label>Ventajas, una por línea
                        <textarea name="advantages" rows="7">${escapeHtml((ultrasoft.advantages || []).join('\n'))}</textarea>
                    </label>
                    <div class="admin-form-actions">
                        <button class="primary-button" type="submit">Guardar contenido</button>
                    </div>
                    <div class="admin-form-message"></div>
                </form>
            </section>
        `;
    }

    function renderUltracompContent() {
        const ultracomp = adminContent.ultracomp || {};
        const landing = ultracomp.landing || {};
        return `<section class="admin-panel">
            <h2>Inicio de ULTRACOMP</h2>
            <form class="admin-form admin-content-form" data-content-type="ultracomp-landing">
                <label>Título principal <input name="heroTitle" value="${escapeHtml(landing.heroTitle || '')}"></label>
                <label>Descripción <textarea name="heroSubtitle" rows="3">${escapeHtml(landing.heroSubtitle || '')}</textarea></label>
                <div class="admin-form-grid">
                    <label>Botón principal <input name="primaryCta" value="${escapeHtml(landing.primaryCta || '')}"></label>
                    <label>Botón secundario <input name="secondaryCta" value="${escapeHtml(landing.secondaryCta || '')}"></label>
                </div>
                <label>Beneficios: Emoji | Título | Descripción
                    <textarea name="benefits" rows="9">${escapeHtml((ultracomp.benefits || []).join('\n'))}</textarea>
                </label>
                <div class="admin-form-actions"><button class="primary-button" type="submit">Guardar inicio</button></div>
                <div class="admin-form-message"></div>
            </form>
        </section>`;
    }

    function renderSeoAdmin() {
        const seo = adminContent.seo || {};
        return `<section class="admin-panel">
            <h2>SEO y vista al compartir</h2>
            <form class="admin-form admin-content-form" data-content-type="seo">
                <label>Título ULTRACOMP <input name="ultracompTitle" value="${escapeHtml(seo.ultracompTitle || '')}"></label>
                <label>Descripción ULTRACOMP <textarea name="ultracompDescription">${escapeHtml(seo.ultracompDescription || '')}</textarea></label>
                <label>Título ULTRASOFT <input name="ultrasoftTitle" value="${escapeHtml(seo.ultrasoftTitle || '')}"></label>
                <label>Descripción ULTRASOFT <textarea name="ultrasoftDescription">${escapeHtml(seo.ultrasoftDescription || '')}</textarea></label>
                <label>Imagen social <input name="socialImage" value="${escapeHtml(seo.socialImage || '')}" placeholder="/IMAGENES/imagen.jpg"></label>
                <div class="admin-form-actions"><button class="primary-button" type="submit">Guardar SEO</button></div>
                <div class="admin-form-message"></div>
            </form>
            <p><a class="admin-link" href="/sitemap.xml" target="_blank">Ver sitemap</a> <a class="admin-link" href="/robots.txt" target="_blank">Ver robots.txt</a></p>
        </section>`;
    }

    function renderMediaAdmin() {
        return `<section class="admin-panel">
            <div class="admin-panel-header"><div><h2>Biblioteca multimedia</h2><p>${adminMedia.length} imágenes disponibles.</p></div></div>
            <form id="mediaUploadForm" class="admin-form">
                <label>Subir imagen <input type="file" name="image" accept="image/png,image/jpeg,image/webp" required></label>
                <div class="admin-form-actions"><button class="primary-button" type="submit">Subir</button></div>
                <div class="admin-form-message"></div>
            </form>
            <div class="admin-media-grid">${adminMedia.map(file => `
                <article class="admin-media-item">
                    <img src="${file.url}" alt="">
                    <input value="${file.url}" readonly>
                    <small>${Math.ceil(file.size / 1024)} KB</small>
                    <button class="admin-link media-copy" data-url="${file.url}" type="button">Copiar ruta</button>
                    <button class="admin-link media-delete" data-name="${encodeURIComponent(file.name)}" type="button">Eliminar</button>
                </article>`).join('')}</div>
        </section>`;
    }

    function renderUsersAdmin() {
        const ownerRoleOption = adminRole === 'owner' ? '<option value="owner">Owner</option>' : '';
        return `<section class="admin-panel">
            <h2>Administradores</h2>
            <form id="adminUserForm" class="admin-form">
                <div class="admin-form-grid">
                    <label>Nombre <input name="name" required></label>
                    <label>Correo <input name="email" type="email" required></label>
                    <label>Contraseña <input name="password" type="password" minlength="10" required></label>
                    <label>Rol <select name="role"><option value="editor">Editor</option><option value="ventas">Ventas</option><option value="superadmin">Superadmin</option>${ownerRoleOption}</select></label>
                </div>
                <button class="primary-button" type="submit">Crear administrador</button>
                <div class="admin-form-message"></div>
            </form>
            <table class="admin-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Último acceso</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>${adminUsers.map(user => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>${user.role}</td>
                <td>${user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Nunca'}</td>
                <td>${user.active ? 'Activo' : 'Desactivado'}</td>
                <td><button class="admin-link user-toggle" data-id="${user.id}" data-active="${user.active ? 0 : 1}" type="button">${user.active ? 'Desactivar' : 'Activar'}</button>
                <button class="admin-link user-password" data-id="${user.id}" type="button">Cambiar clave</button></td></tr>`).join('')}</tbody></table>
        </section>`;
    }

    function renderBackupsAdmin() {
        return `<section class="admin-panel">
            <h2>Respaldos y restauración</h2>
            <div class="admin-note"><strong>Importante:</strong> descarga también una copia de la carpeta configurada como UPLOAD_DIR. El JSON contiene los datos y rutas.</div>
            <p><a class="primary-button" href="/api/admin/backup">Descargar respaldo de datos</a></p>
            <form id="restoreBackupForm" class="admin-form">
                <label>Restaurar archivo JSON <input type="file" name="backup" accept="application/json,.json" required></label>
                <button class="primary-button" type="submit">Restaurar respaldo</button>
                <div class="admin-form-message"></div>
            </form>
        </section>`;
    }

    function renderAdvancedContent() {
        return `<section class="admin-panel">
            <h2>Editor avanzado del contenido</h2>
            <p>Permite modificar cualquier bloque persistente. Úsalo con cuidado y descarga un respaldo antes.</p>
            <form class="admin-form admin-content-form" data-content-type="advanced-json">
                <textarea name="json" rows="28">${escapeHtml(JSON.stringify(adminContent, null, 2))}</textarea>
                <button class="primary-button" type="submit">Guardar contenido completo</button>
                <div class="admin-form-message"></div>
            </form>
        </section>`;
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function renderFaqAdmin() {
        const faqs = (adminContent.ultrasoft && adminContent.ultrasoft.faqs) || [];
        return `
            <section class="admin-panel">
                <h2>Preguntas frecuentes</h2>
                <p>Escribe una pregunta y su respuesta por línea, separadas con el carácter <code>|</code>.</p>
                <form class="admin-form admin-content-form" data-content-type="faqs">
                    <label>Preguntas y respuestas
                        <textarea name="items" rows="16">${escapeHtml(faqs.map(item => `${item.question} | ${item.answer}`).join('\n'))}</textarea>
                    </label>
                    <div class="admin-form-actions"><button class="primary-button" type="submit">Guardar preguntas</button></div>
                    <div class="admin-form-message"></div>
                </form>
            </section>`;
    }

    function renderTestimonialsAdmin() {
        const testimonials = adminContent.testimonials || {};
        return `
            <section class="admin-panel">
                <h2>Testimonios públicos</h2>
                <p>Un testimonio por línea: <code>Emoji | Nombre | Cargo | Empresa | Calificación | Comentario</code>.</p>
                ${['ultracomp', 'ultrasoft'].map(brand => `
                    <form class="admin-form admin-content-form" data-content-type="testimonials" data-brand="${brand}">
                        <h3>${brand.toUpperCase()}</h3>
                        <textarea name="items" rows="12">${escapeHtml((testimonials[brand] || []).map(item =>
                            `${item.avatar || '👤'} | ${item.name} | ${item.role} | ${item.company} | ${item.rating} | ${item.reviewText}`
                        ).join('\n'))}</textarea>
                        <div class="admin-form-actions"><button class="primary-button" type="submit">Guardar ${brand}</button></div>
                        <div class="admin-form-message"></div>
                    </form>
                `).join('')}
            </section>`;
    }

    function renderRouteContent(route) {
        switch (route.path) {
            case '/admin/':
                return renderDashboard();
            case '/admin/productos/':
                return window.UltraMysqlProductsAdmin ? window.UltraMysqlProductsAdmin.render() : renderProductsAdmin();
            case '/admin/categorias/':
                return window.UltraTaxonomyAdmin ? window.UltraTaxonomyAdmin.render() : renderCategoriesAdmin();
            case '/admin/marcas/':
                return window.UltraTaxonomyAdmin ? window.UltraTaxonomyAdmin.render() : renderBrandsAdmin();
            case '/admin/banners/':
                return renderProductIdEditor('Banners', 'bannerProductIds', 'Productos conectados al carrusel principal de ULTRACOMP.');
            case '/admin/destacados/':
                return renderProductIdEditor('Productos destacados', 'featuredProductIds', 'Productos conectados a la sección de destacados de ULTRACOMP.');
            case '/admin/cotizaciones/':
                return window.UltraQuotesMysqlAdmin ? window.UltraQuotesMysqlAdmin.render() : renderQuotesAdmin();
            case '/admin/ultracomp/contenido/':
                return renderUltracompContent();
            case '/admin/ultrasoft/servicios/':
                return renderUltraSoftList('Servicios', adminContent.ultrasoft.servicios || []);
            case '/admin/ultrasoft/soluciones/':
                return renderUltraSoftList('Soluciones / Sistemas', adminContent.ultrasoft.soluciones || []);
            case '/admin/ultrasoft/paquetes/':
                return renderUltraSoftList('Planes o paquetes', adminContent.ultrasoft.paquetes || []);
            case '/admin/ultrasoft/solicitudes/':
                return renderUltraSoftRequests();
            case '/admin/ultrasoft/contenido/':
                return renderLandingContent();
            case '/admin/ultrasoft/preguntas/':
                return renderFaqAdmin();
            case '/admin/testimonios/':
                return renderTestimonialsAdmin();
            case '/admin/leads/':
                return renderLeadsAdmin();
            case '/admin/auditoria/':
                return renderAuditAdmin();
            case '/admin/medios/':
                return renderMediaAdmin();
            case '/admin/usuarios/':
                return renderUsersAdmin();
            case '/admin/seo/':
                return renderSeoAdmin();
            case '/admin/respaldos/':
                return renderBackupsAdmin();
            case '/admin/licencia/':
                return adminRole === 'owner' ? renderLicenseAdmin() : renderForbiddenAdmin();
            case '/admin/configuracion/':
                return renderConfigAdmin() + (adminRole === 'owner' ? renderAdvancedContent() : '');
            default:
                return renderPlaceholder(route);
        }
    }

    function renderForbiddenAdmin() {
        return `
            <section class="admin-panel admin-placeholder">
                <h2>Acceso restringido</h2>
                <p>Esta sección solo está disponible para el usuario owner del proyecto.</p>
            </section>
        `;
    }

    function renderPlaceholder(route) {
        return `
            <section class="admin-panel admin-placeholder">
                <h2>${route.label}</h2>
                <p>Sección preparada para el panel administrativo.</p>
                <p>${data.database.message}</p>
            </section>
        `;
    }

    function renderAdmin() {
        const root = document.getElementById('adminApp');
        if (!root) return;

        protectAdminRoute();
        if (!hasSession()) return;

        const currentRoute = getCurrentRoute();
        if (adminRole === 'owner' && currentRoute.path === '/admin/' && window.location.pathname !== (data.ownerPath || '/owner/')) {
            redirect(getDefaultAdminPath());
            return;
        }
        const content = renderRouteContent(currentRoute);

        document.title = `${currentRoute.label} - Admin Ultra`;
        root.innerHTML = `
            <div class="admin-shell">
                <aside class="admin-sidebar">
                    <div class="admin-brand">
                        <div class="brand-mark">UA</div>
                        <div>
                            <strong>Admin Ultra</strong>
                            <span>ULTRACOMP / ULTRASOFT</span>
                        </div>
                    </div>
                    <nav class="admin-nav">${renderNav(currentRoute)}</nav>
                </aside>
                <main class="admin-main">
                    <header class="admin-topbar">
                        <div>
                            <h1>${currentRoute.label}</h1>
                            <p>Panel administrativo protegido y conectado a MySQL. ${adminRole === 'owner' ? '<span class="owner-mode-badge">Modo Owner</span>' : ''}</p>
                        </div>
                        <button class="logout-button" id="logoutButton" type="button">Cerrar sesión</button>
                    </header>
                    ${content}
                </main>
            </div>
        `;

        const logoutButton = document.getElementById('logoutButton');

        if (logoutButton) {
            logoutButton.addEventListener('click', async function () {
                await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
                localStorage.removeItem(sessionKey);
                sessionStorage.removeItem('ultraAdminRole');
                window.location.href = '/';
            });
        }

        if (currentRoute.path === '/admin/productos/' && window.UltraMysqlProductsAdmin) { window.UltraMysqlProductsAdmin.init(); }
        if (currentRoute.path === '/admin/cotizaciones/' && window.UltraQuotesMysqlAdmin) { window.UltraQuotesMysqlAdmin.init(); }
        if ((currentRoute.path === '/admin/categorias/' || currentRoute.path === '/admin/marcas/') && window.UltraTaxonomyAdmin) { window.UltraTaxonomyAdmin.init(); }
        bindProductEditor();
        bindContentForms();
        bindSyncProducts();
        bindOperations();
        document.querySelectorAll('.request-status').forEach(select => {
            select.addEventListener('change', async () => {
                await fetch(`/api/admin/contact-requests/${select.dataset.id}`, {
                    method: 'PATCH',
                    headers: adminHeaders(),
                    body: JSON.stringify({ status: select.value })
                });
            });
        });
        document.querySelectorAll('.request-save').forEach(button => button.addEventListener('click', async () => {
            const id = button.dataset.id;
            const status = document.querySelector(`.request-status[data-id="${id}"]`).value;
            const notes = document.querySelector(`.request-notes[data-id="${id}"]`).value;
            await fetch(`/api/admin/contact-requests/${id}`, {
                method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ status, notes })
            });
            button.textContent = 'Guardado';
        }));
        document.querySelectorAll('.request-delete').forEach(button => button.addEventListener('click', async () => {
            if (!confirm('¿Eliminar esta solicitud?')) return;
            await fetch(`/api/admin/contact-requests/${button.dataset.id}`, { method: 'DELETE' });
            await loadRequestsAndAudit();
            renderAdmin();
        }));
    }

    function splitLines(value) {
        return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    }

    function sanitizePhone(value) {
        return String(value || '').replace(/[^\d]/g, '');
    }

    function productFromForm(form, original = {}) {
        return {
            ...original,
            id: form.id.value.trim(),
            name: form.name.value.trim(),
            price: form.price.value.trim(),
            brand: form.brand.value.trim(),
            image: form.image.value.trim(),
            categories: form.categories.value.split(',').map(item => item.trim()).filter(Boolean),
            shortDescription: form.shortDescription.value.trim(),
            description: form.description.value.trim(),
            specs: splitLines(form.specs.value),
            shortSpecs: splitLines(form.specs.value).slice(0, 4),
            features: splitLines(form.features.value),
            available: form.available.checked,
            isNew: form.isNew.checked,
            onSale: form.onSale.checked,
            bestSeller: form.bestSeller.checked
        };
    }

    function downloadTextFile(filename, text) {
        const blob = new Blob([text], { type: 'application/javascript;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function bindSyncProducts() {
        const button = document.getElementById('syncProductsButton');
        const message = document.getElementById('syncProductsMessage');
        if (!button || !message) return;

        button.addEventListener('click', async () => {
            message.textContent = 'Sincronizando...';
            try {
                const response = await fetch('/api/admin/sync-products', {
                    method: 'POST',
                    headers: adminHeaders()
                });
                if (!response.ok) throw new Error('No se pudo sincronizar');
                const payload = await response.json();
                message.textContent = `Base actualizada: ${payload.count} productos. Nuevos insertados: ${payload.inserted}.`;
                message.className = 'admin-form-message success';
                await loadProductsFromApi();
                setTimeout(() => renderAdmin(), 500);
            } catch (error) {
                message.textContent = error.message;
                message.className = 'admin-form-message error';
            }
        });
    }

    function bindContentForms() {
        document.querySelectorAll('.admin-content-form').forEach(form => {
            form.addEventListener('submit', async event => {
                event.preventDefault();
                const message = form.querySelector('.admin-form-message');
                message.textContent = 'Guardando...';
                message.className = 'admin-form-message';

                try {
                    const type = form.dataset.contentType;
                    let payload = {};

                    if (type === 'bannerProductIds' || type === 'featuredProductIds') {
                        payload[type] = form.ids.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
                    }

                    if (type === 'ultrasoft-list') {
                        const key = form.dataset.listKey;
                        payload = {
                            ultrasoft: {
                                [key]: form.items.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
                            }
                        };
                    }

                    if (type === 'settings') {
                        payload = {
                            settings: {
                                whatsapp: sanitizePhone(form.whatsapp.value),
                                ultracompWhatsapp: sanitizePhone(form.ultracompWhatsapp.value),
                                ultrasoftWhatsapp: sanitizePhone(form.ultrasoftWhatsapp.value),
                                email: form.email.value.trim(),
                                logo: form.logo.value.trim(),
                                favicon: form.favicon.value.trim(),
                                company: form.company.value.trim(),
                                address: form.address.value.trim(),
                                schedule: form.schedule.value.trim(),
                                instagram: form.instagram.value.trim(),
                                facebook: form.facebook.value.trim(),
                                linkedin: form.linkedin.value.trim(),
                                copyright: form.copyright.value.trim()
                            }
                        };
                    }

                    if (type === 'license') {
                        const response = await fetch('/api/admin/license', {
                            method: 'PUT',
                            headers: adminHeaders(),
                            body: JSON.stringify({
                                status: form.siteStatus.value,
                                title: form.siteStatusTitle.value.trim(),
                                message: form.siteStatusMessage.value.trim()
                            })
                        });
                        const result = await response.json().catch(() => ({}));
                        if (!response.ok) throw new Error(result.message || 'No se pudo guardar el estado del sitio');
                        adminContent.settings = {
                            ...adminContent.settings,
                            ...(result.settings || {})
                        };
                        message.textContent = 'Estado actualizado correctamente.';
                        message.className = 'admin-form-message success';
                        return;
                    }

                    if (type === 'landing') {
                        payload = {
                            ultrasoft: {
                                landing: {
                                    heroTitle: form.heroTitle.value.trim(),
                                    heroSubtitle: form.heroSubtitle.value.trim(),
                                    cta: form.cta.value.trim()
                                },
                                challenges: splitLines(form.challenges.value),
                                workflow: splitLines(form.workflow.value),
                                advantages: splitLines(form.advantages.value)
                            }
                        };
                    }

                    if (type === 'ultracomp-landing') {
                        payload = {
                            ultracomp: {
                                landing: {
                                    heroTitle: form.heroTitle.value.trim(),
                                    heroSubtitle: form.heroSubtitle.value.trim(),
                                    primaryCta: form.primaryCta.value.trim(),
                                    secondaryCta: form.secondaryCta.value.trim()
                                },
                                benefits: splitLines(form.benefits.value)
                            }
                        };
                    }

                    if (type === 'seo') {
                        payload = { seo: {
                            ultracompTitle: form.ultracompTitle.value.trim(),
                            ultracompDescription: form.ultracompDescription.value.trim(),
                            ultrasoftTitle: form.ultrasoftTitle.value.trim(),
                            ultrasoftDescription: form.ultrasoftDescription.value.trim(),
                            socialImage: form.socialImage.value.trim()
                        } };
                    }

                    if (type === 'advanced-json') {
                        try {
                            payload = JSON.parse(form.json.value);
                        } catch {
                            throw new Error('El JSON no es válido.');
                        }
                    }

                    if (type === 'faqs') {
                        const faqs = splitLines(form.items.value).map(line => {
                            const separator = line.indexOf('|');
                            if (separator < 1) throw new Error('Cada línea debe contener: Pregunta | Respuesta');
                            return {
                                question: line.slice(0, separator).trim(),
                                answer: line.slice(separator + 1).trim()
                            };
                        }).filter(item => item.question && item.answer);
                        if (!faqs.length) throw new Error('Agrega al menos una pregunta válida.');
                        payload = { ultrasoft: { faqs } };
                    }

                    if (type === 'testimonials') {
                        const brand = form.dataset.brand;
                        const items = splitLines(form.items.value).map((line, index) => {
                            const parts = line.split('|').map(part => part.trim());
                            if (parts.length < 6) throw new Error(`Línea ${index + 1}: faltan datos separados por |`);
                            const rating = Number(parts[4]);
                            if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
                                throw new Error(`Línea ${index + 1}: la calificación debe estar entre 1 y 5.`);
                            }
                            return {
                                id: index + 1,
                                avatar: parts[0] || '👤',
                                name: parts[1],
                                role: parts[2],
                                company: parts[3],
                                rating,
                                reviewText: parts.slice(5).join(' | ')
                            };
                        });
                        if (!items.length) throw new Error('Agrega al menos un testimonio.');
                        payload = { testimonials: { [brand]: items } };
                    }

                    await saveContent(payload);
                    message.textContent = 'Guardado correctamente.';
                    message.classList.add('success');
                    setTimeout(() => renderAdmin(), 450);
                } catch (error) {
                    message.textContent = error.message;
                    message.classList.add('error');
                }
            });
        });
    }

    function bindOperations() {
        const mediaForm = document.getElementById('mediaUploadForm');
        if (mediaForm) mediaForm.addEventListener('submit', async event => {
            event.preventDefault();
            const message = mediaForm.querySelector('.admin-form-message');
            const data = new FormData();
            data.append('image', mediaForm.image.files[0]);
            message.textContent = 'Subiendo...';
            const response = await fetch('/api/admin/media/upload', { method: 'POST', body: data });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) { message.textContent = payload.message || 'No se pudo subir.'; message.className = 'admin-form-message error'; return; }
            await loadRequestsAndAudit();
            renderAdmin();
        });
        document.querySelectorAll('.media-copy').forEach(button => button.addEventListener('click', async () => {
            await navigator.clipboard.writeText(button.dataset.url);
            button.textContent = 'Copiada';
        }));
        document.querySelectorAll('.media-delete').forEach(button => button.addEventListener('click', async () => {
            if (!confirm('¿Eliminar definitivamente esta imagen?')) return;
            const response = await fetch(`/api/admin/media/${button.dataset.name}`, { method: 'DELETE' });
            if (!response.ok) return alert('No se pudo eliminar.');
            await loadRequestsAndAudit();
            renderAdmin();
        }));

        const userForm = document.getElementById('adminUserForm');
        if (userForm) userForm.addEventListener('submit', async event => {
            event.preventDefault();
            const message = userForm.querySelector('.admin-form-message');
            const response = await fetch('/api/admin/users', {
                method: 'POST', headers: adminHeaders(),
                body: JSON.stringify({ name: userForm.name.value, email: userForm.email.value, password: userForm.password.value, role: userForm.role.value })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) { message.textContent = payload.message || 'No se pudo crear.'; message.className = 'admin-form-message error'; return; }
            await loadRequestsAndAudit();
            renderAdmin();
        });
        document.querySelectorAll('.user-toggle').forEach(button => button.addEventListener('click', async () => {
            await fetch(`/api/admin/users/${button.dataset.id}`, {
                method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ active: button.dataset.active === '1' })
            });
            await loadRequestsAndAudit();
            renderAdmin();
        }));
        document.querySelectorAll('.user-password').forEach(button => button.addEventListener('click', async () => {
            const password = prompt('Nueva contraseña (mínimo 10 caracteres):');
            if (!password) return;
            const response = await fetch(`/api/admin/users/${button.dataset.id}`, {
                method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ password })
            });
            const payload = await response.json().catch(() => ({}));
            alert(response.ok ? 'Contraseña actualizada.' : (payload.message || 'No se pudo actualizar.'));
        }));

        const restoreForm = document.getElementById('restoreBackupForm');
        if (restoreForm) restoreForm.addEventListener('submit', async event => {
            event.preventDefault();
            if (!confirm('Esta acción reemplazará los datos administrables actuales. ¿Continuar?')) return;
            const message = restoreForm.querySelector('.admin-form-message');
            try {
                const backup = JSON.parse(await restoreForm.backup.files[0].text());
                message.textContent = 'Restaurando...';
                const response = await fetch('/api/admin/restore', { method: 'POST', headers: adminHeaders(), body: JSON.stringify(backup) });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.message);
                message.textContent = `Restaurado: ${payload.restored.join(', ')}`;
                message.className = 'admin-form-message success';
            } catch (error) {
                message.textContent = error.message;
                message.className = 'admin-form-message error';
            }
        });
    }

    function bindProductEditor() {
        const modal = document.getElementById('productEditModal');
        const form = document.getElementById('productEditForm');
        if (!modal || !form) return;

        const message = document.getElementById('productEditMessage');
        const closeButton = document.getElementById('closeProductModal');
        const createButton = document.getElementById('createProductButton');
        const exportButton = document.getElementById('exportProductsButton');
        const modalTitle = document.getElementById('productModalTitle');

        function fillProductForm(product, mode) {
            form.reset();
            form.mode.value = mode;
            form.originalId.value = product.id || '';
            form.id.value = product.id || '';
            form.id.disabled = mode === 'edit';
            form.name.value = product.name || '';
            form.price.value = product.price || '';
            form.brand.value = product.brand || getBrandName(product);
            form.image.value = product.image || '';
            form.categories.value = (product.categories || []).join(', ');
            form.shortDescription.value = product.shortDescription || '';
            form.description.value = product.description || '';
            form.specs.value = (product.specs || product.shortSpecs || []).join('\n');
            form.features.value = (product.features || []).join('\n');
            form.available.checked = typeof product.available === 'boolean' ? product.available : true;
            form.isNew.checked = Boolean(product.isNew);
            form.onSale.checked = Boolean(product.onSale);
            form.bestSeller.checked = Boolean(product.bestSeller);
            modalTitle.textContent = mode === 'create' ? 'Crear producto' : 'Editar producto';
            message.textContent = '';
            message.className = 'admin-form-message';
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
        }

        if (createButton) {
            createButton.addEventListener('click', () => {
                fillProductForm({
                    id: '',
                    name: '',
                    price: '',
                    brand: '',
                    image: '/IMAGENES/',
                    categories: ['accessories'],
                    available: true
                }, 'create');
            });
        }

        if (exportButton) {
            exportButton.addEventListener('click', async () => {
                exportButton.textContent = 'Exportando...';
                try {
                    const response = await fetch('/api/admin/export-products', { headers: adminHeaders() });
                    if (!response.ok) throw new Error('La exportación estática está desactivada');
                    const payload = await response.json();
                    alert(payload.message || 'La exportación estática está desactivada.');
                } catch (error) {
                    alert(error.message);
                } finally {
                    exportButton.textContent = 'Exportación estática desactivada';
                }
            });
        }

        form.name.addEventListener('blur', () => {
            if (form.mode.value === 'create' && !form.id.value.trim()) {
                form.id.value = uniqueProductId(`${form.categories.value.split(',')[0] || 'producto'} ${form.brand.value} ${form.name.value}`);
            }
        });

        document.querySelectorAll('.admin-edit-product').forEach(button => {
            button.addEventListener('click', () => {
                const product = productById(button.dataset.productId);
                if (!product) return;
                fillProductForm(product, 'edit');
            });
        });

        document.querySelectorAll('.admin-delete-product').forEach(button => {
            button.addEventListener('click', async () => {
                const product = productById(button.dataset.productId);
                if (!product) return;
                if (!confirm(`¿Eliminar "${product.name}"?`)) return;

                try {
                    const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, {
                        method: 'DELETE',
                        headers: adminHeaders()
                    });
                    if (!response.ok) throw new Error('No se pudo eliminar el producto');
                    adminProducts = adminProducts.filter(item => item.id !== product.id);
                    window.ultracompProducts = adminProducts;
                    renderAdmin();
                } catch (error) {
                    alert(error.message);
                }
            });
        });

        closeButton.addEventListener('click', () => closeProductModal(modal));
        modal.addEventListener('click', event => {
            if (event.target === modal) closeProductModal(modal);
        });

        form.addEventListener('submit', async event => {
            event.preventDefault();
            const isCreate = form.mode.value === 'create';
            const original = isCreate ? {} : productById(form.originalId.value);
            if (!isCreate && !original) return;

            if (isCreate && !form.id.value.trim()) {
                form.id.value = uniqueProductId(`${form.categories.value.split(',')[0] || 'producto'} ${form.brand.value} ${form.name.value}`);
            }

            const updated = productFromForm(form, original);

            if (!updated.id || !updated.name) {
                message.textContent = 'ID y nombre son obligatorios.';
                message.className = 'admin-form-message error';
                return;
            }

            message.textContent = 'Guardando...';
            message.className = 'admin-form-message';

            try {
                const response = await fetch(isCreate ? '/api/products' : `/api/products/${encodeURIComponent(updated.id)}`, {
                    method: isCreate ? 'POST' : 'PUT',
                    headers: adminHeaders(),
                    body: JSON.stringify(updated)
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    throw new Error(payload.message || 'No se pudo guardar el producto');
                }

                const payload = await response.json();
                adminProducts = isCreate
                    ? adminProducts.concat(payload.product)
                    : adminProducts.map(product => product.id === updated.id ? payload.product : product);
                window.ultracompProducts = adminProducts;
                message.textContent = 'Producto guardado correctamente.';
                message.classList.add('success');

                setTimeout(() => renderAdmin(), 450);
            } catch (error) {
                message.textContent = error.message;
                message.classList.add('error');
            }
        });
    }

    function closeProductModal(modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    document.addEventListener('DOMContentLoaded', async function () {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            const authenticated = await validateSession();
            initLogin(authenticated);
            return;
        }

        const adminRoot = document.getElementById('adminApp');
        if (adminRoot && !await validateSession()) {
            window.location.href = data.loginPath;
            return;
        }
        if (adminRoot && hasSession()) {
            await loadProductsFromApi();
            await loadQuotesFromApi();
            await loadQuoteCartsFromApi();
            await loadContentFromApi();
            await loadRequestsAndAudit();
        }
        renderAdmin();
    });
})();

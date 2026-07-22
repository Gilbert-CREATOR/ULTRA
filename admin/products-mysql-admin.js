// Gestión de productos desde MySQL para el panel administrador
(function() {
    let mysqlProducts = [];
    let currentPage = 1;
    const pageSize = 100;
    let currentSearch = '';
    let currentAvailability = ''; // Admin: mostrar todos por defecto. El catálogo público sí filtra existencia.
    let currentIssue = '';
    let currentSort = 'created_desc';
    let editingProduct = null;
    let PRODUCT_BRANDS = [];
    let PRODUCT_CATEGORIES = [
        ['computers', 'Computadoras'], ['laptops', 'Laptops'], ['gaming', 'Gaming'],
        ['monitors', 'Monitores'], ['components', 'Componentes'], ['peripherals', 'Periféricos'],
        ['printers', 'Impresoras'], ['accessories', 'Accesorios'], ['adapters', 'Adaptadores'],
        ['supplies', 'Suministros'], ['inks', 'Tintas'], ['toners', 'Tóner'], ['network', 'Redes'],
        ['storage', 'Almacenamiento'], ['bags', 'Bultos'], ['office', 'Oficina'],
        ['stationery', 'Papelería'], ['cables', 'Cables'], ['chargers', 'Cargadores'],
        ['memory', 'Memorias'], ['hubs', 'Hubs'], ['lighting', 'Iluminación'],
        ['tablets', 'Tablets'], ['audio', 'Audio'], ['security', 'Seguridad y cámaras'],
        ['furniture', 'Mobiliario'], ['power', 'Energía y UPS'], ['pos', 'Punto de venta'],
        ['projectors', 'Proyectores'], ['tools', 'Herramientas'], ['servers', 'Servidores'],
        ['phones', 'Telefonía'], ['other', 'Otros']
    ];

    function adminHeaders() {
        return {
            'Content-Type': 'application/json'
        };
    }

    function parseAdminDecimal(value) {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        const raw = String(value).trim();
        if (!raw) return 0;
        const hasComma = raw.includes(',');
        const hasDot = raw.includes('.');
        const normalized = hasComma && !hasDot
            ? raw.replace(',', '.')
            : raw.replace(/,/g, '');
        const cleaned = normalized.replace(/[^0-9.-]/g, '');
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function ensureAdminSession(response) {
        if (response.status !== 401) return response;
        const sessionKey = window.ultraAdminData?.sessionKey || 'ultraAdminSession';
        localStorage.removeItem(sessionKey);
        sessionStorage.setItem('ultraAdminSessionMessage', 'Tu sesión venció. Inicia sesión nuevamente para continuar.');
        window.location.href = window.ultraAdminData?.loginPath || '/login/';
        throw new Error('Tu sesión administrativa venció.');
    }

    async function adminFetch(input, init) {
        const response = await fetch(input, init);
        return ensureAdminSession(response);
    }

    function renderCategoryOptions(selected = []) {
        const selectedSet = new Set(selected);
        return PRODUCT_CATEGORIES.map(([slug, label]) => `
            <label class="admin-checkbox">
                <input name="productCategories" type="checkbox" value="${slug}"${selectedSet.has(slug) ? ' checked' : ''}> ${label}
            </label>
        `).join('');
    }

    async function loadCategoryOptions() {
        const container = document.getElementById('mysqlProductCategoryOptions');
        if (!container) return;
        const selected = Array.from(container.querySelectorAll('input:checked')).map(input => input.value);
        const response = await adminFetch('/api/admin/categories');
        if (!response.ok) return;
        const payload = await response.json();
        PRODUCT_CATEGORIES = (payload.items || [])
            .filter(item => item.active)
            .map(item => [item.slug, item.name]);
        container.innerHTML = renderCategoryOptions(selected);
    }

    async function loadBrandOptions(selectedBrand = '') {
        const select = document.getElementById('mysqlProductBrand');
        if (!select) return;
        const response = await adminFetch('/api/admin/brands');
        if (!response.ok) return;
        const payload = await response.json();
        PRODUCT_BRANDS = (payload.items || []).filter(item => item.active);
        const selected = selectedBrand || select.value;
        select.innerHTML = '<option value="">Selecciona una marca</option>'
            + PRODUCT_BRANDS.map(item => `<option value="${item.name}"${item.name === selected ? ' selected' : ''}>${item.name}</option>`).join('');
    }

    async function loadMysqlProducts(search = '', page = 1) {
        try {
            const params = new URLSearchParams({
                search: search,
                page: page,
                limit: pageSize,
                availability: currentAvailability,
                issue: currentIssue,
                sort: currentSort
            });
            
            const response = await adminFetch(`/api/admin/products?${params}`, {
                headers: adminHeaders()
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al cargar productos');
            }
            
            const data = await response.json();
            mysqlProducts = data.products || [];
            currentPage = data.page || 1;
            
            return {
                products: mysqlProducts,
                total: data.total || 0,
                page: currentPage,
                hasMore: data.hasMore || false
            };
        } catch (error) {
            console.error('Error cargando productos MySQL:', error);
            throw error;
        }
    }

    async function loadProductsWithoutImage() {
        try {
            const response = await adminFetch('/api/admin/products/without-image', {
                headers: adminHeaders()
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al cargar productos sin imagen');
            }
            
            const data = await response.json();
            return data.products || [];
        } catch (error) {
            console.error('Error cargando productos sin imagen:', error);
            throw error;
        }
    }

    async function updateProduct(id, updates) {
        try {
            const response = await adminFetch(`/api/products/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: adminHeaders(),
                body: JSON.stringify(updates)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al actualizar producto');
            }
            
            const data = await response.json();
            return data.product;
        } catch (error) {
            console.error('Error actualizando producto:', error);
            throw error;
        }
    }

    async function createProduct(product) {
        const response = await adminFetch('/api/products', {
            method: 'POST',
            headers: adminHeaders(),
            body: JSON.stringify(product)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Error al crear producto');
        }

        const data = await response.json();
        return data.product;
    }

    async function softDeleteProduct(id) {
        try {
            const response = await adminFetch(`/api/admin/products/${id}`, {
                method: 'DELETE',
                headers: adminHeaders()
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al desactivar producto');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error desactivando producto:', error);
            throw error;
        }
    }

    async function getProductImages(productId) {
        try {
            const response = await adminFetch(`/api/admin/products/${productId}/images`, {
                headers: adminHeaders()
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al cargar imágenes');
            }
            
            const data = await response.json();
            return data.images || [];
        } catch (error) {
            console.error('Error cargando imágenes:', error);
            throw error;
        }
    }

    async function addProductImage(productId, imageUrl, isMain = false) {
        try {
            const response = await adminFetch(`/api/admin/products/${productId}/images`, {
                method: 'POST',
                headers: adminHeaders(),
                body: JSON.stringify({
                    imagen_url: imageUrl,
                    es_principal: isMain
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al agregar imagen');
            }
            
            const data = await response.json();
            return data.image;
        } catch (error) {
            console.error('Error agregando imagen:', error);
            throw error;
        }
    }

    async function setMainImage(productId, imageId) {
        try {
            const response = await adminFetch(`/api/admin/products/${productId}/images`, {
                method: 'PUT',
                headers: adminHeaders(),
                body: JSON.stringify({ image_id: imageId })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al establecer imagen principal');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error estableciendo imagen principal:', error);
            throw error;
        }
    }

    async function deleteProductImage(productId, imageId) {
        try {
            const response = await adminFetch(`/api/admin/products/${productId}/images?image_id=${imageId}`, {
                method: 'DELETE',
                headers: adminHeaders()
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al eliminar imagen');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error eliminando imagen:', error);
            throw error;
        }
    }

    function renderMysqlProductsTable(products, pagination) {
        const formatAdminDate = (value) => {
            if (!value) return 'Sin fecha';
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? 'Sin fecha' : new Intl.DateTimeFormat('es-DO', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }).format(date);
        };
        const renderPrices = (product) => {
            const tiers = product.priceTiers || {};
            return ['A', 'B', 'C', 'D'].map(tier => `
                <div><strong>Precio ${tier}:</strong> ${tiers[tier]?.net || (tier === 'D' ? product.price : 'Sin precio')}</div>
            `).join('');
        };
        const rows = products.map(product => `
            <tr>
                <td><img class="admin-thumb" src="${product.image}" alt="" onerror="this.src='/IMAGENES/producto-sin-imagen.svg'"></td>
                <td>
                    <strong>${product.name}</strong>
                    <small>${product.shortDescription || product.description || ''}</small>
                    <div class="product-meta">
                        <span class="badge ${product.available ? 'badge-success' : 'badge-warning'}">
                            ${product.available ? 'Visible' : 'Oculto'}
                        </span>
                        <span class="badge badge-info">Existencia: ${Number(product.stock || 0)}</span>
                    </div>
                </td>
                <td><code>${product.code || product.articuloCode || 'N/A'}</code></td>
                <td>
                    <strong>Creado:</strong> ${formatAdminDate(product.createdAtSource)}
                    <small>Actualizado: ${formatAdminDate(product.updatedAtSource)}</small>
                </td>
                <td>
                    <div class="admin-price-tiers">${renderPrices(product)}</div>
                    <small>Incluyen ${Number(product.taxRate || 0)}% de ITBIS</small>
                </td>
                <td>
                    <div class="admin-actions">
                        <button class="admin-link admin-edit-product" type="button" data-product-id="${product.id}">Editar</button>
                        <button class="admin-link admin-delete-product" type="button" data-product-id="${product.id}">Eliminar</button>
                        <button class="admin-link admin-images-product" type="button" data-product-id="${product.id}">Imágenes</button>
                        <a class="admin-link" href="/ULTRACOMP/producto-detalle.html?id=${encodeURIComponent(product.id)}" target="_blank" rel="noopener">Ver</a>
                    </div>
                </td>
            </tr>
        `).join('');

        return `
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Imagen</th>
                            <th>Producto</th>
                            <th>Código artículo</th>
                            <th>Fechas</th>
                            <th>Precios con ITBIS</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${renderPagination(pagination)}
        `;
    }

    function renderPagination(pagination) {
        if (!pagination || pagination.total <= pageSize) return '';
        
        const totalPages = Math.ceil(pagination.total / pageSize);
        const pages = [];
        
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
                pages.push('...');
            }
        }
        
        return `
            <div class="admin-pagination">
                <button class="admin-link" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">Anterior</button>
                ${pages.map(p => p === '...' ? '<span>...</span>' : `<button class="admin-link ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`).join('')}
                <button class="admin-link" ${!pagination.hasMore ? 'disabled' : ''} data-page="${currentPage + 1}">Siguiente</button>
                <span class="pagination-info">Página ${currentPage} de ${totalPages} (${pagination.total} total)</span>
            </div>
        `;
    }

    function renderMysqlProductsPanel() {
        return `
            <section class="admin-panel">
                <div class="admin-panel-header">
                    <div>
                        <h2>Productos MySQL (articulo_servicio)</h2>
                        <p>Gestión de productos desde MySQL. El catálogo público solo muestra productos visibles/con existencia.</p>
                    </div>
                    <div class="admin-actions">
                        <button class="primary-button" id="createMysqlProductButton" type="button">Crear producto</button>
                        <button class="admin-link" id="showWithoutImageButton" type="button">Productos sin imagen</button>
                        <a class="admin-link" href="/ULTRACOMP/productos.html" target="_blank" rel="noopener">Ver catálogo público</a>
                    </div>
                </div>
                <div id="mysqlStatusCards" class="admin-grid compact"><div class="admin-card"><span>Estado</span><strong>Cargando...</strong></div></div>
                <div class="admin-search-bar">
                    <input type="text" id="mysqlProductsSearch" placeholder="Buscar por nombre o código artículo..." value="${currentSearch}">
                    <select id="mysqlAvailabilityFilter">
                        <option value="" ${currentAvailability === '' ? 'selected' : ''}>Todos los productos de la base</option>
                        <option value="in_stock" ${currentAvailability === 'in_stock' ? 'selected' : ''}>Con existencia</option>
                        <option value="out_of_stock" ${currentAvailability === 'out_of_stock' ? 'selected' : ''}>Sin existencia</option>
                        <option value="visible" ${currentAvailability === 'visible' ? 'selected' : ''}>Visibles en catálogo</option>
                        <option value="hidden" ${currentAvailability === 'hidden' ? 'selected' : ''}>Ocultos del catálogo</option>
                    </select>
                    <select id="mysqlIssueFilter">
                        <option value="" ${currentIssue === '' ? 'selected' : ''}>Sin filtro de problema</option>
                        <option value="sin_imagen" ${currentIssue === 'sin_imagen' ? 'selected' : ''}>Sin imagen</option>
                        <option value="precio_cero" ${currentIssue === 'precio_cero' ? 'selected' : ''}>Precio en 0</option>
                        <option value="sin_codigo" ${currentIssue === 'sin_codigo' ? 'selected' : ''}>Sin código artículo</option>
                    </select>
                    <select id="mysqlSortFilter" aria-label="Ordenar productos">
                        <option value="created_desc" ${currentSort === 'created_desc' ? 'selected' : ''}>Más recientes primero</option>
                        <option value="created_asc" ${currentSort === 'created_asc' ? 'selected' : ''}>Más antiguos primero</option>
                        <option value="updated_desc" ${currentSort === 'updated_desc' ? 'selected' : ''}>Actualizados recientemente</option>
                        <option value="updated_asc" ${currentSort === 'updated_asc' ? 'selected' : ''}>Actualizados más antiguos</option>
                        <option value="name_asc" ${currentSort === 'name_asc' ? 'selected' : ''}>Nombre A-Z</option>
                        <option value="name_desc" ${currentSort === 'name_desc' ? 'selected' : ''}>Nombre Z-A</option>
                        <option value="code_desc" ${currentSort === 'code_desc' ? 'selected' : ''}>Código mayor a menor</option>
                        <option value="code_asc" ${currentSort === 'code_asc' ? 'selected' : ''}>Código menor a mayor</option>
                        <option value="price_desc" ${currentSort === 'price_desc' ? 'selected' : ''}>Precio mayor a menor</option>
                        <option value="price_asc" ${currentSort === 'price_asc' ? 'selected' : ''}>Precio menor a mayor</option>
                        <option value="stock_desc" ${currentSort === 'stock_desc' ? 'selected' : ''}>Mayor existencia</option>
                        <option value="stock_asc" ${currentSort === 'stock_asc' ? 'selected' : ''}>Menor existencia</option>
                    </select>
                    <button class="admin-link" id="mysqlProductsSearchButton" type="button">Buscar</button>
                    <button class="admin-link secondary" id="mysqlProductsClearButton" type="button">Limpiar</button>
                </div>
                <div id="mysqlProductsTableContainer">
                    <p>Cargando productos...</p>
                </div>
            </section>
            ${renderEditModal()}
            ${renderImagesModal()}
            ${renderWithoutImageModal()}
        `;
    }

    function renderEditModal() {
        return `
            <div class="admin-modal" id="mysqlProductEditModal" aria-hidden="true">
                <div class="admin-modal-card">
                    <div class="admin-modal-header">
                        <h2 id="mysqlProductModalTitle">Editar producto</h2>
                        <button class="admin-modal-close" type="button" data-close="mysqlProductEditModal">&times;</button>
                    </div>
                    <form id="mysqlProductEditForm" class="admin-form">
                        <input type="hidden" name="id" id="mysqlProductId">
                        <div class="admin-form-grid">
                            <label>Nombre
                                <input name="name" type="text" id="mysqlProductName" required>
                            </label>
                            <label>Precio D antes de ITBIS (opcional)
                                <input name="priceNumeric" type="number" min="0" step="any" inputmode="decimal" id="mysqlProductPrice" placeholder="Sin precio">
                            </label>
                        </div>
                        <label>Marca
                            <select name="brand" id="mysqlProductBrand" required>
                                <option value="">Selecciona una marca</option>
                            </select>
                            <small>Las marcas se administran desde la sección Marcas.</small>
                        </label>
                        <section id="mysqlProductPriceTiers" class="admin-price-tier-panel" hidden>
                            <h3>Precios con ITBIS</h3>
                            <p id="mysqlProductTaxRate"></p>
                            <div class="admin-form-grid compact">
                                <label>Precio A
                                    <input type="text" id="mysqlProductPriceA" readonly>
                                </label>
                                <label>Precio B
                                    <input type="text" id="mysqlProductPriceB" readonly>
                                </label>
                                <label>Precio C
                                    <input type="text" id="mysqlProductPriceC" readonly>
                                </label>
                                <label>Precio D
                                    <input type="text" id="mysqlProductPriceD" readonly>
                                </label>
                            </div>
                            <small>Valores netos calculados con el ITBIS registrado en la base de datos.</small>
                        </section>
                        <div class="admin-form-grid">
                            <label>Código artículo
                                <input name="code" type="text" id="mysqlProductCode">
                                <small id="mysqlProductCodeHelp">Se genera automáticamente al crear.</small>
                            </label>
                            <label>Unidad
                                <input name="unit" type="text" id="mysqlProductUnit">
                            </label>
                        </div>
                        <label>Descripción
                            <textarea name="description" rows="3" id="mysqlProductDescription"></textarea>
                        </label>

                        <fieldset class="admin-category-fieldset">
                            <legend>Categorías del producto</legend>
                            <p>Selecciona una o varias categorías en las que debe aparecer.</p>
                            <div class="admin-form-grid compact admin-category-options" id="mysqlProductCategoryOptions">
                                ${renderCategoryOptions()}
                            </div>
                        </fieldset>

                        <label>Imagen principal
                            <input name="productImage" type="file" id="mysqlProductImage" accept="image/png,image/jpeg,image/webp">
                            <small>Al guardar, la imagen se subirá y quedará asociada automáticamente al producto.</small>
                        </label>
                        
                        <h3>Flags del Producto</h3>
                        <div class="admin-form-grid compact">
                            <label class="admin-checkbox">
                                <input name="esDestacado" type="checkbox" id="mysqlProductEsDestacado"> Destacado
                            </label>
                            <label class="admin-checkbox">
                                <input name="esOferta" type="checkbox" id="mysqlProductEsOferta"> Oferta
                            </label>
                            <label class="admin-checkbox">
                                <input name="esNuevo" type="checkbox" id="mysqlProductEsNuevo"> Nuevo
                            </label>
                            <label class="admin-checkbox">
                                <input name="esMasVendido" type="checkbox" id="mysqlProductEsMasVendido"> Más vendido
                            </label>
                            <label class="admin-checkbox">
                                <input name="esRecomendado" type="checkbox" id="mysqlProductEsRecomendado"> Recomendado
                            </label>
                        </div>
                        
                        <div id="ofertaFields" style="display: none;">
                            <label>Precio de oferta
                                <input name="precioOferta" type="number" step="any" inputmode="decimal" id="mysqlProductPrecioOferta">
                            </label>
                            <div class="admin-form-grid">
                                <label>Fecha inicio oferta
                                    <input name="fechaInicioOferta" type="date" id="mysqlProductFechaInicioOferta">
                                </label>
                                <label>Fecha fin oferta
                                    <input name="fechaFinOferta" type="date" id="mysqlProductFechaFinOferta">
                                </label>
                            </div>
                        </div>
                        
                        <div class="admin-form-grid compact">
                            <label class="admin-checkbox">
                                <input name="available" type="checkbox" id="mysqlProductAvailable"> Disponible
                            </label>
                            <label class="admin-checkbox">
                                <input name="catalogo" type="checkbox" id="mysqlProductCatalogo"> Mostrar en catálogo
                            </label>
                            <label class="admin-checkbox">
                                <input name="activo" type="checkbox" id="mysqlProductActivo"> Activo
                            </label>
                        </div>
                        <div class="admin-form-message" id="mysqlProductEditMessage"></div>
                        <div class="admin-form-actions">
                            <button class="primary-button" id="saveMysqlProductButton" type="submit">Guardar cambios</button>
                            <button class="secondary-button" type="button" data-close="mysqlProductEditModal">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function renderImagesModal() {
        return `
            <div class="admin-modal" id="mysqlProductImagesModal" aria-hidden="true">
                <div class="admin-modal-card">
                    <div class="admin-modal-header">
                        <h2>Gestión de imágenes</h2>
                        <button class="admin-modal-close" type="button" data-close="mysqlProductImagesModal">&times;</button>
                    </div>
                    <div class="admin-modal-content">
                        <div id="mysqlProductImagesList"></div>
                        <div class="admin-form">
                            <label>Subir imagen desde tu computadora
                                <input type="file" id="newImageFile" accept="image/png,image/jpeg,image/webp">
                            </label>
                            <label>O agregar imagen por URL
                                <input type="text" id="newImageUrl" placeholder="/IMAGENES/nombre-archivo.jpg">
                            </label>
                            <div class="admin-form-actions">
                                <button class="primary-button" id="uploadNewImageButton" type="button">Subir imagen</button>
                                <button class="secondary-button" id="addNewImageButton" type="button">Agregar URL</button>
                            </div>
                        </div>
                    </div>
                    <div class="admin-form-message" id="mysqlProductImagesMessage"></div>
                </div>
            </div>
        `;
    }

    function renderWithoutImageModal() {
        return `
            <div class="admin-modal" id="withoutImageModal" aria-hidden="true">
                <div class="admin-modal-card">
                    <div class="admin-modal-header">
                        <h2>Productos sin imagen</h2>
                        <button class="admin-modal-close" type="button" data-close="withoutImageModal">&times;</button>
                    </div>
                    <div class="admin-modal-content">
                        <div id="withoutImageList">
                            <p>Cargando...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.setAttribute('aria-hidden', 'false');
            modal.style.display = 'flex';
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.setAttribute('aria-hidden', 'true');
            modal.style.display = 'none';
        }
    }

    function showMessage(elementId, message, type = 'info') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = `admin-form-message ${type}`;
            setTimeout(() => {
                element.textContent = '';
                element.className = 'admin-form-message';
            }, 5000);
        }
    }


    async function refreshStatusCards() {
        const cards = document.getElementById('mysqlStatusCards');
        if (!cards) return;
        const response = await adminFetch('/api/admin/status', { headers: adminHeaders() });
        if (!response.ok) return;
        const data = await response.json();
        const p = data.products || {};
        cards.innerHTML = `
            <div class="admin-card"><span>Total productos</span><strong>${p.total || 0}</strong></div>
            <div class="admin-card"><span>Visibles</span><strong>${p.visible || 0}</strong></div>
            <div class="admin-card"><span>Ocultos</span><strong>${p.hidden || 0}</strong></div>
            <div class="admin-card"><span>Sin precio</span><strong>${p.priceIssues || 0}</strong></div>
            <div class="admin-card"><span>Imágenes subidas</span><strong>${data.uploadedImages || 0}</strong></div>
        `;
    }

    async function uploadProductImage(productId, selectedFile = null) {
        const fileInput = document.getElementById('newImageFile');
        const file = selectedFile || (fileInput && fileInput.files ? fileInput.files[0] : null);
        if (!file) {
            showMessage('mysqlProductImagesMessage', 'Selecciona una imagen primero.', 'error');
            return;
        }
        const formData = new FormData();
        formData.append('image', file);
        const response = await adminFetch(`/api/admin/products/${productId}/upload-image`, {
            method: 'POST',
            body: formData
        });
        ensureAdminSession(response);
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'No se pudo subir la imagen');
        }
        return await response.json();
    }

    async function refreshProductsTable() {
        const container = document.getElementById('mysqlProductsTableContainer');
        if (!container) return;
        
        container.innerHTML = '<p>Cargando productos...</p>';
        refreshStatusCards().catch(() => {});
        
        try {
            const data = await loadMysqlProducts(currentSearch, currentPage);
            container.innerHTML = renderMysqlProductsTable(data.products, data);
            bindTableEvents();
        } catch (error) {
            container.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    }

    function bindTableEvents() {
        document.querySelectorAll('.admin-edit-product').forEach(btn => {
            btn.addEventListener('click', () => openEditModal(btn.dataset.productId));
        });
        
        document.querySelectorAll('.admin-delete-product').forEach(btn => {
            btn.addEventListener('click', () => confirmDeleteProduct(btn.dataset.productId));
        });
        
        document.querySelectorAll('.admin-images-product').forEach(btn => {
            btn.addEventListener('click', () => openImagesModal(btn.dataset.productId));
        });
        
        document.querySelectorAll('.admin-pagination button').forEach(btn => {
            if (!btn.disabled) {
                btn.addEventListener('click', () => {
                    currentPage = parseInt(btn.dataset.page);
                    refreshProductsTable();
                });
            }
        });
    }

    async function openEditModal(productId) {
        const product = mysqlProducts.find(p => p.id === productId);
        if (!product) return;
        
        editingProduct = product;
        
        document.getElementById('mysqlProductId').value = product.id;
        document.getElementById('mysqlProductName').value = product.name || '';
        document.getElementById('mysqlProductPrice').value = product.basePriceNumeric ?? product.priceNumeric ?? 0;
        const priceTiers = product.priceTiers || {};
        ['A', 'B', 'C', 'D'].forEach(tier => {
            document.getElementById(`mysqlProductPrice${tier}`).value = priceTiers[tier]?.net || 'Sin precio';
        });
        document.getElementById('mysqlProductTaxRate').textContent =
            `ITBIS aplicado: ${Number(product.taxRate || 0)}%`;
        document.getElementById('mysqlProductPriceTiers').hidden = false;
        document.getElementById('mysqlProductCode').value = product.code || product.articuloCode || '';
        document.getElementById('mysqlProductCode').readOnly = false;
        document.getElementById('mysqlProductCodeHelp').textContent = 'Código guardado actualmente en la base de datos.';
        document.getElementById('mysqlProductUnit').value = product.unit || '';
        document.getElementById('mysqlProductDescription').value = product.description || '';
        await loadBrandOptions(product.brand || '');
        const selectedCategories = new Set(product.categories || []);
        document.querySelectorAll('input[name="productCategories"]').forEach(input => {
            input.checked = selectedCategories.has(input.value);
        });
        document.getElementById('mysqlProductImage').value = '';
        document.getElementById('mysqlProductAvailable').checked =
            product.databaseAvailable ?? product.available;
        document.getElementById('mysqlProductCatalogo').checked = product.catalogo !== false;
        document.getElementById('mysqlProductActivo').checked = product.activo !== false;
        document.getElementById('mysqlProductModalTitle').textContent = 'Editar producto';
        document.getElementById('saveMysqlProductButton').textContent = 'Guardar cambios';
        
        // Cargar flags del producto
        try {
            const response = await adminFetch(`/api/admin/products/flags?codigo=${product.id}`, {
                headers: adminHeaders()
            });
            if (response.ok) {
                const data = await response.json();
                const flags = data.flags || {};
                document.getElementById('mysqlProductEsDestacado').checked = flags.esDestacado || false;
                document.getElementById('mysqlProductEsOferta').checked = flags.esOferta || false;
                document.getElementById('mysqlProductEsNuevo').checked = flags.esNuevo || false;
                document.getElementById('mysqlProductEsMasVendido').checked = flags.esMasVendido || false;
                document.getElementById('mysqlProductEsRecomendado').checked = flags.esRecomendado || false;
                document.getElementById('mysqlProductPrecioOferta').value = flags.precioOferta || '';
                document.getElementById('mysqlProductFechaInicioOferta').value = flags.fechaInicioOferta || '';
                document.getElementById('mysqlProductFechaFinOferta').value = flags.fechaFinOferta || '';
                
                // Mostrar campos de oferta si está marcado
                toggleOfertaFields();
            }
        } catch (error) {
            console.error('Error cargando flags:', error);
        }
        
        // Agregar event listener para checkbox de oferta
        const ofertaCheckbox = document.getElementById('mysqlProductEsOferta');
        ofertaCheckbox.removeEventListener('change', toggleOfertaFields);
        ofertaCheckbox.addEventListener('change', toggleOfertaFields);
        
        openModal('mysqlProductEditModal');
    }

    function openCreateModal() {
        editingProduct = null;
        const form = document.getElementById('mysqlProductEditForm');
        form.reset();
        form.id.value = '';
        form.code.value = '';
        form.code.readOnly = true;
        form.code.placeholder = 'Se asignará al guardar';
        document.getElementById('mysqlProductPriceTiers').hidden = true;
        document.getElementById('mysqlProductCodeHelp').textContent = 'El sistema reservará el siguiente código disponible.';
        form.unit.value = 'UNIDAD';
        loadBrandOptions().catch(error => console.error('No se pudieron cargar las marcas:', error));
        form.available.checked = true;
        form.catalogo.checked = true;
        form.activo.checked = true;
        form.querySelectorAll('input[name="productCategories"]').forEach(input => {
            input.checked = false;
        });
        document.getElementById('mysqlProductModalTitle').textContent = 'Crear producto';
        document.getElementById('saveMysqlProductButton').textContent = 'Crear producto';
        document.getElementById('ofertaFields').style.display = 'none';
        openModal('mysqlProductEditModal');
    }

    function toggleOfertaFields() {
        const ofertaCheckbox = document.getElementById('mysqlProductEsOferta');
        const ofertaFields = document.getElementById('ofertaFields');
        if (ofertaFields) {
            ofertaFields.style.display = ofertaCheckbox.checked ? 'block' : 'none';
        }
    }

    async function saveProductFlags(flagsData) {
        try {
            const response = await adminFetch('/api/admin/products/flags', {
                method: 'POST',
                headers: adminHeaders(),
                body: JSON.stringify(flagsData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al guardar flags');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error guardando flags:', error);
            throw error;
        }
    }

    async function openImagesModal(productId) {
        editingProduct = mysqlProducts.find(p => p.id === productId);
        if (!editingProduct) return;
        
        openModal('mysqlProductImagesModal');
        await refreshImagesList();
    }

    async function refreshImagesList() {
        if (!editingProduct) return;
        
        const list = document.getElementById('mysqlProductImagesList');
        list.innerHTML = '<p>Cargando imágenes...</p>';
        
        try {
            const images = await getProductImages(editingProduct.id);
            
            if (images.length === 0) {
                list.innerHTML = '<p>No hay imágenes registradas en producto_imagenes. Usando imagen del sistema.</p>';
                return;
            }
            
            list.innerHTML = images.map(img => `
                <div class="image-item ${img.esPrincipal ? 'main-image' : ''}">
                    <img src="${img.imagenUrl}" alt="Imagen del producto" style="max-width: 100px; max-height: 100px;">
                    <div class="image-info">
                        <span class="badge ${img.esPrincipal ? 'badge-success' : 'badge-secondary'}">
                            ${img.esPrincipal ? 'Principal' : 'Secundaria'}
                        </span>
                        <button class="admin-link" data-action="set-main" data-image-id="${img.id}" ${img.esPrincipal ? 'disabled' : ''}>
                            Establecer principal
                        </button>
                        <button class="admin-link" data-action="delete" data-image-id="${img.id}">
                            Eliminar
                        </button>
                    </div>
                </div>
            `).join('');
            
            list.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', handleImageAction);
            });
        } catch (error) {
            list.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    }

    async function handleImageAction(e) {
        const action = e.target.dataset.action;
        const imageId = parseInt(e.target.dataset.imageId, 10);
        
        if (!editingProduct) return;
        
        try {
            if (action === 'set-main') {
                await setMainImage(editingProduct.id, imageId);
                showMessage('mysqlProductImagesMessage', 'Imagen principal actualizada', 'success');
                await refreshImagesList();
            } else if (action === 'delete') {
                if (confirm('¿Eliminar esta imagen?')) {
                    await deleteProductImage(editingProduct.id, imageId);
                    showMessage('mysqlProductImagesMessage', 'Imagen eliminada', 'success');
                    await refreshImagesList();
                }
            }
        } catch (error) {
            showMessage('mysqlProductImagesMessage', error.message, 'error');
        }
    }

    async function confirmDeleteProduct(productId) {
        const product = mysqlProducts.find(p => p.id === productId);
        if (!product) return;
        
        if (confirm(`¿Eliminar el producto "${product.name}" del sistema?\n\nDejará de aparecer en el catálogo. Su historial se conservará para no afectar cotizaciones ni registros relacionados.`)) {
            try {
                await softDeleteProduct(productId);
                showMessage('mysqlProductEditMessage', 'Producto eliminado del catálogo correctamente', 'success');
                await refreshProductsTable();
            } catch (error) {
                showMessage('mysqlProductEditMessage', error.message, 'error');
            }
        }
    }

    async function showProductsWithoutImage() {
        openModal('withoutImageModal');
        const list = document.getElementById('withoutImageList');
        list.innerHTML = '<p>Cargando...</p>';
        
        try {
            const products = await loadProductsWithoutImage();
            
            if (products.length === 0) {
                list.innerHTML = '<p>¡Excelente! Todos los productos tienen imágenes registradas.</p>';
                return;
            }
            
            list.innerHTML = `
                <p>${products.length} productos sin una imagen disponible:</p>
                <table class="admin-table">
                    <thead><tr><th>Código artículo</th><th>Nombre</th><th>Estado</th><th>Acción</th></tr></thead>
                    <tbody>
                        ${products.map(p => `
                            <tr>
                                <td><code>${p.code}</code></td>
                                <td>${p.name}</td>
                                <td>${p.active && p.catalog ? 'Visible' : 'Oculto'}</td>
                                <td>
                                    <button class="admin-link" data-action="add-image" data-product-id="${p.id}">
                                        Agregar imagen
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            list.querySelectorAll('[data-action="add-image"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    closeModal('withoutImageModal');
                    const product = products.find(p => p.id === btn.dataset.productId);
                    if (product) {
                        editingProduct = product;
                        openModal('mysqlProductImagesModal');
                        refreshImagesList();
                    }
                });
            });
        } catch (error) {
            list.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    }

    function bindModalEvents() {
        // Cerrar modales
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                closeModal(btn.dataset.close);
            });
        });
        
        // Cerrar al hacer clic fuera
        document.querySelectorAll('.admin-modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal(modal.id);
                }
            });
        });
        
        // Formulario de edición
        const editForm = document.getElementById('mysqlProductEditForm');
        if (editForm) {
            editForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const selectedCategories = Array.from(
                    editForm.querySelectorAll('input[name="productCategories"]:checked')
                ).map(input => input.value);
                if (!selectedCategories.length) {
                    showMessage('mysqlProductEditMessage', 'Selecciona al menos una categoría.', 'error');
                    return;
                }

                const updates = {
                    name: editForm.name.value,
                    priceNumeric: parseAdminDecimal(editForm.priceNumeric.value),
                    code: editForm.code.value,
                    unit: editForm.unit.value,
                    description: editForm.description.value,
                    brand: editForm.brand.value,
                    categories: selectedCategories,
                    available: editForm.available.checked,
                    catalogo: editForm.catalogo.checked,
                    activo: editForm.activo.checked
                };
                
                try {
                    const isCreate = !editForm.id.value;
                    const selectedImage = editForm.productImage.files[0] || null;
                    const savedProduct = isCreate
                        ? await createProduct(updates)
                        : await updateProduct(editForm.id.value, updates);
                    
                    // Guardar flags del producto
                    const flagsData = {
                        codigoArticulo: Number(savedProduct.id),
                        esDestacado: editForm.esDestacado.checked,
                        esOferta: editForm.esOferta.checked,
                        esNuevo: editForm.esNuevo.checked,
                        esMasVendido: editForm.esMasVendido.checked,
                        esRecomendado: editForm.esRecomendado.checked,
                        precioOferta: editForm.precioOferta.value ? parseAdminDecimal(editForm.precioOferta.value) : null,
                        fechaInicioOferta: editForm.fechaInicioOferta.value || null,
                        fechaFinOferta: editForm.fechaFinOferta.value || null
                    };
                    
                    await saveProductFlags(flagsData);
                    if (selectedImage) {
                        await uploadProductImage(savedProduct.id, selectedImage);
                    }
                    
                    showMessage(
                        'mysqlProductEditMessage',
                        `${isCreate ? 'Producto creado' : 'Producto actualizado'}${selectedImage ? ' con su imagen principal' : ''} correctamente`,
                        'success'
                    );
                    closeModal('mysqlProductEditModal');
                    await refreshProductsTable();
                    if (isCreate && !selectedImage) {
                        editingProduct = savedProduct;
                        openModal('mysqlProductImagesModal');
                        await refreshImagesList();
                    }
                } catch (error) {
                    showMessage('mysqlProductEditMessage', error.message, 'error');
                }
            });
        }
        
        // Agregar nueva imagen
        const addImageButton = document.getElementById('addNewImageButton');
        if (addImageButton) {
            addImageButton.addEventListener('click', async () => {
                const input = document.getElementById('newImageUrl');
                const url = input.value.trim();
                
                if (!url) {
                    showMessage('mysqlProductImagesMessage', 'Ingresa una URL de imagen', 'error');
                    return;
                }
                
                if (!editingProduct) return;
                
                try {
                    await addProductImage(editingProduct.id, url, true);
                    showMessage('mysqlProductImagesMessage', 'Imagen agregada correctamente', 'success');
                    input.value = '';
                    await refreshImagesList();
                } catch (error) {
                    showMessage('mysqlProductImagesMessage', error.message, 'error');
                }
            });
        }

        const uploadImageButton = document.getElementById('uploadNewImageButton');
        if (uploadImageButton) {
            uploadImageButton.addEventListener('click', async () => {
                if (!editingProduct) return;

                uploadImageButton.disabled = true;
                uploadImageButton.textContent = 'Subiendo...';
                showMessage('mysqlProductImagesMessage', 'Subiendo imagen...', 'info');

                try {
                    await uploadProductImage(editingProduct.id);
                    const fileInput = document.getElementById('newImageFile');
                    if (fileInput) fileInput.value = '';
                    showMessage('mysqlProductImagesMessage', 'Imagen subida y asignada correctamente', 'success');
                    await refreshImagesList();
                    await refreshProductsTable();
                } catch (error) {
                    showMessage('mysqlProductImagesMessage', error.message, 'error');
                } finally {
                    uploadImageButton.disabled = false;
                    uploadImageButton.textContent = 'Subir imagen';
                }
            });
        }
        
        // Productos sin imagen
        const withoutImageButton = document.getElementById('showWithoutImageButton');
        if (withoutImageButton) {
            withoutImageButton.addEventListener('click', showProductsWithoutImage);
        }

        const createProductButton = document.getElementById('createMysqlProductButton');
        if (createProductButton) {
            createProductButton.addEventListener('click', openCreateModal);
        }
        
        // Búsqueda
        const searchInput = document.getElementById('mysqlProductsSearch');
        const availabilityFilter = document.getElementById('mysqlAvailabilityFilter');
        const issueFilter = document.getElementById('mysqlIssueFilter');
        const sortFilter = document.getElementById('mysqlSortFilter');
        const searchButton = document.getElementById('mysqlProductsSearchButton');
        const clearButton = document.getElementById('mysqlProductsClearButton');
        
        const runProductSearch = () => {
            currentSearch = searchInput ? searchInput.value.trim() : '';
            currentAvailability = availabilityFilter ? availabilityFilter.value : currentAvailability;
            currentIssue = issueFilter ? issueFilter.value : currentIssue;
            currentSort = sortFilter ? sortFilter.value : currentSort;
            currentPage = 1;
            refreshProductsTable();
        };

        if (searchButton) searchButton.addEventListener('click', runProductSearch);
        
        if (availabilityFilter) availabilityFilter.addEventListener('change', () => { currentAvailability = availabilityFilter.value; currentPage = 1; refreshProductsTable(); });
        if (issueFilter) issueFilter.addEventListener('change', () => { currentIssue = issueFilter.value; currentPage = 1; refreshProductsTable(); });
        if (sortFilter) sortFilter.addEventListener('change', () => { currentSort = sortFilter.value; currentPage = 1; refreshProductsTable(); });

        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                runProductSearch();
            });
        }
        
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                currentSearch = '';
                currentAvailability = '';
                currentIssue = '';
                currentSort = 'created_desc';
                if (availabilityFilter) availabilityFilter.value = currentAvailability;
                if (issueFilter) issueFilter.value = '';
                if (sortFilter) sortFilter.value = currentSort;
                currentPage = 1;
                refreshProductsTable();
            });
        }
    }

    // Inicializar cuando se cargue el panel de productos
    function initMysqlProductsPanel() {
        const container = document.getElementById('adminApp');
        if (!container) return;
        
        bindModalEvents();
        loadCategoryOptions().catch(error => console.error('No se pudieron cargar las categorías:', error));
        loadBrandOptions().catch(error => console.error('No se pudieron cargar las marcas:', error));
        refreshProductsTable();
    }

    // Exponer función para uso externo
    window.UltraMysqlProductsAdmin = {
        init: initMysqlProductsPanel,
        render: renderMysqlProductsPanel,
        refresh: refreshProductsTable
    };

    // Auto-inicializar si estamos en la página de productos
    if (false && window.location.pathname === '/admin/productos/') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                const container = document.getElementById('adminApp');
                if (container) {
                    // Insertar el panel después del contenido existente
                    const mainContent = container.querySelector('.admin-main');
                    if (mainContent) {
                        const mysqlPanel = document.createElement('div');
                        mysqlPanel.id = 'mysqlProductsPanel';
                        mysqlPanel.dataset.mysqlProducts = 'true';
                        mysqlPanel.innerHTML = renderMysqlProductsPanel();
                        mainContent.appendChild(mysqlPanel);
                        bindModalEvents();
                        refreshProductsTable();
                    }
                }
            }, 100);
        });
    }
})();

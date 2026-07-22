// Gestión de cotizaciones desde MySQL para el panel administrador
(function() {
    let quotes = [];
    let currentPage = 1;
    const pageSize = 50;
    let currentSearch = '';
    let currentStatus = '';
    let viewingQuote = null;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function adminHeaders() {
        const sessionKey = window.ultraAdminData?.sessionKey || 'ultraAdminSession';
        return {
            'Content-Type': 'application/json'
        };
    }

    async function loadQuotes(search = '', status = '', page = 1) {
        try {
            const params = new URLSearchParams({
                search: search,
                status: status,
                page: page,
                limit: pageSize
            });
            
            const response = await fetch(`/api/admin/quotes?${params}`, {
                headers: adminHeaders()
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al cargar cotizaciones');
            }
            
            const data = await response.json();
            quotes = data.quotes || [];
            currentPage = data.page || 1;
            
            return {
                quotes: quotes,
                total: data.total || 0,
                page: currentPage,
                hasMore: data.hasMore || false
            };
        } catch (error) {
            console.error('Error cargando cotizaciones:', error);
            throw error;
        }
    }

    async function getQuoteDetail(quoteId) {
        try {
            const response = await fetch(`/api/admin/quotes/${quoteId}`, {
                headers: adminHeaders()
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al cargar detalle de cotización');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error cargando detalle:', error);
            throw error;
        }
    }

    async function updateQuoteStatus(quoteId, status) {
        try {
            const response = await fetch(`/api/admin/quotes/${quoteId}`, {
                method: 'PUT',
                headers: adminHeaders(),
                body: JSON.stringify({ status })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error al actualizar estado');
            }
            
            const data = await response.json();
            return data.quote;
        } catch (error) {
            console.error('Error actualizando estado:', error);
            throw error;
        }
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('es-DO', {
            style: 'currency',
            currency: 'DOP'
        }).format(amount);
    }

    function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('es-DO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getStatusBadge(status) {
        const badges = {
            'pendiente': 'badge-warning',
            'contactado': 'badge-info',
            'en_proceso': 'badge-secondary',
            'vendida': 'badge-success',
            'cancelada': 'badge-error'
        };
        const labels = {
            'pendiente': 'Pendiente',
            'contactado': 'Contactado',
            'en_proceso': 'En Proceso',
            'vendida': 'Vendida',
            'cancelada': 'Cancelada'
        };
        return `<span class="badge ${badges[status] || 'badge-secondary'}">${labels[status] || status}</span>`;
    }

    function renderQuotesTable(data) {
        const rows = data.quotes.map(quote => `
            <tr>
                <td><code>${escapeHtml(quote.quoteNumber || ('#' + quote.id))}</code></td>
                <td>
                    <strong>${escapeHtml(quote.clientName)}</strong>
                    <small>${escapeHtml(quote.clientEmail || '')}</small>
                </td>
                <td>${escapeHtml(quote.clientPhone)}</td>
                <td>${formatCurrency(quote.totalAmount)}</td>
                <td>${getStatusBadge(escapeHtml(quote.status))}</td>
                <td>${formatDate(quote.createdAt)}</td>
                <td>
                    <div class="admin-actions">
                        <button class="admin-link admin-view-quote" type="button" data-quote-id="${quote.id}">Ver detalle</button>
                    </div>
                </td>
            </tr>
        `).join('');

        return `
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Cotización</th>
                            <th>Cliente</th>
                            <th>Teléfono</th>
                            <th>Total</th>
                            <th>Estado</th>
                            <th>Fecha</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${renderPagination(data)}
        `;
    }

    function renderPagination(data) {
        if (!data || data.total <= pageSize) return '';
        
        const totalPages = Math.ceil(data.total / pageSize);
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
                <button class="admin-link" ${!data.hasMore ? 'disabled' : ''} data-page="${currentPage + 1}">Siguiente</button>
                <span class="pagination-info">Página ${currentPage} de ${totalPages} (${data.total} total)</span>
            </div>
        `;
    }

    function renderQuotesPanel() {
        return `
            <section class="admin-panel">
                <div class="admin-panel-header">
                    <div>
                        <h2>Cotizaciones Web</h2>
                        <p>Gestión de cotizaciones enviadas por clientes.</p>
                    </div>
                </div>
                <div class="admin-search-bar">
                    <input type="text" id="quotesSearch" placeholder="Buscar por cliente, teléfono o ID..." value="${currentSearch}">
                    <select id="quotesStatusFilter">
                        <option value="">Todos los estados</option>
                        <option value="pendiente" ${currentStatus === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="contactado" ${currentStatus === 'contactado' ? 'selected' : ''}>Contactado</option>
                        <option value="en_proceso" ${currentStatus === 'en_proceso' ? 'selected' : ''}>En Proceso</option>
                        <option value="vendida" ${currentStatus === 'vendida' ? 'selected' : ''}>Vendida</option>
                        <option value="cancelada" ${currentStatus === 'cancelada' ? 'selected' : ''}>Cancelada</option>
                    </select>
                    <button class="admin-link" id="quotesSearchButton" type="button">Buscar</button>
                    <button class="admin-link secondary" id="quotesClearButton" type="button">Limpiar</button>
                </div>
                <div id="quotesTableContainer">
                    <p>Cargando cotizaciones...</p>
                </div>
            </section>
            ${renderQuoteDetailModal()}
        `;
    }

    function renderQuoteDetailModal() {
        return `
            <div class="admin-modal" id="quoteDetailModal" aria-hidden="true">
                <div class="admin-modal-card">
                    <div class="admin-modal-header">
                        <h2>Detalle de Cotización <span id="quoteDetailId"></span></h2>
                        <button class="admin-modal-close" type="button" data-close="quoteDetailModal">&times;</button>
                    </div>
                    <div class="admin-modal-content">
                        <div id="quoteDetailContent">
                            <p>Cargando...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderQuoteDetailContent(quote) {
        const itemsRows = quote.items.map(item => `
            <tr>
                <td>${escapeHtml(item.productName)}</td>
                <td><code>${escapeHtml(item.productCode || '-')}</code></td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unitPrice)}</td>
                <td>${formatCurrency(item.subtotal)}</td>
            </tr>
        `).join('');

        return `
            <div class="quote-detail-section">
                <h3>Información del Cliente</h3>
                <div class="admin-form-grid">
                    <div><strong>Número:</strong> ${escapeHtml(quote.quoteNumber || ('#' + quote.id))}</div>
                    <div><strong>Nombre:</strong> ${escapeHtml(quote.clientName)}</div>
                    <div><strong>Teléfono:</strong> ${escapeHtml(quote.clientPhone)}</div>
                    <div><strong>Correo:</strong> ${escapeHtml(quote.clientEmail || '-')}</div>
                    <div><strong>Fecha:</strong> ${formatDate(quote.createdAt)}</div>
                </div>
                ${quote.clientMessage ? `<div><strong>Mensaje:</strong> ${escapeHtml(quote.clientMessage)}</div>` : ''}
            </div>

            <div class="quote-detail-section">
                <h3>Estado</h3>
                <div class="admin-form">
                    <label>
                        Cambiar estado:
                        <select id="quoteStatusSelect">
                            <option value="pendiente" ${quote.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                            <option value="contactado" ${quote.status === 'contactado' ? 'selected' : ''}>Contactado</option>
                            <option value="en_proceso" ${quote.status === 'en_proceso' ? 'selected' : ''}>En Proceso</option>
                            <option value="vendida" ${quote.status === 'vendida' ? 'selected' : ''}>Vendida</option>
                            <option value="cancelada" ${quote.status === 'cancelada' ? 'selected' : ''}>Cancelada</option>
                        </select>
                    </label>
                    <div class="admin-form-actions">
                        <button class="primary-button" id="updateQuoteStatusButton" type="button">Actualizar estado</button>
                    </div>
                </div>
            </div>

            <div class="quote-detail-section">
                <h3>Productos Cotizados</h3>
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Código</th>
                                <th>Cantidad</th>
                                <th>Precio Unitario</th>
                                <th>Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>${itemsRows}</tbody>
                    </table>
                </div>
                <div class="quote-total">
                    <strong>Total: ${formatCurrency(quote.totalAmount)}</strong>
                </div>
            </div>

            <div class="admin-form-message" id="quoteDetailMessage"></div>
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

    async function refreshQuotesTable() {
        const container = document.getElementById('quotesTableContainer');
        if (!container) return;
        
        container.innerHTML = '<p>Cargando cotizaciones...</p>';
        
        try {
            const data = await loadQuotes(currentSearch, currentStatus, currentPage);
            container.innerHTML = renderQuotesTable(data);
            bindTableEvents();
        } catch (error) {
            container.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    }

    function bindTableEvents() {
        document.querySelectorAll('.admin-view-quote').forEach(btn => {
            btn.addEventListener('click', () => openQuoteDetail(parseInt(btn.dataset.quoteId, 10)));
        });
        
        document.querySelectorAll('.admin-pagination button').forEach(btn => {
            if (!btn.disabled) {
                btn.addEventListener('click', () => {
                    currentPage = parseInt(btn.dataset.page);
                    refreshQuotesTable();
                });
            }
        });
    }

    async function openQuoteDetail(quoteId) {
        openModal('quoteDetailModal');
        const content = document.getElementById('quoteDetailContent');
        content.innerHTML = '<p>Cargando...</p>';
        
        try {
            const quote = await getQuoteDetail(quoteId);
            viewingQuote = quote;
            document.getElementById('quoteDetailId').textContent = quote.quoteNumber || ('#' + quote.id);
            content.innerHTML = renderQuoteDetailContent(quote);
            
            // Bind status update button
            const updateBtn = document.getElementById('updateQuoteStatusButton');
            if (updateBtn) {
                updateBtn.addEventListener('click', handleStatusUpdate);
            }
        } catch (error) {
            content.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    }

    async function handleStatusUpdate() {
        if (!viewingQuote) return;
        
        const select = document.getElementById('quoteStatusSelect');
        const newStatus = select.value;
        
        try {
            const updated = await updateQuoteStatus(viewingQuote.id, newStatus);
            viewingQuote = updated;
            showMessage('quoteDetailMessage', 'Estado actualizado correctamente', 'success');
            document.getElementById('quoteDetailContent').innerHTML = renderQuoteDetailContent(updated);
            
            // Rebind the button
            const updateBtn = document.getElementById('updateQuoteStatusButton');
            if (updateBtn) {
                updateBtn.addEventListener('click', handleStatusUpdate);
            }
            
            // Refresh the table
            await refreshQuotesTable();
        } catch (error) {
            showMessage('quoteDetailMessage', error.message, 'error');
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
        
        // Búsqueda
        const searchInput = document.getElementById('quotesSearch');
        const statusFilter = document.getElementById('quotesStatusFilter');
        const searchButton = document.getElementById('quotesSearchButton');
        const clearButton = document.getElementById('quotesClearButton');
        
        const runQuoteSearch = () => {
            currentSearch = searchInput ? searchInput.value.trim() : '';
            currentStatus = statusFilter ? statusFilter.value : currentStatus;
            currentPage = 1;
            refreshQuotesTable();
        };

        if (searchButton) searchButton.addEventListener('click', runQuoteSearch);
        
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                runQuoteSearch();
            });
        }
        
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                currentStatus = statusFilter.value;
                currentPage = 1;
                refreshQuotesTable();
            });
        }
        
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                statusFilter.value = '';
                currentSearch = '';
                currentStatus = '';
                currentPage = 1;
                refreshQuotesTable();
            });
        }
    }

    function initQuotesPanel() {
        const container = document.getElementById('adminApp');
        if (!container) return;
        
        bindModalEvents();
        refreshQuotesTable();
    }

    // Exponer función para uso externo
    window.UltraQuotesMysqlAdmin = {
        init: initQuotesPanel,
        render: renderQuotesPanel,
        refresh: refreshQuotesTable
    };

    // Auto-inicializar si estamos en la página de cotizaciones
    if (false && window.location.pathname === '/admin/cotizaciones/') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                const container = document.getElementById('adminApp');
                if (container) {
                    // Insertar el panel después del contenido existente
                    const mainContent = container.querySelector('.admin-main');
                    if (mainContent) {
                        const quotesPanel = document.createElement('div');
                        quotesPanel.id = 'quotesMysqlPanel';
                        quotesPanel.dataset.quotesMysql = 'true';
                        quotesPanel.innerHTML = renderQuotesPanel();
                        mainContent.appendChild(quotesPanel);
                        bindModalEvents();
                        refreshQuotesTable();
                    }
                }
            }, 100);
        });
    }
})();

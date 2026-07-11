(function () {
    const isBrands = window.location.pathname === '/admin/marcas/';
    const type = isBrands ? 'brands' : 'categories';
    const title = isBrands ? 'Marcas' : 'Categorías';
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    let items = [];

    async function adminFetch(input, init) {
        const response = await fetch(input, init);
        if (response.status === 401) {
            const sessionKey = window.ultraAdminData?.sessionKey || 'ultraAdminSession';
            localStorage.removeItem(sessionKey);
            sessionStorage.setItem('ultraAdminSessionMessage', 'Tu sesión venció. Inicia sesión nuevamente.');
            window.location.href = window.ultraAdminData?.loginPath || '/login/';
            throw new Error('Sesión vencida');
        }
        return response;
    }

    function render() {
        return `<section class="admin-panel">
            <div class="admin-panel-header"><div><h2>${title}</h2><p>Catálogo administrable desde MySQL.</p></div></div>
            <form id="taxonomyForm" class="admin-form">
                <input name="id" type="hidden">
                <div class="admin-form-grid">
                    <label>Nombre <input name="name" required></label>
                    <label>Slug (opcional) <input name="slug" placeholder="Se genera automáticamente"></label>
                </div>
                <div class="admin-form-actions">
                    <button class="primary-button" id="taxonomySubmitButton" type="submit">Agregar</button>
                    <button class="secondary-button" id="taxonomyCancelButton" type="button" hidden>Cancelar edición</button>
                </div>
                <div id="taxonomyMessage" class="admin-form-message"></div>
            </form>
            <div id="taxonomyList"><p>Cargando...</p></div>
        </section>`;
    }

    async function load() {
        const response = await adminFetch(`/api/admin/${type}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'No se pudo cargar');
        items = data.items || [];
        document.getElementById('taxonomyList').innerHTML = `<table class="admin-table">
            <thead><tr><th>Nombre</th><th>Slug</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${items.map(item => `<tr>
                <td>${escapeHtml(item.name)}</td>
                <td><code>${escapeHtml(item.slug)}</code></td>
                <td><span class="badge ${item.active ? 'badge-success' : 'badge-secondary'}">${item.active ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <button class="admin-link taxonomy-edit" data-id="${item.id}">Editar</button>
                    <button class="admin-link taxonomy-toggle" data-id="${item.id}">${item.active ? 'Desactivar' : 'Activar'}</button>
                    <button class="admin-link taxonomy-remove" data-id="${item.id}">Eliminar</button>
                </td>
            </tr>`).join('')}</tbody>
        </table>`;
        document.querySelectorAll('.taxonomy-edit').forEach(button => button.addEventListener('click', () => {
            const item = items.find(entry => entry.id === Number(button.dataset.id));
            const form = document.getElementById('taxonomyForm');
            if (!item || !form) return;
            form.id.value = item.id;
            form.name.value = item.name;
            form.slug.value = item.slug;
            document.getElementById('taxonomySubmitButton').textContent = 'Guardar cambios';
            document.getElementById('taxonomyCancelButton').hidden = false;
            form.name.focus();
        }));
        document.querySelectorAll('.taxonomy-toggle').forEach(button => button.addEventListener('click', async () => {
            const item = items.find(entry => entry.id === Number(button.dataset.id));
            if (!item) return;
            await adminFetch(`/api/admin/${type}/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: item.name, slug: item.slug, active: !item.active })
            });
            await load();
        }));
        document.querySelectorAll('.taxonomy-remove').forEach(button => button.addEventListener('click', async () => {
            const item = items.find(entry => entry.id === Number(button.dataset.id));
            if (!item || !confirm(`¿Eliminar definitivamente "${item.name}"?`)) return;
            await adminFetch(`/api/admin/${type}/${item.id}?permanent=1`, { method: 'DELETE' });
            await load();
        }));
    }

    function init() {
        const form = document.getElementById('taxonomyForm');
        if (!form) return;
        const cancelButton = document.getElementById('taxonomyCancelButton');
        const resetForm = () => {
            form.reset();
            form.id.value = '';
            document.getElementById('taxonomySubmitButton').textContent = 'Agregar';
            cancelButton.hidden = true;
        };
        cancelButton.addEventListener('click', resetForm);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const editing = Boolean(form.id.value);
            const response = await adminFetch(`/api/admin/${type}${editing ? `/${form.id.value}` : ''}`, {
                method: editing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: form.name.value, slug: form.slug.value, active: true })
            });
            const data = await response.json();
            const message = document.getElementById('taxonomyMessage');
            message.textContent = response.ok ? `${title.slice(0, -1)} guardada correctamente` : data.message;
            if (response.ok) {
                resetForm();
                await load();
            }
        });
        load().catch(error => { document.getElementById('taxonomyList').textContent = error.message; });
    }

    window.UltraTaxonomyAdmin = { render, init };
})();

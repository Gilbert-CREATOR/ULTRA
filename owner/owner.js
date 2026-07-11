(function () {
    const form = document.getElementById('ownerLicenseForm');
    const message = document.getElementById('ownerMessage');
    const logoutButton = document.getElementById('ownerLogout');

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `owner-message ${type}`;
    }

    async function ensureOwnerSession() {
        const response = await fetch('/api/admin/session', { cache: 'no-store' });
        if (!response.ok) {
            window.location.href = '/login/';
            return false;
        }

        const session = await response.json();
        if (!session.owner) {
            document.body.innerHTML = `
                <main class="owner-shell">
                    <section class="owner-card">
                        <div class="owner-brand">
                            <img src="/GENERAL/logo-ultrasoft.svg" alt="Ultra">
                            <div>
                                <span>Acceso privado</span>
                                <h1>No autorizado</h1>
                            </div>
                        </div>
                        <p class="owner-intro">Esta zona solo está disponible para el owner del proyecto.</p>
                        <div class="owner-actions">
                            <a href="/">Volver al inicio</a>
                            <button type="button" class="ghost" id="ownerForbiddenLogout">Cerrar sesión</button>
                        </div>
                    </section>
                </main>
            `;
            document.getElementById('ownerForbiddenLogout')?.addEventListener('click', logout);
            return false;
        }

        return true;
    }

    async function loadLicense() {
        const response = await fetch('/api/admin/license', { cache: 'no-store' });
        if (!response.ok) throw new Error('No se pudo cargar el estado del sitio.');
        const license = await response.json();
        form.status.value = license.status || 'active';
        form.title.value = license.title || '';
        form.message.value = license.message || '';
    }

    async function saveLicense(event) {
        event.preventDefault();
        showMessage('Guardando...', 'success');

        try {
            const response = await fetch('/api/admin/license', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: form.status.value,
                    title: form.title.value.trim(),
                    message: form.message.value.trim()
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'No se pudo guardar el estado.');
            }

            showMessage('Estado actualizado correctamente.', 'success');
        } catch (error) {
            showMessage(error.message, 'error');
        }
    }

    async function logout() {
        await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
        localStorage.removeItem('ultraAdminSession');
        sessionStorage.removeItem('ultraAdminRole');
        window.location.href = '/';
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            if (!await ensureOwnerSession()) return;
            await loadLicense();
        } catch (error) {
            showMessage(error.message || 'No se pudo preparar la vista owner.', 'error');
        }
    });

    form?.addEventListener('submit', saveLicense);
    logoutButton?.addEventListener('click', logout);
})();

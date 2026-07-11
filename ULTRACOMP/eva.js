(function () {
    if (!document.querySelector('.floating-mascot')) {
        document.body.insertAdjacentHTML('beforeend', `
            <aside class="floating-mascot" aria-label="EVA, mascota de Ultracomp">
                <div class="floating-mascot-message">
                    <strong>Hola, soy EVA</strong>
                    <span>Te acompaño por Ultracomp</span>
                </div>
                <model-viewer class="ultracomp-mascot" src="/ULTRACOMP/eva.glb"
                    alt="EVA, robot mascota de Ultracomp" camera-orbit="0deg 75deg auto"
                    shadow-intensity="1.2" shadow-softness=".8" exposure="1.05"
                    environment-image="neutral" interaction-prompt="none"
                    loading="eager"></model-viewer>
            </aside>
            <section class="eva-assistant-panel" id="evaAssistantPanel" aria-hidden="true" aria-label="Asistente EVA">
                <header class="eva-assistant-header">
                    <div><strong>EVA</strong><span>Asistente de Ultracomp</span></div>
                    <button type="button" id="closeEvaAssistant" aria-label="Cerrar asistente">&times;</button>
                </header>
                <div class="eva-assistant-body">
                    <p>¡Hola! Puedo ayudarte a encontrar productos o llevarte directamente a lo que necesitas.</p>
                    <form class="eva-search-form" id="evaSearchForm">
                        <input id="evaSearchInput" type="search" placeholder="¿Qué producto buscas?" aria-label="Buscar producto">
                        <button type="submit">Buscar</button>
                    </form>
                    <div class="eva-quick-actions">
                        <a href="/ULTRACOMP/productos.html">Ver productos</a>
                        <a href="/ULTRACOMP/productos.html?category=computers">Computadoras</a>
                        <a href="/ULTRACOMP/productos.html?category=printers">Impresoras</a>
                        <a href="/ULTRASOFT/ultrasoft.html">Ir a ULTRASOFT</a>
                        <a href="/mi-cotizacion">Mi cotización</a>
                        <a href="https://wa.me/18095726552?text=Hola%20EVA%2C%20necesito%20ayuda%20con%20Ultracomp" target="_blank" rel="noopener">Hablar por WhatsApp</a>
                    </div>
                </div>
            </section>
        `);
    }

    const mascot = document.querySelector('.floating-mascot');
    const dragTarget = mascot && mascot.querySelector('.ultracomp-mascot');
    const message = document.querySelector('.floating-mascot-message');
    const assistantPanel = document.getElementById('evaAssistantPanel');
    const closeAssistant = document.getElementById('closeEvaAssistant');
    const searchForm = document.getElementById('evaSearchForm');
    const searchInput = document.getElementById('evaSearchInput');
    if (!mascot || !dragTarget) return;

    const positionKey = 'ultracompEvaPositionV2';
    let dragState = null;

    function clampPosition(left, top) {
        const margin = 4;
        const maxLeft = Math.max(margin, window.innerWidth - mascot.offsetWidth - margin);
        const maxTop = Math.max(margin, window.innerHeight - mascot.offsetHeight - margin);
        return {
            left: Math.min(maxLeft, Math.max(margin, left)),
            top: Math.min(maxTop, Math.max(margin, top))
        };
    }

    function setPosition(left, top, persist = false) {
        const position = clampPosition(left, top);
        mascot.style.left = `${position.left}px`;
        mascot.style.top = `${position.top}px`;
        mascot.style.right = 'auto';
        mascot.style.bottom = 'auto';
        if (persist) localStorage.setItem(positionKey, JSON.stringify(position));
    }

    function restorePosition() {
        try {
            const saved = JSON.parse(localStorage.getItem(positionKey));
            if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
                setPosition(saved.left, saved.top);
            }
        } catch {
            localStorage.removeItem(positionKey);
        }
    }

    dragTarget.addEventListener('pointerdown', event => {
        const rect = mascot.getBoundingClientRect();
        dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top
        };
        dragTarget.setPointerCapture(event.pointerId);
        mascot.classList.add('is-dragging');
        event.preventDefault();
    });

    dragTarget.addEventListener('pointermove', event => {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 7) {
            dragState.moved = true;
        }
        if (!dragState.moved) return;
        setPosition(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
    });

    function finishDrag(event) {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        const wasMoved = dragState.moved;
        if (wasMoved) {
            const rect = mascot.getBoundingClientRect();
            setPosition(rect.left, rect.top, true);
        }
        dragState = null;
        mascot.classList.remove('is-dragging');
        if (!wasMoved && assistantPanel) {
            mascot.classList.remove('is-reacting');
            void mascot.offsetWidth;
            mascot.classList.add('is-reacting');
            window.setTimeout(() => {
                mascot.classList.remove('is-reacting');
                const willOpen = !assistantPanel.classList.contains('is-open');
                assistantPanel.classList.toggle('is-open', willOpen);
                assistantPanel.setAttribute('aria-hidden', String(!willOpen));
                if (willOpen) window.setTimeout(() => searchInput?.focus(), 150);
            }, 560);
        }
    }

    dragTarget.addEventListener('pointerup', finishDrag);
    dragTarget.addEventListener('pointercancel', finishDrag);
    window.addEventListener('resize', () => {
        const rect = mascot.getBoundingClientRect();
        setPosition(rect.left, rect.top, true);
    });

    restorePosition();
    if (message) {
        window.setTimeout(() => message.classList.add('is-hidden'), 4500);
    }

    closeAssistant?.addEventListener('click', () => {
        assistantPanel.classList.remove('is-open');
        assistantPanel.setAttribute('aria-hidden', 'true');
    });

    searchForm?.addEventListener('submit', event => {
        event.preventDefault();
        const query = searchInput.value.trim();
        if (!query) {
            searchInput.focus();
            return;
        }
        window.location.href = `/ULTRACOMP/productos.html?search=${encodeURIComponent(query)}`;
    });
})();

(async function () {
    let TESTIMONIALS = {
        ultracomp: [
            { id: 1, name: 'Juan Pérez', role: 'Gerente de operaciones', company: 'Empresa comercial', avatar: '👨🏽‍💼', rating: 5, reviewText: 'Ultracomp entendió exactamente lo que necesitábamos. Recibimos equipos confiables, configurados y listos para trabajar desde el primer día.', featured: true },
            { id: 2, name: 'María Rodríguez', role: 'Emprendedora', company: 'Negocio independiente', avatar: '👩🏻‍💻', rating: 5, reviewText: 'La asesoría hizo toda la diferencia. Me ayudaron a elegir la computadora correcta sin venderme cosas que realmente no necesitaba.', featured: true },
            { id: 3, name: 'Carlos Gómez', role: 'Creador de contenido', company: 'Estudio creativo', avatar: '🧑🏾‍🎮', rating: 4.9, reviewText: 'Mi equipo para gaming y edición quedó excelente. El rendimiento, la atención y el seguimiento después de la compra fueron impecables.', featured: false },
            { id: 4, name: 'Laura Méndez', role: 'Coordinadora académica', company: 'Centro educativo', avatar: '👩🏽‍🏫', rating: 5, reviewText: 'Equipamos nuestro laboratorio con el acompañamiento de Ultracomp. Todo llegó organizado y el soporte ha sido rápido cuando lo necesitamos.', featured: true }
        ],
        ultrasoft: [
            { id: 1, name: 'Andrés Castillo', role: 'Director comercial', company: 'Distribuidora regional', avatar: '👨🏻‍💼', rating: 5, reviewText: 'Pasamos de reportes manuales a información centralizada en tiempo real. Ahora el equipo decide más rápido y con datos confiables.', featured: true },
            { id: 2, name: 'Paola Jiménez', role: 'Líder de procesos', company: 'Servicios empresariales', avatar: '👩🏾‍🔬', rating: 4.9, reviewText: 'Ultrasoft convirtió un proceso lento y repetitivo en un flujo simple. La implementación fue clara y el equipo siempre estuvo disponible.', featured: true },
            { id: 3, name: 'Miguel Santos', role: 'Fundador', company: 'Startup tecnológica', avatar: '🧑🏻‍🚀', rating: 5, reviewText: 'Construimos nuestra primera versión en menos tiempo del esperado. El producto se siente sólido, moderno y preparado para crecer.', featured: true },
            { id: 4, name: 'Sofía Valdez', role: 'Gerente administrativa', company: 'Grupo empresarial', avatar: '👩🏼‍💼', rating: 5, reviewText: 'La nueva plataforma nos dio control sobre inventario, ventas y cuentas. Hoy tenemos una operación mucho más ordenada y medible.', featured: false }
        ]
    };

    const METRICS = {
        ultracomp: [
            { value: '500+', label: 'productos disponibles', description: 'Tecnología para cada necesidad' },
            { value: '4.9/5', label: 'valoración promedio', description: 'Experiencias verificadas' },
            { value: '15+', label: 'años de experiencia', description: 'Asesoría que da confianza' },
            { value: '99%', label: 'clientes satisfechos', description: 'Atención antes y después' }
        ],
        ultrasoft: [
            { value: '10+', label: 'proyectos completados', description: 'Soluciones entregadas' },
            { value: '4.9/5', label: 'valoración promedio', description: 'Experiencias verificadas' },
            { value: '5+', label: 'años de experiencia', description: 'Tecnología con criterio' },
            { value: '99%', label: 'clientes satisfechos', description: 'Relaciones de largo plazo' }
        ]
    };

    const BADGES = ['Top Rated', 'Reseñas verificadas', 'Socio confiable', 'Soporte especializado'];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
        const response = await fetch('/api/content');
        if (response.ok) {
            const payload = await response.json();
            const saved = payload.content && payload.content.testimonials;
            ['ultracomp', 'ultrasoft'].forEach(brand => {
                if (saved && Array.isArray(saved[brand]) && saved[brand].length) {
                    TESTIMONIALS[brand] = saved[brand];
                }
            });
        }
    } catch (error) {
        console.warn('No se pudieron cargar los testimonios administrables:', error.message);
    }

    function stars(rating) {
        return `${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))}`;
    }

    function createMarkup(section, brand) {
        const title = brand === 'ultrasoft' ? 'Clientes que confían en nosotros' : 'Lo que dicen nuestros clientes';
        section.innerHTML = `
            <div class="scroll-testimonials-stage">
                <div class="scroll-testimonials-sticky">
                    <div class="scroll-testimonials-inner">
                        <header class="scroll-testimonials-heading">
                            <span>Confianza comprobada</span>
                            <h2 id="${brand}TestimonialsTitle">${title}</h2>
                            <p>Experiencias humanas, resultados medibles y relaciones construidas para durar.</p>
                        </header>
                        <div class="scroll-testimonials-layout">
                            <div class="scroll-testimonial-users" role="tablist" aria-label="Seleccionar testimonio"></div>
                            <article class="scroll-testimonial-quote" aria-live="polite">
                                <div class="scroll-testimonial-topline">
                                    <div class="scroll-testimonial-rating"><span></span><strong></strong></div>
                                </div>
                                <blockquote></blockquote>
                                <footer>
                                    <span class="scroll-testimonial-avatar"></span>
                                    <div><strong></strong><span></span><small></small></div>
                                </footer>
                            </article>
                        </div>
                        <div class="scroll-testimonial-navigation">
                            <span class="scroll-testimonial-counter">01 / 04</span>
                            <div class="scroll-testimonial-progress" aria-hidden="true"><span></span></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="scroll-testimonials-inner">
                <section class="testimonial-proof" aria-label="Métricas de confianza">
                    <div class="testimonial-proof-heading"><span>Números</span><h3>Resultados que respaldan cada palabra</h3></div>
                    <div class="testimonial-metrics"></div>
                    <div class="testimonial-badges"></div>
                </section>
            </div>`;
    }

    function init(section) {
        const brand = section.dataset.testimonialBrand || (section.classList.contains('scroll-testimonials-ultrasoft') ? 'ultrasoft' : 'ultracomp');
        const testimonials = TESTIMONIALS[brand];
        createMarkup(section, brand);

        const users = section.querySelector('.scroll-testimonial-users');
        const quote = section.querySelector('.scroll-testimonial-quote');
        const progress = section.querySelector('.scroll-testimonial-progress span');
        const counter = section.querySelector('.scroll-testimonial-counter');
        const stage = section.querySelector('.scroll-testimonials-stage');
        let activeIndex = 0;
        let ready = false;

        testimonials.forEach((item, index) => {
            const button = document.createElement('button');
            button.className = 'scroll-testimonial-user';
            button.type = 'button';
            button.role = 'tab';
            button.setAttribute('aria-label', `Ver testimonio de ${item.name}`);
            button.innerHTML = `<span>${item.avatar}</span><span class="testimonial-user-copy"><strong>${item.name}</strong><small>${item.role} · ${item.company}</small></span>`;
            button.addEventListener('click', () => {
                const stageTop = window.scrollY + stage.getBoundingClientRect().top;
                const scrollable = Math.max(1, stage.offsetHeight - window.innerHeight);
                window.scrollTo({
                    top: stageTop + scrollable * ((index + .08) / testimonials.length),
                    behavior: reduceMotion ? 'auto' : 'smooth'
                });
            });
            users.appendChild(button);
        });

        METRICS[brand].forEach(item => {
            section.querySelector('.testimonial-metrics').insertAdjacentHTML('beforeend', `<article><strong>${item.value}</strong><span>${item.label}</span><small>${item.description}</small></article>`);
        });
        BADGES.forEach(item => section.querySelector('.testimonial-badges').insertAdjacentHTML('beforeend', `<span>✓ ${item}</span>`));

        function render(index) {
            const item = testimonials[index];
            if (ready && index === activeIndex) return;
            activeIndex = index;
            Array.from(users.children).forEach((button, buttonIndex) => {
                const selected = buttonIndex === index;
                button.classList.toggle('active', selected);
                button.setAttribute('aria-selected', String(selected));
                button.tabIndex = selected ? 0 : -1;
            });
            quote.classList.add('is-changing');
            window.setTimeout(() => {
                quote.querySelector('.scroll-testimonial-rating span').textContent = stars(item.rating);
                quote.querySelector('.scroll-testimonial-rating strong').textContent = item.rating.toFixed(1);
                quote.querySelector('blockquote').textContent = `“${item.reviewText}”`;
                quote.querySelector('.scroll-testimonial-avatar').textContent = item.avatar;
                quote.querySelector('footer strong').textContent = item.name;
                quote.querySelector('footer span').textContent = item.role;
                quote.querySelector('footer small').textContent = item.company;
                quote.classList.remove('is-changing');
                const activeButton = users.children[index];
                if (users.scrollWidth > users.clientWidth) {
                    users.scrollTo({
                        left: activeButton.offsetLeft - (users.clientWidth - activeButton.offsetWidth) / 2,
                        behavior: reduceMotion ? 'auto' : 'smooth'
                    });
                }
            }, reduceMotion ? 0 : 170);
            counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(testimonials.length).padStart(2, '0')}`;
            ready = true;
        }

        function updateFromScroll() {
            const rect = stage.getBoundingClientRect();
            const scrollable = Math.max(1, stage.offsetHeight - window.innerHeight);
            const scrollProgress = Math.min(1, Math.max(0, -rect.top / scrollable));
            const index = Math.min(testimonials.length - 1, Math.floor(scrollProgress * testimonials.length));
            progress.style.transform = `scaleX(${Math.max(.02, scrollProgress)})`;
            render(index);
        }

        users.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
            const next = (activeIndex + direction + testimonials.length) % testimonials.length;
            users.children[next].click();
            users.children[next].focus({ preventScroll: true });
        });

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(() => {
                updateFromScroll();
                ticking = false;
            });
        }, { passive: true });
        window.addEventListener('resize', updateFromScroll);
        render(0);
        updateFromScroll();
    }

    document.querySelectorAll('.scroll-testimonials').forEach(init);
})();

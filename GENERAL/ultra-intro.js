(function () {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (document.getElementById('ultraIntro')) return;

    // Detectar la marca de la página actual y de dónde viene el usuario
    const currentBrand = document.body.dataset.ultraBrand || '';
    // La dirección: si estamos en ultrasoft, el usuario viene de ultracomp, y viceversa.
    // También aceptamos ?from=ultracomp / ?from=ultrasoft en la URL (para links explícitos).
    const urlParams = new URLSearchParams(window.location.search);
    const fromParam = urlParams.get('from') || '';
    let fromBrand = fromParam;

    if (!fromBrand) {
        try {
            const ref = document.referrer;
            if (ref) {
                if (/ultracomp/i.test(ref) || /\/ULTRACOMP\//i.test(ref)) {
                    fromBrand = 'ultracomp';
                } else if (/ultrasoft/i.test(ref) || /\/ULTRASOFT\//i.test(ref)) {
                    fromBrand = 'ultrasoft';
                }
            }
        } catch (_) {}
    }

    // Orden de las palabras: primero la marca origen, luego la destino.
    // Si no hay referrer o es la primera visita, por defecto ULTRACOMP → ULTRASOFT.
    let firstLabel = 'ULTRACOMP';
    let secondLabel = 'ULTRASOFT';

    if (fromBrand === 'ultracomp' && currentBrand === 'ultrasoft') {
        // Viniendo de Ultracomp hacia Ultrasoft: primero ULTRACOMP, luego ULTRASOFT ✓ (default)
        firstLabel = 'ULTRACOMP';
        secondLabel = 'ULTRASOFT';
    } else if (fromBrand === 'ultrasoft' && currentBrand === 'ultracomp') {
        // Viniendo de Ultrasoft hacia Ultracomp: primero ULTRASOFT, luego ULTRACOMP
        firstLabel = 'ULTRASOFT';
        secondLabel = 'ULTRACOMP';
    }

    const intro = document.createElement('div');
    intro.id = 'ultraIntro';
    intro.className = 'ultra-intro';
    intro.setAttribute('aria-hidden', 'true');

    intro.innerHTML = `
        <div class="ultra-intro-stage">
            <span class="ultra-intro-ripple ultra-intro-ripple-one"></span>
            <span class="ultra-intro-ripple ultra-intro-ripple-two"></span>
            <span class="ultra-intro-ripple ultra-intro-ripple-three"></span>

            <div class="ultra-intro-badge" aria-label="${firstLabel} y ${secondLabel}">
                <div class="ultra-intro-round">
                    <svg class="ultra-intro-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Logo Ultra">
                        <defs>
                            <path id="ultraIntroBlade" d="M -38,-38 Q -15,-26 -10,-10 Q -26,-15 -38,-38"/>
                        </defs>
                        <g transform="translate(50, 50)">
                            <g transform="rotate(0)">
                                <use class="ultra-intro-blade ultra-intro-blade-1" href="#ultraIntroBlade" fill="#0066ff"/>
                            </g>
                            <g transform="rotate(90)">
                                <use class="ultra-intro-blade ultra-intro-blade-2" href="#ultraIntroBlade" fill="#0066ff"/>
                            </g>
                            <g transform="rotate(180)">
                                <use class="ultra-intro-blade ultra-intro-blade-3" href="#ultraIntroBlade" fill="#0066ff"/>
                            </g>
                            <g transform="rotate(270)">
                                <use class="ultra-intro-blade ultra-intro-blade-4" href="#ultraIntroBlade" fill="#0066ff"/>
                            </g>
                            <circle class="ultra-intro-dot ultra-intro-dot-1" cx="0" cy="-28" r="13" fill="#f5aba6"/>
                            <circle class="ultra-intro-dot ultra-intro-dot-2" cx="0" cy="28" r="13" fill="#badcf5"/>
                            <circle class="ultra-intro-dot ultra-intro-dot-3" cx="-28" cy="0" r="13" fill="#cce8c3"/>
                            <circle class="ultra-intro-dot ultra-intro-dot-4" cx="28" cy="0" r="13" fill="#fceda8"/>
                        </g>
                    </svg>
                </div>

                <div class="ultra-intro-name-mask">
                    <div class="ultra-intro-word" aria-label="${firstLabel} y ${secondLabel}">
                        <span class="ultra-intro-word-item ultra-intro-word-first">${firstLabel}</span>
                        <span class="ultra-intro-word-item ultra-intro-word-second">${secondLabel}</span>
                    </div>
                </div>
            </div>

            <div class="ultra-intro-progress"><span></span></div>
        </div>
    `;

    document.documentElement.classList.add('ultra-intro-lock');
    document.body.prepend(intro);

    const duration = reducedMotion ? 650 : 4300;

    window.setTimeout(() => {
        intro.classList.add('is-leaving');
        window.setTimeout(() => {
            intro.remove();
            document.documentElement.classList.remove('ultra-intro-lock');
        }, reducedMotion ? 40 : 460);
    }, duration);
})();

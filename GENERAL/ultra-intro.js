(function () {
    const path = window.location.pathname.toLowerCase();
    const title = document.title.toLowerCase();
    const body = document.body;
    const isUltrasoft = path.includes('ultrasoft') || title.includes('ultrasoft') || body.classList.contains('ultrasoft-page');
    const brand = isUltrasoft ? 'ULTRASOFT' : 'ULTRACOMP';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (document.getElementById('ultraIntro')) return;

    if (!customElements.get('model-viewer') && !document.querySelector('script[src*="model-viewer"]')) {
        const modelViewerScript = document.createElement('script');
        modelViewerScript.type = 'module';
        modelViewerScript.src = '/GENERAL/model-viewer.min.js?v=20260719-intro';
        document.head.appendChild(modelViewerScript);
    }

    const intro = document.createElement('div');
    intro.id = 'ultraIntro';
    intro.className = `ultra-intro ${isUltrasoft ? 'ultra-intro-ultrasoft' : 'ultra-intro-ultracomp'}`;
    intro.setAttribute('aria-hidden', 'true');

    intro.innerHTML = `
        <div class="ultra-intro-stage">
            <div class="ultra-intro-orbit"></div>
            <div class="ultra-intro-logo">
                <svg class="ultra-intro-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${brand}">
                    <defs>
                        <path id="ultraIntroBlade" d="M -38,-38 Q -15,-26 -10,-10 Q -26,-15 -38,-38"/>
                    </defs>
                    <g transform="translate(50, 50)">
                        <use class="ultra-intro-blade ultra-intro-blade-1" href="#ultraIntroBlade" fill="#0066ff"/>
                        <use class="ultra-intro-blade ultra-intro-blade-2" href="#ultraIntroBlade" fill="#0066ff" transform="rotate(90)"/>
                        <use class="ultra-intro-blade ultra-intro-blade-3" href="#ultraIntroBlade" fill="#0066ff" transform="rotate(180)"/>
                        <use class="ultra-intro-blade ultra-intro-blade-4" href="#ultraIntroBlade" fill="#0066ff" transform="rotate(270)"/>
                        <circle class="ultra-intro-dot ultra-intro-dot-1" cx="0" cy="-28" r="13" fill="#f5aba6"/>
                        <circle class="ultra-intro-dot ultra-intro-dot-2" cx="0" cy="28" r="13" fill="#badcf5"/>
                        <circle class="ultra-intro-dot ultra-intro-dot-3" cx="-28" cy="0" r="13" fill="#cce8c3"/>
                        <circle class="ultra-intro-dot ultra-intro-dot-4" cx="28" cy="0" r="13" fill="#fceda8"/>
                    </g>
                </svg>
                <div class="ultra-intro-word"><span>${brand}</span></div>
            </div>
            <div class="ultra-intro-eva">
                <span class="ultra-intro-eva-shadow"></span>
                <model-viewer
                    class="ultra-intro-eva-model"
                    src="/ULTRACOMP/eva.glb?v=20260719-intro"
                    alt="EVA"
                    camera-orbit="0deg 74deg 115%"
                    field-of-view="28deg"
                    exposure="1.12"
                    shadow-intensity="0.75"
                    interaction-prompt="none"
                    disable-zoom
                    autoplay>
                </model-viewer>
                <span class="ultra-intro-eva-fallback">
                    <span class="ultra-intro-eva-arm left"></span>
                    <span class="ultra-intro-eva-arm right"></span>
                    <span class="ultra-intro-eva-body"></span>
                    <span class="ultra-intro-eva-head">
                        <span class="ultra-intro-eva-face">
                            <i class="ultra-intro-eva-eye"></i>
                            <i class="ultra-intro-eva-eye"></i>
                        </span>
                    </span>
                </span>
                <span class="ultra-intro-spark"></span>
            </div>
            <div class="ultra-intro-progress"><span></span></div>
        </div>
    `;

    document.documentElement.classList.add('ultra-intro-lock');
    body.prepend(intro);

    const startedAt = Date.now();
    const minimumDuration = reducedMotion ? 650 : 2850;
    const maximumDuration = reducedMotion ? 700 : 4700;
    let evaSettled = reducedMotion;
    let finished = false;

    const evaModel = intro.querySelector('.ultra-intro-eva-model');
    if (evaModel) {
        evaModel.addEventListener('load', () => {
            evaSettled = true;
            intro.classList.add('ultra-intro-has-real-eva');
            requestFinish();
        }, { once: true });

        evaModel.addEventListener('error', () => {
            evaSettled = true;
            intro.classList.add('ultra-intro-has-fallback-eva');
            requestFinish();
        }, { once: true });
    }

    window.setTimeout(() => {
        if (!intro.classList.contains('ultra-intro-has-real-eva')) {
            intro.classList.add('ultra-intro-show-fallback');
        }
    }, reducedMotion ? 80 : 950);

    const finishIntro = () => {
        if (finished) return;
        finished = true;
        intro.classList.add('is-leaving');
        window.setTimeout(() => {
            intro.remove();
            document.documentElement.classList.remove('ultra-intro-lock');
        }, reducedMotion ? 40 : 460);
    };

    function requestFinish() {
        const elapsed = Date.now() - startedAt;

        if (elapsed >= minimumDuration && evaSettled) {
            finishIntro();
            return;
        }

        window.setTimeout(requestFinish, Math.max(80, minimumDuration - elapsed));
    }

    window.setTimeout(requestFinish, minimumDuration);
    window.setTimeout(() => {
        evaSettled = true;
        requestFinish();
    }, maximumDuration);
})();

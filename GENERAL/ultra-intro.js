(function () {
    const path = window.location.pathname.toLowerCase();
    const body = document.body;
    const isUltrasoft = path.includes('ultrasoft') || body.classList.contains('ultrasoft-page');
    const brand = isUltrasoft ? 'ULTRASOFT' : 'ULTRACOMP';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (document.getElementById('ultraIntro')) return;

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
                <span class="ultra-intro-eva-arm left"></span>
                <span class="ultra-intro-eva-arm right"></span>
                <span class="ultra-intro-eva-body"></span>
                <span class="ultra-intro-eva-head">
                    <span class="ultra-intro-eva-face">
                        <i class="ultra-intro-eva-eye"></i>
                        <i class="ultra-intro-eva-eye"></i>
                    </span>
                </span>
                <span class="ultra-intro-spark"></span>
            </div>
            <div class="ultra-intro-progress"><span></span></div>
        </div>
    `;

    document.documentElement.classList.add('ultra-intro-lock');
    body.prepend(intro);

    const finishIntro = () => {
        intro.classList.add('is-leaving');
        window.setTimeout(() => {
            intro.remove();
            document.documentElement.classList.remove('ultra-intro-lock');
        }, reducedMotion ? 40 : 460);
    };

    window.setTimeout(finishIntro, reducedMotion ? 700 : 2650);
})();

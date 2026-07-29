(async function () {
    function parts(value, count) {
        const result = String(value || '').split('|').map(item => item.trim());
        while (result.length < count) result.push('');
        return result;
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function singleEmoji(value, fallback) {
        const text = String(value || '').trim();
        const match = text.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/u);
        return match ? match[0] : fallback;
    }

    const benefitIcons = ['🛡️', '🛠️', '✅', '🤝'];
    const challengeIcons = ['🧾', '📉', '📦', '⚙️', '⏱️', '📊'];
    const workflowIcons = ['🤝', '🔎', '🎨', '💻', '🧪', '🚀', '🛟'];
    const advantageIcons = ['🧩', '💡', '📈', '🛟', '🔒', '🏢'];

    try {
        const response = await fetch('/api/content');
        if (!response.ok) return;
        const { content } = await response.json();
        const settings = content.settings || {};
        if (settings.favicon) {
            let favicon = document.querySelector('link[rel="icon"]');
            if (!favicon) {
                favicon = document.createElement('link');
                favicon.rel = 'icon';
                document.head.appendChild(favicon);
            }
            favicon.href = settings.favicon;
        }

        document.querySelectorAll('.nav-brand img').forEach(image => {
            if (settings.logo) image.src = settings.logo;
        });
        document.querySelectorAll('.site-footer p:first-child, footer .footer-inner p:first-child').forEach(element => {
            if (settings.copyright) element.textContent = settings.copyright;
        });
        document.querySelectorAll('body > footer, .site-footer').forEach(footer => {
            if (footer.closest('.scroll-testimonials')) return;
            if (footer.querySelector('.ultra-legal-links')) return;
            const links = document.createElement('p');
            links.className = 'ultra-legal-links';
            links.innerHTML = '<a href="/privacidad.html">Privacidad</a> · <a href="/terminos.html">Términos</a>';
            (footer.querySelector('.footer-inner') || footer).appendChild(links);
        });

        const phone = String(settings.ultracompWhatsapp || settings.whatsapp || '').replace(/\D/g, '');
        document.querySelectorAll('.eva-quick-actions a[href*="wa.me"]').forEach(link => {
            if (phone) link.href = `https://wa.me/${phone}?text=${encodeURIComponent('Hola, me gustaría recibir más información sobre sus servicios.')}`;
        });

        if (document.body.classList.contains('ultracomp-home')) {
            const data = content.ultracomp || {};
            const landing = data.landing || {};
            const set = (selector, value) => {
                const element = document.querySelector(selector);
                if (element && value) element.textContent = value;
            };
            set('.home-hero-copy h1', landing.heroTitle);
            set('.home-hero-copy > p', landing.heroSubtitle);
            set('.home-hero-copy .cta-button', landing.primaryCta);
            set('.home-hero-copy .secondary-cta', landing.secondaryCta);
            const grid = document.querySelector('#ultracompBenefits .services-grid');
            if (grid && Array.isArray(data.benefits)) {
                grid.innerHTML = data.benefits.map((value, index) => {
                    const [icon, title, description] = parts(value, 3);
                    const hasIcon = Boolean(icon.match(/\p{Extended_Pictographic}/u));
                    const cardTitle = hasIcon ? title : icon;
                    const cardDescription = hasIcon ? description : title;
                    return `<div class="service-card"><div class="service-icon" aria-hidden="true">${singleEmoji(hasIcon ? icon : '', benefitIcons[index % benefitIcons.length])}</div><div><strong>${escapeHtml(cardTitle)}</strong><div>${escapeHtml(cardDescription)}</div></div></div>`;
                }).join('');
            }
        }

        if (document.querySelector('.challenge-grid')) {
            const data = content.ultrasoft || {};
            if (Array.isArray(data.challenges)) {
                document.querySelector('.challenge-grid').innerHTML = data.challenges.map((value, index) => {
                    const [icon, title, description] = parts(value, 3);
                    const hasIcon = Boolean(icon.match(/\p{Extended_Pictographic}/u));
                    const cardTitle = hasIcon ? title : icon;
                    const cardDescription = hasIcon ? description : title;
                    return `<article class="challenge-card"><div class="icon" aria-hidden="true">${singleEmoji(hasIcon ? icon : '', challengeIcons[index % challengeIcons.length])}</div><h3>${escapeHtml(cardTitle)}</h3><p>${escapeHtml(cardDescription)}</p></article>`;
                }).join('');
            }
            if (Array.isArray(data.workflow)) {
                document.querySelector('.timeline-grid').innerHTML = data.workflow.map((value, index) => {
                    const [possibleIcon, titleOrDescription, finalDescription] = parts(value, 3);
                    const hasIcon = Boolean(possibleIcon.match(/\p{Extended_Pictographic}/u));
                    const title = hasIcon ? titleOrDescription : possibleIcon;
                    const description = hasIcon ? finalDescription : titleOrDescription;
                    return `<div class="timeline-step"><div class="timeline-badge"><span aria-hidden="true">${singleEmoji(hasIcon ? possibleIcon : '', workflowIcons[index % workflowIcons.length])}</span><small>${String(index + 1).padStart(2, '0')}</small></div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`;
                }).join('');
            }
            if (Array.isArray(data.advantages)) {
                document.querySelector('.advantages-grid').innerHTML = data.advantages.map((value, index) => `<div class="advantage-card"><span aria-hidden="true">${singleEmoji(value, advantageIcons[index % advantageIcons.length])}</span>${escapeHtml(String(value).replace(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu, '').trim() || value)}</div>`).join('');
            }
        }
    } catch (error) {
        console.warn('No se pudo aplicar el contenido administrable:', error.message);
    }
})();

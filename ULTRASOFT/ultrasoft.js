// Interactive functionality for Ultrasoft

const CONTACT_EMAIL = 'ultrasoftsolicitud@gmail.com';
let CONTACT_WHATSAPP = '8095726552';

document.addEventListener('DOMContentLoaded', function() {
    loadContactSettings();
    
    // Add smooth scrolling
    addSmoothScrolling();
    
    // Add animation on scroll
    addScrollAnimations();
    
    // Add reveal section animations
    addRevealAnimations();
    
    // Add counter animation
    addCounters();
    
    // Add hover effects
    addHoverEffects();
    
    // Add current year to footer if exists
    updateCurrentYear();
    
    // Add timeline scroll animations
    addTimelineAnimations();
});

async function loadContactSettings() {
    try {
        const response = await fetch('/api/content');
        if (!response.ok) throw new Error('No se pudo cargar configuración');
        const payload = await response.json();
        const settings = payload.content && payload.content.settings;
        CONTACT_WHATSAPP = sanitizePhone(settings && settings.whatsapp) || '8095726552';
        window.ultraContactSettings = {
            ...(window.ultraContactSettings || {}),
            whatsapp: CONTACT_WHATSAPP
        };
        configureWhatsAppLinks();
    } catch (error) {
        CONTACT_WHATSAPP = sanitizePhone(window.ultraContactSettings && window.ultraContactSettings.whatsapp) || '8095726552';
        configureWhatsAppLinks();
    }
}

function sanitizePhone(value) {
    return String(value || '').replace(/[^\d]/g, '');
}

function configureWhatsAppLinks() {
    document.querySelectorAll('[data-whatsapp-message]').forEach(link => {
        const message = link.dataset.whatsappMessage || 'Hola Ultrasoft';
        link.href = CONTACT_WHATSAPP ? `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(message)}` : '#';
        link.addEventListener('click', event => {
            if (!CONTACT_WHATSAPP) {
                event.preventDefault();
                showNotification('WhatsApp no está configurado todavía.');
            }
        });
    });
}

function getInterestFormModal() {
    return document.getElementById('interestForm');
}

function showInterestForm() {
    const modal = getInterestFormModal();
    if (!modal) return;

    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    
    // Add entrance animation
    setTimeout(() => {
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.transform = 'scale(1)';
            modalContent.style.opacity = '1';
        }
    }, 10);
}

function closeForm() {
    const modal = getInterestFormModal();
    if (!modal) return;

    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.style.transform = 'scale(0.8)';
        modalContent.style.opacity = '0';
    }
    
    setTimeout(() => {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = 'auto';
    }, 300);
}

async function handleSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    if (!form || form.tagName !== 'FORM') return;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    const contactData = {
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        service: data.service || '',
        message: data.message || ''
    };
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton ? submitButton.textContent : '';

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando...';
    }

    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contactData)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.message || 'No se pudo enviar la solicitud.');
        }

        showNotification('Solicitud enviada correctamente. Te contactaremos pronto.');
        form.reset();
        closeForm();
    } catch (error) {
        console.error('No se pudo enviar el formulario de Ultrasoft:', error);
        showNotification(error.message || 'No se pudo enviar la solicitud. Inténtalo nuevamente.');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    }
    return false;
}

function copyToClipboard(data) {
    const text = `
TO: ${CONTACT_EMAIL}
SUBJECT: Solicitud de contacto de ${data.from_name}

Nueva solicitud de contacto desde el sitio web de Ultrasoft:

Name: ${data.from_name}
Email: ${data.email}
Phone: ${data.phone}
Service: ${data.service}

Message:
${data.message}

---
Request sent on: ${new Date().toLocaleString()}
    `.trim();
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
    } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

function formatContactMessage(data) {
    return `
Nueva solicitud desde el sitio web de Ultrasoft:

Nombre: ${data.from_name}
Email: ${data.email}
Telefono: ${data.phone}
Servicio: ${data.service}

Mensaje:
${data.message}

Fecha: ${new Date(data.timestamp).toLocaleString()}
    `.trim();
}

function saveToLocalStorage(data) {
    // Save to localStorage as backup
    const requests = JSON.parse(localStorage.getItem('ultrasoftRequests') || '[]');
    requests.push({
        ...data,
        timestamp: new Date().toISOString()
    });
    localStorage.setItem('ultrasoftRequests', JSON.stringify(requests));
    
    console.log('Request saved to localStorage:', data);
}

function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Show with animation
    setTimeout(() => {
        notification.style.transform = 'translateY(0)';
        notification.style.opacity = '1';
    }, 10);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.transform = 'translateY(-100px)';
        notification.style.opacity = '0';
        
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 5000);
}

function addSmoothScrolling() {
    // Add smooth scroll behavior
    document.documentElement.style.scrollBehavior = 'smooth';
}

function addScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);
    
    // Observe all line containers
    document.querySelectorAll('.line-container').forEach(el => {
        observer.observe(el);
    });
}

function addRevealAnimations() {
    const reveals = document.querySelectorAll('.reveal');
    if (reveals.length === 0) return;

    const revealElements = () => {
        reveals.forEach(reveal => {
            const windowHeight = window.innerHeight;
            const revealTop = reveal.getBoundingClientRect().top;

            if (revealTop < windowHeight - 100) {
                reveal.classList.add('active');
            }
        });
    };

    window.addEventListener('scroll', revealElements);
    window.addEventListener('load', revealElements);
    revealElements();
}

function animateCounter(counter) {
    const target = parseFloat(counter.getAttribute('data-target')) || 0;
    const suffix = counter.getAttribute('data-suffix') || '';
    const decimalPlaces = target % 1 !== 0 ? 1 : 0;
    let current = 0;
    const increment = Math.max(target / 200, 0.1);

    const updateCounter = () => {
        current += increment;

        if (current >= target) {
            current = target;
        }

        counter.innerText = decimalPlaces
            ? current.toFixed(decimalPlaces) + suffix
            : Math.floor(current).toLocaleString() + suffix;

        if (current < target) {
            requestAnimationFrame(updateCounter);
        }
    };

    updateCounter();
}

function addCounters() {
    const counters = document.querySelectorAll('.counter');
    if (counters.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.5
    });

    counters.forEach(counter => {
        observer.observe(counter);
    });
}

function addHoverEffects() {
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple');
            
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });

    const faqList = document.querySelector('.faq-list');
    if (faqList && !faqList.dataset.bound) {
        faqList.dataset.bound = 'true';
        faqList.addEventListener('click', event => {
            const button = event.target.closest('.faq-question');
            if (!button) return;
            const item = button.closest('.faq-item');
            if (item) item.classList.toggle('active');
        });
    }
}

function updateCurrentYear() {
    const yearElements = document.querySelectorAll('.current-year');
    const currentYear = new Date().getFullYear();
    
    yearElements.forEach(el => {
        el.textContent = currentYear;
    });
}

function addTimelineAnimations() {
    const timelineItems = document.querySelectorAll('.timeline-item, .timeline-step');

    if (!timelineItems.length) return;

    if (!('IntersectionObserver' in window)) {
        timelineItems.forEach(item => item.classList.add('visible'));
        return;
    }

    const observerOptions = {
        threshold: 0.08,
        rootMargin: '0px 0px -40px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    timelineItems.forEach(item => observer.observe(item));
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modal = getInterestFormModal();
    if (modal && event.target === modal) {
        closeForm();
    }
});

// Add keyboard navigation for modal close
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = getInterestFormModal();
        if (modal && modal.style.display === 'block') {
            closeForm();
        }
    }
});

// Add loading animation
window.addEventListener('load', function() {
    document.body.classList.add('loaded');
});

// Function to view all contact requests (for admin)
function viewContactRequests() {
    const requests = JSON.parse(localStorage.getItem('ultrasoftRequests') || '[]');
    
    if (requests.length === 0) {
        showNotification('No contact requests found.');
        return;
    }
    
    console.log('=== ALL CONTACT REQUESTS ===');
    requests.forEach((request, index) => {
        console.log(`\nRequest #${index + 1}:`);
        console.log('Name:', request.from_name);
        console.log('Email:', request.email);
        console.log('Phone:', request.phone);
        console.log('Service:', request.service);
        console.log('Message:', request.message);
        console.log('Date:', new Date(request.timestamp).toLocaleString());
        console.log('---');
    });
    
    showNotification(`Found ${requests.length} contact request(s). Check console for details.`);
}

// Function to clear all requests (for admin)
function clearContactRequests() {
    if (confirm('Are you sure you want to clear all contact requests?')) {
        localStorage.removeItem('ultrasoftRequests');
        showNotification('All contact requests cleared.');
    }
}

// Add keyboard shortcuts for admin
document.addEventListener('keydown', function(e) {
    // Ctrl+Shift+V to view requests
    if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        viewContactRequests();
    }
    // Ctrl+Shift+C to clear requests
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        clearContactRequests();
    }
});

// Banner Carousel Functionality
let currentBannerIndex = 0;
let bannerInterval;
let bannerSlides;
let bannerDots;

function initBannerCarousel() {
    const bannerCarousel = document.querySelector('.banner-carousel');
    if (!bannerCarousel) return;

    bannerSlides = bannerCarousel.querySelectorAll('.banner-slide, .banner-card');
    bannerDots = document.querySelectorAll('.dot');
    const prevButton = document.querySelector('.banner-control.prev');
    const nextButton = document.querySelector('.banner-control.next');
    
    if (prevButton) {
        prevButton.addEventListener('click', () => changeBanner(-1));
    }
    if (nextButton) {
        nextButton.addEventListener('click', () => changeBanner(1));
    }
    
    // Ensure first slide is active
    if (bannerSlides.length > 0) {
        bannerSlides.forEach((slide, index) => {
            slide.classList.remove('active');
            if (index === 0) {
                slide.classList.add('active');
            }
        });
        
        if (bannerDots.length > 0) {
            bannerDots.forEach((dot, index) => {
                dot.classList.remove('active');
                if (index === 0) {
                    dot.classList.add('active');
                }
            });
        }
        
        resetBannerInterval();
    }
}

function changeBanner(direction) {
    if (!bannerSlides || bannerSlides.length === 0) return;
    
    // Remove active class from current slide and dot
    bannerSlides[currentBannerIndex].classList.remove('active');
    if (bannerDots.length > 0) {
        bannerDots[currentBannerIndex].classList.remove('active');
    }
    
    // Calculate new index
    currentBannerIndex += direction;
    
    // Handle wrapping
    if (currentBannerIndex >= bannerSlides.length) {
        currentBannerIndex = 0;
    } else if (currentBannerIndex < 0) {
        currentBannerIndex = bannerSlides.length - 1;
    }
    
    // Add active class to new slide and dot
    bannerSlides[currentBannerIndex].classList.add('active');
    if (bannerDots.length > 0) {
        bannerDots[currentBannerIndex].classList.add('active');
    }
    
    // Reset auto-slide timer
    resetBannerInterval();
}

function currentBanner(index) {
    if (!bannerSlides || bannerSlides.length === 0) return;
    
    // Remove active class from current slide and dot
    bannerSlides[currentBannerIndex].classList.remove('active');
    if (bannerDots.length > 0) {
        bannerDots[currentBannerIndex].classList.remove('active');
    }
    
    // Set new index
    currentBannerIndex = index;
    
    // Add active class to new slide and dot
    bannerSlides[currentBannerIndex].classList.add('active');
    if (bannerDots.length > 0) {
        bannerDots[currentBannerIndex].classList.add('active');
    }
    
    // Reset auto-slide timer
    resetBannerInterval();
}

function resetBannerInterval() {
    clearInterval(bannerInterval);
    bannerInterval = setInterval(() => {
        changeBanner(1);
    }, 5000);
}

// Initialize banner carousel
document.addEventListener('DOMContentLoaded', function() {
    initBannerCarousel();
});

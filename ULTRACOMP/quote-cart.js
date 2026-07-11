// Sistema de Cotización Múltiple (Mi Cotización)
// Almacena productos para cotizar en localStorage

const QUOTE_CART_KEY = 'ultraQuoteCart';
const NOTIFICATION_TIMEOUT = 2000;
const MIN_QUANTITY = 1;
const WHATSAPP_PHONE_FALLBACK = '8095726552';

/**
 * Código único usado para cotizar: articulo_codigo desde articulo_servicio.
 */
function getArticuloCode(product) {
    const value = product?.articuloCode || product?.code || product?.productCode || product?.articulo_codigo || '';
    return value ? String(value) : 'N/A';
}

function getProductCode(product) {
    return getArticuloCode(product);
}

/**
 * Valida que un producto tenga los datos mínimos requeridos
 * @param {Object} product - Producto a validar
 * @returns {boolean} True si es válido
 */
function isValidProduct(product) {
    return product && product.id && product.name;
}

/**
 * Obtiene el carrito de localStorage con validación
 * @returns {Array} Array de productos en el carrito
 */
function getQuoteCart() {
    try {
        const cart = localStorage.getItem(QUOTE_CART_KEY);
        const parsed = cart ? JSON.parse(cart) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Error al leer carrito:', error);
        return [];
    }
}

/**
 * Guarda el carrito en localStorage
 * @param {Array} cart - Array de productos
 */
function saveQuoteCart(cart) {
    try {
        if (!Array.isArray(cart)) {
            throw new Error('El carrito debe ser un array');
        }
        localStorage.setItem(QUOTE_CART_KEY, JSON.stringify(cart));
        updateQuoteCartCounter();
    } catch (error) {
        console.error('Error al guardar carrito:', error);
    }
}

/**
 * Agrega un producto al carrito
 * @param {Object} product - Producto a agregar
 */
function addToQuoteCart(product) {
    if (!isValidProduct(product)) {
        console.error('Producto inválido:', product);
        showNotification('Error: Producto inválido');
        return;
    }

    const stock = Math.max(0, Number(product.stock ?? product.existence ?? 0));
    if (stock <= 0) {
        alert('Este producto no tiene unidades disponibles.');
        return;
    }

    const cart = getQuoteCart();
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
        if ((Number(existingItem.quantity) || 0) >= stock) {
            alert(`No hay más unidades disponibles. Existencia actual: ${stock}.`);
            return;
        }
        existingItem.quantity = (Number(existingItem.quantity) || 0) + 1;
        existingItem.stock = stock;
    } else {
        cart.push({
            id: product.id,
            code: getArticuloCode(product),
            articuloCode: getArticuloCode(product),
            name: product.name,
            image: product.image || '',
            price: product.price || '',
            priceNumeric: product.priceNumeric || null,
            sourceTable: product.sourceTable || 'articulo_servicio',
            updatedAtSource: product.updatedAtSource || null,
            stock,
            quantity: 1
        });
    }
    
    saveQuoteCart(cart);
    showNotification('Producto agregado a Mi Cotización');
}

/**
 * Elimina un producto del carrito
 * @param {string} productId - ID del producto a eliminar
 */
function removeFromQuoteCart(productId) {
    let cart = getQuoteCart();
    cart = cart.filter(item => item.id !== productId);
    saveQuoteCart(cart);
    renderQuoteCartModal();
}

/**
 * Actualiza la cantidad de un producto (mínimo 1)
 * @param {string} productId - ID del producto
 * @param {number} delta - Cambio en cantidad (+1 o -1)
 */
function updateQuoteCartItemQuantity(productId, delta) {
    const cart = getQuoteCart();
    const item = cart.find(item => item.id === productId);
    
    if (!item) return;

    const currentQuantity = Number(item.quantity) || MIN_QUANTITY;
    const stock = Math.max(0, Number(item.stock ?? 0));
    if (delta > 0 && currentQuantity >= stock) {
        alert(`No hay más unidades disponibles. Existencia actual: ${stock}.`);
        return;
    }
    const newQuantity = Math.max(MIN_QUANTITY, currentQuantity + delta);
    item.quantity = stock > 0 ? Math.min(newQuantity, stock) : newQuantity;

    saveQuoteCart(cart);
    renderQuoteCartModal();
}

function syncQuoteCartStock(products) {
    const productMap = new Map((products || []).map(product => [String(product.id), product]));
    const currentCart = getQuoteCart();
    let adjusted = false;
    const synchronized = [];

    currentCart.forEach(item => {
        const product = productMap.get(String(item.id));
        if (!product) {
            adjusted = true;
            return;
        }
        const stock = Math.max(0, Number(product.stock ?? product.existence ?? 0));
        if (stock <= 0) {
            adjusted = true;
            return;
        }
        const quantity = Math.min(Math.max(1, Number(item.quantity) || 1), stock);
        if (quantity !== Number(item.quantity)) adjusted = true;
        synchronized.push({
            ...item,
            name: product.name,
            code: getArticuloCode(product),
            articuloCode: getArticuloCode(product),
            image: product.image || item.image,
            price: product.price,
            priceNumeric: product.priceNumeric,
            stock,
            quantity
        });
    });

    saveQuoteCart(synchronized);
    if (adjusted) {
        alert('La cotización fue ajustada a la existencia disponible actualmente.');
    }
    return synchronized;
}

/**
 * Vacía todo el carrito
 */
function clearQuoteCart() {
    if (confirm('¿Estás seguro de que quieres vaciar toda la cotización?')) {
        saveQuoteCart([]);
        renderQuoteCartModal();
    }
}

/**
 * Obtiene la cantidad total de productos en el carrito
 * @returns {number} Total de items
 */
function getQuoteCartTotalItems() {
    const cart = getQuoteCart();
    return cart.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
}

/**
 * Actualiza el contador en el botón del header
 */
function updateQuoteCartCounter() {
    const counter = document.getElementById('quoteCartCounter');
    if (counter) {
        const total = getQuoteCartTotalItems();
        counter.textContent = total > 0 ? `(${total})` : '';
        counter.style.display = total > 0 ? 'inline' : 'none';
    }
}

/**
 * Genera mensaje de WhatsApp con todos los productos
 * @param {Array} cart - Array de productos
 * @returns {string} Mensaje formateado
 */
function generateWhatsAppMessage(cart) {
    if (!cart || cart.length === 0) return '';

    const lines = cart.map((item, index) => {
        return [
            `${index + 1}. ${item.name}`,
            `   Código artículo: ${getArticuloCode(item)}`,
            `   Cantidad: ${item.quantity}`,
            ''
        ].join('\n');
    });

    return [
        '__QUOTE_NUMBER__',
        '',
        'Hola, quiero cotizar los siguientes productos:\n',
        ...lines,
        'Por favor, envíenme disponibilidad, precio final y forma de pago.'
    ].join('\n');
}

/**
 * Obtiene el número de WhatsApp de la configuración
 * @returns {Promise<string>} Número de WhatsApp
 */
async function getWhatsAppPhone() {
    try {
        const response = await fetch('/api/content');
        if (!response.ok) throw new Error('Error en la respuesta');
        
        const payload = await response.json();
        return payload?.content?.settings?.ultracompWhatsapp || payload?.content?.settings?.whatsapp || WHATSAPP_PHONE_FALLBACK;
    } catch (error) {
        console.error('Error al cargar configuración:', error);
        return WHATSAPP_PHONE_FALLBACK;
    }
}

/**
 * Guarda la cotización en el backend MySQL
 * @param {Array} cart - Array de productos
 * @param {Object} clientData - Datos del cliente
 * @returns {Promise<void>}
 */
async function saveQuoteCartToBackend(cart, clientData = {}) {
    // Calcular total
    const totalAmount = cart.reduce((total, item) => {
        const price = parseFloat(item.price?.replace(/[^\d.]/g, '') || 0);
        return total + (price * (Number(item.quantity) || 1));
    }, 0);

    const quoteData = {
        clientName: clientData.name || '',
        clientPhone: clientData.phone || '',
        clientEmail: clientData.email || null,
        clientMessage: clientData.message || null,
        totalAmount: totalAmount,
        items: cart.map(item => ({
            productCodigo: item.id,
            productCode: getArticuloCode(item),
            productName: item.name,
            quantity: Number(item.quantity) || 1,
            unitPrice: parseFloat(item.price?.replace(/[^\d.]/g, '') || 0),
            subtotal: parseFloat(item.price?.replace(/[^\d.]/g, '') || 0) * (Number(item.quantity) || 1)
        }))
    };

    try {
        const response = await fetch('/api/quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quoteData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error al guardar cotización');
        }

        const result = await response.json();
        console.log('Cotización guardada exitosamente:', result.quote?.quoteNumber || result.quote?.id);
        return result.quote || null;
    } catch (error) {
        console.error('Error al guardar cotización en backend:', error);
        throw error;
    }
}

/**
 * Envía la cotización por WhatsApp
 */
async function sendQuoteCartByWhatsApp() {
    const cart = getQuoteCart();

    if (cart.length === 0) {
        alert('Tu cotización está vacía. Agrega productos antes de enviar.');
        return;
    }

    // Mostrar formulario de datos del cliente
    showClientDataForm();
}

/**
 * Muestra el formulario para capturar datos del cliente
 */
function showClientDataForm() {
    // Crear modal si no existe
    let modal = document.getElementById('clientDataModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'clientDataModal';
        modal.className = 'quote-cart-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'clientDataModalTitle');
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="quote-cart-modal-content client-data-form">
            <div class="quote-cart-modal-header">
                <h2 id="clientDataModalTitle">Tus datos de contacto</h2>
                <button type="button" class="close-btn" onclick="closeClientDataForm()">&times;</button>
            </div>
            <form id="clientDataForm" class="quote-cart-client-form">
                <label>
                    Nombre *
                    <input type="text" name="name" required placeholder="Tu nombre completo">
                </label>
                <label>
                    Teléfono *
                    <input type="tel" name="phone" required placeholder="Tu número de teléfono">
                </label>
                <label>
                    Correo (opcional)
                    <input type="email" name="email" placeholder="tu@correo.com">
                </label>
                <label>
                    Mensaje adicional (opcional)
                    <textarea name="message" rows="3" placeholder="Algún comentario sobre tu cotización..."></textarea>
                </label>
                <div class="quote-cart-actions">
                    <button type="button" class="secondary-button" onclick="closeClientDataForm()">Cancelar</button>
                    <button type="submit" class="cta-button">Enviar cotización</button>
                </div>
            </form>
        </div>
    `;

    modal.style.display = 'flex';

    // Agregar event listener al formulario
    const form = document.getElementById('clientDataForm');
    form.addEventListener('submit', handleClientDataSubmit);
}

/**
 * Cierra el formulario de datos del cliente
 */
function closeClientDataForm() {
    const modal = document.getElementById('clientDataModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Maneja el envío del formulario de datos del cliente
 */
async function handleClientDataSubmit(event) {
    event.preventDefault();

    const form = event.target;
    const clientData = {
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim() || null,
        message: form.message.value.trim() || null
    };

    if (clientData.name.length < 2) {
        alert('Escribe tu nombre completo.');
        form.name.focus();
        return;
    }
    if (clientData.phone.replace(/\D/g, '').length < 7) {
        alert('Escribe un teléfono válido.');
        form.phone.focus();
        return;
    }

    const cart = getQuoteCart();
    if (!cart.length) {
        alert('La cotización debe tener al menos un producto.');
        return;
    }
    let message = generateWhatsAppMessage(cart);

    try {
        // Guardar cotización en el backend
        const savedQuote = await saveQuoteCartToBackend(cart, clientData);
        const quoteNumber = savedQuote?.quoteNumber || savedQuote?.quote_number || '';
        message = message.replace('__QUOTE_NUMBER__', quoteNumber ? `Cotización ${quoteNumber}` : 'Cotización pendiente de numeración');

        // Obtener número de WhatsApp
        const whatsappPhone = await getWhatsAppPhone();

        if (!whatsappPhone) {
            alert('WhatsApp no está configurado todavía.');
            return;
        }

        // Agregar datos del cliente al mensaje de WhatsApp
        const clientMessage = [
            message,
            `\n--- Datos del cliente ---`,
            `Nombre: ${clientData.name}`,
            `Teléfono: ${clientData.phone}`,
            clientData.email ? `Correo: ${clientData.email}` : '',
            clientData.message ? `Mensaje: ${clientData.message}` : ''
        ].filter(Boolean).join('\n');

        // Abrir WhatsApp
        const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(clientMessage)}`;
        window.open(whatsappUrl, '_blank');

        // Cerrar modales y limpiar carrito
        closeClientDataForm();
        closeQuoteCartModal();
        saveQuoteCart([]);
        updateQuoteCartCounter();

    } catch (error) {
        console.error('Error al enviar cotización:', error);
        alert('Error al enviar cotización. Por favor intenta nuevamente.');
    }
}

/**
 * Muestra una notificación temporal
 * @param {string} message - Mensaje a mostrar
 */
function showNotification(message) {
    let notification = document.getElementById('quoteCartNotification');
    
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'quoteCartNotification';
        notification.className = 'quote-cart-notification';
        notification.setAttribute('role', 'alert');
        notification.setAttribute('aria-live', 'polite');
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.style.display = 'block';
    
    // Limpiar timeout anterior si existe
    if (notification._timeoutId) {
        clearTimeout(notification._timeoutId);
    }
    
    notification._timeoutId = setTimeout(() => {
        notification.style.display = 'none';
    }, NOTIFICATION_TIMEOUT);
}

/**
 * Escapa contenido HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Renderiza el modal del carrito de cotización (versión segura contra XSS)
 */
function renderQuoteCartModal() {
    const modal = document.getElementById('quoteCartModal');
    if (!modal) return;
    
    const cart = getQuoteCart();
    const cartItemsContainer = document.getElementById('quoteCartItems');
    const emptyMessage = document.getElementById('quoteCartEmpty');
    const cartContent = document.getElementById('quoteCartContent');
    
    if (!cartItemsContainer || !emptyMessage || !cartContent) return;
    
    if (cart.length === 0) {
        emptyMessage.style.display = 'block';
        cartContent.style.display = 'none';
        return;
    }
    
    emptyMessage.style.display = 'none';
    cartContent.style.display = 'block';
    
    cartItemsContainer.innerHTML = '';
    
    cart.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'quote-cart-item';
        
        // Crear elementos de forma segura usando DOM API
        const image = document.createElement('img');
        image.src = item.image || '';
        image.alt = escapeHtml(item.name);
        image.className = 'quote-cart-item-image';
        
        const details = document.createElement('div');
        details.className = 'quote-cart-item-details';
        
        const name = document.createElement('h4');
        name.textContent = item.name;
        
        const code = document.createElement('p');
        code.className = 'quote-cart-item-code';
        code.textContent = `Código artículo: ${getArticuloCode(item)}`;
        
        const price = document.createElement('p');
        price.className = 'quote-cart-item-price';
        price.textContent = item.price || 'RD$0.00';
        
        details.appendChild(name);
        details.appendChild(code);
        details.appendChild(price);
        
        const quantity = document.createElement('div');
        quantity.className = 'quote-cart-item-quantity';
        
        const minusBtn = document.createElement('button');
        minusBtn.type = 'button';
        minusBtn.className = 'quantity-btn';
        minusBtn.textContent = '-';
        minusBtn.addEventListener('click', () => updateQuoteCartItemQuantity(item.id, -1));
        
        const quantitySpan = document.createElement('span');
        quantitySpan.textContent = item.quantity;
        
        const plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.className = 'quantity-btn';
        plusBtn.textContent = '+';
        plusBtn.addEventListener('click', () => updateQuoteCartItemQuantity(item.id, 1));
        
        quantity.appendChild(minusBtn);
        quantity.appendChild(quantitySpan);
        quantity.appendChild(plusBtn);
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.setAttribute('aria-label', `Eliminar ${item.name}`);
        removeBtn.addEventListener('click', () => removeFromQuoteCart(item.id));
        
        itemElement.appendChild(image);
        itemElement.appendChild(details);
        itemElement.appendChild(quantity);
        itemElement.appendChild(removeBtn);
        
        cartItemsContainer.appendChild(itemElement);
    });
}

/**
 * Abre el modal del carrito
 */
function openQuoteCartModal() {
    const modal = document.getElementById('quoteCartModal');
    if (modal) {
        modal.style.display = 'flex';
        renderQuoteCartModal();
    }
}

/**
 * Cierra el modal del carrito
 */
function closeQuoteCartModal() {
    const modal = document.getElementById('quoteCartModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Inicializa el sistema (singleton pattern para evitar múltiples inicializaciones)
 */
let quoteCartInitialized = false;

function initQuoteCart() {
    if (quoteCartInitialized) return;
    quoteCartInitialized = true;
    
    updateQuoteCartCounter();
    
    // Crear modal si no existe
    if (!document.getElementById('quoteCartModal')) {
        createQuoteCartModal();
    }
    
    // Event listener para cerrar modal al hacer clic fuera (solo se agrega una vez)
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('quoteCartModal');
        if (modal && e.target === modal) {
            closeQuoteCartModal();
        }
    }, { once: false });
    
    // Event listener para tecla Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeQuoteCartModal();
        }
    });
}

/**
 * Crea el HTML del modal del carrito
 */
function createQuoteCartModal() {
    const modal = document.createElement('div');
    modal.id = 'quoteCartModal';
    modal.className = 'quote-cart-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'quoteCartModalTitle');
    
    const modalContent = document.createElement('div');
    modalContent.className = 'quote-cart-modal-content';
    
    // Header
    const header = document.createElement('div');
    header.className = 'quote-cart-modal-header';
    
    const title = document.createElement('h2');
    title.id = 'quoteCartModalTitle';
    title.textContent = 'Mi Cotización';
    
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Cerrar modal');
    closeBtn.addEventListener('click', closeQuoteCartModal);
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Empty message
    const emptyMessage = document.createElement('div');
    emptyMessage.id = 'quoteCartEmpty';
    emptyMessage.className = 'quote-cart-empty';
    emptyMessage.innerHTML = '<p>Tu cotización está vacía</p><p>Agrega productos desde el catálogo</p>';
    
    // Content
    const content = document.createElement('div');
    content.id = 'quoteCartContent';
    content.className = 'quote-cart-content';
    content.style.display = 'none';
    
    const itemsContainer = document.createElement('div');
    itemsContainer.id = 'quoteCartItems';
    itemsContainer.className = 'quote-cart-items';
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'quote-cart-actions';
    
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'secondary-button';
    clearBtn.textContent = 'Vaciar cotización';
    clearBtn.addEventListener('click', clearQuoteCart);
    
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'cta-button';
    sendBtn.textContent = 'Enviar por WhatsApp';
    sendBtn.addEventListener('click', sendQuoteCartByWhatsApp);
    
    actions.appendChild(clearBtn);
    actions.appendChild(sendBtn);
    
    content.appendChild(itemsContainer);
    content.appendChild(actions);
    
    modalContent.appendChild(header);
    modalContent.appendChild(emptyMessage);
    modalContent.appendChild(content);
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

// Exponer funciones globales necesarias
window.addToQuoteCart = addToQuoteCart;
window.openQuoteCartModal = openQuoteCartModal;
window.closeQuoteCartModal = closeQuoteCartModal;
window.updateQuoteCartItemQuantity = updateQuoteCartItemQuantity;
window.removeFromQuoteCart = removeFromQuoteCart;
window.clearQuoteCart = clearQuoteCart;
window.syncQuoteCartStock = syncQuoteCartStock;
window.sendQuoteCartByWhatsApp = sendQuoteCartByWhatsApp;
window.closeClientDataForm = closeClientDataForm;

// Inicializar cuando el DOM esté listo

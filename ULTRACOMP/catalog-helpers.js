// Helpers del catálogo ULTRACOMP.
// IMPORTANTE: este archivo NO contiene productos estáticos.
// Los productos reales se cargan desde MySQL por medio de /api/products.

window.ultracompProducts = Array.isArray(window.ultracompProducts) ? window.ultracompProducts : [];

window.setUltracompProducts = function(products) {
    window.ultracompProducts = Array.isArray(products) ? products : [];
    return window.ultracompProducts;
};

window.getUltracompProductById = function(id) {
    if (id === undefined || id === null) return null;
    const value = String(id);
    return (window.ultracompProducts || []).find(function(product) {
        return String(product.id) === value ||
               String(product.articuloCode || '') === value ||
               String(product.code || '') === value;
    }) || null;
};

window.getUltracompProducts = function() {
    return Array.isArray(window.ultracompProducts) ? window.ultracompProducts.slice() : [];
};

window.showProductDetail = function(id) {
    if (id === undefined || id === null) return;
    sessionStorage.setItem('ultracompScrollPosition', window.scrollY.toString());
    window.location.href = `producto-detalle.html?id=${encodeURIComponent(String(id))}`;
};

const assert = require('assert');
const app = require('../server');

const {
    cleanContactField,
    normalizeProductImagePath,
    validateQuoteRequest
} = app._test;

assert.strictEqual(cleanContactField('  Nombre  ', 20), 'Nombre');
assert.strictEqual(cleanContactField('123456', 4), '1234');

assert.strictEqual(
    normalizeProductImagePath('/IMAGENES/imagen con espacio.png'),
    '/IMAGENES/imagen%20con%20espacio.png'
);
assert.strictEqual(normalizeProductImagePath(''), '');
assert.strictEqual(normalizeProductImagePath('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');

const validQuote = validateQuoteRequest({
    clientName: 'Cliente de prueba',
    clientPhone: '809-555-0101',
    items: [{ productCodigo: '10', productCode: 'ART-10', quantity: 2 }]
});
assert.strictEqual(validQuote.items.length, 1);
assert.strictEqual(validQuote.items[0].quantity, 2);

assert.throws(() => validateQuoteRequest({
    clientName: 'Cliente de prueba',
    clientPhone: '809-555-0101',
    items: Array.from({ length: 51 }, (_, index) => ({
        productCodigo: String(index + 1),
        productCode: String(index + 1),
        quantity: 1
    }))
}), /máximo de 50 productos/);

assert.throws(() => validateQuoteRequest({
    clientName: 'Cliente de prueba',
    clientPhone: '809-555-0101',
    items: [{ productCodigo: '10', productCode: 'ART-10', quantity: 100 }]
}), /entre 1 y 99/);

console.log('Pruebas internas correctas: imágenes, contactos y cotizaciones.');

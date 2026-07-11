window.ultraAdminData = {
    sessionKey: 'ultraAdminSession',
    loginPath: '/login/',
    adminPath: '/admin/',
    ownerPath: '/owner/',
    routes: [
        { path: '/admin/', label: 'Dashboard', section: 'general' },
        { path: '/admin/productos/', label: 'Productos', section: 'ultracomp' },
        { path: '/admin/categorias/', label: 'Categorías', section: 'ultracomp' },
        { path: '/admin/marcas/', label: 'Marcas', section: 'ultracomp' },
        { path: '/admin/banners/', label: 'Banners', section: 'ultracomp' },
        { path: '/admin/destacados/', label: 'Productos destacados', section: 'ultracomp' },
        { path: '/admin/cotizaciones/', label: 'Cotizaciones', section: 'ultracomp' },
        { path: '/admin/ultracomp/contenido/', label: 'Contenido de inicio', section: 'ultracomp' },
        { path: '/admin/ultrasoft/servicios/', label: 'Servicios', section: 'ultrasoft' },
        { path: '/admin/ultrasoft/soluciones/', label: 'Soluciones / Sistemas', section: 'ultrasoft' },
        { path: '/admin/ultrasoft/paquetes/', label: 'Planes o paquetes', section: 'ultrasoft' },
        { path: '/admin/ultrasoft/solicitudes/', label: 'Solicitudes de clientes', section: 'ultrasoft' },
        { path: '/admin/ultrasoft/contenido/', label: 'Contenido de la landing', section: 'ultrasoft' },
        { path: '/admin/ultrasoft/preguntas/', label: 'Preguntas frecuentes', section: 'ultrasoft' },
        { path: '/admin/testimonios/', label: 'Testimonios', section: 'general' },
        { path: '/admin/leads/', label: 'Clientes / Leads', section: 'general' },
        { path: '/admin/auditoria/', label: 'Historial / Auditoría', section: 'general' },
        { path: '/admin/medios/', label: 'Biblioteca multimedia', section: 'general' },
        { path: '/admin/usuarios/', label: 'Administradores', section: 'general' },
        { path: '/admin/seo/', label: 'SEO y dominio', section: 'general' },
        { path: '/admin/respaldos/', label: 'Respaldos', section: 'general' },
        { path: '/admin/licencia/', label: 'Licencia / Estado del sitio', section: 'general', ownerOnly: true },
        { path: '/admin/configuracion/', label: 'Configuración', section: 'general' }
    ],
    categoryLabels: {
        accessories: 'Accesorios',
        adapters: 'Adaptadores',
        bags: 'Bultos',
        cables: 'Cables',
        chargers: 'Cargadores',
        components: 'Componentes',
        computers: 'Computadoras',
        gaming: 'Gaming',
        hubs: 'Hubs',
        inks: 'Tintas',
        toners: 'Tóner',
        laptops: 'Laptops',
        lighting: 'Iluminación',
        memory: 'Memorias',
        monitors: 'Monitores',
        network: 'Redes',
        office: 'Oficina',
        peripherals: 'Periféricos',
        stationery: 'Papelería',
        storage: 'Almacenamiento',
        supplies: 'Suministros'
    },
    featuredProductIds: [
        'impresora-termica-etiqueta-2connect-2c-lp427b',
        'impresora-termica-recibos-2connect-2c-pos8-01-v6',
        'tablet-amazon-fire-hd-8-plus-32gb',
        'aire-comprimido-sabo',
        'almohadilla-mouse-cony',
        'headset-fantech-hq53',
        'headset-fantech-hq54',
        'barra-sonido-subwoofer-jamatech',
        'bocina-havit',
        'bocina-fantech-gs205',
        'boligrafo-deli-q0009',
        'boligrafo-deli-q3'
    ],
    bannerProductIds: [
        'impresora-termica-recibos-2connect-2c-pos8-01-v6',
        'impresora-termica-etiqueta-2connect-2c-lp427b',
        'headset-fantech-hq53',
        'headset-fantech-hq54',
        'barra-sonido-subwoofer-jamatech',
        'bocina-havit',
        'almohadilla-mouse-cony',
        'aire-comprimido-sabo',
        'bocina-fantech-gs205',
        'boligrafo-deli-q0009',
        'boligrafo-deli-q3'
    ],
    ultrasoft: {
        servicios: [
            'Desarrollo de Software',
            'Aplicaciones Web',
            'Aplicaciones Móviles',
            'Automatización de Procesos',
            'Integraciones de Sistemas',
            'Consultoría Tecnológica'
        ],
        soluciones: [
            'Sistema de Gestión Empresarial',
            'Sistema de Ventas',
            'Sistema de Inventario',
            'Sistema de Cuentas por Cobrar',
            'Sistema de Nómina',
            'Sistema de Contabilidad'
        ],
        paquetes: [
            'Diagnóstico inicial',
            'Desarrollo a medida',
            'Implementación y capacitación',
            'Soporte y mejoras'
        ]
    },
    settings: {
        whatsapp: '8095726552',
        email: 'ultrasoftsolicitud@gmail.com',
        company: 'ULTRACOMP / ULTRASOFT',
        logo: '/GENERAL/logo-ultrasoft.svg',
        social: 'Pendiente de configurar'
    },
    database: {
        connected: true,
        message: 'Conectado mediante backend Node a MySQL. Las credenciales viven en .env, no en el navegador.'
        /*
            No pegues credenciales de MySQL en archivos JS públicos.
            Usa una variable de entorno en un backend real, por ejemplo:
            DATABASE_URL=...
        */
    }
};

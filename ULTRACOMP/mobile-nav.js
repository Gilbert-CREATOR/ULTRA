(function () {
    const toggle = document.querySelector('.mobile-menu-toggle');
    const navigation = document.getElementById('primaryNavigation');
    if (!toggle || !navigation) return;

    function setOpen(open) {
        navigation.classList.toggle('is-open', open);
        toggle.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    }

    toggle.addEventListener('click', event => {
        event.stopPropagation();
        setOpen(!navigation.classList.contains('is-open'));
    });

    navigation.addEventListener('click', event => {
        if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('click', event => {
        if (!navigation.contains(event.target)) setOpen(false);
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 640) setOpen(false);
    });
})();

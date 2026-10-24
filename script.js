(() => {
  const BUSINESS = {
    phone: '01865383565',
    whatsapp: '8801865383565',
    email: 'littlebighelp28@gmail.com',
    whatsappBase: 'https://wa.me/8801865383565'
  };

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const revealStyleId = 'little-big-help-reveal-styles';

  function ensureRevealStyles() {
    if (document.getElementById(revealStyleId)) return;

    const style = document.createElement('style');
    style.id = revealStyleId;
    style.textContent = `
      [data-reveal] {
        opacity: 0;
        transform: translateY(18px);
        transition: opacity 700ms ease, transform 700ms ease;
        will-change: opacity, transform;
      }

      [data-reveal].is-visible {
        opacity: 1;
        transform: translateY(0);
      }

      @media (prefers-reduced-motion: reduce) {
        [data-reveal] {
          opacity: 1;
          transform: none;
          transition: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function addRevealObserver() {
    const elements = document.querySelectorAll('.hero, .service-card, .step, .section-heading, .about-content, .contact-content, .hero-content, .hero-visual, .site-footer');

    if (!elements.length) return;

    ensureRevealStyles();

    elements.forEach((element) => {
      element.setAttribute('data-reveal', 'true');
    });

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -30px 0px'
    });

    document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
  }

  function buildWhatsAppUrl(message) {
    const base = BUSINESS.whatsappBase;
    const text = typeof message === 'string' ? message : 'Hi Little Big Help, I would like to ask about your services.';
    return `${base}?text=${encodeURIComponent(text)}`;
  }

  function createContactLink(label, href, className, extraText) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    link.className = className || '';
    link.setAttribute('aria-label', extraText || label);

    if (href.startsWith('http') || href.startsWith('mailto:')) {
      link.rel = 'noopener noreferrer';
    }

    return link;
  }

  function addWhatsAppButtons() {
    const hero = document.querySelector('.hero-content');
    if (hero && !hero.querySelector('[data-whatsapp-hero]')) {
      const wrap = document.createElement('div');
      wrap.className = 'hero-contact-row';
      wrap.setAttribute('data-whatsapp-hero', 'true');
      wrap.setAttribute('aria-label', 'Contact Little Big Help via phone or WhatsApp');

      const phoneLink = createContactLink(BUSINESS.phone, `tel:${BUSINESS.phone}`, 'button button-secondary', 'Call Little Big Help on 01865383565');
      const whatsAppLink = createContactLink('Chat with us on WhatsApp', buildWhatsAppUrl('Hi Little Big Help, I would like to ask about your services.'), 'button button-primary', 'Chat with Little Big Help on WhatsApp');

      wrap.appendChild(phoneLink);
      wrap.appendChild(whatsAppLink);
      hero.appendChild(wrap);
    }

    const contactContent = document.querySelector('.contact-content');
    if (contactContent && !contactContent.querySelector('[data-whatsapp-contact]')) {
      const waWrap = document.createElement('div');
      waWrap.className = 'contact-contact-row';
      waWrap.setAttribute('data-whatsapp-contact', 'true');

      const phoneP = document.createElement('p');
      phoneP.className = 'contact-phone';
      phoneP.innerHTML = `Phone: <a href="tel:${BUSINESS.phone}" aria-label="Call Little Big Help on 01865383565">${BUSINESS.phone}</a>`;

      const waLink = createContactLink('Chat with us on WhatsApp', buildWhatsAppUrl('Hi Little Big Help, I would like to ask about your services.'), 'button button-primary', 'Open WhatsApp contact for Little Big Help');
      waLink.className = 'button button-primary';

      const emailWrap = document.createElement('p');
      emailWrap.className = 'contact-email';
      emailWrap.innerHTML = `Email: <a href="mailto:${BUSINESS.email}" aria-label="Email Little Big Help at littlebighelp28@gmail.com">${BUSINESS.email}</a>`;

      waWrap.appendChild(phoneP);
      waWrap.appendChild(waLink);
      waWrap.appendChild(emailWrap);

      const target = contactContent.querySelector('.button.button-primary') || contactContent.querySelector('a[href^="mailto:"]') || contactContent.lastElementChild;
      if (target) {
        target.insertAdjacentElement('afterend', waWrap);
      } else {
        contactContent.appendChild(waWrap);
      }
    }
  }

  function addFooterEmail() {
    const footer = document.querySelector('.site-footer');
    if (!footer) return;

    if (footer.querySelector('a[href^="mailto:"]')) return;

    const emailLink = createContactLink(BUSINESS.email, `mailto:${BUSINESS.email}`, 'footer-email', 'Email Little Big Help');
    const emailWrap = document.createElement('p');
    emailWrap.className = 'footer-email-wrap';
    emailWrap.innerHTML = 'Email: ';
    emailWrap.appendChild(emailLink);

    footer.appendChild(emailWrap);
  }

  function addFloatingWhatsAppButton() {
    if (document.querySelector('[data-floating-whatsapp]')) return;

    const button = document.createElement('a');
    button.href = BUSINESS.whatsappBase;
    button.className = 'floating-whatsapp';
    button.setAttribute('data-floating-whatsapp', 'true');
    button.setAttribute('target', '_blank');
    button.setAttribute('rel', 'noopener noreferrer');
    button.setAttribute('aria-label', 'Chat with Little Big Help on WhatsApp');
    button.title = 'Chat with us on WhatsApp';
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20.52 3.48A11.93 11.93 0 0 0 12.2 1C6.64 1 2.1 5.54 2.1 11.1c0 1.95.52 3.86 1.5 5.54L2 22l5.5-1.57a10.1 10.1 0 0 0 4.7 1.38h.01c5.56 0 10.1-4.54 10.1-10.1 0-2.7-1.05-5.24-2.79-7.23ZM12.2 18.28h-.01a8.38 8.38 0 0 1-4.27-1.17l-.31-.18-3.27.94.87-3.18-.2-.33A8.38 8.38 0 1 1 12.2 18.28Zm4.6-6.24c-.25-.13-1.47-.72-1.7-.81-.23-.08-.4-.13-.57.13-.17.25-.65.81-.8 1-.15.17-.3.19-.55.06-.25-.13-1.05-.39-2-1.25-.74-.66-1.24-1.47-1.39-1.72-.15-.25-.02-.39.11-.52.11-.11.25-.3.38-.45.13-.15.17-.26.25-.43.08-.17.04-.32-.02-.45-.06-.13-.57-1.37-.78-1.88-.21-.51-.42-.44-.57-.45h-.49c-.17 0-.45.06-.68.32-.23.25-.88.86-.88 2.11s.9 2.44.99 2.61c.09.17 1.75 2.63 4.22 3.63.59.25 1.04.4 1.4.5.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.22-.16-.47-.29Z" />
      </svg>
    `;

    document.body.appendChild(button);
  }

  function initMobileNavigation() {
    const nav = document.querySelector('.nav-links');
    const toggle = document.querySelector('.menu-toggle');

    if (!nav || !toggle) return;

    const closeNav = () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation menu');
    };

    const openNav = () => {
      nav.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation menu');
    };

    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.contains('is-open');
      if (isOpen) {
        closeNav();
      } else {
        openNav();
      }
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeNav);
    });

    document.addEventListener('click', (event) => {
      if (!nav.contains(event.target) && !toggle.contains(event.target)) {
        closeNav();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeNav();
      }
    });
  }

  function initSmoothInternalLinks() {
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        const targetId = link.getAttribute('href');
        if (!targetId || targetId === '#') return;

        const target = document.querySelector(targetId);
        if (!target) return;

        event.preventDefault();

        const behavior = prefersReducedMotion ? 'auto' : 'smooth';
        target.scrollIntoView({ behavior, block: 'start' });
      });
    });
  }

  function initCurrentYear() {
    const yearNode = document.getElementById('current-year');
    if (yearNode) {
      yearNode.textContent = new Date().getFullYear();
    }
  }

  function init() {
    addWhatsAppButtons();
    addFooterEmail();
    addFloatingWhatsAppButton();
    initMobileNavigation();
    initSmoothInternalLinks();
    initCurrentYear();

    if (!prefersReducedMotion) {
      addRevealObserver();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header scroll state
  function initHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const onScroll = () => {
      if (window.scrollY > 15) {
        header.classList.add('is-scrolled');
      } else {
        header.classList.remove('is-scrolled');
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Mobile Navigation Menu Toggle
  function initMobileNav() {
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

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
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

  // Smooth Scrolling for Internal Links
  function initSmoothLinks() {
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

  // Interactive Service & Website Project Request Form
  function initBookingForm() {
    const form = document.getElementById('service-request-form');
    const serviceSelect = document.getElementById('form-service');
    const websiteFields = document.getElementById('website-enquiry-fields');

    if (!form || !serviceSelect || !websiteFields) return;

    // Toggle website-specific fields when Website Design & Development is chosen
    const updateConditionalFields = () => {
      const isWebsite = serviceSelect.value === 'Website Design & Development';
      websiteFields.style.display = isWebsite ? 'block' : 'none';
    };

    serviceSelect.addEventListener('change', updateConditionalFields);
    updateConditionalFields();

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const service = serviceSelect.value;
      const name = document.getElementById('form-name')?.value?.trim() || '';
      const details = document.getElementById('form-details')?.value?.trim() || '';

      let message = `Hi Little Big Help, I'd like to make an inquiry.\n\nService Category: ${service}`;

      if (name) {
        message += `\nName: ${name}`;
      }

      if (service === 'Website Design & Development') {
        const bizName = document.getElementById('form-biz-name')?.value?.trim();
        const siteUrl = document.getElementById('form-website-url')?.value?.trim();
        const siteType = document.getElementById('form-website-type')?.value?.trim();
        const maintenance = document.getElementById('form-maintenance')?.checked;

        if (bizName) message += `\nBusiness Name: ${bizName}`;
        if (siteUrl) message += `\nExisting Website: ${siteUrl}`;
        if (siteType) message += `\nType of Website/Changes: ${siteType}`;
        message += `\nOngoing Maintenance: ${maintenance ? 'Yes, required' : 'Not required'}`;
      }

      if (details) {
        message += `\n\nDetails: ${details}`;
      }

      const waUrl = `https://wa.me/8801865383565?text=${encodeURIComponent(message)}`;
      const link = document.createElement('a');
      link.href = waUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // Scroll Reveal Animations
  function initScrollReveal() {
    if (prefersReducedMotion) return;

    const targets = document.querySelectorAll(
      '.hero-content, .hero-visual, .section-heading, .service-card, .step-item, .contact-card'
    );
    targets.forEach((el) => {
      el.setAttribute('data-reveal', 'true');
    });

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -30px 0px'
    });

    document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
  }

  // Footer Current Year
  function initYear() {
    const yearNode = document.getElementById('current-year');
    if (yearNode) {
      yearNode.textContent = new Date().getFullYear();
    }
  }

  function init() {
    initHeaderScroll();
    initMobileNav();
    initSmoothLinks();
    initBookingForm();
    initScrollReveal();
    initYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

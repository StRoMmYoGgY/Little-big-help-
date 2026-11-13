(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WHATSAPP_NUMBER = '8801865383565';

  // Header scroll elevation
  function initHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const onScroll = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Mobile navigation drawer
  function initMobileNav() {
    const drawer = document.getElementById('primary-navigation');
    const toggle = document.querySelector('.menu-toggle');
    if (!drawer || !toggle) return;

    const closeNav = () => {
      drawer.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation menu');
    };

    const openNav = () => {
      drawer.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation menu');
    };

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (drawer.classList.contains('is-open')) {
        closeNav();
      } else {
        openNav();
      }
    });

    drawer.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeNav);
    });

    document.addEventListener('click', (event) => {
      if (!drawer.contains(event.target) && !toggle.contains(event.target)) {
        closeNav();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeNav();
    });
  }

  // Smooth scrolling for internal anchors
  function initSmoothLinks() {
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const targetId = link.getAttribute('href');
        if (!targetId || targetId === '#') return;
        const target = document.querySelector(targetId);
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start'
        });
      });
    });
  }

  // Interactive Services category filter tabs & direct CTA pre-selection
  function initServicesInteraction() {
    const tabs = document.querySelectorAll('.filter-tab');
    const cards = document.querySelectorAll('.service-card');
    const serviceSelect = document.getElementById('form-service');
    const contactSection = document.getElementById('contact');

    function applyFilter(category) {
      tabs.forEach((tab) => {
        const active = tab.dataset.filter === category;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });

      cards.forEach((card) => {
        const matches = category === 'all' || card.dataset.category === category;
        card.classList.toggle('is-hidden', !matches);
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        applyFilter(tab.dataset.filter || 'all');
      });
    });

    // Footer service links also filter & scroll cleanly
    document.querySelectorAll('[data-footer-filter]').forEach((link) => {
      link.addEventListener('click', () => {
        applyFilter(link.dataset.footerFilter || 'all');
      });
    });

    // Service card CTA buttons pre-select category in inquiry form and scroll to contact
    document.querySelectorAll('[data-select-service]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = btn.dataset.selectService;
        if (serviceSelect && chosen) {
          serviceSelect.value = chosen;
          serviceSelect.dispatchEvent(new Event('change'));
        }

        // If confirmation view was showing, return to form
        const form = document.getElementById('service-request-form');
        const confirmation = document.getElementById('inquiry-confirmation');
        if (form && confirmation) {
          form.classList.remove('is-hidden');
          confirmation.classList.add('is-hidden');
        }

        if (contactSection) {
          contactSection.scrollIntoView({
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
            block: 'start'
          });
          setTimeout(() => {
            document.getElementById('form-name')?.focus();
          }, prefersReducedMotion ? 10 : 350);
        }
      });
    });
  }

  // Interactive Blueprint Pricing Tabs & Service-to-Pricing Links
  function initPricingTabs() {
    const pricingTabs = document.querySelectorAll('[data-pricing-tab]');
    const pricingPanels = document.querySelectorAll('[data-pricing-panel]');
    if (!pricingTabs.length || !pricingPanels.length) return;

    function activatePricingCategory(category) {
      pricingTabs.forEach((tab) => {
        const isActive = tab.dataset.pricingTab === category;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
      });

      pricingPanels.forEach((panel) => {
        const isMatch = panel.dataset.pricingPanel === category;
        panel.classList.toggle('is-hidden', !isMatch);
      });
    }

    pricingTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        activatePricingCategory(tab.dataset.pricingTab || 'Personal Concierge');
      });
    });

    document.querySelectorAll('[data-view-pricing]').forEach((link) => {
      link.addEventListener('click', () => {
        const cat = link.dataset.viewPricing;
        if (cat) activatePricingCategory(cat);
      });
    });
  }

  // Build formatted WhatsApp summary message from form values
  function buildWhatsAppMessage(payload) {
    const lines = [
      `Hello Allora, I would like to submit an inquiry.`,
      ``,
      `Name: ${payload.customerName}`,
      `WhatsApp: ${payload.whatsappNumber}`,
      `Service Category: ${payload.serviceCategory}`
    ];

    if (payload.email) lines.push(`Email: ${payload.email}`);
    if (payload.location) lines.push(`Location: ${payload.location}`);
    if (payload.preferredDate) lines.push(`Preferred Date: ${payload.preferredDate}`);
    if (payload.urgency && payload.urgency !== 'Standard') lines.push(`Timing Priority: ${payload.urgency}`);
    if (payload.serviceCategory === 'Digital Solutions') {
      if (payload.businessName) lines.push(`Business Name: ${payload.businessName}`);
      if (payload.existingWebsite) lines.push(`Existing Website: ${payload.existingWebsite}`);
      if (payload.websiteType) lines.push(`Digital Focus: ${payload.websiteType}`);
      lines.push(`Maintenance Discussion: ${payload.includeMaintenance ? 'Requested' : 'Not requested'}`);
    }

    lines.push(``, `Task Description: ${payload.taskDescription}`);
    if (payload.additionalDetails) {
      lines.push(`Additional Details: ${payload.additionalDetails}`);
    }

    return lines.join('\n');
  }

  // Customer Inquiry Submission (Backend API + Firestore persistence with static-host WhatsApp fallback)
  function initInquiryForm() {
    const form = document.getElementById('service-request-form');
    const serviceSelect = document.getElementById('form-service');
    const digitalFields = document.getElementById('website-enquiry-fields');
    const feedback = document.getElementById('form-feedback');
    const submitBtn = document.getElementById('btn-submit-inquiry');
    const submitLabel = document.getElementById('submit-inquiry-label');
    const confirmation = document.getElementById('inquiry-confirmation');
    const confirmRefId = document.getElementById('confirm-ref-id');
    const confirmHeading = document.getElementById('confirm-heading');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmWaLink = document.getElementById('confirm-whatsapp-link');
    const btnNewInquiry = document.getElementById('btn-new-inquiry');

    if (!form || !serviceSelect) return;

    const updateConditionalFields = () => {
      if (!digitalFields) return;
      const isDigital = serviceSelect.value === 'Digital Solutions';
      digitalFields.classList.toggle('is-hidden', !isDigital);
    };

    serviceSelect.addEventListener('change', updateConditionalFields);
    updateConditionalFields();

    const showFormError = (msg) => {
      if (!feedback) return;
      feedback.textContent = msg;
      feedback.classList.remove('is-hidden');
    };

    const clearFormError = () => {
      if (!feedback) return;
      feedback.textContent = '';
      feedback.classList.add('is-hidden');
    };

    if (btnNewInquiry) {
      btnNewInquiry.addEventListener('click', () => {
        form.reset();
        updateConditionalFields();
        clearFormError();
        confirmation?.classList.add('is-hidden');
        form.classList.remove('is-hidden');
        document.getElementById('form-name')?.focus();
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError();

      const urgencyValue = document.getElementById('form-urgency')?.value?.trim() || 'Standard';
      const rawAdditional = document.getElementById('form-additional')?.value?.trim() || '';

      const payload = {
        customerName: document.getElementById('form-name')?.value?.trim() || '',
        whatsappNumber: document.getElementById('form-whatsapp')?.value?.trim() || '',
        email: document.getElementById('form-email')?.value?.trim() || '',
        serviceCategory: serviceSelect.value,
        location: document.getElementById('form-location')?.value?.trim() || '',
        preferredDate: document.getElementById('form-date')?.value?.trim() || '',
        urgency: urgencyValue,
        taskDescription: document.getElementById('form-details')?.value?.trim() || '',
        additionalDetails: rawAdditional,
        businessName: document.getElementById('form-biz-name')?.value?.trim() || '',
        existingWebsite: document.getElementById('form-website-url')?.value?.trim() || '',
        websiteType: document.getElementById('form-website-type')?.value?.trim() || '',
        includeMaintenance: Boolean(document.getElementById('form-maintenance')?.checked)
      };

      if (!payload.customerName) {
        showFormError('Please enter your name or business name.');
        document.getElementById('form-name')?.focus();
        return;
      }

      if (!payload.whatsappNumber || payload.whatsappNumber.length < 7) {
        showFormError('Please provide a valid WhatsApp number so we can confirm details and BDT pricing.');
        document.getElementById('form-whatsapp')?.focus();
        return;
      }

      if (!payload.taskDescription) {
        showFormError('Please provide a brief description of the task, business scope, or digital project you need.');
        document.getElementById('form-details')?.focus();
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (submitLabel) submitLabel.textContent = 'Submitting Inquiry...';

      const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppMessage(payload))}`;
      if (confirmWaLink) confirmWaLink.href = waUrl;

      try {
        const res = await fetch('/api/inquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('STATIC_HOST_FALLBACK');
        }

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Could not submit inquiry. Please try again.');
        }

        if (confirmRefId) confirmRefId.textContent = `Ref: ${data.inquiry.id}`;
        if (confirmHeading) confirmHeading.textContent = `Thank you, ${payload.customerName}. Your inquiry is confirmed.`;
        if (confirmMessage) {
          confirmMessage.textContent =
            'We have received your request and will review availability, scope, and itemised BDT pricing (with separated expenses) with you on WhatsApp before work begins.';
        }

        form.classList.add('is-hidden');
        confirmation?.classList.remove('is-hidden');
      } catch (err) {
        if (err.message === 'STATIC_HOST_FALLBACK' || err.name === 'TypeError') {
          // Graceful support when deployed statically (e.g. GitHub Pages) without the Express backend
          if (confirmRefId) confirmRefId.textContent = 'Direct Channel Ready';
          if (confirmHeading) confirmHeading.textContent = `Your request summary is ready, ${payload.customerName}.`;
          if (confirmMessage) {
            confirmMessage.textContent =
              'Click below to send your completed inquiry directly to our Allora coordinator on WhatsApp to confirm availability and separated BDT pricing.';
          }
          form.classList.add('is-hidden');
          confirmation?.classList.remove('is-hidden');
        } else {
          showFormError(err.message);
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitLabel) submitLabel.textContent = 'Submit Inquiry';
      }
    });
  }

  function initYear() {
    const yearNode = document.getElementById('current-year');
    if (yearNode) yearNode.textContent = String(new Date().getFullYear());
  }

  function init() {
    initHeaderScroll();
    initMobileNav();
    initSmoothLinks();
    initServicesInteraction();
    initPricingTabs();
    initInquiryForm();
    initYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

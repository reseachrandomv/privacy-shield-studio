/*!
 * PrivacyShield Studio · app.js
 * 100% client-side privacy & AI data sanitizer.
 * MIT License · https://github.com/reseachrandomv/privacy-shield-studio
 *
 * Passphrase word list: EFF Short Wordlist #1 (1,296 words) by the
 * Electronic Frontier Foundation, CC BY 3.0 US · https://www.eff.org/dice
 */
(() => {
  'use strict';

  /* =========================================================
     Utilities
     ========================================================= */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const store = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        /* Storage can be unavailable (private mode, quota); settings simply won't persist. */
      }
    }
  };

  const debounce = (fn, wait) => {
    let t = 0;
    return (...args) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => fn(...args), wait);
    };
  };

  const refreshIcons = () => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
    }
  };

  const setIcon = (container, name, extraClass = 'h-4 w-4') => {
    const old = container.querySelector('svg, i[data-lucide]');
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    i.setAttribute('aria-hidden', 'true');
    i.className = extraClass;
    if (old) old.replaceWith(i); else container.prepend(i);
    refreshIcons();
  };

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) return '-';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let v = bytes / 1024;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[u]}`;
  };

  const countLines = (text) => (text.length ? text.split('\n').length : 0);

  const syncRange = (el) => {
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const pct = max === min ? 0 : ((Number(el.value) - min) / (max - min)) * 100;
    el.style.setProperty('--pct', `${pct}%`);
  };

  const pulseClass = (el, cls, ms = 700) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    window.setTimeout(() => el.classList.remove(cls), ms);
  };

  /* =========================================================
     Toasts
     ========================================================= */
  const toastRegion = $('toast-region');
  const toastTemplate = $('toast-template');
  const TOAST_ICONS = { success: 'check-circle-2', error: 'x-circle', warning: 'alert-triangle', info: 'info' };

  function dismissToast(node) {
    if (!node || node.classList.contains('is-leaving')) return;
    node.classList.add('is-leaving');
    const remove = () => node.remove();
    node.addEventListener('animationend', remove, { once: true });
    window.setTimeout(remove, 400);
  }

  function toast(message, variant = 'success', duration = 3200) {
    const node = toastTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.variant = variant;
    node.querySelector('.toast-msg').textContent = message;
    const icon = node.querySelector('.toast-icon i');
    if (icon) icon.setAttribute('data-lucide', TOAST_ICONS[variant] || TOAST_ICONS.info);
    node.querySelector('.toast-close').addEventListener('click', () => dismissToast(node));
    toastRegion.appendChild(node);
    const live = Array.from(toastRegion.children).filter((n) => !n.classList.contains('is-leaving'));
    live.slice(0, Math.max(0, live.length - 4)).forEach(dismissToast);
    refreshIcons();
    window.setTimeout(() => dismissToast(node), duration);
    return node;
  }

  async function copyText(text, successMsg = 'Copied to clipboard') {
    if (!text) {
      toast('Nothing to copy yet', 'warning');
      return false;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (!ok) {
        toast('Copy failed. Select the text and copy manually.', 'error');
        return false;
      }
    }
    toast(successMsg, 'success');
    return true;
  }

  /* =========================================================
     Tabs
     ========================================================= */
  const TABS = ['scrubber', 'exif', 'urls', 'crypto'];
  const tabButtons = $$('.tab-btn[data-tab]');
  const tabIndicator = $('tab-indicator');
  let activeTab = 'scrubber';

  function positionIndicator() {
    const btn = tabButtons.find((b) => b.dataset.tab === activeTab);
    if (!btn) return;
    tabIndicator.style.width = `${btn.offsetWidth}px`;
    tabIndicator.style.transform = `translateX(${btn.offsetLeft}px)`;
  }

  function activateTab(name, { focus = false, updateHash = true } = {}) {
    if (!TABS.includes(name)) name = 'scrubber';
    activeTab = name;
    tabButtons.forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      if (on && focus) btn.focus();
    });
    $$('.tab-panel[data-panel]').forEach((panel) => {
      const on = panel.dataset.panel === name;
      panel.hidden = !on;
      panel.classList.toggle('is-active', on);
    });
    positionIndicator();
    store.set('pss.activeTab', name);
    if (updateHash && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', `#${name}`);
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  $('tablist').addEventListener('keydown', (e) => {
    const idx = TABS.indexOf(activeTab);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(idx + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(idx - 1 + TABS.length) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (next) {
      e.preventDefault();
      activateTab(next, { focus: true });
    }
  });

  $('brand-link').addEventListener('click', (e) => {
    e.preventDefault();
    activateTab('scrubber');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('resize', debounce(positionIndicator, 80));
  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '');
    if (TABS.includes(h) && h !== activeTab) activateTab(h, { updateHash: false });
  });

  /* =========================================================
     Trust modal
     ========================================================= */
  const modal = $('trust-modal');
  const trustPill = $('trust-pill');
  let lastFocus = null;

  const focusables = () => $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', modal)
    .filter((el) => el.offsetParent !== null);

  function openModal() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.classList.remove('is-closing');
    document.body.classList.add('modal-open');
    trustPill.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => $('trust-modal-close').focus());
  }

  function closeModal() {
    if (modal.hidden || modal.classList.contains('is-closing')) return;
    modal.classList.add('is-closing');
    window.setTimeout(() => {
      modal.hidden = true;
      modal.classList.remove('is-closing');
      document.body.classList.remove('modal-open');
      trustPill.setAttribute('aria-expanded', 'false');
      (lastFocus && document.contains(lastFocus) ? lastFocus : trustPill).focus();
    }, 200);
  }

  trustPill.setAttribute('aria-expanded', 'false');
  trustPill.addEventListener('click', openModal);
  $$('[data-close-modal]', modal).forEach((el) => el.addEventListener('click', closeModal));
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key === 'Tab') {
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* =========================================================
     MODULE 1 · Secret scrubber
     ========================================================= */
  const IPV4 = String.raw`(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
  const H = '[A-Fa-f0-9]{1,4}';
  const IPV6 = [
    `(?:${H}:){7}${H}`,
    `(?:${H}:){1,7}:`,
    `(?:${H}:){1,6}:${H}`,
    `(?:${H}:){1,5}(?::${H}){1,2}`,
    `(?:${H}:){1,4}(?::${H}){1,3}`,
    `(?:${H}:){1,3}(?::${H}){1,4}`,
    `(?:${H}:){1,2}(?::${H}){1,5}`,
    `${H}:(?::${H}){1,6}`,
    `:(?:(?::${H}){1,7}|:)`
  ].join('|');

  const luhnValid = (digits) => {
    let sum = 0;
    let dbl = false;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let d = digits.charCodeAt(i) - 48;
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  };

  /* Rules run in this order so larger structures are removed before broader
     patterns could match their fragments. */
  const RULES = [
    {
      id: 'privatekey',
      label: ['Private Key', 'Private Keys'],
      placeholder: '[REDACTED_PRIVATE_KEY]',
      patterns: [
        { re: /-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY( BLOCK)?-----[\s\S]*?-----END \1PRIVATE KEY\2-----/g },
        { re: /PuTTY-User-Key-File-\d+:[\s\S]*?Private-MAC:\s*[0-9a-f]+/g }
      ]
    },
    {
      id: 'token',
      label: ['Token', 'Tokens'],
      placeholder: '[REDACTED_TOKEN]',
      patterns: [
        { re: /\b(Bearer|Token)(\s+)(?!\[REDACTED_)[A-Za-z0-9\-._~+/]{12,}=*/g, keepGroups: [1, 2] },
        { re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g }
      ]
    },
    {
      id: 'apikey',
      label: ['API Key', 'API Keys'],
      placeholder: '[REDACTED_API_KEY]',
      patterns: [
        { re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
        { re: /\bsk-(?:proj-|svcacct-|admin-|None-)?[A-Za-z0-9_-]{20,}/g },
        { re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
        { re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
        { re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g },
        { re: /(aws_secret_access_key\s*[=:]\s*["']?)[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/gi, keepGroups: [1] },
        { re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
        { re: /\bxox[baprse]-[A-Za-z0-9-]{10,}\b/g },
        { re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
        { re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
        { re: /\bhf_[A-Za-z0-9]{30,}\b/g },
        { re: /\bxai-[A-Za-z0-9]{40,}\b/g }
      ]
    },
    {
      id: 'card',
      label: ['Credit Card', 'Credit Cards'],
      placeholder: '[REDACTED_CARD]',
      patterns: [
        {
          re: /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g,
          validate: (m) => {
            const digits = m.replace(/\D/g, '');
            return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) && !/^(\d)\1+$/.test(digits);
          }
        }
      ]
    },
    {
      id: 'email',
      label: ['Email', 'Emails'],
      placeholder: '[REDACTED_EMAIL]',
      patterns: [
        { re: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,24}\b/g }
      ]
    },
    {
      id: 'ip',
      label: ['IP Address', 'IP Addresses'],
      placeholder: '[REDACTED_IP]',
      patterns: [
        { re: new RegExp(String.raw`(?<![\w.])${IPV4}(?![\w]|\.\d)`, 'g') },
        { re: new RegExp(String.raw`(?<![\w:])(?:${IPV6})(?![\w:])`, 'g'), validate: (m) => (m.match(/:/g) || []).length >= 2 && /[0-9a-fA-F]/.test(m) }
      ]
    },
    {
      id: 'phone',
      label: ['Phone', 'Phones'],
      placeholder: '[REDACTED_PHONE]',
      patterns: [
        {
          re: /(?<![\w+/.-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}(?![\w/-])/g,
          validate: (m) => {
            const n = m.replace(/\D/g, '').length;
            return n >= 7 && n <= 15 && !/^\d{4}-\d{2}-\d{2}/.test(m);
          }
        },
        { re: /(?<![\w+])\+\d{7,14}(?!\w)/g }
      ]
    }
  ];

  function scrubText(input, enabled) {
    const counts = {};
    let out = input;
    RULES.forEach((rule) => {
      counts[rule.id] = 0;
      if (!enabled[rule.id]) return;
      rule.patterns.forEach((p) => {
        p.re.lastIndex = 0;
        out = out.replace(p.re, (...args) => {
          const match = args[0];
          if (p.validate && !p.validate(match)) return match;
          counts[rule.id] += 1;
          if (p.keepGroups) return p.keepGroups.map((g) => args[g] || '').join('') + rule.placeholder;
          return rule.placeholder;
        });
      });
    });
    return { output: out, counts };
  }

  const scrubInput = $('scrub-input');
  const scrubOutput = $('scrub-output');
  const scrubCopyBtn = $('scrub-copy-btn');
  const totalBadge = $('scrub-total-badge');
  const scrubSummary = $('scrub-summary');
  const scrubChips = $('scrub-chips');
  const ruleInputs = $$('input.switch-input[data-rule]');
  let lastTotal = 0;

  function getEnabledRules() {
    const enabled = {};
    ruleInputs.forEach((el) => { enabled[el.dataset.rule] = el.checked; });
    return enabled;
  }

  function renderScrub() {
    const raw = scrubInput.value;
    const { output, counts } = scrubText(raw, getEnabledRules());
    if (scrubOutput.value !== output) {
      scrubOutput.value = output;
      if (raw) pulseClass(scrubOutput, 'is-flash');
    }

    $('scrub-input-count').textContent = raw.length.toLocaleString();
    $('scrub-input-lines').textContent = countLines(raw).toLocaleString();
    $('scrub-output-count').textContent = output.length.toLocaleString();
    $('scrub-output-lines').textContent = countLines(output).toLocaleString();
    scrubCopyBtn.disabled = output.trim().length === 0;

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    totalBadge.textContent = String(total);
    totalBadge.dataset.count = String(total);
    if (total !== lastTotal && total > 0) pulseClass(totalBadge, 'is-bumped', 500);
    lastTotal = total;

    scrubChips.replaceChildren();
    const parts = [];
    RULES.forEach((rule) => {
      const n = counts[rule.id];
      if (!n) return;
      const name = n === 1 ? rule.label[0] : rule.label[1];
      parts.push(`${n} ${name}`);
      const li = document.createElement('li');
      li.className = 'type-chip';
      li.dataset.type = rule.id;
      const strong = document.createElement('strong');
      strong.textContent = String(n);
      li.append(strong, document.createTextNode(` ${name}`));
      scrubChips.appendChild(li);
    });

    if (!raw.trim()) scrubSummary.textContent = 'No secrets detected yet. Paste something or load the sample.';
    else if (total === 0) scrubSummary.textContent = 'No secrets detected with the active rules. Output matches input.';
    else scrubSummary.textContent = `${parts.join(', ')} Scrubbed`;
  }

  /* Large pastes are re-scrubbed less often so typing stays responsive. */
  const LARGE_INPUT = 200000;
  const HUGE_INPUT = 2000000;
  let scrubTimer = 0;
  let warnedHuge = false;
  function renderScrubDebounced() {
    const len = scrubInput.value.length;
    const wait = len > HUGE_INPUT ? 900 : len > LARGE_INPUT ? 450 : 90;
    if (len > HUGE_INPUT && !warnedHuge) {
      warnedHuge = true;
      toast(`Large input (${(len / 1e6).toFixed(1)}M chars). Scrubbing may take a moment.`, 'info', 4000);
    }
    if (len <= HUGE_INPUT) warnedHuge = false;
    window.clearTimeout(scrubTimer);
    scrubTimer = window.setTimeout(renderScrub, wait);
  }

  function buildSampleLeak() {
    /* Fake, non-functional demo values are assembled at runtime so the source file
       never contains literal credential-shaped strings. */
    const j = (...p) => p.join('');
    const openai = j('sk', '-proj-', 'Xr7Lq2Vn9Tb4Wm8Kc1Hy6Pd3Zs5Fg0Ja');
    const anthropic = j('sk', '-ant-', 'api03-', 'q9Lm2Rt7Yv4Xc8Bn1Kd6Hs3Wf5Gp0Jz');
    const github = j('gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8');
    const ghPat = j('github', '_pat_', '11ABCDEFG0123456789_', 'abcdefghijklmnopqrstuvwxyz');
    const aws = j('AK', 'IA', 'IOSFODNN7', 'EXAMPLE');
    const awsSecret = j('wJalrXUtnFEMI/K7MDENG/', 'bPxRfiCYEXAMPLEKEY');
    const jwt = j('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIn0', '.', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    const keyHeader = j('-----BEGIN ', 'OPENSSH ', 'PRIVATE KEY-----');
    const keyFooter = j('-----END ', 'OPENSSH ', 'PRIVATE KEY-----');

    return [
      '# Debug session: payment-service crash (paste for AI review)',
      '',
      '## .env',
      `OPENAI_API_KEY=${openai}`,
      `ANTHROPIC_API_KEY=${anthropic}`,
      `GITHUB_TOKEN=${github}`,
      `GH_FINE_GRAINED=${ghPat}`,
      `AWS_ACCESS_KEY_ID=${aws}`,
      `aws_secret_access_key = ${awsSecret}`,
      'DATABASE_HOST=10.0.4.17',
      '',
      '## Request log',
      '[2026-11-16 04:21:07] POST /api/v1/charge from 203.0.113.42 (ipv6 2001:db8:85a3::8a2e:370:7334)',
      `  Authorization: Bearer ${jwt}`,
      '  customer: jane.doe@example.com, billing: finance-team@acme-corp.io',
      '  card: 4111 1111 1111 1111  exp 12/29',
      '  phone: +1 (415) 555-0132  alt: +960 777-1234',
      '  support escalated to ops@example.org',
      '',
      '## Deploy key (accidentally committed)',
      keyHeader,
      'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW',
      'QyNTUxOQAAACDx0examplefakekeymaterialdonotuseAAAAAAAAAAAAAAAAAAAAAAAA',
      keyFooter,
      '',
      'Question: why does the charge handler throw "TypeError: amount is undefined"?'
    ].join('\n');
  }

  function persistRules() {
    store.set('pss.scrubRules', getEnabledRules());
  }

  function setAllRules(on) {
    ruleInputs.forEach((el) => { el.checked = on; });
    persistRules();
    renderScrub();
    toast(on ? 'All redaction rules enabled' : 'All redaction rules disabled', on ? 'success' : 'warning');
  }

  (function restoreRules() {
    const saved = store.get('pss.scrubRules', null);
    if (saved && typeof saved === 'object') {
      ruleInputs.forEach((el) => {
        if (typeof saved[el.dataset.rule] === 'boolean') el.checked = saved[el.dataset.rule];
      });
    }
  })();

  scrubInput.addEventListener('input', renderScrubDebounced);
  ruleInputs.forEach((el) => el.addEventListener('change', () => { persistRules(); renderScrub(); }));
  $('rules-all-on').addEventListener('click', () => setAllRules(true));
  $('rules-all-off').addEventListener('click', () => setAllRules(false));
  $('scrub-sample-btn').addEventListener('click', () => {
    scrubInput.value = buildSampleLeak();
    renderScrub();
    toast('Sample leak data loaded and scrubbed', 'info');
  });
  $('scrub-clear-btn').addEventListener('click', () => {
    scrubInput.value = '';
    renderScrub();
    scrubInput.focus();
  });
  scrubCopyBtn.addEventListener('click', () => {
    renderScrub();
    copyText(scrubOutput.value, 'Clean prompt copied. Safe to paste into your AI.');
  });
  scrubInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      renderScrub();
      copyText(scrubOutput.value, 'Clean prompt copied. Safe to paste into your AI.');
    }
  });

  /* =========================================================
     MODULE 2 · EXIF & GPS stripper
     ========================================================= */
  const MAX_IMAGE_BYTES = 60 * 1024 * 1024;
  /* Browsers cap canvas size (Chrome ~268 MP, iOS Safari ~16.7 MP). Try a generous
     tier first, then a mobile-safe tier if the browser refuses to encode. */
  const CANVAS_TIERS = [
    { maxArea: 100000000, maxSide: 16384 },
    { maxArea: 16777216, maxSide: 8192 }
  ];
  const fitDims = (w, h, tier) => {
    const scale = Math.min(1, tier.maxSide / w, tier.maxSide / h, Math.sqrt(tier.maxArea / (w * h)));
    return { w: Math.max(1, Math.floor(w * scale)), h: Math.max(1, Math.floor(h * scale)), scaled: scale < 1 };
  };
  const dropzone = $('exif-dropzone');
  const fileInput = $('exif-file-input');
  const exifFormat = $('exif-format');
  const exifQuality = $('exif-quality');
  const exifBatch = $('exif-batch');
  const batchResults = $('exif-batch-results');
  const exifState = {
    file: null, bitmap: null, width: 0, height: 0, beforeUrl: '', afterUrl: '',
    cleanBlob: null, report: null, verify: null, encodeToken: 0
  };

  const ascii = (bytes, start, len) => {
    let s = '';
    const end = Math.min(bytes.length, start + len);
    for (let i = start; i < end; i += 1) s += String.fromCharCode(bytes[i]);
    return s;
  };

  function detectMime(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a) return 'image/png';
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
    return '';
  }

  /* Parse a TIFF structure (EXIF payload) and report GPS + camera fields. */
  function parseTiff(bytes, start, length) {
    const result = { gps: false, lat: null, lon: null, make: '', model: '', software: '', dateTime: '', valid: false };
    const end = Math.min(bytes.length, start + Math.max(0, length));
    if (end - start < 8) return result;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const order = ascii(bytes, start, 2);
    if (order !== 'II' && order !== 'MM') return result;
    const le = order === 'II';
    const u16 = (o) => (o >= 0 && o + 2 <= end ? view.getUint16(o, le) : 0);
    const u32 = (o) => (o >= 0 && o + 4 <= end ? view.getUint32(o, le) : 0);
    if (u16(start + 2) !== 42) return result;
    result.valid = true;
    const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

    const readEntries = (ifdOffset) => {
      const entries = new Map();
      const base = start + ifdOffset;
      if (ifdOffset <= 0 || base + 2 > end) return entries;
      const count = u16(base);
      if (count > 1000) return entries;
      for (let i = 0; i < count; i += 1) {
        const e = base + 2 + i * 12;
        if (e + 12 > end) break;
        const tag = u16(e);
        const type = u16(e + 2);
        const cnt = u32(e + 4);
        const size = (TYPE_SIZE[type] || 1) * cnt;
        const raw = u32(e + 8);
        entries.set(tag, { type, cnt, raw, valueOffset: size <= 4 ? e + 8 : start + raw });
      }
      return entries;
    };

    const readAscii = (entry) => {
      if (!entry || entry.type !== 2 || entry.valueOffset + entry.cnt > end) return '';
      return ascii(bytes, entry.valueOffset, entry.cnt).replace(/\0+$/, '').trim();
    };

    const readRationals = (entry) => {
      if (!entry || (entry.type !== 5 && entry.type !== 10)) return null;
      const out = [];
      for (let i = 0; i < entry.cnt; i += 1) {
        const o = entry.valueOffset + i * 8;
        if (o + 8 > end) return null;
        const num = entry.type === 10 ? view.getInt32(o, le) : view.getUint32(o, le);
        const den = entry.type === 10 ? view.getInt32(o + 4, le) : view.getUint32(o + 4, le);
        out.push(den ? num / den : 0);
      }
      return out;
    };

    const ifd0 = readEntries(u32(start + 4));
    result.make = readAscii(ifd0.get(0x010f));
    result.model = readAscii(ifd0.get(0x0110));
    result.software = readAscii(ifd0.get(0x0131));
    result.dateTime = readAscii(ifd0.get(0x0132));

    const gpsPtr = ifd0.get(0x8825);
    if (gpsPtr) {
      const gpsIfd = readEntries(gpsPtr.raw);
      if (gpsIfd.size > 0) {
        result.gps = true;
        const latRef = readAscii(gpsIfd.get(1)) || 'N';
        const lonRef = readAscii(gpsIfd.get(3)) || 'E';
        const lat = readRationals(gpsIfd.get(2));
        const lon = readRationals(gpsIfd.get(4));
        if (lat && lat.length === 3 && lon && lon.length === 3) {
          const toDec = (dms) => dms[0] + dms[1] / 60 + dms[2] / 3600;
          result.lat = toDec(lat) * (latRef.toUpperCase() === 'S' ? -1 : 1);
          result.lon = toDec(lon) * (lonRef.toUpperCase() === 'W' ? -1 : 1);
        }
      }
    }
    return result;
  }

  function emptyReport(mime) {
    return {
      mime,
      exif: { found: false, bytes: 0 },
      jfif: { found: false, bytes: 0, applicable: mime === 'image/jpeg' },
      xmp: { found: false, bytes: 0 },
      icc: { found: false, bytes: 0 },
      pngtext: { found: false, bytes: 0, count: 0, applicable: mime === 'image/png' },
      gps: { found: false, lat: null, lon: null },
      other: [],
      camera: { make: '', model: '', software: '', dateTime: '' },
      privacyFound: false
    };
  }

  function absorbTiff(report, tiff) {
    if (!tiff.valid) return;
    if (tiff.gps) {
      report.gps.found = true;
      if (tiff.lat !== null) { report.gps.lat = tiff.lat; report.gps.lon = tiff.lon; }
    }
    ['make', 'model', 'software', 'dateTime'].forEach((k) => {
      if (tiff[k] && !report.camera[k]) report.camera[k] = tiff[k];
    });
  }

  function inspectJpeg(bytes, report) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let off = 2;
    while (off + 4 <= bytes.length) {
      if (bytes[off] !== 0xff) break;
      const marker = bytes[off + 1];
      if (marker === 0xff) { off += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
      if (marker === 0xd9 || marker === 0xda) break;
      const segLen = view.getUint16(off + 2);
      if (segLen < 2) break;
      const dataStart = off + 4;
      const dataLen = segLen - 2;
      const total = segLen + 2;
      if (marker === 0xe0) {
        const id = ascii(bytes, dataStart, 5);
        if (id === 'JFIF\0' || id === 'JFXX\0') { report.jfif.found = true; report.jfif.bytes += total; }
      } else if (marker === 0xe1) {
        if (ascii(bytes, dataStart, 6) === 'Exif\0\0') {
          report.exif.found = true;
          report.exif.bytes += total;
          absorbTiff(report, parseTiff(bytes, dataStart + 6, dataLen - 6));
        } else if (ascii(bytes, dataStart, 29) === 'http://ns.adobe.com/xap/1.0/\0' || ascii(bytes, dataStart, 34) === 'http://ns.adobe.com/xmp/extension/') {
          report.xmp.found = true;
          report.xmp.bytes += total;
        } else {
          report.other.push(`APP1 (${formatBytes(total)})`);
        }
      } else if (marker === 0xe2) {
        if (ascii(bytes, dataStart, 12) === 'ICC_PROFILE\0') { report.icc.found = true; report.icc.bytes += total; }
        else report.other.push(`APP2 (${formatBytes(total)})`);
      } else if (marker === 0xed) {
        report.other.push(`IPTC/Photoshop APP13 (${formatBytes(total)})`);
      } else if (marker === 0xfe) {
        report.other.push(`JPEG comment (${formatBytes(total)})`);
      } else if (marker >= 0xe3 && marker <= 0xef) {
        report.other.push(`APP${marker - 0xe0} (${formatBytes(total)})`);
      }
      off += total;
    }
  }

  function inspectPng(bytes, report) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let off = 8;
    while (off + 12 <= bytes.length) {
      const len = view.getUint32(off);
      const type = ascii(bytes, off + 4, 4);
      const dataStart = off + 8;
      if (dataStart + len > bytes.length) break;
      if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
        const keyword = ascii(bytes, dataStart, Math.min(len, 80)).split('\0')[0];
        if (type === 'iTXt' && keyword === 'XML:com.adobe.xmp') {
          report.xmp.found = true;
          report.xmp.bytes += len + 12;
        } else {
          report.pngtext.found = true;
          report.pngtext.count += 1;
          report.pngtext.bytes += len + 12;
        }
      } else if (type === 'eXIf') {
        report.exif.found = true;
        report.exif.bytes += len + 12;
        absorbTiff(report, parseTiff(bytes, dataStart, len));
      } else if (type === 'iCCP') {
        report.icc.found = true;
        report.icc.bytes += len + 12;
      } else if (type === 'tIME') {
        report.other.push('tIME timestamp chunk');
      } else if (type === 'IEND') {
        break;
      }
      off += 12 + len;
    }
  }

  function inspectWebp(bytes, report) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let off = 12;
    while (off + 8 <= bytes.length) {
      const fourcc = ascii(bytes, off, 4);
      const size = view.getUint32(off + 4, true);
      const dataStart = off + 8;
      if (dataStart + size > bytes.length) break;
      if (fourcc === 'EXIF') {
        report.exif.found = true;
        report.exif.bytes += size + 8;
        const tiffStart = ascii(bytes, dataStart, 6) === 'Exif\0\0' ? dataStart + 6 : dataStart;
        absorbTiff(report, parseTiff(bytes, tiffStart, size - (tiffStart - dataStart)));
      } else if (fourcc === 'XMP ') {
        report.xmp.found = true;
        report.xmp.bytes += size + 8;
      } else if (fourcc === 'ICCP') {
        report.icc.found = true;
        report.icc.bytes += size + 8;
      }
      off = dataStart + size + (size % 2);
    }
  }

  function inspectBytes(buffer) {
    const bytes = new Uint8Array(buffer);
    const mime = detectMime(bytes);
    const report = emptyReport(mime);
    try {
      if (mime === 'image/jpeg') inspectJpeg(bytes, report);
      else if (mime === 'image/png') inspectPng(bytes, report);
      else if (mime === 'image/webp') inspectWebp(bytes, report);
    } catch (err) {
      report.other.push('parser stopped early (malformed structure)');
    }
    report.privacyFound = report.exif.found || report.xmp.found || report.pngtext.found || report.gps.found;
    return report;
  }

  /* Exposed read-only for power users who want to audit a file from DevTools. */
  window.PrivacyShield = Object.freeze({ inspectBytes });

  function setStatus(el, text, state) {
    el.textContent = text;
    el.dataset.state = state;
  }

  function renderReport(report) {
    const segEl = (key) => $('exif-segments').querySelector(`[data-segment="${key}"] .segment-state`);
    const segState = (key, entry, applicable = true) => {
      const el = segEl(key);
      if (!el) return;
      if (!applicable) { el.textContent = 'N/A'; el.dataset.state = 'unknown'; return; }
      if (entry.found) {
        el.textContent = entry.bytes ? `Found · ${formatBytes(entry.bytes)}` : 'Found';
        el.dataset.state = 'found';
      } else {
        el.textContent = 'None';
        el.dataset.state = 'clean';
      }
    };
    segState('exif', report.exif);
    segState('jfif', report.jfif, report.jfif.applicable);
    segState('xmp', report.xmp);
    segState('icc', report.icc);
    segState('pngtext', report.pngtext, report.pngtext.applicable);
    segState('gps', { found: report.gps.found, bytes: 0 });

    if (report.gps.found) {
      const coords = report.gps.lat !== null ? ` · ${report.gps.lat.toFixed(5)}, ${report.gps.lon.toFixed(5)}` : '';
      setStatus($('exif-gps-status'), `Yes, location exposed${coords}`, 'danger');
    } else {
      setStatus($('exif-gps-status'), 'No GPS data', 'ok');
    }
    if (report.privacyFound) setStatus($('exif-meta-status'), 'Yes, hidden metadata', 'danger');
    else if (report.icc.found || report.jfif.found || report.other.length) setStatus($('exif-meta-status'), 'Minor (non-identifying)', 'warn');
    else setStatus($('exif-meta-status'), 'None detected', 'ok');

    const notes = [];
    const cam = [report.camera.make, report.camera.model].filter(Boolean).join(' ');
    if (cam) notes.push(`Camera: ${cam}.`);
    if (report.camera.software) notes.push(`Software: ${report.camera.software}.`);
    if (report.camera.dateTime) notes.push(`Captured: ${report.camera.dateTime}.`);
    if (report.other.length) notes.push(`Other blocks: ${report.other.slice(0, 6).join(', ')}.`);
    notes.push('Scanned directly from the file bytes with DataView.');
    exifState.baseNote = notes.join(' ');
    $('exif-segment-note').textContent = exifState.baseNote;
  }

  async function decodeImage(file) {
    if (typeof window.createImageBitmap === 'function') {
      try {
        return await window.createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (err) {
        try { return await window.createImageBitmap(file); } catch (e) { /* fall back to <img> decoding below */ }
      }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.addEventListener('load', () => { resolve(img); window.setTimeout(() => URL.revokeObjectURL(url), 0); }, { once: true });
      img.addEventListener('error', () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); }, { once: true });
      img.src = url;
    });
  }

  const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });

  function syncQualityControl() {
    const isPng = exifFormat.value === 'image/png';
    exifQuality.disabled = isPng;
    $('exif-quality-value').textContent = isPng ? 'Lossless' : `${exifQuality.value}%`;
    syncRange(exifQuality);
  }

  async function encodeClean() {
    if (!exifState.bitmap) return;
    const token = ++exifState.encodeToken;
    const type = exifFormat.value;
    const quality = Number(exifQuality.value) / 100;
    $('exif-processing').hidden = false;
    $('exif-download-btn').disabled = true;

    const encoded = await encodeBitmap(exifState.bitmap, type, quality, () => token === exifState.encodeToken);
    if (token !== exifState.encodeToken) return;
    $('exif-processing').hidden = true;
    if (!encoded) {
      toast('Your browser could not re-encode this image (it may be too large). Try JPEG, or a smaller image.', 'error', 5000);
      return;
    }
    const { blob, dims } = encoded;
    exifState.outDims = dims;
    if (dims.scaled && exifState.scaleNoticeFor !== exifState.file) {
      exifState.scaleNoticeFor = exifState.file;
      toast(`Image is larger than your browser's canvas limit, so the clean copy is ${dims.w} × ${dims.h}px.`, 'warning', 5500);
    }
    if (blob.type !== type) {
      toast(`This browser can't export ${type.split('/')[1].toUpperCase()}; saved as ${blob.type.split('/')[1].toUpperCase()} instead.`, 'warning', 4500);
    }

    exifState.cleanBlob = blob;
    if (exifState.afterUrl) URL.revokeObjectURL(exifState.afterUrl);
    exifState.afterUrl = URL.createObjectURL(blob);
    $('exif-preview-after').src = exifState.afterUrl;

    const before = exifState.file.size;
    const after = blob.size;
    $('exif-size-before').textContent = formatBytes(before);
    $('exif-size-after').textContent = formatBytes(after);
    const delta = before ? ((after - before) / before) * 100 : 0;
    const deltaEl = $('exif-size-delta');
    deltaEl.textContent = `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(1)}%`;
    deltaEl.dataset.trend = delta < -0.05 ? 'down' : delta > 0.05 ? 'up' : 'neutral';

    const verify = inspectBytes(await blob.arrayBuffer());
    if (token !== exifState.encodeToken) return;
    exifState.verify = verify;
    const sizeNote = dims.scaled ? ` Output resized to ${dims.w} × ${dims.h}px (canvas limit).` : '';
    $('exif-segment-note').textContent = verify.privacyFound
      ? `${exifState.baseNote}${sizeNote} Warning: the re-encoded output still contains metadata.`
      : `${exifState.baseNote}${sizeNote} Verified: the clean output has 0 EXIF, GPS, XMP or text chunks.`;
    $('exif-download-btn').disabled = false;
    store.set('pss.exifFormat', type);
    store.set('pss.exifQuality', Number(exifQuality.value));
  }

  async function encodeBitmap(bitmap, type, quality, isCurrent = () => true) {
    const canvas = $('exif-canvas');
    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    for (const tier of CANVAS_TIERS) {
      if (!isCurrent()) return null;
      const dims = fitDims(width, height, tier);
      try {
        canvas.width = dims.w;
        canvas.height = dims.h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.clearRect(0, 0, dims.w, dims.h);
        if (type === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, dims.w, dims.h);
        }
        ctx.drawImage(bitmap, 0, 0, dims.w, dims.h);
        const blob = await canvasToBlob(canvas, type, type === 'image/png' ? undefined : quality);
        if (blob) return { blob, dims };
      } catch (err) {
        // Try the next canvas size when this allocation or encode fails.
      }
    }
    return null;
  }

  const encodeCleanDebounced = debounce(encodeClean, 160);

  function resetExif({ silent = false } = {}) {
    exifState.encodeToken += 1;
    if (exifState.beforeUrl) URL.revokeObjectURL(exifState.beforeUrl);
    if (exifState.afterUrl) URL.revokeObjectURL(exifState.afterUrl);
    if (exifState.bitmap && typeof exifState.bitmap.close === 'function') exifState.bitmap.close();
    Object.assign(exifState, { file: null, bitmap: null, width: 0, height: 0, beforeUrl: '', afterUrl: '', cleanBlob: null, report: null, verify: null, baseNote: '', outDims: null });
    $('exif-preview-before').removeAttribute('src');
    $('exif-preview-after').removeAttribute('src');
    $('exif-workspace').hidden = true;
    exifBatch.hidden = true;
    batchResults.replaceChildren();
    $('exif-batch-status').textContent = '';
    $('exif-processing').hidden = true;
    dropzone.classList.remove('is-compact');
    $('exif-download-btn').disabled = true;
    $('exif-reset-btn').disabled = true;
    ['exif-filename', 'exif-mime', 'exif-size', 'exif-dimensions', 'exif-size-before', 'exif-size-after', 'exif-size-delta'].forEach((id) => { $(id).textContent = '-'; });
    $('exif-size-delta').dataset.trend = 'neutral';
    setStatus($('exif-gps-status'), 'Unknown', 'unknown');
    setStatus($('exif-meta-status'), 'Unknown', 'unknown');
    $$('.segment-state', $('exif-segments')).forEach((el) => { el.textContent = '-'; el.dataset.state = 'unknown'; });
    $('exif-segment-note').textContent = 'Scanned directly from the file bytes with DataView.';
    const canvas = $('exif-canvas');
    canvas.width = 1;
    canvas.height = 1;
    if (!silent) toast('Image cleared from memory', 'info');
  }

  function setExifBusy(busy) {
    dropzone.classList.toggle('is-busy', busy);
    dropzone.setAttribute('aria-busy', String(busy));
    fileInput.disabled = busy;
    if (busy) $('exif-download-btn').disabled = true;
  }

  async function handleFiles(files) {
    if (!files.length || dropzone.classList.contains('is-busy')) return;
    setExifBusy(true);
    try {
      if (files.length === 1) await loadFile(files[0]);
      else await loadBatch(files);
    } finally {
      setExifBusy(false);
      if (exifState.cleanBlob) $('exif-download-btn').disabled = false;
    }
  }

  async function readExifImage(file) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`File is too large (${formatBytes(file.size)}). Limit is ${formatBytes(MAX_IMAGE_BYTES)}.`);
    }
    let report;
    try {
      report = inspectBytes(await file.arrayBuffer());
    } catch (err) {
      throw new Error('Could not read that file.');
    }
    if (!report.mime) {
      throw new Error(`"${file.name || 'This file'}" is not a PNG, JPG/JPEG or WebP image.`);
    }
    try {
      return { report, bitmap: await decodeImage(file) };
    } catch (err) {
      throw new Error('This image could not be decoded by your browser.');
    }
  }

  function identifyingMetadata(report) {
    const found = [];
    if (report.gps.found) found.push('GPS location');
    if (report.exif.found) found.push('EXIF');
    if (report.xmp.found) found.push('XMP');
    if (report.pngtext.found) found.push('text chunks');
    return found;
  }

  async function loadFile(file) {
    if (file.size > 8 * 1024 * 1024 && file.size <= MAX_IMAGE_BYTES) {
      toast(`Reading ${formatBytes(file.size)} image locally…`, 'info', 2500);
    }
    let report;
    let bitmap;
    try {
      ({ report, bitmap } = await readExifImage(file));
    } catch (err) {
      toast(err.message, 'error');
      return;
    }

    resetExif({ silent: true });
    exifState.file = file;
    exifState.bitmap = bitmap;
    exifState.width = bitmap.width || bitmap.naturalWidth;
    exifState.height = bitmap.height || bitmap.naturalHeight;
    exifState.report = report;

    $('exif-filename').textContent = file.name || 'pasted-image';
    $('exif-mime').textContent = report.mime + (file.type && file.type !== report.mime ? ` (declared ${file.type})` : '');
    $('exif-size').textContent = `${formatBytes(file.size)} (${file.size.toLocaleString()} B)`;
    $('exif-dimensions').textContent = `${exifState.width} × ${exifState.height}px`;
    renderReport(report);

    exifState.beforeUrl = URL.createObjectURL(file);
    $('exif-preview-before').src = exifState.beforeUrl;
    $('exif-workspace').hidden = false;
    dropzone.classList.add('is-compact');
    $('exif-reset-btn').disabled = false;

    await encodeClean();
    const found = identifyingMetadata(report);
    toast(found.length ? `Found ${found.join(', ')}. Removed in the clean copy.` : 'No identifying metadata found. Clean copy ready.', found.length ? 'warning' : 'success', 4200);
  }

  async function loadBatch(files) {
    resetExif({ silent: true });
    exifBatch.hidden = false;
    dropzone.classList.add('is-compact');
    const type = exifFormat.value;
    const quality = Number(exifQuality.value) / 100;
    const status = $('exif-batch-status');
    let ready = 0;
    for (const [index, file] of files.entries()) {
      const filename = file.name || 'image';
      status.textContent = `Processing image ${index + 1} of ${files.length}…`;
      try {
        const { bitmap, report } = await readExifImage(file);
        let encoded;
        try {
          encoded = await encodeBitmap(bitmap, type, quality);
        } finally {
          bitmap.close?.();
          const canvas = $('exif-canvas');
          canvas.width = 1;
          canvas.height = 1;
        }
        if (!encoded) throw new Error('Could not re-encode this image. Try JPEG or a smaller image.');
        const { blob, dims } = encoded;
        const verified = inspectBytes(await blob.arrayBuffer());
        if (!verified.mime || verified.privacyFound) throw new Error('Could not verify a clean copy of this image.');

        const found = identifyingMetadata(report);
        const notes = [];
        if (!report.gps.found) notes.push('No GPS found.');
        if (found.length) notes.push(`Removed ${found.join(', ')}.`);
        if (dims.scaled) notes.push(`Resized to ${dims.w} × ${dims.h}px.`);
        if (blob.type !== type) notes.push(`Saved as ${blob.type.split('/')[1].toUpperCase()}.`);
        addBatchResult(filename, notes.join(' '), blob);
        ready += 1;
      } catch (err) {
        addBatchResult(filename, err.message);
      }
    }
    status.textContent = `${ready} of ${files.length} images ready to download.`;
    $('exif-reset-btn').disabled = false;
  }

  function addBatchResult(filename, summary, blob) {
    const item = document.createElement('li');
    item.className = 'exif-batch-row';
    const detail = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'exif-batch-name';
    name.textContent = filename;
    const note = document.createElement('p');
    note.className = 'exif-batch-note';
    note.textContent = summary;
    detail.append(name, note);
    item.append(detail);
    if (blob) {
      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'btn btn-ghost';
      download.textContent = 'Download';
      download.setAttribute('aria-label', `Download clean copy of ${filename}`);
      download.addEventListener('click', () => downloadClean(filename, blob));
      item.append(download);
    }
    batchResults.append(item);
  }

  function downloadClean(filename, blob) {
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type] || 'png';
    const base = (filename || 'image').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'image';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}-clean.${ext}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Downloaded ${a.download} (${formatBytes(blob.size)})`, 'success');
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dropzone.classList.add('is-dragover');
  }));
  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('is-dragover');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    handleFiles(Array.from(e.dataTransfer?.files || []));
  });
  window.addEventListener('dragover', (e) => { if (activeTab === 'exif') e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (activeTab === 'exif' && !dropzone.contains(e.target)) e.preventDefault(); });
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    fileInput.value = '';
    handleFiles(files);
  });
  document.addEventListener('paste', (e) => {
    if (activeTab !== 'exif' || !e.clipboardData) return;
    const item = Array.from(e.clipboardData.items || []).find((it) => it.kind === 'file' && /^image\/(png|jpeg|webp)$/.test(it.type));
    if (item) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        handleFiles([file]);
      }
    }
  });
  exifFormat.addEventListener('change', () => { syncQualityControl(); encodeClean(); });
  exifQuality.addEventListener('input', () => { syncQualityControl(); encodeCleanDebounced(); });
  $('exif-download-btn').addEventListener('click', () => {
    if (exifState.cleanBlob && exifState.file) downloadClean(exifState.file.name, exifState.cleanBlob);
  });
  $('exif-reset-btn').addEventListener('click', () => resetExif());

  (function restoreExifSettings() {
    const fmt = store.get('pss.exifFormat', null);
    if (['image/png', 'image/jpeg', 'image/webp'].includes(fmt)) exifFormat.value = fmt;
    const q = Number(store.get('pss.exifQuality', 92));
    if (q >= 10 && q <= 100) exifQuality.value = String(q);
    syncQualityControl();
  })();

  /* =========================================================
     MODULE 3 · URL unclutter
     ========================================================= */
  const MAX_URLS = 50;
  const TRACKING_PARAMS = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name', 'utm_cid',
    'utm_reader', 'utm_referrer', 'utm_social', 'utm_social-type', 'utm_brand', 'utm_place', 'utm_pubreferrer',
    'utm_swu', 'utm_viz_id', 'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'mc_cid',
    'mc_eid', 'igshid', 'igsh', 'si', 'ref', 'ref_src', 'ref_url', '_hsenc', '_hsmi', '__hssc', '__hstc',
    '__hsfp', 'hsctatracking', 'mkt_tok', 'yclid', 'ysclid', 'twclid', 'ttclid', 'li_fat_id', 'epik', 's_cid',
    'scid', 'vero_id', 'vero_conv', 'wickedid', 'oly_anon_id', 'oly_enc_id', 'rb_clickid', '_ga', '_gl', 'spm',
    'trk', 'trkcampaign', 'sc_campaign', 'sc_channel', 'sc_content', 'sc_medium', 'sc_outcome', 'sc_geo',
    'sc_country', 'cmpid', 'icid', 'ncid', 'irclickid', 'irgwc', 'xtor', 'at_medium', 'at_campaign', 'wt_mc',
    'wt.mc_id', 'mbid', 'zanpid', 'srsltid', 'fb_action_ids', 'fb_action_types', 'fb_ref', 'fb_source',
    'action_object_map', 'action_type_map', 'action_ref_map', 'gad_source', 'gad_campaignid', 'nb_klid',
    'ml_subscriber', 'ml_subscriber_hash', 'pk_campaign', 'pk_kwd', 'pk_source', 'pk_medium', 'pk_content',
    'mtm_campaign', 'mtm_keyword', 'mtm_source', 'mtm_medium', 'mtm_content', 'mtm_cid', 'mtm_group',
    'mtm_placement', 'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src', 'hsa_tgt', 'hsa_kw', 'hsa_mt',
    'hsa_net', 'hsa_ver', 'ss_source', 'ss_campaign_id', 'sms_ss', 'smid', 'smtyp', 'share_source', 'share_medium'
  ]);
  const TRACKING_PREFIXES = ['utm_', 'pk_', 'mtm_', 'hsa_', '__hs'];

  const isTrackingKey = (key) => {
    const k = key.toLowerCase();
    return TRACKING_PARAMS.has(k) || TRACKING_PREFIXES.some((p) => k.startsWith(p));
  };

  const safeDecode = (s) => {
    try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (err) { return s; }
  };

  function cleanUrl(line) {
    const input = line.trim();
    const invalid = { input, valid: false, clean: input, removed: [] };
    if (/\s/.test(input)) return invalid;
    let candidate = input;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
      if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#]|$)/i.test(candidate) && !/\s/.test(candidate)) candidate = `https://${candidate}`;
      else return invalid;
    }
    let url;
    try {
      url = new URL(candidate);
    } catch (err) {
      return invalid;
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return invalid;

    const removed = [];
    const cleanQuery = (query) => {
      if (!query) return '';
      const kept = [];
      query.split('&').forEach((pair) => {
        if (!pair) return;
        const eq = pair.indexOf('=');
        const rawKey = eq === -1 ? pair : pair.slice(0, eq);
        const rawVal = eq === -1 ? '' : pair.slice(eq + 1);
        const key = safeDecode(rawKey);
        if (isTrackingKey(key)) removed.push({ key, value: safeDecode(rawVal) });
        else kept.push(pair);
      });
      return kept.join('&');
    };

    const q = cleanQuery(url.search.replace(/^\?/, ''));
    url.search = q ? `?${q}` : '';
    /* Some sites smuggle trackers into the fragment (#utm_source=… or #?utm_source=…). */
    if (url.hash && /(?:^#\??|&)(?:utm_|fbclid|gclid|_hs|mc_[ce]id|igshid|xtor)/i.test(url.hash)) {
      const raw = url.hash.slice(1);
      const lead = raw.startsWith('?') ? '?' : '';
      const body = cleanQuery(raw.replace(/^\?/, ''));
      url.hash = body ? `${lead}${body}` : '';
    }
    let clean = url.href;
    const hadTrailingSlash = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+\/(?:[?#]|$)/i.test(candidate);
    if (url.pathname === '/' && !url.search && !url.hash && !hadTrailingSlash) clean = clean.replace(/\/$/, '');
    return { input, valid: true, clean, removed };
  }

  const urlsInput = $('urls-input');
  const urlsResults = $('urls-results');
  const urlTemplate = $('url-result-template');
  let cleanedUrls = [];

  const getUrlLines = () => urlsInput.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  function updateUrlCounter() {
    const n = getUrlLines().length;
    $('urls-count').textContent = String(n);
    $('urls-counter').dataset.state = n > MAX_URLS ? 'over' : 'ok';
  }

  function runUrlCleaner({ announce = true } = {}) {
    const lines = getUrlLines();
    if (!lines.length) {
      toast('Paste at least one URL first', 'warning');
      return;
    }
    if (lines.length > MAX_URLS) toast(`Only the first ${MAX_URLS} URLs were processed (${lines.length - MAX_URLS} ignored).`, 'warning', 4200);
    const results = lines.slice(0, MAX_URLS).map(cleanUrl);
    urlsResults.replaceChildren();
    let paramsRemoved = 0;
    let cleanedCount = 0;
    let invalid = 0;
    results.forEach((r, i) => {
      const node = urlTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector('.url-index').textContent = `#${i + 1}`;
      const status = node.querySelector('.url-status');
      const orig = node.querySelector('[data-role="original"]');
      const clean = node.querySelector('[data-role="clean"]');
      const list = node.querySelector('[data-role="removed"]');
      const copyBtn = node.querySelector('[data-action="copy-url"]');
      if (!r.valid) {
        invalid += 1;
        status.dataset.state = 'invalid';
        status.textContent = 'Invalid URL';
        clean.textContent = r.input;
        copyBtn.remove();
      } else {
        clean.textContent = r.clean;
        copyBtn.dataset.url = r.clean;
        if (r.removed.length) {
          cleanedCount += 1;
          paramsRemoved += r.removed.length;
          status.dataset.state = 'cleaned';
          status.textContent = `${r.removed.length} removed`;
          orig.textContent = r.input;
          r.removed.forEach((p) => {
            const chip = document.createElement('li');
            chip.className = 'param-chip';
            const val = p.value.length > 32 ? `${p.value.slice(0, 32)}…` : p.value;
            chip.textContent = val ? `${p.key}=${val}` : p.key;
            chip.title = `${p.key}=${p.value}`;
            list.appendChild(chip);
          });
        } else {
          status.dataset.state = 'clean';
          status.textContent = 'Already clean';
        }
      }
      urlsResults.appendChild(node);
    });
    cleanedUrls = results.filter((r) => r.valid).map((r) => r.clean);
    $('urls-stat-cleaned').textContent = String(cleanedCount);
    $('urls-stat-params').textContent = String(paramsRemoved);
    $('urls-stat-invalid').textContent = String(invalid);
    $('urls-copy-btn').disabled = cleanedUrls.length === 0;
    refreshIcons();
    if (announce) {
      toast(paramsRemoved
        ? `Stripped ${paramsRemoved} tracking parameter${paramsRemoved === 1 ? '' : 's'} from ${cleanedCount} link${cleanedCount === 1 ? '' : 's'}`
        : 'No tracking parameters found', paramsRemoved ? 'success' : 'info');
    }
  }

  function resetUrls() {
    urlsInput.value = '';
    urlsResults.replaceChildren();
    cleanedUrls = [];
    ['urls-stat-cleaned', 'urls-stat-params', 'urls-stat-invalid'].forEach((id) => { $(id).textContent = '0'; });
    $('urls-copy-btn').disabled = true;
    updateUrlCounter();
  }

  const SAMPLE_URLS = [
    'https://www.example.com/blog/privacy-guide?utm_source=twitter&utm_medium=social&utm_campaign=launch_week&fbclid=IwAR2xYz_9kLmNoPqRsT',
    'https://shop.example.org/products/headphones?id=8812&color=black&gclid=Cj0KCQiA4NWrBhD-ARIsAFCKwWt&utm_term=wireless',
    'https://www.instagram.com/p/C1a2B3c4D5e/?igshid=MzRlODBiNWFlZA==&igsh=bXl0cmFja2Vy',
    'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=a1b2c3d4e5f64789',
    'https://youtu.be/dQw4w9WgXcQ?si=Zx9_TrackingToken&t=42',
    'https://news.example.net/article/2026/11/16/story.html?mc_cid=5d1f2a&mc_eid=9c8b7a6d5e&_hsenc=p2ANqtz-8xYz&_hsmi=284719',
    'https://www.bing.com/search?q=client+side+privacy&msclkid=3f2e1d0c9b8a7f6e&form=QBLH',
    'https://github.com/reseachrandomv/privacy-shield-studio?ref=producthunt',
    'https://docs.example.dev/getting-started#installation',
    'not a url at all'
  ];

  urlsInput.addEventListener('input', updateUrlCounter);
  urlsInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runUrlCleaner();
    }
  });
  $('urls-clean-btn').addEventListener('click', () => runUrlCleaner());
  $('urls-sample-btn').addEventListener('click', () => {
    urlsInput.value = SAMPLE_URLS.join('\n');
    updateUrlCounter();
    runUrlCleaner();
  });
  $('urls-clear-btn').addEventListener('click', () => { resetUrls(); urlsInput.focus(); });
  $('urls-copy-btn').addEventListener('click', () => {
    copyText(cleanedUrls.join('\n'), `Copied ${cleanedUrls.length} clean URL${cleanedUrls.length === 1 ? '' : 's'}`);
  });
  urlsResults.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="copy-url"]');
    if (btn && btn.dataset.url) copyText(btn.dataset.url, 'Clean URL copied');
  });

  /* =========================================================
     MODULE 4 · Crypto generator
     ========================================================= */
  const cryptoApi = window.crypto;
  const WORDLIST = 'acid acorn acre acts afar affix aged agent agile aging agony ahead aide aids aim ajar alarm alias alibi alien alike alive aloe aloft aloha alone amend amino ample amuse angel anger angle ankle apple april apron aqua area arena argue arise armed armor army aroma array arson art ashen ashes atlas atom attic audio avert avoid awake award awoke axis bacon badge bagel baggy baked baker balmy banjo barge barn bash basil bask batch bath baton bats blade blank blast blaze bleak blend bless blimp blink bloat blob blog blot blunt blurt blush boast boat body boil bok bolt boned boney bonus bony book booth boots boss botch both boxer breed bribe brick bride brim bring brink brisk broad broil broke brook broom brush buck bud buggy bulge bulk bully bunch bunny bunt bush bust busy buzz cable cache cadet cage cake calm cameo canal candy cane canon cape card cargo carol carry carve case cash cause cedar chain chair chant chaos charm chase cheek cheer chef chess chest chew chief chili chill chip chomp chop chow chuck chump chunk churn chute cider cinch city civic civil clad claim clamp clap clash clasp class claw clay clean clear cleat cleft clerk click cling clink clip cloak clock clone cloth cloud clump coach coast coat cod coil coke cola cold colt coma come comic comma cone cope copy coral cork cost cot couch cough cover cozy craft cramp crane crank crate crave crawl crazy creme crepe crept crib cried crisp crook crop cross crowd crown crumb crush crust cub cult cupid cure curl curry curse curve curvy cushy cut cycle dab dad daily dairy daisy dance dandy darn dart dash data date dawn deaf deal dean debit debt debug decaf decal decay deck decor decoy deed delay denim dense dent depth derby desk dial diary dice dig dill dime dimly diner dingy disco dish disk ditch ditzy dizzy dock dodge doing doll dome donor donut dose dot dove down dowry doze drab drama drank draw dress dried drift drill drive drone droop drove drown drum dry duck duct dude dug duke duo dusk dust duty dwarf dwell eagle early earth easel east eaten eats ebay ebony ebook echo edge eel eject elbow elder elf elk elm elope elude elves email emit empty emu enter entry envoy equal erase error erupt essay etch evade even evict evil evoke exact exit fable faced fact fade fall false fancy fang fax feast feed femur fence fend ferry fetal fetch fever fiber fifth fifty film filth final finch fit five flag flaky flame flap flask fled flick fling flint flip flirt float flock flop floss flyer foam foe fog foil folic folk food fool found fox foyer frail frame fray fresh fried frill frisk from front frost froth frown froze fruit gag gains gala game gap gas gave gear gecko geek gem genre gift gig gills given giver glad glass glide gloss glove glow glue goal going golf gong good gooey goofy gore gown grab grain grant grape graph grasp grass grave gravy gray green greet grew grid grief grill grip grit groom grope growl grub grunt guide gulf gulp gummy guru gush gut guy habit half halo halt happy harm hash hasty hatch hate haven hazel hazy heap heat heave hedge hefty help herbs hers hub hug hula hull human humid hump hung hunk hunt hurry hurt hush hut ice icing icon icy igloo image ion iron islam issue item ivory ivy jab jam jaws jazz jeep jelly jet jiffy job jog jolly jolt jot joy judge juice juicy july jumbo jump junky juror jury keep keg kept kick kilt king kite kitty kiwi knee knelt koala kung ladle lady lair lake lance land lapel large lash lasso last latch late lazy left legal lemon lend lens lent level lever lid life lift lilac lily limb limes line lint lion lip list lived liver lunar lunch lung lurch lure lurk lying lyric mace maker malt mama mango manor many map march mardi marry mash match mate math moan mocha moist mold mom moody mop morse most motor motto mount mouse mousy mouth move movie mower mud mug mulch mule mull mumbo mummy mural muse music musky mute nacho nag nail name nanny nap navy near neat neon nerd nest net next niece ninth nutty oak oasis oat ocean oil old olive omen onion only ooze opal open opera opt otter ouch ounce outer oval oven owl ozone pace pagan pager palm panda panic pants panty paper park party pasta patch path patio payer pecan penny pep perch perky perm pest petal petri petty photo plank plant plaza plead plot plow pluck plug plus poach pod poem poet pogo point poise poker polar polio polka polo pond pony poppy pork poser pouch pound pout power prank press print prior prism prize probe prong proof props prude prune pry pug pull pulp pulse puma punch punk pupil puppy purr purse push putt quack quake query quiet quill quilt quit quota quote rabid race rack radar radio raft rage raid rail rake rally ramp ranch range rank rant rash raven reach react ream rebel recap relax relay relic remix repay repel reply rerun reset rhyme rice rich ride rigid rigor rinse riot ripen rise risk ritzy rival river roast robe robin rock rogue roman romp rope rover royal ruby rug ruin rule runny rush rust rut sadly sage said saint salad salon salsa salt same sandy santa satin sauna saved savor sax say scale scam scan scare scarf scary scoff scold scoop scoot scope score scorn scout scowl scrap scrub scuba scuff sect sedan self send sepia serve set seven shack shade shady shaft shaky sham shape share sharp shed sheep sheet shelf shell shine shiny ship shirt shock shop shore shout shove shown showy shred shrug shun shush shut shy sift silk silly silo sip siren sixth size skate skew skid skier skies skip skirt skit sky slab slack slain slam slang slash slate slaw sled sleek sleep sleet slept slice slick slimy sling slip slit slob slot slug slum slurp slush small smash smell smile smirk smog snack snap snare snarl sneak sneer sniff snore snort snout snowy snub snuff speak speed spend spent spew spied spill spiny spoil spoke spoof spool spoon sport spot spout spray spree spur squad squat squid stack staff stage stain stall stamp stand stank stark start stash state stays steam steep stem step stew stick sting stir stock stole stomp stony stood stool stoop stop storm stout stove straw stray strut stuck stud stuff stump stung stunt suds sugar sulk surf sushi swab swan swarm sway swear sweat sweep swell swept swim swing swipe swirl swoop swore syrup tacky taco tag take tall talon tamer tank taper taps tarot tart task taste tasty taunt thank thaw theft theme thigh thing think thong thorn those throb thud thumb thump thus tiara tidal tidy tiger tile tilt tint tiny trace track trade train trait trap trash tray treat tree trek trend trial tribe trick trio trout truce truck trump trunk try tug tulip tummy turf tusk tutor tutu tux tweak tweet twice twine twins twirl twist uncle uncut undo unify union unit untie upon upper urban used user usher utter value vapor vegan venue verse vest veto vice video view viral virus visa visor vixen vocal voice void volt voter vowel wad wafer wager wages wagon wake walk wand wasp watch water wavy wheat whiff whole whoop wick widen widow width wife wifi wilt wimp wind wing wink wipe wired wiry wise wish wispy wok wolf womb wool woozy word work worry wound woven wrath wreck wrist xerox yahoo yam yard year yeast yelp yield yo-yo yodel yoga yoyo yummy zebra zero zesty zippy zone zoom'.split(' ');

  const CHARSETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~'
  };
  const AMBIGUOUS = new Set('0Oo1lI|`\'";:,.'.split(''));
  const RANDOM_SEPARATORS = '0123456789!@#$%&*-_=+'.split('');
  const ATTACK_GUESSES_PER_SECOND = 1e12;
  const TWO_32 = 0x100000000;

  /* Uniform integer in [0, max) using rejection sampling over Uint32 values:
     draws at or above the largest multiple of max are discarded, so there is no modulo bias. */
  const randBuffer = new Uint32Array(256);
  let randIndex = randBuffer.length;
  function nextUint32() {
    if (randIndex >= randBuffer.length) {
      cryptoApi.getRandomValues(randBuffer);
      randIndex = 0;
    }
    const v = randBuffer[randIndex];
    randBuffer[randIndex] = 0;
    randIndex += 1;
    return v;
  }
  function randomInt(max) {
    if (!Number.isInteger(max) || max <= 0 || max > TWO_32) throw new RangeError('randomInt: invalid range');
    const limit = TWO_32 - (TWO_32 % max);
    let x;
    do { x = nextUint32(); } while (x >= limit);
    return x % max;
  }
  const pick = (arr) => arr[randomInt(arr.length)];

  function genPassword() {
    const length = Number($('pw-length').value);
    const exclude = $('pw-exclude-ambiguous').checked;
    const sets = $$('#opts-password input[data-charset]')
      .filter((el) => el.checked)
      .map((el) => CHARSETS[el.dataset.charset].split('').filter((c) => !exclude || !AMBIGUOUS.has(c)))
      .filter((s) => s.length);
    const pool = Array.from(new Set(sets.flat()));
    if (!pool.length) return { value: '', bits: 0 };
    let value = '';
    /* Regenerate until every selected set is represented (uniform over valid passwords). */
    for (let attempt = 0; attempt < 500; attempt += 1) {
      let s = '';
      for (let i = 0; i < length; i += 1) s += pick(pool);
      value = s;
      if (length < sets.length || sets.every((set) => set.some((c) => s.includes(c)))) break;
    }
    return { value, bits: length * Math.log2(pool.length) };
  }

  function genPassphrase() {
    const count = Number($('pp-words').value);
    const sepChoice = $('pp-separator').value;
    const capitalize = $('pp-capitalize').checked;
    const addNumber = $('pp-number').checked;
    const words = [];
    for (let i = 0; i < count; i += 1) {
      const w = pick(WORDLIST);
      words.push(capitalize ? w.charAt(0).toUpperCase() + w.slice(1) : w);
    }
    let bits = count * Math.log2(WORDLIST.length);
    let value;
    if (sepChoice === 'random') {
      value = words[0];
      for (let i = 1; i < words.length; i += 1) value += pick(RANDOM_SEPARATORS) + words[i];
      bits += (count - 1) * Math.log2(RANDOM_SEPARATORS.length);
    } else {
      value = words.join(sepChoice);
    }
    if (addNumber) {
      const sep = sepChoice === 'random' ? pick(RANDOM_SEPARATORS) : sepChoice;
      value += sep + String(randomInt(100));
      bits += Math.log2(100) + (sepChoice === 'random' ? Math.log2(RANDOM_SEPARATORS.length) : 0);
    }
    return { value, bits };
  }

  function genKey() {
    const bytesEl = document.querySelector('input[name="key-bytes"]:checked');
    const fmtEl = document.querySelector('input[name="key-format"]:checked');
    const size = bytesEl ? Number(bytesEl.value) : 32;
    const fmt = fmtEl ? fmtEl.value : 'hex';
    const bytes = new Uint8Array(size);
    cryptoApi.getRandomValues(bytes);
    let value;
    if (fmt === 'hex') {
      value = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      let bin = '';
      bytes.forEach((b) => { bin += String.fromCharCode(b); });
      value = window.btoa(bin);
      if (fmt === 'base64url') value = value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    bytes.fill(0);
    return { value, bits: size * 8 };
  }

  /* Strength label and crack time are derived from the same number: the average
     time to brute-force the secret offline (half the keyspace at 10^12 guesses/s). */
  const STRENGTH_LABELS = ['-', 'Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'];
  const SECONDS_PER_YEAR = 365.25 * 24 * 3600;
  const crackSeconds = (bits) => Math.pow(2, bits - 1) / ATTACK_GUESSES_PER_SECOND;
  function strengthLevel(bits) {
    if (bits <= 0) return 0;
    const s = crackSeconds(bits);
    if (s < 1) return 1;                          /* Instantly */
    if (s < 30 * 24 * 3600) return 2;             /* under a month */
    if (s < 100 * SECONDS_PER_YEAR) return 3;     /* under a century */
    if (s < 1e6 * SECONDS_PER_YEAR) return 4;     /* under a million years */
    return 5;
  }

  function crackTime(bits) {
    if (bits <= 0) return '-';
    const seconds = crackSeconds(bits);
    if (seconds < 1) return 'Instantly';
    const steps = [['second', 60], ['minute', 60], ['hour', 24], ['day', 365.25]];
    let v = seconds;
    for (let i = 0; i < steps.length; i += 1) {
      const [name, factor] = steps[i];
      if (v < factor) {
        const n = Math.max(1, Math.round(v));
        return `${n} ${name}${n === 1 ? '' : 's'}`;
      }
      v /= factor;
    }
    if (v < 1000) {
      const n = Math.max(1, Math.round(v));
      return `${n} year${n === 1 ? '' : 's'}`;
    }
    if (v < 1e6) return 'Thousands of years';
    if (v < 1e9) return 'Millions of years';
    if (v < 1e12) return 'Billions of years';
    return 'Billions of years (longer than the age of the universe)';
  }

  let cryptoMode = 'password';
  const history = [];
  const outputEl = $('crypto-output');
  const MODE_LABELS = { password: 'Password', passphrase: 'Passphrase', key: 'API secret' };

  function maskSecret(s) {
    if (s.length <= 6) return '•'.repeat(s.length);
    return `${s.slice(0, 3)}${'•'.repeat(Math.min(12, s.length - 5))}${s.slice(-2)}`;
  }

  function renderHistory() {
    const list = $('crypto-history');
    list.replaceChildren();
    history.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const val = document.createElement('span');
      val.className = 'history-value';
      val.textContent = maskSecret(item.value);
      const meta = document.createElement('span');
      meta.className = 'history-meta';
      meta.textContent = `${item.label} · ${item.time}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-btn';
      btn.dataset.action = 'copy-history';
      btn.dataset.index = String(idx);
      btn.setAttribute('aria-label', `Copy ${item.label.toLowerCase()} generated at ${item.time}`);
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'copy');
      icon.className = 'h-3.5 w-3.5';
      btn.appendChild(icon);
      li.append(val, meta, btn);
      list.appendChild(li);
    });
    refreshIcons();
  }

  function pushHistory(value) {
    if (!$('crypto-history-enabled').checked || !value) return;
    history.unshift({
      value,
      label: MODE_LABELS[cryptoMode],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    if (history.length > 5) history.length = 5;
    renderHistory();
  }

  function renderEntropy(bits) {
    const level = strengthLevel(bits);
    $('crypto-entropy-bits').textContent = bits.toFixed(1);
    const label = $('crypto-strength-label');
    label.textContent = STRENGTH_LABELS[level];
    label.dataset.strength = String(level);
    const bar = $('crypto-strength-bar');
    bar.setAttribute('aria-valuenow', String(Math.min(256, Math.round(bits * 10) / 10)));
    bar.setAttribute('aria-valuetext', `${bits.toFixed(1)} bits, ${STRENGTH_LABELS[level]}`);
    const fill = $('crypto-strength-fill');
    fill.dataset.strength = String(level);
    fill.style.width = `${Math.min(bits / 128, 1) * 100}%`;
    $('crypto-crack-time').textContent = crackTime(bits);
  }

  function generateSecret({ record = true } = {}) {
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
      toast('Web Crypto is unavailable in this browser.', 'error');
      return;
    }
    let result;
    if (cryptoMode === 'passphrase') result = genPassphrase();
    else if (cryptoMode === 'key') result = genKey();
    else result = genPassword();
    outputEl.value = result.value;
    $('crypto-output-length').textContent = `${result.value.length} chars`;
    renderEntropy(result.bits);
    pulseClass(outputEl, 'is-fresh', 500);
    if (record) pushHistory(result.value);
  }

  const generateDebounced = debounce(() => generateSecret(), 150);

  function persistCrypto() {
    store.set('pss.cryptoMode', cryptoMode);
    store.set('pss.cryptoOptions', {
      pwLength: Number($('pw-length').value),
      pwSets: Object.fromEntries($$('#opts-password input[data-charset]').map((el) => [el.dataset.charset, el.checked])),
      pwExclude: $('pw-exclude-ambiguous').checked,
      ppWords: Number($('pp-words').value),
      ppSep: $('pp-separator').value,
      ppCap: $('pp-capitalize').checked,
      ppNum: $('pp-number').checked,
      keyBytes: (document.querySelector('input[name="key-bytes"]:checked') || {}).value || '32',
      keyFormat: (document.querySelector('input[name="key-format"]:checked') || {}).value || 'hex',
      history: $('crypto-history-enabled').checked
    });
  }

  function setMode(mode, { focus = false, regenerate = true } = {}) {
    cryptoMode = Object.prototype.hasOwnProperty.call(MODE_LABELS, mode) ? mode : 'password';
    $$('#crypto-modes .segment[data-mode]').forEach((btn) => {
      const on = btn.dataset.mode === cryptoMode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
      if (on && focus) btn.focus();
    });
    $$('.mode-options[data-mode-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.modePanel !== cryptoMode;
    });
    persistCrypto();
    if (regenerate) generateSecret();
  }

  function syncCryptoLabels() {
    $('pw-length-value').textContent = $('pw-length').value;
    $('pp-words-value').textContent = $('pp-words').value;
    syncRange($('pw-length'));
    syncRange($('pp-words'));
  }

  function restoreCrypto() {
    const o = store.get('pss.cryptoOptions', null);
    if (o && typeof o === 'object') {
      if (o.pwLength >= 8 && o.pwLength <= 128) $('pw-length').value = String(o.pwLength);
      if (o.pwSets && typeof o.pwSets === 'object') {
        $$('#opts-password input[data-charset]').forEach((el) => {
          if (typeof o.pwSets[el.dataset.charset] === 'boolean') el.checked = o.pwSets[el.dataset.charset];
        });
        if (!$$('#opts-password input[data-charset]').some((el) => el.checked)) $('pw-lower').checked = true;
      }
      if (typeof o.pwExclude === 'boolean') $('pw-exclude-ambiguous').checked = o.pwExclude;
      if (o.ppWords >= 3 && o.ppWords <= 12) $('pp-words').value = String(o.ppWords);
      if (typeof o.ppSep === 'string' && Array.from($('pp-separator').options).some((op) => op.value === o.ppSep)) $('pp-separator').value = o.ppSep;
      if (typeof o.ppCap === 'boolean') $('pp-capitalize').checked = o.ppCap;
      if (typeof o.ppNum === 'boolean') $('pp-number').checked = o.ppNum;
      const kb = $(`key-bytes-${String(o.keyBytes).replace(/[^0-9]/g, '')}`);
      if (kb) kb.checked = true;
      const kf = $(`key-format-${String(o.keyFormat).replace(/[^a-z0-9]/g, '')}`);
      if (kf) kf.checked = true;
      if (typeof o.history === 'boolean') $('crypto-history-enabled').checked = o.history;
    }
    syncCryptoLabels();
    setMode(store.get('pss.cryptoMode', 'password'), { regenerate: false });
  }

  $('pp-wordlist-size').textContent = WORDLIST.length.toLocaleString();

  $$('#crypto-modes .segment[data-mode]').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  $('crypto-modes').addEventListener('keydown', (e) => {
    const modes = Object.keys(MODE_LABELS);
    const idx = modes.indexOf(cryptoMode);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = modes[(idx + 1) % modes.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = modes[(idx - 1 + modes.length) % modes.length];
    if (next) {
      e.preventDefault();
      setMode(next, { focus: true });
    }
  });

  ['pw-length', 'pp-words'].forEach((id) => {
    $(id).addEventListener('input', () => { syncCryptoLabels(); persistCrypto(); generateDebounced(); });
  });
  $$('#opts-password input[data-charset]').forEach((el) => {
    el.addEventListener('change', () => {
      if (!$$('#opts-password input[data-charset]').some((x) => x.checked)) {
        el.checked = true;
        toast('Keep at least one character set enabled', 'warning');
        return;
      }
      persistCrypto();
      generateSecret();
    });
  });
  ['pw-exclude-ambiguous', 'pp-separator', 'pp-capitalize', 'pp-number'].forEach((id) => {
    $(id).addEventListener('change', () => { persistCrypto(); generateSecret(); });
  });
  $$('input[name="key-bytes"], input[name="key-format"]').forEach((el) => {
    el.addEventListener('change', () => { persistCrypto(); generateSecret(); });
  });

  $('crypto-regenerate-btn').addEventListener('click', () => {
    generateSecret();
    pulseClass($('crypto-regenerate-btn'), 'is-spinning', 600);
  });
  $('crypto-copy-btn').addEventListener('click', () => copyText(outputEl.value, 'Secret copied. Store it somewhere safe.'));
  $('crypto-toggle-visibility').addEventListener('click', () => {
    const btn = $('crypto-toggle-visibility');
    const masked = !outputEl.classList.contains('is-masked');
    outputEl.classList.toggle('is-masked', masked);
    btn.setAttribute('aria-pressed', String(masked));
    btn.setAttribute('aria-label', masked ? 'Show secret' : 'Hide secret');
    setIcon(btn, masked ? 'eye-off' : 'eye');
  });
  $('crypto-history-enabled').addEventListener('change', (e) => {
    if (!e.target.checked) {
      history.length = 0;
      renderHistory();
      toast('History disabled and cleared', 'info');
    }
    persistCrypto();
  });
  $('crypto-history-clear').addEventListener('click', () => {
    history.length = 0;
    renderHistory();
    toast('History cleared', 'info');
  });
  $('crypto-history').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="copy-history"]');
    if (!btn) return;
    const item = history[Number(btn.dataset.index)];
    if (item) copyText(item.value, `${item.label} copied`);
  });

  /* =========================================================
     Global shortcuts & init
     ========================================================= */
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-4]$/.test(e.code)) {
      e.preventDefault();
      activateTab(TABS[Number(e.code.slice(-1)) - 1], { focus: true });
    }
  });

  function init() {
    $('footer-year').textContent = String(new Date().getFullYear());
    $$('input.range').forEach((el) => {
      syncRange(el);
      el.addEventListener('input', () => syncRange(el));
    });
    restoreCrypto();
    renderScrub();
    updateUrlCounter();
    refreshIcons();
    const fromHash = window.location.hash.replace('#', '');
    const initial = TABS.includes(fromHash) ? fromHash : store.get('pss.activeTab', 'scrubber');
    activateTab(initial, { updateHash: TABS.includes(fromHash) });
    generateSecret();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(positionIndicator);
    window.setTimeout(positionIndicator, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

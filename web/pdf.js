// ===== PDF EXPORT =====
// "Export PDF" saves a file directly instead of opening the print dialog. The report is cloned,
// re-laid out for A4 (one dimension per page), rendered with html2pdf.js and saved. The library
// loads on first use only; if it cannot load, the print dialog opens as before.
const PDF = (() => {
  const SOURCES = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js'
  ];
  const MAX_PIXELS = 16e6; // keeps the rendered canvas under Safari's size limit
  let loading = null;
  let lastPages = 0;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { s.remove(); reject(new Error(`Could not load ${src}`)); };
      document.head.appendChild(s);
    });
  }

  function loadLib() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    loading ||= (async () => {
      for (const src of SOURCES) {
        try { await loadScript(src); if (window.html2pdf) return window.html2pdf; } catch {}
      }
      loading = null;
      throw new Error('html2pdf.js did not load');
    })();
    return loading;
  }

  // Icons that point at the shared sprite (<use>, url(#gradient)) lose those references once
  // rendered on their own, so each one gets its own copy of the definitions.
  function selfContainSvgs(root) {
    const gradients = [...document.querySelectorAll('body > svg defs linearGradient, body > svg defs radialGradient')].map(n => n.outerHTML).join('');
    root.querySelectorAll('svg').forEach(svg => {
      svg.querySelectorAll('use').forEach(u => {
        const ref = document.getElementById((u.getAttribute('href') || u.getAttribute('xlink:href') || '').replace(/^#/, ''));
        if (!ref) return;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.innerHTML = ref.innerHTML;
        u.replaceWith(g);
      });
      if (gradients && /url\(#/.test(svg.innerHTML)) svg.insertAdjacentHTML('afterbegin', `<defs>${gradients}</defs>`);
      svg.setAttribute('color', getComputedStyle(svg).color);
    });
  }

  function buildExport() {
    const stage = document.createElement('div');
    stage.className = 'pdf-stage';
    stage.setAttribute('aria-hidden', 'true');
    const host = document.createElement('div');
    host.className = 'pdf-export';
    const head = document.createElement('div');
    head.className = 'pdf-head';
    const brand = document.querySelector('.dash-nav .app-brand');
    if (brand) head.appendChild(brand.cloneNode(true));
    const content = document.getElementById('dash-content').cloneNode(true);
    // Every AI box goes into the file expanded, whether or not it is open on screen.
    content.querySelectorAll('.ai-box[id^="ai-d"]').forEach(box => { box.innerHTML = FIXES.exportHtml(box.id.slice(3)); });
    content.removeAttribute('id');
    content.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    content.querySelectorAll('details.evi, .ai-copy, .ai-retry, .ai-status, .ai-skel').forEach(el => el.remove());
    // Code taller than a page would be sliced through a line; one block per line lets the
    // page break fall between lines instead.
    content.querySelectorAll('.ai-code code').forEach(code => {
      code.innerHTML = code.innerHTML.split('\n').map(l => `<span class="pdf-line">${l || ' '}</span>`).join('');
    });
    // The breakdown starts on page 2, and every dimension after the first on a new page.
    content.querySelector('.section-title')?.classList.add('pdf-break');
    content.querySelectorAll('.score-card').forEach((c, i) => { if (i) c.classList.add('pdf-break'); });
    host.append(head, content);
    stage.appendChild(host);
    document.body.appendChild(stage);
    selfContainSvgs(host);
    return { stage, host };
  }

  function fileName(d) {
    const u = new URL(d.url);
    const slug = (u.hostname.replace(/^www\./, '') + u.pathname).toLowerCase()
      .replace(/[^a-z0-9.]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
    const t = new Date(d.fetchedAt);
    const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    return `GEO-Analyst_${slug || 'report'}_${date}.pdf`;
  }

  function worker(host, name) {
    const scale = Math.max(1, Math.min(2, Math.sqrt(MAX_PIXELS / (host.offsetWidth * Math.max(host.scrollHeight, 1)))));
    let site = '';
    try { site = new URL(currentData.url).hostname; } catch {}
    return window.html2pdf().set({
      margin: [12, 10, 14, 10],
      filename: name,
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale, backgroundColor: '#FFFFFF', useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      // Whole blocks move to the next page when they fit on one; blocks taller than a page
      // break between their rows, never through a line of text.
      pagebreak: {
        mode: ['css', 'legacy'],
        before: '.pdf-break',
        avoid: ['.check-group', '.ai-draft', '.ai-box-head', '.hero-top', '.sw-item', '.score-card-header', '.diag-list', '.method-box', '.notice',
          '.check-row', '.band-note', '.ai-asis', '.ai-tobe', '.ai-tr', '.ai-faq li', '.ai-steps li', '.pdf-line']
      }
    }).from(host).toPdf().get('pdf').then(pdf => {
      const n = pdf.internal.getNumberOfPages();
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();
      lastPages = n;
      for (let i = 1; i <= n; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(148, 163, 184);
        pdf.text(`GEO Bench${site ? ` · ${site}` : ''}`, 10, h - 6);
        pdf.text(`${i} / ${n}`, w - 10, h - 6, { align: 'right' });
      }
    });
  }

  async function exportPdf(btn) {
    if (btn.disabled) return;
    // Error screens have no report to save; keep the old behavior there.
    if (!currentData || !document.querySelector('#dash-content .score-card')) { window.print(); return; }
    const label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="pdf-spin" aria-hidden="true"></span>Preparing PDF…';
    let built = null;
    try {
      await loadLib();
      if (document.fonts) await document.fonts.ready;
      built = buildExport();
      await worker(built.host, fileName(currentData)).save();
      btn.textContent = 'Saved';
      setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 1400);
    } catch (e) {
      console.error(e);
      btn.textContent = label;
      btn.disabled = false;
      window.print();
    } finally {
      built?.stage.remove();
    }
  }

  // Builds the same PDF without saving it; used to check the output.
  async function render() {
    await loadLib();
    if (document.fonts) await document.fonts.ready;
    const built = buildExport();
    try {
      const uri = await worker(built.host, fileName(currentData)).outputPdf('datauristring');
      return { uri, pages: lastPages, name: fileName(currentData) };
    } finally {
      built.stage.remove();
    }
  }

  return { exportPdf, render, fileName };
})();

function exportPdf(btn) { PDF.exportPdf(btn); }

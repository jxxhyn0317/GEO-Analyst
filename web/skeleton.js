// ===== THE PAGE AS A MODEL RECEIVES IT =====
// A reader sees a designed page. An answer engine gets whatever survives in the HTML, in document
// order, and nothing else. This draws that second page: every block sized by how much text it
// actually offers, everything it cannot read left as a hole, and the head, which a reader never
// sees, drawn first because it is the first thing a model reads.
const SKEL = (() => {
  let nodes = [];

  const HOLE = new Set(['media', 'links']);

  function build(d) {
    const m = d.measure || {};
    nodes = m.outline || [];
    const head = m.head || [];
    const body = nodes.filter(n => !n.chrome);
    const missing = head.filter(h => !h.present).length;
    const holes = body.filter(n => HOLE.has(n.kind)).length;
    const host = (() => { try { return new URL(d.url).host; } catch { return ''; } })();

    return `
      <div class="skel">
        <div class="skel-head">
          <div class="skel-title">The page, as a model receives it</div>
          <div class="skel-key">
            <span class="skel-key-item"><i class="kb kb-has"></i>the model has this</span>
            <span class="skel-key-item"><i class="kb kb-none"></i>nothing here for it</span>
          </div>
        </div>
        <div class="skel-stage" id="skel-stage">
          <div class="skel-fit" id="skel-fit">
            <div class="skel-hidden" data-anchor="head">
              <div class="skel-hidden-tab">before the page · a reader never sees this</div>
              <div class="skel-meta-grid">
                ${head.map(h => `
                  <div class="skel-meta ${h.present ? 'has' : 'none'}">
                    <span class="skel-dot"></span>
                    <span class="skel-meta-key">${GEO.esc(h.label)}</span>
                  </div>`).join('')}
              </div>
            </div>

            <div class="skel-page">
              <div class="skel-bar"><i></i><i></i><i></i><span>${GEO.esc(host)}</span></div>
              <div class="skel-paper">
                ${body.length ? body.map(row).join('') : '<div class="skel-blank">A reader sees a page here.<br>A model receives nothing.</div>'}
              </div>
            </div>
          </div>
        </div>
        <div class="skel-foot-note">
          ${missing ? `<span class="fn none">${missing} missing in the head</span>` : '<span class="fn has">head complete</span>'}
          ${holes ? `<span class="fn none">${holes} ${holes === 1 ? 'place' : 'places'} it cannot read</span>` : ''}
        </div>
      </div>`;
  }

  // Presence is the only thing the drawing says. Solid means the model has it, hollow and red
  // means a reader sees something there and the model receives nothing. Nothing here encodes how
  // long a block is or how good it is: the score already says that, and mixing the two is what
  // made the first version unreadable.
  function row(n) {
    const lit = `data-node="${n.id}"`;
    if (n.kind === 'heading') {
      return `<div class="wf wf-h wf-h${Math.min(n.level, 3)}" ${lit}><b></b><span class="wf-cap">${GEO.esc(clipText(n.text, 40))}</span></div>`;
    }
    if (n.kind === 'media') {
      return n.alt
        ? `<div class="wf wf-img has" ${lit}><div class="wf-box"></div><span class="wf-cap">image, described in alt text</span></div>`
        : `<div class="wf wf-img none" ${lit}><div class="wf-box"><span>nothing here</span></div><span class="wf-cap none">image with no alt text</span></div>`;
    }
    if (n.kind === 'links') {
      return `<div class="wf wf-links none" ${lit}><i></i><i></i><i></i><span class="wf-cap none">links only</span></div>`;
    }
    if (n.kind === 'table') {
      return `<div class="wf wf-table has" ${lit}><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
    }
    return `<div class="wf wf-text has" ${lit}><b></b><b></b><b class="short"></b></div>`;
  }

  // The whole page has to be visible at once, so whatever it comes to is scaled down to the room
  // available rather than asking anyone to scroll a diagram.
  let watcher = null;
  function fit() {
    const stage = document.getElementById('skel-stage');
    const inner = document.getElementById('skel-fit');
    if (!stage || !inner) return;
    // The report is rendered before the screen is shown, so the first call can land while the
    // stage still has no height. Watching it means the drawing settles as soon as there is room,
    // and again whenever the room changes.
    if (!watcher && window.ResizeObserver) {
      watcher = new ResizeObserver(() => fit());
      watcher.observe(stage);
    }
    if (stage.clientHeight < 60) return;
    inner.style.transform = 'none';
    inner.style.width = '';
    const room = stage.clientHeight - 6;
    const need = inner.scrollHeight;
    const k = need > room ? Math.max(0.34, room / need) : 1;
    if (k < 1) { inner.style.transform = `scale(${k})`; inner.style.width = `${100 / k}%`; }
  }

  const clipText = (t, n) => (t || '').length > n ? (t || '').slice(0, n - 1) + '\u2026' : (t || '');
  const fmtNum = n => (n || 0).toLocaleString('en-US');

  // ---- linking evidence to the skeleton ----
  // The evidence quotes the page, so the way to find where it came from is to look for the page's
  // own words inside it. Matching that way round is what works: the evidence is plain text with no
  // reliable quoting, while every block in the skeleton knows exactly what it says. Checks with no
  // place in the body, a canonical tag or a schema block, are answered by the head instead.
  const HEAD_HINTS = /<title>|canonical|meta name=|meta property=|json-ld|json\+ld|og:|schema|structured data|metadata|breadcrumblist/i;
  const HEAD_GROUPS = /url semantics|metadata|schema|structured|breadcrumb/i;

  const flat = t => (t || '').replace(/\s+/g, ' ').replace(/[…]/g, '').trim().toLowerCase();

  // Three probes per block: its opening, its middle and a little further in. One of them will
  // survive whatever clipping the evidence did.
  function probesOf(text) {
    const t = flat(text);
    if (t.length < 14) return [];
    const out = [t.slice(0, Math.min(36, t.length))];
    if (t.length > 90) out.push(t.slice(Math.floor(t.length * 0.4), Math.floor(t.length * 0.4) + 34));
    if (t.length > 160) out.push(t.slice(Math.floor(t.length * 0.7), Math.floor(t.length * 0.7) + 34));
    return out.filter(p => p.length >= 14);
  }

  function locate(groupName, evidenceText) {
    const ev = flat(evidenceText);
    const hits = [];
    if (ev) {
      for (const n of nodes) {
        if (probesOf(n.text).some(p => ev.includes(p))) hits.push(n.id);
      }
    }
    const head = HEAD_HINTS.test(evidenceText || '') || HEAD_GROUPS.test(groupName || '');
    return { nodes: hits, head };
  }

  function clear() {
    document.querySelectorAll('.is-lit').forEach(el => el.classList.remove('is-lit'));
  }

  // Everything the check looked at lights up, not just the first thing, because a check usually
  // read several places and showing one of them would misrepresent it.
  function light(groupName, evidenceText) {
    clear();
    const where = locate(groupName, evidenceText);
    const els = [];
    if (where.head) { const h = document.querySelector('.skel-hidden'); if (h) els.push(h); }
    where.nodes.forEach(id => { const el = document.querySelector(`.wf[data-node="${id}"]`); if (el) els.push(el); });
    if (!els.length) return false;
    els.forEach(el => el.classList.add('is-lit'));

    const box = document.getElementById('skel-scroll');
    if (box) {
      const first = els[0];
      const top = first.offsetTop - box.clientHeight / 2 + first.offsetHeight / 2;
      box.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    return true;
  }

  return { build, light, clear, fit };
})();

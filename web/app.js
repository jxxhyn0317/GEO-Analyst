// ===== CURRENT ANALYSIS DATA =====
let currentData = null;

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function showLanding() {
  showScreen('screen-landing');
}

// ===== LANDING PAGE =====
function setExample(url) {
  document.getElementById('url-input').value = url;
}

function toggleAdvanced() {
  const toggle = document.querySelector('.advanced-toggle');
  const opts = document.getElementById('advanced-options');
  toggle.classList.toggle('open');
  opts.classList.toggle('open');
}

// ===== ANALYSIS / LOADING =====
function startAnalysis() {
  const url = document.getElementById('url-input').value.trim();
  if (!url) {
    document.getElementById('url-input').focus();
    return;
  }

  const apiKeyInput = document.getElementById('api-key-input');
  const apiKey = apiKeyInput?.value?.trim();
  if (!apiKey) {
    apiKeyInput.focus();
    apiKeyInput.style.borderColor = '#EF4444';
    apiKeyInput.setAttribute('placeholder', 'API Key required — get one free →');
    setTimeout(() => { apiKeyInput.style.borderColor = ''; apiKeyInput.setAttribute('placeholder', 'Gemini API Key'); }, 3000);
    return;
  }
  GEMINI_API_KEY = apiKey;

  document.getElementById('loading-url').textContent = url;
  showScreen('screen-loading');
  runRealAnalysis(url, GEMINI_API_KEY);
}

// Real analysis with crawler + Gemini
async function runRealAnalysis(url, apiKey) {
  const steps = document.querySelectorAll('.step-item');
  const fill = document.getElementById('progress-fill');
  const pct = document.getElementById('progress-pct');
  const feed = document.getElementById('insights-feed');

  // Reset
  steps.forEach(s => { s.classList.remove('active', 'done'); });
  fill.style.width = '0%';
  pct.textContent = '0%';
  feed.innerHTML = '';

  function onProgress(stepIdx, label) {
    // Mark previous steps as done
    for (let i = 0; i < stepIdx; i++) {
      steps[i].classList.remove('active');
      steps[i].classList.add('done');
    }
    // Mark current step active
    steps[stepIdx].classList.add('active');
    const progress = Math.round(((stepIdx + 1) / steps.length) * 100);
    fill.style.width = progress + '%';
    pct.textContent = progress + '%';
  }

  function onInsight(text, color) {
    const div = document.createElement('div');
    div.className = 'insight-item insight-enter';
    div.innerHTML = `<span class="insight-dot ${color}"></span>${text}`;
    feed.appendChild(div);
    // Auto-scroll to latest
    feed.scrollTop = feed.scrollHeight;
    // Trigger entrance animation
    requestAnimationFrame(() => div.classList.remove('insight-enter'));
  }

  try {
    // Gemini handles everything — crawling + analysis
    const result = await runGeminiAnalysis(apiKey, url, onProgress, onInsight);

    // Complete
    fill.style.width = '100%';
    pct.textContent = '100%';
    steps.forEach(s => { s.classList.remove('active'); s.classList.add('done'); });

    setTimeout(() => {
      currentData = result;
      renderDashboard(currentData);
      showScreen('screen-dashboard');
    }, 600);

  } catch (err) {
    onInsight(`Error: ${err.message}`, 'red');
    onInsight('Retrying analysis...', 'yellow');
    console.error('Analysis error:', err);

    // Show error state instead of falling back to sample data
    setTimeout(() => {
      const errorContainer = document.getElementById('dash-content');
      document.getElementById('dash-content').innerHTML = '';
      showScreen('screen-dashboard');
      document.getElementById('dash-content').innerHTML = `
        <section class="hero-section" style="text-align:center;padding:60px 20px">
          <div style="font-size:48px;margin-bottom:16px">⚠️</div>
          <h2 style="color:var(--gray-800);margin-bottom:8px">Analysis Failed</h2>
          <p style="color:var(--gray-500);margin-bottom:24px">${err.message}</p>
          <button onclick="showLanding()" class="btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:10px 24px;border:none;border-radius:8px;background:var(--blue-500);color:white;font-size:14px;cursor:pointer">
            ← Try Again
          </button>
        </section>
      `;
    }, 2000);
  }
}


// ===== DASHBOARD RENDERING =====
function getStatusColor(status) {
  return status === 'red' ? 'red' : status === 'yellow' ? 'yellow' : 'green';
}

function getScoreColor(score) {
  if (score >= 60) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}

function renderBreakdownRow(item) {
  const pct = item.max > 0 ? Math.round((item.points / item.max) * 100) : 0;
  const barColor = pct >= 70 ? 'var(--green-500)' : pct >= 40 ? 'var(--yellow-500)' : 'var(--red-500)';
  return `
    <div class="breakdown-row">
      <div class="breakdown-top">
        <span class="breakdown-name">${item.name}</span>
        <span class="breakdown-score">${item.points}<span class="breakdown-max">/${item.max}</span></span>
      </div>
      <div class="breakdown-bar-bg">
        <div class="breakdown-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="breakdown-reason">${item.reason || ''}</div>
    </div>
  `;
}

function renderBreakdown(breakdown) {
  if (!breakdown || breakdown.length === 0) return '';
  return `
    <div class="score-breakdown">
      <div class="breakdown-header">
        <span class="breakdown-label">SCORING BREAKDOWN</span>
      </div>
      ${breakdown.map(item => {
        if (item.sub && item.sub.length > 0) {
          // Parent with sub-items (e.g. H-tag Structure)
          const pct = item.max > 0 ? Math.round((item.points / item.max) * 100) : 0;
          const barColor = pct >= 70 ? 'var(--green-500)' : pct >= 40 ? 'var(--yellow-500)' : 'var(--red-500)';
          return `
            <div class="breakdown-group">
              <div class="breakdown-row breakdown-parent">
                <div class="breakdown-top">
                  <span class="breakdown-name breakdown-group-name">${item.name}</span>
                  <span class="breakdown-score">${item.points}<span class="breakdown-max">/${item.max}</span></span>
                </div>
                <div class="breakdown-bar-bg">
                  <div class="breakdown-bar-fill" style="width:${pct}%;background:${barColor}"></div>
                </div>
              </div>
              <div class="breakdown-sub-items">
                ${item.sub.map(sub => renderBreakdownRow(sub)).join('')}
              </div>
            </div>
          `;
        }
        return renderBreakdownRow(item);
      }).join('')}
    </div>
  `;
}

function renderEvidence(evidence) {
  let html = '<div class="score-card-evidence">';

  // Heading structure sample
  if (evidence.headingSample) {
    html += `<div class="evidence-code-block"><span class="evidence-label">Heading structure:</span><code>${escapeHtml(evidence.headingSample)}</code></div>`;
  }

  // Good examples
  if (evidence.good && evidence.good.length > 0 && evidence.good[0]) {
    html += '<div class="evidence-list">';
    html += '<span class="evidence-label">✓ Found:</span>';
    evidence.good.forEach(g => {
      const urlMatch = g.match(/https?:\/\/[^\s,)]+/);
      if (urlMatch) {
        const url = urlMatch[0];
        const desc = g.replace(url, '').replace(/^[\s\-–—:]+/, '').trim();
        html += `<div class="evidence-item evidence-good-item">
          <a href="${url}" target="_blank" class="evidence-url">${truncateUrl(url)}</a>
          ${desc ? `<span class="evidence-desc">${escapeHtml(desc)}</span>` : ''}
        </div>`;
      } else {
        html += `<div class="evidence-item evidence-good-item"><span class="evidence-desc">${escapeHtml(g)}</span></div>`;
      }
    });
    html += '</div>';
  }

  // Bad examples
  if (evidence.bad && evidence.bad.length > 0 && evidence.bad[0]) {
    html += '<div class="evidence-list">';
    html += '<span class="evidence-label">✗ Issues:</span>';
    evidence.bad.forEach(b => {
      const urlMatch = b.match(/https?:\/\/[^\s,)]+/);
      if (urlMatch) {
        const url = urlMatch[0];
        const desc = b.replace(url, '').replace(/^[\s\-–—:]+/, '').trim();
        html += `<div class="evidence-item evidence-bad-item">
          <a href="${url}" target="_blank" class="evidence-url">${truncateUrl(url)}</a>
          ${desc ? `<span class="evidence-desc">${escapeHtml(desc)}</span>` : ''}
        </div>`;
      } else {
        html += `<div class="evidence-item evidence-bad-item"><span class="evidence-desc">${escapeHtml(b)}</span></div>`;
      }
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function renderAiAccessibility(ai) {
  return '';
  /* AI Accessibility removed */

  // Key findings
  if (ai.keyFindings && ai.keyFindings.length > 0) {
    html += '<div class="ai-findings">';
    ai.keyFindings.forEach(f => {
      const isPositive = f.toLowerCase().includes('readable') || f.toLowerCase().includes('accessible') || f.toLowerCase().includes('clear') || f.toLowerCase().includes('well');
      html += `<div class="ai-finding ${isPositive ? 'ai-finding-good' : 'ai-finding-bad'}">${escapeHtml(f)}</div>`;
    });
    html += '</div>';
  }

  // Blocked URLs
  if (ai.blockedUrls && ai.blockedUrls.length > 0 && ai.blockedUrls[0]) {
    html += '<div class="ai-blocked-list"><span class="evidence-label">Blocked/Error URLs:</span>';
    ai.blockedUrls.forEach(b => {
      const urlMatch = b.match(/https?:\/\/[^\s,—–]+/);
      if (urlMatch) {
        const url = urlMatch[0];
        const reason = b.replace(url, '').replace(/^[\s\-—–:]+/, '').trim();
        html += `<div class="evidence-item evidence-bad-item"><a href="${url}" target="_blank" class="evidence-url">${truncateUrl(url)}</a>${reason ? `<span class="evidence-desc">${escapeHtml(reason)}</span>` : ''}</div>`;
      } else {
        html += `<div class="evidence-item evidence-bad-item"><span class="evidence-desc">${escapeHtml(b)}</span></div>`;
      }
    });
    html += '</div>';
  }

  // JS dependent
  if (ai.jsDependent && ai.jsDependent.length > 0 && ai.jsDependent[0]) {
    html += '<div class="ai-blocked-list"><span class="evidence-label">JS-Dependent Content:</span>';
    ai.jsDependent.forEach(j => {
      const urlMatch = j.match(/https?:\/\/[^\s,—–]+/);
      if (urlMatch) {
        const url = urlMatch[0];
        const desc = j.replace(url, '').replace(/^[\s\-—–:]+/, '').trim();
        html += `<div class="evidence-item evidence-bad-item"><a href="${url}" target="_blank" class="evidence-url">${truncateUrl(url)}</a>${desc ? `<span class="evidence-desc">${escapeHtml(desc)}</span>` : ''}</div>`;
      } else {
        html += `<div class="evidence-item evidence-bad-item"><span class="evidence-desc">${escapeHtml(j)}</span></div>`;
      }
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return u.hostname + (path.length > 50 ? path.substring(0, 47) + '...' : path);
  } catch { return url.length > 60 ? url.substring(0, 57) + '...' : url; }
}

function scoreRingSVG(score, size = 100, strokeWidth = 8) {
  const r = (size - strokeWidth) / 2;
  const c = Math.PI * 2 * r;
  const color = getScoreColor(score);
  const strokeColor = color === 'green' ? '#22C55E' : color === 'yellow' ? '#F59E0B' : '#EF4444';
  const bgColor = color === 'green' ? '#DCFCE7' : color === 'yellow' ? '#FEF3C7' : '#FEE2E2';
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="${bgColor}" stroke-width="${strokeWidth}" fill="none" transform="rotate(-90 ${size/2} ${size/2})"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none"
        stroke-dasharray="${c}" stroke-dashoffset="${c - (c * score / 100)}" stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
    </svg>
  `;
}

function badgeHTML(status, label) {
  return `<span class="hero-badge badge-${status}">${label}</span>`;
}

function miniScoreHTML(score) {
  const c = getScoreColor(score);
  return `<span class="mini-score ${c}">${score}</span>`;
}

function linkify(url) {
  if (url.startsWith('http')) {
    return `<a href="${url}" target="_blank" rel="noopener" class="ext-link" onclick="event.stopPropagation()">${url}</a>`;
  }
  const base = currentData?.url || '';
  const full = base.replace(/\/$/, '') + (url.startsWith('/') ? '' : '/') + url;
  return `<a href="${full}" target="_blank" rel="noopener" class="ext-link" onclick="event.stopPropagation()">${url}</a>`;
}

function renderDashboard(d) {
  // Defensive defaults for missing data
  d.strengths = d.strengths || [];
  d.weaknesses = d.weaknesses || [];
  d.dimensions = d.dimensions || [];
  d.issues = d.issues || [];
  d.pages = d.pages || [];
  d.eeat = d.eeat || {};
  d.eeat.experience = d.eeat.experience || {score:0,status:'red',signals:{found:[],missing:[]},working:'',missing_detail:'',recommendation:''};
  d.eeat.expertise = d.eeat.expertise || {score:0,status:'red',signals:{found:[],missing:[]},working:'',missing_detail:'',recommendation:''};
  d.eeat.authoritativeness = d.eeat.authoritativeness || {score:0,status:'red',signals:{found:[],missing:[]},working:'',missing_detail:'',recommendation:''};
  d.eeat.trust = d.eeat.trust || {score:0,status:'red',signals:{found:[],missing:[]},working:'',missing_detail:'',recommendation:''};
  d.pages.forEach(p => {
    p.scores = p.scores || {ia:0,heading:0,text:0,eeat:0};
    p.issues = p.issues || [];
    p.headings = p.headings || [];
    p.eeatSignals = p.eeatSignals || [];
    p.issueDetails = p.issueDetails || [];
    p.actions = p.actions || [];
  });

  // Recalculate E-E-A-T dimension score as sum of 4 sub-scores (each out of 25)
  if (d.eeat) {
    const eeatSum = Math.min(d.eeat.experience?.score || 0, 25)
      + Math.min(d.eeat.expertise?.score || 0, 25)
      + Math.min(d.eeat.authoritativeness?.score || 0, 25)
      + Math.min(d.eeat.trust?.score || 0, 25);
    const eeatDim = d.dimensions.find(dim => dim.id === 'eeat');
    if (eeatDim) {
      eeatDim.score = eeatSum;
      eeatDim.status = eeatSum >= 70 ? 'green' : eeatSum >= 40 ? 'yellow' : 'red';
    }
  }

  // Recalculate overallScore as average of 4 dimensions
  if (d.dimensions.length > 0) {
    const avg = Math.round(d.dimensions.reduce((sum, dim) => sum + (dim.score || 0), 0) / d.dimensions.length);
    d.overallScore = avg;
    d.status = avg >= 70 ? 'green' : avg >= 40 ? 'yellow' : 'red';
    d.statusLabel = avg >= 70 ? 'Reasonably Prepared' : avg >= 40 ? 'Needs Improvement' : 'Needs Significant Improvement';
  }

  currentData = d;
  const container = document.getElementById('dash-content');
  const sc = getStatusColor(d.status);

  container.innerHTML = `
    <!-- SECTION A: Hero Summary -->
    <section class="hero-section">
      <div class="hero-top">
        <div class="hero-meta">
          <div class="hero-url">${d.url}</div>
          <div class="hero-timestamp">Analyzed ${new Date(d.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          <div class="hero-pages">${d.pagesScanned} pages scanned</div>
        </div>
        <div class="hero-score-area">
          <div class="hero-score-ring">
            ${scoreRingSVG(d.overallScore, 100, 8)}
            <div class="hero-score-value score-${sc}">${d.overallScore}</div>
          </div>
          <div class="hero-score-label">GEO Readiness</div>
        </div>
      </div>
      <h2 class="hero-headline">${d.headline}</h2>
      ${badgeHTML(sc, d.statusLabel)}
      <div class="hero-strengths-weaknesses">
        <div class="sw-column">
          <h4>Strengths</h4>
          ${d.strengths.map(s => `<div class="sw-item"><span class="sw-icon green">✓</span><span>${s}</span></div>`).join('')}
        </div>
        <div class="sw-column">
          <h4>Weaknesses</h4>
          ${d.weaknesses.map(w => `<div class="sw-item"><span class="sw-icon red">✗</span><span>${w}</span></div>`).join('')}
        </div>
      </div>
    </section>

    <!-- AI ACCESSIBILITY SECTION -->
    ${d.aiAccessibility ? renderAiAccessibility(d.aiAccessibility) : ''}

    <!-- SECTION B: Score Breakdown -->
    <h3 class="section-title">GEO Readiness Score Breakdown</h3>
    <div class="scores-grid">
      ${d.dimensions.map(dim => {
        const dc = getScoreColor(dim.score);
        return `
          <div class="score-card">
            <div class="score-card-header">
              <span class="score-card-num">Dimension ${dim.num}</span>
              <span class="score-card-badge badge-${dc}">${dc === 'green' ? 'Sufficient' : dc === 'yellow' ? 'Needs Improvement' : 'Weak'}</span>
            </div>
            <h4 class="score-card-title">${dim.title}</h4>
            <div class="score-card-score">
              <span class="num score-${dc}">${dim.score}</span>
              <span class="total">/ 100</span>
            </div>
            <p class="score-card-diag">${dim.diagnosis}</p>
            ${dim.breakdown ? renderBreakdown(dim.breakdown) : ''}
            <div class="score-card-weaknesses">
              ${dim.weaknesses.slice(0, 3).map(w => `<div class="score-weakness">${w}</div>`).join('')}
            </div>
            <div class="score-card-direction">${dim.direction}</div>
            ${dim.evidence ? renderEvidence(dim.evidence) : ''}
          </div>
        `;
      }).join('')}
    </div>

    <!-- SECTION D: E-E-A-T Detailed -->
    <h3 class="section-title">E-E-A-T Detailed Analysis</h3>
    <div class="eeat-grid">
      ${renderEEATCard('E', 'Experience', d.eeat.experience, '#8B5CF6')}
      ${renderEEATCard('E', 'Expertise', d.eeat.expertise, '#3B82F6')}
      ${renderEEATCard('A', 'Authoritativeness', d.eeat.authoritativeness, '#0EA5E9')}
      ${renderEEATCard('T', 'Trust', d.eeat.trust, '#10B981')}
    </div>

    <!-- SECTION E: Page-level -->
    <h3 class="section-title">Page-level GEO Diagnosis</h3>
    <div class="pages-table-wrap">
      <table class="pages-table">
        <thead>
          <tr>
            <th>Page Title</th>
            <th>Type</th>
            <th>GEO</th>
            <th>IA</th>
            <th>Heading</th>
            <th>Text</th>
            <th>E-E-A-T</th>
            <th>Top Issues</th>
          </tr>
        </thead>
        <tbody>
          ${d.pages.map((p, i) => {
            return `
            <tr onclick="openPageDrawer(${i})">
              <td>
                <div style="font-weight:500;color:var(--gray-800);margin-bottom:2px">${p.title}</div>
                <div style="font-size:11px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${linkify(p.url)}</div>
              </td>
              <td><span class="page-type-tag">${p.type}</span></td>
              <td>${miniScoreHTML(p.geoScore)}</td>
              <td>${miniScoreHTML(p.scores.ia)}</td>
              <td>${miniScoreHTML(p.scores.heading)}</td>
              <td>${miniScoreHTML(p.scores.text)}</td>
              <td>${miniScoreHTML(p.scores.eeat)}</td>
              <td>
                <div class="page-issues">
                  ${p.issues.slice(0, 2).map(iss => `<span class="page-issue-tag">${iss}</span>`).join('')}
                </div>
              </td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>

    <!-- Action Plan removed to minimize token usage -->
  `;
}

function renderEEATCard(letter, title, data, bgColor) {
  // E-E-A-T sub-scores are out of 25
  const score25 = Math.min(data.score, 25);
  const pct = Math.round((score25 / 25) * 100);
  const sc = pct >= 70 ? 'green' : pct >= 40 ? 'yellow' : 'red';
  return `
    <div class="eeat-card">
      <div class="eeat-card-header">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="eeat-letter" style="background:${bgColor}">${letter}</div>
          <div>
            <div class="eeat-title">${title}</div>
            <div class="eeat-status score-${sc}">${sc === 'green' ? 'Sufficient' : sc === 'yellow' ? 'Needs Improvement' : 'Weak'}</div>
          </div>
        </div>
        <div class="eeat-score-badge">
          <span class="num score-${sc}">${score25}</span>
          <span class="total">/ 25</span>
        </div>
      </div>
      <div class="eeat-subsection">
        <h5>Detected Signals</h5>
        <div class="eeat-signals">
          ${data.signals.found.map(s => `<span class="signal-tag signal-found">${s}</span>`).join('')}
          ${data.signals.missing.slice(0, 3).map(s => `<span class="signal-tag signal-missing">${s}</span>`).join('')}
        </div>
      </div>
      <div class="eeat-subsection">
        <h5>What's Working</h5>
        <p style="font-size:12px;color:var(--gray-600);line-height:1.5">${data.working}</p>
      </div>
      <div class="eeat-subsection">
        <h5>What's Missing</h5>
        <p style="font-size:12px;color:var(--gray-500);line-height:1.5">${data.missing_detail}</p>
      </div>
      <div class="eeat-rec">→ ${data.recommendation}</div>
    </div>
  `;
}

function renderActionGroup(label, className, actions) {
  return `
    <div class="action-priority-group">
      <div class="action-priority-label ${className}">${label}</div>
      <div class="actions-list">
        ${actions.map(a => `
          <div class="action-card">
            <div>
              <h4 class="action-title">${a.title}</h4>
              <span class="action-dimension">${a.dimension}</span>
              <p class="action-problem">${a.problem}</p>
              <div class="action-tags">
                <span class="action-tag">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                  ${a.relevance.substring(0, 60)}...
                </span>
              </div>
            </div>
            <div class="action-right">
              <span class="action-impact impact-${a.impact.toLowerCase()}">Impact: ${a.impact}</span>
              <span class="action-difficulty difficulty-${a.difficulty.toLowerCase()}">Effort: ${a.difficulty}</span>
              <span class="action-pages">${a.pages}</span>
            </div>
            <div class="action-example"><strong>Example:</strong> ${a.example}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ===== PAGE DETAIL DRAWER =====
function openPageDrawer(index) {
  const p = currentData.pages[index];
  const overlay = document.getElementById('page-drawer-overlay');
  const drawer = document.getElementById('page-drawer');
  const title = document.getElementById('drawer-title');
  const body = document.getElementById('drawer-body');

  title.textContent = p.title;
  body.innerHTML = `
    <div class="drawer-section">
      <div class="drawer-section-title">Page Information</div>
      <div class="drawer-url"><a href="${p.url}" target="_blank" rel="noopener" class="ext-link">${p.url}</a></div>
      <div style="margin-top:6px"><span class="drawer-page-type">${p.type}</span></div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">GEO Scores</div>
      <div class="drawer-scores">
        <div class="drawer-score-item">
          <div class="drawer-score-label">Overall GEO</div>
          <div class="drawer-score-val score-${getScoreColor(p.geoScore)}">${p.geoScore}</div>
        </div>
        <div class="drawer-score-item">
          <div class="drawer-score-label">Semantic IA</div>
          <div class="drawer-score-val score-${getScoreColor(p.scores.ia)}">${p.scores.ia}</div>
        </div>
        <div class="drawer-score-item">
          <div class="drawer-score-label">Headings</div>
          <div class="drawer-score-val score-${getScoreColor(p.scores.heading)}">${p.scores.heading}</div>
        </div>
        <div class="drawer-score-item">
          <div class="drawer-score-label">Text Sufficiency</div>
          <div class="drawer-score-val score-${getScoreColor(p.scores.text)}">${p.scores.text}</div>
        </div>
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Heading Structure</div>
      <div class="drawer-headings">
        ${p.headings.map(h => `
          <div class="drawer-heading-item">
            <span class="h-tag">${h.tag}</span>
            <span>${h.text}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Extracted Content Preview</div>
      <div class="drawer-text-preview">${p.textPreview}</div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">E-E-A-T Signals Detected</div>
      <div class="drawer-tags">
        ${p.eeatSignals.map(s => `<span class="drawer-tag signal">${s}</span>`).join('')}
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Issues Detected</div>
      <div class="drawer-tags">
        ${p.issueDetails.map(s => `<span class="drawer-tag issue">${s}</span>`).join('')}
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Recommended Actions</div>
      <div class="drawer-actions">
        ${p.actions.map(a => `<div class="drawer-action-item">${a}</div>`).join('')}
      </div>
    </div>
  `;

  overlay.classList.add('open');
  drawer.classList.add('open');
}

function closeDrawer() {
  document.getElementById('page-drawer-overlay').classList.remove('open');
  document.getElementById('page-drawer').classList.remove('open');
}

// Close drawer on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

// Enter key to analyze
document.getElementById('url-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startAnalysis();
});

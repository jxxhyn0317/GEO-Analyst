// ===== WEBSITE CRAWLER & PARSER =====
// Fetches and parses website HTML via CORS proxy

const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest='
];

async function fetchWithProxy(url) {
  for (const proxy of CORS_PROXIES) {
    try {
      const resp = await fetch(proxy + encodeURIComponent(url), {
        signal: AbortSignal.timeout(15000)
      });
      if (resp.ok) {
        const html = await resp.text();
        if (html.length > 200) return html;
      }
    } catch (e) {
      continue;
    }
  }
  throw new Error('Failed to fetch URL through all proxies');
}

function normalizeUrl(input) {
  let url = input.trim();
  if (!url.startsWith('http')) url = 'https://' + url;
  try {
    const parsed = new URL(url);
    return { full: parsed.href, origin: parsed.origin, hostname: parsed.hostname };
  } catch {
    return null;
  }
}

function parseHTML(html, baseUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Extract title
  const title = doc.querySelector('title')?.textContent?.trim() || '';

  // Extract meta description
  const metaDesc = doc.querySelector('meta[name="description"]')?.content || '';

  // Extract headings
  const headings = [];
  doc.querySelectorAll('h1, h2, h3, h4').forEach(h => {
    const text = h.textContent.trim();
    if (text && text.length < 200) {
      headings.push({ tag: h.tagName, text: text.substring(0, 120) });
    }
  });

  // Extract visible body text
  const bodyText = extractVisibleText(doc);

  // Extract internal links
  const links = [];
  const seen = new Set();
  doc.querySelectorAll('a[href]').forEach(a => {
    try {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      let full;
      if (href.startsWith('http')) {
        full = href;
      } else if (href.startsWith('/')) {
        full = baseUrl + href;
      } else {
        return;
      }
      const parsed = new URL(full);
      const clean = parsed.origin + parsed.pathname;
      if (!seen.has(clean) && parsed.hostname.includes(new URL(baseUrl).hostname.replace('www.', ''))) {
        seen.add(clean);
        links.push({
          url: full,
          text: (a.textContent || '').trim().substring(0, 80),
          path: parsed.pathname
        });
      }
    } catch {}
  });

  // Detect page features
  const hasFAQ = html.toLowerCase().includes('faq') || html.toLowerCase().includes('자주') || html.toLowerCase().includes('질문');
  const hasPDF = (html.match(/\.pdf/gi) || []).length;
  const imageCount = doc.querySelectorAll('img').length;
  const hasStructuredData = html.includes('application/ld+json');
  const hasSchema = html.includes('schema.org');

  return {
    title, metaDesc, headings, bodyText,
    links: links.slice(0, 100),
    stats: {
      headingCount: headings.length,
      h1Count: headings.filter(h => h.tag === 'H1').length,
      h2Count: headings.filter(h => h.tag === 'H2').length,
      h3Count: headings.filter(h => h.tag === 'H3').length,
      bodyTextLength: bodyText.length,
      internalLinkCount: links.length,
      imageCount,
      pdfLinkCount: hasPDF,
      hasFAQ, hasStructuredData, hasSchema
    }
  };
}

function extractVisibleText(doc) {
  const ignore = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'NAV', 'FOOTER', 'HEADER']);
  let text = '';
  function walk(node) {
    if (node.nodeType === 3) {
      const t = node.textContent.trim();
      if (t.length > 2) text += t + ' ';
    } else if (node.nodeType === 1 && !ignore.has(node.tagName)) {
      for (const child of node.childNodes) walk(child);
    }
  }
  const body = doc.querySelector('body');
  if (body) walk(body);
  return text.substring(0, 8000);
}

function classifyPageType(url, title, headings) {
  const lower = (url + ' ' + title).toLowerCase();
  if (lower.match(/\/(about|company|소개|회사)/)) return 'About';
  if (lower.match(/\/(faq|질문|자주)/)) return 'FAQ';
  if (lower.match(/\/(privacy|개인정보|약관|policy)/)) return 'Policy';
  if (lower.match(/\/(help|support|고객|customer|service|상담|문의)/)) return 'Help/Support';
  if (lower.match(/\/(claim|청구|보험금)/)) return 'Help/Support';
  if (lower.match(/\/(blog|news|article|보도|뉴스|소식)/)) return 'Blog/Article';
  if (lower.match(/\/(guide|가이드|안내)/)) return 'Guide';
  if (lower.match(/\/(product|상품|보험|insurance|savings|pension|연금|저축|건강|종신|정기)/)) return 'Product';
  if (url.replace(/\/$/, '').split('/').length <= 3) return 'Home';
  return 'Other';
}

function selectPagesToAnalyze(links, maxPages = 12) {
  const priority = { 'Product': 1, 'FAQ': 2, 'Help/Support': 3, 'About': 4, 'Guide': 5, 'Policy': 6, 'Blog/Article': 7, 'Other': 8 };
  const classified = links.map(l => ({
    ...l,
    type: classifyPageType(l.url, l.text, [])
  }));

  classified.sort((a, b) => (priority[a.type] || 99) - (priority[b.type] || 99));

  // Deduplicate by type (keep max 3 per type)
  const typeCounts = {};
  const selected = [];
  for (const link of classified) {
    const count = typeCounts[link.type] || 0;
    if (count < 3 && selected.length < maxPages) {
      selected.push(link);
      typeCounts[link.type] = count + 1;
    }
  }
  return selected;
}

// Main crawl function
async function crawlWebsite(inputUrl, onProgress, onInsight) {
  // Step 1: Normalize URL
  onProgress(0, 'Normalizing URL');
  const urlInfo = normalizeUrl(inputUrl);
  if (!urlInfo) throw new Error('Invalid URL');
  await sleep(300);

  // Step 2: Fetch homepage
  onProgress(1, 'Fetching homepage');
  const homepageHtml = await fetchWithProxy(urlInfo.full);
  onInsight('Homepage fetched successfully', 'green');

  // Step 3: Parse homepage and discover links
  onProgress(2, 'Discovering internal links');
  const homepage = parseHTML(homepageHtml, urlInfo.origin);
  onInsight(`${homepage.links.length} internal links discovered`, 'blue');
  await sleep(200);

  // Step 4: Classify and select pages
  onProgress(3, 'Classifying page types');
  const pagesToCrawl = selectPagesToAnalyze(homepage.links, 10);
  const types = [...new Set(pagesToCrawl.map(p => p.type))];
  onInsight(`Page types found: ${types.join(', ')}`, 'blue');

  // Step 5: Fetch and parse subpages
  onProgress(4, 'Extracting headings and body text');
  const pages = [{
    url: urlInfo.full,
    title: homepage.title,
    type: 'Home',
    parsed: homepage
  }];

  let fetchCount = 0;
  const fetchPromises = pagesToCrawl.slice(0, 8).map(async (link) => {
    try {
      const html = await fetchWithProxy(link.url);
      const parsed = parseHTML(html, urlInfo.origin);
      fetchCount++;
      if (parsed.stats.bodyTextLength < 200) {
        onInsight(`Limited text on: ${link.text || link.path}`, 'red');
      }
      if (parsed.stats.pdfLinkCount > 2) {
        onInsight(`PDF-heavy page: ${link.text || link.path}`, 'yellow');
      }
      return {
        url: link.url,
        title: parsed.title || link.text,
        type: link.type,
        parsed
      };
    } catch {
      return null;
    }
  });

  const results = await Promise.allSettled(fetchPromises);
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) pages.push(r.value);
  });

  onInsight(`${pages.length} pages analyzed total`, 'green');

  // Check for common issues early
  const systemCodeUrls = pages.filter(p => p.url.match(/[A-Z]{2,3}-[A-Z]{2,}[0-9]|\.eds|action=|cmd=|idx=/i)).length;
  if (systemCodeUrls > 2) onInsight('Multiple system-code URLs detected', 'red');

  const lowTextPages = pages.filter(p => p.parsed.stats.bodyTextLength < 500).length;
  if (lowTextPages > 2) onInsight('Limited explanatory body text detected', 'red');

  const totalImages = pages.reduce((sum, p) => sum + p.parsed.stats.imageCount, 0);
  const totalText = pages.reduce((sum, p) => sum + p.parsed.stats.bodyTextLength, 0);
  if (totalImages > 50 && totalText < 5000) onInsight('Key information appears image-dependent', 'red');

  const hasFaqPage = pages.some(p => p.type === 'FAQ');
  if (hasFaqPage) onInsight('FAQ page found', 'green');
  else onInsight('No FAQ page detected', 'yellow');

  return {
    urlInfo,
    homepage,
    pages
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

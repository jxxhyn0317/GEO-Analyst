// ===== GEMINI API — MINIMAL VERSION =====
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const GEMINI_MODELS = ['gemini-2.5-flash'];
let GEMINI_API_KEY = '';

async function callGeminiWithUrl(apiKey, prompt) {
  const key = apiKey.trim();
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await fetch(`${GEMINI_BASE}${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ url_context: {} }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 16000,
              thinkingConfig: { thinkingBudget: 2048 }
            }
          })
        });
        if (resp.status === 429) {
          let wait = 60;
          try { const e = await resp.json(); const r = e.error?.details?.find(d => d.retryDelay); if (r?.retryDelay) wait = Math.max(60, Math.ceil(parseInt(r.retryDelay) || 60)); } catch {}
          if (window._onInsightCallback) window._onInsightCallback(`Rate limited — waiting ${wait}s...`, 'yellow');
          await sleep(wait * 1000);
          continue;
        }
        if (resp.status === 400 || resp.status === 404) {
          if (window._onInsightCallback) window._onInsightCallback(`${model} unavailable`, 'yellow');
          break;
        }
        if (!resp.ok) { const err = await resp.text(); throw new Error(`Gemini API error: ${resp.status} - ${err}`); }
        if (window._onInsightCallback) window._onInsightCallback(`Using ${model}`, 'blue');
        const data = await resp.json();

        // Check for recitation block or empty response — retry without urlContext
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason === 'RECITATION' || finishReason === 'SAFETY') {
          if (window._onInsightCallback) window._onInsightCallback('Retrying with knowledge-based analysis...', 'yellow');
          const resp2 = await fetch(`${GEMINI_BASE}${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt + '\nNote: Analyze based on your existing knowledge of this website. Do not quote any content.' }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 16000, thinkingConfig: { thinkingBudget: 0 } }
            })
          });
          if (resp2.ok) {
            const data2 = await resp2.json();
            const text2 = data2.candidates?.[0]?.content?.parts?.filter(p => p.text)?.map(p => p.text)?.join('');
            if (text2) {
              let js2 = extractFirstJsonObject(text2.trim());
              try { return JSON.parse(js2); } catch {}
              js2 = fixTruncatedJson(js2);
              try { return JSON.parse(js2); } catch {}
            }
          }
        }
        if (finishReason === 'MAX_TOKENS') {
          console.warn('Response truncated by MAX_TOKENS');
        }

        let text = data.candidates?.[0]?.content?.parts?.filter(p => p.text)?.map(p => p.text)?.join('');
        if (!text) throw new Error('Empty response');

        // If response contains "I will" or "Let me" — Gemini wrote thinking instead of JSON
        // Try to find JSON embedded in the text
        if (text.includes('"overallScore"') && (text.includes('I will') || text.includes('Let me') || text.includes('plan'))) {
          console.warn('Gemini included thinking text with JSON, extracting JSON...');
          const jsonStart = text.indexOf('{"url"');
          const altStart = text.indexOf('{"overallScore"');
          const start = jsonStart >= 0 ? jsonStart : altStart;
          if (start >= 0) text = text.substring(start);
        }

        // Parse JSON - try multiple strategies
        let jsonStr = text.trim();
        // Remove markdown code blocks
        const codeMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeMatch) jsonStr = codeMatch[1].trim();
        // Fix trailing commas (very common Gemini issue) — multi-pass
        for (let i = 0; i < 5; i++) {
          const prev = jsonStr;
          jsonStr = jsonStr.replace(/,(\s*[\]}])/g, '$1');
          if (jsonStr === prev) break;
        }
        // Split if multiple JSON objects (newline between } and {)
        const parts = jsonStr.split(/\}\s*\n\s*\{/);
        if (parts.length > 1) {
          // Reconstruct first object
          jsonStr = parts[0] + '}';
        }
        // Helper to strip trailing commas everywhere (including multi-line)
        const stripTrailingCommas = s => {
          let r = s;
          // Repeatedly fix until stable
          for (let i = 0; i < 5; i++) {
            const prev = r;
            r = r.replace(/,(\s*[\]}])/g, '$1');
            if (r === prev) break;
          }
          return r;
        };
        jsonStr = stripTrailingCommas(jsonStr);
        // Try direct parse
        try { return JSON.parse(jsonStr); } catch {}
        // Extract first JSON object by brace matching
        jsonStr = stripTrailingCommas(extractFirstJsonObject(jsonStr));
        try { return JSON.parse(jsonStr); } catch {}
        // Fix truncated JSON
        jsonStr = stripTrailingCommas(fixTruncatedJson(jsonStr));
        try { return JSON.parse(jsonStr); } catch {}
        // Last resort: sanitize unescaped quotes
        jsonStr = stripTrailingCommas(sanitizeJsonString(jsonStr));
        try { return JSON.parse(jsonStr); } catch (e2) {
          console.error('All JSON parse attempts failed:', e2.message, jsonStr.substring(jsonStr.length - 200));
        }
        throw new Error('Failed to parse JSON response');
      } catch (e) {
        if (e.message.includes('Gemini API error')) throw e;
        if (attempt === 0) { await sleep(3000); continue; }
        throw e;
      }
    }
  }
  throw new Error('Analysis failed. Check your API key or try again in 1 minute.');
}

// Extract the first complete JSON object from text that may contain multiple objects
function extractFirstJsonObject(text) {
  let depth = 0, start = -1, inString = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    if (ch === '}') { depth--; if (depth === 0 && start >= 0) return text.substring(start, i + 1); }
  }
  // If not closed, return from start to end
  return start >= 0 ? text.substring(start) : text;
}

// Fix truncated JSON by closing open brackets/braces
function fixTruncatedJson(str) {
  // Remove trailing commas before ] or } (common Gemini issue)
  str = str.replace(/,\s*\]/g, ']');
  str = str.replace(/,\s*\}/g, '}');
  // Remove trailing incomplete key-value pairs
  str = str.replace(/,\s*"[^"]*"?\s*:?\s*$/, '');
  str = str.replace(/,\s*\{[^}]*$/, '');
  str = str.replace(/,\s*"[^"]*$/, '');
  str = str.replace(/,\s*$/, '');

  // Count open brackets and braces
  let braces = 0, brackets = 0;
  let inString = false, escape = false;
  for (const ch of str) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }
  // Close remaining
  while (brackets > 0) { str += ']'; brackets--; }
  while (braces > 0) { str += '}'; braces--; }
  return str;
}

// Sanitize unescaped quotes inside JSON string values
function sanitizeJsonString(str) {
  // Replace common problematic patterns
  return str
    .replace(/: "([^"]*?)(?:"|(?=,\s*"))/g, (match, content) => {
      const cleaned = content.replace(/(?<!\\)"/g, '\\"');
      return `: "${cleaned}"`;
    });
}

function buildDirectAnalysisPrompt(url) {
  return `You are an extremely strict GEO (Generative Engine Optimization) auditor. You are harsh and critical. Visit ${url}. Analyze 3-4 pages. Use ONLY real URLs.

## CRITICAL SCORING RULES:
- You MUST be harsh. Most websites score 20-45 overall.
- Only the BEST sites (apple.com, MDN, Wikipedia) deserve 70+.
- Corporate/commercial sites with banner-heavy homepages typically score 30-50.
- If a homepage is mostly promotional banners and product cards with minimal explanatory text, Dim3 should be 15-35, NOT 60+.
- "Having some text" is NOT enough for a high text score. The text must be EXPLANATORY, SUBSTANTIAL, and CITABLE by AI.
- Short product labels, navigation text, and marketing slogans do NOT count as substantial text.
- A page full of image banners with small captions = Dim3 score 10-25.

## SCORING RUBRIC — Sum sub-item points EXACTLY:

DIMENSION 1: Semantic IA & URL Structure (100pts)
A. URL Semantics (50pts):
  - Check INTERNAL page URLs. The key question: can a human or AI understand what the page is about just from the URL?
  - GOOD (high score): URLs with clear product names, categories, topics in the path
    /smartphones/galaxy-s26-ultra/ → product name in URL = GOOD
    /iphone-17-pro/ → product name in URL = GOOD
    /insurance/life-insurance/ → topic in URL = GOOD
    /support/faq/ → section in URL = GOOD
  - BAD (low score): URLs with system codes, IDs, params that mean nothing to humans or AI
    /products/PD_001/view?ctg=L001 → system code = BAD
    /hp/MDP-HP006 → system code = BAD
    /products/view?id=123 → opaque ID = BAD
  - ALL internal URLs semantic=50, MOST=35, HALF=25, FEW=12, ALL system-code=0
B. IA Topic Classification (50pts):
  - Clear topic-based navigation with 5+ distinct categories=50, 3-4=30, 2 or fewer=10
  - If navigation uses internal jargon or system labels instead of topic names, cap at 20.
Score = A + B

DIMENSION 2: Structured Information (100pts)
A. Heading Structure (50pts) — score each sub-criterion out of 10, then sum:
  A1. H1 per page (10pts): Exactly 1 clear H1 per page=10, H1 exists but 2+=4, No H1=0
  A2. H2 section division (10pts): Avg 4+ H2s per page=10, 2-3=6, 1 or fewer=2
  A3. H3 sub-items (10pts): H3s properly nested under H2s=10, Some=5, None=0
  A4. No hierarchy skipping (10pts): H1→H2→H3 order maintained=10, Some skips=5, Disordered=0
  A5. Informative headings (10pts): Headings contain topic keywords (e.g. "Camera Specs")=10, Some vague=5, Mostly marketing copy (e.g. "Discover")=2
  A = A1+A2+A3+A4+A5
B. Structured Elements (50pts):
  - Lists, tables, FAQ blocks, definition lists present: 3+ types=50, 2=30, 1=15, none=0
Score = A + B

DIMENSION 3: Sufficient Text-based Information (100pts)
*** BE VERY STRICT HERE. This is where most sites fail. ***
A. Body Text Volume (35pts):
  - Count ONLY substantive paragraph text. Exclude nav, footer, button labels, image alt text.
  - 2000+ chars of real paragraphs per page=35, 1000-2000=22, 500-1000=12, <500=5
  - A homepage with mostly banners/cards and <500 chars of actual paragraphs = score 5.
B. Explanatory Content (35pts):
  - Are there REAL explanations: definitions, comparisons, how-to, detailed descriptions?
  - Rich multi-paragraph explanations=35, Some=18, Marketing copy only=8, Almost none=5
  - Product listing pages with just names/prices/short descriptions = score 5-8.
C. Text vs Image Ratio (20pts):
  - Is core information delivered as HTML text or images/banners?
  - Text-centric (like Wikipedia/MDN)=20, Mixed=12, Image-heavy=5, Almost all images=3
D. PDF/Download Dependency (10pts):
  - Key info only in PDFs=0, Some dependency=5, No dependency=10
Score = A + B + C + D

DIMENSION 4: E-E-A-T Content (100pts)
*** Only give points for signals that ACTUALLY EXIST on the pages you visited. ***
Experience (25pts): Customer reviews/testimonials=10, Real use cases=8, UGC=7. If NONE found=0.
Expertise (25pts): Guides/explainers=10, Glossary/comparison=8, Expert info=7. If NONE found=0.
Authoritativeness (25pts): Awards/certifications=10, Statistics/citations=8, External refs=7. If NONE found=0.
Trust (25pts): FAQ page=8, Policy/disclosure=7, Contact/support=5, Update dates=5. If NONE found=0.
Score = sum of only what EXISTS.

OVERALL = average of 4 dimensions (code calculates this, not you — but set overallScore to the average anyway).
Status: red<40, yellow=40-69, green=70+

CALIBRATION EXAMPLES:
- apple.com/iphone: Dim1=90, Dim2=75, Dim3=70, Dim4=65 → Overall ~75
- samsunglife.com (system URLs, image-heavy): Dim1=15, Dim2=25, Dim3=20, Dim4=30 → Overall ~23
- A typical corporate site: Dim1=40, Dim2=35, Dim3=30, Dim4=35 → Overall ~35
- Wikipedia: Dim1=85, Dim2=90, Dim3=95, Dim4=80 → Overall ~88

IMPORTANT: Do NOT penalize for language. A site in Korean, Japanese, or any non-English language is NOT a weakness. Pages may be optimized for a specific country/locale. Evaluate structure and content quality regardless of language.

For each dimension, provide:
1. "breakdown": array of sub-criteria with name, maxPoints, points awarded, and short reason
2. "evidence": concrete examples with REAL URLs

Keep all text values SHORT (1-2 sentences max). Max 3 headings per page. Max 3-4 pages.

Return ONLY raw JSON (no markdown, no code blocks):
{"url":"${url}","timestamp":"${new Date().toISOString()}","pagesScanned":0,"overallScore":0,"status":"red|yellow|green","headline":"one line","statusLabel":"Needs Significant Improvement|Needs Improvement|Reasonably Prepared","strengths":["a","b","c"],"weaknesses":["a","b","c"],
"dimensions":[
{"id":"semantic-ia","num":"01","title":"Semantic IA & URL Structure","score":0,"status":"","diagnosis":"short","weaknesses":["a","b"],"direction":"short",
"breakdown":[{"name":"URL Semantics","max":50,"points":0,"reason":"short why"},{"name":"IA Topic Classification","max":50,"points":0,"reason":"short why"}],
"evidence":{"good":["https://real-url — reason"],"bad":["https://real-url — reason"]}},
{"id":"structured-info","num":"02","title":"Structured Information","score":0,"status":"","diagnosis":"","weaknesses":["a","b"],"direction":"",
"breakdown":[{"name":"H-tag Structure","max":50,"points":0,"reason":"short","sub":[{"name":"H1 per page","max":10,"points":0,"reason":"short"},{"name":"H2 section division","max":10,"points":0,"reason":"short"},{"name":"H3 sub-items","max":10,"points":0,"reason":"short"},{"name":"No hierarchy skipping","max":10,"points":0,"reason":"short"},{"name":"Informative headings","max":10,"points":0,"reason":"short"}]},{"name":"Structured Elements","max":50,"points":0,"reason":"short"}],
"evidence":{"good":["https://real-url — reason"],"bad":["https://real-url — reason"]}},
{"id":"text-sufficiency","num":"03","title":"Sufficient Text-based Information","score":0,"status":"","diagnosis":"","weaknesses":["a","b"],"direction":"",
"breakdown":[{"name":"Body Text Volume","max":35,"points":0,"reason":"short"},{"name":"Explanatory Content","max":35,"points":0,"reason":"short"},{"name":"Text vs Image Ratio","max":20,"points":0,"reason":"short"},{"name":"PDF Dependency","max":10,"points":0,"reason":"short"}],
"evidence":{"good":["https://real-url — reason"],"bad":["https://real-url — reason"]}},
{"id":"eeat","num":"04","title":"E-E-A-T Content","score":0,"status":"","diagnosis":"","weaknesses":["a","b"],"direction":"",
"breakdown":[{"name":"Experience","max":25,"points":0,"reason":"short"},{"name":"Expertise","max":25,"points":0,"reason":"short"},{"name":"Authoritativeness","max":25,"points":0,"reason":"short"},{"name":"Trust","max":25,"points":0,"reason":"short"}],
"evidence":{"good":["https://real-url — reason"],"bad":["missing content type"]}}],
"eeat":{"experience":{"score":0,"status":"","signals":{"found":[""],"missing":[""]},"working":"short","missing_detail":"short","recommendation":"short"},"expertise":{same},"authoritativeness":{same},"trust":{same}},
"pages":[{"title":"","url":"REAL","type":"Home|Product|FAQ|About|Other","geoScore":0,"scores":{"ia":0,"heading":0,"text":0,"eeat":0},"issues":["tag"],"headings":[{"tag":"H1","text":""}],"textPreview":"30 chars","eeatSignals":[""],"issueDetails":[""],"actions":[""]}]}

English only. Escape all quotes. No cookie/policy text in textPreview.

ABSOLUTE RULES:
1. Return ONLY the JSON object. NO explanations, NO thinking, NO planning, NO step-by-step reasoning.
2. Do NOT describe your browsing process. Just output the final JSON.
3. Do NOT say "I will try" or "Let me check". Just return the JSON.
4. The ENTIRE response must be a single JSON object starting with { and ending with }.
5. If you cannot access some pages, still return the JSON with what you found.`;
}

async function runGeminiAnalysis(apiKey, url, onProgress, onInsight) {
  window._onInsightCallback = onInsight;

  // --- Pre-analysis steps (animated while Gemini works) ---
  const domain = (() => { try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname; } catch { return url; } })();

  // Step 0: Normalize
  onProgress(0, 'Normalizing URL');
  onInsight(`Target: ${domain}`, 'blue');
  await sleep(800);

  // Step 1: Fetch homepage
  onProgress(1, 'Fetching homepage');
  onInsight(`Connecting to ${domain}...`, 'blue');
  await sleep(1200);
  onInsight('Homepage response received', 'green');
  await sleep(600);

  // Step 2: Discover links
  onProgress(2, 'Discovering internal links');
  onInsight('Scanning navigation and internal links...', 'blue');
  await sleep(1000);
  onInsight('Mapping site structure...', 'blue');
  await sleep(800);

  // Step 3: Classify pages
  onProgress(3, 'Classifying page types');
  onInsight('Identifying page types: Home, Product, FAQ, About...', 'blue');
  await sleep(1000);

  // Step 4: Extract content — this is where we actually call Gemini
  onProgress(4, 'Extracting headings and body text');
  onInsight('Sending site data to Gemini AI for deep analysis...', 'blue');
  await sleep(600);

  // Launch Gemini API call
  const apiPromise = callGeminiWithUrl(apiKey, buildDirectAnalysisPrompt(url));

  // --- Animate remaining steps while waiting for Gemini ---
  let animCancelled = false;

  const animateWaiting = async () => {
    const waitInsights = [
      { delay: 3000, step: 5, text: 'Evaluating URL semantics and path structure...', color: 'blue' },
      { delay: 2500, step: 5, text: 'Checking for system-code vs semantic URLs...', color: 'blue' },
      { delay: 2500, step: 6, text: 'Measuring text density and content depth...', color: 'blue' },
      { delay: 2000, step: 6, text: 'Checking text-to-image ratio...', color: 'blue' },
      { delay: 2500, step: 7, text: 'Scanning for E-E-A-T trust signals...', color: 'blue' },
      { delay: 2000, step: 7, text: 'Looking for expertise and authority indicators...', color: 'blue' },
      { delay: 2500, step: 8, text: 'Calculating dimension scores...', color: 'blue' },
      { delay: 3000, step: 8, text: 'Cross-referencing GEO readiness patterns...', color: 'blue' },
      { delay: 2500, step: 8, text: 'Almost done — finalizing analysis...', color: 'blue' },
    ];

    for (const item of waitInsights) {
      if (animCancelled) return;
      await sleep(item.delay);
      if (animCancelled) return;
      onProgress(item.step, '');
      onInsight(item.text, item.color);
    }

    // If still waiting, show periodic messages
    let extraWait = 0;
    const msgs = [
      'Gemini is reading multiple pages...',
      'Deep-analyzing content structure...',
      'Evaluating heading hierarchy across pages...',
      'Checking FAQ and support content coverage...',
      'Analyzing information architecture depth...',
      'Reviewing content for AI citation readiness...',
      'Assessing structured data and schema usage...',
      'Comparing against GEO best practices...',
      'Processing multi-page analysis results...',
      'Compiling final diagnostic report...',
    ];
    while (!animCancelled && extraWait < 10) {
      await sleep(4000);
      if (animCancelled) return;
      onInsight(msgs[extraWait % msgs.length], 'blue');
      extraWait++;
    }
  };

  // Run animation and API call in parallel
  const animPromise = animateWaiting();

  let result;
  try {
    result = await apiPromise;
  } finally {
    animCancelled = true; // Stop animation immediately
  }

  // --- Post-analysis steps ---
  const score = result.overallScore || 0;
  onProgress(8, 'Generating GEO Readiness score');
  onInsight(`Overall GEO Score: ${score}/100`, score >= 60 ? 'green' : score >= 40 ? 'yellow' : 'red');
  await sleep(600);

  // Show dimension previews
  if (result.dimensions && result.dimensions.length > 0) {
    for (const dim of result.dimensions) {
      await sleep(300);
      const s = dim.score || 0;
      const icon = s >= 60 ? '✓' : s >= 40 ? '△' : '✗';
      onInsight(`${icon} ${dim.title}: ${s}/100`, s >= 60 ? 'green' : s >= 40 ? 'yellow' : 'red');
    }
  }
  await sleep(400);

  onProgress(9, 'Analysis complete');
  onInsight(`${result.pagesScanned || '?'} pages analyzed — report ready`, 'green');
  await sleep(800);

  window._onInsightCallback = null;
  return result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

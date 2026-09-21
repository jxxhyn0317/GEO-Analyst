// ===== YOUTUBE GEO =====
// A video cannot be measured the way a page can. There is no HTML to count: YouTube hands a
// server-side fetch an empty shell and a "sign in to confirm you're not a bot" notice, and the
// transcript is not obtainable for a video you do not own through any official channel.
//
// So the material comes from the model itself. Gemini takes a public YouTube URL as a video
// input and, on the flash models, walks the timeline and reads the transcript as it goes. What
// it returns here is only observation: what was said, when, and whether a sentence stands on its
// own. The rubric below turns those observations into points, in this file, where they can be
// read and argued with. The model never decides a score.
//
// Every observation carries a quote and a timestamp, because a judgement about a video is worth
// nothing if the viewer cannot jump to the moment and check it.

const YTGEO = (() => {
  const WEIGHTS = { d1: 0.15, d2: 0.35, d3: 0.35, d4: 0.15 };
  const SCORE_CAP = 99;

  // ---------- schema for what we ask the model to observe ----------
  const S = (type, extra) => ({ type, ...extra });
  const MOMENT = S('OBJECT', {
    properties: { quote: S('STRING'), at: S('STRING') },
    required: ['quote', 'at']
  });
  const VERDICT = S('OBJECT', {
    properties: { pass: S('BOOLEAN'), quote: S('STRING'), at: S('STRING'), why: S('STRING') },
    required: ['pass', 'quote', 'at', 'why']
  });

  const OBS_SCHEMA = S('OBJECT', {
    properties: {
      titleSeen: S('STRING'),
      durationSeconds: S('INTEGER'),
      spokenLanguage: S('STRING'),
      mostlySilent: S('BOOLEAN'),

      topicStated: VERDICT,
      answerAtSeconds: S('INTEGER'),
      answerMoment: MOMENT,
      coverageStated: VERDICT,
      substanceStartsAtSeconds: S('INTEGER'),

      chaptersKnown: S('BOOLEAN'),
      chapterTitles: S('ARRAY', { items: S('STRING') }),
      chapterTitlesDescriptive: S('INTEGER'),
      sections: S('ARRAY', { items: S('OBJECT', { properties: { title: S('STRING'), at: S('STRING') }, required: ['title', 'at'] }) }),
      signposting: VERDICT,

      quotable: S('ARRAY', { items: MOMENT }),
      citableFacts: S('ARRAY', { items: MOMENT }),
      entitiesNamed: VERDICT,

      speakerIdentified: VERDICT,
      sourcesCited: S('ARRAY', { items: MOMENT }),
      datedClaims: S('ARRAY', { items: MOMENT }),
      staleClaim: VERDICT,

      headline: S('STRING'),
      strengths: S('ARRAY', { items: S('STRING') }),
      weaknesses: S('ARRAY', { items: S('STRING') }),
      dimensions: S('OBJECT', {
        properties: {
          d1: dimText(), d2: dimText(), d3: dimText(), d4: dimText()
        },
        required: ['d1', 'd2', 'd3', 'd4']
      })
    },
    required: ['titleSeen', 'durationSeconds', 'spokenLanguage', 'mostlySilent', 'topicStated',
      'answerAtSeconds', 'answerMoment', 'coverageStated', 'substanceStartsAtSeconds',
      'chaptersKnown', 'chapterTitles', 'chapterTitlesDescriptive', 'sections', 'signposting',
      'quotable', 'citableFacts', 'entitiesNamed', 'speakerIdentified', 'sourcesCited',
      'datedClaims', 'staleClaim', 'headline', 'strengths', 'weaknesses', 'dimensions']
  });

  function dimText() {
    return S('OBJECT', {
      properties: {
        diagnosis: S('ARRAY', { items: S('STRING') }),
        todo: S('ARRAY', { items: S('STRING') })
      },
      required: ['diagnosis', 'todo']
    });
  }

  // ---------- the prompt ----------
  function prompt(url) {
    return `You are a strict technical GEO (Generative Engine Optimization) auditor watching ONE public YouTube video. GEO asks whether an AI answer engine such as Perplexity or Google AI Overviews could find this video, read it, and quote a passage of it as an answer with a citation.

Watch the whole video. Report only what you observe. Do not score anything and do not flatter the video.

Rules that matter:
- Every observation carries a verbatim quote and a timestamp in m:ss or h:mm:ss, so a person can jump to that moment and check you.
- If you genuinely cannot tell, say so: set pass to false and write why in one short phrase, and use "" for a quote you do not have. Never invent a quote or a timestamp.
- "at" for something absent is "".

Observe:
- titleSeen: the video's title if it is visible to you, otherwise "".
- durationSeconds, spokenLanguage, mostlySilent (true if there is little or no speech, such as music or ambience).
- topicStated: does the speaker name the subject within the first 30 seconds, in words someone searching would use.
- answerAtSeconds: the second at which a direct, useful answer to the question the video poses is first stated. Use -1 if it never is.
- answerMoment: that sentence.
- coverageStated: does the video say early what it will cover.
- substanceStartsAtSeconds: the second at which the actual content begins, after any intro, sponsor read or channel trailer.
- chaptersKnown: true only if you can actually see the video's chapter markers. If you cannot see them, false and leave chapterTitles empty. Do not guess chapters from the spoken structure.
- chapterTitles, chapterTitlesDescriptive: how many of those titles name a claim or a topic rather than "Intro", "Part 2", "Outro".
- sections: the structure the speaker actually signposts out loud, up to 12, each with its timestamp.
- signposting: does the speaker mark transitions out loud ("next, ...", "the second reason is ...").
- quotable: up to 8 sentences that would still make sense pasted into an answer with nothing around them. A sentence that needs the previous sentence, or needs the picture, does not count.
- citableFacts: up to 8 spoken statements carrying a specific number, date, name, price, version or measurement.
- entitiesNamed: does the speaker name the product, company, place or person in words, rather than relying on "this", "it", "that one" or pointing at the screen.
- speakerIdentified: is the person or organisation speaking named, in speech or on screen.
- sourcesCited: up to 6 moments where a source, study, document or original is named out loud or shown.
- datedClaims: up to 6 statements tied to a date, version or year.
- staleClaim: is there a statement that was true when filmed and is likely wrong now. pass=true means such a claim exists.

Then write the report text, in English, plain sentences, no em dash, no marketing language, citing the numbers you observed:
- headline: one sentence, at most 22 words, naming the biggest thing standing between this video and being quoted.
- strengths: exactly 3, at most 16 words each. weaknesses: exactly 3, at most 16 words each.
- dimensions d1 to d4, where d1 is the video's framing and format, d2 its structure, d3 its answerability and depth, d4 its authority and sourcing: diagnosis = exactly 3 bullets of at most 14 words; todo = exactly 3 short imperative actions of at most 12 words, most valuable first.

VIDEO: ${url}`;
  }

  // ---------- rubric ----------
  const at = m => (m && m.at ? ` [${m.at}]` : '');
  const quoteOf = m => (m && m.quote ? `"${m.quote}"${at(m)}` : '');

  function check(pass, pts, text, meas) { return { pass: !!pass, pts, text, meas: meas || '', fix: '' }; }

  // A group the model could not see is not a group worth zero. It is left out of the total and
  // said so on the card, because a score that quietly counts an unknown as a failure is a lie.
  function group(name, checks, captures, assessed = true) {
    const max = checks.reduce((s, c) => s + c.pts, 0);
    const points = checks.reduce((s, c) => s + (c.pass ? c.pts : 0), 0);
    return { name, max, points, checks, captures: pick(points, max, captures), assessed };
  }
  function band(value, bands) {
    for (const [min, pts] of bands) if (value >= min) return pts;
    return 0;
  }
  function pick(points, max, c) {
    const out = [];
    if (points > 0 && c && c.good) out.push({ tone: 'good', ...c.good });
    if (points < max && c && c.bad) out.push({ tone: 'bad', ...c.bad });
    return out;
  }
  const cap = (caption, code) => (code ? { caption, code } : null);

  function build(o, url) {
    const dur = Math.max(0, o.durationSeconds || 0);
    const ans = typeof o.answerAtSeconds === 'number' ? o.answerAtSeconds : -1;
    const quotable = o.quotable || [];
    const facts = o.citableFacts || [];
    const sections = o.sections || [];
    const sources = o.sourcesCited || [];

    // ---- D1 framing and format ----
    const d1 = [
      group('Subject named early', [
        check(o.topicStated?.pass, 5, 'The subject is named in the first 30 seconds', o.topicStated?.why || ''),
        check(o.titleSeen && o.topicStated?.pass, 3, 'The title names the same subject the video opens with', o.titleSeen ? `title: ${o.titleSeen}` : 'title not visible')
      ], {
        good: cap('The opening names the subject.', quoteOf(o.topicStated)),
        bad: cap('Nothing in the opening names the subject.', o.topicStated?.why || 'no subject stated early')
      }),
      group('Format fits how answers get cited', [
        check(dur > 180, 4, 'Long form, not a Short', `${fmt(dur)} long`),
        check(dur >= 480 && dur <= 1200, 3, 'In the length band that gets cited most (8 to 20 min)', `${fmt(dur)}`)
      ], {
        good: cap('Length works for citation.', `duration ${fmt(dur)}`),
        bad: cap('Length works against citation.', dur <= 60 ? `A Short at ${fmt(dur)}. Shorts take 5.7% of AI citations.` : `${fmt(dur)} sits outside the 8 to 20 minute band that is cited most.`)
      })
    ];

    // ---- D2 structure ----
    const chapters = o.chapterTitles || [];
    const d2 = [
      group('Chapters', [
        check(chapters.length > 0, 5, 'The video has chapters'),
        check(band(chapters.length, [[5, 1], [3, 0]]) === 1 && chapters.length <= 12, 4, 'Between 5 and 12 chapters', `${chapters.length} chapters`),
        check(chapters.length > 0 && o.chapterTitlesDescriptive >= Math.ceil(chapters.length * 0.8), 5, 'Chapter titles name a claim, not "Intro" or "Part 2"', chapters.length ? `${o.chapterTitlesDescriptive || 0} of ${chapters.length} descriptive` : '')
      ], {
        good: cap('Chapters split the video into quotable parts.', chapters.slice(0, 8).join('\n')),
        bad: cap('No chapters to cite into.', 'A chaptered video gets cited at several timestamps instead of once. Google links the timestamp; nothing else does.')
      }, o.chaptersKnown !== false),
      group('Spoken structure', [
        check(sections.length >= 3, 6, 'The talk has at least 3 signposted sections', `${sections.length} sections`),
        check(o.signposting?.pass, 6, 'Transitions are marked out loud', o.signposting?.why || '')
      ], {
        good: cap('The speaker marks where each part begins.', sections.slice(0, 8).map(s => `${s.at}  ${s.title}`).join('\n') || quoteOf(o.signposting)),
        bad: cap('The talk runs on without marked parts.', o.signposting?.why || 'no spoken transitions found')
      }),
      group('The opening gets to it', [
        check(o.coverageStated?.pass, 4, 'The video says early what it will cover', o.coverageStated?.why || ''),
        check(o.substanceStartsAtSeconds >= 0 && o.substanceStartsAtSeconds <= 30, 5, 'Content starts within 30 seconds', o.substanceStartsAtSeconds >= 0 ? `starts at ${fmt(o.substanceStartsAtSeconds)}` : '')
      ], {
        good: cap('The opening sets up what follows.', quoteOf(o.coverageStated)),
        bad: cap('The opening delays the content.', o.substanceStartsAtSeconds > 30 ? `Content starts at ${fmt(o.substanceStartsAtSeconds)}.` : (o.coverageStated?.why || 'the opening does not say what is coming'))
      })
    ];

    // ---- D3 answerability ----
    const d3 = [
      group('A direct answer, early', [
        check(ans >= 0 && ans <= 30, 6, 'A direct answer lands within 30 seconds', ans >= 0 ? `answer at ${fmt(ans)}` : 'no direct answer found'),
        check(ans >= 0 && ans <= 60, 4, 'A direct answer lands within the first minute', '')
      ], {
        good: cap('The answer is stated, and early.', quoteOf(o.answerMoment)),
        bad: cap('No direct answer near the top.', ans < 0 ? 'The video never states a direct answer.' : `The first direct answer is at ${fmt(ans)}.`)
      }),
      group('Sentences that stand alone', [
        check(quotable.length >= 5, 6, 'At least 5 sentences make sense on their own', `${quotable.length} found`),
        check(quotable.length >= 3, 4, 'At least 3 sentences make sense on their own', '')
      ], {
        good: cap('These would survive being quoted.', quotable.slice(0, 4).map(quoteOf).join('\n')),
        bad: cap('Little here survives being quoted.', 'Sentences that need the previous sentence, or need the picture, cannot be lifted into an answer.')
      }),
      group('Citable specifics', [
        check(facts.length >= 5, 5, 'At least 5 spoken facts carry a number, date or name', `${facts.length} found`),
        check(facts.length >= 2, 4, 'At least 2 spoken facts carry a number, date or name', '')
      ], {
        good: cap('Specifics an engine can cite.', facts.slice(0, 4).map(quoteOf).join('\n')),
        bad: cap('Nothing specific enough to cite.', 'An engine quotes numbers, dates, names and prices. General statements do not get picked up.')
      }),
      group('Things are named', [
        check(o.entitiesNamed?.pass, 6, 'Products, people and places are named, not pointed at', o.entitiesNamed?.why || '')
      ], {
        good: cap('The speaker names things in words.', quoteOf(o.entitiesNamed)),
        bad: cap('The words depend on the picture.', o.entitiesNamed?.why || '"this", "it" and "that one" carry the meaning, so the transcript loses it')
      })
    ];

    // ---- D4 authority ----
    const d4 = [
      group('Who is speaking', [
        check(o.speakerIdentified?.pass, 5, 'The speaker or organisation is named', o.speakerIdentified?.why || '')
      ], {
        good: cap('The voice has a name on it.', quoteOf(o.speakerIdentified)),
        bad: cap('No one is named.', o.speakerIdentified?.why || 'nobody is identified in speech or on screen')
      }),
      group('Sources named out loud', [
        check(sources.length >= 3, 4, 'At least 3 sources are named or shown', `${sources.length} found`),
        check(sources.length >= 1, 2, 'At least one source is named or shown', '')
      ], {
        good: cap('Claims point somewhere.', sources.slice(0, 4).map(quoteOf).join('\n')),
        bad: cap('Claims point nowhere.', 'Nothing in the video names a study, document or original an engine could follow.')
      }),
      group('Still true', [
        check(!o.staleClaim?.pass, 4, 'No claim has gone out of date', o.staleClaim?.pass ? 'a dated claim is likely wrong now' : '')
      ], {
        good: cap('Nothing has obviously expired.', (o.datedClaims || []).slice(0, 3).map(quoteOf).join('\n') || 'no dated claims found'),
        bad: cap('A claim has expired.', quoteOf(o.staleClaim))
      })
    ];

    const dims = [
      dim(1, 'Framing & Format', 'd1', d1),
      dim(2, 'Structural Extractability', 'd2', d2),
      dim(3, 'Answerability & Depth', 'd3', d3),
      dim(4, 'Authority & Sourcing', 'd4', d4)
    ];

    const result = {
      url,
      kind: 'youtube',
      fetchedAt: Date.now(),
      dimensions: dims,
      redirects: [],
      fetchWarnings: [],
      observed: o,
      measure: { jsHeavy: false, substantiveChars: 0, url }
    };
    finalize(result, o);
    return result;
  }

  function dim(num, title, key, breakdown) {
    return { num, key, title, weight: Math.round(WEIGHTS[key] * 100) + '%', breakdown };
  }

  // Unassessed groups leave the sum entirely, on both sides, so a video whose chapters we could
  // not see is not punished for it. The card says how many points were actually looked at.
  function finalize(r, o) {
    let seen = 0, possible = 0;
    r.dimensions.forEach(d => {
      const live = d.breakdown.filter(g => g.assessed !== false);
      const raw = live.reduce((s, g) => s + g.points, 0);
      const max = live.reduce((s, g) => s + g.max, 0);
      d.rawScore = max ? Math.round(raw / max * 100) : 0;
      d.score = Math.min(d.rawScore, SCORE_CAP);
      // A perfect dimension shows 99 like everywhere else in the app, and says why rather than
      // leaving an unexplained number on the card.
      d.capped = d.rawScore > SCORE_CAP;
      d.assessedPoints = max;
      seen += max;
      possible += d.breakdown.reduce((s, g) => s + g.max, 0);
    });
    r.assessedPoints = seen;
    r.totalPoints = possible;
    const total = r.dimensions.reduce((s, d) => s + d.score * WEIGHTS[d.key], 0);
    r.overallScore = Math.min(Math.round(total), SCORE_CAP);
    r.templates = {
      headline: o.headline || '',
      strengths: (o.strengths || []).slice(0, 3),
      weaknesses: (o.weaknesses || []).slice(0, 3),
      perDim: {
        d1: o.dimensions?.d1 || { diagnosis: [], todo: [] },
        d2: o.dimensions?.d2 || { diagnosis: [], todo: [] },
        d3: o.dimensions?.d3 || { diagnosis: [], todo: [] },
        d4: o.dimensions?.d4 || { diagnosis: [], todo: [] }
      }
    };
  }

  function fmt(s) {
    s = Math.max(0, Math.round(s || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
  }

  // A YouTube address, in any of the shapes people paste. Returns the canonical watch URL.
  function normalize(raw) {
    let u;
    try { u = new URL(String(raw).trim()); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (host === 'youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else if (/^\/(shorts|embed|live|v)\//.test(u.pathname)) id = u.pathname.split('/')[2] || '';
    }
    id = id.split(/[?&#/]/)[0];
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, url: `https://www.youtube.com/watch?v=${id}` } : null;
  }

  return { OBS_SCHEMA, prompt, build, normalize, fmt, WEIGHTS };
})();

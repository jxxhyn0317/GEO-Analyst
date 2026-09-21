// ===== YOUTUBE GEO =====
// A video cannot be measured the way a page can. There is no HTML to count: YouTube hands a
// server-side fetch an empty shell and a "sign in to confirm you're not a bot" notice, and the
// transcript is not obtainable for a video you do not own through any official channel.
//
// So the material comes from the model itself. Gemini takes a public YouTube URL as a video
// input and, on the flash models, walks the timeline and reads the transcript as it goes. What
// it returns here is only observation: what was said, when, whether a sentence stands on its own,
// and whatever metadata it can actually see. The rubric below turns those observations into
// points, in this file, where they can be read and argued with. The model never decides a score.
//
// The weighting follows Google. YouTube's own help puts title and description at the top of what
// matters, Search Central names description timestamps as the way key moments are found, and the
// generative AI guide says the only technical requirement is that the page be indexed and able to
// show a snippet. Those three things carry 60 of the 100 points. The rest is about what actually
// gets quoted, which the official documentation does not address, and every group says which it
// is so the reader can weigh it accordingly.
//
// Every observation carries a quote and a timestamp, because a judgement about a video is worth
// nothing if the viewer cannot jump to the moment and check it.

const YTGEO = (() => {
  const WEIGHTS = { d1: 0.30, d2: 0.30, d3: 0.25, d4: 0.15 };
  const SCORE_CAP = 99;

  // Where a group's standard comes from, shown on the card.
  const GOOGLE = 'Google guidance';
  const STUDY = 'citation studies';
  const JUDGE_SRC = 'our judgement';

  // ---------- schema for what we ask the model to observe ----------
  const S = (type, extra) => ({ type, ...extra });
  const MOMENT = S('OBJECT', { properties: { quote: S('STRING'), at: S('STRING') }, required: ['quote', 'at'] });
  const VERDICT = S('OBJECT', {
    properties: { pass: S('BOOLEAN'), quote: S('STRING'), at: S('STRING'), why: S('STRING') },
    required: ['pass', 'quote', 'at', 'why']
  });
  const dimText = () => S('OBJECT', {
    properties: { diagnosis: S('ARRAY', { items: S('STRING') }), todo: S('ARRAY', { items: S('STRING') }) },
    required: ['diagnosis', 'todo']
  });

  const OBS_SCHEMA = S('OBJECT', {
    properties: {
      // metadata, only if the model can actually see it
      metadataSeen: S('BOOLEAN'),
      titleSeen: S('STRING'),
      descriptionWords: S('INTEGER'),
      descriptionRestatesContent: VERDICT,
      descriptionHasTimestamps: S('BOOLEAN'),
      hashtagCount: S('INTEGER'),
      titleNamesSubject: VERDICT,
      titleIsSpecific: VERDICT,
      listedPublic: VERDICT,

      // the video itself
      durationSeconds: S('INTEGER'),
      spokenLanguage: S('STRING'),
      mostlySilent: S('BOOLEAN'),
      topicStated: VERDICT,
      answerAtSeconds: S('INTEGER'),
      answerMoment: MOMENT,
      coverageStated: VERDICT,
      substanceStartsAtSeconds: S('INTEGER'),

      // chapters, against YouTube's own rules
      chaptersKnown: S('BOOLEAN'),
      chapterTitles: S('ARRAY', { items: S('STRING') }),
      chapterTitlesDescriptive: S('INTEGER'),
      chapterFirstAtZero: S('BOOLEAN'),
      shortestChapterSeconds: S('INTEGER'),

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
      dimensions: S('OBJECT', { properties: { d1: dimText(), d2: dimText(), d3: dimText(), d4: dimText() }, required: ['d1', 'd2', 'd3', 'd4'] })
    },
    required: ['metadataSeen', 'titleSeen', 'descriptionWords', 'descriptionRestatesContent',
      'descriptionHasTimestamps', 'hashtagCount', 'titleNamesSubject', 'titleIsSpecific', 'listedPublic',
      'durationSeconds', 'spokenLanguage', 'mostlySilent', 'topicStated', 'answerAtSeconds', 'answerMoment',
      'coverageStated', 'substanceStartsAtSeconds', 'chaptersKnown', 'chapterTitles', 'chapterTitlesDescriptive',
      'chapterFirstAtZero', 'shortestChapterSeconds', 'sections', 'signposting', 'quotable', 'citableFacts',
      'entitiesNamed', 'speakerIdentified', 'sourcesCited', 'datedClaims', 'staleClaim',
      'headline', 'strengths', 'weaknesses', 'dimensions']
  });

  // ---------- the prompt ----------
  function prompt(url, known) {
    const head = known && known.title
      ? `The title and channel are already known and are given here, so judge them rather than looking for them:
TITLE: ${known.title}
CHANNEL: ${known.channel || ''}

`
      : '';
    return head + `You are a strict technical GEO (Generative Engine Optimization) auditor examining ONE public YouTube video. GEO asks whether an AI answer engine such as Perplexity or Google AI Overviews could find this video, read it, and quote a passage of it as an answer with a citation.

Watch the whole video. Report only what you observe. Do not score anything and do not flatter the video.

Rules that matter:
- Every observation carries a verbatim quote and a timestamp in m:ss or h:mm:ss, so a person can jump to that moment and check you.
- Never invent a quote, a timestamp, a title or a description. Guessing here is worse than saying you cannot tell.
- If you cannot tell, set pass to false and write why in one short phrase, with "" for the quote.

You have a tool that can open a public web page. Open the watch page URL at the bottom of these instructions and read the description and the chapter list from it. That is the only way to see them: the player shows you the picture and the sound, not the page around it.

FIRST, the page metadata. Set metadataSeen to true ONLY if you actually read this video's description from the page. If the page will not open, set metadataSeen to false, descriptionWords to -1, hashtagCount to -1, and set the pass of descriptionRestatesContent and listedPublic to false with why = "page could not be read". Do not reconstruct a description from the spoken content.
- titleSeen: the exact title, from the page or from the TITLE given above.
- titleNamesSubject: does the title name the subject in words someone would search for.
- titleIsSpecific: does it name the actual topic rather than only a hook such as "You won't believe this".
- descriptionWords: how many words the description holds.
- descriptionRestatesContent: does the description say what the video covers, rather than only links and promotion.
- descriptionHasTimestamps: does the description contain a list of timestamps.
- hashtagCount: how many hashtags appear in the title and description together.
- listedPublic: is the video public and listed, with no sign of age or region restriction.

SECOND, the video.
- durationSeconds, spokenLanguage, mostlySilent (little or no speech, such as music or ambience).
- topicStated: does the speaker name the subject within the first 30 seconds.
- answerAtSeconds: the second at which a direct, useful answer to the question the video poses is first stated, or -1 if never.
- answerMoment: that sentence.
- coverageStated: does the video say early what it will cover.
- substanceStartsAtSeconds: when the content begins, after any intro or sponsor read.

THIRD, chapters. YouTube's own rules are that the first timestamp is 00:00, there are at least three, and each runs at least 10 seconds.
- chaptersKnown: true only if you can actually see the chapter markers. If not, false, leave chapterTitles empty, chapterFirstAtZero false and shortestChapterSeconds -1. Do not infer chapters from the spoken structure.
- chapterTitles, chapterTitlesDescriptive: how many titles name a claim or topic rather than "Intro", "Part 2", "Outro".
- chapterFirstAtZero: does the first chapter start at 00:00.
- shortestChapterSeconds: the length of the shortest chapter.

FOURTH, what could be quoted.
- sections: the structure the speaker signposts out loud, up to 12, each with a timestamp.
- signposting: does the speaker mark transitions out loud.
- quotable: up to 8 sentences that would still make sense pasted into an answer with nothing around them. A sentence needing the previous one, or the picture, does not count.
- citableFacts: up to 8 spoken statements carrying a specific number, date, name, price, version or measurement.
- entitiesNamed: does the speaker name the product, company, place or person, rather than relying on "this", "it" or pointing at the screen.
- speakerIdentified: is the person or organisation named, in speech or on screen.
- sourcesCited: up to 6 moments where a source, study or document is named or shown.
- datedClaims: up to 6 statements tied to a date, version or year.
- staleClaim: is there a statement that was true when filmed and is likely wrong now. pass=true means such a claim exists.

Then write the report text, in English, plain sentences, no em dash, no marketing language, citing the numbers you observed:
- headline: one sentence, at most 22 words, naming the biggest thing standing between this video and being quoted.
- strengths: exactly 3, at most 16 words each. weaknesses: exactly 3, at most 16 words each.
- dimensions d1 to d4, where d1 is title, description and eligibility, d2 is chapters and key moments, d3 is answerability and depth, d4 is delivery and authority: diagnosis = exactly 3 bullets of at most 14 words; todo = exactly 3 short imperative actions of at most 12 words, most valuable first.

VIDEO: ${url}`;
  }

  // ---------- rubric ----------
  const at = m => (m && m.at ? ` [${m.at}]` : '');
  const quoteOf = m => (m && m.quote ? `"${m.quote}"${at(m)}` : '');
  const check = (pass, pts, text, meas) => ({ pass: !!pass, pts, text, meas: meas || '', fix: '' });
  const cap = (caption, code) => (code ? { caption, code } : null);

  // A group the model could not see is not a group worth zero. It leaves the total on both sides
  // and the card says so, because a score that quietly counts an unknown as a failure is a lie.
  function group(name, src, checks, captures, assessed = true) {
    const max = checks.reduce((s, c) => s + c.pts, 0);
    const points = checks.reduce((s, c) => s + (c.pass ? c.pts : 0), 0);
    const out = [];
    if (points > 0 && captures && captures.good) out.push({ tone: 'good', ...captures.good });
    if (points < max && captures && captures.bad) out.push({ tone: 'bad', ...captures.bad });
    return { name, src, max, points, checks, captures: out, assessed };
  }

  // "Early" is relative. A 17 second advert clears an absolute 30 second bar without trying, and
  // a 50 minute talk fails it however well it is made, which is how a rubric ends up rewarding
  // the shortest thing in the room. These scale with the video and stay inside sane bounds.
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const answerBy = dur => Math.round(clamp(dur * 0.06, 20, 120));
  const startBy = dur => Math.round(clamp(dur * 0.05, 10, 90));

  function build(o, url, known) {
    const dur = Math.max(0, o.durationSeconds || 0);
    const ansBar = answerBy(dur);
    const startBar = startBy(dur);
    const title = (known && known.title) || o.titleSeen || '';
    const haveTitle = !!title;
    const ans = typeof o.answerAtSeconds === 'number' ? o.answerAtSeconds : -1;
    const meta = o.metadataSeen === true;   // the description and chapters, read off the page
    const words = typeof o.descriptionWords === 'number' ? o.descriptionWords : -1;
    const tags = typeof o.hashtagCount === 'number' ? o.hashtagCount : -1;
    const chapters = o.chapterTitles || [];
    const nCh = chapters.length;
    const shortest = typeof o.shortestChapterSeconds === 'number' ? o.shortestChapterSeconds : -1;
    const quotable = o.quotable || [];
    const facts = o.citableFacts || [];
    const sections = o.sections || [];
    const sources = o.sourcesCited || [];

    // ---- D1 title, description, eligibility. Google puts these first. ----
    const d1 = [
      group('Title', GOOGLE, [
        check(haveTitle && o.titleNamesSubject?.pass, 5, 'The title names the subject in words people search for', title),
        check(haveTitle && o.titleIsSpecific?.pass, 3, 'The title names the topic, not only a hook', o.titleIsSpecific?.why || ''),
        check(haveTitle && title.length <= 70, 2, 'Short enough not to be cut in a citation', haveTitle ? `${title.length} characters` : '')
      ], {
        good: cap('The title carries the subject.', title),
        bad: cap('The title does not carry the subject.', title || (o.titleNamesSubject?.why || 'title not readable'))
      }, haveTitle),
      group('Description', GOOGLE, [
        check(words >= 60, 4, 'A description worth reading, not a line or two', words >= 0 ? `${words} words` : ''),
        check(words >= 250 && words <= 600, 5, 'In the length band that gets cited most (250 to 600 words)', ''),
        check(o.descriptionRestatesContent?.pass, 3, 'It says what the video covers, not only links', o.descriptionRestatesContent?.why || ''),
        check(tags >= 0 && tags <= 15, 2, 'Not over-tagged (YouTube ignores every hashtag past 60)', tags >= 0 ? `${tags} hashtags` : '')
      ], {
        good: cap('The description does its job.', `${words} words${o.descriptionHasTimestamps ? ', with a timestamp list' : ''}`),
        bad: cap('The description is thin.', words >= 0 ? `${words} words. YouTube calls the description one of the most important pieces of metadata for discovery, and cited videos run about 334 words.` : 'The description could not be read.')
      }, meta),
      group('Eligible to be shown', GOOGLE, [
        check(o.listedPublic?.pass, 6, 'Public and listed, so it can be indexed and quoted', o.listedPublic?.why || '')
      ], {
        good: cap('Nothing blocks it from being shown.', quoteOf(o.listedPublic) || 'public and listed'),
        bad: cap('It may not be eligible at all.', o.listedPublic?.why || 'Google requires a page to be indexed and able to show a snippet before it can appear in an AI answer.')
      }, meta)
    ];

    // ---- D2 chapters. Google names description timestamps as the way key moments are found. ----
    const d2 = [
      group('YouTube’s chapter rules', GOOGLE, [
        check(nCh >= 3, 6, 'At least three chapters', nCh ? `${nCh} chapters` : 'none'),
        check(nCh >= 3 && o.chapterFirstAtZero === true, 4, 'The first chapter starts at 00:00', o.chapterFirstAtZero === false ? 'first chapter does not start at 00:00' : ''),
        check(nCh >= 3 && shortest >= 10, 4, 'Every chapter runs at least 10 seconds', shortest >= 0 ? `shortest is ${shortest}s` : '')
      ], {
        good: cap('The chapters meet YouTube’s rules.', chapters.slice(0, 8).join('\n')),
        bad: cap('The chapters do not meet YouTube’s rules.', 'YouTube requires the first timestamp to be 00:00, at least three timestamps, and at least 10 seconds each. Chapters that fail the rules are not built.')
      }, o.chaptersKnown !== false),
      group('Chapter titles', STUDY, [
        check(nCh >= 5 && nCh <= 12, 4, 'Between 5 and 12 chapters', nCh ? `${nCh} chapters` : ''),
        check(nCh > 0 && (o.chapterTitlesDescriptive || 0) >= Math.ceil(nCh * 0.8), 6, 'Titles name a claim, not "Intro" or "Part 2"', nCh ? `${o.chapterTitlesDescriptive || 0} of ${nCh} descriptive` : '')
      ], {
        good: cap('Each chapter title says what is in it.', chapters.slice(0, 8).join('\n')),
        bad: cap('The titles do not say what is in them.', chapters.length ? chapters.slice(0, 8).join('\n') : 'A chaptered video is cited at several timestamps instead of once, but only if the titles mean something.')
      }, o.chaptersKnown !== false),
      group('Timestamps in the description', GOOGLE, [
        check(o.descriptionHasTimestamps === true, 6, 'The description carries the timestamp list', o.descriptionHasTimestamps === false ? 'no timestamp list found' : '')
      ], {
        good: cap('The timestamps are where Google looks.', 'Google: specify the exact timestamps and labels in the video description on YouTube.'),
        bad: cap('There is no timestamp list to read.', 'Google names the description timestamp list as the way to mark key moments on a YouTube video. Without it there is nothing to link into.')
      }, meta)
    ];

    // ---- D3 what actually gets quoted. Not covered by official guidance. ----
    const d3 = [
      group('A direct answer, early', JUDGE_SRC, [
        check(ans >= 0 && ans <= ansBar, 5, `A direct answer lands within the first ${fmt(ansBar)}`, ans >= 0 ? `answer at ${fmt(ans)} of ${fmt(dur)}` : 'no direct answer found'),
        check(ans >= 0 && ans <= ansBar * 2, 4, `A direct answer lands within ${fmt(ansBar * 2)}`, '')
      ], {
        good: cap('The answer is stated, and early.', quoteOf(o.answerMoment)),
        bad: cap('No direct answer near the top.', ans < 0 ? 'The video never states a direct answer.' : `The first direct answer is at ${fmt(ans)}, past the ${fmt(ansBar)} mark this video is measured against.`)
      }),
      group('Sentences that stand alone', JUDGE_SRC, [
        check(quotable.length >= 5, 5, 'At least 5 sentences make sense on their own', `${quotable.length} found`),
        check(quotable.length >= 3, 4, 'At least 3 sentences make sense on their own', '')
      ], {
        good: cap('These would survive being quoted.', quotable.slice(0, 4).map(quoteOf).join('\n')),
        bad: cap('Little here survives being quoted.', 'A sentence that needs the previous sentence, or needs the picture, cannot be lifted into an answer.')
      }),
      group('Citable specifics', JUDGE_SRC, [
        check(facts.length >= 5, 4, 'At least 5 spoken facts carry a number, date or name', `${facts.length} found`),
        check(facts.length >= 2, 4, 'At least 2 spoken facts carry a number, date or name', '')
      ], {
        good: cap('Specifics an engine can cite.', facts.slice(0, 4).map(quoteOf).join('\n')),
        bad: cap('Nothing specific enough to cite.', 'An engine quotes numbers, dates, names and prices. General statements do not get picked up.')
      }),
      group('Things are named', JUDGE_SRC, [
        check(o.entitiesNamed?.pass, 5, 'Products, people and places are named, not pointed at', o.entitiesNamed?.why || '')
      ], {
        good: cap('The speaker names things in words.', quoteOf(o.entitiesNamed)),
        bad: cap('The words depend on the picture.', o.entitiesNamed?.why || '"this", "it" and "that one" carry the meaning, so the transcript loses it')
      }),
      group('The opening gets to it', JUDGE_SRC, [
        check(o.coverageStated?.pass, 4, 'The video says early what it will cover', o.coverageStated?.why || ''),
        check(o.substanceStartsAtSeconds >= 0 && o.substanceStartsAtSeconds <= startBar, 4, `Content starts within ${fmt(startBar)}`, o.substanceStartsAtSeconds >= 0 ? `starts at ${fmt(o.substanceStartsAtSeconds)} of ${fmt(dur)}` : '')
      ], {
        good: cap('The opening sets up what follows.', quoteOf(o.coverageStated)),
        bad: cap('The opening delays the content.', o.substanceStartsAtSeconds > startBar ? `Content starts at ${fmt(o.substanceStartsAtSeconds)} of ${fmt(dur)}.` : (o.coverageStated?.why || 'the opening does not say what is coming'))
      })
    ];

    // ---- D4 delivery and authority ----
    const d4 = [
      group('Format and length', STUDY, [
        check(dur > 180, 4, 'Long form, not a Short', `${fmt(dur)} long`),
        check(dur >= 480 && dur <= 1200, 3, 'In the length band that gets cited most (8 to 20 min)', '')
      ], {
        good: cap('Length works for citation.', `duration ${fmt(dur)}`),
        bad: cap('Length works against citation.', dur <= 60 ? `A Short at ${fmt(dur)}. Shorts take 5.7% of AI citations.` : `${fmt(dur)} sits outside the 8 to 20 minute band that is cited most.`)
      }),
      group('Spoken structure', JUDGE_SRC, [
        check(sections.length >= 3, 5, 'The talk has at least 3 signposted sections', `${sections.length} sections`),
        check(o.signposting?.pass, 5, 'Transitions are marked out loud', o.signposting?.why || '')
      ], {
        good: cap('The speaker marks where each part begins.', sections.slice(0, 8).map(s => `${s.at}  ${s.title}`).join('\n') || quoteOf(o.signposting)),
        bad: cap('The talk runs on without marked parts.', o.signposting?.why || 'no spoken transitions found')
      }),
      group('Who is speaking', JUDGE_SRC, [
        check(o.speakerIdentified?.pass, 4, 'The speaker or organisation is named', o.speakerIdentified?.why || '')
      ], {
        good: cap('The voice has a name on it.', quoteOf(o.speakerIdentified)),
        bad: cap('No one is named.', o.speakerIdentified?.why || 'nobody is identified in speech or on screen')
      }),
      group('Sources named out loud', JUDGE_SRC, [
        check(sources.length >= 3, 3, 'At least 3 sources are named or shown', `${sources.length} found`),
        check(sources.length >= 1, 2, 'At least one source is named or shown', '')
      ], {
        good: cap('Claims point somewhere.', sources.slice(0, 4).map(quoteOf).join('\n')),
        bad: cap('Claims point nowhere.', 'Nothing in the video names a study, document or original an engine could follow.')
      }),
      group('Still true', JUDGE_SRC, [
        check(!o.staleClaim?.pass, 3, 'No claim has gone out of date', o.staleClaim?.pass ? 'a dated claim is likely wrong now' : '')
      ], {
        good: cap('Nothing has obviously expired.', (o.datedClaims || []).slice(0, 3).map(quoteOf).join('\n') || 'no dated claims found'),
        bad: cap('A claim has expired.', quoteOf(o.staleClaim))
      })
    ];

    const result = {
      url,
      kind: 'youtube',
      fetchedAt: Date.now(),
      dimensions: [
        dim(1, 'Title, Description & Eligibility', 'd1', d1),
        dim(2, 'Chapters & Key Moments', 'd2', d2),
        dim(3, 'Answerability & Depth', 'd3', d3),
        dim(4, 'Delivery & Authority', 'd4', d4)
      ],
      redirects: [],
      fetchWarnings: [],
      observed: o,
      metadataSeen: meta,
      knownTitle: title,
      bars: { answerBy: ansBar, startBy: startBar },
      measure: { jsHeavy: false, substantiveChars: 0, url }
    };
    finalize(result, o);
    return result;
  }

  function dim(num, title, key, breakdown) {
    return { num, key, title, weight: Math.round(WEIGHTS[key] * 100) + '%', breakdown };
  }

  function finalize(r, o) {
    let seen = 0, possible = 0, official = 0;
    r.dimensions.forEach(d => {
      const live = d.breakdown.filter(g => g.assessed !== false);
      const raw = live.reduce((s, g) => s + g.points, 0);
      const max = live.reduce((s, g) => s + g.max, 0);
      d.rawScore = max ? Math.round(raw / max * 100) : 0;
      d.score = Math.min(d.rawScore, SCORE_CAP);
      d.capped = d.rawScore > SCORE_CAP;
      d.assessedPoints = max;
      seen += max;
      possible += d.breakdown.reduce((s, g) => s + g.max, 0);
      official += d.breakdown.filter(g => g.src === GOOGLE).reduce((s, g) => s + g.max, 0);
    });
    r.assessedPoints = seen;
    r.totalPoints = possible;
    r.officialPoints = official;
    // A dimension with nothing assessed is not a dimension that scored nothing. It leaves the
    // average entirely and the remaining weights are shared out, so a video whose metadata could
    // not be read is not marked down 30 points for something nobody looked at.
    const live = r.dimensions.filter(d => d.assessedPoints > 0);
    const weight = live.reduce((s, d) => s + WEIGHTS[d.key], 0);
    r.overallScore = weight
      ? Math.min(Math.round(live.reduce((s, d) => s + d.score * WEIGHTS[d.key], 0) / weight), SCORE_CAP)
      : 0;
    r.unscoredDimensions = r.dimensions.filter(d => d.assessedPoints === 0).map(d => d.title);
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

  return { OBS_SCHEMA, prompt, build, normalize, fmt, WEIGHTS, GOOGLE, STUDY, JUDGE_SRC };
})();

// Realistic sample data for Samsung Life Insurance diagnostic
const SAMPLE_DATA = {
  url: "https://www.samsunglife.com",
  timestamp: "2026-03-26T14:32:00+09:00",
  pagesScanned: 27,
  overallScore: 38,
  status: "red",
  headline: "Structurally limited for AI discovery and citation",
  statusLabel: "Needs Significant Improvement",
  strengths: [
    "Basic product category structure exists across major insurance lines",
    "Corporate disclosure and policy pages are present",
    "Some FAQ content detected on select product pages"
  ],
  weaknesses: [
    "URL structure is system-code based, not semantically meaningful",
    "Body text is insufficient for AI interpretation on most pages",
    "Trust and expertise signals are fragmented and incomplete"
  ],

  dimensions: [
    {
      id: "semantic-ia",
      num: "01",
      title: "Semantic IA & URL Structure",
      score: 32,
      status: "red",
      diagnosis: "URL paths rely on system codes and numeric identifiers rather than semantic topic labels. The information architecture groups content by internal product codes, not by customer-meaningful topics.",
      weaknesses: [
        "URLs contain /products/PD_001/ style codes instead of /life-insurance/whole-life/",
        "Key page types (FAQ, guides) are buried under non-semantic paths",
        "Topic relationships are unclear from URL structure alone",
        "Similar product information is fragmented across multiple system-coded pages"
      ],
      direction: "Restructure URL paths around customer-meaningful topic labels and ensure key content types are discoverable through semantic paths."
    },
    {
      id: "structured-info",
      num: "02",
      title: "Structured Information",
      score: 41,
      status: "yellow",
      diagnosis: "Many pages lack clear heading hierarchies. Content is delivered through visual cards and banner modules rather than structured document-style sections with H1/H2/H3 organization.",
      weaknesses: [
        "Product pages use card-based UI with limited heading structure",
        "Multiple H1 tags or missing H1 detected on several pages",
        "Information priority is unclear within pages — flat layout with minimal sectioning",
        "Key details embedded in interactive UI modules rather than structured paragraphs"
      ],
      direction: "Introduce clear H1 → H2 → H3 heading hierarchies with descriptive section labels on all major content pages."
    },
    {
      id: "text-sufficiency",
      num: "03",
      title: "Sufficient Text-based Information",
      score: 29,
      status: "red",
      diagnosis: "Critical product and service information is delivered through images, infographics, and PDF downloads rather than accessible HTML text. Body text is too limited for reliable AI citation.",
      weaknesses: [
        "Product benefit explanations are image-based with minimal text fallbacks",
        "Key terms and conditions exist only in downloadable PDF documents",
        "Average visible body text per page is below citation-friendly thresholds",
        "Comparison and explanatory content is nearly absent"
      ],
      direction: "Expand key information into HTML text blocks with explanatory paragraphs, definitions, comparisons, and structured FAQ content."
    },
    {
      id: "eeat",
      num: "04",
      title: "E-E-A-T Content",
      score: 44,
      status: "yellow",
      diagnosis: "Some trust signals exist through corporate disclosures and regulatory compliance, but experience, expertise, and authority-building content is limited. AI systems may struggle to identify this site as a credible authority.",
      weaknesses: [
        "No customer testimonials, case studies, or experience-based content detected",
        "Educational or explanatory guides are absent for major product categories",
        "External authority indicators (awards, certifications, ratings) are not prominently structured",
        "FAQ content is thin and not comprehensive across product lines"
      ],
      direction: "Build a content ecosystem that covers experience stories, expert guides, authority evidence, and comprehensive trust documentation across all major product areas."
    }
  ],

  issues: [
    {
      title: "Non-semantic System-code URLs",
      severity: "high",
      description: "URL paths use internal system identifiers (MDP-, PDK-, PDP- codes) instead of human-readable topic labels, making it difficult for AI systems to understand page context from URLs alone.",
      affectedPages: 22,
      example: "https://www.samsunglife.com/individual/products/insurance/main/MDP-PRINP010000M",
      geoImpact: "AI systems use URL semantics as a strong signal for topic classification and citation relevance. System-code URLs provide no semantic value."
    },
    {
      title: "Insufficient Heading Structure",
      severity: "high",
      description: "Most product and service pages lack proper H1/H2/H3 hierarchies. Content is organized through visual design elements rather than semantic HTML structure.",
      affectedPages: 18,
      example: "https://www.samsunglife.com/individual/products/insurance/main/MDP-PRINP020000M",
      geoImpact: "AI relies on heading hierarchy to understand information structure and extract key topics. Without clear headings, content priority is ambiguous."
    },
    {
      title: "Image-dependent Information",
      severity: "high",
      description: "Key product benefits, feature comparisons, and process explanations are delivered as images or infographics without text alternatives or HTML-based equivalents.",
      affectedPages: 15,
      example: "https://direct.samsunglife.com/whole.eds",
      geoImpact: "AI systems cannot reliably extract or cite information locked in image formats. This content becomes invisible to AI-powered discovery."
    },
    {
      title: "PDF/Document-heavy Information",
      severity: "medium",
      description: "Important terms, conditions, and detailed product information is only available through downloadable PDF documents rather than on-page HTML content.",
      affectedPages: 12,
      example: "https://www.samsunglife.com/individual/cs/guide/MDP-CURDO010100M",
      geoImpact: "PDF-dependent content is harder for AI to discover, index, and cite compared to well-structured HTML content on the page itself."
    },
    {
      title: "Weak Semantic IA",
      severity: "medium",
      description: "The information architecture groups content by internal business categories rather than customer-meaningful topics. Related content is not well-connected.",
      affectedPages: 20,
      example: "https://www.samsunglife.com/individual/cs/location/MDP-CUBRF010100M",
      geoImpact: "AI systems struggle to map topic relationships when the IA doesn't reflect natural information-seeking patterns."
    },
    {
      title: "Lack of FAQ & Explanatory Content",
      severity: "medium",
      description: "Comprehensive FAQ sections and explanatory content covering common questions, product comparisons, and decision-support information are largely absent.",
      affectedPages: 24,
      example: "https://www.samsunglife.com/individual/cs/faq/MDP-CUOAQ010000M",
      geoImpact: "FAQ and explanatory content is among the highest-cited content types in AI responses. Its absence significantly reduces citation likelihood."
    },
    {
      title: "Weak E-E-A-T Signal Coverage",
      severity: "medium",
      description: "Trust-building content like customer stories, expert credentials, industry awards, and comprehensive policy explanations are limited or poorly structured.",
      affectedPages: 27,
      example: "https://www.samsunglife.com/individual/display/intro/PDK-MAMAI000000M",
      geoImpact: "AI systems evaluate authority and trust signals when selecting sources for citation. Weak E-E-A-T signals reduce source credibility scores."
    },
    {
      title: "Fragmented Topic Architecture",
      severity: "low",
      description: "Related product and service information is spread across multiple pages without clear canonical or representative pages for key topics.",
      affectedPages: 10,
      example: "https://direct.samsunglife.com/health.eds",
      geoImpact: "When information is fragmented, AI may not assemble a complete picture of a topic, reducing the site's value as a citation source."
    }
  ],

  eeat: {
    experience: {
      score: 25,
      status: "red",
      signals: {
        found: ["Basic customer service contact page"],
        missing: ["Customer testimonials", "Case studies", "Use case scenarios", "Customer stories", "Before/after examples"]
      },
      working: "A customer service contact page exists with phone and email information.",
      missing_detail: "No real customer experiences, testimonials, or scenario-based content that demonstrates practical product value from a customer perspective.",
      recommendation: "Add customer story sections, real-world insurance scenarios, and testimonial content to major product pages."
    },
    expertise: {
      score: 38,
      status: "red",
      signals: {
        found: ["Product category pages", "Basic product descriptions"],
        missing: ["In-depth guides", "Comparison content", "Glossary/definitions", "Educational articles", "Expert commentary"]
      },
      working: "Product pages exist with basic descriptions of insurance products and their key features.",
      missing_detail: "No educational guides, comparison tools, glossary of insurance terms, or expert-level explanatory content that demonstrates deep domain knowledge.",
      recommendation: "Create comprehensive product guides, insurance term glossaries, comparison pages, and educational content for each major product category."
    },
    authoritativeness: {
      score: 48,
      status: "yellow",
      signals: {
        found: ["Corporate information page", "Financial disclosures", "Regulatory compliance pages"],
        missing: ["Industry awards/rankings", "External certifications", "Third-party ratings", "Expert citations", "Media mentions"]
      },
      working: "Corporate profile and regulatory compliance documentation are available, providing a foundation of institutional credibility.",
      missing_detail: "External authority signals such as industry awards, credit ratings, third-party evaluations, and expert endorsements are not prominently featured or structured.",
      recommendation: "Add structured sections for awards, ratings, certifications, and external recognitions. Include cited statistics and third-party validation."
    },
    trust: {
      score: 58,
      status: "yellow",
      signals: {
        found: ["Privacy policy", "Terms of service", "Disclosure pages", "Contact information", "Customer service page"],
        missing: ["Comprehensive FAQ", "Complaint resolution process", "Data handling explanation", "Editorial/review process", "Content update dates"]
      },
      working: "Essential trust documents including privacy policy, terms, and disclosure pages are present. Customer service contact information is available.",
      missing_detail: "FAQ content is thin and not comprehensive. No visible content update dates, editorial process documentation, or detailed complaint resolution information.",
      recommendation: "Expand FAQ coverage across all products, add visible update dates to all content pages, and create a transparent complaint resolution page."
    }
  },

  pages: [
    {
      title: "삼성생명 — 홈",
      url: "https://www.samsunglife.com/",
      type: "Home",
      geoScore: 42,
      scores: { ia: 45, heading: 38, text: 35, eeat: 50 },
      issues: ["Weak headings", "Image-heavy"],
      headings: [
        { tag: "H1", text: "Samsung Life Insurance" },
        { tag: "H2", text: "Our Products" },
        { tag: "H2", text: "Customer Service" },
        { tag: "H2", text: "News & Announcements" }
      ],
      textPreview: "Samsung Life Insurance offers comprehensive life insurance, retirement, and savings products. Founded in 1957, we are one of Korea's leading insurance providers...",
      eeatSignals: ["Corporate info present", "Contact available"],
      issueDetails: ["Hero section is image-based with minimal text", "Product links use system-code URLs", "No FAQ or guide links from homepage"],
      actions: ["Add text-based value proposition content", "Link to FAQ and guide pages", "Restructure product navigation with semantic labels"]
    },
    {
      title: "보장보험 (종신·정기)",
      url: "https://www.samsunglife.com/individual/products/insurance/main/MDP-PRINP010000M",
      type: "Product",
      geoScore: 28,
      scores: { ia: 20, heading: 30, text: 22, eeat: 35 },
      issues: ["System-code URL", "Low text", "No FAQ"],
      headings: [
        { tag: "H1", text: "보장보험" },
        { tag: "H2", text: "Product Overview" }
      ],
      textPreview: "Protect your family's future with Samsung Life's whole life insurance. Coverage that lasts a lifetime with guaranteed benefits...",
      eeatSignals: ["Basic product info"],
      issueDetails: ["URL contains system code (MDP-PRINP010000M)", "Product details are image-based", "No comparison or explanatory text", "Terms only in PDF", "Missing FAQ section"],
      actions: ["Rewrite URL to /life-insurance/whole-life/", "Add HTML text for all product benefits", "Create comprehensive FAQ section", "Add comparison with other products"]
    },
    {
      title: "종신보험 (Direct)",
      url: "https://direct.samsunglife.com/whole.eds",
      type: "Product",
      geoScore: 30,
      scores: { ia: 22, heading: 35, text: 25, eeat: 38 },
      issues: ["System-code URL", "Low text", "Image-dependent"],
      headings: [
        { tag: "H1", text: "종신보험" },
        { tag: "H2", text: "Plan Options" },
        { tag: "H2", text: "How to Apply" }
      ],
      textPreview: "Affordable protection for a specific period. Choose coverage terms from 10 to 30 years with flexible premium options...",
      eeatSignals: ["Basic product info", "Application process described"],
      issueDetails: ["URL path (.eds extension) is non-semantic", "Premium comparison is image-only", "Benefit details in downloadable PDF", "No customer scenario examples"],
      actions: ["Convert to semantic URL", "Replace image-based comparisons with HTML tables", "Extract PDF content to on-page text", "Add real-world scenarios"]
    },
    {
      title: "연금·저축보험",
      url: "https://www.samsunglife.com/individual/products/insurance/main/MDP-PRINP030000M",
      type: "Product",
      geoScore: 26,
      scores: { ia: 18, heading: 28, text: 20, eeat: 32 },
      issues: ["System-code URL", "Very low text", "PDF-dependent"],
      headings: [
        { tag: "H1", text: "연금·저축보험" }
      ],
      textPreview: "Secure your retirement with Samsung Life's pension products. Multiple plan options available for your retirement goals...",
      eeatSignals: ["Product category exists"],
      issueDetails: ["URL contains system code (MDP-PRINP030000M)", "Almost all details in PDF brochure", "No retirement planning guide", "No comparison tools", "No calculator explanations in text"],
      actions: ["Build comprehensive retirement guide content", "Add HTML text for all pension details", "Create retirement FAQ", "Add planning scenario examples"]
    },
    {
      title: "건강보험",
      url: "https://www.samsunglife.com/individual/products/insurance/main/MDP-PRINP020000M",
      type: "Product",
      geoScore: 31,
      scores: { ia: 25, heading: 32, text: 28, eeat: 40 },
      issues: ["System-code URL", "Low text", "Weak headings"],
      headings: [
        { tag: "H1", text: "건강보험" },
        { tag: "H2", text: "Coverage Details" },
        { tag: "H2", text: "Benefits" }
      ],
      textPreview: "Comprehensive health coverage for you and your family. Medical expense coverage, hospitalization benefits, and surgical benefits...",
      eeatSignals: ["Coverage details partially described", "Contact info available"],
      issueDetails: ["URL contains system code (MDP-PRINP020000M)", "Coverage details are card-based without structure", "No health insurance guide or glossary", "No FAQ about claims process"],
      actions: ["Add structured coverage comparison tables", "Create health insurance buyer's guide", "Add claims process FAQ", "Include glossary of health insurance terms"]
    },
    {
      title: "어린이보험",
      url: "https://www.samsunglife.com/individual/products/insurance/main/MDP-PRINP040000M",
      type: "Product",
      geoScore: 25,
      scores: { ia: 20, heading: 25, text: 18, eeat: 30 },
      issues: ["System-code URL", "Very low text", "Image-dependent"],
      headings: [
        { tag: "H1", text: "어린이보험" }
      ],
      textPreview: "Build your savings with guaranteed returns. Samsung Life savings products offer stable growth for your financial goals...",
      eeatSignals: ["Basic product exists"],
      issueDetails: ["URL contains system code (MDP-PRINP040000M)", "Product details in visual cards only", "No savings strategy content", "No interest rate explanations"],
      actions: ["Build out page with H2/H3 content sections", "Add text-based product details", "Create savings planning guide", "Add comparison content"]
    },
    {
      title: "고객 서비스 센터",
      url: "https://www.samsunglife.com/individual/cs/location/MDP-CUBRF010100M",
      type: "Help/Support",
      geoScore: 40,
      scores: { ia: 30, heading: 42, text: 38, eeat: 52 },
      issues: ["System-code URL", "Limited FAQ"],
      headings: [
        { tag: "H1", text: "Customer Service" },
        { tag: "H2", text: "Contact Us" },
        { tag: "H2", text: "Branch Locations" },
        { tag: "H2", text: "FAQ" }
      ],
      textPreview: "Need help? Contact Samsung Life customer service through phone, email, or visit our branches. Our dedicated team is ready to assist you...",
      eeatSignals: ["Contact info", "Branch info", "Basic FAQ"],
      issueDetails: ["URL contains system code (MDP-CUBRF010100M)", "FAQ section is limited to 5-6 generic questions", "No detailed claims process guide", "No policy management instructions"],
      actions: ["Expand FAQ to 50+ questions across all product lines", "Add step-by-step process guides", "Create dedicated help articles for common tasks"]
    },
    {
      title: "회사소개",
      url: "https://www.samsunglife.com/individual/display/intro/PDK-MAMAI000000M",
      type: "About",
      geoScore: 48,
      scores: { ia: 50, heading: 45, text: 42, eeat: 55 },
      issues: ["Limited authority content"],
      headings: [
        { tag: "H1", text: "About Samsung Life Insurance" },
        { tag: "H2", text: "Company Overview" },
        { tag: "H2", text: "History" },
        { tag: "H2", text: "Management" },
        { tag: "H2", text: "Social Responsibility" }
      ],
      textPreview: "Samsung Life Insurance, established in 1957, is one of Korea's most trusted insurance companies. With decades of experience and a commitment to financial security...",
      eeatSignals: ["Company history", "Management info", "CSR content"],
      issueDetails: ["URL contains system code (PDK-MAMAI000000M)", "No awards or industry ranking information", "No financial strength ratings", "External validation signals absent"],
      actions: ["Add financial strength ratings section", "Include industry awards and recognitions", "Add cited statistics and milestones"]
    },
    {
      title: "자주 묻는 질문 (FAQ)",
      url: "https://www.samsunglife.com/individual/cs/faq/MDP-CUOAQ010000M",
      type: "FAQ",
      geoScore: 45,
      scores: { ia: 35, heading: 48, text: 50, eeat: 48 },
      issues: ["System-code URL", "Thin coverage"],
      headings: [
        { tag: "H1", text: "Frequently Asked Questions" },
        { tag: "H2", text: "General Questions" },
        { tag: "H2", text: "Product Questions" },
        { tag: "H2", text: "Claims" }
      ],
      textPreview: "Find answers to common questions about Samsung Life Insurance products, services, claims, and more. Browse by category or search for specific topics...",
      eeatSignals: ["FAQ structure exists", "Category organization"],
      issueDetails: ["URL contains system code (MDP-CUOAQ010000M)", "Only ~15 questions total across all categories", "No product-specific FAQ pages", "Answers are brief (1-2 sentences)"],
      actions: ["Expand to 100+ questions", "Create per-product FAQ pages", "Write comprehensive multi-paragraph answers", "Add structured data markup"]
    },
    {
      title: "개인정보처리방침",
      url: "https://family.samsunglife.com/pc/privacy/withCrePrivacy.html",
      type: "Policy",
      geoScore: 55,
      scores: { ia: 55, heading: 58, text: 55, eeat: 52 },
      issues: ["Could be more structured"],
      headings: [
        { tag: "H1", text: "Privacy Policy" },
        { tag: "H2", text: "Information Collection" },
        { tag: "H2", text: "Use of Information" },
        { tag: "H2", text: "Data Protection" },
        { tag: "H2", text: "Your Rights" },
        { tag: "H2", text: "Contact" }
      ],
      textPreview: "Samsung Life Insurance is committed to protecting your personal information. This policy explains how we collect, use, and safeguard your data...",
      eeatSignals: ["Privacy policy present", "Structured sections", "Contact info"],
      issueDetails: ["Hosted on separate subdomain (family.samsunglife.com)", "No last-updated date visible", "No version history"],
      actions: ["Add visible last-updated date", "Add version history section", "Improve plain-language summaries"]
    },
    {
      title: "건강보험 (Direct)",
      url: "https://direct.samsunglife.com/health.eds",
      type: "Product",
      geoScore: 27,
      scores: { ia: 20, heading: 28, text: 22, eeat: 32 },
      issues: ["System-code URL", "Low text", "Image-heavy"],
      headings: [
        { tag: "H1", text: "건강보험" },
        { tag: "H2", text: "Coverage" }
      ],
      textPreview: "Protect your child's future with comprehensive coverage. Samsung Life child insurance provides security from birth through adulthood...",
      eeatSignals: ["Basic product info"],
      issueDetails: ["URL path uses .eds extension — non-semantic", "Coverage details in infographic format only", "No parenting/planning scenario content", "No comparison with similar products"],
      actions: ["Add HTML coverage details", "Create child insurance planning guide", "Add comparison tables", "Write scenario-based content"]
    },
    {
      title: "보험금 청구 안내",
      url: "https://www.samsunglife.com/individual/cs/guide/MDP-CURDO010100M",
      type: "Help/Support",
      geoScore: 38,
      scores: { ia: 28, heading: 40, text: 35, eeat: 48 },
      issues: ["System-code URL", "Incomplete text"],
      headings: [
        { tag: "H1", text: "Insurance Claims" },
        { tag: "H2", text: "How to File a Claim" },
        { tag: "H2", text: "Required Documents" },
        { tag: "H2", text: "Processing Time" }
      ],
      textPreview: "File your insurance claim easily with Samsung Life. Follow our step-by-step process to submit your claim and receive your benefits...",
      eeatSignals: ["Process documentation", "Step-by-step guide"],
      issueDetails: ["URL contains system code (MDP-CURDO010100M)", "Document requirements are in downloadable PDF", "No claim status tracking explanation", "No common claim scenarios or examples"],
      actions: ["Convert all PDF content to on-page HTML", "Add common claim scenarios", "Expand step-by-step instructions", "Add FAQ for claims"]
    }
  ],

  actions: {
    p1: [
      {
        title: "Replace system-code URLs with semantic topic-based URLs",
        dimension: "Semantic IA & URL Structure",
        problem: "22 of 27 pages use system-code URL paths like /products/PD_001/view that provide no semantic meaning to AI systems or users.",
        impact: "High",
        difficulty: "Hard",
        relevance: "URL semantics are a primary signal AI systems use for topic classification and source evaluation.",
        pages: "All product, FAQ, and service pages",
        example: "Change /products/PD_001/view?ctg=L001 → /life-insurance/whole-life/ and /customer/faq/list?type=F001 → /help/faq/"
      },
      {
        title: "Add H1/H2/H3-led content structure to all major pages",
        dimension: "Structured Information",
        problem: "18 pages lack proper heading hierarchy, with content delivered through visual card layouts rather than structured document sections.",
        impact: "High",
        difficulty: "Medium",
        relevance: "Heading structure is how AI systems parse page topics and extract key information segments for citation.",
        pages: "All product and service pages",
        example: "Each product page should have: H1 (Product Name) → H2 (Overview, Key Benefits, Coverage Details, Eligibility, FAQ) → H3 (specific subsections)"
      },
      {
        title: "Expand key product information into HTML text blocks",
        dimension: "Sufficient Text-based Information",
        problem: "Product benefits, comparisons, and key details exist only as images or PDF downloads. AI systems cannot extract or cite this information.",
        impact: "High",
        difficulty: "Medium",
        relevance: "Text content is the primary material AI systems use for generating citations and recommendations.",
        pages: "All product pages (8 pages)",
        example: "Convert the image-based 'Benefits Overview' into structured HTML sections with descriptive paragraphs, comparison tables, and definition lists."
      }
    ],
    p2: [
      {
        title: "Add comprehensive FAQ sections to all major product pages",
        dimension: "E-E-A-T Content / Text Sufficiency",
        problem: "Only one generic FAQ page exists with ~15 questions. Individual product pages have no FAQ content.",
        impact: "High",
        difficulty: "Medium",
        relevance: "FAQ content is the most frequently cited content type in AI-generated responses. Comprehensive FAQs dramatically increase citation probability.",
        pages: "All product pages, claims page, service page",
        example: "Each product page should include 15-20 product-specific questions covering: What is it? Who needs it? How much does it cost? What's covered? How do I claim?"
      },
      {
        title: "Convert PDF-only information to on-page HTML content",
        dimension: "Sufficient Text-based Information",
        problem: "Terms, conditions, detailed product specs, and claims documents are only available as PDF downloads, making them invisible to AI systems.",
        impact: "Medium",
        difficulty: "Medium",
        relevance: "On-page HTML content is far more accessible to AI systems than downloadable documents. Key information should exist in both formats.",
        pages: "12 pages with PDF-dependent content",
        example: "Extract key terms and conditions summaries from PDFs and present them as structured HTML sections with clear headings on the relevant product pages."
      },
      {
        title: "Create representative guide pages for major insurance topics",
        dimension: "Semantic IA & URL Structure / E-E-A-T",
        problem: "No educational or guide content exists. Users and AI systems cannot find comprehensive topic overviews for major insurance categories.",
        impact: "High",
        difficulty: "Hard",
        relevance: "Authoritative guide pages serve as canonical references that AI systems prefer to cite for informational queries.",
        pages: "New pages needed for each product category",
        example: "Create /guides/life-insurance/ with comprehensive explanation of life insurance types, considerations, comparison tables, and links to specific products."
      },
      {
        title: "Add customer experience and testimonial content",
        dimension: "E-E-A-T Content (Experience)",
        problem: "Zero customer testimonials, case studies, or experience-based content exists anywhere on the site.",
        impact: "Medium",
        difficulty: "Medium",
        relevance: "Experience signals help AI systems evaluate real-world relevance and trustworthiness of products and services.",
        pages: "Product pages, new testimonial/story pages",
        example: "Add a 'Customer Stories' section to each product page with 2-3 anonymized scenarios showing how the insurance product provided value."
      }
    ],
    p3: [
      {
        title: "Build a standardized GEO-ready content template",
        dimension: "All Dimensions",
        problem: "There is no consistent content structure across pages. Each page is structured differently, making systematic improvement difficult.",
        impact: "High",
        difficulty: "Hard",
        relevance: "A standardized template ensures all new and updated content meets GEO readiness standards consistently.",
        pages: "All pages (template for future use)",
        example: "Template sections: H1 Title → H2 Overview paragraph → H2 Key Features (structured list) → H2 Detailed Explanation → H2 Comparison → H2 FAQ → H2 Related Resources → Trust footer"
      },
      {
        title: "Add authority and credibility evidence across the site",
        dimension: "E-E-A-T Content (Authoritativeness)",
        problem: "External authority signals like industry rankings, financial strength ratings, awards, and third-party validations are not structured or prominent.",
        impact: "Medium",
        difficulty: "Easy",
        relevance: "AI systems weigh authority signals when determining source credibility for financial product citations.",
        pages: "About page, product pages, footer",
        example: "Create a structured 'Awards & Recognition' section and add financial strength rating badges to relevant pages. Include cited statistics about market position."
      },
      {
        title: "Implement content freshness signals across all pages",
        dimension: "E-E-A-T Content (Trust)",
        problem: "No visible content update dates, version history, or editorial process documentation exists on any page.",
        impact: "Medium",
        difficulty: "Easy",
        relevance: "Content freshness is a trust signal AI systems use to evaluate whether information is current and reliable.",
        pages: "All content pages",
        example: "Add 'Last updated: March 2026' to all content pages, include version notes for policy pages, and add an editorial standards page."
      }
    ]
  }
};

// Insight messages for loading animation
const LOADING_INSIGHTS = [
  { text: "Multiple system-code URLs detected", color: "red", step: 2 },
  { text: "FAQ page found — content coverage is limited", color: "yellow", step: 3 },
  { text: "Key information appears image-dependent", color: "red", step: 4 },
  { text: "Limited explanatory body text detected", color: "red", step: 4 },
  { text: "Document/PDF-heavy information structure identified", color: "yellow", step: 5 },
  { text: "Corporate disclosure pages are present", color: "green", step: 7 },
  { text: "Heading hierarchy is weak on most product pages", color: "red", step: 5 },
  { text: "Customer testimonial content not detected", color: "yellow", step: 7 },
  { text: "Basic product category structure exists", color: "green", step: 3 },
  { text: "Trust documentation partially available", color: "blue", step: 7 }
];

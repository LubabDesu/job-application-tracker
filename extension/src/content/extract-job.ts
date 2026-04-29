import type { DetectedJob } from "../shared/types";

export function extractJobFromPage(): Partial<DetectedJob> | null {
    return extractFromLdJson() ?? extractFromDom();
}

type JsonObject = Record<string, unknown>;

// this function extracts from script[type="application/ld+json -- more reliable as companies use these for SEO, esp those using third party websites
function extractFromLdJson(): Partial<DetectedJob> | null {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
        if (!script.textContent) continue;

        let parsed: unknown;
        try {
            parsed = JSON.parse(script.textContent);
        } catch {
            continue;
        }

        const postings = findJobPostings(parsed);

        for (const ld of postings) {
            // get role
            const identifier = asObject(ld["identifier"]);
            const role =
                cleanText(typeof ld["title"] === "string" ? ld["title"] : "") ||
                cleanText(typeof identifier?.["name"] === "string" ? identifier["name"] : "");
            if (!isValidStructuredRole(role)) continue;

            // get company
            const org = asObject(ld["hiringOrganization"]);
            const orgName = typeof org?.["name"] === "string" ? org["name"] : undefined;
            const company = extractCompany(orgName);

            // get jd
            const jdText =
                typeof ld["description"] === "string" ? stripHtml(ld["description"]) : "";

            return { role, company, jdText, url: window.location.href };
        }
    }

    return null;
}

function findJobPostings(value: unknown): JsonObject[] {
    if (Array.isArray(value)) {
        return value.flatMap((item) => findJobPostings(item));
    }

    const obj = asObject(value);
    if (!obj) return [];

    const postings = isJobPostingType(obj["@type"]) ? [obj] : [];
    const graph = obj["@graph"];

    return Array.isArray(graph)
        ? [...postings, ...findJobPostings(graph)]
        : postings;
}

function isJobPostingType(type: unknown): boolean {
    if (typeof type === "string") return type === "JobPosting";
    if (Array.isArray(type)) return type.includes("JobPosting");
    return false;
}

function asObject(value: unknown): JsonObject | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as JsonObject)
        : null;
}

const ROLE_SELECTORS = [
    "#job-details-container h1",
    "#job-details-container .tds-text--h1-alt",
    "#job-details-container .tds-text--h1",
    "[id*='job-detail' i] h1",
    "[class*='job-detail' i] h1",
    "[data-testid*='job-detail' i] h1",
    "[data-testid*='job-detail' i] h2",
    "main [class*='job-detail' i] h1",
    "main [class*='job-detail' i] h2",
    '[data-automation-id="jobPostingHeader"]',
    '[data-automation-id="jobTitle"]',
    '[data-automation-id="job-title"]',
    '[data-testid="job-title"]',
    '[data-testid="jobTitle"]',
    '[data-testid="job-detail-title"]',
    '[data-test="job-title"]',
    '[data-qa="job-title"]',
    '[data-qa="job-title-heading"]',
    '[data-qa="job-detail-title"]',
    "[data-job-title]",
    '[aria-label="job title"]',
    '[itemprop="title"]',
    ".job-detail-title",
    ".job-details-title",
    ".job-details__title",
    ".jobDetailTitle",
    ".position-title",
    ".posting-title",
    ".job-title",
    ".job__title",
    ".posting-headline h1",
    ".job-header h1",
    ".job-header__title",
    ".jobs-unified-top-card__job-title",
    ".tds-text--h1-alt",
    ".tds-text--h1",
    "main [class*='job'][class*='title']",
    "main [class*='title'][class*='job']",
    "article [class*='job'][class*='title']",
    "article [class*='title'][class*='job']",
    "main h1",
    "article h1",
    "h1",
] as const;

const JD_SELECTORS = [
    '[data-automation-id="jobPostingDescription"]',
    '[data-automation-id="job-posting-details"]',
    '[data-qa="job-description"]',
    ".ashby-job-posting-brief-description",
    ".job-posting-description",
    ".job-description",
    "#job-description",
    "[data-job-description]",
    '[itemprop="description"]',
    ".description",
    ".content",
] as const;

function extractRole(): string | null {
    const candidates: RoleCandidate[] = [];

    ROLE_SELECTORS.forEach((selector, selectorIndex) => {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
            if (isInsidePageChrome(el)) continue;
            const role = normalizeRoleCandidate(el.textContent ?? "");
            if (!role) continue;
            candidates.push({ selector, selectorIndex, element: el, text: role });
        }
    });

    const best = candidates
        .map((candidate) => ({
            candidate,
            score: scoreRoleCandidate(candidate),
        }))
        .filter(({ score }) => score >= MIN_ROLE_SCORE)
        .sort((a, b) => b.score - a.score || a.candidate.selectorIndex - b.candidate.selectorIndex)[0];

    return best?.candidate.text ?? null;
}

function extractJd(): string {
    for (const selector of JD_SELECTORS) {
        const text = cleanText(document.querySelector(selector)?.textContent ?? "");
        if (text) return text;
    }

    for (const selector of ["main", "article"] as const) {
        const text = cleanText(document.querySelector(selector)?.textContent ?? "");
        if (looksLikeJobDescription(text)) return text;
    }

    return "";
}

function extractFromDom(): Partial<DetectedJob> | null {
    const role = extractRole();
    const jdText = extractJd();
    if (!role && !jdText) return null;
    return {
        role: role ?? "",
        company: extractCompany(),
        jdText,
        url: window.location.href,
    };
}

function companyFromHostname(hostname: string): string {
    // "salesforce.wd12.myworkdayjobs.com" → "Salesforce"
    // watch for ATS subdomains: boards.greenhouse.io, jobs.lever.co
    const isWorkday = hostname.endsWith("myworkdayjobs.com");
    if (isWorkday) {
        const company = hostname.split(".")[0];
        return company.charAt(0).toUpperCase() + company.slice(1);
    }
    if (isSharedAtsHostname(hostname)) return "";

    const parts = hostname.toLowerCase().split(".").filter(Boolean);
    const override = parts.map((part) => COMPANY_NAME_OVERRIDES[part]).find(Boolean);
    if (override) return override;

    const companyPart = [...parts]
        .reverse()
        .find((part) => !HOSTNAME_NOISE_PARTS.has(part));
    return companyPart ? titleCaseSlug(companyPart) : "";
}

function stripHtml(html: string): string {
    // this uses dom parser to strip tags from the json + ld
    // eg : "<p>We're hiring a <strong>Software Engineer</strong>.</p><ul><li>5+ years exp</li></ul>" --> "We're hiring a Software Engineer.5+ years exp"
    // this is to store job desc in the db
    return (
        cleanText(
            new DOMParser()
                .parseFromString(html.replace(/>\s*</g, "> <"), "text/html")
                .body.textContent ?? "",
        )
    );
}

function cleanText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

function normalizeRoleCandidate(text: string): string {
    return cleanText(text)
        .replace(/\s*\|\s*Apply(?:\s+Now)?$/i, "")
        .replace(/\s*-\s*Apply(?:\s+Now)?$/i, "")
        .trim();
}

type RoleCandidate = {
    selector: (typeof ROLE_SELECTORS)[number];
    selectorIndex: number;
    element: Element;
    text: string;
};

const MIN_ROLE_SCORE = 18;

const HARD_JUNK_ROLE_PHRASES = [
    "accessibility",
    "all jobs",
    "already applied",
    "browse jobs",
    "career areas",
    "career site",
    "cookie",
    "create job alert",
    "equal opportunity",
    "follow us",
    "forgot password",
    "home page",
    "skip to main content",
    "skip to main",
    "homepage",
    "job search",
    "main content",
    "menu",
    "navigation",
    "privacy",
    "privacy policy",
    "saved jobs",
    "sign in",
    "sign-in",
    "sign up",
    "search jobs",
    "share this job",
    "talent community",
    "terms of use",
    "view all jobs",
    "view profile",
] as const;

const MARKETING_ROLE_PHRASES = [
    "build your career",
    "career at",
    "careers at",
    "explore careers",
    "join our talent",
    "join our team",
    "join us",
    "life at",
    "our mission",
    "work at",
    "working at",
] as const;

const ROLE_SIGNAL_WORDS = [
    "analyst",
    "architect",
    "associate",
    "consultant",
    "coordinator",
    "designer",
    "developer",
    "director",
    "engineer",
    "frontend",
    "intern",
    "internship",
    "lead",
    "manager",
    "marketing",
    "operator",
    "product",
    "program",
    "project",
    "research",
    "scientist",
    "software",
    "specialist",
    "swe",
    "technician",
] as const;

function isValidStructuredRole(role: string): boolean {
    if (!role) return false;
    if (isExtremeRoleLength(role)) return false;
    if (isHardJunkRole(role)) return false;
    return true;
}

function isUsableRole(role: string): boolean {
    return isValidStructuredRole(role);
}

function isExtremeRoleLength(role: string): boolean {
    return role.length > 180 || role.split(/\s+/).length > 28;
}

function isHardJunkRole(role: string): boolean {
    const lower = role.toLowerCase();
    if (role.split("|").length > 3) return true;
    if ((role.match(/[•|]/g) ?? []).length > 3) return true;
    return HARD_JUNK_ROLE_PHRASES.some((phrase) => hasJunkPhrase(lower, phrase));
}

function scoreRoleCandidate(candidate: RoleCandidate): number {
    const { selector, element, text } = candidate;
    if (isExtremeRoleLength(text) || isHardJunkRole(text)) return Number.NEGATIVE_INFINITY;

    const lower = text.toLowerCase();
    let score = 6;

    if (isJobDetailSelector(selector)) score += 34;
    if (isDataJobTitleSelector(selector)) score += 34;
    if (isClassJobTitleSelector(selector)) score += 26;
    if (isMainOrArticleSelector(selector)) score += 10;

    if (isInsideJobDetailContext(element)) score += 24;
    if (element.closest("main, article, [role='main']")) score += 8;
    if (element.matches("h1")) score += 4;
    if (element.matches("h2")) score += 2;

    const signalCount = ROLE_SIGNAL_WORDS.filter((signal) => hasJunkPhrase(lower, signal)).length;
    score += Math.min(signalCount, 3) * 10;

    const titleCaseWords = text.match(/\b[A-Z][A-Za-z0-9&.'/-]*\b/g) ?? [];
    if (titleCaseWords.length >= 2) score += 8;
    if (/^\d{4}\s+/.test(text)) score += 8;
    if (/\b[A-Z]{2,}\b/.test(text)) score += 4;
    if (text.includes(",")) score += 3;

    const wordCount = text.split(/\s+/).length;
    if (wordCount <= 8) score += 8;
    if (wordCount > 14) score -= (wordCount - 14) * 3;
    if (text.length > 110) score -= Math.ceil((text.length - 110) / 10) * 3;

    if (MARKETING_ROLE_PHRASES.some((phrase) => hasJunkPhrase(lower, phrase))) score -= 80;
    if (/\b(careers?|jobs?)\b/i.test(text) && signalCount === 0) score -= 25;

    return score;
}

function isJobDetailSelector(selector: string): boolean {
    return /job[-_ ]?detail/i.test(selector) || selector.includes("#job-details-container");
}

function isDataJobTitleSelector(selector: string): boolean {
    return /\[data-(?:automation-id|testid|test|qa|job-title)/i.test(selector) ||
        selector.includes("[itemprop=\"title\"]") ||
        selector.includes("[aria-label=\"job title\"]");
}

function isClassJobTitleSelector(selector: string): boolean {
    return /\.(?:job|position|posting)[^,\s]*(?:title|headline)|\.(?:jobDetailTitle)/i.test(selector) ||
        /\[class\*='(?:job|title)'/i.test(selector);
}

function isMainOrArticleSelector(selector: string): boolean {
    return selector.startsWith("main ") || selector.startsWith("article ");
}

function isInsideJobDetailContext(el: Element): boolean {
    return Boolean(el.closest("#job-details-container, [id*='job-detail' i], [class*='job-detail' i], [data-testid*='job-detail' i], [data-qa*='job-detail' i]"));
}

function isInsidePageChrome(el: Element): boolean {
    const chromeContainer = el.closest("nav, header, footer, aside, [role='navigation'], [aria-label*='navigation' i], [class*='nav' i], [class*='menu' i], [class*='cookie' i]");
    const mainContent = el.closest("main, article, [role='main']");
    return Boolean(chromeContainer && !mainContent);
}

function hasJunkPhrase(value: string, phrase: string): boolean {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(value);
}

function looksLikeJobDescription(text: string): boolean {
    if (text.length < 160) return false;
    const lower = text.toLowerCase();
    return [
        "responsibilities",
        "qualifications",
        "requirements",
        "what you'll do",
        "what you will do",
        "about the role",
        "about the team",
    ].some((signal) => lower.includes(signal));
}

// ---------- Parsing the company name! ----------- :( its tough
// plan is to use 4 layers :
// 1. og:site_name which is the DOM meta tag
// 2. ld + json org name
// 3. page title split
// 4. hostname as the last resort
// 5. and of course for weird companies like tiktok (which uses lifeattiktok.com), we shall maintain a mapping for now

function companyFromOgSiteName(): string {
    return sanitizeCompanyName(
        document
            .querySelector('meta[property="og:site_name"]')
            ?.getAttribute("content") ?? "",
    );
}

function companyFromTitle(): string {
    const title = document.title;
    const separator = title.includes("|")
        ? "|"
        : title.includes("–")
          ? "–"
          : title.includes(" - ")
            ? " - "
            : null;
    if (!separator) return "";
    const parts = title.split(separator);
    for (let index = parts.length - 1; index >= 0; index -= 1) {
        const company = sanitizeCompanyName(parts[index] ?? "");
        if (company && !isUsableRole(company)) return company;
    }
    return sanitizeCompanyName(parts[parts.length - 1] ?? "");
}

function extractCompany(orgName?: string): string {
    return (
        sanitizeCompanyName(orgName ?? "") ||
        companyFromOgSiteName() ||
        companyFromTitle() ||
        companyFromHostname(window.location.hostname) ||
        ""
    );
}

function sanitizeCompanyName(value: string): string {
    const name = cleanText(value)
        .replace(/\b(build your|explore|find|search|start your|grow your)\b/gi, " ")
        .replace(/\b(careers?|jobs?|job openings|employment|homepage|official site)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!name) return "";

    const atMatch = name.match(/\bat\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3})\b/);
    if (atMatch?.[1]) return normalizeKnownCompanyName(atMatch[1].trim());

    return normalizeKnownCompanyName(name);
}

function isSharedAtsHostname(hostname: string): boolean {
    return [
        "greenhouse.io",
        "lever.co",
        "ashbyhq.com",
        "workable.com",
        "smartrecruiters.com",
    ].some((sharedHost) => hostname.endsWith(sharedHost));
}

function titleCaseSlug(slug: string): string {
    return slug
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

const HOSTNAME_NOISE_PARTS = new Set([
    "app",
    "boards",
    "career",
    "careers",
    "co",
    "com",
    "corp",
    "global",
    "greenhouse",
    "io",
    "jobs",
    "net",
    "org",
    "www",
]);

const COMPANY_NAME_OVERRIDES: Record<string, string> = {
    bytedance: "ByteDance",
    lifeattiktok: "TikTok",
    tiktok: "TikTok",
    tesla: "Tesla",
};

function normalizeKnownCompanyName(name: string): string {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return COMPANY_NAME_OVERRIDES[normalized] ?? name;
}

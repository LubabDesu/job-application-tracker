import type { DetectedJob } from "../shared/types.js";

// --- Constants ---

const CONFIRMATION_TEXT_PATTERNS = [
    /successfully submitted your application/i,
    /application.*successfully submitted/i,
    /application submitted/i,
    /application.*received/i,
    /thank you for applying/i,
] as const;

// In-memory session state — survives SPA navigation within the same tab
// Single-slot cache: a user can only apply to one job at a time in a tab,
// so URL-keyed lookup is unnecessary and caused cache misses on apply-flow URL variants.
let lastSeenJob: CachedJobData | null = null;
const loggedUrls = new Set<string>();
let jobDetailCached = false;

// Normalize apply-flow URLs back to the job posting URL so the JD cache
// written on the listing page is found again during the application flow.
// e.g. ".../job/foo_JR-123/apply/applyManually?..." → ".../job/foo_JR-123"
function normalizeJobUrl(href: string): string {
    return href.split("/apply/")[0] ?? href;
}

// --- Cache types ---

export interface CachedJobData {
    company: string;
    role: string;
    jdText: string;
    location: string;
}

function isCachedJobData(value: unknown): value is CachedJobData {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v["company"] === "string" &&
        typeof v["role"] === "string" &&
        typeof v["jdText"] === "string" &&
        typeof v["location"] === "string"
    );
}

// --- Discovery helper ---

export function logAutomationIds(): void {
    // no-op in production; retained for test/debug use via direct call
}

// --- DOM helpers (pure, synchronous) ---

export function isJobDetailPage(): boolean {
    // jobPostingPage is confirmed present on all Workday job listing/detail pages
    return (
        document.querySelector('[data-automation-id="jobPostingPage"]') !== null
    );
}

// getCurrentStep reads the DOM directly — no click-counting needed.
// progressBarCompletedStep count + 1 = current step (e.g. 5 completed + active = step 6).
// Returns null when not in the application form.
export function getCurrentStep(): number | null {
    const active = document.querySelector(
        '[data-automation-id="progressBarActiveStep"]',
    );
    if (active === null) return null;
    const completed = document.querySelectorAll(
        '[data-automation-id="progressBarCompletedStep"]',
    );
    return completed.length + 1;
}

export function isConfirmationPage(): boolean {
    // innerText is layout-dependent and unavailable in jsdom; textContent is the reliable fallback
    const bodyText = document.body.innerText ?? document.body.textContent ?? "";
    for (const pattern of CONFIRMATION_TEXT_PATTERNS) {
        if (pattern.test(bodyText)) {
            return true;
        }
    }
    return false;
}

export function scrapeJobDetails(): CachedJobData {
    // jobPostingDescription: confirmed on Salesforce + T-Mobile (most instances)
    // job-posting-details: alternate name seen on some Workday instances
    const jdEl =
        document.querySelector(
            '[data-automation-id="jobPostingDescription"]',
        ) ??
        document.querySelector('[data-automation-id="job-posting-details"]');
    const jdText = jdEl?.textContent?.trim() ?? "";

    // locations: use dd children to skip the "Locations" label text in the container
    const locationEl = document.querySelector(
        '[data-automation-id="locations"]',
    );
    const locationDds = locationEl?.querySelectorAll("dd");
    const location =
        locationDds && locationDds.length > 0
            ? [...locationDds]
                  .map((dd) => dd.textContent?.trim() ?? "")
                  .filter(Boolean)
                  .join(", ")
            : (locationEl?.textContent?.trim().replace(/^locations\s*/i, "") ??
              "");

    // Role: try jobPostingHeader (Salesforce + most instances), then h1, then title
    const roleEl =
        document.querySelector('[data-automation-id="jobPostingHeader"]') ??
        document.querySelector("h1");
    const role =
        roleEl?.textContent?.trim() ??
        document.title.split(/\s*[\|\-]\s*/)[0]?.trim() ??
        "";

    // Company: extract from hostname subdomain (most reliable — always present)
    // e.g. salesforce.wd12.myworkdayjobs.com → "Salesforce"
    // Fall back to title parsing for non-standard Workday deployments
    const hostname = window.location.hostname;
    const workdayMatch = hostname.match(
        /^([^.]+)\.(?:wd\d+\.)?myworkdayjobs\.com$/,
    );
    const titleParts = document.title.split(/\s*[\|\-]\s*/);
    const company = workdayMatch
        ? workdayMatch[1].charAt(0).toUpperCase() + workdayMatch[1].slice(1)
        : titleParts.length >= 2
          ? (titleParts[titleParts.length - 1]?.trim() ?? document.title)
          : document.title;

    return { company, role, jdText, location };
}

// --- In-memory cache helpers (synchronous) ---

export function cacheJobDetails(_url: string, data: CachedJobData): void {
    lastSeenJob = data;
    try {
        void chrome.storage.local.set({ workday_lastSeenJob: data });
    } catch {
        // CSP may block chrome storage APIs — in-memory cache only
    }
}

export function getCachedJobDetails(_url: string): CachedJobData | null {
    return lastSeenJob;
}

export function isAlreadyLogged(url: string): boolean {
    return loggedUrls.has(url);
}

export function markAsLogged(url: string): void {
    loggedUrls.add(url);
}

// Exported for test isolation only — not part of the public API
export function _resetStateForTesting(): void {
    lastSeenJob = null;
    loggedUrls.clear();
    jobDetailCached = false;
}

// --- Build detected job from cached data ---

export function buildDetectedJob(
    url: string,
    cached: CachedJobData | null,
    step: number | null,
): DetectedJob {
    const job: DetectedJob = {
        company: cached?.company ?? "",
        role: cached?.role ?? "",
        url,
        jdText: cached?.jdText ?? "",
        sourcePlatform: "workday",
    };
    if (step !== null) {
        return { ...job, applicationStep: step };
    }
    return job;
}

// Step tracking: reads DOM directly via progressBarCompletedStep/progressBarActiveStep.
// Called from the MutationObserver on each DOM change.
export function handleStepChange(lastStep: { value: number | null }): void {
    const step = getCurrentStep();
    if (step === lastStep.value) return;
    lastStep.value = step;
}

// --- Orchestration ---

export async function handleJobDetailPage(): Promise<void> {
    const isDetail = isJobDetailPage();
    if (!isDetail) {
        return;
    }

    const url = normalizeJobUrl(window.location.href);
    const details = scrapeJobDetails();

    // Always cache whatever we have — even if role is empty yet (wave-1 render).
    // This ensures the confirmation handler has something to work with even
    // when it fires before wave-2 fully renders.
    cacheJobDetails(url, details);

    if (details.role === "" && details.jdText === "") {
        // Nothing useful yet — keep retrying on next mutation
        return;
    }

    if (details.jdText !== "") {
        // Only stop retrying once JD text is available (jobPostingDescription loads ~2s later on Salesforce)
        jobDetailCached = true;
    }
}

export async function handleConfirmation(): Promise<void> {
    if (!isConfirmationPage()) {
        return;
    }

    // Normalize before dedup check so apply-flow URL variants don't bypass it
    const normalizedUrl = normalizeJobUrl(window.location.href);

    if (isAlreadyLogged(normalizedUrl)) {
        return;
    }

    // Mark synchronously before any await — prevents re-entrant sends from
    // the MutationObserver firing multiple times while this async function is
    // suspended waiting for chrome.storage.local.get or sendMessage.
    markAsLogged(normalizedUrl);

    let cached = getCachedJobDetails(normalizedUrl);
    if (cached === null) {
        try {
            const result = await chrome.storage.local.get("workday_lastSeenJob");
            if (isCachedJobData(result["workday_lastSeenJob"])) {
                cached = result["workday_lastSeenJob"] as CachedJobData;
            }
        } catch {
            // CSP blocked — fall through to DOM scrape
        }
    }
    if (cached === null) {
        cached = scrapeJobDetails();
    }
    const step = getCurrentStep();

    const job = buildDetectedJob(normalizedUrl, cached, step);

    // Guard: role still empty even after storage restore + DOM scrape.
    // Un-mark so the MutationObserver can retry on a later mutation when
    // the role element may have rendered.
    if (job.role === "") {
        loggedUrls.delete(normalizedUrl);
        console.warn("[workday] skipping JOB_DETECTED — role empty (cache miss on confirmation page)");
        return;
    }

    try {
        await chrome.runtime.sendMessage({ type: "JOB_DETECTED", job });
    } catch (err) {
        loggedUrls.delete(normalizedUrl);
        console.error("[workday] Failed to send JOB_DETECTED message:", err);
        return;
    }
    try {
        void chrome.storage.local.remove("workday_lastSeenJob");
    } catch {
        // ignore
    }
}

export function startObserver(): void {
    let discovered = false;
    const lastStep: { value: number | null } = { value: null };

    const observer = new MutationObserver(() => {
        // Log automation-ids once after React renders the real DOM
        if (
            !discovered &&
            document.querySelectorAll("[data-automation-id]").length > 1
        ) {
            discovered = true;
            logAutomationIds();
            // Log again after 2s to capture lazily-rendered elements (e.g. jobPostingDescription)
            setTimeout(() => {
                logAutomationIds();
            }, 2000);
        }

        // Retry caching job details if not yet cached (handles late DOM render)
        if (!jobDetailCached && isJobDetailPage()) {
            handleJobDetailPage().catch((err: unknown) => {
                console.error(
                    "[workday] retry handleJobDetailPage error:",
                    err,
                );
            });
        }

        // Track step changes via DOM (progressBarCompletedStep count)
        handleStepChange(lastStep);

        if (isConfirmationPage()) {
            handleConfirmation().catch((err: unknown) => {
                console.error("[workday] handleConfirmation error:", err);
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

// --- Entry point ---

handleJobDetailPage().catch((err: unknown) =>
    console.error("[workday] handleJobDetailPage error:", err),
);
handleConfirmation().catch((err: unknown) =>
    console.error("[workday] handleConfirmation error:", err),
);
startObserver();

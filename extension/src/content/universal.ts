import type { DetectedJob } from "../shared/types.js";
import { extractJobFromPage } from "./extract-job.js";
import { watchForApply } from "./detect-apply.js";

const PLATFORM_MAP: Record<string, DetectedJob["sourcePlatform"]> = {
    "lever.co": "lever",
    "linkedin.com": "linkedin",
    "greenhouse.io": "greenhouse",
    "myworkdayjobs.com": "workday",
    "ashbyhq.com": "ashby",
};

const DEDICATED_CONTENT_SCRIPT_HOSTS = [
    "greenhouse.io",
    "myworkdayjobs.com",
    "ashbyhq.com",
] as const;

function hasDedicatedContentScript(hostname: string): boolean {
    return DEDICATED_CONTENT_SCRIPT_HOSTS.some((domain) =>
        hostname.endsWith(domain),
    );
}

function guessPlatform(hostname: string): DetectedJob["sourcePlatform"] {
    for (const [domain, platform] of Object.entries(PLATFORM_MAP)) {
        if (hostname.endsWith(domain)) return platform;
    }
    return "manual";
}

chrome.runtime.onMessage.addListener(
    (message: unknown, _sender, sendResponse) => {
        if (typeof message !== "object" || message === null) return false;
        if ((message as Record<string, unknown>)["type"] !== "GET_JOB_INFO")
            return false;

        const hostname = window.location.hostname;
        if (hasDedicatedContentScript(hostname)) return false;
        const job = extractJobFromPage();

        sendResponse({
            role: job?.role,
            company: job?.company,
            url: window.location.href,
            sourcePlatform: guessPlatform(hostname),
            jdText: job?.jdText,
        });
        return true;
    },
);

const hostname = window.location.hostname;
if (!hasDedicatedContentScript(hostname)) {
    watchForApply(() => {
        const job = extractJobFromPage();
        if (!job?.role) return;
        chrome.runtime.sendMessage({
            type: "JOB_DETECTED",
            job: {
                ...job,
                url: window.location.href,
                sourcePlatform: guessPlatform(hostname),
            },
        });
    });
}

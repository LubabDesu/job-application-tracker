// watch for job application submission events and fires a callback.
// Supports three detection strategies:
//   1. Confirmation text — Workday SPA: scan DOM for "application submitted" patterns
//   2. Button click — Greenhouse/Ashby: listen for submit button clicks
//   3. Form submit — custom portals: listen for form submissions with job-related fields

const CONFIRMATION_TEXT_PATTERNS = [
    /successfully submitted your application/i,
    /application.*successfully submitted/i,
    /application submitted/i,
    /application.*received/i,
    /thank you for applying/i,
] as const;

const SUBMIT_BUTTON_SELECTORS = [
    // Greenhouse
    "#submit_app",
    '[data-qa="submit-application-button"]',
    // Ashby
    'button[class*="submit" i]',
    // Generic
    'button[type="submit"]',
    'input[type="submit"]',
] as const;

// Fields that indicate a form is a job application (not search/login/etc)
const JOB_FORM_FIELD_HINTS = [
    'input[name*="resume" i]',
    'input[type="file"]',
    'textarea[name*="cover" i]',
    'input[name*="linkedin" i]',
] as const;

export function watchForApply(onApply: () => void): void {
    // TODO: call watchConfirmationText, watchSubmitButtons, watchFormSubmit
    // each should call onApply() when triggered
    watchConfirmationText(onApply);
    watchSubmitButtons(onApply);
    watchFormSubmit(onApply);
}

// Strategy 1: Workday SPA — DOM mutates to show confirmation screen
function watchConfirmationText(onApply: () => void): void {
    // TODO: set up MutationObserver on document.body
    // on each mutation, call checkConfirmationText()
    // if it returns true, call onApply() and disconnect observer
    const observer = new MutationObserver(() => {
        if (checkConfirmationText()) {
            onApply();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

export function checkConfirmationText(): boolean {
    // return true if any pattern matches
    return CONFIRMATION_TEXT_PATTERNS.some((p) =>
        p.test(document.body.innerText),
    );
}

// Strategy 2: Greenhouse / Ashby — click on a known submit button
function watchSubmitButtons(onApply: () => void): void {
    // querySelector and addEventListener('click', onApply)
    for (const selector of SUBMIT_BUTTON_SELECTORS) {
        document.querySelector(selector)?.addEventListener("click", onApply);
    }
}

// Strategy 3: Custom portals — form submit on forms with job-related fields
function watchFormSubmit(onApply: () => void): void {
    // addEventListener('submit', onApply) on matching forms
    document.querySelectorAll("form").forEach((form) => {
        if (isJobApplicationForm(form)) {
            form.addEventListener("submit", onApply);
        }
    });
}

function isJobApplicationForm(form: HTMLFormElement): boolean {
    // TODO: check if form contains any JOB_FORM_FIELD_HINTS selectors
    return JOB_FORM_FIELD_HINTS.some(
        (selector) => form.querySelector(selector) !== null,
    );
}

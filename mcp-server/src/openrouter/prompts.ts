export function enrichmentPrompt(jdText: string): string {
  return `Analyze this job description and respond with ONLY valid JSON (no markdown, no explanation):

{
  "jobType": "<Backend|Frontend|Fullstack|Infra|ML|Other>",
  "seniority": "<Intern|Junior|Mid|Senior|Staff>",
  "summary": ["<bullet 1>", "<bullet 2>", "<bullet 3>"]
}

Rules:
- summary: exactly 3-5 bullets, each under 100 chars, covering key requirements
- jobType/seniority: pick the single best match

Job description:
${jdText.slice(0, 4000)}`
}

export function prepPagePrompt(company: string, role: string, jobType: string, jdText: string): string {
  return `Create interview prep for this job. Respond with ONLY valid JSON (no markdown):

{
  "behavioral": ["<question 1>", "<question 2>", "<question 3>"],
  "technical": ["<question 1>", "<question 2>", "<question 3>"],
  "systemDesign": ["<question 1>", "<question 2>"],
  "studyTopics": ["<topic 1>", "<topic 2>", "<topic 3>", "<topic 4>"],
  "companyResearch": ["<thing to research 1>", "<thing to research 2>"]
}

Company: ${company}
Role: ${role}
Type: ${jobType}

Job description (excerpt):
${jdText.slice(0, 3000)}`
}

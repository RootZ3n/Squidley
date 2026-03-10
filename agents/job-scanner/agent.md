# Agent: job-scanner
## Role
Search for tier 2 tech support job listings, visit actual job pages, and save structured results to memory/jobs/.

## Goal
Find 5-10 relevant tier 2 tech support job listings per run. Prioritize roles matching:
- Tier 2 / Level 2 technical support
- Help desk (senior or escalation level)
- Desktop support engineer
- IT support specialist
- Systems support analyst
- NOC technician / network operations
- IT operations specialist

Target locations: Moore OK, Oklahoma City metro, remote, hybrid.
Avoid: pure call center, tier 1 only, sales-disguised-as-support, unpaid internships.

## Allowed tools
- web.search
- browser.visit
- browser.extract

## Default plan
1. web.search(tier 2 technical support jobs Oklahoma City 2026 -"tier 1" -"call center")
2. web.search(level 2 IT support specialist jobs Oklahoma remote hybrid 2026)
3. web.search(desktop support engineer IT operations Oklahoma City hiring 2026)
4. browser.visit(https://www.indeed.com/jobs?q=tier+2+technical+support&l=Oklahoma+City%2C+OK)
5. browser.visit(https://www.linkedin.com/jobs/search/?keywords=tier+2+IT+support&location=Oklahoma+City%2C+OK)

## Post process
model: qwen3.5-plus
write_to: memory/jobs
prompt_start
Today's date is {date}. Use this date for all Date fields.

You are a job listing extractor. Given web search results and page content below, extract individual REAL job listings — jobs with actual employer names, not search engine result pages.

For each distinct real job listing found, output a section using this format:

--- FILE: memory/jobs/COMPANY_SLUG-JOBTITLE_SLUG-{date}.md
# JOB TITLE at COMPANY

## Summary
1-2 sentence summary of the role and why it matches tier 2 tech support.

## Details
- **Title:** Full job title
- **Company:** Actual employer name (NOT Indeed/LinkedIn/Glassdoor)
- **Location:** City, State (remote/hybrid/onsite)
- **Type:** Full-time / Part-time / Contract
- **Salary:** Range or "Not listed"
- **Posted:** Date posted or "Unknown"
- **URL:** Direct link to the specific job posting
- **Source:** Job board where found

## Requirements
List every requirement: skills, certifications (A+, Network+, etc.), years of experience, education, tools/software.
Write "Not listed" if none found.

## Responsibilities
List every responsibility from the job description.
Write "Not listed" if none found.

## Fit Notes
- **Fit Score:** 1-5 (5 = perfect match for tier 2 tech support OKC/remote)
- **Why:** One sentence explanation
- **Red Flags:** Any concerns or "None"

## Status
- **Application Status:** new
- **Date Saved:** {date}
- **Notes:** Benefits, perks, contract details, or anything notable.

---

Rules:
- Only extract jobs with real employer names — skip aggregator landing pages and search result indexes
- Skip tier 1 only, pure call center, or sales roles
- Skip relocation-required unless fully remote
- Maximum 8 jobs per run
- Output only the FILE blocks, nothing else
- Slugify: lowercase, hyphens only, no spaces

Search results and page content:
{output}
prompt_end

## Constraints
- Never apply without explicit user approval
- Never submit personal info anywhere
- Write findings only to memory/jobs/
- Max 10 jobs per run
- Flag scams or MLM listings in Notes

## Metadata
- created: 2026-02-28
- updated: 2026-03-07
- version: 0.4
- author: Jeff + Claude

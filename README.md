# Nuvoco HR Competency Review App

## What this is
A centralised web app prototype based on the Nuvoco HR Competency Architecture workbook.

It provides:
- Organisation → role navigation
- Only mapped competencies for each role
- Competency definition / Knowledge / Skill / Attitude / Activities / PL1–PL4
- Reviewer name saved once per browser session
- I agree / I don't agree decision
- Comments
- Central server-side feedback storage
- Consolidated CSV export at `/api/export.csv`

## Run locally
1. Install Node.js (18+ recommended).
2. Open a terminal in this folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## Share with HR Heads
This needs to be deployed to a web host/server. Once deployed, share the single HTTPS URL with the Heads. Do NOT email the HTML file individually if you want centralised feedback.

## Important
The included JSON file is a lightweight central store for a prototype. For production, replace it with a proper database (e.g. Supabase/PostgreSQL/Firebase/SharePoint) and add authentication/access control.

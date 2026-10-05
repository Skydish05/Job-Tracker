# Job Tracker

Phase 1 project: track job applications, browse real postings ranked by how well they match your profile, and draft cover-letter openings with AI.

## Run it

Requires **Node.js 22.13 or newer** (it uses the built-in `node:sqlite`). There is nothing to install.

```
npm start
```

Open http://localhost:3000. Your data is stored in `server/db/jobtracker.db`, which is created on first run.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Enables AI-written cover letters. Without it you get a clearly labelled template draft. |
| `GEMINI_MODEL` | Model used for drafts (default `gemini-flash-latest`). |
| `PORT` | Server port (default `3000`). |
| `DB_PATH` | Database file location. |

Put them in a `.env` file in the project folder (loaded automatically by `npm start`, and ignored by git), for example `GEMINI_API_KEY=your-key`. Or set them inline: `GEMINI_API_KEY=... npm start` (on Windows PowerShell: `$env:GEMINI_API_KEY="..."; npm start`).

## Features

1. **Application tracker.** Add, edit, delete and filter applications by status (wishlist, applied, interview, offer, rejected). Deadlines turn orange within 7 days and red when overdue.
2. **Job feed.** Pulls postings from the free [Remotive](https://remotive.com/api/remote-jobs) API and ranks them against your profile. Each card shows a match percentage and which of your skills were found. If the API cannot be reached it shows clearly labelled sample postings instead. Results are cached for an hour.
3. **Cover letter assistant.** Sends the job and your profile to Gemini and returns an editable opening paragraph. The prompt tells the model to use only facts from your profile.

Fill in the **Profile** page first: skills and target roles drive the ranking, and the summary is the only personal background the cover letter may use.

### How the match score works

Plain keyword overlap, so every score can be explained on screen. Each of your skills (up to 5 count toward the total) earns up to 3 points: 2 if it is in the posting's tags, 1 if it is in the description, and a title mention can stand in for a missing tag. A target role whose words all appear in the title adds 6. Junior-sounding titles get a small boost for entry/junior profiles and senior titles a penalty. The total is scaled to 0-100.

## Project structure

```
client/                     no-build frontend (plain ES modules)
  index.html, app.js        shell and hash router
  pages/                    Dashboard, ApplicationForm, JobFeed, CoverLetter, Profile
  components/               ApplicationCard, JobCard, StatusBadge, dom helpers
  services/api.js           fetch wrappers for the backend
server/
  index.js                  HTTP server, static files, route registration
  router.js                 tiny router (no Express)
  routes/                   applications, profile, jobs, coverLetter
  services/                 jobApiService, rankingService, llmService, sampleJobs
  db/                       schema.sql, db.js
  test/                     backend tests
```

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET / POST | `/api/applications` | list (optional `?status=`), create |
| GET / PUT / DELETE | `/api/applications/:id` | |
| GET / PUT | `/api/profile` | single profile row |
| GET | `/api/jobs` | `?q=`, `?category=`, `?refresh=1`, `?min=` (minimum match) |
| POST | `/api/cover-letter` | body `{ job: { title, company, description? } }` |

## Tests

```
npm test
```

Runs the backend tests (CRUD, validation, ranking, job normalisation, and the AI request/fallback logic against a local mock of the Gemini API). Tests use an in-memory database and never touch your real data.

## Why no React or Express?

The project was built in an environment where npm installs were blocked, so it uses only what ships with Node. That also means there is no build step and no `node_modules`.

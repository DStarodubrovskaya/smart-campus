Here we will write to each other what are the next steps.
And we'll remove/archive this later.

## Done:

**Data and database**

- PostgreSQL cloud database (Supabase) connected
- Schema written and initialized: buildings, rooms, users, schedule_events, occupancy_status, report_history
- Scraper for the university course catalog
- ETL pipeline: faculties, semesters, days, times, buildings and rooms normalized, duplicates removed with an audit report
- Cleaned dataset loaded into the database

**Backend**

- FastAPI server with 16 endpoints, interactive docs at `/docs`
- Data access layer separated from the API
- Trust Logic Engine: consensus between reports, trust gain and penalty, pioneer rule for new users
- Occupancy state machine combining the official timetable with live reports
- Simulation engine on SimPy with four scenarios: normal flow, conflicting reports, spam attack, VIP override
- Simulation controls: start, pause, resume, stop, status, log feed and log clearing
- Admin endpoints with role-based access: list, update and delete users

**Frontend**

- React + TypeScript + Vite application, Hebrew interface with RTL layout
- Interactive Leaflet campus map: per-building markers colored by status, live free-room counts, searchable room list in each popup, fly-to on search, fullscreen mode
- Live room list with filtering by building, room number and amenities
- Reporting flow: free/busy report in one tap
- Schedule-based search: rooms free for at least N minutes, filtered by building
- ML forecast view: prediction for a specific room plus the top five most available rooms
- Gamified profile: Trust Score, tier, achievement badges, report history
- Admin panel: user management, manual Trust Score adjustment, report history, impersonation mode
- Persistent sessions across reloads
- Simulation dashboard with a live terminal-style log feed

**Machine learning**

- Training dataset generated from three months of campus occupancy history
- Random Forest classifier trained and evaluated (feature importance and confusion matrix saved)
- Model served through the API and loaded lazily on first use

**Deployment**

- Backend deployed on Render as a Web Service
- Frontend deployed on Render as a Static Site
- Auto-deploy from `main` for both
- Environment-based configuration, no hardcoded URLs

**Documentation**

- Root README rewritten to match the current architecture
- README per directory: backend, frontend, cleaning_data, database, ml_forecasting, simulation
- MIT license

## To Do:

- Frontend polish: light gamification to encourage users to submit reports
- A small set of profile avatars unlocked by status level (newcomer, 5 reports, 15 reports, and so on)
- Room booking by time slot
- Quick-save for favourite rooms
- Rework the login flow and add proper protection of user data
- Make the admin entry point less visible

## Important:

- We currently store pending confirmation reports in-memory via a PostgreSQL database,
  which is good in case of a server crash. However, this isn't the best solution.
  Connecting Redis is an option, but that adds another db and complicates the architecture.
- The database is not connected to the university's own systems. The timetable is a static
  dataset that was imported once, so it does not follow changes made on the university side.
  A real deployment would need a direct integration instead.
- Login is deliberately minimal: an identifier and a role, with no real authentication and no
  protection of user data. Fine for a demo, but it has to be reconsidered before anything
  close to production — university credentials would belong behind the university's own SSO.
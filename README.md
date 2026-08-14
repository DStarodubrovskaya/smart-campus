# Smart Campus

**System for Optimization and Visual Management of Academic Spaces**

A team project developed for the Final Project course at the Department of Information Science and Applied Artificial Intelligence, Bar-Ilan University.

## About the Project

Finding an empty classroom on campus usually means walking the corridors and peeking through doors. Smart Campus turns that into a map: it shows which rooms are free right now, and how long they are likely to stay that way.

The system does not trust any single source of truth. The official university timetable says what *should* be happening in a room; students and lecturers report what is *actually* happening. When the two disagree, a consensus algorithm decides — weighted by a Trust Score that each user earns or loses depending on how accurate their past reports turned out to be. A single false report cannot flip a room's status.

The interface is in Hebrew and laid out right-to-left, matching the language of the campus it serves.

Around that core there is an ETL pipeline that scrapes and normalizes the university course catalog, a PostgreSQL database, a FastAPI backend with an occupancy state machine and a simulation engine, a machine-learning module that forecasts availability, and a React frontend built around an interactive campus map.

## Live Deployment

| Service | Platform | URL |
|---|---|---|
| Backend API (Swagger) | Render (Web Service) | https://smart-campus-oknf.onrender.com/docs |
| Frontend | Render (Static Site) | _see the Render dashboard_ |
| Database | Supabase (PostgreSQL) | — |

Both services redeploy automatically on every push to `main`.

The API base URL is `https://smart-campus-oknf.onrender.com`, but there is no route at the root, so opening it directly returns `{"detail":"Not Found"}`. That is expected — every endpoint lives under `/api/`, and `/docs` is the place to explore them.

One caveat worth knowing: on Render's free tier the backend goes to sleep after about 15 minutes of inactivity, so the first request after a quiet period can take 30–60 seconds. This is a cold start, not a failure.

## What the System Does

**For the user**

The map is the entry point. Every campus building carries a marker colored by its overall state and labelled with the number of rooms currently free; opening a marker gives a searchable list of the rooms inside. Below the map the same data appears as cards, filterable by building, room number and amenities.

Reporting a room takes one tap — free or busy. The report is weighted by the reporter's Trust Score, and new users go through a probation period (the "pioneer rule") during which their reports are checked against the community before they can change what everyone else sees.

Two kinds of search sit on top of this. One is schedule-based: find rooms that stay free for at least N minutes according to the official timetable. The other is a forecast: a Random Forest model trained on three months of campus history estimates the probability that a given room will be free at a chosen day and hour, and returns the five rooms most likely to be available.

**Behind the scenes**

An admin panel with role-based access control handles user management, manual Trust Score adjustment, report history and an impersonation mode for debugging. A simulation engine replays scripted scenarios — normal flow, conflicting reports, a spam attack, a VIP override — against the live database to check that the consensus logic behaves as intended. Feeding all of this is a scraper that pulls the course catalog from the university portal and an ETL pipeline that normalizes faculties, times, days, semesters and building codes into a consistent dataset.

## Tech Stack

**Backend**
- Python 3.10+, FastAPI, Uvicorn, Pydantic
- SQLAlchemy, psycopg2 (PostgreSQL / Supabase)
- SimPy for the simulation engine, python-dotenv for configuration

**Frontend**
- React 19, TypeScript, Vite
- Tailwind CSS 4, Leaflet with React Leaflet
- TanStack React Query, Axios

**Data and ML**
- Pandas, NumPy, Openpyxl
- scikit-learn (Random Forest), Matplotlib, Seaborn
- Selenium with Undetected-Chromedriver for scraping

## Project Structure

- `backend/` — FastAPI application and data access layer.
  - `main.py` — API endpoints, occupancy state machine, simulation control.
  - `db_service.py` — Data Access Layer, all direct database queries live here.
  - `generate_scenarios.py` — builds the simulation scenario datasets.
- `cleaning_data/` — the ETL pipeline.
  - `main.py` — entry point for data cleaning.
  - `cleaners/` — one module per field: faculties, time, days, semesters, buildings.
- `data/` — datasets.
  - `cleaned/` — final output, ready for database migration.
  - `scenarios/` — CSV scenarios used by the simulation engine.
- `database/` — schema and initialization.
  - `init_schema.sql` — PostgreSQL schema definition.
  - `seed_data.py` — populates the database from the cleaned CSV data.
- `docs/` — project documentation and literature review.
- `frontend/` — React + Vite single-page application.
  - `src/App.tsx` — application shell and all tab views.
  - `src/components/CampusMap.tsx` — the Leaflet campus map.
  - `src/hooks/` — React Query hooks, one per API endpoint.
- `ml_forecasting/` — the machine-learning module.
  - `generate_ml_dataset.py` — builds the training dataset.
  - `train_model.py` — trains and evaluates the Random Forest model.
  - `room_predictor.pkl` — trained model artifact, loaded by the API.
- `simulation/src/` — standalone logic engine (`simulation_integrated.py`, `logic_engine.py`).
- `tools/` — utility scripts, including `scrape.py`.

## Setup

**1. Clone the repository**

    git clone <your-repo-url>
    cd smart-campus

**2. Create a virtual environment and install dependencies**

    python -m venv venv          # on Windows use: py -m venv venv
    source venv/bin/activate     # on Windows use: venv\Scripts\activate
    pip install -r requirements.txt

**3. Set the environment variables**

Create a `.env` file in the project root with the Supabase connection string:

    DATABASE_URL="postgresql://user:password@host:port/dbname"

## Building the Database

These steps are run once, in order, to build everything from scratch. Note that two of the scripts rely on relative paths and must be run from inside their own folder — those are marked below.

**Step 1. Gather the raw data**

    cd tools
    python scrape.py

**Step 2. Clean it** (run from inside `cleaning_data/`)

    cd cleaning_data
    python main.py

**Step 3. Create the schema and populate the database**

    python database/seed_data.py

**Step 4. Train the ML model — optional** (run from inside `ml_forecasting/`)

    cd ml_forecasting
    python generate_ml_dataset.py
    python train_model.py

**Step 5. Run the standalone logic engine — optional**

    python simulation/src/simulation_integrated.py

## Running the Application

**Backend**

    uvicorn backend.main:app --reload

The API is served at http://127.0.0.1:8000, with interactive documentation at http://127.0.0.1:8000/docs.

**Frontend**

Configuration files are not kept in Git, so before the first run create a `.env` file inside the `frontend` folder:

    VITE_API_URL=http://127.0.0.1:8000

Then install the dependencies (first time only) and start the dev server:

    cd frontend
    npm install
    npm run dev

The interface opens at http://localhost:5173.

The frontend does not run on its own — it needs the backend. Either keep a second terminal open with `uvicorn` running, or point `VITE_API_URL` at the deployed backend and work against the cloud instead.

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/rooms` | Current occupancy status of all rooms |
| `GET` | `/api/rooms/search` | Rooms free for at least `min_minutes`, optionally filtered by `building` |
| `POST` | `/api/users/login` | Register or log in a user |
| `POST` | `/api/reports/submit` | Submit a free/busy report |
| `GET` | `/api/users/{app_user_id}/history` | Report history of a specific user |
| `GET` | `/api/ml/forecast` | Availability forecast for a given day and hour |
| `POST` | `/api/simulation/start` | Load a scenario and start the simulation engine |
| `POST` | `/api/simulation/stop` | Stop the simulation engine |
| `GET` | `/api/simulation/status` | Whether the engine is currently running |
| `GET` | `/api/simulation/logs` | Recent simulation log entries |
| `POST` | `/api/simulation/clear-logs` | Clear the simulation log |
| `GET` | `/api/admin/users` | List all users (admin only) |
| `PUT` | `/api/admin/users/{app_user_id}` | Update a user's role, tier or Trust Score |
| `DELETE` | `/api/admin/users/{app_user_id}` | Delete a user |

## Database Schema

Six tables, defined in `database/init_schema.sql`:

| Table | Purpose |
|---|---|
| `buildings` | Campus buildings |
| `rooms` | Classrooms, each linked to a building |
| `users` | App users with role, tier and Trust Score |
| `schedule_events` | Official timetable entries |
| `occupancy_status` | Current live status of each room |
| `report_history` | Every report ever submitted, used for auditing and Trust Score calculation |

## Machine Learning

The forecasting module uses a Random Forest classifier trained on three months of campus occupancy history (`ml_forecasting/campus_history_3m.csv`). The features are the day of the week, the hour, the building, the room, and whether an official class is scheduled at that time.

Running `train_model.py` produces two evaluation artifacts alongside the model: `feature_importance.png`, showing which features carry the most weight, and `confusion_matrix.png`, showing performance on the held-out test set. The trained model is serialized to `room_predictor.pkl` and loaded lazily by the backend on the first call to `/api/ml/forecast`.

## License

Released under the MIT License. See the [LICENSE](LICENSE) file for details.

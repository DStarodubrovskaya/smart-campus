# Smart Campus 🎓
**System for Optimization and Visual Management of Academic Spaces**

## 📌 About the Project
Smart Campus is a comprehensive backend and simulation system designed to monitor and manage classroom occupancy in real-time. By combining official university schedules with crowdsourced reports from students and lecturers, the system provides accurate room availability status. It features a built-in state machine, a consensus algorithm, and a user Trust Score system to filter out false reports.

## 🚀 Key Features
* **Automated Data Scraping:** Extracts the latest course catalog and schedule data directly from the university portal bypassing captchas.
* **ETL Pipeline:** Cleans and normalizes raw schedule data (faculties, times, semesters) into a structured format.
* **Cloud Database Integration:** Uses PostgreSQL (Supabase) via SQLAlchemy for robust relational data storage.
* **Real-time Simulation:** A dynamic simulation engine that mimics user behavior, tests crowd consensus logic, and automatically updates the database.
* **Trust Score & Consensus:** Users gain or lose trust points based on the accuracy of their reports compared to the crowd consensus.

## 🛠️ Tech Stack
* **Language:** Python 3.10+
* **Data Processing:** Pandas, Openpyxl
* **Web Scraping:** Selenium, Undetected-Chromedriver
* **Database:** PostgreSQL (Supabase), SQLAlchemy, psycopg2
* **Environment Management:** python-dotenv

## 📂 Project Structure
* `backend/` - Server-side logic and database connection.
  * `db_service.py` - Data Access Layer (DAL) handling all direct database queries.
* `cleaning_data/` - ETL pipeline scripts.
  * `main.py` - Main entry point for data cleaning.
  * `cleaners/` - Modules for standardizing faculties, time, days, and locations.
* `data/` - Local storage for processed datasets.
  * `cleaned/` - Final output files ready for database migration.
* `database/` - Database management and initialization.
  * `init_schema.sql` - PostgreSQL schema definition.
  * `seed_data.py` - Script to populate the DB with cleaned CSV data.
* `docs/` - Project documentation and literature reviews (in future).
* `frontend/` - Future location for the user interface.
* `simulation/src/` - Core logic engine (`simulation_integrated.py`).
* `tools/` - Utility scripts, including `scrape.py` for web scraping.

## ⚙️ Setup & Installation

**1. Clone the repository**
git clone <your-repo-url>
cd smart-campus

**2. Create a virtual environment and install dependencies**
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt

**3. Environment Variables**
Create a .env file in the root directory and add your Supabase database connection string:
DATABASE_URL="postgresql://user:password@host:port/dbname"

**4. Run the Pipeline**
Step 1: python scrape.py (Gather data)
Step 2: python main.py (Clean data)
Step 3: python backend/seed_data.py (Initialize and populate DB)
---- 3.1: python backend/simulation_integrated.py (Run the logic engine, for backend only)
Step 5: uvicorn backend.main:app --reload (Launching the Backend API to communicate with simulation)
---- Once the server is launched, the interactive documentation is available at: http://127.0.0.1:8000/docs

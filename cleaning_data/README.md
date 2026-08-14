# Data Cleaning Pipeline (ETL)

This directory holds the one-off pipeline that produced the project's initial dataset. The course catalog was scraped from the university portal, and the raw export was messy: faculty names arrived as multi-line fragments, a single cell could hold several semesters, days, time slots, buildings and rooms at once, and times came without separators (`0800`).

The pipeline was written against exactly that raw export, run once to produce a clean timetable, and that timetable is what the database, the simulation engine and the ML module have been built on ever since. It is kept in the repository for reproducibility — so the path from raw data to the seeded database can be retraced — not as something the system runs on a schedule.

## Files & Structure

- **`main.py`**: The pipeline entry point. Loads the raw CSV, calls each cleaner in order, enforces the final column layout, and saves the result. Progress is printed as eight sequential steps.
- **`course-catalog-before.csv`**: The raw scraped catalog, kept so the pipeline can be reproduced from scratch.
- **`cleaners/`**: One module per field, each taking a DataFrame and returning a cleaned copy.
  - **`clean_faculty.py`**: Extracts the real faculty name out of multi-line scraped text and removes repeated words.
  - **`clean_semester.py`**: Splits year-long courses into one row per semester.
  - **`clean_day.py`**: Parses the Hebrew day letters and splits multi-day entries into separate rows. Courses with no parsable day are dropped.
  - **`clean_time.py`**: Finds time intervals with a regular expression, formats them (`0800` becomes `08:00`), and derives the `Time-start` and `Time-end` columns.
  - **`clean_building.py`**: Distributes buildings and rooms across days. When a course spans two days and the cell lists two buildings and two rooms, the first day gets the first pair, the second day the second.
  - **`clean_duplicate.py`**: Drops exact duplicate rows and writes the removed ones to a separate report for auditing.

## Order Matters

The cleaners are not interchangeable. `clean_time.py` must run before `clean_building.py`, because the building distribution relies on rows already being sorted by time. The row count grows along the way: splitting semesters, days and time slots turns one raw row into several concrete class events.

## Reproducing the Run

Output:

- **`course_catalog_CLEAN_Final.xlsx`**: The cleaned dataset, with columns ordered to match the target database structure.
- **`duplicates_report.xlsx`**: The rows removed as duplicates, kept for review.

The cleaned dataset is what `database/seed_data.py` loads when populating PostgreSQL.

## A Note on the Approach

Scraping and cleaning was the practical way to obtain a realistic timetable for a student project, but it is not how this should work in production. The parsing rules here are tailored to the quirks of one particular export, so a change in the portal's markup or formatting would break them.

In a deployed system the timetable should come directly from the university's own scheduling systems through an official interface, which would remove both the scraping step and this cleaning stage entirely.

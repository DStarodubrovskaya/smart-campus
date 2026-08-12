# Database Initialization & Seeding

This directory contains the scripts required to define the PostgreSQL (Supabase) schema and populate the database with initial data.

## Files

- **`init_schema.sql`**: The SQL blueprint. Defines table structures, relationships, constraints, and performance indices. **Warning:** Contains `DROP TABLE` commands for clean resets.
- **`seed_data.py`**: The ETL (Extract, Transform, Load) script. It executes the schema file and populates the database with real schedule data and synthetic users.

## Usage

To initialize or completely reset the database, ensure your `.env` file contains a valid `DATABASE_URL`, then run:

```bash
python seed_data.py
```

# Backend API & Core Services

This directory contains the central FastAPI server that bridges the React frontend, the PostgreSQL database, the consensus logic engine, and the Machine Learning models.

## Files & Structure

- **`main.py`**: The API Gateway. Defines all REST endpoints, manages the asynchronous `simpy` simulation engine as a background task, and serves ML forecasts.
- **`db_service.py`**: The Data Access Layer (DAL). Abstracts all direct PostgreSQL (Supabase) interactions via SQLAlchemy, ensuring a clean separation of concerns.
- **`generate_scenarios.py`**: A utility script for generating synthetic user cohorts (e.g., "Spam Attack", "VIP Pass") used to stress-test the consensus algorithm during simulations.

## Usage

To start the FastAPI development server, run the following command from the project root:

```bash
uvicorn backend.main:app --reload
```

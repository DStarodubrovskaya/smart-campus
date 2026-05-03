from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware 
from backend.db_service import DatabaseService
import os

app = FastAPI(title="Smart Campus Simulation API")

# --- CORS SETUP ---
# Allowing the frontend to connect to us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In the future, the frontend address will be here, for now we allow everyone
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ----------------------

db = DatabaseService()

@app.post("/api/simulation/start")
async def start_simulation(scenario_name: str = "4_normal_day.csv"):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    scenario_path = os.path.abspath(os.path.join(base_dir, "..", "data", "scenarios", scenario_name))

    if not os.path.exists(scenario_path):
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_name} not found!")

    try:
        db.reset_simulation_state(scenario_path)
        return {
            "status": "success", 
            "message": f"The simulation is ready! The base is cleared, the scenario '{scenario_name}' loaded."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading: {str(e)}")

@app.get("/")
async def root():
    return {"message": "Smart Campus API is running! 🚀"}
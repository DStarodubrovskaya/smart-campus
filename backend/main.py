import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware 
from pydantic import BaseModel
from typing import Literal
from sqlalchemy import text
import asyncio
import simpy
import random

from backend.db_service import DatabaseService
from simulation.src.logic_engine import TrustLogicEngine

app = FastAPI(title="Smart Campus Simulation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = DatabaseService()

IS_ENGINE_RUNNING = False

# --- THE HEART OF THE PROJECT: SimPy Engine + Logic Trust Score ---
async def run_simulation_engine():
    global IS_ENGINE_RUNNING
    IS_ENGINE_RUNNING = True
    print("🚀 === ENGINE STARTED WITH REAL DB & LOGIC ENGINE ===", flush=True)
    
    try:
        env = simpy.Environment()
        
        # Initializing the "Brain"
        logic_engine = TrustLogicEngine(db)

        users_dict = db.get_all_users()
        valid_rooms = db.get_valid_locations()

        if not users_dict or not valid_rooms:
            print("⚠️ WARNING: No users or rooms found in the database. Engine stopped.", flush=True)
            return

        def student_agent(env, user_data, all_rooms):
            while True:
                # Agent "walks" through campus
                yield env.timeout(random.randint(1, 3))
                
                # Create "Hot Spots" for the demo presentation
                if random.random() < 0.80:
                    # 80% of students go to the first 5 rooms (there will be frequent consensus here)
                    target_room = random.choice(all_rooms[:5])
                else:
                    # 20% walk around the rest of campus (Pioneer Rules will be here)
                    target_room = random.choice(all_rooms)
                actual_status = random.choice(["FREE", "BUSY"])
                
                # Agent honesty logic from simulation_integrated.py
                is_honest = random.random() < user_data["trust"]
                reported_status = actual_status if is_honest else ("BUSY" if actual_status == "FREE" else "FREE")
                
                # Simulate parameters for the request (in the future, we'll use datetime.now())
                sim_semester = "א"     # Semester A
                sim_day = 6            # Sunday (according to day_map from seed_data.py)
                sim_time = "10:00:00"  # 10 a.m.

                # We ask for a real schedule through your ready-made method
                current_room_status = db.check_schedule_status(
                    b_code=target_room['b_code'], 
                    room=target_room['room'], 
                    current_sem=sim_semester, 
                    db_day=sim_day, 
                    check_time_str=sim_time
                )

                try:
                    # CHALLENGE CONSENSUS LOGIC
                    result = logic_engine.process_report(
                        user_db_id=user_data["db_id"], 
                        user_trust=user_data["trust"],
                        user_tier=user_data.get("tier", "Resident"), 
                        room_db_id=target_room["room_id"],
                        reported_status=reported_status,
                        current_room_status=current_room_status
                    )

                   # If a consensus is reached and the status has changed, we write to the database (Front will repaint the room)
                    if result["new_status"] != current_room_status:
                        db.update_room_status(target_room["room_id"], result["new_status"])

                    # Update the agent's local rating for the following actions
                    for db_uid, trust_delta in result["trust_updates"].items():
                        # Save the result in the database and check the Level Up for the agent
                        db.update_user_post_report(db_uid, trust_delta)
                        
                        if user_data["db_id"] == db_uid:
                            user_data["trust"] = max(0.0, min(1.0, user_data["trust"] + trust_delta))

                    # Terminal output for developers
                    print(f"📡 [Time: {env.now:03d}] User {user_data['id']} (Tr: {user_data['trust']:.2f}) | Room {target_room['room']} | Report: [{reported_status}] | 🧠 {result['event_msg']}", flush=True)
                    
                except Exception as inner_e:
                    print(f"❌ DB Error for Agent {user_data['id']}: {inner_e}", flush=True)
                
                # Agent "sits in class"
                yield env.timeout(random.randint(2, 5))

        # Launch processes for each student
        for uid, user_info in users_dict.items():
            env.process(student_agent(env, user_info, valid_rooms))

        while IS_ENGINE_RUNNING:
            env.step() 
            await asyncio.sleep(1) 
            
    except simpy.core.EmptySchedule:
        print("🛑 === SIMULATION FINISHED ===", flush=True)
    except Exception as e:
        print(f"❌ === ENGINE CRITICAL ERROR: {e} ===", flush=True)

# --- API ENDPOINTS ---

class SimulationPayload(BaseModel):
    scenario_id: int

# --- NEW MODELS FOR REAL USERS ---
class UserLoginPayload(BaseModel):
    app_user_id: str
    role: Literal["Student", "Lecturer"]

class RealUserReport(BaseModel):
    app_user_id: str
    room_id: int
    reported_status: Literal["FREE", "BUSY"]

SCENARIO_MAP = {
    1: "1_basic_flow.csv",
    2: "2_conflict.csv",
    3: "3_spam_attack.csv",
    4: "4_vip_pass.csv"
}

@app.post("/api/simulation/start")
async def start_simulation(payload: SimulationPayload, background_tasks: BackgroundTasks):
    global IS_ENGINE_RUNNING
    IS_ENGINE_RUNNING = False # Killing the old engine
    
    scenario_name = SCENARIO_MAP.get(payload.scenario_id, "1_basic_flow.csv")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    scenario_path = os.path.abspath(os.path.join(base_dir, "..", "data", "scenarios", scenario_name))

    if not os.path.exists(scenario_path):
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_name} not found!")

    try:
        db.reset_simulation_state(scenario_path)
        background_tasks.add_task(run_simulation_engine)
        return {"status": "success", "message": f"Loaded {scenario_name} and started engine!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rooms")
async def get_rooms():
    try:
        return db.get_current_rooms()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/simulation/logs")
async def get_logs():
    try:
        return db.get_recent_logs()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/api/simulation/stop")
async def stop_simulation():
    global IS_ENGINE_RUNNING
    
    if IS_ENGINE_RUNNING:
        IS_ENGINE_RUNNING = False
        print("🛑 === STOP SIGNAL RECEIVED FROM FRONTEND ===", flush=True)
        return {"status": "success", "message": "Engine stopping..."}
    else:
        return {"status": "info", "message": "Engine is already stopped."}

# --- NEW ENDPOINTS FOR THE FRONTEND (REAL USERS) ---

@app.post("/api/users/login")
async def user_login(payload: UserLoginPayload):
    """Registration or login of a real user"""
    try:
        with db.engine.begin() as conn:
            user = conn.execute(
                text("SELECT role, trust_score, tier, successful_reports FROM users WHERE app_user_id = :uid"),
                {"uid": payload.app_user_id}
            ).fetchone()
            
            if not user:
                initial_trust = 0.95 if payload.role == "Lecturer" else 0.50
                initial_tier = "VIP" if payload.role == "Lecturer" else "Newbie"
                
                conn.execute(text("""
                    INSERT INTO users (app_user_id, role, trust_score, tier, successful_reports, total_reports)
                    VALUES (:uid, :role, :trust, :tier, 0, 0)
                """), {
                    "uid": payload.app_user_id,
                    "role": payload.role,
                    "trust": initial_trust,
                    "tier": initial_tier
                })
                
                return {
                    "status": "success",
                    "user": {
                        "app_user_id": payload.app_user_id,
                        "role": payload.role,
                        "tier": initial_tier,
                        "trust_score": initial_trust,
                        "pioneer_rule_unlocked": (payload.role == "Lecturer")
                    }
                }
            
            role, trust_score, tier, successful_reports = user
            return {
                "status": "success",
                "user": {
                    "app_user_id": payload.app_user_id,
                    "role": role,
                    "tier": tier,
                    "trust_score": float(trust_score),
                    "pioneer_rule_unlocked": (tier != "Newbie" or role == "Lecturer")
                }
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/reports/submit")
async def submit_real_user_report(payload: RealUserReport):
    """Receiving a real report from a live user"""
    try:
        # 1. Get user data and room status
        with db.engine.begin() as conn:
            user = conn.execute(text("""
                SELECT id, trust_score, tier FROM users WHERE app_user_id = :uid
            """), {"uid": payload.app_user_id}).fetchone()
            
            if not user:
                raise HTTPException(status_code=404, detail="User not found. Call /login first.")
                
            db_id, trust_score, tier = user

            room_status_row = conn.execute(
                text("SELECT status FROM occupancy_status WHERE room_id = :rid"),
                {"rid": payload.room_id}
            ).fetchone()
            current_status = room_status_row[0] if room_status_row else "FREE"

        # 2. Transfer everything to the Trust Logic Engine
        logic = TrustLogicEngine(db)
        
        result = logic.process_report(
            user_db_id=db_id, 
            user_trust=float(trust_score), 
            user_tier=tier,
            room_db_id=payload.room_id, 
            reported_status=payload.reported_status, 
            current_room_status=current_status
        )

        # 3. Save the new room status if it has changed
        if result["new_status"] != current_status:
            db.update_room_status(payload.room_id, result["new_status"])

        # 4. Apply penalties, rewards, and auto-leveling
        for uid, trust_delta in result["trust_updates"].items():
            db.update_user_post_report(uid, trust_delta)

        # 5. Return a response to update the frontend
        return {
            "status": "success",
            "message": result["event_msg"],
            "room_new_status": result["new_status"]
        }

    except Exception as e:
        print(f"❌ Error in /api/reports/submit: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/api/rooms/search")
async def search_rooms(min_minutes: int = 10, building: str = "הכל"):
    """
    Эндпоинт для расширенного поиска на фронтенде (חיפוש וסינון מתקדם).
    Принимает минимальное количество свободных минут и номер корпуса.
    """
    try:
        results = db.search_advanced_rooms(min_minutes, building)
        return {
            "status": "success",
            "filters_applied": {
                "min_minutes": min_minutes,
                "building": building
            },
            "results_count": len(results),
            "rooms": results
        }
    except Exception as e:
        print(f"❌ Error in /api/rooms/search: {e}")
        raise HTTPException(status_code=500, detail=str(e))
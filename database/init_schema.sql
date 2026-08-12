-- ==========================================
-- SMART CAMPUS: POSTGRESQL SCHEMA INITIALIZATION
-- ==========================================

-- Clean slate routine (Drops existing tables to prevent schema conflicts during resets)
DROP TABLE IF EXISTS report_history CASCADE;
DROP TABLE IF EXISTS occupancy_status CASCADE;
DROP TABLE IF EXISTS schedule_events CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Buildings Table
-- Separated from rooms to normalize the database and prevent data anomaly.
CREATE TABLE buildings (
    id SERIAL PRIMARY KEY, 
    name VARCHAR(100),
    code VARCHAR(50) NOT NULL UNIQUE -- Enforced UNIQUE constraint to allow fast lookups by building code
);

-- 2. Rooms Table
-- Represents the physical spaces on campus.
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
    room_number VARCHAR(20) NOT NULL,
    capacity INTEGER DEFAULT 0, 
    UNIQUE(building_id, room_number) -- Composite key prevents creating duplicate rooms in the same building
);

-- 3. Users Table (Gamification & RBAC)
-- Stores persistent reputation (Trust Score) and progression metrics (Tier, Reports).
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    app_user_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'U181' (Matches the ID provided by the frontend)
    role VARCHAR(20) CHECK (role IN ('Student', 'Lecturer')), -- Role-Based Access Control constraint
    trust_score DECIMAL(5, 2) DEFAULT 0.50, -- Dynamic weight in the consensus algorithm [0.0 - 1.0]
    tier VARCHAR(20) DEFAULT 'Newbie', -- Gamification rank
    successful_reports INT DEFAULT 0,
    total_reports INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Schedule Events Table (Static Baseline)
-- The official BIU timetable (Ground Truth).
CREATE TABLE schedule_events (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    course_name VARCHAR(255), 
    semester VARCHAR(10), 
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL, 
    end_time TIME NOT NULL 
);

-- 5. Occupancy Status Table (State Machine)
-- Highly optimized table storing ONLY the current real-time status of a room.
CREATE TABLE occupancy_status (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL, -- 'FREE', 'BUSY'
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id) -- Crucial for SQL UPSERT (INSERT ON CONFLICT UPDATE) operations
);

-- 6. Report History Table (Audit Trail & ML Data)
-- Append-only event log containing every user report, consensus math, and UI messages.
CREATE TABLE report_history (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reported_status VARCHAR(20),
    trust_at_report DECIMAL(5, 2), -- Historical snapshot of trust to prevent retroactive score changes
    is_active BOOLEAN DEFAULT TRUE, -- Used for Soft Deletes once consensus is reached
    engine_message VARCHAR(500) DEFAULT 'Pending...', -- Exposes algorithm logic to the frontend
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- DATABASE INDICES (Performance Optimization)
-- ==========================================

-- Index for O(log n) lookups when calculating consensus for a specific room
CREATE INDEX idx_report_history_room ON report_history(room_id);

-- Composite index to drastically speed up schedule cross-referencing based on current time
CREATE INDEX idx_schedule_day_time ON schedule_events(day_of_week, start_time, end_time);
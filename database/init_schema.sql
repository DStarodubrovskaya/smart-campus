-- Cleaning (for restart)
DROP TABLE IF EXISTS schedule_events CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Buildings' table
CREATE TABLE buildings (
    id SERIAL PRIMARY KEY, -- Unique ID
    name VARCHAR(100) NOT NULL UNIQUE, -- Name, like 'מ.ישראל'
    code VARCHAR(50) -- Building number/code like "604"
);

-- 2. Rooms' table
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY, -- Unique ID
    building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
    room_number VARCHAR(20) NOT NULL, -- Room number/code like "507"
    capacity INTEGER DEFAULT 0, -- Capacity
    UNIQUE(building_id, room_number) -- Защита от дублей
);

-- 3. Users' table
CREATE TABLE users (
    id SERIAL PRIMARY KEY, -- Unique ID
    app_user_id VARCHAR(50) UNIQUE NOT NULL, -- 'U181'
    role VARCHAR(20) CHECK (role IN ('Student', 'Lecturer')), -- User's title
    trust_score DECIMAL(5, 2) DEFAULT 0.50, -- Current trust level. Updated at each recalculation.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Schedule's table
CREATE TABLE schedule_events (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    course_name VARCHAR(255), -- Course title
    semester VARCHAR(10), -- Semester א/ב/ג
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL, -- Start time (from the Time-start column).
    end_time TIME NOT NULL -- End time (from the Time-end column).
);

-- Speed ​​indices (important for the application)
CREATE INDEX idx_schedule_day_time ON schedule_events(day_of_week, start_time, end_time);
-- Cornell Courses Database Schema

CREATE TABLE IF NOT EXISTS courses (
  -- Use Cornell's ID as primary key
  id TEXT PRIMARY KEY, -- e.g., "AAS-2100-101-4743"

  -- Course identifiers
  subject TEXT NOT NULL, -- e.g., "AAS"
  catalog_nbr TEXT NOT NULL, -- e.g., "2100"
  title TEXT NOT NULL,
  section TEXT NOT NULL, -- e.g., "101"
  class_nbr INTEGER NOT NULL,

  -- Course type and status
  component TEXT, -- SEM, LEC, DIS, etc.
  status TEXT, -- C (Closed), O (Open), etc.
  credits INTEGER,

  -- Description and content
  description TEXT,

  -- Meeting times
  meetings TEXT, -- JSON array of meeting time strings

  -- Instructor info  instructors TEXT, -- JSON array of instructor names

  prerequisites TEXT,
  restrictions TEXT,
  attributes TEXT, 

  notes TEXT, 

  text_for_embedding TEXT,

  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subject ON courses(subject);
CREATE INDEX IF NOT EXISTS idx_catalog_nbr ON courses(catalog_nbr);
CREATE INDEX IF NOT EXISTS idx_component ON courses(component);
CREATE INDEX IF NOT EXISTS idx_status ON courses(status);

CREATE TABLE IF NOT EXISTS user_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL, 
  notes TEXT,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (course_id) REFERENCES courses(id),
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_user_schedules ON user_schedules(user_id);

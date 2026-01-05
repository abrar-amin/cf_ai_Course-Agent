#  🍎📚🧠🤖 Cornell Course Agent 🍎📚🧠🤖

An AI-powered course scheduling assistant for Cornell University students. Built with Cloudflare Workers, D1, Vectorize, and Workers AI.

Access at: [Here!](https://courseagent.abraramin.dev)

<img width="383" height="786" alt="image" src="https://github.com/user-attachments/assets/29290a0d-e809-4a98-9228-7c099bd84182" />




<img width="383" height="779" alt="image" src="https://github.com/user-attachments/assets/f201edff-3daa-49b5-9c66-8cc5c8d71970" />




## Features

- **Semantic Course Search** - Natural language search powered by Cloudflare Vectorize embeddings
- **Visual Calendar** -  Schedule visualization 
- **Conflict Detection** - Automatic detection of time conflicts between courses
- **Advanced Filtering** - Search by subject, credits, instructor, distribution requirements, and more
- **AI Chat Interface** - Natural conversation with GPT-4 for course recommendations
=- **Real-time Updates** - Streaming AI responses and instant schedule updates

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Cloudflare Workers + Durable Objects
- **Database**: Cloudflare D1 (SQLite)
- **Vector Search**: Cloudflare Vectorize
- **AI**: Workers AI + OpenAI GPT-4
- **Deployment**: Cloudflare Pages/Workers

## Prereqs

- Cloudflare account with Workers subscription
- OpenAI API key
- Node.js 18+ and npm
- Cornell Course Roster Information

## Quick Start (Borrowed from Cloudflare Agents Quick Start)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd course-agent
npm install
```

### 2. Set up Environment Variables

Create a `.dev.vars` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Create Cloudflare Resources

```bash
# Login to Cloudflare
npx wrangler login

# Create D1 database
npx wrangler d1 create cornell-courses-db

# Create Vectorize index (768 dimensions for bge-base-en-v1.5)
npx wrangler vectorize create cornell-courses --dimensions=768 --metric=cosine
```

Update `wrangler.jsonc` with your database ID from the output above.

### 4. Initialize Database Schema

```bash
npx wrangler d1 execute cornell-courses-db --local --file=./schema.sql
```

### 5. Upload Course Data

Add your Cornell course data to `flattened_sections.json` (see data format below), then:

```bash
node scripts/upload-courses.js
```

This script will:
- Parse course data from JSON
- Generate embeddings using Workers AI
- Upload to D1 and Vectorize

### 6. Run Locally

```bash
npm start
```

## Database Schema

The application uses two main tables:

### `courses` Table
Stores course information including:
- Course metadata (subject, catalog number, title, credits)
- Meeting times, instructors, location
- Distribution requirements, grading basis
- Text embeddings for semantic search

### `user_schedules` Table
Stores user's selected courses:
- User ID (from Durable Object)
- Course ID reference
- Optional notes
- Timestamp

## Course Data Format

The ingestion script expects JSON in this format:

```json
[
  {
    "subject": "CS",
    "catalogNbr": "2110",
    "titleLong": "Object-Oriented Programming and Data Structures",
    "credits": 4,
    "meetings": ["MW 10:10AM-11:25AM", "TR 02:55PM-04:10PM"],
    "instructors": "Foster, Muhlberger",
    "component": "LEC",
    "location": "Olin Hall 155",
    "acadCareer": "UG",
    "acadGroup": "EN",
    "grading": "GRD",
    "attributes": ["MQR-AS"],
    "enrollGroups": [...]
  }
]
```

## Available AI Tools

The chat agent has access to these tools:

1. **searchCourses** - Semantic search using natural language
2. **advancedCourseSearch** - Filter by subject, credits, instructor, etc.
3. **getCourseDetails** - Get detailed info about a specific course
4. **addCourseToSchedule** - Add course to user's schedule (with conflict detection)
5. **viewMySchedule** - Display schedule with visual calendar
6. **removeCourseFromSchedule** - Remove course from schedule
7. **checkScheduleConflicts** - Check for time conflicts

## Architecture

### Semantic Search Flow
1. User query → Workers AI (bge-base-en-v1.5) → Query embedding
2. Vectorize similarity search → Top K course IDs
3. D1 lookup → Full course details
4. Return results to AI

### Schedule Management
1. User selects course via chat
2. Tool adds to `user_schedules` table
3. Conflict detection runs against existing courses
4. Visual calendar generated as SVG
5. SVG uploaded to tempfile.org
6. Markdown image returned to user

### User Sessions
- Each browser session gets a unique Durable Object ID
- Schedules persist per session (not across browser refreshes)
- To add persistent users, implement localStorage-based user IDs



## Acknowledgments

- Built with [Cloudflare Agents](https://developers.cloudflare.com/agents/)
- Course data from Cornell University Class Roster API

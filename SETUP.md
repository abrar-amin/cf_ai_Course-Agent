# Cornell Class Scheduler Setup

## Overview

This is an AI-powered Cornell course scheduler built on Cloudflare's stack:

- **Vectorize**: Semantic search over course descriptions
- **D1**: Structured course data and user schedules
- **Workers AI**: Generate embeddings for semantic search
- **Durable Objects**: Persistent user sessions and chat history

## Step 1: Create Cloudflare Resources

### Create Vectorize Index

```bash
npx wrangler vectorize create cornell-courses --dimensions=768 --metric=cosine
```

This creates a vector database for semantic course search. We use 768 dimensions because that's the output size of the `@cf/baai/bge-base-en-v1.5` embedding model.

### Create D1 Database

```bash
npx wrangler d1 create cornell-courses-db
```

**Important**: Copy the `database_id` from the output and update it in `wrangler.jsonc` (replace `TODO_REPLACE_AFTER_CREATION`).

### Initialize Database Schema

```bash
npx wrangler d1 execute cornell-courses-db --file=./schema.sql --local
```

For production:

```bash
npx wrangler d1 execute cornell-courses-db --file=./schema.sql --remote
```

## Step 2: Start Development Server

```bash
npm run dev
```

Your worker will be available at `http://localhost:8787`

## Step 3: Ingest Cornell Course Data

The ingestion script will:

1. Read your `flattened_sections.json` file
2. Generate embeddings using Workers AI
3. Store embeddings in Vectorize
4. Store structured data in D1

**For local development:**

```bash
node scripts/upload-courses.js http://localhost:5174
```

**For production:**

```bash
node scripts/upload-courses.js https://your-worker.workers.dev
```

This will process courses in batches of 100. Depending on the number of courses, this may take several minutes.

## Step 4: Deploy to Production

```bash
npm run deploy
```

Then run the ingestion script against your production URL.

## Features

Your AI assistant can now:

1. **Semantic Course Search**
   - "Find machine learning classes"
   - "Show me CS courses about databases"
   - "What AI classes are available?"

2. **Course Details**
   - View full course information
   - Check prerequisites and restrictions
   - See meeting times and instructors

3. **Schedule Building**
   - Add courses to personal schedule
   - View current schedule
   - Remove courses

4. **Conflict Detection**
   - Automatically checks for time conflicts
   - Warns about overlapping meeting times

## Architecture

```
User Query
    ↓
AI Agent (GPT-4)
    ↓
Tools:
├─ searchCourses → Vectorize (semantic search)
├─ getCourseDetails → D1 (structured data)
├─ addCourseToSchedule → D1 (user_schedules table)
├─ viewMySchedule → D1
├─ removeCourseFromSchedule → D1
└─ checkScheduleConflicts → D1 + conflict logic
```

## Data Flow

```
Cornell Course Data (flattened_sections.json)
         │
         ▼
POST /ingest-courses endpoint
         │
         ├─── Workers AI (generate embeddings)
         │
         ├─────────────┐
         ▼             ▼
    Vectorize        D1
   (embeddings)  (structured data)
         │             │
         └──────┬──────┘
                ▼
         AI Agent Tools
         (search, schedule)
```

## Troubleshooting

**Error: jsonSchema not initialized**

- This was the original error - now fixed by removing MCP dependency

**No results from search**

- Make sure you've ingested the course data
- Check that Vectorize index was created successfully

**TypeScript errors**

- Run `npm run types` to regenerate type definitions

**Database errors**

- Verify schema was applied: `npx wrangler d1 execute cornell-courses-db --command "SELECT COUNT(*) FROM courses"`

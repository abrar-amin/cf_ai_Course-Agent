/**
 * Course ingestion utilities
 * Handles importing Cornell course data into Vectorize and D1
 */

export interface CornellCourse {
  id: string;
  subject: string;
  catalogNbr: string;
  title: string;
  section: string;
  classNbr: number;
  component: string;
  credits: number;
  status: string;
  meetings: string[];
  instructors: string[];
  attributes: string[];
  prereqs: string;
  restrictions: string;
  description: string;
  notes: string[];
  text_for_embedding: string;
}

/**
 * Generate embedding for a course using Workers AI
 */
async function generateEmbedding(ai: Ai, text: string): Promise<number[]> {
  const response = (await ai.run("@cf/baai/bge-base-en-v1.5", {
    text: [text]
  })) as { data: number[][] };

  return response.data[0];
}

/**
 * Ingest a single course into D1 and Vectorize
 */
export async function ingestCourse(
  env: Env,
  course: CornellCourse
): Promise<{ courseId: string; vectorId: string | null }> {
  // 1. Insert into D1 (always insert all sections)
  await env.DB.prepare(
    `
    INSERT INTO courses (
      id, subject, catalog_nbr, title, section, class_nbr,
      component, status, credits, description, meetings,
      instructors, prerequisites, restrictions, attributes,
      notes, text_for_embedding
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id)
    DO UPDATE SET
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `
  )
    .bind(
      course.id,
      course.subject,
      course.catalogNbr,
      course.title,
      course.section,
      course.classNbr,
      course.component,
      course.status,
      course.credits,
      course.description,
      JSON.stringify(course.meetings),
      JSON.stringify(course.instructors),
      course.prereqs,
      course.restrictions,
      JSON.stringify(course.attributes),
      JSON.stringify(course.notes),
      course.text_for_embedding
    )
    .run();

  // 2. Only create embeddings for primary sections (LEC, SEM, IND, etc.)
  // Skip discussion/lab sections (DIS, LAB) to avoid duplicates in search
  const skipComponents = ["DIS", "LAB"];

  if (skipComponents.includes(course.component)) {
    console.log(`Skipping embedding for ${course.id} (${course.component})`);
    return { courseId: course.id, vectorId: null };
  }

  // 3. Generate embedding
  const embedding = await generateEmbedding(env.AI, course.text_for_embedding);

  // 4. Insert into Vectorize
  const vectorId = `course-${course.id}`;
  await env.VECTORIZE.upsert([
    {
      id: vectorId,
      values: embedding,
      metadata: {
        courseId: course.id,
        subject: course.subject,
        catalogNbr: course.catalogNbr,
        title: course.title,
        section: course.section,
        component: course.component
      }
    }
  ]);

  return { courseId: course.id, vectorId };
}

/**
 * Batch ingest multiple courses
 */
export async function ingestCourses(
  env: Env,
  courses: CornellCourse[]
): Promise<{ success: number; failed: number; errors: string[] }> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const course of courses) {
    try {
      await ingestCourse(env, course);
      success++;

      // Log progress every 50 courses
      if (success % 50 === 0) {
        console.log(`Ingested ${success}/${courses.length} courses`);
      }
    } catch (error) {
      failed++;
      const errorMsg = `Failed to ingest ${course.id}: ${error}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }
  }

  return { success, failed, errors };
}

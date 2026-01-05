/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import {
  removeCourseEmbeddings,
  meetingsConflict,
  findConflicts
} from "./course-helpers";
import { generateSVGCalendar, uploadSVGImage } from "./calendar-svg";

/**
 * Search for Cornell courses using semantic search
 */
const searchCourses = tool({
  description:
    "Search for Cornell courses using natural language. Returns relevant courses based on semantic similarity.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Natural language search query (e.g., 'machine learning classes', 'CS courses about AI')"
      ),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of results to return")
  }),
  execute: async ({ query, limit }) => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      const env = agent!.getEnv();

      console.log(`[searchCourses] Searching for: "${query}"`);

      // Generate embedding for the search query
      const response = (await env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: [query]
      })) as { data: number[][] };
      const queryEmbedding = response.data[0];

      console.log(
        `[searchCourses] Generated embedding with ${queryEmbedding.length} dimensions`
      );

      // Search Vectorize
      const results = await env.VECTORIZE.query(queryEmbedding, {
        topK: limit,
        returnMetadata: true
      });

      console.log(`[searchCourses] Found ${results.matches.length} matches`);

      if (results.matches.length === 0) {
        return "No courses found matching your query.";
      }

      // Get full course details from D1
      // Extract course ID from the vector ID (format: "course-AAS-2130-204-9713")
      const courseIds = results.matches.map((match) => {
        const courseId = match.id.replace("course-", "");
        console.log(
          `[searchCourses] Vector ID: ${match.id} → Course ID: ${courseId}`
        );
        return courseId;
      });
      console.log(
        `[searchCourses] Fetching details for ${courseIds.length} courses`
      );

      const placeholders = courseIds.map(() => "?").join(",");

      const courses = await env.DB.prepare(
        `SELECT * FROM courses WHERE id IN (${placeholders})`
      )
        .bind(...courseIds)
        .all();

      console.log(
        `[searchCourses] Retrieved ${courses.results.length} course details`
      );

      return {
        count: courses.results.length,
        courses: removeCourseEmbeddings(courses.results)
      };
    } catch (error) {
      console.error("[searchCourses] Error:", error);
      return `Error searching courses: ${error}`;
    }
  }
});

/**
 * Manual course search with filters (like Cornell course roster)
 */
const advancedCourseSearch = tool({
  description:
    "Search courses with specific filters: subject, credits, day of week, instructor, distribution requirements",
  inputSchema: z.object({
    subject: z
      .string()
      .optional()
      .describe("Subject code (e.g., 'CS', 'AAS', 'MATH')"),
    credits: z.number().optional().describe("Number of credits (e.g., 3, 4)"),
    dayOfWeek: z
      .string()
      .optional()
      .describe("Day of week (M, T, W, R, F or combinations like 'MW', 'TR')"),
    instructor: z
      .string()
      .optional()
      .describe("Instructor name (partial match)"),
    distributionReq: z
      .string()
      .optional()
      .describe("Distribution requirement (e.g., 'GLC-AS', 'MQR-AS', 'CA-AG')"),
    minCredits: z.number().optional().describe("Minimum credits"),
    maxCredits: z.number().optional().describe("Maximum credits"),
    catalogNbrStart: z
      .string()
      .optional()
      .describe(
        "Class level (e.g., '1000' for 1000-level, '2' for 2000-level)"
      ),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of results")
  }),
  execute: async ({
    subject,
    credits,
    dayOfWeek,
    instructor,
    distributionReq,
    minCredits,
    maxCredits,
    catalogNbrStart,
    limit
  }) => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      const env = agent!.getEnv();

      console.log(`[advancedCourseSearch] Filters:`, {
        subject,
        credits,
        dayOfWeek,
        instructor,
        distributionReq,
        minCredits,
        maxCredits,
        catalogNbrStart
      });

      // Build dynamic SQL query
      const conditions = ["component IN ('LEC', 'SEM')"];
      const params: any[] = [];

      if (subject) {
        conditions.push("subject = ?");
        params.push(subject.toUpperCase());
      }

      if (credits) {
        conditions.push("credits = ?");
        params.push(credits);
      }

      if (minCredits) {
        conditions.push("credits >= ?");
        params.push(minCredits);
      }

      if (maxCredits) {
        conditions.push("credits <= ?");
        params.push(maxCredits);
      }

      if (instructor) {
        conditions.push("instructors LIKE ?");
        params.push(`%${instructor}%`);
      }

      if (distributionReq) {
        // More precise matching - look for the exact attribute in the JSON array
        // e.g., ["GLC-AS", "OTHER"] should match "GLC-AS" but not "DLG-AG"
        conditions.push("attributes LIKE ?");
        params.push(`%"${distributionReq}"%`);
      }

      if (catalogNbrStart) {
        conditions.push("catalog_nbr LIKE ?");
        params.push(`${catalogNbrStart}%`);
      }

      if (dayOfWeek) {
        // Match any of the specified days in the meetings field
        const dayPattern = `%${dayOfWeek}%`;
        conditions.push("meetings LIKE ?");
        params.push(dayPattern);
      }

      params.push(limit);

      const query = `
        SELECT * FROM courses
        WHERE ${conditions.join(" AND ")}
        ORDER BY subject, catalog_nbr
        LIMIT ?
      `;

      console.log(`[advancedCourseSearch] Query:`, query);
      console.log(`[advancedCourseSearch] Params:`, params);

      const courses = await env.DB.prepare(query)
        .bind(...params)
        .all();

      console.log(
        `[advancedCourseSearch] Found ${courses.results.length} courses`
      );

      if (courses.results.length === 0) {
        return "No courses found matching your filters.";
      }

      return {
        count: courses.results.length,
        filters: {
          subject,
          credits,
          dayOfWeek,
          instructor,
          catalogNbrStart
        },
        courses: removeCourseEmbeddings(courses.results)
      };
    } catch (error) {
      console.error("[advancedCourseSearch] Error:", error);
      return `Error searching courses: ${error}`;
    }
  }
});

/**
 * Get detailed information about a specific course
 */
const getCourseDetails = tool({
  description:
    "Get detailed information about a specific Cornell course by its ID, or get all sections by subject and catalog number",
  inputSchema: z.object({
    courseId: z
      .string()
      .optional()
      .describe("The course ID (e.g., 'CS-2110-001-12345')"),
    subject: z.string().optional().describe("The subject code (e.g., 'CS')"),
    catalogNbr: z
      .string()
      .optional()
      .describe("The catalog number (e.g., '2110')")
  }),
  execute: async ({ courseId, subject, catalogNbr }) => {
    const { agent } = getCurrentAgent<Chat>();
    const env = agent!.getEnv();

    // If specific course ID provided, get that course
    if (courseId) {
      const course = await env.DB.prepare("SELECT * FROM courses WHERE id = ?")
        .bind(courseId)
        .first();

      if (!course) {
        return `Course ${courseId} not found.`;
      }

      return removeCourseEmbeddings([course])[0];
    }

    // If subject and catalogNbr provided, get all sections
    if (subject && catalogNbr) {
      const sections = await env.DB.prepare(
        "SELECT * FROM courses WHERE subject = ? AND catalog_nbr = ? ORDER BY component, section"
      )
        .bind(subject, catalogNbr)
        .all();

      if (sections.results.length === 0) {
        return `No sections found for ${subject} ${catalogNbr}.`;
      }

      return {
        course: `${subject} ${catalogNbr}`,
        totalSections: sections.results.length,
        sections: removeCourseEmbeddings(sections.results)
      };
    }

    return "Please provide either a courseId or both subject and catalogNbr.";
  }
});

/**
 * Add a course to the user's schedule
 */
const addCourseToSchedule = tool({
  description:
    "Add a Cornell course to the user's schedule and automatically check for conflicts",
  inputSchema: z.object({
    courseId: z.string().describe("The course ID to add"),
    notes: z.string().optional().describe("Optional notes about this course")
  }),
  execute: async ({ courseId, notes }) => {
    const { agent } = getCurrentAgent<Chat>();
    const env = agent!.getEnv();
    const userId = agent!.getUserId();

    try {
      // Get the course details being added
      const newCourse = await env.DB.prepare(
        "SELECT * FROM courses WHERE id = ?"
      )
        .bind(courseId)
        .first();

      if (!newCourse) {
        return `Error: Course ${courseId} not found in the catalog.`;
      }

      // Add to schedule
      await env.DB.prepare(
        `INSERT INTO user_schedules (user_id, course_id, notes)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, course_id) DO UPDATE SET notes = excluded.notes`
      )
        .bind(userId, courseId, notes || null)
        .run();

      // Check for conflicts with existing courses
      const existingCourses = await env.DB.prepare(
        `SELECT c.* FROM user_schedules us
         JOIN courses c ON us.course_id = c.id
         WHERE us.user_id = ? AND c.id != ?`
      )
        .bind(userId, courseId)
        .all();

      const conflicts: string[] = [];
      const newMeetings = JSON.parse(newCourse.meetings as string) as string[];

      // Check each existing course for conflicts
      for (const existingCourse of existingCourses.results) {
        const existingMeetings = JSON.parse(
          existingCourse.meetings as string
        ) as string[];

        for (const newMeeting of newMeetings) {
          for (const existingMeeting of existingMeetings) {
            if (meetingsConflict(newMeeting, existingMeeting)) {
              const conflictMsg = `⚠️  Conflicts with ${existingCourse.subject} ${existingCourse.catalog_nbr}: ${newMeeting} overlaps with ${existingMeeting}`;
              conflicts.push(conflictMsg);
            }
          }
        }
      }

      // Build response
      let response = `✅ Successfully added ${newCourse.subject} ${newCourse.catalog_nbr}: ${newCourse.title} to your schedule.`;

      if (conflicts.length > 0) {
        response += `\n\n**Time Conflicts Detected:**\n${conflicts.join("\n")}`;
      }

      return response;
    } catch (error) {
      return `Error adding course: ${error}`;
    }
  }
});

/**
 * View the user's current schedule
 */
const viewMySchedule = tool({
  description:
    "Display the user's schedule as a visual weekly calendar. Call this whenever the user asks to see, view, show, or display their schedule.",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();
    const env = agent!.getEnv();
    const userId = agent!.getUserId();

    const result = await env.DB.prepare(
      `SELECT c.*, us.notes, us.added_at
       FROM user_schedules us
       JOIN courses c ON us.course_id = c.id
       WHERE us.user_id = ?
       ORDER BY c.subject, c.catalog_nbr`
    )
      .bind(userId)
      .all();

    if (result.results.length === 0) {
      return "Your schedule is empty. Use searchCourses to find classes and addCourseToSchedule to add them.";
    }

    // Parse all course meetings and organize by day
    const dayMap: Record<
      string,
      Array<{ time: string; course: string; title: string }>
    > = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: []
    };

    const dayCodeToName: Record<string, string> = {
      M: "Monday",
      T: "Tuesday",
      W: "Wednesday",
      R: "Thursday",
      F: "Friday"
    };

    result.results.forEach((course: any) => {
      const meetings = JSON.parse(course.meetings) as string[];
      const courseLabel = `${course.subject} ${course.catalog_nbr}`;

      meetings.forEach((meeting: string) => {
        const parts = meeting.split(" ");
        if (parts.length >= 2) {
          const [days, time] = parts;

          for (const dayCode of days) {
            const dayName = dayCodeToName[dayCode];
            if (dayName) {
              dayMap[dayName].push({
                time,
                course: courseLabel,
                title: course.title as string
              });
            }
          }
        }
      });
    });

    // Build text schedule
    let textSchedule = `📅 Your Weekly Schedule (${result.results.length} courses)\n\n`;
    for (const [day, classes] of Object.entries(dayMap)) {
      textSchedule += `**${day}:**\n`;
      if (classes.length === 0) {
        textSchedule += `  No classes\n`;
      } else {
        classes.forEach(({ time, course, title }) => {
          textSchedule += `  ${time} - ${course}: ${title}\n`;
        });
      }
      textSchedule += `\n`;
    }

    // Generate and upload SVG calendar
    try {
      const svgCalendar = generateSVGCalendar(result.results);
      const imageUrl = await uploadSVGImage(svgCalendar);

      if (imageUrl) {
        return `${textSchedule}\n**Visual Calendar:**\n![Weekly Schedule](${imageUrl})`;
      }
    } catch (error) {
      console.error("[viewMySchedule] Error generating/uploading SVG:", error);
    }

    // Fallback to text-only if upload fails
    return textSchedule;
  }
});

/**
 * Check for time conflicts in the user's schedule
 */
const checkScheduleConflicts = tool({
  description:
    "Check for time conflicts between courses in the user's schedule",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();
    const env = agent!.getEnv();
    const userId = agent!.getUserId();

    const result = await env.DB.prepare(
      `SELECT c.id, c.title, c.subject, c.catalog_nbr, c.meetings
       FROM user_schedules us
       JOIN courses c ON us.course_id = c.id
       WHERE us.user_id = ?`
    )
      .bind(userId)
      .all();

    if (result.results.length < 2) {
      return "You need at least 2 courses in your schedule to check for conflicts.";
    }

    const conflicts = findConflicts(result.results as any[]);

    if (conflicts.length === 0) {
      return "No time conflicts found in your schedule!";
    }

    return {
      conflictCount: conflicts.length,
      conflicts
    };
  }
});

/**
 * Remove a course from the user's schedule
 */
const removeCourseFromSchedule = tool({
  description: "Remove a course from the user's schedule",
  inputSchema: z.object({
    courseId: z
      .string()
      .describe("Subject and catalog number in format 'CS-2110'")
  }),
  execute: async ({ courseId }) => {
    const { agent } = getCurrentAgent<Chat>();
    const env = agent!.getEnv();
    const userId = agent!.getUserId();

    const parts = courseId.split("-");
    const subject = parts[0];
    const catalogNbr = parts[1];

    const result = await env.DB.prepare(
      `DELETE FROM user_schedules
       WHERE user_id = ?
       AND course_id IN (
         SELECT id FROM courses
         WHERE subject = ? AND catalog_nbr = ?
       )`
    )
      .bind(userId, subject, catalogNbr)
      .run();

    if (result.meta.changes === 0) {
      return `Course ${courseId} was not in your schedule.`;
    }

    return `Successfully removed course ${courseId} from your schedule.`;
  }
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  searchCourses,
  advancedCourseSearch,
  getCourseDetails,
  addCourseToSchedule,
  viewMySchedule,
  removeCourseFromSchedule,
  checkScheduleConflicts
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {};

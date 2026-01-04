/**
 * Helper functions for course data processing
 * Centralized utilities for parsing, formatting, and manipulating course information
 */

/**
 * Represents a Cornell course with all its details
 */
export interface Course {
  id: string;
  subject: string;
  catalog_nbr: string;
  title: string;
  meetings: string; // JSON string of meeting times
  [key: string]: any;
}

/**
 * Represents a single meeting time for a course
 */
export interface Meeting {
  days: string; // Day codes (e.g., "MW", "TR")
  time: string; // Time range (e.g., "10:10AM-11:25AM")
  course: string; // Course label (e.g., "CS 2110")
  title: string; // Course title
}

/**
 * Represents a time conflict between two courses
 */
export interface Conflict {
  course1: string;
  course2: string;
  reason: string;
}

/**
 * Remove embedding text from course objects to reduce token usage
 */
export function removeCourseEmbeddings(courses: any[]): any[] {
  return courses.map((course) => {
    const { text_for_embedding, ...rest } = course;
    return rest;
  });
}

/**
 * Convert time string like "10:10AM" to minutes since midnight
 */
export function timeToMinutes(timeStr: string): number {
  const match = timeStr.match(/(\d+):(\d+)(AM|PM)/);
  if (!match) return 0;

  const [, hoursStr, minutesStr, period] = match;
  let hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  // Convert to 24-hour format
  if (period === "PM" && hours !== 12) {
    hours += 12;
  }
  if (period === "AM" && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

/**
 * Check if two meeting time strings conflict
 * Example: "MW 10:10AM-11:25AM" vs "TR 02:55PM-04:10PM"
 */
export function meetingsConflict(meeting1: string, meeting2: string): boolean {
  try {
    const parts1 = meeting1.split(" ");
    const parts2 = meeting2.split(" ");

    if (parts1.length < 2 || parts2.length < 2) {
      return false;
    }

    const [days1, time1] = parts1;
    const [days2, time2] = parts2;

    // Check if days overlap
    const daysOverlap = days1.split("").some((day) => days2.includes(day));
    if (!daysOverlap) {
      return false;
    }

    // Parse time ranges
    const [start1, end1] = time1.split("-");
    const [start2, end2] = time2.split("-");

    const start1Min = timeToMinutes(start1);
    const end1Min = timeToMinutes(end1);
    const start2Min = timeToMinutes(start2);
    const end2Min = timeToMinutes(end2);

    // Check if time ranges overlap
    return start1Min < end2Min && start2Min < end1Min;
  } catch (error) {
    console.error("Error checking meeting conflict:", error);
    return false;
  }
}

/**
 * Parse meetings from a course and organize by day of week
 */
export function parseMeetingsByDay(course: Course): Map<string, Meeting[]> {
  const dayMap = new Map<string, Meeting[]>([
    ["Monday", []],
    ["Tuesday", []],
    ["Wednesday", []],
    ["Thursday", []],
    ["Friday", []]
  ]);

  const dayCodeToName: Record<string, string> = {
    M: "Monday",
    T: "Tuesday",
    W: "Wednesday",
    R: "Thursday",
    F: "Friday"
  };

  const meetings = JSON.parse(course.meetings) as string[];
  const courseLabel = `${course.subject} ${course.catalog_nbr}`;

  for (const meeting of meetings) {
    const parts = meeting.split(" ");
    if (parts.length < 2) continue;

    const [days, time] = parts;

    // Add to each day this course meets
    for (const dayCode of days.split("")) {
      const dayName = dayCodeToName[dayCode];
      if (dayName) {
        const dayMeetings = dayMap.get(dayName) || [];
        dayMeetings.push({
          days,
          time,
          course: courseLabel,
          title: course.title
        });
        dayMap.set(dayName, dayMeetings);
      }
    }
  }

  return dayMap;
}

/**
 * Find all time conflicts between courses
 */
export function findConflicts(courses: Course[]): Conflict[] {
  const conflicts: Conflict[] = [];

  // Compare each pair of courses
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const course1 = courses[i];
      const course2 = courses[j];

      const meetings1 = JSON.parse(course1.meetings) as string[];
      const meetings2 = JSON.parse(course2.meetings) as string[];

      // Check each meeting combination
      for (const meeting1 of meetings1) {
        for (const meeting2 of meetings2) {
          if (meetingsConflict(meeting1, meeting2)) {
            conflicts.push({
              course1: `${course1.subject} ${course1.catalog_nbr}: ${course1.title}`,
              course2: `${course2.subject} ${course2.catalog_nbr}: ${course2.title}`,
              reason: `${meeting1} conflicts with ${meeting2}`
            });
          }
        }
      }
    }
  }

  return conflicts;
}

/**
 * Format a text schedule summary from courses organized by day
 */
export function formatTextSchedule(
  dayMap: Map<string, Meeting[]>,
  totalCourses: number
): string {
  let schedule = `📅 Your Weekly Schedule (${totalCourses} courses)\n\n`;

  for (const [day, meetings] of dayMap.entries()) {
    schedule += `**${day}:**\n`;

    if (meetings.length === 0) {
      schedule += `  No classes\n`;
    } else {
      for (const meeting of meetings) {
        schedule += `  ${meeting.time} - ${meeting.course}: ${meeting.title}\n`;
      }
    }

    schedule += `\n`;
  }

  return schedule;
}

/**
 * SVG Calendar Visualization
 * Generates a visual weekly calendar from course data
 */

import { timeToMinutes } from "./course-helpers";

interface CourseBlock {
  course: string;
  title: string;
  startTime: string;
  endTime: string;
  color: string;
}

interface CalendarConfig {
  width: number;
  height: number;
  headerHeight: number;
  timeColumnWidth: number;
  hourHeight: number;
  startHour: number;
  endHour: number;
}

const DEFAULT_CONFIG: CalendarConfig = {
  width: 900,
  height: 700,
  headerHeight: 50,
  timeColumnWidth: 80,
  hourHeight: 50,
  startHour: 8,
  endHour: 20
};

const DAYS = ["M", "T", "W", "R", "F"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6"
];

/**
 * Generate the SVG header with styles
 */
function generateSVGHeader(config: CalendarConfig): string {
  const styles = `
    .course-block { rx:4; stroke:#fff; stroke-width:2 }
    .course-text { fill:#fff; font-family:Arial,sans-serif; font-size:11px; font-weight:600 }
    .time-text { fill:#64748b; font-family:Arial,sans-serif; font-size:12px }
    .header-text { fill:#1e293b; font-family:Arial,sans-serif; font-size:14px; font-weight:700 }
  `;

  return `
    <svg width="${config.width}" height="${config.height}" xmlns="http://www.w3.org/2000/svg">
      <defs><style>${styles}</style></defs>
      <rect width="${config.width}" height="${config.height}" fill="#f8fafc"/>
  `;
}

/**
 * Generate the calendar header with day names
 */
function generateHeader(config: CalendarConfig): string {
  const dayWidth = (config.width - config.timeColumnWidth) / 5;
  let header = `<rect width="${config.width}" height="${config.headerHeight}" fill="#e2e8f0"/>`;

  DAY_NAMES.forEach((dayName, i) => {
    const x = config.timeColumnWidth + i * dayWidth + dayWidth / 2;
    const y = config.headerHeight / 2 + 5;
    header += `<text x="${x}" y="${y}" text-anchor="middle" class="header-text">${dayName}</text>`;
  });

  return header;
}

/**
 * Generate time labels and grid lines
 */
function generateTimeGrid(config: CalendarConfig): string {
  let grid = "";
  const dayWidth = (config.width - config.timeColumnWidth) / 5;

  // Horizontal time lines
  for (let hour = config.startHour; hour <= config.endHour; hour++) {
    const y =
      config.headerHeight + (hour - config.startHour) * config.hourHeight;
    const timeLabel = formatHourLabel(hour);

    grid += `<text x="10" y="${y + 15}" class="time-text">${timeLabel}</text>`;
    grid += `<line x1="${config.timeColumnWidth}" y1="${y}" x2="${config.width}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
  }

  // Vertical day dividers
  DAYS.forEach((_, i) => {
    const x = config.timeColumnWidth + i * dayWidth;
    grid += `<line x1="${x}" y1="${config.headerHeight}" x2="${x}" y2="${config.height}" stroke="#e2e8f0" stroke-width="1"/>`;
  });

  return grid;
}

/**
 * Format hour as "8AM", "12PM", etc.
 */
function formatHourLabel(hour: number): string {
  if (hour > 12) return `${hour - 12}PM`;
  if (hour === 12) return "12PM";
  return `${hour}AM`;
}

/**
 * Parse course meetings and organize by day
 */
function parseCourseMeetings(courses: any[]): Map<string, CourseBlock[]> {
  const dayMap = new Map<string, CourseBlock[]>();
  for (const day of DAYS) {
    dayMap.set(day, []);
  }

  // Create a mapping of unique courses to color indices
  // All sections of the same course (LEC, DIS, LAB) get the same color
  const courseColorMap = new Map<string, string>();
  const uniqueCourses: string[] = [];

  courses.forEach((course) => {
    const courseKey = `${course.subject} ${course.catalog_nbr}`;
    if (!courseColorMap.has(courseKey)) {
      const colorIdx = uniqueCourses.length;
      courseColorMap.set(courseKey, COLORS[colorIdx % COLORS.length]);
      uniqueCourses.push(courseKey);
    }
  });

  courses.forEach((course) => {
    const meetings = JSON.parse(course.meetings) as string[];
    const courseKey = `${course.subject} ${course.catalog_nbr}`;
    const color = courseColorMap.get(courseKey)!;

    meetings.forEach((meeting) => {
      const parts = meeting.split(" ");
      if (parts.length < 2) return;

      const [daysStr, timeStr] = parts;
      const [startTime, endTime] = timeStr.split("-");

      // Add block to each day
      for (const dayCode of daysStr.split("")) {
        if (DAYS.includes(dayCode)) {
          const blocks = dayMap.get(dayCode) || [];
          blocks.push({
            course: courseKey,
            title: course.title,
            startTime,
            endTime,
            color
          });
          dayMap.set(dayCode, blocks);
        }
      }
    });
  });

  return dayMap;
}

/**
 * Generate course block SVG elements
 */
function generateCourseBlocks(
  dayMap: Map<string, CourseBlock[]>,
  config: CalendarConfig
): string {
  let blocks = "";
  const dayWidth = (config.width - config.timeColumnWidth) / 5;

  DAYS.forEach((day, dayIdx) => {
    const courseBlocks = dayMap.get(day) || [];

    courseBlocks.forEach((block) => {
      const startMin = timeToMinutes(block.startTime);
      const endMin = timeToMinutes(block.endTime);

      // Calculate position and size
      const startY =
        config.headerHeight +
        (startMin / 60 - config.startHour) * config.hourHeight;
      const blockHeight = ((endMin - startMin) / 60) * config.hourHeight;
      const x = config.timeColumnWidth + dayIdx * dayWidth + 5;
      const blockWidth = dayWidth - 10;

      // Draw block
      blocks += `<rect x="${x}" y="${startY}" width="${blockWidth}" height="${blockHeight}" fill="${block.color}" class="course-block"/>`;

      // Add course code text
      const textX = x + blockWidth / 2;
      blocks += `<text x="${textX}" y="${startY + 18}" text-anchor="middle" class="course-text">${block.course}</text>`;

      // Add time text
      const shortStart = block.startTime.replace(/([AP]M)/, "").trim();
      const shortEnd = block.endTime.replace(/([AP]M)/, "").trim();
      blocks += `<text x="${textX}" y="${startY + 32}" text-anchor="middle" class="course-text" opacity="0.9">${shortStart}-${shortEnd}</text>`;
    });
  });

  return blocks;
}

/**
 * Generate complete SVG calendar visualization
 */
export function generateSVGCalendar(courses: any[]): string {
  const config = DEFAULT_CONFIG;

  const svg = [
    generateSVGHeader(config),
    generateHeader(config),
    generateTimeGrid(config),
    generateCourseBlocks(parseCourseMeetings(courses), config),
    "</svg>"
  ].join("\n");

  return svg;
}

/**
 * Upload SVG to temporary hosting service
 * Returns the direct URL to the uploaded image
 */
export async function uploadSVGImage(
  svgContent: string
): Promise<string | null> {
  try {
    const formData = new FormData();
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    formData.append("files", blob, "schedule.svg");
    formData.append("expiryHours", "24");

    const response = await fetch("https://tempfile.org/api/upload/local", {
      method: "POST",
      body: formData
    });

    const responseText = await response.text();
    const data = JSON.parse(responseText);

    if (data.success && data.files && data.files.length > 0) {
      const baseUrl = data.files[0].url;
      const downloadUrl = `${baseUrl}download`;
      return downloadUrl;
    }

    console.error("[uploadSVGImage] Upload failed:", data);
    return null;
  } catch (error) {
    console.error("[uploadSVGImage] Upload error:", error);
    return null;
  }
}

/**
 * Upload Cornell course data to Cloudflare
 *
 * Usage:
 *   node scripts/upload-courses.js [url] [file]
 *
 * Examples:
 *   node scripts/upload-courses.js http://localhost:8787
 *   node scripts/upload-courses.js http://localhost:8787 sample
 *   node scripts/upload-courses.js https://your-worker.workers.dev full
 */

import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function uploadCourses() {
  // Get URL from command line or use localhost
  const url = process.argv[2] || "http://localhost:8787";
  const fileType = process.argv[3] || "sample"; // 'sample' or 'full'

  // Choose file based on type
  const filename =
    fileType === "full"
      ? "flattened_sections.json"
      : "flattened_sections_sample.json";

  console.log(`Reading course data from ${filename}...`);
  const coursesPath = join(__dirname, "..", filename);
  const coursesData = await readFile(coursesPath, "utf-8");
  const courses = JSON.parse(coursesData);

  console.log(`Found ${courses.length} courses to upload`);
  console.log(`Uploading to: ${url}/ingest-courses`);

  // Upload in batches to avoid timeouts
  const BATCH_SIZE = 45;
  let totalSuccess = 0;
  let totalFailed = 0;
  const allErrors = [];

  for (let i = 0; i < courses.length; i += BATCH_SIZE) {
    const batch = courses.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(courses.length / BATCH_SIZE);

    console.log(
      `\nUploading batch ${batchNum}/${totalBatches} (${batch.length} courses)...`
    );

    try {
      const response = await fetch(`${url}/ingest-courses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(batch)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      totalSuccess += result.success;
      totalFailed += result.failed;

      if (result.errors && result.errors.length > 0) {
        allErrors.push(...result.errors);
      }

      console.log(
        `✓ Batch ${batchNum} complete: ${result.success} succeeded, ${result.failed} failed`
      );
    } catch (error) {
      console.error(`✗ Batch ${batchNum} failed:`, error.message);
      totalFailed += batch.length;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("Upload complete!");
  console.log(`Total: ${totalSuccess} succeeded, ${totalFailed} failed`);

  if (allErrors.length > 0) {
    console.log("\nErrors:");
    allErrors.slice(0, 10).forEach((err) => console.log(`  - ${err}`));
    if (allErrors.length > 10) {
      console.log(`  ... and ${allErrors.length - 10} more`);
    }
  }
}

uploadCourses().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

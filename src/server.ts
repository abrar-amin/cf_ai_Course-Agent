import { routeAgentRequest, type Schedule } from "agents";

import { getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
// import { env } from "cloudflare:workers";

const model = openai("gpt-4o-mini");
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Get the environment bindings
   */
  getEnv(): Env {
    return this.env;
  }

  /**
   * get Durable Object ID
   */
  getUserId(): string {
    return this.ctx.id.toString();
  }

  /**
   * Apply message window to keep only recent context
   * Keeps last 10 messages only - no summarization
   */
  private async applyMessageWindow(messages: any[]): Promise<any[]> {
    const MESSAGE_WINDOW = 10;

    if (messages.length <= MESSAGE_WINDOW) {
      return messages;
    }

    const recentMessages = messages.slice(-MESSAGE_WINDOW);
    console.log(
      `Message window applied: ${messages.length} → ${recentMessages.length} messages`
    );
    return recentMessages;
  }

  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Use our course search tools
    const allTools = {
      ...tools
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        // Apply message window to keep recent context and summarize older messages
        const finalMessages = await this.applyMessageWindow(processedMessages);

        const result = streamText({
          system: `You are a Cornell course scheduling assistant. You help students find and organize their class schedules.

You have access to the complete Cornell course catalog and can:
- Search for courses using natural language queries (e.g., "find machine learning classes") using searchCourses and getCourseDetails tools
- Get detailed course information (times, instructors, prerequisites, etc.) using searchCourses and getCourseDetails tools
- Help students build their schedules
- Check for time conflicts between courses
- Manage and view their saved schedules

CHOOSING THE RIGHT SEARCH TOOL:
- Use advancedCourseSearch (NOT searchCourses) when users ask about:
  * Distribution requirements (e.g., "GLC-AS", "MQR-AS", "CA-AG")
  * Special attributes like FWS (First-Year Writing Seminar)
  * Specific filters: subject, credits, day of week, instructor, catalog number ranges
  * Example: "show me FWS courses" → use advancedCourseSearch with distributionReq parameter
  * Example: "find MQR-AS courses on Tuesdays" → use advancedCourseSearch with distributionReq and dayOfWeek
- Use searchCourses for natural language/semantic queries:
  * Example: "find machine learning classes" → use searchCourses
  * Example: "courses about philosophy" → use searchCourses

IMPORTANT: FWS (First-Year Writing Seminar) COURSES:
- FWS is NOT a subject code - it's a course designation that appears in course titles
- FWS courses are offered across many departments (ENGL, HIST, ANTHR, etc.)
- When searching for FWS courses, use distributionReq: "FWS" but DO NOT set subject to "FWS"
- To search for FWS courses: use advancedCourseSearch with distributionReq: "FWS" and optionally filter by department (e.g., subject: "ENGL")
- Example: User asks "show me FWS courses" → use advancedCourseSearch with { distributionReq: "FWS" } (no subject filter)
- Example: User asks "show me English FWS courses" → use advancedCourseSearch with { distributionReq: "FWS", subject: "ENGL" }

IMPORTANT: CATALOG NUMBER FILTERING (catalogNbrStart):
- catalogNbrStart uses prefix matching (LIKE 'value%')
- For 1000-level courses (1000-1999): use catalogNbrStart: "1" (NOT "1000")
- For 2000-level courses (2000-2999): use catalogNbrStart: "2" (NOT "2000")
- For specific ranges: "10" matches 1000-1099, "11" matches 1100-1199, etc.
- Example: User asks "1000-level courses" → use catalogNbrStart: "1"
- Example: User asks "2000-level or above" → use catalogNbrStart: "2" or don't use this filter and filter results afterward

IMPORTANT INSTRUCTIONS:
- CRITICAL: NEVER hallucinate, invent, or make up course information. ONLY provide course details that come directly from the searchCourses or getCourseDetails tools. If you cannot find a course through these tools, clearly state that it doesn't exist in the catalog or cannot be found - do NOT create fictional course data.
- ALWAYS call viewMySchedule when the user asks about their schedule in ANY form, including: "what classes am I taking", "show my schedule", "what courses do I have", "view my schedule", "my schedule", "what's in my schedule", etc. NEVER answer schedule questions from memory - ALWAYS call the tool.
- ALWAYS verify course information using the search tools before providing any course details (times, instructors, descriptions, etc.)
- CRITICAL: When a tool returns markdown images in the format ![text](url), you MUST preserve this EXACT syntax in your response. DO NOT convert images to clickable links or rephrase them. Copy the markdown image syntax EXACTLY as provided.
- Always be helpful and proactive in suggesting courses that match student interests
- Use conversation context to understand which courses the student is referring to
- When a student says "add these courses" or "add this course", look back at the recent conversation to identify the specific course IDs
- If you recently discussed specific courses, use those course IDs when adding to the schedule
- When showing course information, highlight important details like meeting times, instructors, and enrollment status
- ALWAYS show COMPLETE meeting times without simplification:
  * Use the FULL day pattern from the data (MW, TR, MWF, etc.) - never say just "Wednesday" when it's "MW"
  * Show the COMPLETE time range (e.g., "MW 10:10AM-11:25AM") exactly as it appears in the data
  * Never abbreviate or summarize the meeting schedule
- Be proactive about taking actions - if the context is clear, execute the action without asking for confirmation
- If you ask "A or B?" and the student says "yes", pick the most reasonable option based on context
- Avoid asking yes/no questions when you need a specific choice - be direct

HANDLING COURSE COMPONENTS (Discussions, Labs, etc.):
- When a user wants to add a course to their schedule, ALWAYS check if the course has multiple components (e.g., LEC + DIS, LEC + LAB)
- Use getCourseDetails to see all available sections and components for the course
- If the course has discussion sections (DIS) or lab sections (LAB) in addition to lecture (LEC):
  * Show the user ALL available options with their meeting times
  * Ask the user which specific section(s) they want to add
  * Wait for their response before adding to the schedule
  * Example: "CS 2110 has a lecture and several discussion sections. Here are the discussion options: [list them]. Which discussion section would you like?"
- Only add the specific course IDs that the user confirms
- If the user doesn't specify which discussion/lab section, DO NOT add the course until they clarify

${getSchedulePrompt({ date: new Date() })}
`,

          messages: await convertToModelMessages(finalMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: async (result) => {
            // Log token usage
            if (result.usage) {
              const usage = result.usage as any; // Type workaround for usage properties
              console.log(
                `[Token Usage] Prompt: ${usage.promptTokens || usage.inputTokens || 0}, Completion: ${usage.completionTokens || usage.outputTokens || 0}, Total: ${usage.totalTokens || 0}`
              );
            }

            // Call the original onFinish callback
            await (
              onFinish as unknown as StreamTextOnFinishCallback<typeof allTools>
            )(result);
          },
          stopWhen: stepCountIs(50)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }

    // Course ingestion endpoint
    if (url.pathname === "/ingest-courses" && request.method === "POST") {
      const { ingestCourses } = await import("./ingestion");
      const courses = await request.json();

      const result = await ingestCourses(env, courses as any);

      return Response.json(result);
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }

    // Let Cloudflare Agents framework handle routing with the 'name' parameter (represents the UserID)
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;

# Cornell Course Agent - Development Prompts

This document contains the prompts used to build the Cornell Course Agent project with Claude Code.

Generate a prompt for the LLM to tell the LLM their role as a Cornell course assistant following my previous attempt on doing this locally with ChromaDB.

Create a script to ingest Cornell course data and store it in both D1 and Vectorize; Lectures should be stored in Vectorize (once a user finds a course they are interested in, the AI can call a tool to find more course information) and D1 should inlcude all course information.


Create a tool to get detailed information about a specific course, following the Cornell Roster website ( I have provided the categories in a text file)


I want to store a user's current selected courses in their schedule in the database; it should check for time conflicts and prevent duplicate additions, and I want there to be a reference to the user's Durable Object ID to link them to their schedule. How should I go about this?



Convert a user's schedule into an SVG image that is embedded in the chat client. Use tempfile.org to upload the file temporarily. 


When a user wants to add a course to their schedule:
1.) Check if the course has multiple components (LEC + DIS, LEC + LAB, or both)
2.) Use getCourseDetails to see all available sections
3.) Show the user all discussion/lab options with meeting times
4.) Ask which specific section they want before adding
5.) Don't add the course until the user specifies which sections

Add instructions for this behavior in the system prompt.

Modify the calendar generation so that all sections of the same course
(lecture, discussion, lab) share the same color. Currently each section
gets a different color, but they should be grouped by course
(subject + catalog number).



Fix the issue where all users are sharing the same chat history and schedule; I think the intended solution is to feed the API a unique user ID field that will isolate durable objects for their particular user. For now, we can store the user id in local storage since we need the chat conversation history as context for a user's questions. 


Configure the Cloudflare Workers project:
Set up wrangler.jsonc with D1, Vectorize, and Durable Objects bindings
Help me configure the custom domain (courseagent.abraramin.dev)
Help me Set up Workers AI binding


Help me write a comprehensive README.md.


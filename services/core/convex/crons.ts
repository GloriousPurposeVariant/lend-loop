import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Scheduled jobs. Convex reads this file by name and runs each job on the server.
const crons = cronJobs();

crons.interval("delete unattached uploads", { hours: 1 }, internal.toolImages.deleteUnattached, {});

export default crons;

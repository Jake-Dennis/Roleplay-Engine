import { BenchmarkReport, BenchmarkConfig } from "./types";
import { APP_CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface BenchmarkJob {
  jobId: string;
  userId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message: string;
  /** Current high-level stage (init, model-meta, context-test, throughput-test, memory-retention, auto-tune, complete, error) */
  stage?: string;
  /** Sub-test identifier within the current stage (e.g. "context-test-16384", "throughput-4096") */
  currentTest?: string;
  /** Stage-specific progress: "tested N of M sizes" for context/throughput tests */
  stageProgress?: { current: number; total: number };
  config: BenchmarkConfig;
  report?: BenchmarkReport;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

const jobStore = new Map<string, BenchmarkJob>();

const BENCHMARKS_DIR = path.join(APP_CONFIG.dataDir, "benchmarks");

async function ensureBenchmarksDir(userId: string): Promise<string> {
  const userDir = path.join(BENCHMARKS_DIR, userId);
  await fs.mkdir(userDir, { recursive: true });
  return userDir;
}

function getJobFilePath(userId: string, jobId: string): string {
  return path.join(BENCHMARKS_DIR, userId, `${jobId}.json`);
}

export function generateJobId(userId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `benchmark-${userId}-${timestamp}-${random}`;
}

export function createJob(userId: string, config: BenchmarkConfig): BenchmarkJob {
  const jobId = generateJobId(userId);
  const now = new Date().toISOString();
  
  const job: BenchmarkJob = {
    jobId,
    userId,
    status: "queued",
    progress: 0,
    message: "Queued",
    config,
    createdAt: now,
    updatedAt: now,
  };
  
  jobStore.set(jobId, job);
  return job;
}

export function getJob(jobId: string): BenchmarkJob | undefined {
  return jobStore.get(jobId);
}

export function getUserJobs(userId: string): BenchmarkJob[] {
  return Array.from(jobStore.values())
    .filter(job => job.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function updateJob(jobId: string, updates: Partial<BenchmarkJob>): BenchmarkJob | undefined {
  const job = jobStore.get(jobId);
  if (!job) return undefined;
  
  const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
  jobStore.set(jobId, updated);
  return updated;
}

export function deleteJob(jobId: string): boolean {
  return jobStore.delete(jobId);
}

export async function persistJob(job: BenchmarkJob): Promise<void> {
  try {
    await ensureBenchmarksDir(job.userId);
    const filePath = getJobFilePath(job.userId, job.jobId);
    await fs.writeFile(filePath, JSON.stringify(job, null, 2));
  } catch (error) {
    logger.error("[benchmark-job-store] Failed to persist job", { jobId: job.jobId, error: String(error) });
  }
}

export async function loadUserJobs(userId: string): Promise<BenchmarkJob[]> {
  const userDir = path.join(BENCHMARKS_DIR, userId);
  try {
    const files = await fs.readdir(userDir);
    const jobs: BenchmarkJob[] = [];
    
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const filePath = path.join(userDir, file);
        const content = await fs.readFile(filePath, "utf-8");
        const job = JSON.parse(content) as BenchmarkJob;
        
        // Only overwrite in-memory job if it's NOT already tracked in memory,
        // or if the on-disk version has a newer updatedAt (e.g. completed/failed
        // was persisted while the in-memory version is stale from a crash).
        // This prevents live progress updates (in-memory only) from being
        // clobbered by stale disk state on every poll request.
        const existing = jobStore.get(job.jobId);
        if (!existing || new Date(job.updatedAt) > new Date(existing.updatedAt)) {
          jobStore.set(job.jobId, job);
        }
        
        jobs.push(job);
      } catch (error) {
        logger.warn("[benchmark-job-store] Failed to load job file", { file, error: String(error) });
      }
    }
    
    return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    // Directory doesn't exist
    return [];
  }
}

export async function deleteJobFile(userId: string, jobId: string): Promise<boolean> {
  try {
    const filePath = getJobFilePath(userId, jobId);
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
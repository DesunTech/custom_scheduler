import { Job, JobData, JobOptions, JobResult } from './Job';

export interface SchedulerOptions {
  checkInterval?: string; // cron expression
  maxConcurrentJobs?: number;
  defaultRetryAttempts?: number;
  defaultRetryDelay?: number;
  connectionString?: string; // MongoDB connection string
}

export interface Scheduler {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Job scheduling
  scheduleJob(name: string, data: JobData, scheduledAt: Date, options?: JobOptions): Promise<Job>;
  scheduleRecurringJob(name: string, data: JobData, cronExpression: string, options?: JobOptions): Promise<Job>;

  // Job management
  getJob(jobId: string): Promise<Job | null>;
  cancelJob(jobId: string): Promise<boolean>;
  retryJob(jobId: string): Promise<Job | null>;

  // Queue processing
  processNextJobs(): Promise<void>;

  // Job handlers
  registerJobHandler(jobName: string, handler: JobHandler): void;

  // Events
  on(event: SchedulerEvent, callback: (job: Job, result?: JobResult) => void): void;
}

export type JobHandler = (job: Job) => Promise<JobResult>;

export enum SchedulerEvent {
  JOB_SCHEDULED = 'job_scheduled',
  JOB_STARTED = 'job_started',
  JOB_COMPLETED = 'job_completed',
  JOB_FAILED = 'job_failed',
  JOB_RETRIED = 'job_retried',
  JOB_CANCELLED = 'job_cancelled',
}
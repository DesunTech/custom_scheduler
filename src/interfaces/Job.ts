export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum JobPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

export interface JobData {
  [key: string]: any;
}

export interface JobOptions {
  priority?: JobPriority;
  maxRetries?: number;
  retryDelay?: number; // in milliseconds
  timeout?: number; // in milliseconds
}

export interface Job {
  id: string;
  name: string;
  data: JobData;
  status: JobStatus;
  scheduledAt: Date;
  executedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  attempts: number;
  userId?: string;
  priority: JobPriority;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: Error;
}
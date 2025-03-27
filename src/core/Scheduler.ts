import cron from 'node-cron';
import { EventEmitter } from 'events';
import {
  Job,
  JobData,
  JobOptions,
  JobPriority,
  JobResult,
  JobStatus
} from '../interfaces/Job';
import {
  JobHandler,
  Scheduler as IScheduler,
  SchedulerEvent,
  SchedulerOptions
} from '../interfaces/Scheduler';
import { JobRepository } from '../services/JobRepository';
import { RecurringJobRepository } from '../services/RecurringJobRepository';
import { DatabaseService } from '../services/DatabaseService';
import { config } from '../utils/config';

export class Scheduler extends EventEmitter implements IScheduler {
  private static instance: Scheduler;
  private initialized = false;
  private jobHandlers: Map<string, JobHandler> = new Map();
  private cronTask: cron.ScheduledTask | null = null;
  private activeJobs: Set<string> = new Set();
  private jobRepository: JobRepository;
  private recurringJobRepository: RecurringJobRepository;
  private databaseService: DatabaseService;
  private options: SchedulerOptions;

  private constructor(options: SchedulerOptions = {}) {
    super();
    this.options = {
      checkInterval: options.checkInterval || config.CRON_CHECK_INTERVAL,
      maxConcurrentJobs: options.maxConcurrentJobs || 10,
      defaultRetryAttempts: options.defaultRetryAttempts || config.DEFAULT_RETRY_ATTEMPTS,
      defaultRetryDelay: options.defaultRetryDelay || 60000,
      connectionString: options.connectionString || config.MONGODB_URI,
    };

    this.jobRepository = JobRepository.getInstance();
    this.recurringJobRepository = RecurringJobRepository.getInstance();
    this.databaseService = DatabaseService.getInstance();
  }

  public static getInstance(options?: SchedulerOptions): Scheduler {
    if (!Scheduler.instance) {
      Scheduler.instance = new Scheduler(options);
    }
    return Scheduler.instance;
  }

  /**
   * Initialize the scheduler
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Connect to the database
    await this.databaseService.connect(this.options.connectionString);

    // Start the cron task to check for due jobs
    this.cronTask = cron.schedule(this.options.checkInterval!, async () => {
      await this.checkRecurringJobs();
      await this.processNextJobs();
    });

    this.initialized = true;
    console.log('Scheduler initialized');
  }

  /**
   * Shutdown the scheduler
   */
  public async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Stop the cron task
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }

    // Disconnect from the database
    await this.databaseService.disconnect();

    this.initialized = false;
    console.log('Scheduler shutdown');
  }

  /**
   * Schedule a new job
   */
  public async scheduleJob(
    name: string,
    data: JobData,
    scheduledAt: Date,
    options?: JobOptions,
    userId?: string
  ): Promise<Job> {
    this.ensureInitialized();

    const job = await this.jobRepository.createJob(
      name,
      data,
      scheduledAt,
      options,
      userId
    );

    this.emit(SchedulerEvent.JOB_SCHEDULED, job);
    return job;
  }

  /**
   * Schedule a recurring job
   */
  public async scheduleRecurringJob(
    name: string,
    data: JobData,
    cronExpression: string,
    options?: JobOptions,
    userId?: string
  ): Promise<Job> {
    this.ensureInitialized();

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Create recurring job
    await this.recurringJobRepository.createRecurringJob(
      name,
      data,
      cronExpression,
      options,
      userId
    );

    // Schedule the first occurrence of the job
    const nextRunTime = this.getNextRunTime(cronExpression);

    const job = await this.jobRepository.createJob(
      name,
      data,
      nextRunTime,
      options,
      userId
    );

    this.emit(SchedulerEvent.JOB_SCHEDULED, job);
    return job;
  }

  /**
   * Get a job by ID
   */
  public async getJob(jobId: string): Promise<Job | null> {
    this.ensureInitialized();
    return this.jobRepository.getJobById(jobId);
  }

  /**
   * Cancel a job
   */
  public async cancelJob(jobId: string): Promise<boolean> {
    this.ensureInitialized();

    const job = await this.jobRepository.getJobById(jobId);

    if (!job) {
      return false;
    }

    if (job.status !== JobStatus.PENDING) {
      return false;
    }

    const success = await this.jobRepository.deleteJob(jobId);

    if (success) {
      this.emit(SchedulerEvent.JOB_CANCELLED, job);
    }

    return success;
  }

  /**
   * Retry a failed job
   */
  public async retryJob(jobId: string): Promise<Job | null> {
    this.ensureInitialized();

    const job = await this.jobRepository.getJobById(jobId);

    if (!job) {
      return null;
    }

    if (job.status !== JobStatus.FAILED) {
      throw new Error(`Cannot retry job with status: ${job.status}`);
    }

    // Update job status to pending and scheduled time to now
    const updatedJob = await this.jobRepository.updateJobStatus(jobId, JobStatus.PENDING);

    if (updatedJob) {
      this.emit(SchedulerEvent.JOB_RETRIED, updatedJob);
    }

    return updatedJob;
  }

  /**
   * Process next pending jobs
   */
  public async processNextJobs(): Promise<void> {
    this.ensureInitialized();

    // Skip if we've reached the maximum number of concurrent jobs
    if (this.activeJobs.size >= this.options.maxConcurrentJobs!) {
      return;
    }

    // Calculate how many more jobs we can process
    const availableSlots = this.options.maxConcurrentJobs! - this.activeJobs.size;

    // Get pending jobs
    const pendingJobs = await this.jobRepository.getPendingJobs(availableSlots);

    // Process each job
    pendingJobs.forEach(job => {
      this.processJob(job).catch(error => {
        console.error(`Error processing job ${job.id}:`, error);
      });
    });
  }

  /**
   * Register a job handler
   */
  public registerJobHandler(jobName: string, handler: JobHandler): void {
    this.jobHandlers.set(jobName, handler);
    console.log(`Registered handler for job: ${jobName}`);
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    // Skip if job is already being processed
    if (this.activeJobs.has(job.id)) {
      return;
    }

    // Get the handler for this job type
    const handler = this.jobHandlers.get(job.name);

    if (!handler) {
      console.warn(`No handler registered for job type: ${job.name}`);
      await this.jobRepository.updateJobStatus(
        job.id,
        JobStatus.FAILED,
        `No handler registered for job type: ${job.name}`
      );
      return;
    }

    // Mark job as running
    await this.jobRepository.updateJobStatus(job.id, JobStatus.RUNNING);
    this.activeJobs.add(job.id);

    // Increment attempt count
    await this.jobRepository.incrementJobAttempts(job.id);

    // Emit job started event
    this.emit(SchedulerEvent.JOB_STARTED, job);

    try {
      // Execute the job with a timeout
      const timeoutPromise = new Promise<JobResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Job timed out after ${job.timeout}ms`));
        }, job.timeout);
      });

      // Execute the job
      const result = await Promise.race([
        handler(job),
        timeoutPromise
      ]);

      // Update job status based on result
      if (result.success) {
        await this.jobRepository.updateJobStatus(job.id, JobStatus.COMPLETED);
        this.emit(SchedulerEvent.JOB_COMPLETED, job, result);
      } else {
        const errorMessage = result.error ? result.error.message : 'Job failed without error details';
        await this.jobRepository.updateJobStatus(job.id, JobStatus.FAILED, errorMessage);

        // Check if we should retry the job
        const updatedJob = await this.jobRepository.getJobById(job.id);

        if (updatedJob && updatedJob.attempts < updatedJob.maxRetries) {
          // Schedule a retry after the retry delay
          const retryTime = new Date(Date.now() + updatedJob.retryDelay);
          await this.jobRepository.updateJobStatus(updatedJob.id, JobStatus.PENDING);

          // Update scheduled time for retry
          // Note: We need to create a MongoDB update that isn't exposed in our repository
          // This is simplified for this example
          await this.jobRepository.updateJobStatus(updatedJob.id, JobStatus.PENDING);
        }

        this.emit(SchedulerEvent.JOB_FAILED, job, result);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.jobRepository.updateJobStatus(job.id, JobStatus.FAILED, errorMessage);

      // Same retry logic as above
      const updatedJob = await this.jobRepository.getJobById(job.id);

      if (updatedJob && updatedJob.attempts < updatedJob.maxRetries) {
        const retryTime = new Date(Date.now() + updatedJob.retryDelay);
        await this.jobRepository.updateJobStatus(updatedJob.id, JobStatus.PENDING);
      }

      this.emit(SchedulerEvent.JOB_FAILED, job, {
        success: false,
        error: error instanceof Error ? error : new Error(errorMessage)
      });
    } finally {
      // Remove job from active jobs
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Check for recurring jobs and schedule their next occurrence
   */
  private async checkRecurringJobs(): Promise<void> {
    const activeRecurringJobs = await this.recurringJobRepository.getActiveRecurringJobs();

    for (const recurringJob of activeRecurringJobs) {
      try {
        // Determine if we need to create a new job instance
        if (!recurringJob.lastExecutedAt) {
          // This is a new recurring job, schedule its first occurrence
          const nextRunTime = this.getNextRunTime(recurringJob.cronExpression);

          // Create a new job instance
          await this.jobRepository.createJob(
            recurringJob.name,
            recurringJob.data,
            nextRunTime,
            {
              priority: recurringJob.priority,
              maxRetries: recurringJob.maxRetries,
              retryDelay: recurringJob.retryDelay,
              timeout: recurringJob.timeout,
            },
            recurringJob.userId
          );

          // Update last executed time
          await this.recurringJobRepository.updateLastExecutedAt(recurringJob.id, new Date());
        } else {
          // Check if it's time to schedule the next occurrence
          const now = new Date();
          const nextRunTime = this.getNextRunTime(recurringJob.cronExpression, recurringJob.lastExecutedAt);

          if (nextRunTime <= now) {
            // It's time to schedule the next occurrence
            await this.jobRepository.createJob(
              recurringJob.name,
              recurringJob.data,
              nextRunTime,
              {
                priority: recurringJob.priority,
                maxRetries: recurringJob.maxRetries,
                retryDelay: recurringJob.retryDelay,
                timeout: recurringJob.timeout,
              },
              recurringJob.userId
            );

            // Update last executed time
            await this.recurringJobRepository.updateLastExecutedAt(recurringJob.id, now);
          }
        }
      } catch (error) {
        console.error(`Error scheduling recurring job ${recurringJob.id}:`, error);
      }
    }
  }

  /**
   * Calculate the next run time for a cron expression
   */
  private getNextRunTime(cronExpression: string, from: Date = new Date()): Date {
    // Parse the cron expression manually and determine the next date
    const parts = cronExpression.split(' ');
    const now = new Date(from);
    let nextDate = new Date(now);

    // Add at least 1 minute to ensure we're looking forward
    nextDate.setMinutes(nextDate.getMinutes() + 1);
    nextDate.setSeconds(0);
    nextDate.setMilliseconds(0);

    // Common cron patterns
    // Every minute ("* * * * *")
    if (cronExpression === '* * * * *') {
      return nextDate;
    }
    // Every hour ("0 * * * *")
    else if (parts[0] === '0' && parts[1] === '*') {
      nextDate.setMinutes(0);
      if (now.getMinutes() === 0) {
        nextDate.setHours(nextDate.getHours() + 1);
      }
    }
    // Daily ("0 0 * * *")
    else if (parts[0] === '0' && parts[1] === '0' && parts[2] === '*') {
      nextDate.setMinutes(0);
      nextDate.setHours(0);
      nextDate.setDate(nextDate.getDate() + 1);
    }
    // Weekly ("0 0 * * 0")
    else if (parts[0] === '0' && parts[1] === '0' && parts[4] === '0') {
      nextDate.setMinutes(0);
      nextDate.setHours(0);
      // Set to next Sunday
      nextDate.setDate(nextDate.getDate() + (7 - nextDate.getDay()));
    }
    // Monthly ("0 0 1 * *")
    else if (parts[0] === '0' && parts[1] === '0' && parts[2] === '1') {
      nextDate.setMinutes(0);
      nextDate.setHours(0);
      nextDate.setDate(1);
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
    // For any other pattern, default to adding 5 minutes
    else {
      nextDate.setMinutes(nextDate.getMinutes() + 5);
    }

    return nextDate;
  }

  /**
   * Ensure the scheduler is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Scheduler not initialized. Call initialize() first.');
    }
  }
}

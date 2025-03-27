import { JobData, JobOptions, JobPriority } from '../interfaces/Job';
import { RecurringJob, RecurringJobModel, convertToRecurringJob } from '../models/RecurringJobModel';
import { v4 as uuidv4 } from 'uuid';

export class RecurringJobRepository {
  private static instance: RecurringJobRepository;

  private constructor() {}

  public static getInstance(): RecurringJobRepository {
    if (!RecurringJobRepository.instance) {
      RecurringJobRepository.instance = new RecurringJobRepository();
    }
    return RecurringJobRepository.instance;
  }

  /**
   * Create a new recurring job
   */
  public async createRecurringJob(
    name: string,
    data: JobData,
    cronExpression: string,
    options?: JobOptions,
    userId?: string
  ): Promise<RecurringJob> {
    const newJob = new RecurringJobModel({
      name,
      data,
      cronExpression,
      userId,
      priority: options?.priority || JobPriority.NORMAL,
      maxRetries: options?.maxRetries || 3,
      retryDelay: options?.retryDelay || 60000,
      timeout: options?.timeout || 30000,
      isActive: true,
    });

    const savedJob = await newJob.save();
    return convertToRecurringJob(savedJob);
  }

  /**
   * Get a recurring job by ID
   */
  public async getRecurringJobById(jobId: string): Promise<RecurringJob | null> {
    const job = await RecurringJobModel.findById(jobId);
    return job ? convertToRecurringJob(job) : null;
  }

  /**
   * Update a recurring job
   */
  public async updateRecurringJob(
    jobId: string,
    updates: Partial<RecurringJob>
  ): Promise<RecurringJob | null> {
    const job = await RecurringJobModel.findByIdAndUpdate(
      jobId,
      updates,
      { new: true }
    );

    return job ? convertToRecurringJob(job) : null;
  }

  /**
   * Delete a recurring job
   */
  public async deleteRecurringJob(jobId: string): Promise<boolean> {
    const result = await RecurringJobModel.deleteOne({ _id: jobId });
    return result.deletedCount === 1;
  }

  /**
   * Get all active recurring jobs
   */
  public async getActiveRecurringJobs(): Promise<RecurringJob[]> {
    const jobs = await RecurringJobModel.find({ isActive: true });
    return jobs.map(convertToRecurringJob);
  }

  /**
   * Get recurring jobs by user ID
   */
  public async getRecurringJobsByUserId(
    userId: string,
    isActive?: boolean
  ): Promise<RecurringJob[]> {
    const query: any = { userId };

    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    const jobs = await RecurringJobModel.find(query)
      .sort({ updatedAt: -1 });

    return jobs.map(convertToRecurringJob);
  }

  /**
   * Update last execution time
   */
  public async updateLastExecutedAt(
    jobId: string,
    lastExecutedAt: Date
  ): Promise<RecurringJob | null> {
    const job = await RecurringJobModel.findByIdAndUpdate(
      jobId,
      { lastExecutedAt },
      { new: true }
    );

    return job ? convertToRecurringJob(job) : null;
  }
}
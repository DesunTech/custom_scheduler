import { Job, JobData, JobOptions, JobPriority, JobStatus } from '../interfaces/Job';
import { JobDocument, JobModel, convertToJob } from '../models/JobModel';
import { v4 as uuidv4 } from 'uuid';

export class JobRepository {
  private static instance: JobRepository;

  private constructor() {}

  public static getInstance(): JobRepository {
    if (!JobRepository.instance) {
      JobRepository.instance = new JobRepository();
    }
    return JobRepository.instance;
  }

  /**
   * Create a new job
   */
  public async createJob(
    name: string,
    data: JobData,
    scheduledAt: Date,
    options?: JobOptions,
    userId?: string
  ): Promise<Job> {
    const newJob = new JobModel({
      name,
      data,
      scheduledAt,
      userId,
      status: JobStatus.PENDING,
      attempts: 0,
      priority: options?.priority || JobPriority.NORMAL,
      maxRetries: options?.maxRetries || 3,
      retryDelay: options?.retryDelay || 60000, // 1 minute
      timeout: options?.timeout || 30000, // 30 seconds
    });

    const savedJob = await newJob.save();
    return convertToJob(savedJob);
  }

  /**
   * Get a job by ID
   */
  public async getJobById(jobId: string): Promise<Job | null> {
    const job = await JobModel.findById(jobId);
    return job ? convertToJob(job) : null;
  }

  /**
   * Update job status
   */
  public async updateJobStatus(
    jobId: string,
    status: JobStatus,
    errorMessage?: string
  ): Promise<Job | null> {
    const update: any = { status };

    if (status === JobStatus.RUNNING) {
      update.executedAt = new Date();
    } else if (status === JobStatus.COMPLETED) {
      update.completedAt = new Date();
    } else if (status === JobStatus.FAILED && errorMessage) {
      update.errorMessage = errorMessage;
    }

    const job = await JobModel.findByIdAndUpdate(
      jobId,
      update,
      { new: true }
    );

    return job ? convertToJob(job) : null;
  }

  /**
   * Increment job attempts
   */
  public async incrementJobAttempts(jobId: string): Promise<Job | null> {
    const job = await JobModel.findByIdAndUpdate(
      jobId,
      { $inc: { attempts: 1 } },
      { new: true }
    );

    return job ? convertToJob(job) : null;
  }

  /**
   * Get pending jobs due for execution
   */
  public async getPendingJobs(limit: number = 10): Promise<Job[]> {
    const now = new Date();

    const jobs = await JobModel.find({
      status: JobStatus.PENDING,
      scheduledAt: { $lte: now }
    })
    .sort({ priority: -1, scheduledAt: 1 })
    .limit(limit);

    return jobs.map(convertToJob);
  }

  /**
   * Get failed jobs
   */
  public async getFailedJobs(userId?: string, limit: number = 50): Promise<Job[]> {
    const query: any = { status: JobStatus.FAILED };

    if (userId) {
      query.userId = userId;
    }

    const jobs = await JobModel.find(query)
      .sort({ updatedAt: -1 })
      .limit(limit);

    return jobs.map(convertToJob);
  }

  /**
   * Delete a job
   */
  public async deleteJob(jobId: string): Promise<boolean> {
    const result = await JobModel.deleteOne({ _id: jobId });
    return result.deletedCount === 1;
  }

  /**
   * Get jobs by user ID
   */
  public async getJobsByUserId(
    userId: string,
    status?: JobStatus,
    limit: number = 50
  ): Promise<Job[]> {
    const query: any = { userId };

    if (status) {
      query.status = status;
    }

    const jobs = await JobModel.find(query)
      .sort({ scheduledAt: -1 })
      .limit(limit);

    return jobs.map(convertToJob);
  }
}
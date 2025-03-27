import express from 'express';
import { Scheduler, JobPriority, JobStatus, Job, JobResult } from '../src';
import { Request, Response, NextFunction } from 'express';

// Using express without explicit types to avoid TypeScript issues
async function startServer() {
  try {
    // Initialize express app
    const app = express();
    app.use(express.json());

    // Get scheduler instance with support for both local and cloud MongoDB
    const scheduler = Scheduler.getInstance({
      connectionString: process.env.MONGODB_URI || 'mongodb://localhost:27017/scheduler-api-example',
    });

    // Register job handler for sending a notification
    scheduler.registerJobHandler('sendNotification', async (job: Job): Promise<JobResult> => {
      try {
        console.log(`Processing notification for user: ${job.userId}`);
        console.log(`Notification data:`, job.data);

        // Simulate notification sending
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
          success: true,
          data: {
            notificationSent: true,
            timestamp: new Date().toISOString()
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error('Failed to send notification')
        };
      }
    });

    // Initialize the scheduler
    await scheduler.initialize();
    console.log('Scheduler initialized');

    // Event listeners
    scheduler.on('job_completed', (job) => {
      console.log(`Job completed: ${job.id}, Type: ${job.name}`);
    });

    scheduler.on('job_failed', (job) => {
      console.error(`Job failed: ${job.id}, Type: ${job.name}, Error: ${job.errorMessage}`);
    });

    // API Routes
    // Schedule a notification
    app.post('/api/notifications/schedule', async (req, res, next) => {
      try {
        const {
          userId,
          message,
          title,
          scheduledAt,
          priority = JobPriority.NORMAL
        } = req.body;

        if (!userId || !message || !scheduledAt) {
          res.status(400).json({
            success: false,
            error: 'Missing required fields: userId, message, scheduledAt'
          });
          return;
        }

        const scheduleDate = new Date(scheduledAt);

        if (isNaN(scheduleDate.getTime())) {
          res.status(400).json({
            success: false,
            error: 'Invalid date format for scheduledAt'
          });
          return;
        }

        const job = await scheduler.scheduleJob(
          'sendNotification',
          { message, title },
          scheduleDate,
          { priority },
          userId
        );

        res.status(201).json({
          success: true,
          job: {
            id: job.id,
            scheduledAt: job.scheduledAt,
            status: job.status,
            priority: job.priority
          }
        });
      } catch (error) {
        next(error);
      }
    });

    // Schedule a recurring notification
    app.post('/api/notifications/schedule-recurring', async (req, res, next) => {
      try {
        const {
          userId,
          message,
          title,
          cronExpression,
          priority = JobPriority.NORMAL
        } = req.body;

        if (!userId || !message || !cronExpression) {
          res.status(400).json({
            success: false,
            error: 'Missing required fields: userId, message, cronExpression'
          });
          return;
        }

        const job = await scheduler.scheduleRecurringJob(
          'sendNotification',
          { message, title },
          cronExpression,
          { priority },
          userId
        );

        res.status(201).json({
          success: true,
          job: {
            id: job.id,
            scheduledAt: job.scheduledAt,
            status: job.status,
            priority: job.priority
          }
        });
      } catch (error) {
        next(error);
      }
    });

    // Get user's notifications
    app.get('/api/users/:userId/jobs', async (req, res, next) => {
      try {
        const { userId } = req.params;
        const status = req.query.status as string;

        if (!userId) {
          res.status(400).json({
            success: false,
            error: 'Missing userId parameter'
          });
          return;
        }

        // Get jobs from repository
        const jobRepo = scheduler['jobRepository'];
        let jobs;

        if (status && Object.values(JobStatus).includes(status as JobStatus)) {
          jobs = await jobRepo.getJobsByUserId(userId, status as JobStatus);
        } else {
          jobs = await jobRepo.getJobsByUserId(userId);
        }

        res.json({
          success: true,
          count: jobs.length,
          jobs: jobs.map(job => ({
            id: job.id,
            name: job.name,
            data: job.data,
            status: job.status,
            scheduledAt: job.scheduledAt,
            executedAt: job.executedAt,
            completedAt: job.completedAt,
            priority: job.priority,
            createdAt: job.createdAt
          }))
        });
      } catch (error) {
        next(error);
      }
    });

    // Retry a failed job
    app.post('/api/jobs/:jobId/retry', async (req, res, next) => {
      try {
        const { jobId } = req.params;

        if (!jobId) {
          res.status(400).json({
            success: false,
            error: 'Missing jobId parameter'
          });
          return;
        }

        const job = await scheduler.getJob(jobId);

        if (!job) {
          res.status(404).json({
            success: false,
            error: 'Job not found'
          });
          return;
        }

        if (job.status !== JobStatus.FAILED) {
          res.status(400).json({
            success: false,
            error: `Cannot retry job with status: ${job.status}. Only failed jobs can be retried.`
          });
          return;
        }

        const retriedJob = await scheduler.retryJob(jobId);

        res.json({
          success: true,
          job: {
            id: retriedJob?.id,
            status: retriedJob?.status,
            attempts: retriedJob?.attempts
          }
        });
      } catch (error) {
        next(error);
      }
    });

    // Cancel a pending job
    app.delete('/api/jobs/:jobId', async (req, res, next) => {
      try {
        const { jobId } = req.params;

        if (!jobId) {
          res.status(400).json({
            success: false,
            error: 'Missing jobId parameter'
          });
          return;
        }

        const cancelled = await scheduler.cancelJob(jobId);

        if (!cancelled) {
          res.status(400).json({
            success: false,
            error: 'Could not cancel job. It may not exist or is not in pending status.'
          });
          return;
        }

        res.json({
          success: true,
          message: 'Job cancelled successfully'
        });
      } catch (error) {
        next(error);
      }
    });

    // Error handling middleware
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    });

    // Start the server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`API endpoints available:`);
      console.log(`- POST /api/notifications/schedule`);
      console.log(`- POST /api/notifications/schedule-recurring`);
      console.log(`- GET /api/users/:userId/jobs`);
      console.log(`- POST /api/jobs/:jobId/retry`);
      console.log(`- DELETE /api/jobs/:jobId`);
    });

    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down server...');
      await scheduler.shutdown();
      console.log('Scheduler has been shut down');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

startServer();
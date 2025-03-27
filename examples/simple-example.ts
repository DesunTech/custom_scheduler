import { Scheduler, JobPriority, JobResult, Job } from '../src';

async function runExample() {
  try {
    // Get environment variable for MongoDB URI if available
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/scheduler-example';

    console.log(`Using MongoDB connection: ${mongoURI}`);

    // Get the scheduler instance
    const scheduler = Scheduler.getInstance({
      connectionString: mongoURI,
      maxConcurrentJobs: 5,
    });

    // Register job handlers
    scheduler.registerJobHandler('logMessage', async (job: Job): Promise<JobResult> => {
      try {
        console.log(`[${new Date().toISOString()}] Processing job ${job.id}`);
        console.log(`Message: ${job.data.message}`);

        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 1000));

        return {
          success: true,
          data: { processed: true, timestamp: new Date().toISOString() }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error('Unknown error occurred')
        };
      }
    });

    // Initialize the scheduler
    console.log('Initializing scheduler...');
    await scheduler.initialize();
    console.log('Scheduler initialized');

    // Schedule some jobs
    console.log('Scheduling jobs...');

    // Immediate job
    const immediateJob = await scheduler.scheduleJob(
      'logMessage',
      { message: 'This is an immediate job' },
      new Date(),
      { priority: JobPriority.HIGH }
    );
    console.log(`Scheduled immediate job with ID: ${immediateJob.id}`);

    // Delayed job (5 seconds from now)
    const delayedTime = new Date();
    delayedTime.setSeconds(delayedTime.getSeconds() + 5);

    const delayedJob = await scheduler.scheduleJob(
      'logMessage',
      { message: 'This is a delayed job (5 seconds)' },
      delayedTime,
      { priority: JobPriority.NORMAL }
    );
    console.log(`Scheduled delayed job with ID: ${delayedJob.id}`);

    // Recurring job (every 10 seconds)
    const recurringJob = await scheduler.scheduleRecurringJob(
      'logMessage',
      { message: 'This is a recurring job (every 10 seconds)' },
      '*/10 * * * * *', // Note: This is an extended cron syntax with seconds
      { priority: JobPriority.LOW }
    );
    console.log(`Scheduled recurring job: ${recurringJob.id}`);

    // Register event listeners
    scheduler.on('job_completed', (job) => {
      console.log(`Job completed: ${job.id}`);
    });

    scheduler.on('job_failed', (job) => {
      console.log(`Job failed: ${job.id}, Error: ${job.errorMessage}`);
    });

    // Run for 30 seconds then shutdown
    console.log('Running scheduler for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log('Shutting down scheduler...');
    await scheduler.shutdown();
    console.log('Scheduler shut down');

    process.exit(0);
  } catch (error) {
    console.error('Error in example:', error);
    process.exit(1);
  }
}

// How to run this example:
// 1. With local MongoDB: node dist/examples/simple-example.js
// 2. With cloud MongoDB: MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/scheduler" node dist/examples/simple-example.js

runExample();
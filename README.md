# Custom Scheduler

A pluggable custom scheduler system for Node.js applications that can be easily integrated into any codebase. It provides a robust framework for scheduling and managing jobs with features like job prioritization, retries, and status tracking.

## Features

- **Job Scheduling**: Schedule one-time or recurring jobs with flexible configuration options
- **Job Prioritization**: Assign priorities to jobs (Low, Normal, High)
- **Error Handling**: Detailed error tracking and automatic retry mechanism
- **Job Status Tracking**: Monitor job status (Pending, Running, Completed, Failed)
- **User Management**: Associate jobs with specific users for better organization
- **Persistence**: MongoDB-based storage for durability and reliability
- **Pluggable Design**: Easily integrate with any Node.js application

## Installation

```bash
npm install custom_scheduler
```

## MongoDB Configuration

The scheduler supports both local and cloud MongoDB instances:

### Local MongoDB

```typescript
// Default configuration uses local MongoDB
const scheduler = Scheduler.getInstance();
await scheduler.initialize();
```

### Cloud MongoDB (MongoDB Atlas or other hosted solutions)

```typescript
// Specify a cloud MongoDB connection string
const scheduler = Scheduler.getInstance({
  connectionString: "mongodb+srv://username:password@cluster.mongodb.net/scheduler"
});
await scheduler.initialize();
```

### Environment Variables

You can also use environment variables for configuration:

```env
# .env file
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/scheduler
DEFAULT_RETRY_ATTEMPTS=3
CRON_CHECK_INTERVAL="* * * * *"
```

## Quick Start

```typescript
import { Scheduler, JobPriority, JobStatus } from 'custom_scheduler';

// Initialize the scheduler
const scheduler = Scheduler.getInstance({
  maxConcurrentJobs: 5,
  connectionString: process.env.MONGODB_URI || 'mongodb://localhost:27017/myapp'
});

// Register job handlers
scheduler.registerJobHandler('sendEmail', async (job) => {
  try {
    // Process email sending logic using job.data
    console.log(`Sending email to ${job.data.recipient}`);

    // Return success result
    return { success: true, data: { messageSent: true } };
  } catch (error) {
    // Return failure result
    return {
      success: false,
      error: new Error(`Failed to send email: ${error.message}`)
    };
  }
});

// Initialize the scheduler
await scheduler.initialize();

// Schedule a job to run immediately
const job = await scheduler.scheduleJob(
  'sendEmail',
  { recipient: 'user@example.com', subject: 'Hello' },
  new Date(),
  { priority: JobPriority.HIGH }
);

// Schedule a recurring job (every day at midnight)
const recurringJob = await scheduler.scheduleRecurringJob(
  'dailyReport',
  { reportType: 'daily' },
  '0 0 * * *',
  { maxRetries: 5 }
);

// Clean up on application shutdown
process.on('SIGINT', async () => {
  await scheduler.shutdown();
  process.exit(0);
});
```

## Use Cases

1. **Post Scheduler**: Schedule posts to be published at specific times
2. **Email Campaigns**: Send emails to users at optimal times
3. **Data Processing**: Execute batch jobs during off-peak hours
4. **Report Generation**: Generate and distribute reports on a schedule
5. **System Maintenance**: Run cleanup tasks at regular intervals

## Advanced Usage

### Using with Express

```typescript
import express from 'express';
import { Scheduler, JobPriority } from 'custom_scheduler';

const app = express();
app.use(express.json());

const scheduler = Scheduler.getInstance();
await scheduler.initialize();

// Register job handlers
scheduler.registerJobHandler('sendNotification', async (job) => {
  // Implementation...
  return { success: true };
});

// API endpoint to schedule a job
app.post('/schedule', async (req, res) => {
  try {
    const { name, data, scheduledAt, priority, userId } = req.body;

    const job = await scheduler.scheduleJob(
      name,
      data,
      new Date(scheduledAt),
      { priority: priority || JobPriority.NORMAL },
      userId
    );

    res.status(201).json(job);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// API endpoint to get job status
app.get('/jobs/:jobId', async (req, res) => {
  const job = await scheduler.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Start the server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## License

ISC

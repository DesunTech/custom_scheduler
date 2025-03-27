import http from 'http';
import { Scheduler, JobPriority, JobStatus } from '../src';

async function startServer() {
  // Get scheduler instance
  const scheduler = Scheduler.getInstance({
    connectionString: 'mongodb://localhost:27017/scheduler-example',
  });

  // Register job handler for sending a notification
  scheduler.registerJobHandler('sendNotification', async (job) => {
    try {
      console.log(`Processing notification for user: ${job.userId}`);
      console.log(`Notification data:`, job.data);

      // Simulate notification sending
      await new Promise(resolve => setTimeout(resolve, 500));

      // In a real application, you would send a notification here

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

  // Create a simple HTTP server to handle requests
  const server = http.createServer(async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Parse the URL to get the path
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // Handle API routes
    try {
      // Schedule a notification
      if (path === '/api/notifications/schedule' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const { userId, message, title, scheduledAt, priority = JobPriority.NORMAL } = JSON.parse(body);

            if (!userId || !message || !scheduledAt) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'Missing required fields: userId, message, scheduledAt'
              }));
              return;
            }

            const scheduleDate = new Date(scheduledAt);

            if (isNaN(scheduleDate.getTime())) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'Invalid date format for scheduledAt'
              }));
              return;
            }

            const job = await scheduler.scheduleJob(
              'sendNotification',
              { message, title },
              scheduleDate,
              { priority },
              userId
            );

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              job: {
                id: job.id,
                scheduledAt: job.scheduledAt,
                status: job.status,
                priority: job.priority
              }
            }));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'Failed to schedule notification'
            }));
          }
        });
        return;
      }

      // Get user's jobs
      if (path.startsWith('/api/users/') && path.endsWith('/jobs') && req.method === 'GET') {
        const userId = path.split('/')[3];
        const status = url.searchParams.get('status');

        if (!userId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Missing userId parameter'
          }));
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

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
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
        }));
        return;
      }

      // Default 404 response
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Not found'
      }));
    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Internal server error'
      }));
    }
  });

  // Start the server
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`API endpoints available:`);
    console.log(`- POST /api/notifications/schedule`);
    console.log(`- GET /api/users/:userId/jobs`);
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await scheduler.shutdown();
    server.close();
    console.log('Server has been shut down');
    process.exit(0);
  });
}

startServer().catch(error => {
  console.error('Error starting server:', error);
  process.exit(1);
});
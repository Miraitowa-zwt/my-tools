const { Worker } = require('bullmq');
const { analyzeUrl } = require('./lib/scraper');
const { getRedisClient } = require('./lib/queue');
const Redis = require('ioredis');

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || '2387542221',
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

const connection = new Redis(redisConfig);

const worker = new Worker('url-scan', async (job) => {
  const { jobId, sourceUrl, targetUrls } = job.data;
  
  console.log(`Processing job ${job.id}: ${sourceUrl}`);
  
  try {
    const results = await analyzeUrl(sourceUrl, targetUrls);
    const redis = new Redis(redisConfig);
    
    // Get current job data
    const currentData = await redis.get(`job:${jobId}`);
    if (!currentData) {
      await redis.disconnect();
      throw new Error(`Job ${jobId} not found in Redis`);
    }
    
    const parsedData = JSON.parse(currentData);
    
    // Append new results
    parsedData.results.push(...results);
    parsedData.completed += 1;
    
    // Check if all done
    if (parsedData.completed >= parsedData.total) {
      parsedData.status = 'completed';
    }
    
    // Save back to Redis
    await redis.set(`job:${jobId}`, JSON.stringify(parsedData));
    await redis.disconnect();
    
    console.log(`Completed job ${job.id}: ${sourceUrl}`);
    return results;
    
  } catch (error) {
    console.error(`Error processing job ${job.id}: ${sourceUrl}`, error);
    
    // Update progress even on error
    const redis = new Redis(redisConfig);
    const currentData = await redis.get(`job:${jobId}`);
    
    if (currentData) {
      const parsedData = JSON.parse(currentData);
      parsedData.completed += 1;
      parsedData.errors = parsedData.errors || [];
      parsedData.errors.push({
        sourceUrl,
        error: error.message,
      });
      
      if (parsedData.completed >= parsedData.total) {
        parsedData.status = 'completed_with_errors';
      }
      
      await redis.set(`job:${jobId}`, JSON.stringify(parsedData));
    }
    
    await redis.disconnect();
    throw error;
  }
}, { 
  connection,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '4'),
});

console.log('URL scan worker started');

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

worker.on('progress', (job, progress) => {
  console.log(`Job ${job.id} progress:`, progress);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
});

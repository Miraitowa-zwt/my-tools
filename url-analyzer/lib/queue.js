const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || '2387542221',
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

module.exports.scanQueue = new Queue('url-scan', {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: false,
    removeOnFail: false,
  },
});

module.exports.getRedisClient = () => {
  return new Redis({
    ...redisConfig,
    maxRetriesPerRequest: 3,
  });
};

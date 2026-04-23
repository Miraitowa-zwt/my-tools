import { NextResponse } from 'next/server';
const { scanQueue, getRedisClient } = require('../../../../lib/queue');
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  try {
    const { sourceUrls, targetUrls } = await request.json();

    if (!sourceUrls || !targetUrls || !Array.isArray(sourceUrls) || !Array.isArray(targetUrls)) {
      return NextResponse.json(
        { error: 'Invalid request. sourceUrls and targetUrls must be arrays.' },
        { status: 400 }
      );
    }

    if (sourceUrls.length === 0 || targetUrls.length === 0) {
      return NextResponse.json(
        { error: 'sourceUrls and targetUrls cannot be empty.' },
        { status: 400 }
      );
    }

    const jobId = randomUUID();
    const redis = getRedisClient();
    
    // Store initial job status
    await redis.set(`job:${jobId}`, JSON.stringify({
      jobId,
      total: sourceUrls.length,
      completed: 0,
      results: [],
      status: 'processing',
      createdAt: new Date().toISOString(),
    }));
    
    await redis.disconnect();

    // Add each source URL as a separate job in the queue
    const bulkJobs = sourceUrls.map(sourceUrl => ({
      name: 'analyze',
      data: {
        jobId,
        sourceUrl,
        targetUrls,
      },
    }));

    await scanQueue.addBulk(bulkJobs);

    return NextResponse.json({ 
      jobId,
      total: sourceUrls.length,
      message: 'Job started successfully' 
    });

  } catch (error) {
    console.error('Error starting scan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

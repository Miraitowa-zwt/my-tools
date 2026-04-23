import { NextResponse } from 'next/server';
const { getRedisClient } = require('../../../../lib/queue');

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required' },
        { status: 400 }
      );
    }

    const redis = getRedisClient();
    const jobData = await redis.get(`job:${jobId}`);
    await redis.disconnect();

    if (!jobData) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const parsedData = JSON.parse(jobData);
    return NextResponse.json(parsedData);

  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import Bottleneck from 'bottleneck';
import dotenv from 'dotenv';
import '../../env.ts';

const limiter = new Bottleneck({
  minTime: process.env.RATE_LIMIT_MIN_TIME ? parseInt(process.env.RATE_LIMIT_MIN_TIME) : 240,
  maxConcurrent: 5,    // If you want to limit concurrent jobs
  maxRetries: 5,       // Retries failed jobs up to 5 times
  retryDelay: 800,     // Wait 800ms before retrying
});

// Event listeners for logging
limiter.on('error', (error) => {
  console.error('Bottleneck encountered an error:', error);
});

limiter.on('failed', (error, jobInfo) => {
  console.error(`Job ${jobInfo.options.id} failed:`, error);
});

limiter.on('retry', (error, jobInfo) => {
  console.warn(`Retrying job ${jobInfo.options.id} in ${jobInfo.retryCount} ms`);
});

limiter.on('queued', (jobInfo) => {
  console.log(`Job ${jobInfo.options.id} is queued`);
});

limiter.on('dropped', (jobInfo) => {
  console.warn(`Job ${jobInfo.options.id} was dropped`);
});

limiter.on('executing', (jobInfo) => {
  console.log(`Job ${jobInfo.options.id} is executing at ${new Date().toISOString()}`);
});

limiter.on('received', (jobInfo) => {
  console.log(`Job ${jobInfo.options.id} is received`);
});

limiter.on('done', (jobInfo) => {
  console.log(`Job ${jobInfo.options.id} is done`);
});

limiter.on('depleted', () => {
  console.warn('Limiter is depleted');
});

limiter.on('idle', () => {
  console.log('All jobs have been processed. Limiter is idle.');
});

// Function to log limiter counts
function logLimiterCounts() {
  const counts = limiter.counts();
  if(counts.RECEIVED != 0 || counts.QUEUED != 0 || counts.RUNNING != 0 || counts.EXECUTING != 0) {
    console.log('Limiter counts:', counts);
  }
}

// Set an interval to log counts every 10 seconds (adjust as needed)
setInterval(logLimiterCounts, 10000); // Logs every 10 seconds

export function debounce(func: any, timeout = 300){
  let timer: any;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, timeout);
  };
}

export default limiter;
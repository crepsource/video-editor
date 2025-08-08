import 'dotenv/config';

console.log('Video Editor - AI Frame Analysis System');
console.log('Environment:', process.env.NODE_ENV || 'development');

// Basic startup validation
if (!process.env.OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY not configured');
}

if (!process.env.DB_HOST) {
  console.warn('Warning: Database connection not configured');
}

export {};
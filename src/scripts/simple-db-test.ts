import { Pool } from 'pg';
import { config } from 'dotenv';

config();

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'video_editor',
  user: 'video_admin',
  password: 'dev_password_2024',
});

async function testConnection() {
  try {
    console.log('Testing simple connection...');
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, current_user, current_database()');
    console.log('✅ Connection successful!');
    console.log('Result:', result.rows[0]);
    client.release();
    await pool.end();
  } catch (error) {
    console.error('❌ Connection failed:', error);
  }
}

testConnection();
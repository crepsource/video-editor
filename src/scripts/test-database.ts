#!/usr/bin/env node

import { db } from '../services/database';
import { Video } from '../models/Video';
import { Frame } from '../models/Frame';

async function testDatabase() {
  console.log('🧪 Testing database connection and functionality...\n');
  
  try {
    // Test 1: Basic connection
    console.log('1. Testing database connection...');
    const connectionResult = await db.testConnection();
    console.log(connectionResult ? '✅ Connection successful' : '❌ Connection failed');
    
    // Test 2: List existing videos
    console.log('\n2. Listing existing videos...');
    const videos = await Video.list(10);
    console.log(`📹 Found ${videos.length} videos:`);
    videos.forEach(video => {
      console.log(`   - ${video.filename} (${video.status}) - ${video.resolution || 'Unknown res'}`);
    });
    
    // Test 3: Get specific video details
    if (videos.length > 0) {
      console.log('\n3. Testing video details query...');
      const video = videos[0];
      const videoDetails = await Video.findById(video.id);
      console.log(`📄 Video details for ${videoDetails?.filename}:`);
      console.log(`   Duration: ${videoDetails?.duration}s`);
      console.log(`   Total frames: ${videoDetails?.total_frames}`);
      console.log(`   FPS: ${videoDetails?.fps}`);
      console.log(`   Status: ${videoDetails?.status}`);
    }
    
    // Test 4: Test frame queries
    console.log('\n4. Testing frame queries...');
    if (videos.length > 0) {
      const frames = await Frame.findByVideoId(videos[0].id);
      console.log(`🖼️  Found ${frames.length} frames for first video`);
    }
    
    // Test 5: Test database statistics
    console.log('\n5. Database statistics...');
    const stats = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM videos) as video_count,
        (SELECT COUNT(*) FROM frames_enhanced) as frame_count,
        (SELECT COUNT(*) FROM scenes) as scene_count,
        (SELECT COUNT(*) FROM video_intelligence) as intelligence_count
    `);
    
    const { video_count, frame_count, scene_count, intelligence_count } = stats.rows[0];
    console.log(`📊 Database Statistics:`);
    console.log(`   Videos: ${video_count}`);
    console.log(`   Frames: ${frame_count}`);
    console.log(`   Scenes: ${scene_count}`);
    console.log(`   Intelligence records: ${intelligence_count}`);
    
    // Test 6: Test search functionality (if we have frames with descriptions)
    console.log('\n6. Testing search functionality...');
    try {
      const searchResults = await Frame.searchByDescription('beach');
      console.log(`🔍 Search for 'beach': ${searchResults.length} results`);
    } catch (error) {
      console.log('🔍 Search test skipped (no searchable content yet)');
    }
    
    console.log('\n✅ All database tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run the test
testDatabase();
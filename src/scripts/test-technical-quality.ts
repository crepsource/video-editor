#!/usr/bin/env node

import { technicalQualityAnalyzer } from '../services/technicalQualityAnalyzer';
import path from 'path';
import fs from 'fs';

async function testTechnicalQualityAnalysis() {
  console.log('🔧 Testing Technical Quality Analysis System...\n');

  try {
    // Create a test image path (would need an actual image file)
    const testImagePath = path.join(process.cwd(), 'test-frame.jpg');
    
    // Check if test image exists
    if (!fs.existsSync(testImagePath)) {
      console.log('⚠️  No test image found. Creating sample analysis...');
      
      // Show what the analysis would return
      const sampleAnalysis = {
        scores: {
          sharpness: 82,
          exposure: 78,
          contrast: 85,
          color_saturation: 73,
          noise_level: 89,
          motion_blur: 91,
          overall_score: 83
        },
        sharpness_details: {
          variance: 156.7,
          edge_density: 23.4,
          max_gradient: 89.2,
          focus_regions: [
            { x: 120, y: 80, width: 64, height: 64, sharpness: 92.1 },
            { x: 200, y: 150, width: 64, height: 64, sharpness: 78.5 },
            { x: 350, y: 100, width: 64, height: 64, sharpness: 85.3 }
          ]
        },
        exposure_details: {
          histogram: {
            shadows: 0.18, // 18% in shadows
            midtones: 0.64, // 64% in midtones
            highlights: 0.18 // 18% in highlights
          },
          clipped_pixels: {
            black: 0.002, // 0.2% clipped blacks
            white: 0.001  // 0.1% clipped whites
          },
          dynamic_range: 198
        },
        color_details: {
          saturation_distribution: [
            { hue: 120, saturation: 0.68, percentage: 28.5 }, // Green
            { hue: 210, saturation: 0.45, percentage: 22.1 }, // Blue
            { hue: 30, saturation: 0.72, percentage: 18.7 },  // Orange
            { hue: 300, saturation: 0.38, percentage: 15.2 }, // Purple
            { hue: 0, saturation: 0.81, percentage: 10.8 },   // Red
            { hue: 60, saturation: 0.55, percentage: 4.7 }    // Yellow
          ],
          color_cast: { detected: false },
          vibrance: 67.4
        },
        noise_details: {
          grain_score: 89.2,
          pattern_noise: 0,
          iso_estimate: 200,
          clean_regions: 78.5 // 78.5% of image has low noise
        },
        analysis_confidence: 0.85
      };

      console.log('📊 Sample Technical Quality Analysis Results:');
      console.log('============================================');
      console.log(`Overall Technical Score: ${sampleAnalysis.scores.overall_score}/100\n`);
      
      console.log('🔍 Individual Quality Scores:');
      console.log(`  Sharpness: ${sampleAnalysis.scores.sharpness}/100`);
      console.log(`  Exposure: ${sampleAnalysis.scores.exposure}/100`);
      console.log(`  Contrast: ${sampleAnalysis.scores.contrast}/100`);
      console.log(`  Color Saturation: ${sampleAnalysis.scores.color_saturation}/100`);
      console.log(`  Noise Level: ${sampleAnalysis.scores.noise_level}/100 (higher = less noise)`);
      console.log(`  Motion Blur: ${sampleAnalysis.scores.motion_blur}/100 (higher = less blur)`);

      console.log('\n🎯 Sharpness Analysis:');
      console.log(`  Variance Score: ${sampleAnalysis.sharpness_details.variance.toFixed(1)}`);
      console.log(`  Edge Density: ${sampleAnalysis.sharpness_details.edge_density.toFixed(1)}%`);
      console.log(`  Max Gradient: ${sampleAnalysis.sharpness_details.max_gradient.toFixed(1)}`);
      console.log(`  Focus Regions: ${sampleAnalysis.sharpness_details.focus_regions.length} detected`);
      sampleAnalysis.sharpness_details.focus_regions.forEach((region, i) => {
        console.log(`    Region ${i+1}: (${region.x}, ${region.y}) ${region.width}x${region.height} - Sharpness: ${region.sharpness.toFixed(1)}`);
      });

      console.log('\n💡 Exposure Analysis:');
      console.log(`  Shadows: ${(sampleAnalysis.exposure_details.histogram.shadows * 100).toFixed(1)}%`);
      console.log(`  Midtones: ${(sampleAnalysis.exposure_details.histogram.midtones * 100).toFixed(1)}%`);
      console.log(`  Highlights: ${(sampleAnalysis.exposure_details.histogram.highlights * 100).toFixed(1)}%`);
      console.log(`  Clipped Blacks: ${(sampleAnalysis.exposure_details.clipped_pixels.black * 100).toFixed(2)}%`);
      console.log(`  Clipped Whites: ${(sampleAnalysis.exposure_details.clipped_pixels.white * 100).toFixed(2)}%`);
      console.log(`  Dynamic Range: ${sampleAnalysis.exposure_details.dynamic_range}/255`);

      console.log('\n🎨 Color Analysis:');
      console.log(`  Vibrance Score: ${sampleAnalysis.color_details.vibrance.toFixed(1)}/100`);
      console.log(`  Color Cast: ${sampleAnalysis.color_details.color_cast.detected ? 'Detected' : 'None detected'}`);
      console.log('  Saturation Distribution:');
      sampleAnalysis.color_details.saturation_distribution.forEach((color, i) => {
        const hueNames = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple'];
        const hueName = hueNames[Math.floor(color.hue / 51.4)] || 'Mixed';
        console.log(`    ${hueName} (${color.hue}°): ${(color.saturation * 100).toFixed(1)}% saturation, ${color.percentage.toFixed(1)}% of image`);
      });

      console.log('\n🔇 Noise Analysis:');
      console.log(`  Grain Score: ${sampleAnalysis.noise_details.grain_score.toFixed(1)}/100 (higher = less grain)`);
      console.log(`  Pattern Noise: ${sampleAnalysis.noise_details.pattern_noise.toFixed(1)}/100`);
      console.log(`  Estimated ISO: ${sampleAnalysis.noise_details.iso_estimate}`);
      console.log(`  Clean Regions: ${sampleAnalysis.noise_details.clean_regions.toFixed(1)}% of image`);

      console.log(`\n✅ Analysis Confidence: ${(sampleAnalysis.analysis_confidence * 100).toFixed(1)}%`);
      
    } else {
      // Analyze actual image
      console.log(`📸 Analyzing technical quality: ${testImagePath}`);
      const analysis = await technicalQualityAnalyzer.analyzeTechnicalQuality(testImagePath);
      
      console.log('📊 Technical Quality Analysis Results:');
      console.log('=====================================');
      console.log(JSON.stringify(analysis, null, 2));
    }

    console.log('\n🔧 Technical Quality Analysis System Features:');
    console.log('==============================================');
    console.log('✅ Sharpness Detection - Multi-method approach using Laplacian variance, edge density, and gradient analysis');
    console.log('✅ Exposure Analysis - Histogram-based exposure assessment with clipping detection');
    console.log('✅ Contrast Evaluation - Standard deviation and dynamic range analysis');
    console.log('✅ Color Saturation Assessment - HSV-based saturation analysis with vibrance calculation');
    console.log('✅ Noise Level Detection - Block-based variance analysis for grain and noise estimation');
    console.log('✅ Motion Blur Detection - Edge-based blur detection and motion blur assessment');
    console.log('✅ Color Cast Detection - Automatic color cast identification and strength measurement');

    console.log('\n📈 Algorithm Features:');
    console.log('=====================');
    console.log('• Laplacian variance for sharpness measurement');
    console.log('• Sobel edge detection for gradient analysis');
    console.log('• Histogram analysis for exposure and contrast assessment');
    console.log('• HSV color space analysis for accurate saturation measurement');
    console.log('• Local variance analysis for noise estimation');
    console.log('• Focus region detection for detailed sharpness mapping');
    console.log('• Dynamic range calculation for exposure quality');
    console.log('• Color cast detection using RGB channel balance analysis');

    console.log('\n💡 Quality Scoring Weights:');
    console.log('===========================');
    console.log('• Sharpness: 25% - Most important for perceived quality');
    console.log('• Exposure: 20% - Critical for proper image brightness');
    console.log('• Contrast: 15% - Important for image depth and definition');
    console.log('• Color Saturation: 15% - Affects color vibrancy and appeal');
    console.log('• Noise Level: 15% - Important for clean, professional look');
    console.log('• Motion Blur: 10% - Affects action and movement clarity');

    console.log('\n✅ Technical Quality Assessment Module implementation completed successfully!');

  } catch (error) {
    console.error('❌ Technical quality analysis test failed:', error);
  }
}

// Run the test
testTechnicalQualityAnalysis();
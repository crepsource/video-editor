import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);
const stat = promisify(fs.stat);

export interface TestImageConfig {
  width: number;
  height: number;
  background: { r: number; g: number; b: number };
  elements?: Array<{
    width: number;
    height: number;
    color: { r: number; g: number; b: number };
    position: { x: number; y: number };
  }>;
  format?: 'jpg' | 'png' | 'webp';
  quality?: number;
}

export interface TestVideoConfig {
  duration: number;
  fps: number;
  width: number;
  height: number;
  frameConfigs: TestImageConfig[];
}

export class TestDataManager {
  private static instance: TestDataManager;
  private fixturesDir: string;
  private createdFiles: Set<string> = new Set();
  private createdDirs: Set<string> = new Set();

  constructor(fixturesDir: string = path.join(__dirname, '../fixtures')) {
    this.fixturesDir = fixturesDir;
  }

  public static getInstance(fixturesDir?: string): TestDataManager {
    if (!TestDataManager.instance) {
      TestDataManager.instance = new TestDataManager(fixturesDir);
    }
    return TestDataManager.instance;
  }

  async initialize(): Promise<void> {
    await this.ensureDirectory(this.fixturesDir);
  }

  async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await stat(dirPath);
    } catch (error) {
      await mkdir(dirPath, { recursive: true });
      this.createdDirs.add(dirPath);
    }
  }

  async createTestImage(config: TestImageConfig, filename: string): Promise<string> {
    const filepath = path.join(this.fixturesDir, filename);
    
    // Ensure parent directory exists
    await this.ensureDirectory(path.dirname(filepath));

    let image = sharp({
      create: {
        width: config.width,
        height: config.height,
        channels: 3,
        background: config.background
      }
    });

    // Add composite elements if specified
    if (config.elements && config.elements.length > 0) {
      const compositeElements = await Promise.all(
        config.elements.map(async (element) => ({
          input: await sharp({
            create: {
              width: element.width,
              height: element.height,
              channels: 3,
              background: element.color
            }
          }).png().toBuffer(),
          left: element.position.x,
          top: element.position.y
        }))
      );
      
      image = image.composite(compositeElements);
    }

    // Apply format and quality settings
    const format = config.format || 'jpg';
    const quality = config.quality || 85;

    switch (format) {
      case 'jpg':
        await image.jpeg({ quality }).toFile(filepath);
        break;
      case 'png':
        await image.png().toFile(filepath);
        break;
      case 'webp':
        await image.webp({ quality }).toFile(filepath);
        break;
      default:
        await image.jpeg({ quality }).toFile(filepath);
    }

    this.createdFiles.add(filepath);
    return filepath;
  }

  async createRuleOfThirdsImage(filename: string): Promise<string> {
    const config: TestImageConfig = {
      width: 900,
      height: 600,
      background: { r: 70, g: 130, b: 180 },
      elements: [
        // Subject at rule of thirds intersection
        {
          width: 100,
          height: 100,
          color: { r: 255, g: 255, b: 100 },
          position: { x: 300, y: 200 } // 1/3 positions
        },
        // Secondary element at another intersection
        {
          width: 60,
          height: 60,
          color: { r: 255, g: 100, b: 100 },
          position: { x: 600, y: 400 } // 2/3 positions
        }
      ]
    };

    return this.createTestImage(config, filename);
  }

  async createHighContrastImage(filename: string): Promise<string> {
    const config: TestImageConfig = {
      width: 800,
      height: 600,
      background: { r: 0, g: 0, b: 0 },
      elements: [
        {
          width: 200,
          height: 200,
          color: { r: 255, g: 255, b: 255 },
          position: { x: 100, y: 100 }
        },
        {
          width: 150,
          height: 150,
          color: { r: 255, g: 255, b: 255 },
          position: { x: 450, y: 300 }
        }
      ]
    };

    return this.createTestImage(config, filename);
  }

  async createLowContrastImage(filename: string): Promise<string> {
    const config: TestImageConfig = {
      width: 640,
      height: 480,
      background: { r: 128, g: 128, b: 128 },
      elements: [
        {
          width: 150,
          height: 150,
          color: { r: 140, g: 140, b: 140 },
          position: { x: 200, y: 150 }
        }
      ]
    };

    return this.createTestImage(config, filename);
  }

  async createColorfulImage(filename: string): Promise<string> {
    const config: TestImageConfig = {
      width: 1200,
      height: 800,
      background: { r: 255, g: 255, b: 255 },
      elements: [
        // Red element
        {
          width: 200,
          height: 150,
          color: { r: 255, g: 0, b: 0 },
          position: { x: 100, y: 100 }
        },
        // Green element
        {
          width: 180,
          height: 180,
          color: { r: 0, g: 255, b: 0 },
          position: { x: 400, y: 200 }
        },
        // Blue element
        {
          width: 160,
          height: 200,
          color: { r: 0, g: 0, b: 255 },
          position: { x: 700, y: 150 }
        },
        // Yellow element
        {
          width: 140,
          height: 140,
          color: { r: 255, g: 255, b: 0 },
          position: { x: 300, y: 450 }
        }
      ]
    };

    return this.createTestImage(config, filename);
  }

  async createPortraitImage(filename: string): Promise<string> {
    const config: TestImageConfig = {
      width: 600,
      height: 800,
      background: { r: 220, g: 220, b: 255 },
      elements: [
        // Head/face area
        {
          width: 120,
          height: 160,
          color: { r: 255, g: 220, b: 177 },
          position: { x: 240, y: 180 }
        },
        // Body area
        {
          width: 140,
          height: 300,
          color: { r: 100, g: 150, b: 200 },
          position: { x: 230, y: 340 }
        },
        // Eyes simulation
        {
          width: 20,
          height: 20,
          color: { r: 50, g: 50, b: 50 },
          position: { x: 270, y: 220 }
        },
        {
          width: 20,
          height: 20,
          color: { r: 50, g: 50, b: 50 },
          position: { x: 310, y: 220 }
        }
      ]
    };

    return this.createTestImage(config, filename);
  }

  async createLandscapeImage(filename: string): Promise<string> {
    const config: TestImageConfig = {
      width: 1600,
      height: 900,
      background: { r: 135, g: 206, b: 235 }, // Sky blue
      elements: [
        // Ground/grass
        {
          width: 1600,
          height: 300,
          color: { r: 34, g: 139, b: 34 },
          position: { x: 0, y: 600 }
        },
        // Mountain/hill
        {
          width: 800,
          height: 400,
          color: { r: 139, g: 69, b: 19 },
          position: { x: 400, y: 200 }
        },
        // Sun
        {
          width: 100,
          height: 100,
          color: { r: 255, g: 255, b: 0 },
          position: { x: 1300, y: 150 }
        }
      ]
    };

    return this.createTestImage(config, filename);
  }

  async createBatchTestImages(count: number, prefix: string = 'batch-test'): Promise<string[]> {
    const filePaths: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const config: TestImageConfig = {
        width: 800 + (i * 50),
        height: 600 + (i * 25),
        background: { 
          r: Math.min(255, 100 + i * 20),
          g: Math.min(255, 150 + i * 15),
          b: Math.min(255, 200 + i * 10)
        },
        elements: [
          {
            width: 100 + (i * 10),
            height: 100 + (i * 10),
            color: { 
              r: Math.min(255, 255 - i * 20),
              g: Math.min(255, 100 + i * 25),
              b: Math.min(255, 50 + i * 30)
            },
            position: { 
              x: 200 + (i * 30), 
              y: 150 + (i * 20) 
            }
          }
        ]
      };

      const filename = `${prefix}-${i.toString().padStart(3, '0')}.jpg`;
      const filepath = await this.createTestImage(config, filename);
      filePaths.push(filepath);
    }

    return filePaths;
  }

  async generateLoadTestImages(count: number = 20): Promise<string[]> {
    const loadTestDir = path.join(this.fixturesDir, 'load-test');
    await this.ensureDirectory(loadTestDir);
    
    const filePaths: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const config: TestImageConfig = {
        width: 1200 + (i * 100),
        height: 800 + (i * 50),
        background: { 
          r: 50 + (i * 10) % 200,
          g: 100 + (i * 15) % 200,
          b: 150 + (i * 8) % 200
        },
        elements: [
          // Varied complexity for different processing times
          {
            width: 200 + (i * 20),
            height: 150 + (i * 15),
            color: { 
              r: 255 - (i * 12) % 255,
              g: 200 + (i * 8) % 55,
              b: 100 + (i * 18) % 155
            },
            position: { 
              x: 100 + (i * 40) % 800, 
              y: 100 + (i * 30) % 400
            }
          },
          // Additional element for complexity
          {
            width: 80 + (i * 5),
            height: 80 + (i * 5),
            color: { 
              r: (i * 25) % 255,
              g: (i * 35) % 255,
              b: (i * 15) % 255
            },
            position: { 
              x: 400 + (i * 25) % 600, 
              y: 200 + (i * 35) % 300
            }
          }
        ],
        quality: 70 + (i % 30) // Vary quality for different file sizes
      };

      const filename = `load-test-${i.toString().padStart(3, '0')}.jpg`;
      const filepath = path.join(loadTestDir, filename);
      
      await this.createTestImageDirect(config, filepath);
      filePaths.push(filepath);
    }

    return filePaths;
  }

  private async createTestImageDirect(config: TestImageConfig, filepath: string): Promise<void> {
    let image = sharp({
      create: {
        width: config.width,
        height: config.height,
        channels: 3,
        background: config.background
      }
    });

    if (config.elements && config.elements.length > 0) {
      const compositeElements = await Promise.all(
        config.elements.map(async (element) => ({
          input: await sharp({
            create: {
              width: element.width,
              height: element.height,
              channels: 3,
              background: element.color
            }
          }).png().toBuffer(),
          left: element.position.x,
          top: element.position.y
        }))
      );
      
      image = image.composite(compositeElements);
    }

    const format = config.format || 'jpg';
    const quality = config.quality || 85;

    switch (format) {
      case 'jpg':
        await image.jpeg({ quality }).toFile(filepath);
        break;
      case 'png':
        await image.png().toFile(filepath);
        break;
      case 'webp':
        await image.webp({ quality }).toFile(filepath);
        break;
      default:
        await image.jpeg({ quality }).toFile(filepath);
    }

    this.createdFiles.add(filepath);
  }

  async createTestFixtureSet(setName: string): Promise<{[key: string]: string}> {
    const setDir = path.join(this.fixturesDir, setName);
    await this.ensureDirectory(setDir);

    const fixtures: {[key: string]: string} = {};

    // Create standard test images for different scenarios
    fixtures.ruleOfThirds = await this.createTestImage({
      width: 900,
      height: 600,
      background: { r: 70, g: 130, b: 180 },
      elements: [
        { width: 80, height: 80, color: { r: 255, g: 255, b: 100 }, position: { x: 300, y: 200 } }
      ]
    }, `${setName}/rule-of-thirds.jpg`);

    fixtures.highContrast = await this.createTestImage({
      width: 800,
      height: 600,
      background: { r: 0, g: 0, b: 0 },
      elements: [
        { width: 200, height: 200, color: { r: 255, g: 255, b: 255 }, position: { x: 300, y: 200 } }
      ]
    }, `${setName}/high-contrast.jpg`);

    fixtures.portrait = await this.createTestImage({
      width: 600,
      height: 800,
      background: { r: 220, g: 220, b: 255 },
      elements: [
        { width: 120, height: 160, color: { r: 255, g: 220, b: 177 }, position: { x: 240, y: 200 } }
      ]
    }, `${setName}/portrait.jpg`);

    fixtures.landscape = await this.createTestImage({
      width: 1600,
      height: 900,
      background: { r: 135, g: 206, b: 235 },
      elements: [
        { width: 1600, height: 300, color: { r: 34, g: 139, b: 34 }, position: { x: 0, y: 600 } }
      ]
    }, `${setName}/landscape.jpg`);

    fixtures.colorful = await this.createTestImage({
      width: 800,
      height: 600,
      background: { r: 255, g: 255, b: 255 },
      elements: [
        { width: 150, height: 150, color: { r: 255, g: 0, b: 0 }, position: { x: 100, y: 100 } },
        { width: 120, height: 120, color: { r: 0, g: 255, b: 0 }, position: { x: 400, y: 200 } },
        { width: 100, height: 100, color: { r: 0, g: 0, b: 255 }, position: { x: 600, y: 300 } }
      ]
    }, `${setName}/colorful.jpg`);

    return fixtures;
  }

  async cleanup(): Promise<void> {
    // Clean up individual files
    for (const filepath of this.createdFiles) {
      try {
        if (fs.existsSync(filepath)) {
          await unlink(filepath);
        }
      } catch (error) {
        console.warn(`Failed to clean up file ${filepath}:`, error);
      }
    }

    // Clean up directories (in reverse order of creation)
    const dirList = Array.from(this.createdDirs).reverse();
    for (const dirpath of dirList) {
      try {
        if (fs.existsSync(dirpath)) {
          const files = fs.readdirSync(dirpath);
          if (files.length === 0) {
            await rmdir(dirpath);
          }
        }
      } catch (error) {
        console.warn(`Failed to clean up directory ${dirpath}:`, error);
      }
    }

    this.createdFiles.clear();
    this.createdDirs.clear();
  }

  async cleanupFile(filepath: string): Promise<void> {
    try {
      if (fs.existsSync(filepath)) {
        await unlink(filepath);
        this.createdFiles.delete(filepath);
      }
    } catch (error) {
      console.warn(`Failed to clean up file ${filepath}:`, error);
    }
  }

  async cleanupDirectory(dirpath: string): Promise<void> {
    try {
      if (fs.existsSync(dirpath)) {
        const files = fs.readdirSync(dirpath);
        
        // Remove all files in directory
        for (const file of files) {
          const filePath = path.join(dirpath, file);
          if (fs.statSync(filePath).isFile()) {
            await unlink(filePath);
            this.createdFiles.delete(filePath);
          }
        }
        
        // Remove directory if empty
        await rmdir(dirpath);
        this.createdDirs.delete(dirpath);
      }
    } catch (error) {
      console.warn(`Failed to clean up directory ${dirpath}:`, error);
    }
  }

  getFixturesPath(): string {
    return this.fixturesDir;
  }

  getCreatedFiles(): string[] {
    return Array.from(this.createdFiles);
  }

  getCreatedDirectories(): string[] {
    return Array.from(this.createdDirs);
  }
}

export const testDataManager = TestDataManager.getInstance();
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import adminRoutes from './server/routes/admin.ts';
import licenseRoutes from './server/routes/licenses.ts';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Register Admin and License Routes
console.log('Registering API routes...');

app.get('/api/test', (req, res) => {
  console.log('Test route hit');
  res.json({ message: 'API is working' });
});

app.use('/api/admin', (req, res, next) => {
  console.log(`Admin route hit: ${req.method} ${req.path}`);
  next();
}, adminRoutes);

app.use('/api/licenses', (req, res, next) => {
  console.log(`License route hit: ${req.method} ${req.path}`);
  next();
}, licenseRoutes);

console.log('API routes registered.');

// Global error handler for API routes
app.use('/api/*', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Use a local storage directory instead of tmp for better persistence
const STORAGE_DIR = path.join(process.cwd(), 'storage');
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

const upload = multer({ 
  dest: path.join(STORAGE_DIR, 'uploads'),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB max file size
  }
});

// Ensure uploads dir exists
if (!fs.existsSync(path.join(STORAGE_DIR, 'uploads'))) {
  fs.mkdirSync(path.join(STORAGE_DIR, 'uploads'), { recursive: true });
}

interface RenderJob {
  id: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentScene?: number;
  totalScenes?: number;
  sceneProgress?: number;
  error?: string;
  workDir: string;
  files: Record<string, string>;
  metadata?: any;
}

const jobs = new Map<string, RenderJob>();
const activeProcesses = new Map<string, any>();
const JOBS_FILE = path.join(STORAGE_DIR, 'jobs.json');

let saveTimeout: NodeJS.Timeout | null = null;
function saveJobs() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    try {
      const data = JSON.stringify(Array.from(jobs.entries()));
      fs.writeFile(JOBS_FILE, data, (err) => {
        if (err) console.error("Failed to save jobs:", err);
      });
    } catch (e) {
      console.error("Failed to serialize jobs:", e);
    }
    saveTimeout = null;
  }, 1000);
}

function parseTimemark(timemark: string): number {
  // Expected format: HH:MM:SS.mm
  const parts = timemark.split(':');
  if (parts.length !== 3) return 0;
  
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  
  return (hours * 3600) + (minutes * 60) + seconds;
}

function loadJobs() {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const rawData = fs.readFileSync(JOBS_FILE, 'utf-8');
      if (!rawData) return;
      
      const data = JSON.parse(rawData);
      if (!Array.isArray(data)) {
        console.error("Invalid jobs data format (not an array)");
        return;
      }

      data.forEach(([id, job]: [string, RenderJob]) => {
        if (!id || !job) return;
        
        // Check if workDir still exists
        if (!job.workDir || !fs.existsSync(job.workDir)) {
           // If files are gone, we can't recover.
           return;
        }

        // If the server restarted, try to resume processing jobs instead of failing them
        if (job.status === 'processing' || job.status === 'uploading') {
          console.log(`Attempting to resume job ${id}...`);
          job.status = 'processing'; // Ensure it's in processing state
          jobs.set(id, job);
          
          // Restart processing in background
          processJob(job).catch(err => {
            console.error(`Resumed job ${id} failed:`, err);
            job.status = 'failed';
            job.error = `Resume failed: ${err.message}`;
            saveJobs();
          });
        } else {
          jobs.set(id, job);
        }
      });
      console.log(`Loaded ${jobs.size} jobs from persistence.`);
    }
  } catch (e) {
    console.error("Failed to load jobs:", e);
  }
}

// Load jobs on startup
loadJobs();

// 1. Create Job
app.post('/api/jobs', (req, res) => {
  const jobId = uuidv4();
  const workDir = path.join(STORAGE_DIR, `render-${jobId}`);
  fs.mkdirSync(workDir, { recursive: true });
  jobs.set(jobId, { id: jobId, status: 'uploading', progress: 0, workDir, files: {} });
  saveJobs();
  res.json({ jobId });
});

// 2. Upload File
app.post('/api/jobs/:jobId/upload', upload.single('file'), (req, res) => {
  const { jobId } = req.params;
  const { fieldname } = req.body;
  const job = jobs.get(jobId);
  
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = path.extname(req.file.originalname) || '';
  const destPath = path.join(job.workDir, `${fieldname}${ext}`);
  fs.renameSync(req.file.path, destPath);
  job.files[fieldname] = destPath;
  saveJobs();

  res.json({ success: true });
});

// 3. Start Render
app.post('/api/jobs/:jobId/render', async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  
  job.metadata = req.body.metadata;
  job.status = 'processing';
  job.progress = 0;
  // Initialize scene counts immediately to avoid race conditions in UI
  if (Array.isArray(req.body.metadata)) {
    job.totalScenes = req.body.metadata.length;
    job.currentScene = 0;
  }
  saveJobs();
  res.json({ success: true });

  // Start processing in background
  processJob(job).catch(err => {
    console.error(`Job ${jobId} failed:`, err);
    job.status = 'failed';
    job.error = err.message;
    saveJobs();
  });
});

// 4. Check Status
app.get('/api/jobs/:jobId/status', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ 
    status: job.status, 
    progress: job.progress, 
    error: job.error,
    currentScene: job.currentScene,
    totalScenes: job.totalScenes,
    sceneProgress: job.sceneProgress
  });
});

// 5. Download
app.get('/api/jobs/:jobId/download', (req, res) => {
  const { jobId } = req.params;
  const { action } = req.query;
  const job = jobs.get(jobId);
  if (!job || job.status !== 'completed') return res.status(404).json({ error: 'Video not ready' });
  
  let videoPath = path.join(job.workDir, 'final.mp4');
  
  // Serve preview video for viewing in browser
  if (action === 'view') {
      const previewPath = path.join(job.workDir, 'preview.mp4');
      if (fs.existsSync(previewPath)) {
          videoPath = previewPath;
      }
  }
  
  if (!fs.existsSync(videoPath)) {
    console.error(`Video missing for job ${jobId} at ${videoPath}`);
    return res.status(500).json({ error: 'Video file missing on server' });
  }

  if (action === 'view') {
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.on('error', (err) => {
        console.error(`Stream error for job ${jobId}:`, err);
        if (!res.headersSent) res.status(500).end();
      });
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath)
        .on('error', (err) => {
          console.error(`Stream error for job ${jobId}:`, err);
          if (!res.headersSent) res.status(500).end();
        })
        .pipe(res);
    }
  } else {
    res.download(videoPath, 'story.mp4', (err: any) => {
      if (err) {
        // Ignore client aborts
        if (err.message === 'Request aborted' || err.code === 'ECONNABORTED') {
          return;
        }
        console.error(`Download error for job ${jobId}:`, err);
        if (!res.headersSent) res.status(500).end();
      }
    });
  }
});

// 6. Cancel Job
app.post('/api/jobs/:jobId/cancel', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  
  if (job.status === 'processing' || job.status === 'uploading') {
    job.status = 'failed';
    job.error = 'Cancelled by user';
    
    const proc = activeProcesses.get(jobId);
    if (proc && proc.kill) {
      console.log(`Killing active process for job ${jobId}`);
      proc.kill('SIGKILL');
    }
    activeProcesses.delete(jobId);
    saveJobs();
    res.json({ success: true, message: 'Job cancelled successfully' });
  } else {
    // If job is already completed or failed, just return success as it's already "stopped"
    res.json({ success: true, message: `Job is already in ${job.status} state` });
  }
});

// 7. Download ZIP
app.get('/api/jobs/:jobId/download-zip', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job || job.status !== 'completed') return res.status(404).json({ error: 'Video not ready' });
  
  const finalVideoPath = path.join(job.workDir, 'final.mp4');
  
  if (!fs.existsSync(finalVideoPath)) {
    return res.status(500).json({ error: 'Final video file missing on server' });
  }

  res.attachment(`story-${jobId}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  archive.on('error', (err: any) => {
    if (err.code === 'ECONNABORTED' || err.message === 'Request aborted') return;
    console.error(`Zip error for job ${jobId}:`, err);
    if (!res.headersSent) res.status(500).end();
  });

  res.on('close', () => {
    archive.abort();
  });

  archive.pipe(res);
  
  // Add the high-quality Full HD video
  archive.file(finalVideoPath, { name: 'full-hd-video.mp4' });
  
  // Also include the original audio if it exists
  const audioPath = job.files['audio'];
  if (audioPath && fs.existsSync(audioPath)) {
      const ext = path.extname(audioPath) || '.mp3';
      archive.file(audioPath, { name: `original-audio${ext}` });
  }
  
  archive.finalize();
});

// 8. Catch-all for API routes to prevent falling through to Vite
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

async function processJob(job: RenderJob) {
  const { workDir, metadata, files } = job;
  const audioPath = files['audio'];
  if (!audioPath) throw new Error('Missing audio file');

  const finalVideoPath = path.join(workDir, 'final.mp4');
  
  // If final video already exists and we are resuming, we might be done
  if (fs.existsSync(finalVideoPath) && fs.statSync(finalVideoPath).size > 10000) {
    console.log(`Job ${job.id}: Final video already exists, skipping to completion.`);
    job.status = 'completed';
    job.progress = 100;
    saveJobs();
    return;
  }

  const intermediateFiles: string[] = [];
  const totalScenes = metadata.length;
  job.totalScenes = totalScenes;
  job.currentScene = 0;

  // Calculate total duration
  let totalDuration = 0;
  for (const scene of metadata) {
    const dur = (scene.actualEndTime - scene.actualStartTime);
    if (dur > 0) totalDuration += dur;
  }

  // High Quality Settings for "Final" Video (Max 3GB limit is handled by storage, but we aim for quality)
  // We use CRF (Constant Rate Factor) for quality-based encoding instead of fixed bitrate.
  // CRF 20 is very high quality (visually lossless range is 18-23).
  const audioBitrate = 320000; // 320k for high quality audio

  console.log(`Job ${job.id}: Duration=${totalDuration}s, Generating HQ 1080p Video`);

  for (let i = 0; i < totalScenes; i++) {
    job.currentScene = i + 1;
    job.sceneProgress = 0;
    // Ensure progress is at least 1% once we start processing scenes
    if (job.progress < 1) job.progress = 1;
    saveJobs();
    const scene = metadata[i];
    const inputPath = files[`media_${i}`];
    if (!inputPath) continue;

    const outputPath = path.join(workDir, `scene_${i}.mp4`);
    intermediateFiles.push(outputPath);
    const duration = scene.actualEndTime - scene.actualStartTime;

    console.log(`Job ${job.id}: Processing scene ${i}, input: ${inputPath}, output: ${outputPath}`);
    console.log(`Job ${job.id}: Running ffmpeg command...`);

    // Skip if already exists and has size > 0 (basic check for resumption)
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
      console.log(`Job ${job.id}: Scene ${i} already exists, skipping...`);
      job.progress = Math.round((i / totalScenes) * 80);
      saveJobs();
      continue;
    }

    await new Promise<void>((resolve, reject) => {
      let timeout: NodeJS.Timeout;
      let command = ffmpeg(inputPath);

      // Use 1920x1080 for High Quality
      const scaleFilter = 'scale=1920:1080:force_original_aspect_ratio=decrease';
      const padFilter = 'pad=1920:1080:(ow-iw)/2:(oh-ih)/2';

      if (scene.mediaType === 'image') {
        const totalFrames = Math.ceil(duration * 30) || 1;
        console.log(`Job ${job.id}: Scene ${i} (Image) - Duration: ${duration}s, Frames: ${totalFrames}`);
        
        // Modeling Logic based on videoPrompt keywords
        const vPrompt = (scene.videoPrompt || "").toUpperCase();
        
        // 1s Zoom-out at start (fast), then slow zoom-out to mid, then slow zoom-in, then 1s Zoom-in at end (fast)
        const midFrame = Math.floor(totalFrames / 2);
        // Ensure fastFrames is at least 1 to avoid division by zero
        const fastFrames = Math.max(1, Math.min(30, Math.floor(midFrame / 2)));
        
        // Ensure denominators are at least 1
        const den1 = fastFrames;
        const den2 = Math.max(1, midFrame - fastFrames);
        const den3 = Math.max(1, totalFrames - fastFrames - midFrame);
        const den4 = fastFrames;

        let zoomExpr = `if(lte(on, ${fastFrames}), 1.2 - (0.1/${den1})*on, ` +
                       `if(lte(on, ${midFrame}), 1.1 - (0.1/${den2})*(on-${fastFrames}), ` +
                       `if(lte(on, ${totalFrames}-${fastFrames}), 1.0 + (0.1/${den3})*(on-${midFrame}), ` +
                       `1.1 + (0.1/${den4})*(on-(${totalFrames}-${fastFrames})))))`;
        
        let xExpr = `iw/2-(iw/zoom/2)`;
        let yExpr = `ih/2-(ih/zoom/2)`;

        // Panning logic
        if (vPrompt.includes("PAN_LEFT")) {
          xExpr = `(iw/2-(iw/zoom/2)) + (iw/10)*on/${totalFrames}`;
        } else if (vPrompt.includes("PAN_RIGHT")) {
          xExpr = `(iw/2-(iw/zoom/2)) - (iw/10)*on/${totalFrames}`;
        } else if (vPrompt.includes("PAN_UP")) {
          yExpr = `(ih/2-(ih/zoom/2)) + (ih/10)*on/${totalFrames}`;
        } else if (vPrompt.includes("PAN_DOWN")) {
          yExpr = `(ih/2-(ih/zoom/2)) - (ih/10)*on/${totalFrames}`;
        } else {
          // Default: Random slight offset for "modeling" variety
          const maxOffsetX = (2496 - 1920) / 4;
          const maxOffsetY = (1404 - 1080) / 4;
          const randX = (Math.random() - 0.5) * maxOffsetX;
          const randY = (Math.random() - 0.5) * maxOffsetY;
          xExpr = `(iw/2-(iw/zoom/2)) + ${randX}`;
          yExpr = `(ih/2-(ih/zoom/2)) + ${randY}`;
        }

        command = command
          // Removed -loop 1 here as zoompan handles single images automatically and loop 1 can cause hangs
          .videoFilters([
            'scale=2496:1404:force_original_aspect_ratio=increase',
            'crop=2496:1404',
            `zoompan=z='${zoomExpr}':d=${totalFrames}:x='${xExpr}':y='${yExpr}':s=1920x1080:fps=30`,
            'format=yuv420p',
            `fade=t=in:st=0:d=0.5`,
            `fade=t=out:st=${Math.max(0, duration - 0.5)}:d=0.5`
          ])
          .outputOptions(['-t', duration.toString()]);
      } else {
        console.log(`Job ${job.id}: Scene ${i} (Video) - Duration: ${duration}s`);
        command = command
          .inputOptions(['-stream_loop', '-1'])
          .videoFilters([
            scaleFilter,
            padFilter,
            'setsar=1',
            'fps=30',
            'format=yuv420p',
            `fade=t=in:st=0:d=0.3`,
            `fade=t=out:st=${Math.max(0, duration - 0.3)}:d=0.3`
          ]);
      }

      // Simulated progress interval in case ffmpeg doesn't report it
      let simulatedPercent = 0;
      const progressInterval = setInterval(() => {
        if (simulatedPercent < 95) {
          simulatedPercent += 2; // Increment by 2% every second
          
          const totalScenesSafe = totalScenes || 1;
          const sceneWeight = 1 / totalScenesSafe;
          const currentSceneContribution = (simulatedPercent / 100) * sceneWeight;
          const completedScenesContribution = i * sceneWeight;
          
          const totalProgress = (completedScenesContribution + currentSceneContribution) * 80;
          
          // Only update if ffmpeg hasn't reported a higher progress
          if (job.sceneProgress === undefined || simulatedPercent > job.sceneProgress) {
            job.progress = Math.min(80, Math.max(0, totalProgress));
            job.sceneProgress = Math.round(simulatedPercent);
            saveJobs();
          }
        }
      }, 1000);

      const proc = command
        .duration(duration)
        .outputOptions([
          '-y',
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-r 30',
          '-crf 18', // High quality (visually lossless) to match original video quality
          '-preset fast', // Better quality preset
          '-an',
          '-max_muxing_queue_size 9999' // Prevent buffer errors
        ])
        .on('progress', (p) => {
          let percent = p.percent || 0;
          
          // If percent is missing, try to calculate from timemark
          if (percent === 0 && p.timemark) {
            const currentTime = parseTimemark(p.timemark);
            if (duration > 0) {
              percent = (currentTime / duration) * 100;
            }
          }

          if (percent > 0) {
            simulatedPercent = percent; // Sync simulated progress with actual
            
            // Calculate overall progress:
            const totalScenesSafe = totalScenes || 1;
            const sceneWeight = 1 / totalScenesSafe;
            const currentSceneContribution = (percent / 100) * sceneWeight;
            const completedScenesContribution = i * sceneWeight;
            
            // Map to 0-80% range reserved for scene processing
            const totalProgress = (completedScenesContribution + currentSceneContribution) * 80;
            job.progress = Math.min(80, Math.max(0, totalProgress));
            job.sceneProgress = Math.round(percent);
            saveJobs(); // Save progress frequently
          }
        })
        .on('end', () => {
          clearInterval(progressInterval);
          if (timeout) clearTimeout(timeout);
          activeProcesses.delete(job.id);
          job.progress = Math.floor(((i + 1) / totalScenes) * 80);
          job.sceneProgress = 100;
          saveJobs(); // Checkpoint save
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          clearInterval(progressInterval);
          if (timeout) clearTimeout(timeout);
          activeProcesses.delete(job.id);
          // If cancelled, don't reject with error
          if (job.status === 'failed' && job.error === 'Cancelled by user') {
            return;
          }
          console.error(`Error processing scene ${i}:`, err, stderr);
          reject(new Error(`Scene ${i} error: ${err.message}`));
        });
        
        activeProcesses.set(job.id, proc);
        proc.save(outputPath);
        
        // Add timeout to prevent hanging (10 minutes per scene)
        timeout = setTimeout(() => {
           console.error(`Scene ${i} timed out after 10 minutes`);
           // @ts-ignore
           if (proc.kill) proc.kill('SIGKILL');
           reject(new Error(`Scene ${i} timed out`));
        }, 600000);
    });
  }

  if (intermediateFiles.length === 0) {
    throw new Error("No scenes were successfully processed");
  }

  job.progress = 85;
  const concatFilePath = path.join(workDir, 'concat.txt');
  const concatContent = intermediateFiles.map(f => `file '${f}'`).join('\n');
  fs.writeFileSync(concatFilePath, concatContent);

  await new Promise<void>((resolve, reject) => {
    const concatProc = ffmpeg()
      .input(concatFilePath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .input(audioPath)
      .outputOptions([
        '-y',
        '-c:v copy',
        '-c:a aac',
        `-b:a ${audioBitrate}`,
        '-shortest',
        '-movflags +faststart'
      ])
      .on('progress', (p) => {
        // Concatenation is roughly 80% to 95% of the total job
        if (p.percent) {
          const concatProgress = (p.percent / 100) * 15; // 15% for concat
          job.progress = Math.min(95, 80 + concatProgress);
          saveJobs();
        } else if (p.timemark) {
          const currentTime = parseTimemark(p.timemark);
          if (totalDuration > 0) {
            const percent = (currentTime / totalDuration) * 100;
            const concatProgress = (percent / 100) * 15;
            job.progress = Math.min(95, 80 + concatProgress);
            saveJobs();
          }
        }
      })
      .on('end', async () => {
        activeProcesses.delete(job.id);
        // Verify file exists and has size
        if (fs.existsSync(finalVideoPath) && fs.statSync(finalVideoPath).size > 0) {
          
          // Generate Preview Video (Max 30MB)
          try {
             const previewPath = path.join(workDir, 'preview.mp4');
             const PREVIEW_MAX_BYTES = 30 * 1024 * 1024; // 30MB
             const finalStats = fs.statSync(finalVideoPath);
             
             if (finalStats.size <= PREVIEW_MAX_BYTES) {
                 console.log(`Job ${job.id}: Final video is small enough (${(finalStats.size/1024/1024).toFixed(2)}MB), using as preview.`);
                 fs.copyFileSync(finalVideoPath, previewPath);
             } else {
                 console.log(`Job ${job.id}: Generating preview (Original: ${(finalStats.size/1024/1024).toFixed(2)}MB)`);
                 const audioBitratePreview = 128000;
                 // Calculate video bitrate for 30MB target
                 const totalBits = PREVIEW_MAX_BYTES * 8;
                 // Safety check for duration
                 const safeDuration = totalDuration > 0 ? totalDuration : 60; 
                 const totalBitrate = totalBits / safeDuration;
                 let videoBitratePreview = totalBitrate - audioBitratePreview;
                 
                 // Clamp bitrate
                 if (videoBitratePreview < 100000) videoBitratePreview = 100000; // Min 100k
                 if (videoBitratePreview > 2000000) videoBitratePreview = 2000000; // Cap preview at 2M to be safe

                 await new Promise<void>((resolvePreview, rejectPreview) => {
                     const previewProc = ffmpeg(finalVideoPath)
                        .outputOptions([
                            '-y',
                            '-c:v libx264',
                            `-b:v ${Math.floor(videoBitratePreview)}`,
                            `-maxrate ${Math.floor(videoBitratePreview * 1.5)}`,
                            `-bufsize ${Math.floor(videoBitratePreview * 2)}`,
                            '-c:a aac',
                            `-b:a ${audioBitratePreview}`,
                            '-preset fast'
                        ])
                        .videoFilters('scale=1280:720')
                        .on('end', () => {
                            activeProcesses.delete(job.id);
                            console.log(`Job ${job.id}: Preview generated.`);
                            resolvePreview();
                        })
                        .on('error', (err) => {
                            activeProcesses.delete(job.id);
                            console.error(`Job ${job.id}: Preview generation error`, err);
                            rejectPreview(err);
                        });
                     
                     activeProcesses.set(job.id, previewProc);
                     previewProc.save(previewPath);
                 });
             }
          } catch (err) {
              console.error(`Job ${job.id}: Preview generation failed`, err);
              // Fallback: copy final to preview if transcoding fails
              try {
                fs.copyFileSync(finalVideoPath, path.join(workDir, 'preview.mp4'));
              } catch (e) {}
          }

          job.progress = 100;
          job.status = 'completed';
          saveJobs();
          resolve();
        } else {
          reject(new Error("Final video file is empty or missing"));
        }
      })
      .on('error', (err, stdout, stderr) => {
        activeProcesses.delete(job.id);
        if (job.status === 'failed' && job.error === 'Cancelled by user') {
          return;
        }
        console.error('Error concatenating video:', err, stderr);
        reject(new Error(`Concat error: ${err.message}`));
      });
    
    activeProcesses.set(job.id, concatProc);
    concatProc.save(finalVideoPath);
  });
  
  // Clean up intermediate files to save space, keep final video and audio for ZIP
  try {
    if (fs.existsSync(concatFilePath)) fs.unlinkSync(concatFilePath);
    intermediateFiles.forEach(f => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    
    // Delete original media files but keep the audio for ZIP inclusion
    Object.entries(files).forEach(([key, f]) => {
      if (key !== 'audio' && fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    });
  } catch(e) {
    console.error("Cleanup error:", e);
  }
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Store vite instance for graceful shutdown
    (global as any).__viteServer = vite;
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    
    // SPA Fallback for production
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    
    // Kill active ffmpeg processes
    for (const [jobId, proc] of activeProcesses.entries()) {
      if (proc && proc.kill) {
        console.log(`Killing active process for job ${jobId} during shutdown`);
        proc.kill('SIGKILL');
      }
    }
    
    if ((global as any).__viteServer) {
      await (global as any).__viteServer.close();
    }
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    
    // Force close after 5 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();

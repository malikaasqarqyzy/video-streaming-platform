// @ts-check
// Back-End (Node.js + Express)
import express from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 */

/**
 * @typedef {Object} User
 * @property {string} user_id
 */

/**
 * @typedef {Object} CustomRequest
 * @property {User} user
 */

/**
 * @typedef {Request & CustomRequest} AuthenticatedRequest
 */

const app = express();

app.use(express.json());
app.use(express.static('public'));

// Database configuration
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'video_platform',
  password: '',  // Leave this empty if you haven't set a password for postgres user
  port: 5432,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Successfully connected to the database');
  release();
});

// Multer for file uploads
const storage = multer.diskStorage({
  destination: './uploads/',
  // @ts-ignore
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// JWT secret
const JWT_SECRET = 'your_jwt_secret';

// Middleware to verify JWT
/**
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @returns {void}
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Token required' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }
    // @ts-ignore - We know this is safe because of our middleware
    req.user = user;
    next();
  });
};

// Authentication Routes
/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING user_id',
      [email, hashedPassword]
    );
    console.log('User registered successfully:', result.rows[0]);
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === '23505') {
      res.status(400).json({ error: 'Email already exists' });
    } else if (err.code === '42P01') {
      res.status(500).json({ error: 'Database table does not exist. Please run init.sql' });
    } else {
      res.status(500).json({ error: 'Server error: ' + err.message });
    }
  }
});

/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const token = jwt.sign({ user_id: user.user_id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Video Routes
/**
 * @param {AuthenticatedRequest} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
app.get('/api/videos', authenticateToken, async (req, res) => {
  try {
    // @ts-ignore - We know this is safe because of our middleware
    const result = await pool.query(
      'SELECT video_id, title, status FROM videos WHERE user_id = $1',
      // @ts-ignore
      [req.user.user_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Video processing configuration
const VIDEO_QUALITIES = [
  { name: '1080p', height: 1080, bitrate: '4000k' },
  { name: '720p', height: 720, bitrate: '2500k' },
  { name: '480p', height: 480, bitrate: '1000k' }
];

// Video streaming endpoint
/**
 * @param {AuthenticatedRequest} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
app.get('/api/videos/stream/:videoId/:quality', authenticateToken, async (req, res) => {
  try {
    // @ts-ignore
    const { videoId, quality } = req.params;
    // @ts-ignore - We know this is safe because of our middleware
    const result = await pool.query(
      'SELECT s3_raw_path FROM videos WHERE video_id = $1 AND user_id = $2',
      // @ts-ignore
      [videoId, req.user.user_id]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const videoPath = result.rows[0].s3_raw_path;
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
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: 'Error streaming video' });
  }
});

// Enhanced video upload with transcoding
/**
 * @param {AuthenticatedRequest} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
app.post('/api/videos/upload', authenticateToken, upload.single('video'), async (req, res) => {
  const { title } = req.body;
  const file = req.file;
  
  if (!title || !file) {
    res.status(400).json({ error: 'Title and file required' });
    return;
  }

  try {
    // Insert video record with initial status
    // @ts-ignore - We know this is safe because of our middleware
    const result = await pool.query(
      'INSERT INTO videos (user_id, title, status, s3_raw_path) VALUES ($1, $2, $3, $4) RETURNING *',
      // @ts-ignore
      [req.user.user_id, title, 'processing', file.path]
    );

    // Start transcoding in background
    const videoId = result.rows[0].video_id;
    // @ts-ignore - We know this is safe because of our middleware
    transcodeVideo(file.path, videoId, req.user.user_id);

    res.json({ 
      message: 'Video upload started', 
      videoId,
      status: 'processing'
    });
  } catch (err) {
    res.status(500).json({ error: 'Error uploading video' });
  }
});

// Video transcoding function
/**
 * @param {string} inputPath
 * @param {string} videoId
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function transcodeVideo(inputPath, videoId, userId) {
  try {
    const outputDir = path.join(__dirname, 'uploads', videoId);
    fs.mkdirSync(outputDir, { recursive: true });

    // Create transcoding jobs for each quality
    const transcodingJobs = VIDEO_QUALITIES.map(quality => {
      const outputPath = path.join(outputDir, `${quality.name}.mp4`);
      return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .size(`?x${quality.height}`)
          .videoBitrate(quality.bitrate)
          .output(outputPath)
          .on('end', () => resolve(undefined))
          .on('error', (err) => reject(err))
          .run();
      });
    });

    // Wait for all transcoding jobs to complete
    await Promise.all(transcodingJobs);

    // Update video status
    await pool.query(
      'UPDATE videos SET status = $1 WHERE video_id = $2 AND user_id = $3',
      ['ready', videoId, userId]
    );

  } catch (err) {
    console.error('Transcoding error:', err);
    await pool.query(
      'UPDATE videos SET status = $1 WHERE video_id = $2 AND user_id = $3',
      ['failed', videoId, userId]
    );
  }
}

app.listen(3000, () => console.log('Server running on port 3000'));
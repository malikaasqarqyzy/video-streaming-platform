// Back-End (Node.js + Express)
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Database configuration
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'video_platform',
  password: 'your_password',
  port: 5432,
});

// Multer for file uploads
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// JWT secret
const JWT_SECRET = 'your_jwt_secret';

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      [email, hashedPassword]
    );
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ user_id: user.user_id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Video Routes
app.get('/api/videos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT video_id, title, status FROM videos WHERE user_id = $1',
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
app.get('/api/videos/stream/:videoId/:quality', authenticateToken, async (req, res) => {
  try {
    const { videoId, quality } = req.params;
    const result = await pool.query(
      'SELECT s3_raw_path FROM videos WHERE video_id = $1 AND user_id = $2',
      [videoId, req.user.user_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
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
app.post('/api/videos/upload', authenticateToken, upload.single('video'), async (req, res) => {
  const { title } = req.body;
  const file = req.file;
  
  if (!title || !file) {
    return res.status(400).json({ error: 'Title and file required' });
  }

  try {
    // Insert video record with initial status
    const result = await pool.query(
      'INSERT INTO videos (user_id, title, status, s3_raw_path) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.user_id, title, 'processing', file.path]
    );

    // Start transcoding in background
    const videoId = result.rows[0].video_id;
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
          .on('end', () => resolve())
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
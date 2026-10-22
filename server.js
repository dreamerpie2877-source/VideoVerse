const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_UPLOAD_KEY = process.env.ADMIN_KEY || 'admin123';

// Cloudflare R2 Storage Configuration (S3-compatible)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ? process.env.R2_PUBLIC_URL.replace(/\/+$/, '') : '';

let s3Client = null;
let S3Upload = null;
let DeleteObjectCommand = null;

if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME) {
  try {
    const { S3Client, DeleteObjectCommand: DelCmd } = require('@aws-sdk/client-s3');
    const { Upload } = require('@aws-sdk/lib-storage');

    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    S3Upload = Upload;
    DeleteObjectCommand = DelCmd;
    console.log(`[R2] Connected to Cloudflare R2 bucket: ${R2_BUCKET_NAME}`);
  } catch (err) {
    console.warn('[R2] @aws-sdk packages not loaded yet. Will use local storage until deployed.', err.message);
  }
}

// Ensure storage folders exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const VIDEOS_DIR = path.join(UPLOADS_DIR, 'videos');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'videos.json');

[UPLOADS_DIR, VIDEOS_DIR, THUMBNAILS_DIR, DATA_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Initialize database if not exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}

function readVideos() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db:', err);
    return [];
  }
}

function saveVideos(videos) {
  fs.writeFileSync(DB_FILE, JSON.stringify(videos, null, 2));
}

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'video') {
      cb(null, VIDEOS_DIR);
    } else if (file.fieldname === 'thumbnail') {
      cb(null, THUMBNAILS_DIR);
    } else {
      cb(null, UPLOADS_DIR);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 500 } // 500 MB limit
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// API: Get all videos (with search filter)
app.get('/api/videos', (req, res) => {
  const { search } = req.query;
  let videos = readVideos();

  if (search) {
    const query = search.toLowerCase();
    videos = videos.filter((v) =>
      (v.title && v.title.toLowerCase().includes(query)) ||
      (v.description && v.description.toLowerCase().includes(query))
    );
  }

  // Return videos sorted newest first
  videos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(videos);
});

// API: Get single video details
app.get('/api/videos/:id', (req, res) => {
  const videos = readVideos();
  const video = videos.find((v) => v.id === req.params.id);
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }
  res.json(video);
});

// API: Verify Admin Password
app.post('/api/verify-admin', (req, res) => {
  const { key } = req.body;
  if (key && key === ADMIN_UPLOAD_KEY) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: 'Incorrect admin password' });
});

// API: Upload video
app.post(
  '/api/upload',
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const providedKey = req.body.adminKey || req.headers['x-admin-key'];
      if (!providedKey || providedKey !== ADMIN_UPLOAD_KEY) {
        // Clean up uploaded files if unauthorized
        if (req.files) {
          if (req.files.video && req.files.video[0]) fs.unlinkSync(req.files.video[0].path);
          if (req.files.thumbnail && req.files.thumbnail[0]) fs.unlinkSync(req.files.thumbnail[0].path);
        }
        return res.status(401).json({ error: 'Unauthorized: Invalid admin secret key' });
      }

      if (!req.files || !req.files.video) {
        return res.status(400).json({ error: 'Video file is required' });
      }

      const videoFile = req.files.video[0];
      const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

      const title = req.body.title ? req.body.title.trim() : 'Untitled Video';
      const description = req.body.description ? req.body.description.trim() : '';
      const duration = req.body.duration || '0:00';

      let videoPath = '/uploads/videos/' + videoFile.filename;
      let thumbnailPath = thumbnailFile ? '/uploads/thumbnails/' + thumbnailFile.filename : '/assets/default-thumbnail.svg';
      let r2VideoKey = null;
      let r2ThumbKey = null;
      let storageType = 'local';

      // If Cloudflare R2 is configured and active, upload directly to R2!
      if (s3Client && S3Upload) {
        try {
          r2VideoKey = `videos/${Date.now()}-${videoFile.filename}`;
          const videoUpload = new S3Upload({
            client: s3Client,
            params: {
              Bucket: R2_BUCKET_NAME,
              Key: r2VideoKey,
              Body: fs.createReadStream(videoFile.path),
              ContentType: videoFile.mimetype || 'video/mp4',
            },
          });
          await videoUpload.done();

          // Delete temporary local file
          try { fs.unlinkSync(videoFile.path); } catch (e) {}

          videoPath = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${r2VideoKey}` : `/uploads/videos/${videoFile.filename}`;

          if (thumbnailFile) {
            r2ThumbKey = `thumbnails/${Date.now()}-${thumbnailFile.filename}`;
            const thumbUpload = new S3Upload({
              client: s3Client,
              params: {
                Bucket: R2_BUCKET_NAME,
                Key: r2ThumbKey,
                Body: fs.createReadStream(thumbnailFile.path),
                ContentType: thumbnailFile.mimetype || 'image/jpeg',
              },
            });
            await thumbUpload.done();
            try { fs.unlinkSync(thumbnailFile.path); } catch (e) {}
            thumbnailPath = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${r2ThumbKey}` : `/uploads/thumbnails/${thumbnailFile.filename}`;
          }

          storageType = 'r2';
          console.log(`[R2] Successfully uploaded to Cloudflare R2: ${r2VideoKey}`);
        } catch (r2Err) {
          console.error('[R2] Upload failed, falling back to local file storage:', r2Err);
        }
      }

      const newVideo = {
        id: 'vid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title,
        description,
        duration,
        videoPath,
        videoFileName: videoFile.filename,
        thumbnailPath,
        r2VideoKey,
        r2ThumbKey,
        storageType,
        views: 0,
        likes: 0,
        dislikes: 0,
        comments: [],
        createdAt: new Date().toISOString()
      };

      const videos = readVideos();
      videos.unshift(newVideo);
      saveVideos(videos);

      res.status(201).json({ success: true, video: newVideo });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Internal server error while saving video' });
    }
  }
);

// API: Stream video with HTTP 206 Partial Content for smooth seeking & buffering
app.get('/api/videos/:id/stream', (req, res) => {
  const videos = readVideos();
  const video = videos.find((v) => v.id === req.params.id);
  if (!video) {
    return res.status(404).send('Video not found');
  }

  // If video is stored in Cloudflare R2 and has a public URL, redirect directly to CDN!
  if (video.storageType === 'r2' && video.videoPath && video.videoPath.startsWith('http')) {
    return res.redirect(video.videoPath);
  }

  const filePath = path.join(VIDEOS_DIR, video.videoFileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Video file does not exist on disk');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
      return;
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
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
    fs.createReadStream(filePath).pipe(res);
  }
});

// API: Download video file
app.get('/api/videos/:id/download', (req, res) => {
  const videos = readVideos();
  const video = videos.find((v) => v.id === req.params.id);
  if (!video) {
    return res.status(404).send('Video not found');
  }

  // If video is stored in Cloudflare R2, redirect to CDN file
  if (video.storageType === 'r2' && video.videoPath && video.videoPath.startsWith('http')) {
    return res.redirect(video.videoPath);
  }

  const filePath = path.join(VIDEOS_DIR, video.videoFileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Video file does not exist on disk');
  }

  const ext = path.extname(video.videoFileName) || '.mp4';
  const cleanTitle = (video.title || 'video').replace(/[/\\?%*:|"<>]/g, '_');
  const downloadFileName = `${cleanTitle}${ext}`;

  res.download(filePath, downloadFileName);
});

// API: Increment views
app.post('/api/videos/:id/view', (req, res) => {
  const videos = readVideos();
  const video = videos.find((v) => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  video.views = (video.views || 0) + 1;
  saveVideos(videos);
  res.json({ views: video.views });
});

// API: Like / Dislike
app.post('/api/videos/:id/react', (req, res) => {
  const { action } = req.body; // 'like' or 'dislike'
  const videos = readVideos();
  const video = videos.find((v) => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  if (action === 'like') {
    video.likes = (video.likes || 0) + 1;
  } else if (action === 'dislike') {
    video.dislikes = (video.dislikes || 0) + 1;
  }

  saveVideos(videos);
  res.json({ likes: video.likes, dislikes: video.dislikes });
});

// API: Add comment
app.post('/api/videos/:id/comments', (req, res) => {
  const { text, user } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Comment text is required' });
  }

  const videos = readVideos();
  const video = videos.find((v) => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  if (!video.comments) video.comments = [];

  const newComment = {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    user: user && user.trim() ? user.trim() : 'Viewer',
    text: text.trim(),
    createdAt: new Date().toISOString()
  };

  video.comments.unshift(newComment);
  saveVideos(videos);
  res.status(201).json(newComment);
});

// API: Delete video (Admin only)
app.delete('/api/videos/:id', (req, res) => {
  const providedKey = req.body.adminKey || req.headers['x-admin-key'];
  if (!providedKey || providedKey !== ADMIN_UPLOAD_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin key' });
  }

  let videos = readVideos();
  const videoIndex = videos.findIndex((v) => v.id === req.params.id);
  if (videoIndex === -1) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const video = videos[videoIndex];

  // Delete actual video file from disk (if stored locally)
  if (video.videoFileName) {
    const videoFilePath = path.join(VIDEOS_DIR, video.videoFileName);
    if (fs.existsSync(videoFilePath)) {
      try { fs.unlinkSync(videoFilePath); } catch (e) { console.error('Error deleting video file:', e); }
    }
  }

  // Delete thumbnail file from disk if uploaded locally
  if (video.thumbnailPath && video.thumbnailPath.startsWith('/uploads/thumbnails/')) {
    const thumbFileName = path.basename(video.thumbnailPath);
    const thumbFilePath = path.join(THUMBNAILS_DIR, thumbFileName);
    if (fs.existsSync(thumbFilePath)) {
      try { fs.unlinkSync(thumbFilePath); } catch (e) { console.error('Error deleting thumbnail file:', e); }
    }
  }

  // Delete from Cloudflare R2 if stored in R2
  if (video.storageType === 'r2' && s3Client && DeleteObjectCommand) {
    if (video.r2VideoKey) {
      s3Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: video.r2VideoKey })).catch(e => console.error('[R2] Delete video error:', e));
    }
    if (video.r2ThumbKey) {
      s3Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: video.r2ThumbKey })).catch(e => console.error('[R2] Delete thumb error:', e));
    }
  }

  // Remove from database
  videos.splice(videoIndex, 1);
  saveVideos(videos);

  res.json({ success: true, message: 'Video deleted successfully' });
});

// Fallback for HTML pages
app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

app.listen(PORT, () => {
  console.log(`VideoVerse server is running on http://localhost:${PORT}`);
});

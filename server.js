const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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

// API: Upload video
app.post(
  '/api/upload',
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]),
  (req, res) => {
    try {
      if (!req.files || !req.files.video) {
        return res.status(400).json({ error: 'Video file is required' });
      }

      const videoFile = req.files.video[0];
      const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

      const title = req.body.title ? req.body.title.trim() : 'Untitled Video';
      const description = req.body.description ? req.body.description.trim() : '';
      const duration = req.body.duration || '0:00';

      const newVideo = {
        id: 'vid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title,
        description,
        duration,
        videoPath: '/uploads/videos/' + videoFile.filename,
        videoFileName: videoFile.filename,
        thumbnailPath: thumbnailFile ? '/uploads/thumbnails/' + thumbnailFile.filename : '/assets/default-thumbnail.svg',
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

// Fallback for HTML pages
app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

app.listen(PORT, () => {
  console.log(`VideoVerse server is running on http://localhost:${PORT}`);
});

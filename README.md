# 🎬 VideoVerse - Video Sharing & Streaming Platform

A lightweight, modern video-sharing platform where you can upload your own videos and share them for others to watch.

## ✨ Features Included

### 1. 📽️ Custom Video Player
- Custom controls: Play / Pause, seek/progress bar with live buffer indicator.
- Hover time tooltip showing timestamp while scrubbing.
- Rewind (10s) and Fast-Forward (10s) buttons.
- Volume control with smooth slider and one-click mute.
- Speed control (`0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`).
- Fullscreen mode and Picture-in-Picture (PiP).
- Keyboard shortcuts:
  - `Space` or `K`: Play / Pause
  - `Left Arrow`: Seek backward 5 seconds
  - `Right Arrow`: Seek forward 5 seconds
  - `M`: Toggle mute
  - `F`: Toggle fullscreen
- Auto-hiding control bar during playback.

### 2. 📤 Video Upload System
- Drag & Drop video file upload (MP4, WebM, MOV, etc.).
- **Automatic Thumbnail Generation**: Automatically captures a clear video frame to use as thumbnail if you don't upload a custom image.
- Option to upload a custom thumbnail image.
- Video title, description, channel/creator name, category selector, and tags.
- Live upload progress bar showing uploaded megabytes and percentage.

### 3. 👥 Social & Discovery
- Responsive dark-mode homepage inspired by modern streaming services.
- Search bar with instant title, description, and tag filtering.
- Category filters (Tech, Gaming, Music, Education, Entertainment, Vlogs).
- View counter tracking.
- Interactive Like / Dislike buttons.
- Comment section with user names and relative timestamps (e.g., *"Just now"*, *"5 minutes ago"*).
- Share button with one-click link copying to clipboard.
- "Up Next" recommended videos sidebar on the watch page.

### 4. ⚡ Smooth Streaming
- Backend powered by Node.js & Express supporting **HTTP 206 Partial Content (Byte-Range requests)** so videos start instantly and can be scrubbed without waiting for full download.

---

## 🚀 How to Run

1. Open your terminal in this project folder:
   ```bash
   npm start
   ```
2. Open your web browser and visit:
   ```
   http://localhost:3000
   ```

### 📱 Sharing with People on Your Local Wi-Fi Network
To let family, friends, or coworkers on your local network watch:
1. Find your local IP address (Run `ipconfig` in PowerShell/CMD and look for `IPv4 Address`, e.g., `192.168.1.50`).
2. Share the link with them:
   ```
   http://YOUR_LOCAL_IP:3000
   ```
   *(e.g., `http://192.168.1.50:3000`)*

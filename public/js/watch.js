// Watch Page Logic
let currentVideoId = null;
let player = null;

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  currentVideoId = urlParams.get('v');

  if (!currentVideoId) {
    window.location.href = '/';
    return;
  }

  player = new CustomPlayer('playerWrapper', 'mainVideo');

  loadVideoDetails(currentVideoId);
  initWatchPageActions();
  loadUpNextVideos(currentVideoId);
});

// Toast notification
function showToast(message, duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>✓</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

function formatViews(views) {
  if (!views) return '0 views';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M views';
  if (views >= 1000) return (views / 1000).toFixed(1) + 'K views';
  return `${views} view${views === 1 ? '' : 's'}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function (m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

async function loadVideoDetails(id) {
  try {
    const res = await fetch(`/api/videos/${id}`);
    if (!res.ok) {
      document.getElementById('videoTitle').textContent = 'Video not found or deleted.';
      return;
    }

    const video = await res.json();
    document.title = `${video.title} - VideoVerse`;

    // Stream source via HTTP 206 partial content endpoint
    player.loadSource(`/api/videos/${id}/stream`);

    // Metadata
    document.getElementById('videoTitle').textContent = video.title;
    document.getElementById('likeCount').textContent = video.likes || 0;
    document.getElementById('videoViews').textContent = formatViews(video.views);
    document.getElementById('videoDate').textContent = timeAgo(video.createdAt);
    document.getElementById('videoDescription').textContent = video.description || 'No description provided.';

    // Render Comments
    renderComments(video.comments || []);

    // Record view count once played
    let viewRecorded = false;
    const videoEl = document.getElementById('mainVideo');
    videoEl.addEventListener('play', () => {
      if (!viewRecorded) {
        viewRecorded = true;
        fetch(`/api/videos/${id}/view`, { method: 'POST' })
          .then(r => r.json())
          .then(data => {
            if (data.views) {
              document.getElementById('videoViews').textContent = formatViews(data.views);
            }
          })
          .catch(err => console.error(err));
      }
    });

  } catch (err) {
    console.error('Error fetching video:', err);
  }
}

function renderComments(comments) {
  const header = document.getElementById('commentsCountHeader');
  const list = document.getElementById('commentsList');

  header.textContent = `Comments (${comments.length})`;

  if (comments.length === 0) {
    list.innerHTML = '<div style="color: var(--text-sub); font-size: 0.9rem;">No comments yet. Start the conversation!</div>';
    return;
  }

  list.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-avatar">${(c.user || 'V')[0].toUpperCase()}</div>
      <div class="comment-body">
        <div>
          <span class="comment-author">${escapeHtml(c.user || 'Viewer')}</span>
          <span class="comment-date">${timeAgo(c.createdAt)}</span>
        </div>
        <div class="comment-content">${escapeHtml(c.text)}</div>
      </div>
    </div>
  `).join('');
}

function initWatchPageActions() {
  const likeBtn = document.getElementById('likeBtn');
  const dislikeBtn = document.getElementById('dislikeBtn');
  const shareBtn = document.getElementById('shareBtn');
  const postCommentBtn = document.getElementById('postCommentBtn');
  const commentInput = document.getElementById('commentTextInput');
  const userInput = document.getElementById('commentUserName');

  // Likes
  likeBtn.addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/videos/${currentVideoId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'like' })
      });
      const data = await res.json();
      document.getElementById('likeCount').textContent = data.likes;
      showToast('Liked!');
    } catch (err) {
      console.error(err);
    }
  });

  // Dislikes
  dislikeBtn.addEventListener('click', async () => {
    try {
      await fetch(`/api/videos/${currentVideoId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dislike' })
      });
      showToast('Feedback submitted');
    } catch (err) {
      console.error(err);
    }
  });

  // Share
  shareBtn.addEventListener('click', () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url)
      .then(() => showToast('Video link copied to clipboard!'))
      .catch(() => alert('Share URL: ' + url));
  });

  // Post Comment
  postCommentBtn.addEventListener('click', async () => {
    const text = commentInput.value.trim();
    const user = userInput.value.trim() || 'Viewer';

    if (!text) return;

    try {
      postCommentBtn.disabled = true;
      const res = await fetch(`/api/videos/${currentVideoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, user })
      });

      if (res.ok) {
        commentInput.value = '';
        // reload details for comments
        const vRes = await fetch(`/api/videos/${currentVideoId}`);
        const vData = await vRes.json();
        renderComments(vData.comments || []);
        showToast('Comment posted!');
      }
    } catch (err) {
      console.error(err);
    } finally {
      postCommentBtn.disabled = false;
    }
  });
}

// Up next recommendations
async function loadUpNextVideos(excludeId) {
  const sidebar = document.getElementById('sidebarList');
  try {
    const res = await fetch('/api/videos');
    const videos = await res.json();
    const otherVideos = videos.filter(v => v.id !== excludeId);

    if (otherVideos.length === 0) {
      sidebar.innerHTML = '<div style="color: var(--text-sub); font-size: 0.85rem;">No more videos available.</div>';
      return;
    }

    sidebar.innerHTML = otherVideos.slice(0, 10).map(v => `
      <div class="sidebar-card" onclick="window.location.href='/watch?v=${v.id}'">
        <div class="sidebar-thumb-wrap">
          <img class="sidebar-thumb" src="${v.thumbnailPath}" alt="${escapeHtml(v.title)}" loading="lazy">
          <span class="card-duration">${v.duration || '0:00'}</span>
        </div>
        <div class="sidebar-info">
          <div class="sidebar-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
          <div class="sidebar-meta">${formatViews(v.views)} • ${timeAgo(v.createdAt)}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

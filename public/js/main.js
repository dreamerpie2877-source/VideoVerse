// Main Homepage Logic
let currentSearch = '';
let selectedVideoFile = null;
let generatedThumbnailBlob = null;

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initUploadModal();
  loadVideos();
});

// Toast Notifications helper
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

// Format duration in mm:ss or hh:mm:ss
function formatDuration(seconds) {
  if (isNaN(seconds) || seconds === 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Format time ago
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

// Format view count
function formatViews(views) {
  if (!views) return '0 views';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M views';
  if (views >= 1000) return (views / 1000).toFixed(1) + 'K views';
  return `${views} view${views === 1 ? '' : 's'}`;
}

// Fetch and render video list
async function loadVideos() {
  const grid = document.getElementById('videoGrid');
  grid.innerHTML = '<div style="color: var(--text-muted); padding: 2rem;">Loading videos...</div>';

  try {
    const params = new URLSearchParams();
    if (currentSearch) params.append('search', currentSearch);

    const res = await fetch(`/api/videos?${params.toString()}`);
    const videos = await res.json();

    if (!videos || videos.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="2" y1="7" x2="7" y2="7"></line>
            <line x1="2" y1="17" x2="7" y2="17"></line>
            <line x1="17" y1="17" x2="22" y2="17"></line>
            <line x1="17" y1="7" x2="22" y2="7"></line>
          </svg>
          <h3>No videos found</h3>
          <p>Be the first one to upload a video, or try another search.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = videos.map(video => `
      <div class="video-card" onclick="window.location.href='/watch?v=${video.id}'">
        <div class="card-thumbnail-wrap">
          <img class="card-thumbnail" src="${video.thumbnailPath}" alt="${escapeHtml(video.title)}" loading="lazy">
          <span class="card-duration">${video.duration || '0:00'}</span>
        </div>
        <div class="card-content">
          <div class="card-details" style="width: 100%;">
            <h3 class="card-title" title="${escapeHtml(video.title)}">${escapeHtml(video.title)}</h3>
            <div class="card-meta">
              <span>${formatViews(video.views)}</span> • <span>${timeAgo(video.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load videos:', err);
    grid.innerHTML = '<div style="color: var(--accent); padding: 2rem;">Error loading videos. Please make sure the server is running.</div>';
  }
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

// Navbar search
function initNavbar() {
  const searchInput = document.getElementById('searchInput');
  let debounceTimeout;

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        currentSearch = e.target.value.trim();
        loadVideos();
      }, 350);
    });
  }
}

// Upload Modal Logic
function initUploadModal() {
  const openBtn = document.getElementById('openUploadBtn');
  const closeBtn = document.getElementById('closeUploadBtn');
  const cancelBtn = document.getElementById('cancelUploadBtn');
  const modal = document.getElementById('uploadModal');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('videoFileInput');
  const fileBanner = document.getElementById('filePreviewBanner');
  const fileNameText = document.getElementById('selectedFileName');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const uploadForm = document.getElementById('uploadForm');
  const thumbPreviewBox = document.getElementById('thumbPreviewBox');
  const thumbFileInput = document.getElementById('thumbnailFileInput');

  // Admin Modal Elements
  const adminModal = document.getElementById('adminModal');
  const closeAdminBtn = document.getElementById('closeAdminBtn');
  const cancelAdminBtn = document.getElementById('cancelAdminBtn');
  const adminForm = document.getElementById('adminForm');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const adminErrorMsg = document.getElementById('adminErrorMsg');

  const snapshotVideo = document.getElementById('snapshotVideo');
  const snapshotCanvas = document.getElementById('snapshotCanvas');

  let detectedDuration = '0:00';

  function openAdminModal() {
    adminPasswordInput.value = '';
    adminErrorMsg.style.display = 'none';
    adminModal.classList.add('active');
    setTimeout(() => adminPasswordInput.focus(), 100);
  }

  function closeAdminModal() {
    adminModal.classList.remove('active');
  }

  closeAdminBtn.addEventListener('click', closeAdminModal);
  cancelAdminBtn.addEventListener('click', closeAdminModal);

  adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const enteredKey = adminPasswordInput.value.trim();
    if (!enteredKey) return;

    try {
      const res = await fetch('/api/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: enteredKey })
      });

      if (res.ok) {
        sessionStorage.setItem('adminKey', enteredKey);
        closeAdminModal();
        openModal();
      } else {
        adminErrorMsg.style.display = 'block';
      }
    } catch (err) {
      console.error(err);
      adminErrorMsg.textContent = 'Server connection error. Please try again.';
      adminErrorMsg.style.display = 'block';
    }
  });

  function openModal() {
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
    resetForm();
  }

  function resetForm() {
    uploadForm.reset();
    selectedVideoFile = null;
    generatedThumbnailBlob = null;
    detectedDuration = '0:00';
    dropzone.style.display = 'block';
    fileBanner.classList.remove('active');
    thumbPreviewBox.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-sub);">Auto Frame</span>';
    const progressWrapper = document.getElementById('uploadProgressWrapper');
    progressWrapper.classList.remove('active');
    document.getElementById('uploadProgressFill').style.width = '0%';
    document.getElementById('submitUploadBtn').disabled = false;
  }

  openBtn.addEventListener('click', () => {
    const savedKey = sessionStorage.getItem('adminKey');
    if (savedKey) {
      openModal();
    } else {
      openAdminModal();
    }
  });

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Auto trigger if redirected with ?upload=1
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('upload') === '1') {
    openBtn.click();
  }

  // Dropzone drag/drop
  dropzone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleVideoSelect(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleVideoSelect(e.target.files[0]);
    }
  });

  removeFileBtn.addEventListener('click', () => {
    selectedVideoFile = null;
    fileInput.value = '';
    dropzone.style.display = 'block';
    fileBanner.classList.remove('active');
    thumbPreviewBox.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-sub);">Auto Frame</span>';
  });

  function handleVideoSelect(file) {
    if (!file.type.startsWith('video/')) {
      alert('Please select a valid video file (MP4, WebM, MOV, etc.)');
      return;
    }

    selectedVideoFile = file;
    fileNameText.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    dropzone.style.display = 'none';
    fileBanner.classList.add('active');

    // Auto-fill title if empty
    const titleInput = document.getElementById('videoTitle');
    if (!titleInput.value) {
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      titleInput.value = nameWithoutExt.replace(/[-_]/g, ' ');
    }

    // Auto generate thumbnail & duration
    const videoUrl = URL.createObjectURL(file);
    snapshotVideo.src = videoUrl;

    snapshotVideo.onloadedmetadata = () => {
      detectedDuration = formatDuration(snapshotVideo.duration);
      // Seek to 1s or 25% of duration
      snapshotVideo.currentTime = Math.min(1.0, snapshotVideo.duration / 2);
    };

    snapshotVideo.onseeked = () => {
      snapshotCanvas.width = snapshotVideo.videoWidth || 640;
      snapshotCanvas.height = snapshotVideo.videoHeight || 360;
      const ctx = snapshotCanvas.getContext('2d');
      ctx.drawImage(snapshotVideo, 0, 0, snapshotCanvas.width, snapshotCanvas.height);

      snapshotCanvas.toBlob((blob) => {
        generatedThumbnailBlob = blob;
        const previewUrl = URL.createObjectURL(blob);
        thumbPreviewBox.innerHTML = `<img src="${previewUrl}" alt="Auto frame">`;
      }, 'image/jpeg', 0.85);

      URL.revokeObjectURL(videoUrl);
    };
  }

  // Custom thumbnail picker
  thumbFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const imgFile = e.target.files[0];
      const previewUrl = URL.createObjectURL(imgFile);
      thumbPreviewBox.innerHTML = `<img src="${previewUrl}" alt="Custom thumbnail">`;
    }
  });

  // Submit form via XMLHttpRequest for upload progress tracking
  uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!selectedVideoFile) {
      alert('Please select a video file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('video', selectedVideoFile);

    // If user provided a custom thumbnail file, use it; otherwise use auto-generated blob
    if (thumbFileInput.files && thumbFileInput.files[0]) {
      formData.append('thumbnail', thumbFileInput.files[0]);
    } else if (generatedThumbnailBlob) {
      formData.append('thumbnail', generatedThumbnailBlob, 'thumbnail.jpg');
    }

    formData.append('title', document.getElementById('videoTitle').value);
    formData.append('description', document.getElementById('videoDescription').value);
    formData.append('duration', detectedDuration);
    formData.append('adminKey', sessionStorage.getItem('adminKey') || '');

    const progressWrapper = document.getElementById('uploadProgressWrapper');
    const progressFill = document.getElementById('uploadProgressFill');
    const statusText = document.getElementById('uploadStatusText');
    const percentText = document.getElementById('uploadPercentText');
    const submitBtn = document.getElementById('submitUploadBtn');

    progressWrapper.classList.add('active');
    submitBtn.disabled = true;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        progressFill.style.width = percent + '%';
        percentText.textContent = percent + '%';
        statusText.textContent = `Uploading: ${(event.loaded / (1024 * 1024)).toFixed(1)} MB / ${(event.total / (1024 * 1024)).toFixed(1)} MB`;
      }
    };

    xhr.onload = () => {
      if (xhr.status === 201 || xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        closeModal();
        showToast('Video published successfully!');
        // redirect to watch page or refresh feed
        setTimeout(() => {
          if (response.video && response.video.id) {
            window.location.href = `/watch?v=${response.video.id}`;
          } else {
            loadVideos();
          }
        }, 800);
      } else if (xhr.status === 401) {
        sessionStorage.removeItem('adminKey');
        alert('Unauthorized: Invalid or expired admin password.');
        closeModal();
        openAdminModal();
        submitBtn.disabled = false;
      } else {
        alert('Upload failed: ' + xhr.statusText);
        submitBtn.disabled = false;
      }
    };

    xhr.onerror = () => {
      alert('Upload failed due to network error.');
      submitBtn.disabled = false;
    };

    xhr.send(formData);
  });
}

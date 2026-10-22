// Custom Video Player Controller
class CustomPlayer {
  constructor(wrapperId, videoId) {
    this.wrapper = document.getElementById(wrapperId);
    this.video = document.getElementById(videoId);

    if (!this.wrapper || !this.video) return;

    // Control Elements
    this.playPauseBtn = document.getElementById('playPauseBtn');
    this.playIcon = document.getElementById('playIcon');
    this.pauseIcon = document.getElementById('pauseIcon');
    this.skipBackBtn = document.getElementById('skipBackBtn');
    this.skipForwardBtn = document.getElementById('skipForwardBtn');

    this.progressContainer = document.getElementById('progressContainer');
    this.progressBarBuffer = document.getElementById('progressBarBuffer');
    this.progressBarFill = document.getElementById('progressBarFill');
    this.progressScrubber = document.getElementById('progressScrubber');
    this.progressTooltip = document.getElementById('progressTooltip');

    this.timeDisplay = document.getElementById('timeDisplay');
    this.volumeBtn = document.getElementById('volumeBtn');
    this.volumeSlider = document.getElementById('volumeSlider');
    this.volumeHighIcon = document.getElementById('volumeHighIcon');
    this.volumeMuteIcon = document.getElementById('volumeMuteIcon');

    this.speedBtn = document.getElementById('speedBtn');
    this.speedLabel = document.getElementById('speedLabel');
    this.speedMenu = document.getElementById('speedMenu');

    this.pipBtn = document.getElementById('pipBtn');
    this.fullscreenBtn = document.getElementById('fullscreenBtn');
    this.fullscreenIcon = document.getElementById('fullscreenIcon');
    this.exitFullscreenIcon = document.getElementById('exitFullscreenIcon');

    this.isScrubbing = false;
    this.hideControlsTimeout = null;
    this.lastVolume = 1;

    this.bindEvents();
  }

  bindEvents() {
    // Play / Pause toggles
    this.playPauseBtn.addEventListener('click', () => this.togglePlay());
    this.video.addEventListener('click', () => this.togglePlay());

    this.video.addEventListener('play', () => {
      this.playIcon.style.display = 'none';
      this.pauseIcon.style.display = 'block';
      this.wrapper.classList.remove('paused');
      this.startHideControlsTimer();
    });

    this.video.addEventListener('pause', () => {
      this.playIcon.style.display = 'block';
      this.pauseIcon.style.display = 'none';
      this.wrapper.classList.add('paused');
      this.showControls();
    });

    // Skips
    this.skipBackBtn.addEventListener('click', () => this.seekBy(-10));
    this.skipForwardBtn.addEventListener('click', () => this.seekBy(10));

    // Time Update & Buffer
    this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.video.addEventListener('progress', () => this.onBufferProgress());
    this.video.addEventListener('loadedmetadata', () => {
      this.updateTimeDisplay();
    });

    // Scrubbing & Seeking
    this.progressContainer.addEventListener('mousedown', (e) => this.startScrubbing(e));
    window.addEventListener('mousemove', (e) => this.scrub(e));
    window.addEventListener('mouseup', () => this.stopScrubbing());

    // Touch Scrubbing for Mobile & Tablets
    this.progressContainer.addEventListener('touchstart', (e) => this.startScrubbing(e), { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (this.isScrubbing) {
        this.scrub(e);
      }
    }, { passive: true });
    window.addEventListener('touchend', () => this.stopScrubbing());

    // Hover tooltip
    this.progressContainer.addEventListener('mousemove', (e) => this.updateTooltip(e));
    this.progressContainer.addEventListener('mouseleave', () => {
      this.progressTooltip.style.display = 'none';
    });

    // Volume
    this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
    this.volumeBtn.addEventListener('click', () => this.toggleMute());

    // Speed Menu
    this.speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speedMenu.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!this.speedMenu.contains(e.target) && e.target !== this.speedBtn) {
        this.speedMenu.classList.remove('show');
      }
    });

    this.speedMenu.querySelectorAll('.speed-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        this.video.playbackRate = speed;
        this.speedLabel.textContent = speed + 'x';
        this.speedMenu.querySelectorAll('.speed-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.speedMenu.classList.remove('show');
      });
    });

    // Picture-in-Picture
    if ('pictureInPictureEnabled' in document) {
      this.pipBtn.addEventListener('click', async () => {
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else {
            await this.video.requestPictureInPicture();
          }
        } catch (err) {
          console.error(err);
        }
      });
    } else {
      this.pipBtn.style.display = 'none';
    }

    // Fullscreen
    this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    this.video.addEventListener('dblclick', () => this.toggleFullscreen());

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        this.fullscreenIcon.style.display = 'none';
        this.exitFullscreenIcon.style.display = 'block';
      } else {
        this.fullscreenIcon.style.display = 'block';
        this.exitFullscreenIcon.style.display = 'none';
      }
    });

    // User activity auto-hide controls
    this.wrapper.addEventListener('mousemove', () => {
      this.showControls();
      if (!this.video.paused) {
        this.startHideControlsTimer();
      }
    });

    this.wrapper.addEventListener('mouseleave', () => {
      if (!this.video.paused) {
        this.hideControls();
      }
    });

    // Mobile Touch Show / Hide Controls
    this.wrapper.addEventListener('touchstart', (e) => {
      if (e.target.closest('#playerControls')) return;
      if (this.wrapper.classList.contains('user-active') && !this.video.paused) {
        this.hideControls();
      } else {
        this.showControls();
        if (!this.video.paused) {
          this.startHideControlsTimer();
        }
      }
    }, { passive: true });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea') return;

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.seekBy(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.seekBy(5);
          break;
        case 'KeyM':
          e.preventDefault();
          this.toggleMute();
          break;
        case 'KeyF':
          e.preventDefault();
          this.toggleFullscreen();
          break;
      }
    });
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play();
    } else {
      this.video.pause();
    }
  }

  seekBy(deltaSeconds) {
    this.video.currentTime = Math.max(0, Math.min(this.video.duration || 0, this.video.currentTime + deltaSeconds));
  }

  onTimeUpdate() {
    if (!this.isScrubbing && this.video.duration) {
      const progress = (this.video.currentTime / this.video.duration) * 100;
      this.progressBarFill.style.width = progress + '%';
      this.progressScrubber.style.left = progress + '%';
      this.updateTimeDisplay();
    }
  }

  onBufferProgress() {
    if (this.video.duration && this.video.buffered.length > 0) {
      const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
      const bufferPercent = (bufferedEnd / this.video.duration) * 100;
      this.progressBarBuffer.style.width = bufferPercent + '%';
    }
  }

  updateTimeDisplay() {
    const cur = this.formatTime(this.video.currentTime || 0);
    const dur = this.formatTime(this.video.duration || 0);
    this.timeDisplay.textContent = `${cur} / ${dur}`;
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds === 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  getClientX(e) {
    if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
    return e.clientX;
  }

  startScrubbing(e) {
    this.isScrubbing = true;
    this.scrub(e);
  }

  scrub(e) {
    if (!this.isScrubbing || !this.video.duration) return;
    const rect = this.progressContainer.getBoundingClientRect();
    const clientX = this.getClientX(e);
    if (clientX === undefined) return;
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    this.progressBarFill.style.width = (pos * 100) + '%';
    this.progressScrubber.style.left = (pos * 100) + '%';
    this.video.currentTime = pos * this.video.duration;
    this.updateTimeDisplay();
  }

  stopScrubbing() {
    this.isScrubbing = false;
  }

  updateTooltip(e) {
    if (!this.video.duration) return;
    const rect = this.progressContainer.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = pos * this.video.duration;

    this.progressTooltip.textContent = this.formatTime(targetTime);
    this.progressTooltip.style.left = `${pos * 100}%`;
    this.progressTooltip.style.display = 'block';
  }

  setVolume(val) {
    this.video.volume = val;
    this.video.muted = val === 0;
    this.updateVolumeIcons();
  }

  toggleMute() {
    if (this.video.muted || this.video.volume === 0) {
      this.video.muted = false;
      this.video.volume = this.lastVolume > 0 ? this.lastVolume : 1;
      this.volumeSlider.value = this.video.volume;
    } else {
      this.lastVolume = this.video.volume;
      this.video.muted = true;
      this.video.volume = 0;
      this.volumeSlider.value = 0;
    }
    this.updateVolumeIcons();
  }

  updateVolumeIcons() {
    if (this.video.muted || this.video.volume === 0) {
      this.volumeHighIcon.style.display = 'none';
      this.volumeMuteIcon.style.display = 'block';
    } else {
      this.volumeHighIcon.style.display = 'block';
      this.volumeMuteIcon.style.display = 'none';
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.wrapper.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen().catch(err => console.error(err));
    }
  }

  showControls() {
    this.wrapper.classList.add('user-active');
  }

  hideControls() {
    this.wrapper.classList.remove('user-active');
  }

  startHideControlsTimer() {
    clearTimeout(this.hideControlsTimeout);
    this.hideControlsTimeout = setTimeout(() => {
      if (!this.video.paused) {
        this.hideControls();
      }
    }, 2500);
  }

  loadSource(src) {
    this.video.src = src;
    this.video.load();
  }
}

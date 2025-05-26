export default class AudioPlayer extends HTMLElement {
   constructor(props) {
      super();
      slice.attachTemplate(this);
      
      // DOM elements
      this.$container = this.querySelector('.audio-player-container');
      this.$header = this.querySelector('.audio-header');
      this.$title = this.querySelector('.audio-title');
      this.$duration = this.querySelector('.audio-duration');
      this.$waveform = this.querySelector('.audio-waveform');
      this.$progress = this.querySelector('.progress-bar');
      this.$progressFill = this.querySelector('.progress-fill');
      this.$controls = this.querySelector('.audio-controls');
      this.$playBtn = this.querySelector('.play-btn');
      this.$stopBtn = this.querySelector('.stop-btn');
      this.$loopBtn = this.querySelector('.loop-btn');
      this.$backwardBtn = this.querySelector('.backward-btn');
      this.$forwardBtn = this.querySelector('.forward-btn');
      this.$volumeContainer = this.querySelector('.volume-container');
      this.$volumeSlider = this.querySelector('.volume-slider');
      this.$volumeValue = this.querySelector('.volume-value');
      this.$deleteBtn = this.querySelector('.delete-btn');
      
      slice.controller.setComponentProps(this, props);
      this.debuggerProps = ['audioData', 'onDelete', 'onPlay', 'onStop'];
      
      // Audio state
      this.audio = null;
      this.isPlaying = false;
      this.isLooping = false;
      this.volume = 1.0;
      this.duration = 0;
      this.audioConverter = null;
   }

   async init() {
      try {
         // Initialize audio converter
         this.audioConverter = await slice.build('AudioConverter');
         
         // Setup audio data
         if (this.audioData) {
            await this.setupAudio();
         }
         
         // Setup event listeners
         this.setupEventListeners();
         
         slice.logger.logInfo('AudioPlayer', `Audio player initialized for: ${this.audioData?.name}`);
      } catch (error) {
         slice.logger.logError('AudioPlayer', 'Failed to initialize audio player', error);
         this.showError();
      }
   }

   get audioData() {
      return this._audioData;
   }

   set audioData(value) {
      this._audioData = value;
   }

   get onDelete() {
      return this._onDelete;
   }

   set onDelete(value) {
      this._onDelete = value;
   }

   get onPlay() {
      return this._onPlay;
   }

   set onPlay(value) {
      this._onPlay = value;
   }

   get onStop() {
      return this._onStop;
   }

   set onStop(value) {
      this._onStop = value;
   }

   async setupAudio() {
      try {
         // Create audio element
         this.audio = new Audio();
         this.audio.preload = 'metadata';
         
         // Set audio source from base64 data
         this.audio.src = this.audioData.base64Data;
         
         // Configure audio properties
         this.audio.volume = this.volume;
         this.audio.loop = this.isLooping;
         
         // Update UI with audio info
         this.updateAudioInfo();
         
         // Setup audio event listeners
         this.setupAudioEventListeners();
         
      } catch (error) {
         slice.logger.logError('AudioPlayer', 'Failed to setup audio', error);
         throw error;
      }
   }

   updateAudioInfo() {
      // Set title
      this.$title.textContent = this.audioData.name;
      
      // Set duration
      const duration = this.audioData.duration || 0;
      this.$duration.textContent = this.audioConverter.formatDuration(duration);
      this.duration = duration;
      
      // Set volume display
      this.updateVolumeDisplay();
      
      // Set initial states
      this.updatePlayButton();
      this.updateLoopButton();
   }

   setupEventListeners() {
      // Play/Pause button
      this.$playBtn.addEventListener('click', () => {
         this.togglePlay();
      });

      // Stop button
      this.$stopBtn.addEventListener('click', () => {
         this.stopAudio();
      });

      // Loop button
      this.$loopBtn.addEventListener('click', () => {
         this.toggleLoop();
      });

      // Backward button (rewind 10 seconds)
      this.$backwardBtn.addEventListener('click', () => {
         this.skipBackward();
      });

      // Forward button (skip 10 seconds)
      this.$forwardBtn.addEventListener('click', () => {
         this.skipForward();
      });

      // Volume slider
      this.$volumeSlider.addEventListener('input', (e) => {
         this.setVolume(parseFloat(e.target.value));
      });

      // Progress bar click
      this.$progress.addEventListener('click', (e) => {
         this.seekToPosition(e);
      });

      // Delete button
      this.$deleteBtn.addEventListener('click', () => {
         this.deleteAudio();
      });

      // Keyboard shortcuts when focused
      this.$container.addEventListener('keydown', (e) => {
         this.handleKeyboardShortcuts(e);
      });

      // Double-click to play
      this.$container.addEventListener('dblclick', () => {
         this.togglePlay();
      });
   }

   setupAudioEventListeners() {
      // Update progress
      this.audio.addEventListener('timeupdate', () => {
         this.updateProgress();
      });

      // Audio loaded
      this.audio.addEventListener('loadedmetadata', () => {
         this.duration = this.audio.duration;
         this.$duration.textContent = this.audioConverter.formatDuration(this.duration);
      });

      // Audio ended
      this.audio.addEventListener('ended', () => {
         if (!this.isLooping) {
            this.stopAudio();
         }
      });

      // Audio error
      this.audio.addEventListener('error', (e) => {
         slice.logger.logError('AudioPlayer', 'Audio playback error', e);
         this.showError();
      });

      // Audio can play
      this.audio.addEventListener('canplay', () => {
         this.$container.classList.remove('loading');
      });

      // Audio loading
      this.audio.addEventListener('loadstart', () => {
         this.$container.classList.add('loading');
      });
   }

   togglePlay() {
      if (!this.audio) return;

      if (this.isPlaying) {
         this.pauseAudio();
      } else {
         this.playAudio();
      }
   }

   async playAudio() {
      if (!this.audio) return;

      try {
         await this.audio.play();
         this.isPlaying = true;
         this.updatePlayButton();
         this.$container.classList.add('playing');
         
         // Notify parent component
         if (this.onPlay) {
            this.onPlay(this.audioData.id, this.audio);
         }
         
      } catch (error) {
         slice.logger.logError('AudioPlayer', 'Failed to play audio', error);
         this.showError();
      }
   }

   pauseAudio() {
      if (!this.audio) return;

      this.audio.pause();
      this.isPlaying = false;
      this.updatePlayButton();
      this.$container.classList.remove('playing');
   }

   stopAudio() {
      if (!this.audio) return;

      this.audio.pause();
      this.audio.currentTime = 0;
      this.isPlaying = false;
      this.updatePlayButton();
      this.updateProgress();
      this.$container.classList.remove('playing');
      
      // Notify parent component
      if (this.onStop) {
         this.onStop(this.audioData.id);
      }
   }

   toggleLoop() {
      this.isLooping = !this.isLooping;
      if (this.audio) {
         this.audio.loop = this.isLooping;
      }
      this.updateLoopButton();
   }

   skipBackward() {
      if (!this.audio) return;
      
      this.audio.currentTime = Math.max(0, this.audio.currentTime - 10);
   }

   skipForward() {
      if (!this.audio) return;
      
      this.audio.currentTime = Math.min(this.duration, this.audio.currentTime + 10);
   }

   setVolume(volume) {
      this.volume = Math.max(0, Math.min(1, volume));
      
      if (this.audio) {
         this.audio.volume = this.volume;
      }
      
      this.updateVolumeDisplay();
   }

   seekToPosition(event) {
      if (!this.audio || !this.duration) return;

      const rect = this.$progress.getBoundingClientRect();
      const clickPosition = (event.clientX - rect.left) / rect.width;
      const newTime = clickPosition * this.duration;
      
      this.audio.currentTime = Math.max(0, Math.min(this.duration, newTime));
   }

   updateProgress() {
      if (!this.audio || !this.duration) return;

      const progress = (this.audio.currentTime / this.duration) * 100;
      this.$progressFill.style.width = `${progress}%`;
      
      // Update time display in title or tooltip
      const currentTime = this.audioConverter.formatDuration(this.audio.currentTime);
      const totalTime = this.audioConverter.formatDuration(this.duration);
      this.$progress.title = `${currentTime} / ${totalTime}`;
   }

   updatePlayButton() {
      if (this.isPlaying) {
         this.$playBtn.innerHTML = '⏸️';
         this.$playBtn.title = 'Pause';
      } else {
         this.$playBtn.innerHTML = '▶️';
         this.$playBtn.title = 'Play';
      }
   }

   updateLoopButton() {
      if (this.isLooping) {
         this.$loopBtn.classList.add('active');
         this.$loopBtn.title = 'Disable Loop';
      } else {
         this.$loopBtn.classList.remove('active');
         this.$loopBtn.title = 'Enable Loop';
      }
   }

   updateVolumeDisplay() {
      this.$volumeSlider.value = this.volume;
      this.$volumeValue.textContent = Math.round(this.volume * 100) + '%';
      
      // Update volume icon based on level
      const volumeIcon = this.$volumeContainer.querySelector('.volume-icon');
      if (volumeIcon) {
         if (this.volume === 0) {
            volumeIcon.textContent = '🔇';
         } else if (this.volume < 0.5) {
            volumeIcon.textContent = '🔉';
         } else {
            volumeIcon.textContent = '🔊';
         }
      }
   }

   handleKeyboardShortcuts(event) {
      event.preventDefault();
      
      switch (event.code) {
         case 'Space':
            this.togglePlay();
            break;
         case 'KeyS':
            this.stopAudio();
            break;
         case 'KeyL':
            this.toggleLoop();
            break;
         case 'ArrowLeft':
            this.skipBackward();
            break;
         case 'ArrowRight':
            this.skipForward();
            break;
         case 'ArrowUp':
            this.setVolume(this.volume + 0.1);
            break;
         case 'ArrowDown':
            this.setVolume(this.volume - 0.1);
            break;
      }
   }

   async deleteAudio() {
      const confirmed = confirm(`Are you sure you want to delete "${this.audioData.name}"?`);
      
      if (confirmed) {
         // Stop audio if playing
         this.stopAudio();
         
         // Notify parent component
         if (this.onDelete) {
            this.onDelete(this.audioData.id);
         }
      }
   }

   showError() {
      this.$container.classList.add('error');
      this.$title.textContent = `Error: ${this.audioData?.name || 'Unknown'}`;
      
      // Disable controls
      const buttons = this.$controls.querySelectorAll('button');
      buttons.forEach(btn => {
         if (!btn.classList.contains('delete-btn')) {
            btn.disabled = true;
         }
      });
   }

   // Cleanup method
   destroy() {
      if (this.audio) {
         this.audio.pause();
         this.audio.src = '';
         this.audio = null;
      }
   }

   // Called when component is removed from DOM
   disconnectedCallback() {
      this.destroy();
   }
}

customElements.define('slice-audio-player', AudioPlayer);
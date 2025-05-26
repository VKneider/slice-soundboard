export default class SoundboardApp extends HTMLElement {
   constructor(props) {
      super();
      slice.attachTemplate(this);
      
      this.$header = this.querySelector('.soundboard-header');
      this.$playlistSelector = this.querySelector('.playlist-selector-container');
      this.$uploadSection = this.querySelector('.upload-section');
      this.$playlistManager = this.querySelector('.playlist-manager-container');
      this.$audioGrid = this.querySelector('.audio-grid');
      this.$footer = this.querySelector('.footer-info');
      
      slice.controller.setComponentProps(this, props);
      this.debuggerProps = [];
      
      // Application state
      this.playlistService = null;
      this.currentPlaylist = null;
      this.audioFiles = [];
      this.playingAudios = new Map(); // Track currently playing audios
   }

   async init() {
      try {
         // Initialize playlist service
         this.playlistService = await slice.build('PlaylistService');
         await this.playlistService.init();

         // Create header
         await this.createHeader();

         // Create playlist selector
         await this.createPlaylistSelector();

         // Create upload section
         await this.createUploadSection();

         // Create playlist manager
         await this.createPlaylistManager();

         // Load initial playlist
         await this.loadCurrentPlaylist();

         // Create footer
         await this.createFooter();

         // Setup event listeners
         this.setupEventListeners();

         slice.logger.logInfo('SoundboardApp', 'Application initialized successfully');
      } catch (error) {
         slice.logger.logError('SoundboardApp', 'Failed to initialize application', error);
         this.showError('Failed to initialize application. Please refresh the page.');
      }
   }

   async createHeader() {
      const header = document.createElement('div');
      header.classList.add('app-header');
      
      header.innerHTML = `
         <div class="header-content">
            <h1 class="app-title">
               <span class="title-icon">🎵</span>
               Slice.js Soundboard
            </h1>
            <div class="header-controls">
               <div class="theme-selector"></div>
               <div class="storage-info"></div>
            </div>
         </div>
      `;

      // Add theme selector
      const themeButton = await slice.build('Button', {
         value: 'Toggle Theme',
         customColor: {
            button: 'var(--secondary-color)',
            label: 'var(--secondary-color-contrast)'
         },
         onClickCallback: async () => {
            const currentTheme = slice.stylesManager.themeManager.currentTheme;
            if (currentTheme === 'Slice') {
               await slice.setTheme('Dark');
            } else if (currentTheme === 'Dark') {
               await slice.setTheme('Light');
            } else {
               await slice.setTheme('Slice');
            }
         }
      });

      header.querySelector('.theme-selector').appendChild(themeButton);
      this.$header.appendChild(header);
   }

   async createPlaylistSelector() {
      const playlistSelector = await slice.build('PlaylistSelector', {
         playlistService: this.playlistService,
         onPlaylistChange: (playlist) => this.onPlaylistChange(playlist)
      });

      this.$playlistSelector.appendChild(playlistSelector);
   }

   async createUploadSection() {
      const uploader = await slice.build('AudioUploader', {
         playlistService: this.playlistService,
         onFilesUploaded: (result) => this.onFilesUploaded(result)
      });

      this.$uploadSection.appendChild(uploader);
   }

   async createPlaylistManager() {
      const manager = await slice.build('PlaylistManager', {
         playlistService: this.playlistService,
         onPlaylistUpdated: () => this.onPlaylistUpdated()
      });

      this.$playlistManager.appendChild(manager);
   }

   async loadCurrentPlaylist() {
      try {
         this.currentPlaylist = this.playlistService.getCurrentPlaylist();
         
         if (!this.currentPlaylist) {
            throw new Error('No current playlist available');
         }

         this.audioFiles = await this.playlistService.getPlaylistAudios(this.currentPlaylist.id);
         await this.renderAudioGrid();
         
         slice.logger.logInfo('SoundboardApp', `Loaded playlist: ${this.currentPlaylist.name}`);
      } catch (error) {
         slice.logger.logError('SoundboardApp', 'Failed to load current playlist', error);
         this.showError('Failed to load playlist');
      }
   }

   async renderAudioGrid() {
      // Clear existing grid
      this.$audioGrid.innerHTML = '';

      if (this.audioFiles.length === 0) {
         this.showEmptyState();
         return;
      }

      // Create grid container
      const grid = document.createElement('div');
      grid.classList.add('audio-players-grid');

      // Create audio players
      for (const audioFile of this.audioFiles) {
         try {
            const audioPlayer = await slice.build('AudioPlayer', {
               audioData: audioFile,
               onDelete: (audioId) => this.onDeleteAudio(audioId),
               onPlay: (audioId, audioElement) => this.onAudioPlay(audioId, audioElement),
               onStop: (audioId) => this.onAudioStop(audioId)
            });

            grid.appendChild(audioPlayer);
         } catch (error) {
            slice.logger.logError('SoundboardApp', `Failed to create audio player for ${audioFile.name}`, error);
         }
      }

      this.$audioGrid.appendChild(grid);
   }

   showEmptyState() {
      this.$audioGrid.innerHTML = `
         <div class="empty-state">
            <div class="empty-icon">🎼</div>
            <h3>No Audio Files</h3>
            <p>Upload some audio files to get started with your soundboard!</p>
            <div class="empty-actions">
               <button class="upload-hint-button">Upload Audio Files</button>
            </div>
         </div>
      `;

      // Add click handler to upload hint button
      this.$audioGrid.querySelector('.upload-hint-button').addEventListener('click', () => {
         const uploadInput = document.querySelector('input[type="file"][accept*="audio"]');
         if (uploadInput) {
            uploadInput.click();
         }
      });
   }

   async onPlaylistChange(playlist) {
      try {
         await this.playlistService.setCurrentPlaylist(playlist.id);
         await this.loadCurrentPlaylist();
         this.updateStorageInfo();
      } catch (error) {
         slice.logger.logError('SoundboardApp', 'Failed to change playlist', error);
         this.showError('Failed to change playlist');
      }
   }

   async onFilesUploaded(result) {
      try {
         // Reload audio files if upload was to current playlist
         if (result.successful.length > 0) {
            await this.loadCurrentPlaylist();
            this.updateStorageInfo();
            
            // Show success message
            this.showSuccess(`Added ${result.successful.length} audio file(s) successfully!`);
         }

         // Show errors if any
         if (result.errors.length > 0) {
            const errorMessage = `Failed to upload ${result.errors.length} file(s):\n` + 
               result.errors.map(e => `- ${e.fileName}: ${e.error}`).join('\n');
            this.showError(errorMessage);
         }
      } catch (error) {
         slice.logger.logError('SoundboardApp', 'Failed to handle uploaded files', error);
         this.showError('Failed to process uploaded files');
      }
   }

   async onPlaylistUpdated() {
      try {
         // Refresh playlist selector
         const newSelector = await slice.build('PlaylistSelector', {
            playlistService: this.playlistService,
            onPlaylistChange: (playlist) => this.onPlaylistChange(playlist)
         });

         this.$playlistSelector.innerHTML = '';
         this.$playlistSelector.appendChild(newSelector);

         // Reload current playlist data
         await this.loadCurrentPlaylist();
         this.updateStorageInfo();
      } catch (error) {
         slice.logger.logError('SoundboardApp', 'Failed to handle playlist update', error);
      }
   }

   async onDeleteAudio(audioId) {
      try {
         await this.playlistService.deleteAudioFile(audioId, this.currentPlaylist.id);
         await this.loadCurrentPlaylist();
         this.updateStorageInfo();
         this.showSuccess('Audio file deleted successfully');
      } catch (error) {
         slice.logger.logError('SoundboardApp', 'Failed to delete audio', error);
         this.showError('Failed to delete audio file');
      }
   }

   onAudioPlay(audioId, audioElement) {
      // Stop other playing audios if needed (optional)
      // this.stopAllOtherAudios(audioId);
      
      this.playingAudios.set(audioId, audioElement);
   }

   onAudioStop(audioId) {
      this.playingAudios.delete(audioId);
   }

   stopAllOtherAudios(exceptAudioId) {
      for (const [audioId, audioElement] of this.playingAudios) {
         if (audioId !== exceptAudioId) {
            audioElement.pause();
            audioElement.currentTime = 0;
            this.playingAudios.delete(audioId);
         }
      }
   }

   async createFooter() {
      await this.updateStorageInfo();
   }

   async updateStorageInfo() {
      try {
         const storageInfo = await this.playlistService.getStorageInfo();
         
         this.$footer.innerHTML = `
            <div class="storage-stats">
               <span class="stat-item">
                  <strong>${storageInfo.totalPlaylists}</strong> playlists
               </span>
               <span class="stat-item">
                  <strong>${storageInfo.totalAudioFiles}</strong> audio files
               </span>
               <span class="stat-item">
                  <strong>${storageInfo.formattedSize}</strong> total size
               </span>
            </div>
            <div class="app-info">
               <span>Powered by Slice.js Framework</span>
            </div>
         `;
      } catch (error) {
         slice.logger.logError('SoundboardApp', 'Failed to update storage info', error);
      }
   }

   setupEventListeners() {
      // Handle keyboard shortcuts
      document.addEventListener('keydown', (event) => {
         // Space bar to stop all audio
         if (event.code === 'Space' && event.target === document.body) {
            event.preventDefault();
            this.stopAllAudio();
         }

         // Escape to stop all audio
         if (event.code === 'Escape') {
            this.stopAllAudio();
         }
      });

      // Handle visibility change (pause audio when tab is hidden)
      document.addEventListener('visibilitychange', () => {
         if (document.hidden) {
            this.pauseAllAudio();
         }
      });
   }

   stopAllAudio() {
      for (const [audioId, audioElement] of this.playingAudios) {
         audioElement.pause();
         audioElement.currentTime = 0;
      }
      this.playingAudios.clear();
      this.showInfo('All audio stopped');
   }

   pauseAllAudio() {
      for (const [audioId, audioElement] of this.playingAudios) {
         audioElement.pause();
      }
   }

   showError(message) {
      this.showNotification(message, 'error');
   }

   showSuccess(message) {
      this.showNotification(message, 'success');
   }

   showInfo(message) {
      this.showNotification(message, 'info');
   }

   showNotification(message, type = 'info') {
      // Create notification element
      const notification = document.createElement('div');
      notification.classList.add('notification', `notification-${type}`);
      notification.textContent = message;

      // Add to page
      document.body.appendChild(notification);

      // Auto remove after 5 seconds
      setTimeout(() => {
         if (notification.parentElement) {
            notification.remove();
         }
      }, 5000);

      // Add click to dismiss
      notification.addEventListener('click', () => {
         notification.remove();
      });
   }
}

customElements.define('slice-soundboard-app', SoundboardApp);
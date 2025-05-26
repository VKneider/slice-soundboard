export default class PlaylistSelector extends HTMLElement {
   constructor(props) {
      super();
      slice.attachTemplate(this);
      
      this.$container = this.querySelector('.playlist-selector-container');
      this.$select = this.querySelector('.playlist-select');
      this.$label = this.querySelector('.playlist-label');
      this.$refreshBtn = this.querySelector('.refresh-btn');
      this.$createBtn = this.querySelector('.create-playlist-btn');
      
      slice.controller.setComponentProps(this, props);
      this.debuggerProps = ['playlistService', 'onPlaylistChange'];
      
      // Component state
      this.playlists = [];
      this.currentPlaylist = null;
   }

   async init() {
      try {
         if (!this.playlistService) {
            throw new Error('PlaylistService is required');
         }

         // Load playlists
         await this.loadPlaylists();
         
         // Setup event listeners
         this.setupEventListeners();
         
         slice.logger.logInfo('PlaylistSelector', 'Playlist selector initialized');
      } catch (error) {
         slice.logger.logError('PlaylistSelector', 'Failed to initialize', error);
      }
   }

   get playlistService() {
      return this._playlistService;
   }

   set playlistService(value) {
      this._playlistService = value;
   }

   get onPlaylistChange() {
      return this._onPlaylistChange;
   }

   set onPlaylistChange(value) {
      this._onPlaylistChange = value;
   }

   async loadPlaylists() {
      try {
         this.playlists = await this.playlistService.getAllPlaylists();
         this.currentPlaylist = this.playlistService.getCurrentPlaylist();
         
         this.updatePlaylistOptions();
         this.updateLabel();
         
      } catch (error) {
         slice.logger.logError('PlaylistSelector', 'Failed to load playlists', error);
         this.showError('Failed to load playlists');
      }
   }

   updatePlaylistOptions() {
      // Clear existing options
      this.$select.innerHTML = '';

      if (this.playlists.length === 0) {
         const option = document.createElement('option');
         option.value = '';
         option.textContent = 'No playlists available';
         option.disabled = true;
         this.$select.appendChild(option);
         return;
      }

      // Add playlist options
      this.playlists.forEach(playlist => {
         const option = document.createElement('option');
         option.value = playlist.id;
         option.textContent = `${playlist.name} (${playlist.audioCount || 0} files)`;
         
         if (this.currentPlaylist && playlist.id === this.currentPlaylist.id) {
            option.selected = true;
         }
         
         this.$select.appendChild(option);
      });
   }

   updateLabel() {
      if (this.currentPlaylist) {
         this.$label.textContent = `Current: ${this.currentPlaylist.name}`;
         this.$label.classList.add('has-selection');
      } else {
         this.$label.textContent = 'Select a playlist';
         this.$label.classList.remove('has-selection');
      }
   }

   setupEventListeners() {
      // Playlist selection change
      this.$select.addEventListener('change', (e) => {
         this.handlePlaylistChange(e.target.value);
      });

      // Refresh button
      this.$refreshBtn.addEventListener('click', () => {
         this.refreshPlaylists();
      });

      // Create playlist button
      this.$createBtn.addEventListener('click', () => {
         this.createQuickPlaylist();
      });
   }

   async handlePlaylistChange(playlistId) {
      if (!playlistId) return;

      try {
         const selectedPlaylist = this.playlists.find(p => p.id == playlistId);
         if (!selectedPlaylist) {
            throw new Error('Selected playlist not found');
         }

         this.currentPlaylist = selectedPlaylist;
         this.updateLabel();

         // Notify parent component
         if (this.onPlaylistChange) {
            this.onPlaylistChange(selectedPlaylist);
         }

         slice.logger.logInfo('PlaylistSelector', `Switched to playlist: ${selectedPlaylist.name}`);
      } catch (error) {
         slice.logger.logError('PlaylistSelector', 'Failed to change playlist', error);
         this.showError('Failed to change playlist');
      }
   }

   async refreshPlaylists() {
      try {
         this.$refreshBtn.disabled = true;
         this.$refreshBtn.textContent = '🔄';
         
         await this.loadPlaylists();
         
         this.showSuccess('Playlists refreshed');
      } catch (error) {
         this.showError('Failed to refresh playlists');
      } finally {
         this.$refreshBtn.disabled = false;
         this.$refreshBtn.textContent = '🔄';
      }
   }

   async createQuickPlaylist() {
      const name = prompt('Enter playlist name:');
      if (!name || name.trim().length === 0) {
         return;
      }

      try {
         this.$createBtn.disabled = true;
         
         const newPlaylist = await this.playlistService.createPlaylist(name.trim());
         await this.loadPlaylists();
         
         // Select the new playlist
         this.$select.value = newPlaylist.id;
         await this.handlePlaylistChange(newPlaylist.id);
         
         this.showSuccess(`Playlist "${name}" created successfully`);
      } catch (error) {
         slice.logger.logError('PlaylistSelector', 'Failed to create playlist', error);
         this.showError(`Failed to create playlist: ${error.message}`);
      } finally {
         this.$createBtn.disabled = false;
      }
   }

   // Public method to refresh from parent
   async refresh() {
      await this.loadPlaylists();
   }

   // Public method to set current playlist
   async setCurrentPlaylist(playlistId) {
      this.$select.value = playlistId;
      await this.handlePlaylistChange(playlistId);
   }

   showError(message) {
      this.$container.classList.add('error');
      setTimeout(() => {
         this.$container.classList.remove('error');
      }, 3000);
      
      // You could also trigger a toast notification here
      console.error('PlaylistSelector:', message);
   }

   showSuccess(message) {
      this.$container.classList.add('success');
      setTimeout(() => {
         this.$container.classList.remove('success');
      }, 2000);
      
      console.log('PlaylistSelector:', message);
   }
}

customElements.define('slice-playlist-selector', PlaylistSelector);
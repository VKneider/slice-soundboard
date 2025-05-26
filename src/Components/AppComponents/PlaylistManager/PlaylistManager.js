export default class PlaylistManager extends HTMLElement {
   constructor(props) {
      super();
      slice.attachTemplate(this);
      
      this.$container = this.querySelector('.playlist-manager-container');
      this.$toggleBtn = this.querySelector('.toggle-manager-btn');
      this.$managerContent = this.querySelector('.manager-content');
      this.$playlistsList = this.querySelector('.playlists-list');
      this.$createForm = this.querySelector('.create-form');
      this.$nameInput = this.querySelector('.playlist-name-input');
      this.$descriptionInput = this.querySelector('.playlist-description-input');
      this.$createBtn = this.querySelector('.create-btn');
      this.$cancelBtn = this.querySelector('.cancel-btn');
      this.$importBtn = this.querySelector('.import-btn');
      this.$exportAllBtn = this.querySelector('.export-all-btn');
      this.$clearAllBtn = this.querySelector('.clear-all-btn');
      this.$fileInput = this.querySelector('.import-file-input');
      
      slice.controller.setComponentProps(this, props);
      this.debuggerProps = ['playlistService', 'onPlaylistUpdated'];
      
      // Component state
      this.isExpanded = false;
      this.isCreating = false;
      this.playlists = [];
      this.editingPlaylist = null;
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
         
         slice.logger.logInfo('PlaylistManager', 'Playlist manager initialized');
      } catch (error) {
         slice.logger.logError('PlaylistManager', 'Failed to initialize', error);
      }
   }

   get playlistService() {
      return this._playlistService;
   }

   set playlistService(value) {
      this._playlistService = value;
   }

   get onPlaylistUpdated() {
      return this._onPlaylistUpdated;
   }

   set onPlaylistUpdated(value) {
      this._onPlaylistUpdated = value;
   }

   async loadPlaylists() {
      try {
         this.playlists = await this.playlistService.getAllPlaylists();
         this.renderPlaylistsList();
      } catch (error) {
         slice.logger.logError('PlaylistManager', 'Failed to load playlists', error);
         this.showError('Failed to load playlists');
      }
   }

   renderPlaylistsList() {
      this.$playlistsList.innerHTML = '';

      if (this.playlists.length === 0) {
         this.$playlistsList.innerHTML = `
            <div class="empty-playlists">
               <p>No playlists found. Create your first playlist!</p>
            </div>
         `;
         return;
      }

      this.playlists.forEach(playlist => {
         const playlistItem = this.createPlaylistItem(playlist);
         this.$playlistsList.appendChild(playlistItem);
      });
   }

   createPlaylistItem(playlist) {
      const item = document.createElement('div');
      item.classList.add('playlist-item');
      item.dataset.playlistId = playlist.id;

      const currentPlaylist = this.playlistService.getCurrentPlaylist();
      const isActive = currentPlaylist && currentPlaylist.id === playlist.id;

      item.innerHTML = `
         <div class="playlist-info ${isActive ? 'active' : ''}">
            <div class="playlist-details">
               <h4 class="playlist-name">${playlist.name}</h4>
               <p class="playlist-description">${playlist.description || 'No description'}</p>
               <div class="playlist-meta">
                  <span class="audio-count">${playlist.audioCount || 0} files</span>
                  <span class="created-date">Created: ${new Date(playlist.createdAt).toLocaleDateString()}</span>
               </div>
            </div>
            ${isActive ? '<div class="active-indicator">🎵 Active</div>' : ''}
         </div>
         <div class="playlist-actions">
            <button class="edit-btn" title="Edit Playlist">✏️</button>
            <button class="export-btn" title="Export Playlist">📤</button>
            <button class="delete-btn" title="Delete Playlist" ${this.playlists.length <= 1 ? 'disabled' : ''}>🗑️</button>
         </div>
      `;

      // Add event listeners to action buttons
      const editBtn = item.querySelector('.edit-btn');
      const exportBtn = item.querySelector('.export-btn');
      const deleteBtn = item.querySelector('.delete-btn');

      editBtn.addEventListener('click', () => this.editPlaylist(playlist));
      exportBtn.addEventListener('click', () => this.exportPlaylist(playlist));
      deleteBtn.addEventListener('click', () => this.deletePlaylist(playlist));

      return item;
   }

   setupEventListeners() {
      // Toggle manager visibility
      this.$toggleBtn.addEventListener('click', () => {
         this.toggleManager();
      });

      // Create form
      this.$createBtn.addEventListener('click', () => {
         this.handleCreatePlaylist();
      });

      this.$cancelBtn.addEventListener('click', () => {
         this.cancelCreate();
      });

      // Import/Export buttons
      this.$importBtn.addEventListener('click', () => {
         this.$fileInput.click();
      });

      this.$exportAllBtn.addEventListener('click', () => {
         this.exportAllPlaylists();
      });

      this.$clearAllBtn.addEventListener('click', () => {
         this.clearAllData();
      });

      // File import
      this.$fileInput.addEventListener('change', (e) => {
         this.handleFileImport(e.target.files[0]);
      });

      // Form inputs
      this.$nameInput.addEventListener('input', () => {
         this.validateForm();
      });

      // Enter key in form
      this.$createForm.addEventListener('keydown', (e) => {
         if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleCreatePlaylist();
         }
      });
   }

   toggleManager() {
      this.isExpanded = !this.isExpanded;
      
      if (this.isExpanded) {
         this.$managerContent.classList.add('expanded');
         this.$toggleBtn.textContent = '▲ Hide Playlist Manager';
         this.loadPlaylists(); // Refresh when opening
      } else {
         this.$managerContent.classList.remove('expanded');
         this.$toggleBtn.textContent = '▼ Show Playlist Manager';
         this.cancelCreate(); // Cancel any ongoing creation
      }
   }

   async handleCreatePlaylist() {
      if (!this.validateForm()) return;

      const name = this.$nameInput.value.trim();
      const description = this.$descriptionInput.value.trim();

      try {
         this.$createBtn.disabled = true;
         this.$createBtn.textContent = 'Creating...';

         if (this.editingPlaylist) {
            // Update existing playlist
            await this.playlistService.updatePlaylistInfo(this.editingPlaylist.id, {
               name,
               description
            });
            this.showSuccess(`Playlist "${name}" updated successfully`);
         } else {
            // Create new playlist
            await this.playlistService.createPlaylist(name, description);
            this.showSuccess(`Playlist "${name}" created successfully`);
         }

         await this.loadPlaylists();
         this.cancelCreate();
         
         // Notify parent component
         if (this.onPlaylistUpdated) {
            this.onPlaylistUpdated();
         }

      } catch (error) {
         slice.logger.logError('PlaylistManager', 'Failed to save playlist', error);
         this.showError(`Failed to save playlist: ${error.message}`);
      } finally {
         this.$createBtn.disabled = false;
         this.$createBtn.textContent = this.editingPlaylist ? 'Update Playlist' : 'Create Playlist';
      }
   }

   editPlaylist(playlist) {
      this.editingPlaylist = playlist;
      this.isCreating = true;
      
      // Fill form with existing data
      this.$nameInput.value = playlist.name;
      this.$descriptionInput.value = playlist.description || '';
      
      // Update UI
      this.$createForm.classList.add('editing');
      this.$createBtn.textContent = 'Update Playlist';
      this.querySelector('.form-title').textContent = 'Edit Playlist';
      
      // Focus name input
      this.$nameInput.focus();
      this.validateForm();
   }

   cancelCreate() {
      this.isCreating = false;
      this.editingPlaylist = null;
      
      // Clear form
      this.$nameInput.value = '';
      this.$descriptionInput.value = '';
      
      // Reset UI
      this.$createForm.classList.remove('editing');
      this.$createBtn.textContent = 'Create Playlist';
      this.querySelector('.form-title').textContent = 'Create New Playlist';
      
      this.validateForm();
   }

   validateForm() {
      const name = this.$nameInput.value.trim();
      const isValid = name.length > 0 && name.length <= 50;
      
      this.$createBtn.disabled = !isValid;
      
      if (name.length > 50) {
         this.$nameInput.classList.add('error');
      } else {
         this.$nameInput.classList.remove('error');
      }
      
      return isValid;
   }

   async deletePlaylist(playlist) {
      if (this.playlists.length <= 1) {
         this.showError('Cannot delete the last playlist');
         return;
      }

      const confirmed = confirm(
         `Are you sure you want to delete "${playlist.name}"?\n\nThis will permanently delete all audio files in this playlist.`
      );

      if (!confirmed) return;

      try {
         await this.playlistService.deletePlaylist(playlist.id);
         await this.loadPlaylists();
         
         this.showSuccess(`Playlist "${playlist.name}" deleted successfully`);
         
         // Notify parent component
         if (this.onPlaylistUpdated) {
            this.onPlaylistUpdated();
         }

      } catch (error) {
         slice.logger.logError('PlaylistManager', 'Failed to delete playlist', error);
         this.showError(`Failed to delete playlist: ${error.message}`);
      }
   }

   async exportPlaylist(playlist) {
      try {
         await this.playlistService.exportPlaylist(playlist.id);
         this.showSuccess(`Playlist "${playlist.name}" exported successfully`);
      } catch (error) {
         slice.logger.logError('PlaylistManager', 'Failed to export playlist', error);
         this.showError(`Failed to export playlist: ${error.message}`);
      }
   }

   async exportAllPlaylists() {
      if (this.playlists.length === 0) {
         this.showError('No playlists to export');
         return;
      }

      const confirmed = confirm(`Export all ${this.playlists.length} playlists?`);
      if (!confirmed) return;

      try {
         for (const playlist of this.playlists) {
            await this.playlistService.exportPlaylist(playlist.id);
         }
         this.showSuccess(`All ${this.playlists.length} playlists exported successfully`);
      } catch (error) {
         slice.logger.logError('PlaylistManager', 'Failed to export all playlists', error);
         this.showError(`Failed to export playlists: ${error.message}`);
      }
   }

   async handleFileImport(file) {
      if (!file) return;

      if (!file.name.endsWith('.json')) {
         this.showError('Please select a valid JSON playlist file');
         return;
      }

      try {
         const result = await this.playlistService.importPlaylist(file);
         
         await this.loadPlaylists();
         
         const message = `Playlist "${result.playlist.name}" imported successfully!\n` +
                        `${result.importedAudios.length} audio files imported.`;
         
         if (result.errors.length > 0) {
            const errorMessage = message + `\n\n${result.errors.length} files failed to import.`;
            this.showWarning(errorMessage);
         } else {
            this.showSuccess(message);
         }
         
         // Notify parent component
         if (this.onPlaylistUpdated) {
            this.onPlaylistUpdated();
         }

      } catch (error) {
         slice.logger.logError('PlaylistManager', 'Failed to import playlist', error);
         this.showError(`Failed to import playlist: ${error.message}`);
      } finally {
         // Clear file input
         this.$fileInput.value = '';
      }
   }

   async clearAllData() {
      const confirmed = confirm(
         'Are you sure you want to clear ALL data?\n\n' +
         'This will permanently delete ALL playlists and audio files.\n' +
         'This action cannot be undone!'
      );

      if (!confirmed) return;

      const doubleConfirmed = confirm(
         'This is your final warning!\n\n' +
         'ALL your soundboard data will be permanently deleted.\n' +
         'Are you absolutely sure?'
      );

      if (!doubleConfirmed) return;

      try {
         await this.playlistService.clearAllData();
         await this.loadPlaylists();
         
         this.showSuccess('All data cleared. A new default playlist has been created.');
         
         // Notify parent component
         if (this.onPlaylistUpdated) {
            this.onPlaylistUpdated();
         }

      } catch (error) {
         slice.logger.logError('PlaylistManager', 'Failed to clear data', error);
         this.showError(`Failed to clear data: ${error.message}`);
      }
   }

   showError(message) {
      this.showNotification(message, 'error');
   }

   showSuccess(message) {
      this.showNotification(message, 'success');
   }

   showWarning(message) {
      this.showNotification(message, 'warning');
   }

   showNotification(message, type) {
      // This could be enhanced to show actual toast notifications
      // For now, we'll use console and alert
      console.log(`PlaylistManager ${type}:`, message);
      
      if (type === 'error') {
         alert(`Error: ${message}`);
      } else if (type === 'warning') {
         alert(`Warning: ${message}`);
      }
   }
}

customElements.define('slice-playlist-manager', PlaylistManager);
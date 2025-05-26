export default class PlaylistService {
   constructor() {
      this.storageManager = null;
      this.audioConverter = null;
      this.currentPlaylist = null;
      this.initialized = false;
   }

   async init() {
      if (this.initialized) return;

      try {
         // Initialize storage manager
         this.storageManager = await slice.build('AudioStorageManager');
         await this.storageManager.init();

         // Initialize audio converter
         this.audioConverter = await slice.build('AudioConverter');

         // Create default playlist if none exist
         await this.ensureDefaultPlaylist();

         this.initialized = true;
         slice.logger.logInfo('PlaylistService', 'Service initialized successfully');
      } catch (error) {
         slice.logger.logError('PlaylistService', 'Failed to initialize service', error);
         throw error;
      }
   }

   async ensureDefaultPlaylist() {
      const playlists = await this.storageManager.getAllPlaylists();
      
      if (playlists.length === 0) {
         const defaultPlaylist = await this.storageManager.createPlaylist(
            'Default Playlist',
            'Your default soundboard playlist'
         );
         this.currentPlaylist = defaultPlaylist;
         slice.logger.logInfo('PlaylistService', 'Default playlist created');
      } else {
         this.currentPlaylist = playlists[0];
      }
   }

   async createPlaylist(name, description = '') {
      if (!this.initialized) await this.init();

      try {
         // Validate input
         if (!name || name.trim().length === 0) {
            throw new Error('Playlist name is required');
         }

         if (name.length > 50) {
            throw new Error('Playlist name must be 50 characters or less');
         }

         // Check for duplicate names
         const existingPlaylists = await this.storageManager.getAllPlaylists();
         const duplicateName = existingPlaylists.find(p => 
            p.name.toLowerCase() === name.trim().toLowerCase()
         );

         if (duplicateName) {
            throw new Error('A playlist with this name already exists');
         }

         const playlist = await this.storageManager.createPlaylist(name.trim(), description.trim());
         slice.logger.logInfo('PlaylistService', `Created playlist: ${name}`);
         return playlist;
      } catch (error) {
         slice.logger.logError('PlaylistService', 'Failed to create playlist', error);
         throw error;
      }
   }

   async getAllPlaylists() {
      if (!this.initialized) await this.init();
      return await this.storageManager.getAllPlaylists();
   }

   async getPlaylistById(playlistId) {
      if (!this.initialized) await this.init();
      
      const playlists = await this.storageManager.getAllPlaylists();
      return playlists.find(p => p.id === playlistId);
   }

   async deletePlaylist(playlistId) {
      if (!this.initialized) await this.init();

      try {
         // Prevent deletion of the last playlist
         const allPlaylists = await this.storageManager.getAllPlaylists();
         if (allPlaylists.length <= 1) {
            throw new Error('Cannot delete the last playlist');
         }

         await this.storageManager.deletePlaylist(playlistId);

         // If current playlist was deleted, switch to another one
         if (this.currentPlaylist && this.currentPlaylist.id === playlistId) {
            const remainingPlaylists = await this.storageManager.getAllPlaylists();
            this.currentPlaylist = remainingPlaylists[0] || null;
         }

         slice.logger.logInfo('PlaylistService', `Deleted playlist: ${playlistId}`);
      } catch (error) {
         slice.logger.logError('PlaylistService', 'Failed to delete playlist', error);
         throw error;
      }
   }

   async setCurrentPlaylist(playlistId) {
      if (!this.initialized) await this.init();

      const playlist = await this.getPlaylistById(playlistId);
      if (!playlist) {
         throw new Error('Playlist not found');
      }

      this.currentPlaylist = playlist;
      slice.logger.logInfo('PlaylistService', `Set current playlist to: ${playlist.name}`);
      return playlist;
   }

   getCurrentPlaylist() {
      return this.currentPlaylist;
   }

   async addAudioFiles(playlistId, files, progressCallback = null) {
      if (!this.initialized) await this.init();

      try {
         const playlist = await this.getPlaylistById(playlistId);
         if (!playlist) {
            throw new Error('Playlist not found');
         }

         // Convert files to base64
         const conversionResult = await this.audioConverter.filesToBase64(files, progressCallback);

         // Save successfully converted files
         const savedFiles = [];
         for (const audioData of conversionResult.successful) {
            try {
               const savedAudio = await this.storageManager.saveAudioFile(playlistId, audioData);
               savedFiles.push(savedAudio);
            } catch (error) {
               conversionResult.errors.push({
                  fileName: audioData.name,
                  error: `Failed to save: ${error.message}`
               });
            }
         }

         slice.logger.logInfo('PlaylistService', 
            `Added ${savedFiles.length} audio files to playlist ${playlist.name}`
         );

         return {
            successful: savedFiles,
            errors: conversionResult.errors,
            totalProcessed: conversionResult.totalProcessed
         };
      } catch (error) {
         slice.logger.logError('PlaylistService', 'Failed to add audio files', error);
         throw error;
      }
   }

   async getPlaylistAudios(playlistId) {
      if (!this.initialized) await this.init();
      return await this.storageManager.getAudiosByPlaylistId(playlistId);
   }

   async deleteAudioFile(audioId, playlistId) {
      if (!this.initialized) await this.init();
      
      try {
         await this.storageManager.deleteAudioFile(audioId, playlistId);
         slice.logger.logInfo('PlaylistService', `Deleted audio file: ${audioId}`);
      } catch (error) {
         slice.logger.logError('PlaylistService', 'Failed to delete audio file', error);
         throw error;
      }
   }

   async exportPlaylist(playlistId) {
      if (!this.initialized) await this.init();

      try {
         const playlist = await this.getPlaylistById(playlistId);
         if (!playlist) {
            throw new Error('Playlist not found');
         }

         const audioFiles = await this.storageManager.getAudiosByPlaylistId(playlistId);

         const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            playlist: {
               name: playlist.name,
               description: playlist.description,
               originalId: playlist.id,
               audioCount: audioFiles.length
            },
            audioFiles: audioFiles.map(audio => ({
               name: audio.name,
               base64Data: audio.base64Data,
               type: audio.type,
               duration: audio.duration,
               size: audio.size,
               originalName: audio.originalName || audio.name
            }))
         };

         const jsonString = JSON.stringify(exportData, null, 2);
         const blob = new Blob([jsonString], { type: 'application/json' });
         
         // Create download link
         const url = URL.createObjectURL(blob);
         const link = document.createElement('a');
         link.href = url;
         link.download = `${playlist.name.replace(/[^a-z0-9]/gi, '_')}_soundboard.json`;
         link.click();
         
         // Cleanup
         URL.revokeObjectURL(url);

         slice.logger.logInfo('PlaylistService', `Exported playlist: ${playlist.name}`);
         return exportData;
      } catch (error) {
         slice.logger.logError('PlaylistService', 'Failed to export playlist', error);
         throw error;
      }
   }

   async importPlaylist(file) {
      if (!this.initialized) await this.init();

      return new Promise((resolve, reject) => {
         const reader = new FileReader();

         reader.onload = async (event) => {
            try {
               const jsonData = JSON.parse(event.target.result);
               
               // Validate import data structure
               if (!this.validateImportData(jsonData)) {
                  throw new Error('Invalid playlist file format');
               }

               // Create new playlist
               let playlistName = jsonData.playlist.name;
               
               // Ensure unique name
               const existingPlaylists = await this.storageManager.getAllPlaylists();
               let counter = 1;
               let originalName = playlistName;
               
               while (existingPlaylists.find(p => p.name.toLowerCase() === playlistName.toLowerCase())) {
                  playlistName = `${originalName} (${counter})`;
                  counter++;
               }

               const newPlaylist = await this.storageManager.createPlaylist(
                  playlistName,
                  jsonData.playlist.description || 'Imported playlist'
               );

               // Import audio files
               const importedAudios = [];
               const importErrors = [];

               for (const audioData of jsonData.audioFiles) {
                  try {
                     // Validate audio data
                     if (!audioData.base64Data || !audioData.name) {
                        throw new Error('Invalid audio data');
                     }

                     const savedAudio = await this.storageManager.saveAudioFile(newPlaylist.id, audioData);
                     importedAudios.push(savedAudio);
                  } catch (error) {
                     importErrors.push({
                        fileName: audioData.name || 'Unknown',
                        error: error.message
                     });
                  }
               }

               const result = {
                  playlist: newPlaylist,
                  importedAudios: importedAudios,
                  errors: importErrors,
                  totalProcessed: jsonData.audioFiles.length
               };

               slice.logger.logInfo('PlaylistService', 
                  `Imported playlist: ${playlistName} with ${importedAudios.length} audio files`
               );

               resolve(result);
            } catch (error) {
               slice.logger.logError('PlaylistService', 'Failed to import playlist', error);
               reject(new Error(`Import failed: ${error.message}`));
            }
         };

         reader.onerror = () => {
            reject(new Error('Failed to read file'));
         };

         reader.readAsText(file);
      });
   }

   validateImportData(data) {
      try {
         // Check required structure
         if (!data || typeof data !== 'object') return false;
         if (!data.playlist || typeof data.playlist !== 'object') return false;
         if (!data.audioFiles || !Array.isArray(data.audioFiles)) return false;
         if (!data.playlist.name || typeof data.playlist.name !== 'string') return false;

         // Validate audio files structure
         for (const audio of data.audioFiles) {
            if (!audio.name || !audio.base64Data) return false;
            if (typeof audio.name !== 'string') return false;
            if (typeof audio.base64Data !== 'string') return false;
         }

         return true;
      } catch (error) {
         return false;
      }
   }

   async updatePlaylistInfo(playlistId, updates) {
      if (!this.initialized) await this.init();

      try {
         // Validate updates
         if (updates.name) {
            updates.name = updates.name.trim();
            if (updates.name.length === 0) {
               throw new Error('Playlist name cannot be empty');
            }
            if (updates.name.length > 50) {
               throw new Error('Playlist name must be 50 characters or less');
            }

            // Check for duplicate names (excluding current playlist)
            const existingPlaylists = await this.storageManager.getAllPlaylists();
            const duplicateName = existingPlaylists.find(p => 
               p.id !== playlistId && p.name.toLowerCase() === updates.name.toLowerCase()
            );

            if (duplicateName) {
               throw new Error('A playlist with this name already exists');
            }
         }

         if (updates.description) {
            updates.description = updates.description.trim();
         }

         const updatedPlaylist = await this.storageManager.updatePlaylist(playlistId, updates);
         
         // Update current playlist if it's the one being updated
         if (this.currentPlaylist && this.currentPlaylist.id === playlistId) {
            this.currentPlaylist = updatedPlaylist;
         }

         slice.logger.logInfo('PlaylistService', `Updated playlist: ${updatedPlaylist.name}`);
         return updatedPlaylist;
      } catch (error) {
         slice.logger.logError('PlaylistService', 'Failed to update playlist', error);
         throw error;
      }
   }

   async getStorageInfo() {
      if (!this.initialized) await this.init();
      return await this.storageManager.getStorageInfo();
   }

   async clearAllData() {
      if (!this.initialized) await this.init();

      try {
         await this.storageManager.clearAllData();
         
         // Recreate default playlist
         await this.ensureDefaultPlaylist();
         
         slice.logger.logInfo('PlaylistService', 'All data cleared and default playlist recreated');
      } catch (error) {
         slice.logger.logError('PlaylistService', 'Failed to clear data', error);
         throw error;
      }
   }
}
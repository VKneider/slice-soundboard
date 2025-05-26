export default class AudioStorageManager {
   constructor() {
      this.databaseName = 'SoundboardDB';
      this.storeName = 'playlists';
      this.db = null;
      this.audioStoreName = 'audioFiles';
   }

   async init() {
      return new Promise((resolve, reject) => {
         const request = indexedDB.open(this.databaseName, 2);

         request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create playlists store
            if (!db.objectStoreNames.contains(this.storeName)) {
               const playlistStore = db.createObjectStore(this.storeName, {
                  keyPath: 'id',
                  autoIncrement: true,
               });
               playlistStore.createIndex('name', 'name', { unique: false });
               playlistStore.createIndex('createdAt', 'createdAt', { unique: false });
            }

            // Create audio files store
            if (!db.objectStoreNames.contains(this.audioStoreName)) {
               const audioStore = db.createObjectStore(this.audioStoreName, {
                  keyPath: 'id',
                  autoIncrement: true,
               });
               audioStore.createIndex('playlistId', 'playlistId', { unique: false });
               audioStore.createIndex('name', 'name', { unique: false });
            }
         };

         request.onsuccess = (event) => {
            this.db = event.target.result;
            slice.logger.logInfo('AudioStorageManager', 'Database initialized successfully');
            resolve(this.db);
         };

         request.onerror = (event) => {
            slice.logger.logError('AudioStorageManager', 'Error opening IndexedDB', event.target.error);
            reject(new Error(`Error opening IndexedDB: ${event.target.error}`));
         };
      });
   }

   async createPlaylist(name, description = '') {
      if (!this.db) await this.init();
      
      const playlist = {
         name: name,
         description: description,
         createdAt: new Date().toISOString(),
         updatedAt: new Date().toISOString(),
         audioCount: 0
      };

      return new Promise((resolve, reject) => {
         const transaction = this.db.transaction([this.storeName], 'readwrite');
         const store = transaction.objectStore(this.storeName);
         const request = store.add(playlist);

         request.onsuccess = () => {
            playlist.id = request.result;
            slice.logger.logInfo('AudioStorageManager', `Playlist "${name}" created successfully`);
            resolve(playlist);
         };

         request.onerror = (event) => {
            slice.logger.logError('AudioStorageManager', 'Error creating playlist', event.target.error);
            reject(new Error(`Error creating playlist: ${event.target.error}`));
         };
      });
   }

   async getAllPlaylists() {
      if (!this.db) await this.init();

      return new Promise((resolve, reject) => {
         const transaction = this.db.transaction([this.storeName], 'readonly');
         const store = transaction.objectStore(this.storeName);
         const request = store.getAll();

         request.onsuccess = () => {
            resolve(request.result);
         };

         request.onerror = (event) => {
            reject(new Error(`Error getting playlists: ${event.target.error}`));
         };
      });
   }

   async deletePlaylist(playlistId) {
      if (!this.db) await this.init();

      // First delete all audio files in the playlist
      await this.deleteAudiosByPlaylistId(playlistId);

      return new Promise((resolve, reject) => {
         const transaction = this.db.transaction([this.storeName], 'readwrite');
         const store = transaction.objectStore(this.storeName);
         const request = store.delete(playlistId);

         request.onsuccess = () => {
            slice.logger.logInfo('AudioStorageManager', `Playlist ${playlistId} deleted successfully`);
            resolve();
         };

         request.onerror = (event) => {
            reject(new Error(`Error deleting playlist: ${event.target.error}`));
         };
      });
   }

   async saveAudioFile(playlistId, audioData) {
      if (!this.db) await this.init();

      const audioFile = {
         playlistId: playlistId,
         name: audioData.name,
         base64Data: audioData.base64Data,
         duration: audioData.duration || 0,
         size: audioData.size || 0,
         type: audioData.type || 'audio/mp3',
         createdAt: new Date().toISOString()
      };

      return new Promise((resolve, reject) => {
         const transaction = this.db.transaction([this.audioStoreName, this.storeName], 'readwrite');
         const audioStore = transaction.objectStore(this.audioStoreName);
         const playlistStore = transaction.objectStore(this.storeName);
         
         const audioRequest = audioStore.add(audioFile);

         audioRequest.onsuccess = () => {
            audioFile.id = audioRequest.result;
            
            // Update playlist audio count
            const getPlaylistRequest = playlistStore.get(playlistId);
            getPlaylistRequest.onsuccess = () => {
               const playlist = getPlaylistRequest.result;
               if (playlist) {
                  playlist.audioCount = (playlist.audioCount || 0) + 1;
                  playlist.updatedAt = new Date().toISOString();
                  playlistStore.put(playlist);
               }
            };

            slice.logger.logInfo('AudioStorageManager', `Audio file "${audioData.name}" saved successfully`);
            resolve(audioFile);
         };

         audioRequest.onerror = (event) => {
            reject(new Error(`Error saving audio file: ${event.target.error}`));
         };
      });
   }

   async getAudiosByPlaylistId(playlistId) {
      if (!this.db) await this.init();

      return new Promise((resolve, reject) => {
         const transaction = this.db.transaction([this.audioStoreName], 'readonly');
         const store = transaction.objectStore(this.audioStoreName);
         const index = store.index('playlistId');
         const request = index.getAll(playlistId);

         request.onsuccess = () => {
            resolve(request.result);
         };

         request.onerror = (event) => {
            reject(new Error(`Error getting audio files: ${event.target.error}`));
         };
      });
   }

   async deleteAudioFile(audioId, playlistId) {
      if (!this.db) await this.init();

      return new Promise((resolve, reject) => {
         const transaction = this.db.transaction([this.audioStoreName, this.storeName], 'readwrite');
         const audioStore = transaction.objectStore(this.audioStoreName);
         const playlistStore = transaction.objectStore(this.storeName);
         
         const deleteRequest = audioStore.delete(audioId);

         deleteRequest.onsuccess = () => {
            // Update playlist audio count
            const getPlaylistRequest = playlistStore.get(playlistId);
            getPlaylistRequest.onsuccess = () => {
               const playlist = getPlaylistRequest.result;
               if (playlist && playlist.audioCount > 0) {
                  playlist.audioCount -= 1;
                  playlist.updatedAt = new Date().toISOString();
                  playlistStore.put(playlist);
               }
            };

            slice.logger.logInfo('AudioStorageManager', `Audio file ${audioId} deleted successfully`);
            resolve();
         };

         deleteRequest.onerror = (event) => {
            reject(new Error(`Error deleting audio file: ${event.target.error}`));
         };
      });
   }

   async deleteAudiosByPlaylistId(playlistId) {
      if (!this.db) await this.init();

      const audioFiles = await this.getAudiosByPlaylistId(playlistId);
      
      for (const audio of audioFiles) {
         await new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.audioStoreName], 'readwrite');
            const store = transaction.objectStore(this.audioStoreName);
            const request = store.delete(audio.id);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(new Error(`Error deleting audio: ${event.target.error}`));
         });
      }
   }

   async updatePlaylist(playlistId, updates) {
      if (!this.db) await this.init();

      return new Promise((resolve, reject) => {
         const transaction = this.db.transaction([this.storeName], 'readwrite');
         const store = transaction.objectStore(this.storeName);
         const getRequest = store.get(playlistId);

         getRequest.onsuccess = () => {
            const playlist = getRequest.result;
            if (playlist) {
               Object.assign(playlist, updates, { updatedAt: new Date().toISOString() });
               const updateRequest = store.put(playlist);

               updateRequest.onsuccess = () => {
                  resolve(playlist);
               };

               updateRequest.onerror = (event) => {
                  reject(new Error(`Error updating playlist: ${event.target.error}`));
               };
            } else {
               reject(new Error('Playlist not found'));
            }
         };

         getRequest.onerror = (event) => {
            reject(new Error(`Error getting playlist: ${event.target.error}`));
         };
      });
   }

   async clearAllData() {
      if (!this.db) await this.init();

      return new Promise((resolve, reject) => {
         const transaction = this.db.transaction([this.storeName, this.audioStoreName], 'readwrite');
         
         const clearPlaylists = transaction.objectStore(this.storeName).clear();
         const clearAudios = transaction.objectStore(this.audioStoreName).clear();

         transaction.oncomplete = () => {
            slice.logger.logInfo('AudioStorageManager', 'All data cleared successfully');
            resolve();
         };

         transaction.onerror = (event) => {
            reject(new Error(`Error clearing data: ${event.target.error}`));
         };
      });
   }

   async getStorageInfo() {
      if (!this.db) await this.init();

      const playlists = await this.getAllPlaylists();
      let totalAudioFiles = 0;
      let totalSize = 0;

      for (const playlist of playlists) {
         const audios = await this.getAudiosByPlaylistId(playlist.id);
         totalAudioFiles += audios.length;
         totalSize += audios.reduce((sum, audio) => sum + (audio.size || 0), 0);
      }

      return {
         totalPlaylists: playlists.length,
         totalAudioFiles,
         totalSize,
         formattedSize: this.formatBytes(totalSize)
      };
   }

   formatBytes(bytes, decimals = 2) {
      if (bytes === 0) return '0 Bytes';

      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];

      const i = Math.floor(Math.log(bytes) / Math.log(k));

      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
   }
}
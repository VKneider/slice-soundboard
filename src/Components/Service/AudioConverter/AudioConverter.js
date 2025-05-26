export default class AudioConverter {
   constructor() {
      this.supportedFormats = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a'];
      this.maxFileSize = 50 * 1024 * 1024; // 50MB limit
   }

   /**
    * Convert a File object to base64 string with metadata
    * @param {File} file - The audio file to convert
    * @returns {Promise<Object>} - Object containing base64 data and metadata
    */
   async fileToBase64(file) {
      return new Promise((resolve, reject) => {
         // Validate file type
         if (!this.isValidAudioFile(file)) {
            reject(new Error(`Unsupported file format: ${file.type}`));
            return;
         }

         // Validate file size
         if (file.size > this.maxFileSize) {
            reject(new Error(`File too large. Maximum size is ${this.formatBytes(this.maxFileSize)}`));
            return;
         }

         const reader = new FileReader();

         reader.onload = () => {
            try {
               const base64String = reader.result;
               
               // Create audio element to get duration
               const audio = new Audio();
               audio.src = base64String;
               
               audio.onloadedmetadata = () => {
                  const audioData = {
                     name: this.sanitizeFileName(file.name),
                     base64Data: base64String,
                     type: file.type,
                     size: file.size,
                     duration: audio.duration,
                     originalName: file.name,
                     convertedAt: new Date().toISOString()
                  };

                  slice.logger.logInfo('AudioConverter', `File "${file.name}" converted to base64 successfully`);
                  resolve(audioData);
               };

               audio.onerror = () => {
                  reject(new Error('Failed to load audio metadata'));
               };

            } catch (error) {
               reject(new Error(`Conversion failed: ${error.message}`));
            }
         };

         reader.onerror = () => {
            reject(new Error('Failed to read file'));
         };

         reader.readAsDataURL(file);
      });
   }

   /**
    * Convert multiple files to base64
    * @param {FileList|Array} files - Array of files to convert
    * @param {Function} progressCallback - Optional callback for progress updates
    * @returns {Promise<Array>} - Array of converted audio data objects
    */
   async filesToBase64(files, progressCallback = null) {
      const results = [];
      const errors = [];
      const fileArray = Array.from(files);

      for (let i = 0; i < fileArray.length; i++) {
         try {
            if (progressCallback) {
               progressCallback(i, fileArray.length, fileArray[i].name);
            }

            const audioData = await this.fileToBase64(fileArray[i]);
            results.push(audioData);
         } catch (error) {
            errors.push({
               fileName: fileArray[i].name,
               error: error.message
            });
            slice.logger.logError('AudioConverter', `Failed to convert ${fileArray[i].name}`, error);
         }
      }

      if (progressCallback) {
         progressCallback(fileArray.length, fileArray.length, 'Complete');
      }

      return {
         successful: results,
         errors: errors,
         totalProcessed: fileArray.length
      };
   }

   /**
    * Convert base64 string back to Blob
    * @param {string} base64Data - Base64 data URL
    * @param {string} mimeType - MIME type of the audio
    * @returns {Blob} - Blob object
    */
   base64ToBlob(base64Data, mimeType = 'audio/mp3') {
      try {
         // Remove data URL prefix if present
         const base64String = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
         
         const byteCharacters = atob(base64String);
         const byteNumbers = new Array(byteCharacters.length);
         
         for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
         }
         
         const byteArray = new Uint8Array(byteNumbers);
         return new Blob([byteArray], { type: mimeType });
      } catch (error) {
         slice.logger.logError('AudioConverter', 'Failed to convert base64 to blob', error);
         throw new Error(`Base64 conversion failed: ${error.message}`);
      }
   }

   /**
    * Create a downloadable URL from base64 data
    * @param {string} base64Data - Base64 data URL
    * @param {string} mimeType - MIME type of the audio
    * @returns {string} - Object URL for the audio
    */
   createAudioUrl(base64Data, mimeType = 'audio/mp3') {
      try {
         // If it's already a data URL, return it directly
         if (base64Data.startsWith('data:')) {
            return base64Data;
         }

         const blob = this.base64ToBlob(base64Data, mimeType);
         return URL.createObjectURL(blob);
      } catch (error) {
         slice.logger.logError('AudioConverter', 'Failed to create audio URL', error);
         throw error;
      }
   }

   /**
    * Validate if file is a supported audio format
    * @param {File} file - File to validate
    * @returns {boolean} - True if valid audio file
    */
   isValidAudioFile(file) {
      // Check MIME type
      if (this.supportedFormats.includes(file.type)) {
         return true;
      }

      // Check file extension as fallback
      const extension = file.name.toLowerCase().split('.').pop();
      const validExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'mpeg'];
      
      return validExtensions.includes(extension);
   }

   /**
    * Sanitize file name for safe storage
    * @param {string} fileName - Original file name
    * @returns {string} - Sanitized file name
    */
   sanitizeFileName(fileName) {
      // Remove or replace invalid characters
      return fileName
         .replace(/[<>:"/\\|?*]/g, '_')
         .replace(/\s+/g, '_')
         .substring(0, 100); // Limit length
   }

   /**
    * Get audio duration from base64 data
    * @param {string} base64Data - Base64 data URL
    * @returns {Promise<number>} - Duration in seconds
    */
   async getAudioDuration(base64Data) {
      return new Promise((resolve, reject) => {
         const audio = new Audio();
         audio.src = base64Data;

         audio.onloadedmetadata = () => {
            resolve(audio.duration);
         };

         audio.onerror = () => {
            reject(new Error('Failed to load audio for duration calculation'));
         };
      });
   }

   /**
    * Format bytes to human readable format
    * @param {number} bytes - Bytes to format
    * @param {number} decimals - Number of decimal places
    * @returns {string} - Formatted size string
    */
   formatBytes(bytes, decimals = 2) {
      if (bytes === 0) return '0 Bytes';

      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];

      const i = Math.floor(Math.log(bytes) / Math.log(k));

      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
   }

   /**
    * Format duration to MM:SS format
    * @param {number} seconds - Duration in seconds
    * @returns {string} - Formatted duration
    */
   formatDuration(seconds) {
      if (!seconds || isNaN(seconds)) return '00:00';
      
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      
      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
   }

   /**
    * Get supported file types for file input accept attribute
    * @returns {string} - Comma-separated list of MIME types
    */
   getAcceptString() {
      return this.supportedFormats.join(',') + ',.mp3,.wav,.ogg,.m4a';
   }

   /**
    * Compress audio data (basic implementation)
    * @param {string} base64Data - Base64 data to compress
    * @returns {string} - Compressed base64 data (placeholder implementation)
    */
   compressAudio(base64Data) {
      // This is a placeholder - real audio compression would require 
      // more sophisticated libraries like ffmpeg.wasm
      slice.logger.logInfo('AudioConverter', 'Audio compression not implemented - returning original data');
      return base64Data;
   }
}
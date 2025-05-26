export default class AudioUploader extends HTMLElement {
   constructor(props) {
      super();
      slice.attachTemplate(this);
      
      this.$container = this.querySelector('.uploader-container');
      this.$dropZone = this.querySelector('.drop-zone');
      this.$fileInput = this.querySelector('.file-input');
      this.$selectBtn = this.querySelector('.select-files-btn');
      this.$uploadStatus = this.querySelector('.upload-status');
      this.$progressContainer = this.querySelector('.progress-container');
      this.$progressBar = this.querySelector('.upload-progress');
      this.$progressText = this.querySelector('.progress-text');
      this.$fileList = this.querySelector('.file-list');
      
      slice.controller.setComponentProps(this, props);
      this.debuggerProps = ['playlistService', 'onFilesUploaded'];
      
      // Upload state
      this.isUploading = false;
      this.selectedFiles = [];
      this.audioConverter = null;
   }

   async init() {
      try {
         // Initialize audio converter
         this.audioConverter = await slice.build('AudioConverter');
         
         // Setup file input
         this.setupFileInput();
         
         // Setup event listeners
         this.setupEventListeners();
         
         // Update supported formats display
         this.updateSupportedFormats();
         
         slice.logger.logInfo('AudioUploader', 'Audio uploader initialized');
      } catch (error) {
         slice.logger.logError('AudioUploader', 'Failed to initialize uploader', error);
      }
   }

   get playlistService() {
      return this._playlistService;
   }

   set playlistService(value) {
      this._playlistService = value;
   }

   get onFilesUploaded() {
      return this._onFilesUploaded;
   }

   set onFilesUploaded(value) {
      this._onFilesUploaded = value;
   }

   setupFileInput() {
      // Set accepted file types
      this.$fileInput.accept = this.audioConverter.getAcceptString();
      this.$fileInput.multiple = true;
   }

   setupEventListeners() {
      // File input change
      this.$fileInput.addEventListener('change', (e) => {
         this.handleFileSelection(e.target.files);
      });

      // Select files button
      this.$selectBtn.addEventListener('click', () => {
         this.$fileInput.click();
      });

      // Drag and drop events
      this.$dropZone.addEventListener('dragover', (e) => {
         e.preventDefault();
         this.$dropZone.classList.add('drag-over');
      });

      this.$dropZone.addEventListener('dragleave', (e) => {
         e.preventDefault();
         if (!this.$dropZone.contains(e.relatedTarget)) {
            this.$dropZone.classList.remove('drag-over');
         }
      });

      this.$dropZone.addEventListener('drop', (e) => {
         e.preventDefault();
         this.$dropZone.classList.remove('drag-over');
         
         const files = Array.from(e.dataTransfer.files).filter(file => 
            this.audioConverter.isValidAudioFile(file)
         );
         
         if (files.length > 0) {
            this.handleFileSelection(files);
         } else {
            this.showError('No valid audio files found in the drop');
         }
      });

      // Click on drop zone
      this.$dropZone.addEventListener('click', () => {
         if (!this.isUploading) {
            this.$fileInput.click();
         }
      });
   }

   handleFileSelection(files) {
      if (this.isUploading) {
         this.showError('Upload already in progress');
         return;
      }

      if (!files || files.length === 0) {
         return;
      }

      // Convert FileList to Array and filter valid audio files
      this.selectedFiles = Array.from(files).filter(file => {
         if (!this.audioConverter.isValidAudioFile(file)) {
            this.showError(`Invalid file type: ${file.name}`);
            return false;
         }
         return true;
      });

      if (this.selectedFiles.length === 0) {
         this.showError('No valid audio files selected');
         return;
      }

      // Display selected files
      this.displaySelectedFiles();
      
      // Auto-upload or wait for user confirmation
      this.startUpload();
   }

   displaySelectedFiles() {
      this.$fileList.innerHTML = '';
      
      if (this.selectedFiles.length === 0) {
         this.$fileList.style.display = 'none';
         return;
      }

      this.$fileList.style.display = 'block';
      
      const listTitle = document.createElement('h4');
      listTitle.textContent = `Selected Files (${this.selectedFiles.length})`;
      listTitle.classList.add('file-list-title');
      this.$fileList.appendChild(listTitle);

      const fileItems = document.createElement('div');
      fileItems.classList.add('file-items');

      for (const file of this.selectedFiles) {
         const fileItem = document.createElement('div');
         fileItem.classList.add('file-item');
         
         fileItem.innerHTML = `
            <div class="file-info">
               <span class="file-name">${file.name}</span>
               <span class="file-size">${this.audioConverter.formatBytes(file.size)}</span>
            </div>
            <div class="file-status">
               <span class="status-icon">⏳</span>
               <span class="status-text">Pending</span>
            </div>
         `;

         fileItems.appendChild(fileItem);
      }

      this.$fileList.appendChild(fileItems);
   }

   async startUpload() {
      if (!this.playlistService) {
         this.showError('Playlist service not available');
         return;
      }

      const currentPlaylist = this.playlistService.getCurrentPlaylist();
      if (!currentPlaylist) {
         this.showError('No playlist selected');
         return;
      }

      this.isUploading = true;
      this.updateUploadUI(true);

      try {
         // Upload files to current playlist
         const result = await this.playlistService.addAudioFiles(
            currentPlaylist.id,
            this.selectedFiles,
            (current, total, fileName) => {
               this.updateProgress(current, total, fileName);
               this.updateFileStatus(current - 1, 'uploading');
            }
         );

         // Update file statuses based on results
         this.updateFileResults(result);

         // Notify parent component
         if (this.onFilesUploaded) {
            this.onFilesUploaded(result);
         }

         // Show completion message
         this.showSuccess(
            `Upload completed! ${result.successful.length} files uploaded successfully.`
         );

         // Clear selection after a delay
         setTimeout(() => {
            this.clearSelection();
         }, 3000);

      } catch (error) {
         slice.logger.logError('AudioUploader', 'Upload failed', error);
         this.showError(`Upload failed: ${error.message}`);
      } finally {
         this.isUploading = false;
         this.updateUploadUI(false);
      }
   }

   updateProgress(current, total, fileName) {
      const percentage = Math.round((current / total) * 100);
      
      this.$progressBar.style.width = `${percentage}%`;
      this.$progressText.textContent = `Uploading ${current} of ${total}: ${fileName}`;
      
      // Update progress container visibility
      this.$progressContainer.style.display = 'block';
   }

   updateFileStatus(fileIndex, status, message = '') {
      const fileItems = this.$fileList.querySelectorAll('.file-item');
      
      if (fileItems[fileIndex]) {
         const statusIcon = fileItems[fileIndex].querySelector('.status-icon');
         const statusText = fileItems[fileIndex].querySelector('.status-text');
         
         switch (status) {
            case 'uploading':
               statusIcon.textContent = '⏳';
               statusText.textContent = 'Uploading...';
               fileItems[fileIndex].classList.add('uploading');
               break;
            case 'success':
               statusIcon.textContent = '✅';
               statusText.textContent = 'Success';
               fileItems[fileIndex].classList.remove('uploading');
               fileItems[fileIndex].classList.add('success');
               break;
            case 'error':
               statusIcon.textContent = '❌';
               statusText.textContent = message || 'Error';
               fileItems[fileIndex].classList.remove('uploading');
               fileItems[fileIndex].classList.add('error');
               break;
         }
      }
   }

   updateFileResults(result) {
      // Mark successful files
      for (let i = 0; i < result.successful.length; i++) {
         this.updateFileStatus(i, 'success');
      }

      // Mark failed files
      result.errors.forEach((error, index) => {
         // Find the file index by name
         const fileIndex = this.selectedFiles.findIndex(file => file.name === error.fileName);
         if (fileIndex !== -1) {
            this.updateFileStatus(fileIndex, 'error', error.error);
         }
      });
   }

   updateUploadUI(isUploading) {
      if (isUploading) {
         this.$dropZone.classList.add('uploading');
         this.$selectBtn.disabled = true;
         this.$selectBtn.textContent = 'Uploading...';
         this.$uploadStatus.textContent = 'Uploading files...';
         this.$uploadStatus.className = 'upload-status uploading';
      } else {
         this.$dropZone.classList.remove('uploading');
         this.$selectBtn.disabled = false;
         this.$selectBtn.textContent = 'Select Audio Files';
         this.$progressContainer.style.display = 'none';
      }
   }

   clearSelection() {
      this.selectedFiles = [];
      this.$fileInput.value = '';
      this.$fileList.style.display = 'none';
      this.$uploadStatus.textContent = '';
      this.$uploadStatus.className = 'upload-status';
      this.$progressContainer.style.display = 'none';
   }

   updateSupportedFormats() {
      const formatsContainer = this.querySelector('.supported-formats');
      if (formatsContainer) {
         const formats = ['MP3', 'WAV', 'OGG', 'M4A'];
         formatsContainer.innerHTML = `
            <small class="formats-text">
               Supported formats: ${formats.join(', ')}
            </small>
         `;
      }
   }

   showError(message) {
      this.$uploadStatus.textContent = message;
      this.$uploadStatus.className = 'upload-status error';
      
      // Clear error after 5 seconds
      setTimeout(() => {
         if (this.$uploadStatus.classList.contains('error')) {
            this.$uploadStatus.textContent = '';
            this.$uploadStatus.className = 'upload-status';
         }
      }, 5000);
   }

   showSuccess(message) {
      this.$uploadStatus.textContent = message;
      this.$uploadStatus.className = 'upload-status success';
   }

   // Public method to trigger file selection
   selectFiles() {
      this.$fileInput.click();
   }

   // Public method to check if uploader is busy
   isBusy() {
      return this.isUploading;
   }
}

customElements.define('slice-audio-uploader', AudioUploader);
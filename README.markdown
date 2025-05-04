# Video Streaming Platform Implementation

## Overview
This is a video streaming platform implementation that includes user authentication, video upload, transcoding, and streaming capabilities. The platform features:
- User authentication and authorization
- Video upload with automatic transcoding
- Adaptive bitrate streaming
- Video quality selection
- Progress tracking for uploads and transcoding

## Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v13 or higher)
- FFmpeg (for video transcoding)
- Git

## Setup Instructions
1. **Clone the Repository**:
   ```bash
   git clone <repository_url>
   cd video-streaming-platform
   ```

2. **Install Dependencies**:
   ```bash
   npm install express pg jsonwebtoken bcrypt multer fluent-ffmpeg
   ```

3. **Install FFmpeg**:
   - Windows: Download from https://ffmpeg.org/download.html
   - macOS: `brew install ffmpeg`
   - Linux: `sudo apt-get install ffmpeg`

4. **Set Up PostgreSQL**:
   - Create a database named `video_platform`
   - Run the SQL from `init.txt` to create tables

5. **Configure Environment**:
   - Update database credentials in `server.js`
   - Create an `uploads` directory for video storage

6. **Run the Server**:
   ```bash
   node server.js
   ```

7. **Access the Application**:
   - Open `index.html` in a browser
   - Register a user and start uploading videos

## Features
- **User Authentication**: Secure login and registration
- **Video Upload**: Support for various video formats
- **Transcoding**: Automatic conversion to multiple qualities (1080p, 720p, 480p)
- **Adaptive Streaming**: HTTP range requests for smooth playback
- **Quality Selection**: Users can choose video quality
- **Progress Tracking**: Real-time status updates for uploads and transcoding

## Architecture
- **Frontend**: React with Tailwind CSS
- **Backend**: Node.js/Express
- **Database**: PostgreSQL
- **Video Processing**: FFmpeg
- **Storage**: Local file system (can be extended to S3)

## Notes
- Video files are stored locally in the `uploads` directory
- Transcoding is performed using FFmpeg
- The system supports multiple video qualities for adaptive streaming
- Progress tracking shows upload and transcoding status
- Video streaming uses HTTP range requests for efficient delivery
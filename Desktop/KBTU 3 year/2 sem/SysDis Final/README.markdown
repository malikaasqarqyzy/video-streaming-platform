# Video Streaming Platform

## Overview
A modern video streaming platform built with Node.js, Express, and React. Features include:
- User authentication (register/login)
- Video upload functionality
- Automatic video transcoding to multiple qualities
- Adaptive video streaming
- Real-time status updates
- Responsive UI with Tailwind CSS

## Prerequisites
- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- FFmpeg (required for video transcoding)

## Setup Instructions

### 1. Database Setup
```bash
# Create the database
createdb video_platform

# Initialize the database schema
psql -d video_platform -f init.sql
```

### 2. Install Dependencies
```bash
# Install Node.js dependencies
npm install express pg jsonwebtoken bcrypt multer path fs fluent-ffmpeg
```

### 3. Directory Setup
```bash
# Create directories for uploads and public files
mkdir uploads
mkdir public
```

### 4. Configuration
Update the database configuration in `server.js` with your PostgreSQL credentials:
```javascript
const pool = new Pool({
  user: 'postgres',      // Your PostgreSQL username
  host: 'localhost',     // Your PostgreSQL host
  database: 'video_platform',
  password: 'your_password', // Your PostgreSQL password
  port: 5432,
});
```

### 5. Start the Server
```bash
node server.js
```

The server will start on port 3000. Access the application at:
```
http://localhost:3000
```

## Features

### User Authentication
- Secure user registration and login
- JWT-based authentication
- Password hashing with bcrypt

### Video Management
- Upload video files
- Automatic video transcoding to multiple qualities:
  - 1080p (4000k bitrate)
  - 720p (2500k bitrate)
  - 480p (1000k bitrate)
- Real-time status updates during upload and processing

### Video Streaming
- Adaptive bitrate streaming
- Quality selection (1080p, 720p, 480p)
- HTTP range requests support for efficient streaming
- Video player with playback controls

### UI/UX
- Modern, responsive design with Tailwind CSS
- Intuitive video upload interface
- Real-time status updates and error messages
- Grid layout for video gallery

## Project Structure
- `server.js` - Backend Express server
- `public/index.html` - Frontend React application
- `init.sql` - Database schema
- `uploads/` - Directory for uploaded videos
- `public/` - Static files directory

## Security Features
- Password hashing
- JWT authentication
- Input validation
- Secure file uploads
- Database query parameterization

## Error Handling
- Comprehensive error messages
- Status code-based responses
- Client-side validation
- Server-side validation

## Future Improvements
- User profiles
- Video thumbnails
- Comments and likes
- Share functionality
- Analytics dashboard
- Cloud storage integration

## Contributing
Feel free to submit issues and enhancement requests.

## License
MIT License
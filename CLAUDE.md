# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a client-side web application that displays a user's Spotify liked albums that were released "today" (same month and day) in previous years. The app uses Spotify's Web API with OAuth2 implicit grant flow for authentication.

The GitHub repo for this project is at https://github.com/cbolik/albums-released-today

## Development Commands

```bash
# Start the local development server
npm start

# The server runs on port 8000 by default
# Access the app at http://localhost:8000
```

## Architecture

### Core Components

- **app.js**: Simple Express server that serves static files from `/public` directory
- **public/scripts.js**: Main application logic containing:
  - Spotify OAuth2 authentication flow
  - Album data fetching and processing
  - Date-based album filtering and display
  - Navigation functionality for browsing different dates
- **public/index.html**: Single-page application HTML structure
- **public/styles.css**: Application styling

### Key Classes and Data Structures

- **Album**: Data model for album objects with release date, name, artist, image URL, and Spotify links
- **DateNavigator**: Handles date navigation (previous/next day, reset to today)
- **AlbumDisplay**: Manages album rendering and display logic
- **SpotifyAlbumApp**: Main application controller that coordinates the other components

### Data Flow

1. App authenticates with Spotify using OAuth2 implicit grant
2. Fetches all user's saved albums via Spotify Web API
3. Processes albums into two data structures:
   - `albumsByDate`: Map keyed by "-MM-DD" suffix containing arrays of albums sorted by year
   - `albumsList`: Flat array of all albums for random selection
4. Displays albums released on the current date (or navigated date)
5. Shows random albums if none found for the selected date

### Spotify Integration

- Client ID is base64-encoded and stored in `SPOTIFY_CLIENT_ID` constant
- Uses localStorage for caching album data to avoid repeated API calls
- Handles mobile vs desktop Spotify link routing (URI vs HTTPS)
- Excludes albums with January 1st release dates (considered "unknown" in Spotify)

### External Dependencies

- Font Awesome icons for UI elements
- Express.js for local development server
- No build process or transpilation required - vanilla JavaScript

## Important Notes

- The app requires a valid Spotify Client ID to be configured in `scripts.js`
- All authentication and API calls happen client-side
- Album data is cached in localStorage for performance
- The app filters out albums released on January 1st as these often represent unknown release dates in Spotify's data

# DevOps
- To publish changes do the following:
  - commit the changes with a descriptive message
  - push to master
  - then push to gh-pages: `git subtree push --prefix public origin gh-pages``

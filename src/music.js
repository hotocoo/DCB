
import { logger } from './logger.js';
import 'dotenv/config';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection, StreamType, NoSubscriberBehavior, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import ytdl from '@distube/ytdl-core';
import axios from 'axios';
import yts from 'yt-search';
import ffmpeg from 'ffmpeg-static';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

// FFmpeg binary path resolution and validation
let ffmpegPath = ffmpeg;
if (typeof ffmpeg === 'string' && existsSync(ffmpeg)) {
  ffmpegPath = ffmpeg;
} else {
  // Fallback: try to find ffmpeg in system PATH
  try {
    ffmpegPath = execSync('where ffmpeg 2>nul || which ffmpeg 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    if (!ffmpegPath || !existsSync(ffmpegPath)) {
      // Last resort: use the static binary directly
      ffmpegPath = path.resolve('ffmpeg-static');
    }
  } catch (e) {
    ffmpegPath = path.resolve('ffmpeg-static');
  }
}

// Ensure absolute path
if (ffmpegPath && !path.isAbsolute(ffmpegPath)) {
  ffmpegPath = path.resolve(ffmpegPath);
}

// Diagnostic logs for debugging
console.log('[MUSIC] FFmpeg path resolved:', ffmpegPath);
console.log('[MUSIC] FFmpeg exists at resolved path:', existsSync(ffmpegPath));
logger.info('MusicManager initialization diagnostics', {
  originalFfmpegPath: ffmpeg,
  resolvedFfmpegPath: ffmpegPath,
  ffmpegExists: existsSync(ffmpegPath),
  nodeVersion: process.version,
  platform: process.platform
});
import { RateLimiterMemory } from 'rate-limiter-flexible';
import SpotifyWebApi from 'spotify-web-api-node';
import pkg from 'libsodium-wrappers';
const { ready: sodiumReady } = pkg;

// Import validation utilities
import { inputValidator, sanitizeInput, validateString } from './validation.js';
import { CommandError, handleCommandError } from './errorHandler.js';

// Enhanced Music System with YouTube & Spotify Priority
class MusicManager {
  constructor() {
    this.queue = new Map(); // guildId -> queue array
    this.currentlyPlaying = new Map(); // guildId -> current song
    this.musicSettings = new Map(); // guildId -> settings
    this.isPlaying = new Map(); // guildId -> boolean
    this.voiceChannels = new Map(); // guildId -> voice channel info
    this.audioPlayers = new Map(); // guildId -> audio player
    this.history = new Map(); // guildId -> history array

    // Performance optimization caches
    this.searchCache = new Map(); // Cache recent search results
    this.validationCache = new Map(); // Cache URL validation results

    // Start periodic cleanup to prevent memory leaks
    this.startPeriodicCleanup();

    // Initialize Spotify API
    this.spotifyApi = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    });

    // Refresh Spotify token periodically
    this.refreshSpotifyToken();

    // Rate limiter for Spotify API (1000 requests per hour - higher limit than Deezer)
    this.rateLimiter = new RateLimiterMemory({
      keyPrefix: 'spotify_api',
      points: 1000,
      duration: 3600,
    });

    // Rate limiter for YouTube API (10000 requests per day)
    this.youtubeRateLimiter = new RateLimiterMemory({
      keyPrefix: 'youtube_api',
      points: 10000,
      duration: 86400,
    });
  }

  // Periodic cleanup to prevent memory leaks
  startPeriodicCleanup() {
    // Clean up every 30 minutes
    setInterval(() => {
      this.performCleanup();
    }, 30 * 60 * 1000); // 30 minutes
  }

  // Perform cleanup of stale data with enhanced cache management
  performCleanup() {
    const now = Date.now();
    const cleanupThreshold = 60 * 60 * 1000; // 1 hour of inactivity

    logger.info('Starting periodic cleanup of Maps and caches');

    let cleanedCount = 0;

    // Clean up music settings for inactive guilds
    for (const [guildId, settings] of this.musicSettings.entries()) {
      if (!settings.lastActivity || (now - settings.lastActivity) > cleanupThreshold) {
        this.musicSettings.delete(guildId);
        cleanedCount++;
      }
    }

    // Clean up history maps for inactive guilds
    for (const [guildId, history] of this.history.entries()) {
      if (history.length === 0 || (now - history[history.length - 1]?.playedAt) > cleanupThreshold) {
        this.history.delete(guildId);
        cleanedCount++;
      }
    }

    // Clean up voice channel info for disconnected guilds
    for (const [guildId, voiceInfo] of this.voiceChannels.entries()) {
      if (!voiceInfo || (now - voiceInfo.joinedAt) > cleanupThreshold) {
        this.voiceChannels.delete(guildId);
        cleanedCount++;
      }
    }

    // Clean up audio players for guilds without active connections
    for (const [guildId, player] of this.audioPlayers.entries()) {
      if (!player || player.state.status === 'idle') {
        this.audioPlayers.delete(guildId);
        cleanedCount++;
      }
    }

    // Clean up search cache (remove entries older than 30 minutes)
    if (this.searchCache) {
      for (const [key, entry] of this.searchCache.entries()) {
        if ((now - entry.timestamp) > 30 * 60 * 1000) { // 30 minutes
          this.searchCache.delete(key);
          cleanedCount++;
        }
      }
    }

    // Clean up validation cache (remove entries older than 15 minutes)
    if (this.validationCache) {
      for (const [key, entry] of this.validationCache.entries()) {
        if ((now - entry.timestamp) > 15 * 60 * 1000) { // 15 minutes
          this.validationCache.delete(key);
          cleanedCount++;
        }
      }
    }

    logger.info('Periodic cleanup completed', { itemsCleaned: cleanedCount });
  }

  // Spotify Authentication Management
  async refreshSpotifyToken() {
    try {
      // Check if credentials are provided
      if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET ||
          process.env.SPOTIFY_CLIENT_ID === 'your-spotify-client-id-here' ||
          process.env.SPOTIFY_CLIENT_SECRET === 'your-spotify-client-secret-here') {
        console.log('[MUSIC] Spotify credentials not configured, skipping token refresh');
        return;
      }

      const data = await this.spotifyApi.clientCredentialsGrant();
      this.spotifyApi.setAccessToken(data.body['access_token']);

      // Refresh token before it expires
      const refreshTime = Math.max((data.body['expires_in'] - 60) * 1000, 60 * 1000); // At least 1 minute
      setTimeout(() => this.refreshSpotifyToken(), refreshTime);
      console.log('[MUSIC] Spotify token refreshed successfully');
    } catch (error) {
      console.error('[MUSIC] Failed to refresh Spotify token:', error.message);
      console.log('[MUSIC] Please check your Spotify API credentials in .env file');
      // Retry in 10 minutes for credential issues
      setTimeout(() => this.refreshSpotifyToken(), 10 * 60 * 1000);
    }
  }

  // Queue Management
  addToQueue(guildId, song) {
    if (!this.queue.has(guildId)) {
      this.queue.set(guildId, []);
    }

    const queue = this.queue.get(guildId);
    queue.push({
      id: `song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...song,
      addedBy: song.addedBy,
      addedAt: Date.now()
    });

    return queue;
  }

  getQueue(guildId) {
    return this.queue.get(guildId) || [];
  }

  removeFromQueue(guildId, songIndex) {
    const queue = this.queue.get(guildId);
    if (!queue || songIndex < 0 || songIndex >= queue.length) {
      return false;
    }

    const removed = queue.splice(songIndex, 1);
    return removed[0];
  }

  clearQueue(guildId) {
    this.queue.set(guildId, []);
    return true;
  }

  // History Management
  addToHistory(guildId, song) {
    if (!this.history.has(guildId)) {
      this.history.set(guildId, []);
    }
    const history = this.history.get(guildId);
    history.push(song);
    // Limit history to last 10 songs
    if (history.length > 10) {
      history.shift();
    }
  }

  getHistory(guildId) {
    return this.history.get(guildId) || [];
  }

  back(guildId) {
    const history = this.getHistory(guildId);
    if (history.length === 0) return false;

    const previousSong = history.pop();
    this.currentlyPlaying.set(guildId, {
      ...previousSong,
      startedAt: Date.now(),
      status: 'playing'
    });

    // Play the previous song using enhanced error handling
    const player = this.audioPlayers.get(guildId);
    if (player) {
      const currentVolume = this.getVolume(guildId) / 100;

      // Use the enhanced playback method
      this.playWithErrorHandling(guildId, null, previousSong, player, getVoiceConnection(guildId))
        .then(result => {
          if (!result.success) {
            console.error(`[MUSIC] Failed to play previous song "${previousSong.title}":`, result.error);
            // Try to play next available song
            this.playNext(guildId);
          }
        })
        .catch(error => {
          console.error(`[MUSIC] Unexpected error playing previous song:`, error);
          this.playNext(guildId);
        });
    }

    return previousSong;
  }

  shuffleQueue(guildId) {
    const queue = this.queue.get(guildId);
    if (!queue || queue.length < 2) return false;

    // Keep current song in place, shuffle the rest
    const currentSong = queue.shift();
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    queue.unshift(currentSong);

    return true;
  }

  // Playlist Management
  createPlaylist(guildId, name, creatorId) {
    const playlistId = `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const playlist = {
      id: playlistId,
      name,
      creator: creatorId,
      songs: [],
      created: Date.now(),
      isPublic: true,
      playCount: 0
    };

    if (!this.musicSettings.has(guildId)) {
      this.musicSettings.set(guildId, { playlists: new Map() });
    }

    this.musicSettings.get(guildId).playlists.set(playlistId, playlist);
    return playlist;
  }

  addToPlaylist(guildId, playlistId, song) {
    const settings = this.musicSettings.get(guildId);
    if (!settings?.playlists) return false;

    const playlist = settings.playlists.get(playlistId);
    if (!playlist) return false;

    playlist.songs.push({
      id: `playlist_song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...song,
      addedAt: Date.now()
    });

    return true;
  }

  getPlaylist(guildId, playlistId) {
    const settings = this.musicSettings.get(guildId);
    return settings?.playlists?.get(playlistId) || null;
  }

   // Search and Discovery - YouTube & Spotify Priority with enhanced validation and caching
   async searchSongs(query, limit = 10) {
     try {
       // Validate and sanitize input
       if (!query || typeof query !== 'string') {
         throw new CommandError('Search query must be a non-empty string', 'INVALID_ARGUMENT');
       }

       const sanitizedQuery = sanitizeInput(query.trim());
       if (sanitizedQuery.length < 1) {
         throw new CommandError('Search query is too short', 'INVALID_ARGUMENT');
       }

       if (limit < 1 || limit > 50) {
         limit = Math.max(1, Math.min(50, limit));
       }

       // Check cache first (simple in-memory cache for recent searches)
       const cacheKey = `${sanitizedQuery}_${limit}`;
       const cached = this.searchCache?.get(cacheKey);
       if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 minute cache
         return cached.results;
       }

       const results = [];

       // Check if query is a Spotify URL
       const spotifyMatch = sanitizedQuery.match(/(?:spotify\.com\/track\/|spotify:track:)([a-zA-Z0-9]{22})/);
       if (spotifyMatch) {
         try {
           await this.rateLimiter.consume('spotify_api');
           const trackId = spotifyMatch[1];
           const data = await this.spotifyApi.getTrack(trackId);
           const track = data.body;

           if (track && track.name) {
             const result = [{
               title: sanitizeInput(track.name),
               artist: sanitizeInput(track.artists.map(a => a.name).join(', ')),
               duration: track.duration_ms ? `${Math.floor(track.duration_ms / 60000)}:${Math.floor((track.duration_ms % 60000) / 1000).toString().padStart(2, '0')}` : 'Unknown',
               url: sanitizedQuery,
               thumbnail: track.album?.images?.[0]?.url || '',
               source: 'spotify',
               spotifyId: track.id,
               preview: track.preview_url || null
             }];

             // Cache the result
             if (!this.searchCache) this.searchCache = new Map();
             this.searchCache.set(cacheKey, { results: result, timestamp: Date.now() });

             return result;
           }
         } catch (urlError) {
           logger.error('Spotify URL validation failed', urlError, { query: sanitizedQuery });
         }
       }

      // Check if query is a YouTube URL (high priority)
      if (ytdl.validateURL(query)) {
        try {
          await this.youtubeRateLimiter.consume('youtube_api');

          // Add retry logic for YouTube API issues
                let info;
                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    const modernHeaders = {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                      'Accept-Language': 'en-US,en;q=0.9',
                      'Accept-Encoding': 'gzip, deflate, br',
                      'Cache-Control': 'max-age=0',
                      'Sec-Fetch-Dest': 'document',
                      'Sec-Fetch-Mode': 'navigate',
                      'Sec-Fetch-Site': 'none',
                      'Sec-Fetch-User': '?1',
                      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                      'Sec-Ch-Ua-Mobile': '?0',
                      'Sec-Ch-Ua-Platform': '"Windows"',
                      'Upgrade-Insecure-Requests': '1'
                    };

                    logger.debug('YouTube getInfo attempt with modern headers', {
                      attempt,
                      query,
                      userAgent: modernHeaders['User-Agent']
                    });

                    info = await ytdl.getInfo(query, {
                      requestOptions: {
                        headers: modernHeaders
                      }
                    });
                    break; // Success, exit retry loop
                  } catch (retryError) {
                    console.log(`[MUSIC] YouTube attempt ${attempt} failed for ${query}: ${retryError.message}`);
                    logger.warn('YouTube getInfo retry failed', {
                      attempt,
                      query,
                      error: retryError.message,
                      stack: retryError.stack
                    });
                    if (attempt === 3) throw retryError;
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Wait longer before retry
                  }
                }

          const video = info.videoDetails;

          if (video.isPrivate || !video.title || video.title === 'Deleted video' || video.title === 'Private video') {
            console.log(`[MUSIC] Video unavailable: ${query} (Title: ${video.title})`);
            return [];
          }

          return [{
            title: video.title,
            artist: video.author.name,
            duration: video.lengthSeconds ? `${Math.floor(video.lengthSeconds / 60)}:${(video.lengthSeconds % 60).toString().padStart(2, '0')}` : 'Unknown',
            url: query,
            thumbnail: video.thumbnails[0]?.url || '',
            source: 'youtube',
            youtubeId: video.videoId
          }];
        } catch (urlError) {
          console.error(`[MUSIC] YouTube URL validation failed for ${query}:`, urlError.message);
          // Try to extract basic info without full validation
          try {
            const urlObj = new URL(query);
            const videoId = urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
            if (videoId) {
              console.log(`[MUSIC] Falling back to basic YouTube info for ${videoId}`);
              return [{
                title: `YouTube Video ${videoId}`,
                artist: 'Unknown Artist',
                duration: 'Unknown',
                url: query,
                thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                source: 'youtube',
                youtubeId: videoId
              }];
            }
          } catch (fallbackError) {
            console.error(`[MUSIC] YouTube fallback failed:`, fallbackError.message);
          }
          return [];
        }
      }

      // Check if query is a Deezer URL (legacy support)
      const deezerMatch = query.match(/deezer\.com\/track\/(\d+)/);
      if (deezerMatch) {
        try {
          const trackId = deezerMatch[1];
          const response = await axios.get(`https://api.deezer.com/track/${trackId}`);
          if (response.data && response.data.title) {
            const track = response.data;
            return [{
              title: track.title,
              artist: track.artist?.name || 'Unknown',
              duration: track.duration ? `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}` : 'Unknown',
              url: query,
              thumbnail: track.album?.cover_medium || '',
              source: 'deezer',
              preview: track.preview || null
            }];
          }
        } catch (urlError) {
          console.error(`[MUSIC] Deezer URL validation failed for ${query}:`, urlError.message);
          return [];
        }
      }

      // For text queries, try YouTube first (primary)
      try {
        await this.youtubeRateLimiter.consume('youtube_api');
        const searchResults = await yts(sanitizedQuery);
        const videos = searchResults.videos.slice(0, limit);

        const validVideos = [];
        for (const video of videos) {
          try {
            // Quick validation without full info fetch with enhanced checks
            if (video.title && video.author && video.duration && video.author.name) {
              // Validate URL format to ensure it's a proper YouTube URL
              if (ytdl.validateURL(video.url)) {
                // Additional validation for video availability
                if (!video.title.toLowerCase().includes('deleted') &&
                    !video.title.toLowerCase().includes('private') &&
                    video.duration.seconds > 0) {
                  validVideos.push({
                    title: sanitizeInput(video.title),
                    artist: sanitizeInput(video.author.name),
                    duration: video.duration.timestamp,
                    url: video.url,
                    thumbnail: video.thumbnail,
                    source: 'youtube',
                    youtubeId: video.videoId
                  });
                }
              } else {
                logger.debug('Skipping invalid YouTube URL', { url: video.url });
              }
            }
          } catch (videoError) {
            logger.debug('Skipping unavailable video', {
              title: video.title,
              url: video.url,
              error: videoError.message
            });
          }
        }

        if (validVideos.length > 0) {
          logger.info('YouTube search successful', {
            query: sanitizedQuery,
            results: validVideos.length
          });

          // Cache the result
          if (!this.searchCache) this.searchCache = new Map();
          this.searchCache.set(cacheKey, { results: validVideos, timestamp: Date.now() });

          return validVideos;
        }
      } catch (error) {
        logger.error('YouTube search failed', error, { query: sanitizedQuery });
        // Try with different search options
        try {
          logger.debug('Retrying YouTube search with different options');
          const searchResults = await yts(sanitizedQuery, { pages: 1 });
          const videos = searchResults.videos.slice(0, limit);

          const validVideos = [];
          for (const video of videos) {
            if (video.title && video.author && video.duration &&
                video.author.name && ytdl.validateURL(video.url) &&
                !video.title.toLowerCase().includes('deleted') &&
                !video.title.toLowerCase().includes('private')) {
              validVideos.push({
                title: sanitizeInput(video.title),
                artist: sanitizeInput(video.author.name),
                duration: video.duration.timestamp,
                url: video.url,
                thumbnail: video.thumbnail,
                source: 'youtube',
                youtubeId: video.videoId
              });
            }
          }

          if (validVideos.length > 0) {
            logger.info('YouTube retry search successful', {
              query: sanitizedQuery,
              results: validVideos.length
            });

            // Cache the result
            if (!this.searchCache) this.searchCache = new Map();
            this.searchCache.set(cacheKey, { results: validVideos, timestamp: Date.now() });

            return validVideos;
          }
        } catch (retryError) {
          logger.error('YouTube retry search failed', retryError, { query: sanitizedQuery });
        }
      }

      // If YouTube fails, try Spotify before Deezer
      try {
        await this.rateLimiter.consume('spotify_api');

        // Check if we have a valid token
        if (!this.spotifyApi.getAccessToken()) {
          logger.debug('No Spotify token available, attempting to refresh');
          await this.refreshSpotifyToken();
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a moment for token refresh
        }

        const data = await this.spotifyApi.searchTracks(sanitizedQuery, { limit });
        if (data.body.tracks && data.body.tracks.items.length > 0) {
          const tracks = data.body.tracks.items;
          const results = tracks.map(track => ({
            title: sanitizeInput(track.name),
            artist: sanitizeInput(track.artists.map(a => a.name).join(', ')),
            duration: track.duration_ms ? `${Math.floor(track.duration_ms / 60000)}:${Math.floor((track.duration_ms % 60000) / 1000).toString().padStart(2, '0')}` : 'Unknown',
            url: track.external_urls.spotify,
            thumbnail: track.album?.images?.[0]?.url || '',
            source: 'spotify',
            spotifyId: track.id,
            preview: track.preview_url || null
          }));

          logger.info('Spotify fallback search successful', {
            query: sanitizedQuery,
            results: results.length
          });

          // Cache the result
          if (!this.searchCache) this.searchCache = new Map();
          this.searchCache.set(cacheKey, { results, timestamp: Date.now() });

          return results;
        }
      } catch (error) {
        if (error.message.includes('No token provided') || error.message.includes('invalid_client')) {
          logger.debug('Spotify credentials not configured or invalid, skipping Spotify search');
        } else {
          logger.error('Spotify search failed', error, { query: sanitizedQuery });
        }
      }

      // Final fallback to Deezer (legacy support)
      try {
        const response = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(sanitizedQuery)}&limit=${limit}`);
        if (response.data && response.data.data && response.data.data.length > 0) {
          const tracks = response.data.data.slice(0, limit);
          const results = tracks.map(track => ({
            title: sanitizeInput(track.title),
            artist: sanitizeInput(track.artist?.name || 'Unknown'),
            duration: track.duration ? `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}` : 'Unknown',
            url: track.link,
            thumbnail: track.album?.cover_medium || '',
            source: 'deezer',
            preview: track.preview || null
          }));

          logger.info('Deezer legacy search successful', {
            query: sanitizedQuery,
            results: results.length
          });

          // Cache the result
          if (!this.searchCache) this.searchCache = new Map();
          this.searchCache.set(cacheKey, { results, timestamp: Date.now() });

          return results;
        }
      } catch (error) {
        logger.error('Deezer legacy search failed', error, { query: sanitizedQuery });
      }

      logger.warn('No search results found', { query: sanitizedQuery });
      return [];
    } catch (error) {
      logger.error('Music search error', error, { query: typeof query === 'string' ? query : 'invalid' });
      throw new CommandError('Failed to search for songs. Please try again.', 'API_ERROR');
    }
  }

  // Enhanced URL validation before playback with caching and better error handling
  async validateSongUrl(song) {
    // Validate song object
    if (!song || typeof song !== 'object') {
      return { valid: false, error: 'Invalid song object', canFallback: false };
    }

    const title = song.title || 'Unknown';
    const url = song.url;

    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'Invalid song URL', canFallback: false };
    }

    // Check cache first
    const cacheKey = `validate_${url}`;
    const cached = this.validationCache?.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 600000) { // 10 minute cache
      return cached.result;
    }

    try {
      if (song.source === 'spotify') {
        // For Spotify, check if track exists and has preview
        try {
          await this.rateLimiter.consume('spotify_api');
          const trackId = song.spotifyId || url.match(/spotify\.com\/track\/([a-zA-Z0-9]{22})/)?.[1];
          if (trackId) {
            const data = await this.spotifyApi.getTrack(trackId);
            if (data.body && data.body.name) {
              const result = {
                valid: true,
                hasPreview: !!data.body.preview_url
              };
              // Cache the result
              if (!this.validationCache) this.validationCache = new Map();
              this.validationCache.set(cacheKey, { result, timestamp: Date.now() });
              return result;
            }
          }
          throw new Error('Track not found');
        } catch (error) {
          logger.error('Spotify URL validation failed', error, { title, url });
          return {
            valid: false,
            error: error.message,
            canFallback: true
          };
        }
      } else if (song.source === 'deezer') {
        // For Deezer, check if track exists (legacy support)
        try {
          const trackId = url.match(/deezer\.com\/track\/(\d+)/)?.[1];
          if (trackId) {
            const response = await axios.get(`https://api.deezer.com/track/${trackId}`, { timeout: 5000 });
            if (response.data && response.data.title) {
              const result = { valid: true };
              // Cache the result
              if (!this.validationCache) this.validationCache = new Map();
              this.validationCache.set(cacheKey, { result, timestamp: Date.now() });
              return result;
            }
          }
          throw new Error('Track not found');
        } catch (error) {
          logger.error('Deezer URL validation failed', error, { title, url });
          return {
            valid: false,
            error: error.message,
            canFallback: true
          };
        }
      } else if (ytdl.validateURL(url)) {
        try {
          await this.youtubeRateLimiter.consume('youtube_api');

          // Add retry logic for YouTube validation with modern headers
           let info;
           for (let attempt = 1; attempt <= 3; attempt++) {
             try {
               const modernHeaders = {
                 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                 'Accept-Language': 'en-US,en;q=0.9',
                 'Accept-Encoding': 'gzip, deflate, br',
                 'Cache-Control': 'max-age=0',
                 'Sec-Fetch-Dest': 'document',
                 'Sec-Fetch-Mode': 'navigate',
                 'Sec-Fetch-Site': 'none',
                 'Sec-Fetch-User': '?1',
                 'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                 'Sec-Ch-Ua-Mobile': '?0',
                 'Sec-Ch-Ua-Platform': '"Windows"',
                 'Upgrade-Insecure-Requests': '1'
               };

               logger.debug('YouTube validation getInfo attempt with modern headers', {
                 attempt,
                 title,
                 url,
                 userAgent: modernHeaders['User-Agent']
               });

               info = await ytdl.getInfo(url, {
                 requestOptions: {
                   headers: modernHeaders
                 }
               });
               break; // Success, exit retry loop
             } catch (retryError) {
               logger.debug(`YouTube validation attempt ${attempt} failed`, {
                 title,
                 url,
                 error: retryError.message,
                 errorCode: retryError.code
               });
               if (attempt === 3) throw retryError;
               await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Wait longer before retry
             }
           }

          const video = info.videoDetails;

          // Check if video is available with enhanced validation
          if (video.isPrivate || !video.title ||
              video.title.toLowerCase().includes('deleted') ||
              video.title.toLowerCase().includes('private') ||
              video.isUnlisted) {
            throw new Error(`Video unavailable: ${video.title}`);
          }

          const result = { valid: true };
          // Cache the result
          if (!this.validationCache) this.validationCache = new Map();
          this.validationCache.set(cacheKey, { result, timestamp: Date.now() });
          return result;
        } catch (error) {
          logger.error('YouTube URL validation failed', error, { title, url });
          return {
            valid: false,
            error: error.message,
            canFallback: true
          };
        }
      }

      // Non-YouTube/Spotify/Deezer URLs are assumed valid (like radio streams)
      const result = { valid: true };
      // Cache the result
      if (!this.validationCache) this.validationCache = new Map();
      this.validationCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;

    } catch (error) {
      logger.error('Song URL validation error', error, { title, url, source: song.source });
      return {
        valid: false,
        error: 'Validation service unavailable',
        canFallback: false
      };
    }
  }

  // Enhanced playback with comprehensive error handling
  async playWithErrorHandling(guildId, voiceChannel, song, player, connection) {
    const startTime = Date.now();

    logger.debug('Starting playWithErrorHandling', {
      guildId,
      songTitle: song.title,
      songSource: song.source,
      songUrl: song.url,
      timestamp: new Date().toISOString()
    });

    logger.debug('Checking encryption packages in playWithErrorHandling');
    try {
      const sodiumModule = await import('sodium');
      logger.debug(`Sodium available: ${!!sodiumModule.default}`);
    } catch (e) {
      logger.debug(`Sodium error: ${e.message}`);
    }
    try {
      const tweetnaclModule = await import('tweetnacl');
      logger.debug(`TweetNaCl available: ${!!tweetnaclModule.default}`);
    } catch (e) {
      logger.debug(`TweetNaCl error: ${e.message}`);
    }
    try {
      await sodiumReady;
      logger.debug('libsodium-wrappers loaded');
    } catch (e) {
      logger.debug(`libsodium-wrappers error: ${e.message}`);
    }

    const currentVolume = this.getVolume(guildId) / 100;
    logger.debug('Current volume for playback', { guildId, volume: currentVolume });

    if (song.source === 'spotify') {
      // For Spotify tracks, use preview URL if available
      console.log(`[MUSIC] Creating Spotify stream for: ${song.title}`);
      logger.debug('Creating Spotify stream', {
        guildId,
        songTitle: song.title,
        hasPreview: !!song.preview,
        previewUrl: song.preview
      });

      try {
        if (song.preview) {
          // Use Spotify preview URL (30-second clip)
          logger.debug('Spawning FFmpeg for Spotify preview', {
            guildId,
            songTitle: song.title,
            previewUrl: song.preview,
            ffmpegPath: ffmpegPath
          });
          const ffmpegProcess = spawn(ffmpegPath, [
            '-hide_banner',
            '-loglevel', 'error',
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-i', song.preview,
            '-analyzeduration', '0',
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1'
          ]);

          ffmpegProcess.stderr.on('data', (data) => {
            const errorMsg = data.toString();
            console.error(`[MUSIC] FFmpeg Spotify stderr for "${song.title}": ${errorMsg}`);
            logger.warn('FFmpeg Spotify stderr', {
              guildId,
              songTitle: song.title,
              error: errorMsg
            });
          });

          ffmpegProcess.on('close', (code) => {
            console.log(`[MUSIC] FFmpeg Spotify process exited with code ${code} for "${song.title}"`);
            logger.info('FFmpeg Spotify process exited', {
              guildId,
              songTitle: song.title,
              exitCode: code
            });
          });

          const resource = createAudioResource(ffmpegProcess.stdout, {
            inputType: StreamType.Raw,
            inlineVolume: true
          });

          resource.volume.setVolume(currentVolume);
          logger.debug(`About to play resource for Spotify song: ${song.title}`);
          player.play(resource);

          return { success: true };
        } else {
          // No preview available, try to find YouTube version as fallback
          console.log(`[MUSIC] No Spotify preview available for "${song.title}", attempting YouTube fallback`);
          logger.info('No Spotify preview, attempting YouTube fallback', {
            guildId,
            songTitle: song.title,
            artist: song.artist
          });
          const fallbackQuery = `${song.title} ${song.artist}`;
          const fallbackResults = await this.searchSongs(fallbackQuery, 1);

          if (fallbackResults.length > 0 && fallbackResults[0].source === 'youtube') {
            const youtubeSong = fallbackResults[0];
            youtubeSong.isFallback = true;
            logger.info('Using YouTube fallback for Spotify song', {
              guildId,
              originalSong: song.title,
              fallbackSong: youtubeSong.title,
              fallbackUrl: youtubeSong.url
            });
            return this.playWithErrorHandling(guildId, voiceChannel, youtubeSong, player, connection);
          }

          logger.error('No YouTube fallback available for Spotify song', {
            guildId,
            songTitle: song.title,
            fallbackResultsCount: fallbackResults.length
          });
          return {
            success: false,
            error: 'No preview available for this Spotify track',
            errorType: 'no_preview'
          };
        }
      } catch (streamError) {
        console.error(`[MUSIC] Spotify stream error for "${song.title}":`, streamError.message);
        logger.error('Spotify stream creation failed', {
          guildId,
          songTitle: song.title,
          error: streamError.message,
          stack: streamError.stack
        });
        return {
          success: false,
          error: `Failed to play Spotify track: ${streamError.message}`,
          errorType: 'spotify_stream'
        };
      }
    } else if (song.source === 'deezer') {
      // For Deezer tracks, try to use preview URL if available, fallback to test audio
      let streamUrl;
      if (song.preview) {
        streamUrl = song.preview;
        logger.debug(`Using Deezer preview URL: ${streamUrl}`, {
          guildId,
          songTitle: song.title
        });
      } else {
        streamUrl = 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav';
        logger.debug(`Stream URL for Deezer (TEST MODE - no preview): ${streamUrl}`, {
          guildId,
          songTitle: song.title
        });
        logger.warn('Using test audio URL for Deezer (no preview available)', {
          guildId,
          songTitle: song.title,
          streamUrl
        });
      }

      console.log(`[MUSIC] Creating direct stream for Deezer: ${song.title}`);
      try {
        logger.debug('Spawning FFmpeg for Deezer test audio', {
          guildId,
          songTitle: song.title,
          streamUrl
        });
        const ffmpegArgs = [
          '-hide_banner',
          '-loglevel', 'error',
          '-reconnect', '1',
          '-reconnect_streamed', '1',
          '-reconnect_delay_max', '5',
          '-i', streamUrl,
          '-analyzeduration', '0',
          '-f', 's16le',
          '-ar', '48000',
          '-ac', '2',
          'pipe:1'
        ];

        logger.debug('Spawning FFmpeg for Deezer with args', {
          guildId,
          songTitle: song.title,
          streamUrl,
          ffmpegArgs
        });

        const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

        ffmpegProcess.stderr.on('data', (data) => {
          const errorMsg = data.toString();
          console.error(`[MUSIC] FFmpeg Deezer stderr for "${song.title}": ${errorMsg}`);
          logger.warn('FFmpeg Deezer stderr', {
            guildId,
            songTitle: song.title,
            error: errorMsg,
            ffmpegPath: ffmpegPath
          });
        });

        ffmpegProcess.on('close', (code) => {
          console.log(`[MUSIC] FFmpeg Deezer process exited with code ${code} for "${song.title}"`);
          logger.info('FFmpeg Deezer process exited', {
            guildId,
            songTitle: song.title,
            exitCode: code
          });
        });

        const resource = createAudioResource(ffmpegProcess.stdout, {
          inputType: StreamType.Raw,
          inlineVolume: true
        });

        resource.volume.setVolume(currentVolume);
        logger.debug(`About to play resource for Deezer song: ${song.title}`);
        player.play(resource);

        return { success: true };

      } catch (streamError) {
        console.error(`[MUSIC] Deezer stream error for "${song.title}":`, streamError.message);
        logger.error('Deezer stream creation failed', {
          guildId,
          songTitle: song.title,
          error: streamError.message,
          stack: streamError.stack,
          streamUrl,
          ffmpegPath: ffmpegPath
        });

        // If preview URL failed, try fallback to test audio
        if (song.preview && streamUrl === song.preview) {
          logger.info('Deezer preview failed, trying fallback test audio', {
            guildId,
            songTitle: song.title
          });
          const fallbackSong = { ...song, preview: null };
          return this.playWithErrorHandling(guildId, voiceChannel, fallbackSong, player, connection);
        }

        return {
          success: false,
          error: `Failed to play Deezer track: ${streamError.message}`,
          errorType: 'deezer_stream'
        };
      }
    } else if (ytdl.validateURL(song.url)) {
      console.log(`[MUSIC] Creating ytdl stream for YouTube URL: ${song.title}`);
      logger.debug(`Stream URL for YouTube: ${song.url}`);
      logger.info('Starting YouTube stream creation', {
        guildId,
        songTitle: song.title,
        songUrl: song.url,
        timestamp: new Date().toISOString()
      });

      try {
        logger.debug('Creating ytdl stream', {
          guildId,
          songTitle: song.title,
          ffmpegPath: ffmpegPath,
          ffmpegExists: existsSync(ffmpegPath),
          options: {
            filter: 'audioonly',
            highWaterMark: 1 << 62,
            dlChunkSize: 0,
            bitrate: 128,
            quality: 'lowestaudio'
          },
          timestamp: new Date().toISOString()
        });

        // Check for FFmpeg availability before attempting stream
        if (!existsSync(ffmpegPath)) {
          logger.error('FFmpeg binary not found', {
            guildId,
            songTitle: song.title,
            ffmpegPath: ffmpegPath,
            resolvedPath: path.resolve(ffmpegPath),
            timestamp: new Date().toISOString()
          });
          return {
            success: false,
            error: `FFmpeg binary not found at ${ffmpegPath}`,
            errorType: 'ffmpeg_missing'
          };
        }

        const ytdlStream = ytdl(song.url, {
           filter: 'audioonly',
           highWaterMark: 1 << 62,
           dlChunkSize: 0,
           bitrate: 128,
           quality: 'lowestaudio',
           requestOptions: {
             headers: {
               'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
               'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
               'Accept-Language': 'en-US,en;q=0.9',
               'Accept-Encoding': 'gzip, deflate, br',
               'Cache-Control': 'max-age=0',
               'Connection': 'keep-alive',
               'Sec-Fetch-Dest': 'document',
               'Sec-Fetch-Mode': 'navigate',
               'Sec-Fetch-Site': 'none',
               'Sec-Fetch-User': '?1',
               'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
               'Sec-Ch-Ua-Mobile': '?0',
               'Sec-Ch-Ua-Platform': '"Windows"',
               'Upgrade-Insecure-Requests': '1'
             }
           }
         });

        // Set up comprehensive error handling for ytdl stream
        let streamError = null;
        let streamStartTime = Date.now();

        ytdlStream.on('error', (error) => {
          const errorDuration = Date.now() - streamStartTime;
          console.error(`[MUSIC] YTDL stream error for "${song.title}" after ${errorDuration}ms:`, error);
          logger.error('YTDL stream error', {
            guildId,
            songTitle: song.title,
            error: error.message,
            stack: error.stack,
            errorDuration,
            timestamp: new Date().toISOString()
          });
          streamError = error;
        });

        ytdlStream.on('info', (info) => {
          logger.debug('YTDL stream info received', {
            guildId,
            songTitle: song.title,
            videoId: info.videoDetails.videoId,
            duration: info.videoDetails.lengthSeconds
          });
        });

        // Transcode to Opus using ffmpeg
         logger.debug('Spawning FFmpeg for YouTube audio transcoding', {
           guildId,
           songTitle: song.title,
           ffmpegPath: ffmpegPath,
           ffmpegExists: existsSync(ffmpegPath),
           ffmpegArgs: [
             '-hide_banner',
             '-loglevel', 'error',
             '-analyzeduration', '0',
             '-i', 'pipe:0',
             '-f', 's16le',
             '-ar', '48000',
             '-ac', '2',
             'pipe:1'
           ]
         });
         const ffmpegProcess = spawn(ffmpegPath, [
           '-hide_banner',
           '-loglevel', 'error',
           '-analyzeduration', '0',
           '-i', 'pipe:0',
           '-f', 's16le',
           '-ar', '48000',
           '-ac', '2',
           'pipe:1'
         ]);

        // Handle ffmpeg process errors
        ffmpegProcess.stderr.on('data', (data) => {
          const errorMsg = data.toString();
          console.error(`[MUSIC] FFmpeg stderr for "${song.title}": ${errorMsg}`);

          // Check for specific error patterns
          if (errorMsg.includes('410') || errorMsg.includes('404') || errorMsg.includes('Video unavailable')) {
            console.error(`[MUSIC] Video became unavailable during playback: ${song.title}`);
            logger.error('Video became unavailable during playback', {
              guildId,
              songTitle: song.title,
              errorMsg
            });
          } else if (errorMsg.includes('No such file or directory')) {
            logger.error('FFmpeg binary not found', {
              guildId,
              songTitle: song.title,
              ffmpegPath: ffmpeg,
              errorMsg
            });
          } else if (errorMsg.includes('Permission denied')) {
            logger.error('FFmpeg permission denied', {
              guildId,
              songTitle: song.title,
              ffmpegPath: ffmpeg,
              errorMsg
            });
          } else {
            logger.warn('FFmpeg stderr output', {
              guildId,
              songTitle: song.title,
              errorMsg
            });
          }
        });

        ffmpegProcess.on('error', (error) => {
          console.error(`[MUSIC] FFmpeg process error for "${song.title}":`, error);
          logger.error('FFmpeg process error', {
            guildId,
            songTitle: song.title,
            error: error.message,
            stack: error.stack,
            ffmpegPath: ffmpegPath,
            ffmpegExists: existsSync(ffmpegPath),
            errorCode: error.code
          });
          streamError = error;
        });

        ffmpegProcess.on('close', (code) => {
          console.log(`[MUSIC] FFmpeg process exited with code ${code} for "${song.title}"`);
          logger.info('FFmpeg process exited', {
            guildId,
            songTitle: song.title,
            exitCode: code,
            hadError: !!streamError
          });
          if (code !== 0 && streamError) {
            console.error(`[MUSIC] FFmpeg failed for "${song.title}":`, streamError.message);
          }
        });

        // Pipe ytdl stream to ffmpeg
        logger.debug('Piping ytdl stream to ffmpeg', {
          guildId,
          songTitle: song.title
        });
        ytdlStream.pipe(ffmpegProcess.stdin);

        // Handle ytdl stream events
        ytdlStream.on('error', (err) => {
          console.error(`[MUSIC] YTDL stream error during piping for "${song.title}":`, err);
          logger.error('YTDL stream error during piping', {
            guildId,
            songTitle: song.title,
            error: err.message
          });
        });

        ffmpegProcess.stdin.on('error', (err) => {
          console.error(`[MUSIC] FFmpeg stdin error for "${song.title}":`, err);
          logger.error('FFmpeg stdin pipe error', {
            guildId,
            songTitle: song.title,
            error: err.message,
            ffmpegPath: ffmpegPath
          });
        });

        // Handle successful piping
        ffmpegProcess.stdin.on('finish', () => {
          logger.debug('Successfully piped ytdl stream to ffmpeg', {
            guildId,
            songTitle: song.title
          });
        });

        // Monitor stream flow
        let bytesReceived = 0;
        ytdlStream.on('data', (chunk) => {
          bytesReceived += chunk.length;
          if (bytesReceived % (1024 * 1024) === 0) { // Log every 1MB
            logger.debug('YTDL stream progress', {
              guildId,
              songTitle: song.title,
              bytesReceived: `${(bytesReceived / (1024 * 1024)).toFixed(2)}MB`
            });
          }
        });

        const resource = createAudioResource(ffmpegProcess.stdout, {
          inputType: StreamType.Raw,
          inlineVolume: true
        });

        resource.volume.setVolume(currentVolume);
        logger.debug(`About to play resource for YouTube song: ${song.title}`, {
          guildId,
          songTitle: song.title,
          volume: currentVolume,
          timestamp: new Date().toISOString()
        });
        logger.info('Starting YouTube audio playback', {
          guildId,
          songTitle: song.title,
          volume: currentVolume,
          ffmpegPath: ffmpegPath,
          timestamp: new Date().toISOString()
        });

        // Add timeout for playback start
        const playbackTimeout = setTimeout(() => {
          logger.warn('YouTube playback start timeout', {
            guildId,
            songTitle: song.title,
            timeout: 30000,
            timestamp: new Date().toISOString()
          });
        }, 30000);

        player.once(AudioPlayerStatus.Playing, () => {
          clearTimeout(playbackTimeout);
          const playbackStartTime = Date.now() - startTime;
          logger.info('YouTube playback successfully started', {
            guildId,
            songTitle: song.title,
            startupTime: playbackStartTime,
            timestamp: new Date().toISOString()
          });
        });

        // Add error handler for playback timeout
        const timeoutId = setTimeout(() => {
          logger.error('YouTube playback timeout exceeded', {
            guildId,
            songTitle: song.title,
            timeoutDuration: 30000,
            timestamp: new Date().toISOString()
          });
          // Stop the player to prevent hanging
          player.stop(true);
        }, 30000);

        player.once(AudioPlayerStatus.Playing, () => {
          clearTimeout(timeoutId);
        });

        player.play(resource);

        return { success: true };

      } catch (streamError) {
        const errorDuration = Date.now() - startTime;
        console.error(`[MUSIC] Stream creation error for "${song.title}" after ${errorDuration}ms:`, streamError.message);
        logger.error('YouTube stream creation failed', {
          guildId,
          songTitle: song.title,
          error: streamError.message,
          stack: streamError.stack,
          ffmpegPath: ffmpegPath,
          ffmpegAccessible: existsSync(ffmpegPath),
          errorDuration,
          timestamp: new Date().toISOString()
        });

        // Check if it's an FFmpeg issue
        if (streamError.message.includes('spawn') || streamError.message.includes('ENOENT')) {
          logger.error('FFmpeg spawn/access issue detected', {
            guildId,
            songTitle: song.title,
            ffmpegPath: ffmpegPath,
            resolvedPath: path.resolve(ffmpegPath),
            ffmpegExists: existsSync(ffmpegPath),
            errorCode: streamError.code,
            timestamp: new Date().toISOString()
          });
        }

        return {
          success: false,
          error: `Failed to create audio stream: ${streamError.message}`,
          errorType: 'stream_creation'
        };
      }
    } else {
      // For direct stream URLs (like radio)
      console.log(`[MUSIC] Creating direct stream for URL: ${song.title}`);
      logger.debug(`Stream URL for direct: ${song.url}`);
      logger.info('Starting direct stream creation', {
        guildId,
        songTitle: song.title,
        songUrl: song.url
      });

      try {
        // Use alternative FFmpeg arguments if this is a retry attempt
        const useAlternativeArgs = song.retryAttempted;
        const ffmpegArgs = useAlternativeArgs ? [
          '-hide_banner',
          '-loglevel', 'error',
          '-reconnect', '1',
          '-reconnect_streamed', '1',
          '-reconnect_delay_max', '5',
          '-i', song.url,
          '-c:a', 'libmp3lame',
          '-f', 'mp3',
          'pipe:1'
        ] : [
          '-hide_banner',
          '-loglevel', 'error',
          '-reconnect', '1',
          '-reconnect_streamed', '1',
          '-reconnect_delay_max', '5',
          '-i', song.url,
          '-analyzeduration', '0',
          '-f', 's16le',
          '-ar', '48000',
          '-ac', '2',
          'pipe:1'
        ];

        logger.debug('Spawning FFmpeg for direct stream', {
          guildId,
          songTitle: song.title,
          streamUrl: song.url,
          useAlternativeArgs,
          ffmpegArgs
        });

        const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

        ffmpegProcess.stderr.on('data', (data) => {
          const errorMsg = data.toString();
          console.error(`[MUSIC] FFmpeg direct stderr for "${song.title}": ${errorMsg}`);

          // Check for specific error patterns
          if (errorMsg.includes('410') || errorMsg.includes('404') || errorMsg.includes('unavailable')) {
            console.error(`[MUSIC] Direct stream became unavailable: ${song.title}`);
            logger.error('Direct stream became unavailable', {
              guildId,
              songTitle: song.title,
              errorMsg,
              ffmpegPath: ffmpegPath
            });
          } else {
            logger.warn('FFmpeg direct stderr', {
              guildId,
              songTitle: song.title,
              errorMsg,
              ffmpegPath: ffmpegPath
            });
          }
        });

        ffmpegProcess.on('close', (code) => {
          console.log(`[MUSIC] FFmpeg direct process exited with code ${code} for "${song.title}"`);
          logger.info('FFmpeg direct process exited', {
            guildId,
            songTitle: song.title,
            exitCode: code
          });
        });

        const resource = createAudioResource(ffmpegProcess.stdout, {
          inputType: StreamType.Raw,
          inlineVolume: true
        });

        resource.volume.setVolume(currentVolume);
        logger.debug(`About to play resource for direct song: ${song.title}`);
        logger.info('Starting direct stream playback', {
          guildId,
          songTitle: song.title,
          volume: currentVolume
        });
        player.play(resource);

        return { success: true };

      } catch (streamError) {
        console.error(`[MUSIC] Direct stream error for "${song.title}":`, streamError.message);
        logger.error('Direct stream creation failed', {
          guildId,
          songTitle: song.title,
          error: streamError.message,
          stack: streamError.stack,
          streamUrl: song.url,
          ffmpegPath: ffmpegPath
        });

        // For direct streams, try alternative FFmpeg arguments if the first attempt fails
        if (!song.retryAttempted) {
          logger.info('Attempting direct stream with alternative FFmpeg arguments', {
            guildId,
            songTitle: song.title
          });
          const retrySong = { ...song, retryAttempted: true };
          return this.playWithErrorHandling(guildId, voiceChannel, retrySong, player, connection);
        }

        return {
          success: false,
          error: `Failed to play stream: ${streamError.message}`,
          errorType: 'direct_stream'
        };
      }
    }
  }

  // Real Music Playback with Voice Integration
  async play(guildId, voiceChannel, song) {
    console.log(`[MUSIC] Starting play for guild ${guildId}, song: ${song.title}`);
    logger.debug('Play initiated', {
      guildId,
      songTitle: song.title,
      songSource: song.source,
      songUrl: song.url,
      voiceChannelId: voiceChannel?.id,
      voiceChannelName: voiceChannel?.name
    });
    try {
      // Check if already connected to a voice channel
      const existingConnection = getVoiceConnection(guildId);
      let connection = existingConnection;
      console.log(`[MUSIC] Existing connection: ${connection ? connection.state.status : 'none'}`);
      logger.debug('Voice connection status', {
        guildId,
        existingConnection: !!existingConnection,
        connectionState: existingConnection?.state?.status || 'none'
      });

      if (!connection || connection.state.status === 'disconnected' || connection.state.status === 'destroyed') {
        console.log(`[MUSIC] Joining voice channel: ${voiceChannel.name}`);
        // Join voice channel
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
          selfDeaf: true,
          selfMute: false,
        });
        try {
          await entersState(connection, VoiceConnectionStatus.Ready, 5000);
        } catch (_) {}
        console.log(`[MUSIC] Joined voice channel, connection status: ${connection.state.status}`);
      } else if (connection.state.status === 'connecting') {
        // Wait a moment for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        const updatedConnection = getVoiceConnection(guildId);
        if (updatedConnection && updatedConnection.state.status === 'ready') {
          connection = updatedConnection;
        }
      }

      // Ensure connection stability
      if (!this.ensureConnectionStability(guildId)) {
        console.log(`[MUSIC] Connection unstable, attempting reconnection`);
        logger.warn('Connection instability detected, attempting reconnection', {
          guildId,
          voiceChannelId: voiceChannel.id,
          voiceChannelName: voiceChannel.name
        });
        connection = await this.reconnectToVoice(guildId, voiceChannel);
        if (!connection) {
          logger.error('Failed to establish stable voice connection', {
            guildId,
            voiceChannelId: voiceChannel.id,
            voiceChannelName: voiceChannel.name
          });
          return {
            success: false,
            error: 'Failed to establish stable voice connection',
            errorType: 'connection_failed'
          };
        }
      }

      // Create audio player if not exists
      let player = this.audioPlayers.get(guildId);
      if (!player) {
        logger.debug('Creating new audio player', { guildId });
        player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
        this.audioPlayers.set(guildId, player);

        connection.on('stateChange', (oldState, newState) => {
          console.log(`[MUSIC] Connection state change: ${oldState.status} -> ${newState.status}`);
          logger.info('Voice connection state change', {
            guildId,
            oldState: oldState.status,
            newState: newState.status
          });
        });

        player.on(AudioPlayerStatus.Idle, () => {
          console.log(`[MUSIC] Player idle for guild ${guildId}, playing next song`);
          logger.debug('Audio player idle, playing next song', { guildId });
          this.playNext(guildId);
        });

        player.on(AudioPlayerStatus.Playing, () => {
          console.log(`[MUSIC] Audio player is playing for guild ${guildId}`);
          logger.debug('Audio player started playing', { guildId });
        });

        player.on(AudioPlayerStatus.Buffering, () => {
          logger.debug('Audio player buffering', { guildId });
        });

        player.on(AudioPlayerStatus.AutoPaused, () => {
          logger.warn('Audio player auto-paused', { guildId });
        });

        player.on('error', error => {
          console.error(`[MUSIC] Audio player error for guild ${guildId}:`, error);
          logger.error('Audio player error', {
            guildId,
            error: error.message,
            resource: error.resource?.playbackDuration,
            stack: error.stack
          });
          this.handlePlaybackError(guildId, error);
        });

        // Subscribe to connection
        logger.debug('Subscribing audio player to voice connection', { guildId });
        connection.subscribe(player);
      }

      // Ensure subscription before each playback attempt (handles reconnections)
      try {
        connection.subscribe(player);
        logger.debug('Ensured audio player subscription', { guildId });
      } catch (subscriptionError) {
        logger.error('Failed to subscribe audio player to connection', {
          guildId,
          error: subscriptionError.message
        });
      }

      // Store voice channel info
      this.voiceChannels.set(guildId, {
        id: voiceChannel.id,
        name: voiceChannel.name,
        joinedAt: Date.now()
      });

      // Validate song URL before attempting playback
      logger.debug('Validating song URL before playback', {
        guildId,
        songTitle: song.title,
        songUrl: song.url,
        songSource: song.source
      });
      const validation = await this.validateSongUrl(song);
      if (!validation.valid) {
        console.error(`[MUSIC] Song validation failed for "${song.title}": ${validation.error}`);
        logger.error('Song validation failed', {
          guildId,
          songTitle: song.title,
          songUrl: song.url,
          songSource: song.source,
          validationError: validation.error,
          canFallback: validation.canFallback
        });

        if (validation.canFallback) {
          // Try fallback search
          try {
            const fallbackQuery = song.title + ' ' + song.artist;
            logger.debug('Attempting fallback search', {
              guildId,
              originalSong: song.title,
              fallbackQuery
            });
            const fallbackResults = await this.searchSongs(fallbackQuery, 1);
            if (fallbackResults.length > 0 && !fallbackResults[0].isFallback) {
              console.log(`[MUSIC] Using fallback song: ${fallbackResults[0].title}`);
              logger.info('Using fallback song', {
                guildId,
                originalSong: song.title,
                fallbackSong: fallbackResults[0].title,
                fallbackUrl: fallbackResults[0].url
              });
              song = fallbackResults[0];
            } else {
              logger.error('No suitable fallback found', {
                guildId,
                fallbackResultsCount: fallbackResults.length
              });
              return {
                success: false,
                error: `Video unavailable and no suitable fallback found. Original error: ${validation.error}`,
                errorType: 'validation_failed'
              };
            }
          } catch (fallbackError) {
            console.error('[MUSIC] Fallback search failed:', fallbackError.message);
            logger.error('Fallback search failed', {
              guildId,
              fallbackError: fallbackError.message,
              originalValidationError: validation.error
            });
            return {
              success: false,
              error: `Video unavailable: ${validation.error}`,
              errorType: 'validation_failed'
            };
          }
        } else {
          logger.error('Song validation failed with no fallback possible', {
            guildId,
            songTitle: song.title,
            validationError: validation.error
          });
          return {
            success: false,
            error: `Video unavailable: ${validation.error}`,
            errorType: 'validation_failed'
          };
        }
      } else {
        logger.debug('Song validation successful', {
          guildId,
          songTitle: song.title,
          hasPreview: validation.hasPreview
        });
      }

      // Set currently playing
      logger.debug('Setting currently playing song', { guildId, songTitle: song.title, duration: song.duration });
      this.currentlyPlaying.set(guildId, {
        ...song,
        startedAt: Date.now(),
        status: 'playing',
        totalPaused: 0,
        pausedAt: null
      });

      // Mark as playing
      this.isPlaying.set(guildId, true);

      // Update last activity timestamp
      const settings = this.musicSettings.get(guildId) || {};
      settings.lastActivity = Date.now();
      this.musicSettings.set(guildId, settings);

      // Attempt playback with enhanced error handling
      logger.debug('Attempting playback with error handling', {
        guildId,
        songTitle: song.title,
        songUrl: song.url,
        songSource: song.source
      });
      const playResult = await this.playWithErrorHandling(guildId, voiceChannel, song, player, connection);

      if (playResult.success) {
        console.log(`[MUSIC] Play successful for guild ${guildId}, song: ${song.title}`);
        logger.info('Playback successful', {
          guildId,
          songTitle: song.title,
          songSource: song.source,
          audioPlayerStatus: player.state.status,
          voiceConnectionState: connection.state.status
        });
        return { success: true, song };
      } else {
        // Handle playback failure
        logger.error('Playback failed in playWithErrorHandling', {
          guildId,
          songTitle: song.title,
          error: playResult.error,
          errorType: playResult.errorType
        });
        return this.handlePlaybackError(guildId, new Error(playResult.error), playResult.errorType);
      }

    } catch (error) {
      console.error(`[MUSIC] Play music error for guild ${guildId}:`, error);
      logger.error('Unexpected error in play method', {
        guildId,
        songTitle: song.title,
        error: error.message,
        stack: error.stack,
        voiceConnectionState: getVoiceConnection(guildId)?.state?.status || 'unknown'
      });
      return this.handlePlaybackError(guildId, error);
    }
  }

  // Enhanced error handling and recovery
  handlePlaybackError(guildId, error, errorType = 'unknown') {
    console.error(`[MUSIC] Handling playback error for guild ${guildId}:`, error.message);
    logger.error('Handling playback error', {
      guildId,
      error: error.message,
      errorType,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Log detailed error information
    const errorDetails = {
      guildId,
      error: error.message,
      errorType,
      timestamp: new Date().toISOString(),
      connectionStatus: getVoiceConnection(guildId)?.state?.status || 'no_connection',
      queueLength: this.getQueue(guildId).length,
      currentlyPlaying: this.currentlyPlaying.get(guildId)?.title || 'none',
      audioPlayerStatus: this.audioPlayers.get(guildId)?.state?.status || 'no_player'
    };

    console.error(`[MUSIC] Error details:`, JSON.stringify(errorDetails, null, 2));
    logger.error('Detailed playback error information', errorDetails);

    // Attempt to recover from FFmpeg issues
    if (error.message.includes('spawn') || error.message.includes('ENOENT') || errorType === 'stream_creation') {
      logger.warn('FFmpeg-related error detected, attempting recovery', {
        guildId,
        errorType,
        ffmpegPath: ffmpegPath
      });

      // Try to restart the player and connection
      const player = this.audioPlayers.get(guildId);
      const connection = getVoiceConnection(guildId);

      if (player && connection) {
        try {
          // Reset player state
          player.stop(true);
          // Re-subscribe connection
          connection.subscribe(player);
          logger.info('Player and connection reset for recovery', { guildId });
        } catch (resetError) {
          logger.error('Failed to reset player/connection', {
            guildId,
            resetError: resetError.message
          });
        }
      }
    }

    // Check if we should skip to next song
    const queue = this.getQueue(guildId);
    if (queue.length > 0) {
      console.log(`[MUSIC] Skipping to next song in queue due to error`);
      logger.info('Skipping to next song due to playback error', {
        guildId,
        errorType,
        queueLength: queue.length
      });
      // The player's error event handler will trigger playNext automatically
      return {
        success: false,
        error: `Playback failed: ${error.message}. Skipping to next song.`,
        errorType: 'skipped_to_next'
      };
    } else {
      console.log(`[MUSIC] No songs in queue, stopping playback`);
      logger.info('Stopping playback due to error with no queue', {
        guildId,
        errorType
      });
      this.stop(guildId);
      return {
        success: false,
        error: `Playback failed: ${error.message}. No more songs in queue.`,
        errorType: 'stopped'
      };
    }
  }

  // Voice connection stability management
  ensureConnectionStability(guildId) {
    const connection = getVoiceConnection(guildId);
    if (!connection) {
      console.log(`[MUSIC] No voice connection found for guild ${guildId}`);
      logger.warn('No voice connection found', { guildId });
      return false;
    }

    const connectionState = connection.state.status;
    console.log(`[MUSIC] Connection status for guild ${guildId}: ${connectionState}`);
    logger.debug('Voice connection stability check', {
      guildId,
      connectionState,
      connectionDestroyed: connection.state.status === 'destroyed',
      connectionDisconnected: connection.state.status === 'disconnected'
    });

    // Check if connection is in a problematic state
    if (connectionState === 'disconnected' || connectionState === 'destroyed') {
      console.log(`[MUSIC] Connection is ${connectionState}, attempting recovery`);
      logger.warn('Voice connection in problematic state', {
        guildId,
        connectionState,
        needsRecovery: true
      });
      return false;
    }

    // Check if connection is ready
    if (connectionState === 'ready') {
      console.log(`[MUSIC] Connection is stable for guild ${guildId}`);
      logger.debug('Voice connection is stable', { guildId });
      return true;
    }

    // For connecting state, wait a bit and check again
    if (connectionState === 'connecting') {
      console.log(`[MUSIC] Connection is still connecting for guild ${guildId}`);
      logger.debug('Voice connection still connecting', { guildId });
      return true; // Assume it's okay for now
    }

    console.log(`[MUSIC] Unknown connection state for guild ${guildId}: ${connectionState}`);
    logger.warn('Unknown voice connection state', {
      guildId,
      connectionState
    });
    return false;
  }

  // Reconnect to voice channel if needed
  async reconnectToVoice(guildId, voiceChannel) {
    console.log(`[MUSIC] Attempting to reconnect to voice channel for guild ${guildId}`);
    logger.info('Attempting voice channel reconnection', {
      guildId,
      voiceChannelId: voiceChannel.id,
      voiceChannelName: voiceChannel.name
    });

    try {
      const connection = getVoiceConnection(guildId);
      if (connection) {
        logger.debug('Destroying existing connection before reconnect', { guildId });
        connection.destroy();
      }

      // Wait a moment before reconnecting
      logger.debug('Waiting before reconnection attempt', { guildId, delay: 1000 });
      await new Promise(resolve => setTimeout(resolve, 1000));

      logger.debug('Joining voice channel for reconnection', {
        guildId,
        channelId: voiceChannel.id,
        adapterCreator: !!voiceChannel.adapterCreator || !!voiceChannel.guild?.voiceAdapterCreator
      });
      const newConnection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.adapterCreator || voiceChannel.guild?.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });

      try {
        logger.debug('Waiting for connection to reach ready state', {
          guildId,
          timeout: 5000
        });
        await entersState(newConnection, VoiceConnectionStatus.Ready, 5000);
        console.log(`[MUSIC] Successfully reconnected to voice channel: ${voiceChannel.name}`);
        logger.info('Voice channel reconnection successful', {
          guildId,
          voiceChannelName: voiceChannel.name
        });
        return newConnection;
      } catch (stateError) {
        console.error(`[MUSIC] Failed to reach ready state after reconnection:`, stateError.message);
        logger.error('Failed to reach ready state after reconnection', {
          guildId,
          voiceChannelName: voiceChannel.name,
          error: stateError.message
        });
        newConnection.destroy();
        return null;
      }
    } catch (error) {
      console.error(`[MUSIC] Failed to reconnect to voice channel:`, error);
      logger.error('Voice channel reconnection failed', {
        guildId,
        voiceChannelId: voiceChannel.id,
        error: error.message,
        stack: error.stack
      });

      // Try alternative reconnection method
      try {
        logger.info('Attempting alternative reconnection method', { guildId });
        const altConnection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: voiceChannel.adapterCreator || voiceChannel.guild?.voiceAdapterCreator,
          selfDeaf: false, // Try without selfDeaf first
          selfMute: false,
        });

        await entersState(altConnection, VoiceConnectionStatus.Ready, 3000); // Shorter timeout
        logger.info('Alternative reconnection successful', { guildId });
        return altConnection;
      } catch (altError) {
        logger.error('Alternative reconnection also failed', {
          guildId,
          error: altError.message
        });
      }

      return null;
    }
  }


  // Simplified Music Controls
  pause(guildId) {
    logger.debug('Attempting to pause music', { guildId });
    const isPlaying = this.isPlaying.get(guildId);
    if (!isPlaying) {
      logger.debug('Cannot pause - nothing is playing', { guildId });
      return false;
    }

    const current = this.currentlyPlaying.get(guildId);
    if (current) {
      current.status = 'paused';
      current.pausedAt = Date.now();
      logger.info('Song paused', {
        guildId,
        songTitle: current.title,
        pausedAt: current.pausedAt
      });
    }

    this.isPlaying.set(guildId, false);

    // Pause the audio player
    const player = this.audioPlayers.get(guildId);
    if (player) {
      try {
        player.pause();
        logger.debug('Audio player paused successfully', { guildId });
      } catch (error) {
        logger.error('Failed to pause audio player', {
          guildId,
          error: error.message
        });
        return false;
      }
    } else {
      logger.warn('No audio player found to pause', { guildId });
      return false;
    }

    return true;
  }

  resume(guildId) {
    logger.debug('Attempting to resume music', { guildId });
    const current = this.currentlyPlaying.get(guildId);
    if (!current || current.status !== 'paused') {
      logger.debug('Cannot resume - nothing is paused', { guildId });
      return false;
    }

    if (current.pausedAt) {
      current.totalPaused += (Date.now() - current.pausedAt);
      current.pausedAt = null;
      logger.debug('Updated pause timing', {
        guildId,
        totalPaused: current.totalPaused
      });
    }
    current.status = 'playing';
    this.isPlaying.set(guildId, true);
    logger.info('Song resumed', {
      guildId,
      songTitle: current.title
    });

    // Resume the audio player
    const player = this.audioPlayers.get(guildId);
    if (player) {
      try {
        player.unpause();
        logger.debug('Audio player resumed successfully', { guildId });
      } catch (error) {
        logger.error('Failed to resume audio player', {
          guildId,
          error: error.message
        });
        return false;
      }
    } else {
      logger.warn('No audio player found to resume', { guildId });
      return false;
    }

    return true;
  }

  skip(guildId) {
    const currentSong = this.currentlyPlaying.get(guildId);
    if (currentSong) {
      this.addToHistory(guildId, currentSong);
    }

    const queue = this.getQueue(guildId);
    if (queue.length === 0) return false;

    const nextSong = queue.shift();
    this.currentlyPlaying.set(guildId, {
      ...nextSong,
      startedAt: Date.now(),
      status: 'playing'
    });

    // Play the next song using enhanced error handling
    const player = this.audioPlayers.get(guildId);
    if (player) {
      const connection = getVoiceConnection(guildId);
      if (connection) {
        this.playWithErrorHandling(guildId, null, nextSong, player, connection)
          .then(result => {
            if (!result.success) {
              console.error(`[MUSIC] Failed to skip to song "${nextSong.title}":`, result.error);
              // Try to play next available song
              this.playNext(guildId);
            }
          })
          .catch(error => {
            console.error(`[MUSIC] Unexpected error skipping to song:`, error);
            this.playNext(guildId);
          });
      } else {
        console.error(`[MUSIC] No voice connection available for skip`);
        return false;
      }
    }

    return nextSong;
  }

  stop(guildId) {
    const connection = getVoiceConnection(guildId);
    if (connection) {
      connection.destroy();
    }
    const player = this.audioPlayers.get(guildId);
    if (player) {
      player.stop();
      this.audioPlayers.delete(guildId);
    }
    this.currentlyPlaying.delete(guildId);
    this.clearQueue(guildId);
    this.isPlaying.delete(guildId);
    this.voiceChannels.delete(guildId);

    return true;
  }

  playNext(guildId) {
    const currentSong = this.currentlyPlaying.get(guildId);
    if (currentSong) {
      this.addToHistory(guildId, currentSong);
    }

    const queue = this.getQueue(guildId);
    const loopMode = this.getLoop(guildId);

    let nextSong;
    if (loopMode === 'single' && currentSong) {
      nextSong = currentSong;
    } else if (queue.length === 0) {
      if (loopMode === 'queue' && currentSong) {
        // Add current back to queue and play it
        this.addToQueue(guildId, currentSong);
        nextSong = currentSong;
      } else {
        this.currentlyPlaying.delete(guildId);
        this.isPlaying.set(guildId, false);
        return false;
      }
    } else {
      nextSong = queue.shift();
      if (loopMode === 'queue' && currentSong) {
        this.addToQueue(guildId, currentSong);
      }
    }

    this.currentlyPlaying.set(guildId, {
      ...nextSong,
      startedAt: Date.now(),
      status: 'playing'
    });

    // Play the next song using enhanced error handling
    const player = this.audioPlayers.get(guildId);
    const connection = getVoiceConnection(guildId);

    if (player && connection) {
      this.playWithErrorHandling(guildId, null, nextSong, player, connection)
        .then(result => {
          if (!result.success) {
            console.error(`[MUSIC] Failed to play next song "${nextSong.title}":`, result.error);
            // Try to play the song after next
            setTimeout(() => this.playNext(guildId), 1000);
          }
        })
        .catch(error => {
          console.error(`[MUSIC] Unexpected error playing next song:`, error);
          // Try to play the song after next
          setTimeout(() => this.playNext(guildId), 1000);
        });
    } else {
      console.error(`[MUSIC] No player or connection available for playNext`);
      this.currentlyPlaying.delete(guildId);
      this.isPlaying.set(guildId, false);
      return false;
    }

    return nextSong;
  }

  async setVolume(guildId, volume) {
    const settings = this.musicSettings.get(guildId) || {};
    settings.volume = Math.max(0, Math.min(200, volume)); // Discord.js voice supports 0-200%
    this.musicSettings.set(guildId, settings);

    // Apply volume to current player if exists
    const player = this.audioPlayers.get(guildId);
    if (player && player.state.status === AudioPlayerStatus.Playing) {
      const currentSong = this.currentlyPlaying.get(guildId);
      if (currentSong) {
        try {
          // Use enhanced playback method with new volume
          const newVolume = settings.volume / 100;
          const connection = getVoiceConnection(guildId);

          if (connection) {
            const playResult = await this.playWithErrorHandling(guildId, null, currentSong, player, connection);
            if (playResult.success) {
              // Find the current resource and update its volume
              const resource = player.state.resource;
              if (resource && resource.volume) {
                resource.volume.setVolume(newVolume);
              }
            } else {
              console.error(`[MUSIC] Failed to update volume for "${currentSong.title}":`, playResult.error);
            }
          }
        } catch (error) {
          console.error(`[MUSIC] Error updating volume:`, error);
          // Don't fail the volume change, just log the error
        }
      }
    }

    return settings.volume;
  }

  getVolume(guildId) {
    return this.musicSettings.get(guildId)?.volume || 50;
  }

  setLoop(guildId, mode) {
    if (!['none', 'single', 'queue'].includes(mode)) return false;
    const settings = this.musicSettings.get(guildId) || {};
    settings.loop = mode;
    this.musicSettings.set(guildId, settings);
    return true;
  }

  getLoop(guildId) {
    return this.musicSettings.get(guildId)?.loop || 'none';
  }

  // Music Statistics
  getMusicStats(guildId) {
    const queue = this.getQueue(guildId);
    const current = this.currentlyPlaying.get(guildId);
    const settings = this.musicSettings.get(guildId);

    return {
      queueLength: queue.length,
      currentlyPlaying: current ? {
        title: current.title,
        artist: current.artist,
        duration: current.duration,
        progress: current.startedAt ? (Date.now() - current.startedAt) - (current.totalPaused || 0) : 0,
        status: current.status
      } : null,
      volume: settings?.volume || 50,
      playlists: settings?.playlists?.size || 0
    };
  }

  // Lyrics and Song Info
  async getLyrics(songTitle, artist) {
    try {
      // Use multiple lyrics APIs for better coverage
      const searchQuery = `${songTitle} ${artist}`.trim();

      // Try Genius API (lyrics.ovh uses this as backend)
      try {
        const response = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(songTitle)}`, { timeout: 5000 });
        if (response.data.lyrics) {
          return {
            title: songTitle,
            artist,
            lyrics: response.data.lyrics,
            source: 'Lyrics.ovh'
          };
        }
      } catch (apiError) {
        console.log('Lyrics.ovh API failed, trying alternative');
      }

      // Alternative: Return formatted message with search suggestion
      return {
        title: songTitle,
        artist,
        lyrics: `🎵 **Lyrics for "${songTitle}" by ${artist}**\n\n` +
                `Lyrics are not currently available for this song.\n\n` +
                `**To find lyrics, try:**\n` +
                `• 🎤 Search on Genius: https://genius.com/search?q=${encodeURIComponent(searchQuery)}\n` +
                `• 📝 Search on AZLyrics: https://www.azlyrics.com/lyrics/${encodeURIComponent(artist.toLowerCase())}/${encodeURIComponent(songTitle.toLowerCase())}.html\n` +
                `• 🎧 Use Spotify or YouTube Music for synced lyrics\n` +
                `• 📱 Check the official music video on YouTube\n\n` +
                `💡 *Full lyrics integration would require API keys from Genius, Musixmatch, or similar services*`,
        source: 'Search Suggestions',
        note: 'Consider upgrading to premium music services for synced lyrics'
      };
    } catch (error) {
      console.error('Lyrics fetch error:', error);
      return {
        title: songTitle,
        artist,
        lyrics: 'Lyrics not available. Please check Genius or AZLyrics for this song.',
        source: 'Error'
      };
    }
  }

  // Radio Stations
  getRadioStations() {
    return {
      'lofi_hip_hop': { name: 'Lo-fi Hip Hop', genre: 'Lo-fi', url: 'https://streams.ilovemusic.de/iloveradio17.mp3' },
      'electronic': { name: 'Electronic Beats', genre: 'Electronic', url: 'https://streams.radiomast.io/electronic-radio' },
      'rock_classics': { name: 'Rock Classics', genre: 'Rock', url: 'https://streams.radiomast.io/rock-radio' },
      'jazz': { name: 'Smooth Jazz', genre: 'Jazz', url: 'https://streams.radiomast.io/jazz-radio' },
      'classical': { name: 'Classical Music', genre: 'Classical', url: 'https://streams.radiomast.io/classical-radio' }
    };
  }

  // Music Recommendations
  getRecommendations(guildId, basedOnRecent = true) {
    const queue = this.getQueue(guildId);
    const current = this.currentlyPlaying.get(guildId);

    // Simple recommendation algorithm
    const genres = ['pop', 'rock', 'electronic', 'jazz', 'classical', 'hip-hop'];
    const recommendations = [];

    if (current && basedOnRecent) {
      // Recommend based on current song
      recommendations.push({
        title: `More ${current.genre || 'popular'} songs`,
        artist: 'Various Artists',
        reason: `Similar to "${current.title}"`
      });
    }

    // Add some variety
    for (let i = 0; i < 3; i++) {
      const randomGenre = genres[Math.floor(Math.random() * genres.length)];
      recommendations.push({
        title: `Popular ${randomGenre} songs`,
        artist: 'Various Artists',
        reason: `Discover ${randomGenre} music`
      });
    }

    return recommendations;
  }

  // Music Events and DJ Mode
  startDJMode(guildId, settings = {}) {
    const djSettings = {
      autoPlay: true,
      crossfade: true,
      requestChannel: null,
      maxRequestsPerUser: 3,
      ...settings
    };

    if (!this.musicSettings.has(guildId)) {
      this.musicSettings.set(guildId, {});
    }

    this.musicSettings.get(guildId).djMode = djSettings;
    return djSettings;
  }

  stopDJMode(guildId) {
    const settings = this.musicSettings.get(guildId);
    if (settings) {
      settings.djMode = null;
    }
    return true;
  }

  // Song Request System
  requestSong(guildId, userId, song) {
    const settings = this.musicSettings.get(guildId);
    if (!settings?.djMode) {
      return { success: false, reason: 'dj_mode_disabled' };
    }

    const queue = this.getQueue(guildId);
    const userRequests = queue.filter(s => s.requestedBy === userId);

    if (userRequests.length >= settings.djMode.maxRequestsPerUser) {
      return { success: false, reason: 'max_requests_reached' };
    }

    // Add the song request to the queue
    queue.push({ ...song, requestedBy: userId });
    return { success: true };
  }
}

// Export the music manager instance
export const musicManager = new MusicManager();

// Debug: Log initialization
logger.info('MusicManager initialized', {
  initializationTime: new Date().toISOString(),
  hasSpotifyCredentials: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
  hasYouTubeAccess: true, // ytdl-core always available
  hasDeezzerAccess: true, // axios available
  ffmpegStaticAvailable: !!ffmpeg,
  resolvedFfmpegPath: ffmpegPath,
  ffmpegPathExists: existsSync(ffmpegPath)
});

// Convenience functions for external use
export async function searchSongs(query, limit = 10) {
  return musicManager.searchSongs(query, limit);
}

export function addToQueue(guildId, song) {
  return musicManager.addToQueue(guildId, song);
}

export function getQueue(guildId) {
  return musicManager.getQueue(guildId);
}

export async function play(guildId, voiceChannel, song) {
  return musicManager.play(guildId, voiceChannel, song);
}

export async function pause(guildId) {
  return musicManager.pause(guildId);
}

export async function resume(guildId) {
  return musicManager.resume(guildId);
}

export async function skip(guildId) {
  return musicManager.skip(guildId);
}

export async function stop(guildId) {
  return musicManager.stop(guildId);
}

export async function setVolume(guildId, volume) {
  return await musicManager.setVolume(guildId, volume);
}

export function getVolume(guildId) {
  return musicManager.getVolume(guildId);
}

export function getMusicStats(guildId) {
  return musicManager.getMusicStats(guildId);
}

export async function getLyrics(songTitle, artist) {
  return musicManager.getLyrics(songTitle, artist);
}

export function getRadioStations() {
  return musicManager.getRadioStations();
}

export function getRecommendations(guildId, basedOnRecent = true) {
  return musicManager.getRecommendations(guildId, basedOnRecent);
}

export function createPlaylist(guildId, name, creatorId) {
  return musicManager.createPlaylist(guildId, name, creatorId);
}

export function addToPlaylist(guildId, playlistId, song) {
  return musicManager.addToPlaylist(guildId, playlistId, song);
}

export function getPlaylist(guildId, playlistId) {
  return musicManager.getPlaylist(guildId, playlistId);
}

export function shuffleQueue(guildId) {
  return musicManager.shuffleQueue(guildId);
}

export function clearQueue(guildId) {
  return musicManager.clearQueue(guildId);
}

export function back(guildId) {
  return musicManager.back(guildId);
}

export function addToHistory(guildId, song) {
  return musicManager.addToHistory(guildId, song);
}

export function getHistory(guildId) {
  return musicManager.getHistory(guildId);
}

export function setLoop(guildId, mode) {
  return musicManager.setLoop(guildId, mode);
}

export function getLoop(guildId) {
  return musicManager.getLoop(guildId);
}

export async function validateSongUrl(song) {
  return musicManager.validateSongUrl(song);
}

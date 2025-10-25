
import 'dotenv/config';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } from '@discordjs/voice';
import ytdl from 'ytdl-core';
import axios from 'axios';
import yts from 'yt-search';
import ffmpeg from 'ffmpeg-static';
import { spawn } from 'child_process';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Enhanced Music System with Real Audio Streaming
class MusicManager {
  constructor() {
    this.queue = new Map(); // guildId -> queue array
    this.currentlyPlaying = new Map(); // guildId -> current song
    this.musicSettings = new Map(); // guildId -> settings
    this.isPlaying = new Map(); // guildId -> boolean
    this.voiceChannels = new Map(); // guildId -> voice channel info
    this.audioPlayers = new Map(); // guildId -> audio player
    this.history = new Map(); // guildId -> history array
    // Rate limiter for Deezer API (100 requests per minute)
    this.rateLimiter = new RateLimiterMemory({
      keyPrefix: 'deezer_api',
      points: 100,
      duration: 60,
    });
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

  // Search and Discovery
  async searchSongs(query, limit = 10) {
    try {
      // Check if query is a Deezer URL
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

      // Check if query is a YouTube URL (fallback)
      if (ytdl.validateURL(query)) {
        try {
          const info = await ytdl.getInfo(query);
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
            source: 'youtube'
          }];
        } catch (urlError) {
          console.error(`[MUSIC] YouTube URL validation failed for ${query}:`, urlError.message);
          return [];
        }
      }

      // For text queries, try Deezer first
      try {
        await this.rateLimiter.consume('deezer_api');
        const response = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        if (response.data && response.data.data && response.data.data.length > 0) {
          const tracks = response.data.data.slice(0, limit);
          const results = tracks.map(track => ({
            title: track.title,
            artist: track.artist?.name || 'Unknown',
            duration: track.duration ? `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}` : 'Unknown',
            url: track.link,
            thumbnail: track.album?.cover_medium || '',
            source: 'deezer',
            preview: track.preview || null
          }));
          console.log(`[MUSIC] Deezer search successful for "${query}": ${results.length} results`);
          return results;
        }
      } catch (error) {
        if (error.message.includes('rate limit') || error.message.includes('Too Many Requests')) {
          console.error('[MUSIC] Deezer API rate limit exceeded:', error.message);
        } else {
          console.error('[MUSIC] Deezer search failed:', error.message);
        }
      }

      // Fallback to YouTube search
      try {
        const searchResults = await yts(query);
        const videos = searchResults.videos.slice(0, limit);

        const validVideos = [];
        for (const video of videos) {
          try {
            await ytdl.getInfo(video.url);
            validVideos.push({
              title: video.title,
              artist: video.author.name,
              duration: video.duration.timestamp,
              url: video.url,
              thumbnail: video.thumbnail,
              source: 'youtube'
            });
          } catch (videoError) {
            console.log(`[MUSIC] Skipping unavailable video: ${video.title} (${video.url}) - ${videoError.message}`);
          }
        }

        console.log(`[MUSIC] YouTube fallback search for "${query}": ${validVideos.length} results`);
        return validVideos;
      } catch (fallbackError) {
        console.error('[MUSIC] YouTube fallback search failed:', fallbackError.message);
        return [];
      }
    } catch (error) {
      console.error('Music search error:', error);
      return [];
    }
  }

  // Enhanced URL validation before playback
  async validateSongUrl(song) {
    if (song.source === 'deezer') {
      // For Deezer, check if track exists
      try {
        const trackId = song.url.match(/deezer\.com\/track\/(\d+)/)?.[1];
        if (trackId) {
          const response = await axios.get(`https://api.deezer.com/track/${trackId}`);
          if (response.data && response.data.title) {
            return { valid: true };
          }
        }
        throw new Error('Track not found');
      } catch (error) {
        console.error(`[MUSIC] Deezer URL validation failed for "${song.title}":`, error.message);
        return {
          valid: false,
          error: error.message,
          canFallback: true
        };
      }
    } else if (ytdl.validateURL(song.url)) {
      try {
        const info = await ytdl.getInfo(song.url);
        const video = info.videoDetails;

        // Check if video is available
        if (video.isPrivate || !video.title || video.title === 'Deleted video' || video.title === 'Private video') {
          throw new Error(`Video unavailable: ${video.title}`);
        }

        return { valid: true };
      } catch (error) {
        console.error(`[MUSIC] YouTube URL validation failed for "${song.title}":`, error.message);
        return {
          valid: false,
          error: error.message,
          canFallback: true
        };
      }
    }
    return { valid: true }; // Non-YouTube/Deezer URLs are assumed valid
  }

  // Enhanced playback with comprehensive error handling
  async playWithErrorHandling(guildId, voiceChannel, song, player, connection) {
    const currentVolume = this.getVolume(guildId) / 100;

    if (song.source === 'deezer') {
      // For Deezer tracks, use preview URL
      const streamUrl = song.preview;
      if (!streamUrl) {
        console.error(`[MUSIC] No preview URL available for Deezer track: ${song.title}`);
        return {
          success: false,
          error: 'No preview available for this track. Deezer previews are 30 seconds long.',
          errorType: 'no_preview'
        };
      }

      console.log(`[MUSIC] Creating direct stream for Deezer preview: ${song.title}`);
      try {
        const ffmpegProcess = spawn(ffmpeg, [
          '-i', streamUrl,
          '-f', 'opus',
          '-ar', '48000',
          '-ac', '2',
          'pipe:1'
        ]);

        ffmpegProcess.stderr.on('data', (data) => {
          const errorMsg = data.toString();
          console.error(`[MUSIC] FFmpeg Deezer stderr for "${song.title}": ${errorMsg}`);
        });

        ffmpegProcess.on('close', (code) => {
          console.log(`[MUSIC] FFmpeg Deezer process exited with code ${code} for "${song.title}"`);
        });

        const resource = createAudioResource(ffmpegProcess.stdout, {
          inputType: 'arbitrary',
          inlineVolume: true
        });

        resource.volume.setVolume(currentVolume);
        player.play(resource);

        return { success: true };

      } catch (streamError) {
        console.error(`[MUSIC] Deezer stream error for "${song.title}":`, streamError.message);
        return {
          success: false,
          error: `Failed to play Deezer preview: ${streamError.message}`,
          errorType: 'deezer_stream'
        };
      }
    } else if (ytdl.validateURL(song.url)) {
      console.log(`[MUSIC] Creating ytdl stream for YouTube URL: ${song.title}`);

      try {
        const ytdlStream = ytdl(song.url, {
          filter: 'audioonly',
          highWaterMark: 1 << 62,
          dlChunkSize: 0,
          bitrate: 128,
          quality: 'lowestaudio'
        });

        // Set up comprehensive error handling for ytdl stream
        let streamError = null;
        ytdlStream.on('error', (error) => {
          console.error(`[MUSIC] YTDL stream error for "${song.title}":`, error);
          streamError = error;
        });

        // Transcode to Opus using ffmpeg
        const ffmpegProcess = spawn(ffmpeg, [
          '-i', 'pipe:0',
          '-f', 'opus',
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
          }
        });

        ffmpegProcess.on('error', (error) => {
          console.error(`[MUSIC] FFmpeg process error for "${song.title}":`, error);
          streamError = error;
        });

        ffmpegProcess.on('close', (code) => {
          console.log(`[MUSIC] FFmpeg process exited with code ${code} for "${song.title}"`);
          if (code !== 0 && streamError) {
            console.error(`[MUSIC] FFmpeg failed for "${song.title}":`, streamError.message);
          }
        });

        // Pipe ytdl stream to ffmpeg
        ytdlStream.pipe(ffmpegProcess.stdin);
        ffmpegProcess.stdin.on('error', (err) => {
          console.error(`[MUSIC] FFmpeg stdin error for "${song.title}":`, err);
        });

        const resource = createAudioResource(ffmpegProcess.stdout, {
          inputType: 'arbitrary',
          inlineVolume: true
        });

        resource.volume.setVolume(currentVolume);
        player.play(resource);

        return { success: true };

      } catch (streamError) {
        console.error(`[MUSIC] Stream creation error for "${song.title}":`, streamError.message);
        return {
          success: false,
          error: `Failed to create audio stream: ${streamError.message}`,
          errorType: 'stream_creation'
        };
      }
    } else {
      // For direct stream URLs (like radio)
      console.log(`[MUSIC] Creating direct stream for URL: ${song.title}`);

      try {
        const ffmpegProcess = spawn(ffmpeg, [
          '-i', song.url,
          '-f', 'opus',
          '-ar', '48000',
          '-ac', '2',
          'pipe:1'
        ]);

        ffmpegProcess.stderr.on('data', (data) => {
          const errorMsg = data.toString();
          console.error(`[MUSIC] FFmpeg direct stderr for "${song.title}": ${errorMsg}`);

          // Check for specific error patterns
          if (errorMsg.includes('410') || errorMsg.includes('404') || errorMsg.includes('unavailable')) {
            console.error(`[MUSIC] Direct stream became unavailable: ${song.title}`);
          }
        });

        ffmpegProcess.on('close', (code) => {
          console.log(`[MUSIC] FFmpeg direct process exited with code ${code} for "${song.title}"`);
        });

        const resource = createAudioResource(ffmpegProcess.stdout, {
          inputType: 'arbitrary',
          inlineVolume: true
        });

        resource.volume.setVolume(currentVolume);
        player.play(resource);

        return { success: true };

      } catch (streamError) {
        console.error(`[MUSIC] Direct stream error for "${song.title}":`, streamError.message);
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
    try {
      // Check if already connected to a voice channel
      const existingConnection = getVoiceConnection(guildId);
      let connection = existingConnection;
      console.log(`[MUSIC] Existing connection: ${connection ? connection.state.status : 'none'}`);

      if (!connection || connection.state.status === 'disconnected' || connection.state.status === 'destroyed') {
        console.log(`[MUSIC] Joining voice channel: ${voiceChannel.name}`);
        // Join voice channel
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
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
        connection = await this.reconnectToVoice(guildId, voiceChannel);
        if (!connection) {
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
        player = createAudioPlayer();
        this.audioPlayers.set(guildId, player);

        connection.on('stateChange', (oldState, newState) => {
          console.log(`[MUSIC] Connection state change: ${oldState.status} -> ${newState.status}`);
        });

        player.on(AudioPlayerStatus.Idle, () => {
          console.log(`[MUSIC] Player idle for guild ${guildId}, playing next song`);
          this.playNext(guildId);
        });

        player.on(AudioPlayerStatus.Playing, () => {
          console.log(`[MUSIC] Audio player is playing for guild ${guildId}`);
        });

        player.on('error', error => {
          console.error(`[MUSIC] Audio player error for guild ${guildId}:`, error);
          this.handlePlaybackError(guildId, error);
        });

        // Subscribe to connection
        connection.subscribe(player);
      }

      // Store voice channel info
      this.voiceChannels.set(guildId, {
        id: voiceChannel.id,
        name: voiceChannel.name,
        joinedAt: Date.now()
      });

      // Validate song URL before attempting playback
      const validation = await this.validateSongUrl(song);
      if (!validation.valid) {
        console.error(`[MUSIC] Song validation failed for "${song.title}": ${validation.error}`);

        if (validation.canFallback) {
          // Try fallback search
          try {
            const fallbackQuery = song.title + ' ' + song.artist;
            const fallbackResults = await this.searchSongs(fallbackQuery, 1);
            if (fallbackResults.length > 0 && !fallbackResults[0].isFallback) {
              console.log(`[MUSIC] Using fallback song: ${fallbackResults[0].title}`);
              song = fallbackResults[0];
            } else {
              return {
                success: false,
                error: `Video unavailable and no suitable fallback found. Original error: ${validation.error}`,
                errorType: 'validation_failed'
              };
            }
          } catch (fallbackError) {
            console.error('[MUSIC] Fallback search failed:', fallbackError.message);
            return {
              success: false,
              error: `Video unavailable: ${validation.error}`,
              errorType: 'validation_failed'
            };
          }
        } else {
          return {
            success: false,
            error: `Video unavailable: ${validation.error}`,
            errorType: 'validation_failed'
          };
        }
      }

      // Set currently playing
      this.currentlyPlaying.set(guildId, {
        ...song,
        startedAt: Date.now(),
        status: 'playing',
        totalPaused: 0,
        pausedAt: null
      });

      // Mark as playing
      this.isPlaying.set(guildId, true);

      // Attempt playback with enhanced error handling
      const playResult = await this.playWithErrorHandling(guildId, voiceChannel, song, player, connection);

      if (playResult.success) {
        console.log(`[MUSIC] Play successful for guild ${guildId}, song: ${song.title}`);
        return { success: true, song };
      } else {
        // Handle playback failure
        return this.handlePlaybackError(guildId, new Error(playResult.error), playResult.errorType);
      }

    } catch (error) {
      console.error(`[MUSIC] Play music error for guild ${guildId}:`, error);
      return this.handlePlaybackError(guildId, error);
    }
  }

  // Enhanced error handling and recovery
  handlePlaybackError(guildId, error, errorType = 'unknown') {
    console.error(`[MUSIC] Handling playback error for guild ${guildId}:`, error.message);

    // Log detailed error information
    const errorDetails = {
      guildId,
      error: error.message,
      errorType,
      timestamp: new Date().toISOString(),
      connectionStatus: getVoiceConnection(guildId)?.state?.status || 'no_connection',
      queueLength: this.getQueue(guildId).length,
      currentlyPlaying: this.currentlyPlaying.get(guildId)?.title || 'none'
    };

    console.error(`[MUSIC] Error details:`, JSON.stringify(errorDetails, null, 2));

    // Check if we should skip to next song
    const queue = this.getQueue(guildId);
    if (queue.length > 0) {
      console.log(`[MUSIC] Skipping to next song in queue due to error`);
      // The player's error event handler will trigger playNext automatically
      return {
        success: false,
        error: `Playback failed: ${error.message}. Skipping to next song.`,
        errorType: 'skipped_to_next'
      };
    } else {
      console.log(`[MUSIC] No songs in queue, stopping playback`);
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
      return false;
    }

    const connectionState = connection.state.status;
    console.log(`[MUSIC] Connection status for guild ${guildId}: ${connectionState}`);

    // Check if connection is in a problematic state
    if (connectionState === 'disconnected' || connectionState === 'destroyed') {
      console.log(`[MUSIC] Connection is ${connectionState}, attempting recovery`);
      return false;
    }

    // Check if connection is ready
    if (connectionState === 'ready') {
      console.log(`[MUSIC] Connection is stable for guild ${guildId}`);
      return true;
    }

    // For connecting state, wait a bit and check again
    if (connectionState === 'connecting') {
      console.log(`[MUSIC] Connection is still connecting for guild ${guildId}`);
      return true; // Assume it's okay for now
    }

    console.log(`[MUSIC] Unknown connection state for guild ${guildId}: ${connectionState}`);
    return false;
  }

  // Reconnect to voice channel if needed
  async reconnectToVoice(guildId, voiceChannel) {
    console.log(`[MUSIC] Attempting to reconnect to voice channel for guild ${guildId}`);

    try {
      const connection = getVoiceConnection(guildId);
      if (connection) {
        connection.destroy();
      }

      // Wait a moment before reconnecting
      await new Promise(resolve => setTimeout(resolve, 1000));

      const newConnection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      console.log(`[MUSIC] Successfully reconnected to voice channel: ${voiceChannel.name}`);
      return newConnection;
    } catch (error) {
      console.error(`[MUSIC] Failed to reconnect to voice channel:`, error);
      return null;
    }
  }


  // Simplified Music Controls
  pause(guildId) {
    const isPlaying = this.isPlaying.get(guildId);
    if (!isPlaying) return false;

    const current = this.currentlyPlaying.get(guildId);
    if (current) {
      current.status = 'paused';
      current.pausedAt = Date.now();
    }

    this.isPlaying.set(guildId, false);

    // Pause the audio player
    const player = this.audioPlayers.get(guildId);
    if (player) {
      player.pause();
    }

    return true;
  }

  resume(guildId) {
    const current = this.currentlyPlaying.get(guildId);
    if (!current || current.status !== 'paused') return false;

    if (current.pausedAt) {
      current.totalPaused += (Date.now() - current.pausedAt);
      current.pausedAt = null;
    }
    current.status = 'playing';
    this.isPlaying.set(guildId, true);

    // Resume the audio player
    const player = this.audioPlayers.get(guildId);
    if (player) {
      player.unpause();
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

      // Alternative: Return formatted placeholder with search suggestion
      return {
        title: songTitle,
        artist,
        lyrics: `Lyrics for "${songTitle}" by ${artist} would be displayed here.\n\n` +
               `To get lyrics, you can:\n` +
               `• Search on Genius: https://genius.com/search?q=${encodeURIComponent(searchQuery)}\n` +
               `• Search on AZLyrics: https://www.azlyrics.com/lyrics/${encodeURIComponent(artist.toLowerCase())}/${encodeURIComponent(songTitle.toLowerCase())}.html\n` +
               `• Use Spotify or YouTube Music for synced lyrics`,
        source: 'Search Suggestions',
        note: 'Full lyrics integration requires API keys from Genius, Musixmatch, or similar services'
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

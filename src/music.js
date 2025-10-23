
import 'dotenv/config';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } from '@discordjs/voice';
import ytdl from 'ytdl-core';
import axios from 'axios';

// Enhanced Music System with Real Audio Streaming
class MusicManager {
  constructor() {
    this.queue = new Map(); // guildId -> queue array
    this.currentlyPlaying = new Map(); // guildId -> current song
    this.musicSettings = new Map(); // guildId -> settings
    this.isPlaying = new Map(); // guildId -> boolean
    this.voiceChannels = new Map(); // guildId -> voice channel info
    this.audioPlayers = new Map(); // guildId -> audio player
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
      // Check if query is a YouTube URL
      if (ytdl.validateURL(query)) {
        const info = await ytdl.getInfo(query);
        const video = info.videoDetails;
        return [{
          title: video.title,
          artist: video.author.name,
          duration: video.lengthSeconds ? `${Math.floor(video.lengthSeconds / 60)}:${(video.lengthSeconds % 60).toString().padStart(2, '0')}` : 'Unknown',
          url: query,
          thumbnail: video.thumbnails[0]?.url || ''
        }];
      }
      // For text queries, implement YouTube search (requires API key for full functionality)
      // For demo, return a placeholder with note
      return [{
        title: `Search for "${query}"`,
        artist: 'YouTube',
        duration: '3:45',
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        note: 'Real search requires YouTube Data API key'
      }];
    } catch (error) {
      console.error('Music search error:', error);
      return [];
    }
  }

  // Real Music Playback with Voice Integration
  async play(guildId, voiceChannel, song) {
    try {
      // Join voice channel
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      // Create audio player
      const player = createAudioPlayer();
      this.audioPlayers.set(guildId, player);

      connection.on('stateChange', (oldState, newState) => {
        console.log(`Connection state change: ${oldState.status} -> ${newState.status}`);
      });

      player.on(AudioPlayerStatus.Idle, () => {
        this.playNext(guildId);
      });

      player.on(AudioPlayerStatus.Playing, () => {
        console.log('Audio player is playing');
      });

      // Subscribe to connection
      connection.subscribe(player);

      // Store voice channel info
      this.voiceChannels.set(guildId, {
        id: voiceChannel.id,
        name: voiceChannel.name,
        joinedAt: Date.now()
      });

      // Set currently playing
      this.currentlyPlaying.set(guildId, {
        ...song,
        startedAt: Date.now(),
        status: 'playing'
      });
      
      // Mark as playing
      this.isPlaying.set(guildId, true);
      
      // Add to queue
      addToQueue(guildId, song);

      // Stream audio using ytdl-core if it's a YouTube URL
      if (ytdl.validateURL(song.url)) {
        const stream = ytdl(song.url, { filter: 'audioonly' });
        const resource = createAudioResource(stream, { inputType: 'arbitrary' });
        player.play(resource);
      } else {
        // For direct stream URLs (like radio)
        const stream = song.url;
        const resource = createAudioResource(stream, { inputType: 'arbitrary' });
        player.play(resource);
      }

      return { success: true, song };
    } catch (error) {
      console.error('Play music error:', error);
      return { success: false, error: error.message };
    }
  }


  // Simplified Music Controls
  pause(guildId) {
    const isPlaying = this.isPlaying.get(guildId);
    if (!isPlaying) return false;

    const current = this.currentlyPlaying.get(guildId);
    if (current) current.status = 'paused';

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
    const queue = this.getQueue(guildId);
    if (queue.length === 0) return false;

    const nextSong = queue.shift();
    this.currentlyPlaying.set(guildId, {
      ...nextSong,
      startedAt: Date.now(),
      status: 'playing'
    });

    // Play the next song using the existing player
    const player = this.audioPlayers.get(guildId);
    if (player) {
      if (ytdl.validateURL(nextSong.url)) {
        const stream = ytdl(nextSong.url, { filter: 'audioonly' });
        const resource = createAudioResource(stream, { inputType: 'arbitrary' });
        player.play(resource);
      } else {
        // For direct streams
        const resource = createAudioResource(nextSong.url, { inputType: 'arbitrary' });
        player.play(resource);
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
    const queue = this.getQueue(guildId);
    if (queue.length === 0) {
      this.currentlyPlaying.delete(guildId);
      this.isPlaying.set(guildId, false);
      return false;
    }

    const nextSong = queue.shift();
    this.currentlyPlaying.set(guildId, {
      ...nextSong,
      startedAt: Date.now(),
      status: 'playing'
    });
    
    // Play the next song using the existing player
    const player = this.audioPlayers.get(guildId);
    if (player) {
      const current = this.currentlyPlaying.get(guildId);
      if (nextSong.url !== current.url) {
        if (ytdl.validateURL(nextSong.url)) {
          const stream = ytdl(nextSong.url, { filter: 'audioonly' });
          const resource = createAudioResource(stream, { inputType: 'arbitrary' });
          player.play(resource);
        } else {
          // For direct streams
          const resource = createAudioResource(nextSong.url, { inputType: 'arbitrary' });
          player.play(resource);
        }
      }
    }

    return nextSong;
  }

  async setVolume(guildId, volume) {
    const settings = this.musicSettings.get(guildId) || {};
    settings.volume = Math.max(0, Math.min(200, volume)); // Discord.js voice supports 0-200%
    this.musicSettings.set(guildId, settings);

    // Apply volume to current player if exists
    const player = this.audioPlayers.get(guildId);
    if (player) {
      const resource = player.state.resource;
      if (resource && resource.volume) {
        resource.volume.setVolume(settings.volume / 100); // Convert to 0-1 scale
      }
    }

    return settings.volume;
  }

  getVolume(guildId) {
    return this.musicSettings.get(guildId)?.volume || 50;
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
        progress: current.startedAt ? Date.now() - current.startedAt : 0,
        status: current.status
      } : null,
      volume: settings?.volume || 50,
      playlists: settings?.playlists?.size || 0
    };
  }

  // Lyrics and Song Info
  async getLyrics(songTitle, artist) {
    try {
      // Use Lyrics.ovh API for real lyrics
      const response = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(songTitle)}`);
      if (response.data.lyrics) {
        return {
          title: songTitle,
          artist,
          lyrics: response.data.lyrics,
          source: 'Lyrics.ovh'
        };
      }
      return null;
    } catch (error) {
      console.error('Lyrics fetch error:', error);
      return null;
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

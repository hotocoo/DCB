
import 'dotenv/config';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { spawn } from 'child_process';

// Advanced Music System with Real Voice Integration
class MusicManager {
  constructor() {
    this.queue = new Map(); // guildId -> queue array
    this.currentlyPlaying = new Map(); // guildId -> current song
    this.voiceConnections = new Map(); // guildId -> voice connection
    this.audioPlayers = new Map(); // guildId -> audio player
    this.musicSettings = new Map(); // guildId -> settings
    this.downloadCache = new Map(); // URL -> local file path
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
  searchSongs(query, limit = 10) {
    try {
      // This would integrate with music APIs like Spotify, YouTube, SoundCloud
      // For now, return mock results
      const mockResults = [
        { title: `Song about ${query}`, artist: 'Demo Artist', duration: '3:45', url: 'demo://song1' },
        { title: `Another ${query} track`, artist: 'Another Artist', duration: '4:12', url: 'demo://song2' },
        { title: `${query} remix`, artist: 'Remix Artist', duration: '5:20', url: 'demo://song3' }
      ];

      return mockResults.slice(0, limit);
    } catch (error) {
      console.error('Music search error:', error);
      return [];
    }
  }

  // Real Music Controls with Discord.js Voice
  async play(guildId, voiceChannel, song) {
    try {
      // Join voice channel if not already connected
      let connection = this.voiceConnections.get(guildId);
      if (!connection || connection.state.status === VoiceConnectionStatus.Disconnected) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        // Handle connection state changes
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5000),
            ]);
          } catch (error) {
            connection.destroy();
            this.voiceConnections.delete(guildId);
            this.audioPlayers.delete(guildId);
          }
        });

        this.voiceConnections.set(guildId, connection);
      }

      // Create audio player if not exists
      let player = this.audioPlayers.get(guildId);
      if (!player) {
        player = createAudioPlayer();
        this.audioPlayers.set(guildId, player);

        // Handle player events
        player.on(AudioPlayerStatus.Playing, () => {
          const current = this.currentlyPlaying.get(guildId);
          if (current) {
            current.status = 'playing';
            current.startedAt = Date.now();
          }
        });

        player.on(AudioPlayerStatus.Paused, () => {
          const current = this.currentlyPlaying.get(guildId);
          if (current) current.status = 'paused';
        });

        player.on(AudioPlayerStatus.Idle, () => {
          // Auto-play next song when current finishes
          this.playNext(guildId);
        });

        // Subscribe to voice connection
        connection.subscribe(player);
      }

      // Get audio resource
      const audioResource = await this.getAudioResource(song);

      // Set currently playing
      this.currentlyPlaying.set(guildId, {
        ...song,
        startedAt: Date.now(),
        status: 'loading'
      });

      // Play the audio
      player.play(audioResource);

      return { success: true, song };
    } catch (error) {
      console.error('Play music error:', error);
      return { success: false, error: error.message };
    }
  }

  async getAudioResource(song) {
    try {
      // For demo purposes, we'll create a simple beep sound
      // In production, you'd integrate with ytdl-core, ffmpeg, etc.

      // Create a simple sine wave audio buffer for demonstration
      const sampleRate = 48000;
      const duration = 3; // 3 seconds
      const frequency = 440; // A4 note

      const buffer = Buffer.alloc(duration * sampleRate * 2); // 16-bit samples

      for (let i = 0; i < duration * sampleRate; i++) {
        const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 32767;
        buffer.writeInt16LE(Math.floor(sample), i * 2);
      }

      // Create audio resource from buffer
      return createAudioResource(buffer, {
        inputType: 'arbitrary',
        sampleRate: sampleRate
      });
    } catch (error) {
      console.error('Failed to get audio resource:', error);
      throw error;
    }
  }

  async pause(guildId) {
    const player = this.audioPlayers.get(guildId);
    if (!player) return false;

    player.pause();
    return true;
  }

  async resume(guildId) {
    const player = this.audioPlayers.get(guildId);
    if (!player) return false;

    player.unpause();
    return true;
  }

  async skip(guildId) {
    const player = this.audioPlayers.get(guildId);
    if (!player) return false;

    player.stop();

    // The AudioPlayerStatus.Idle event will trigger playNext
    return true;
  }

  async stop(guildId) {
    const player = this.audioPlayers.get(guildId);
    const connection = this.voiceConnections.get(guildId);

    if (player) {
      player.stop();
      this.audioPlayers.delete(guildId);
    }

    if (connection) {
      connection.destroy();
      this.voiceConnections.delete(guildId);
    }

    this.currentlyPlaying.delete(guildId);
    this.clearQueue(guildId);

    return true;
  }

  async playNext(guildId) {
    const queue = this.getQueue(guildId);
    if (queue.length === 0) {
      this.currentlyPlaying.delete(guildId);
      return false;
    }

    const nextSong = queue.shift();
    const voiceChannel = this.getVoiceChannel(guildId);

    if (voiceChannel) {
      await this.play(guildId, voiceChannel, nextSong);
      return nextSong;
    }

    return false;
  }

  getVoiceChannel(guildId) {
    // This would need to be implemented to track which voice channel the bot is in
    // For now, return null
    return null;
  }

  async setVolume(guildId, volume) {
    const settings = this.musicSettings.get(guildId) || {};
    settings.volume = Math.max(0, Math.min(200, volume)); // Discord.js voice supports 0-200%
    this.musicSettings.set(guildId, settings);

    // Apply volume to current player if exists
    const player = this.audioPlayers.get(guildId);
    if (player) {
      // Volume would be applied to the audio resource
      // This is a simplified implementation
    }

    return settings.volume;
  }

  // Volume and Audio Settings
  setVolume(guildId, volume) {
    const settings = this.musicSettings.get(guildId) || {};
    settings.volume = Math.max(0, Math.min(100, volume));
    this.musicSettings.set(guildId, settings);
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
      // This would integrate with lyrics APIs
      // For now, return mock lyrics
      return {
        title: songTitle,
        artist,
        lyrics: `[Verse 1]\nThis is a sample lyric for ${songTitle}\nBy ${artist}\n\n[Chorus]\nLa la la la la\nSample chorus line\n\n[Verse 2]\nAnother verse here\nWith more sample text`,
        source: 'Mock Lyrics API'
      };
    } catch (error) {
      return null;
    }
  }

  // Radio Stations
  getRadioStations() {
    return {
      'lofi_hip_hop': { name: 'Lo-fi Hip Hop', genre: 'Lo-fi', url: 'https://streams.example.com/lofi' },
      'electronic': { name: 'Electronic Beats', genre: 'Electronic', url: 'https://streams.example.com/electronic' },
      'rock_classics': { name: 'Rock Classics', genre: 'Rock', url: 'https://streams.example.com/rock' },
      'jazz': { name: 'Smooth Jazz', genre: 'Jazz', url: 'https://streams.example.com/jazz' },
      'classical': { name: 'Classical Music', genre: 'Classical', url: 'https://streams.example.com/classical' }
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

export function setVolume(guildId, volume) {
  return musicManager.setVolume(guildId, volume);
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

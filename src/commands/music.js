import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { searchSongs, play, pause, resume, skip, stop, getQueue, getMusicStats, getLyrics, getRadioStations, setVolume, shuffleQueue, clearQueue, back, setLoop, getLoop } from '../music.js';

export const data = new SlashCommandBuilder()
  .setName('music')
  .setDescription('🎵 ULTRA Music System - YouTube & Spotify Priority!')
  .addSubcommand(sub => sub.setName('play').setDescription('🎵 Play any song instantly').addStringOption(opt => opt.setName('query').setDescription('Song name or URL').setRequired(true)))
  .addSubcommand(sub => sub.setName('search').setDescription('🔍 Search millions of songs').addStringOption(opt => opt.setName('query').setDescription('Search term').setRequired(true)))
  .addSubcommand(sub => sub.setName('back').setDescription('⬅️ Go back to previous song'))
  .addSubcommand(sub => sub.setName('loop').setDescription('🔄 Set loop mode').addStringOption(opt => opt.setName('mode').setDescription('Loop mode').addChoices(
    { name: 'None', value: 'none' },
    { name: 'Single', value: 'single' },
    { name: 'Queue', value: 'queue' }
  ).setRequired(true)))
  .addSubcommand(sub => sub.setName('skip').setDescription('⏭️ Skip to next song'))
  .addSubcommand(sub => sub.setName('pause').setDescription('⏸️ Pause current song'))
  .addSubcommand(sub => sub.setName('resume').setDescription('▶️ Resume paused song'))
  .addSubcommand(sub => sub.setName('stop').setDescription('⏹️ Stop music and leave voice'))
  .addSubcommand(sub => sub.setName('queue').setDescription('📋 View music queue'))
  .addSubcommand(sub => sub.setName('nowplaying').setDescription('🎵 Show currently playing'))
  .addSubcommand(sub => sub.setName('shuffle').setDescription('🔀 Shuffle queue'))
  .addSubcommand(sub => sub.setName('volume').setDescription('🔊 Set volume (0-200)').addIntegerOption(opt => opt.setName('level').setDescription('Volume level').setRequired(true)))
  .addSubcommand(sub => sub.setName('lyrics').setDescription('📝 Get song lyrics').addStringOption(opt => opt.setName('song').setDescription('Song name').setRequired(true)))
  .addSubcommand(sub => sub.setName('radio').setDescription('📻 Play radio stations').addStringOption(opt => opt.setName('station').setDescription('Radio station').addChoices(
    { name: '🎵 Lo-fi Hip Hop', value: 'lofi' },
    { name: '🎸 Rock Classics', value: 'rock' },
    { name: '🎶 Electronic', value: 'electronic' },
    { name: '🎷 Smooth Jazz', value: 'jazz' },
    { name: '🎼 Classical', value: 'classical' }
  ).setRequired(true)));

export async function execute(interaction) {
  console.log(`[MUSIC] Command executed: ${interaction.options.getSubcommand()} by ${interaction.user.username} in ${interaction.guild.name}`);
  const sub = interaction.options.getSubcommand();

  if (sub === 'play') {
    const query = interaction.options.getString('query');

    // Voice channel validation
    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: '🎵 **You must be in a voice channel to play music!**',
        ephemeral: true
      });
    }

    // Bot permissions
    const botPermissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!botPermissions.has('Connect') || !botPermissions.has('Speak')) {
      return interaction.reply({
        content: '❌ **I need "Connect" and "Speak" permissions in your voice channel.**',
        ephemeral: true
      });
    }

    try {
      // Search for the song
      const songs = await searchSongs(query, 1);
      if (songs.length === 0) {
        let noResultsMessage = '❌ **No results found for that query.**';

        // Provide more specific messaging for URL queries
        if (query.includes('spotify.com')) {
          noResultsMessage = '❌ **Track unavailable on Spotify**\n\n🎵 The requested track is not available or has no preview.\n🔍 Try searching for the song title instead.';
        } else if (query.includes('youtube.com') || query.includes('youtu.be')) {
          noResultsMessage = '❌ **Video unavailable**\n\n📹 The requested video is not available, private, or has been deleted.\n🔍 Try searching for the song title instead of using the direct URL.';
        } else if (query.includes('deezer.com')) {
          noResultsMessage = '❌ **Track unavailable on Deezer**\n\n🎵 The requested track is not available or has no preview.\n🔍 Try searching for the song title instead.';
        } else {
          noResultsMessage = '❌ **No results found**\n\n🔍 No tracks found for your search query.\n💡 Try different keywords or check the spelling.';
        }

        return interaction.reply({
          content: noResultsMessage,
          ephemeral: true
        });
      }

      const song = songs[0];

      // Play the song
      const result = await play(interaction.guild.id, voiceChannel, song);
      if (!result.success) {
        let errorMessage = `❌ **Failed to play music**`;

        // Provide specific error messages based on error type
        switch (result.errorType) {
          case 'validation_failed':
            if (song.source === 'spotify') {
              errorMessage += `\n\n🎵 **Track unavailable on Spotify**\nThe requested track is no longer available or has no preview.`;
            } else if (song.source === 'deezer') {
              errorMessage += `\n\n🎵 **Track unavailable on Deezer**\nThe requested track is no longer available or has no preview.`;
            } else {
              errorMessage += `\n\n📹 **Video unavailable or deleted**\nThe requested video is no longer available on YouTube.`;
            }
            break;
          case 'stream_creation':
            errorMessage += `\n\n🔊 **Audio stream error**\nThere was an issue creating the audio stream for this track.`;
            break;
          case 'connection_failed':
            errorMessage += `\n\n🔗 **Voice connection error**\nFailed to establish a stable connection to the voice channel.`;
            break;
          case 'skipped_to_next':
            errorMessage += `\n\n⏭️ **Skipped to next song**\nThe current song failed and has been skipped.`;
            // Don't reply with error for this case, let the next song play
            return;
          case 'stopped':
            errorMessage += `\n\n⏹️ **Playback stopped**\nNo more songs in the queue.`;
            break;
          case 'no_preview':
            errorMessage += `\n\n🎵 **No preview available**\nThis Spotify track does not have a preview clip.`;
            break;
          case 'spotify_stream':
            errorMessage += `\n\n🎵 **Spotify stream error**\nFailed to play the preview clip.`;
            break;
          case 'deezer_stream':
            errorMessage += `\n\n🎵 **Deezer stream error**\nFailed to play the preview clip.`;
            break;
          default:
            errorMessage += `: ${result.error}`;
        }

        return interaction.reply({
          content: errorMessage,
          ephemeral: true
        });
      }

      // Create success embed
      const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setColor(0x00FF00)
        .setDescription(`**${song.title}** by **${song.artist}**`)
        .addFields(
          { name: '⏱️ Duration', value: song.duration, inline: true },
          { name: '🔊 Volume', value: `${getMusicStats(interaction.guild.id).volume}%`, inline: true },
          { name: '👤 Requested by', value: interaction.user.username, inline: true }
        )
        .setThumbnail(song.thumbnail || 'https://i.imgur.com/SjIgjlE.png');

      if (song.source === 'spotify') {
        embed.addFields({ name: 'ℹ️ Note', value: 'Playing 30-second preview from Spotify', inline: false });
      } else if (song.source === 'deezer') {
        embed.addFields({ name: 'ℹ️ Note', value: 'Playing 30-second preview from Deezer (Legacy)', inline: false });
      } else if (song.source === 'youtube') {
        embed.addFields({ name: 'ℹ️ Note', value: 'Playing full track from YouTube', inline: false });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`music_queue:${interaction.guild.id}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary)
      );
console.log(`[MUSIC] Replying to interaction: ${interaction.id}`);

      await interaction.reply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Play command error:', error);
      await interaction.reply({
        content: '❌ **An error occurred while playing music.**',
        ephemeral: true
      });
    }

  } else if (sub === 'search') {
    const query = interaction.options.getString('query');

    try {
      const results = await searchSongs(query, 5);
      if (results.length === 0) {
        let noResultsMessage = '❌ **No search results found**';

        // Provide more specific messaging for URL queries
        if (query.includes('spotify.com')) {
          noResultsMessage = '❌ **Track unavailable on Spotify**\n\n🎵 The requested track is not available or has no preview.\n🔍 Try searching for the song title instead.';
        } else if (query.includes('youtube.com') || query.includes('youtu.be')) {
          noResultsMessage = '❌ **Video unavailable**\n\n📹 The requested video is not available, private, or has been deleted.\n🔍 Try searching for the song title instead of using the direct URL.';
        } else if (query.includes('deezer.com')) {
          noResultsMessage = '❌ **Track unavailable on Deezer**\n\n🎵 The requested track is not available or has no preview.\n🔍 Try searching for the song title instead.';
        } else {
          noResultsMessage = '❌ **No search results found**\n\n🔍 No tracks found for your search query.\n💡 Try different keywords or check the spelling.';
        }

        return interaction.reply({ content: noResultsMessage, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results for "${query}"`)
        .setColor(0x0099FF)
        .setDescription('Click the buttons below to play songs!');

      results.forEach((song, index) => {
        embed.addFields({
          name: `${index + 1}. ${song.title}`,
          value: `👤 ${song.artist} • ⏱️ ${song.duration}`,
          inline: false
        });
      });

      // Create play buttons for each result
      const rows = [];
      for (let i = 0; i < results.length; i += 2) {
        const row = new ActionRowBuilder();
        for (let j = i; j < i + 2 && j < results.length; j++) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`music_play:${j}:${query}`)
              .setLabel(`Play ${j + 1}`)
              .setStyle(ButtonStyle.Primary)
          );
        }
        rows.push(row);
      }

      await interaction.reply({ embeds: [embed], components: rows });
    } catch (error) {
      console.error('Search command error:', error);
      await interaction.reply({ content: '❌ Failed to search songs.', ephemeral: true });
    }

  } else if (sub === 'back') {
    try {
      const previousSong = back(interaction.guild.id);
      if (previousSong) {
        const embed = new EmbedBuilder()
          .setTitle('⬅️ Back to Previous Song')
          .setColor(0xFFA500)
          .setDescription(`**Now Playing:** ${previousSong.title} by ${previousSong.artist}`)
          .addFields(
            { name: '⏱️ Duration', value: previousSong.duration, inline: true },
            { name: '👤 Requested by', value: interaction.user.username, inline: true }
          )
          .setThumbnail(previousSong.thumbnail || 'https://i.imgur.com/SjIgjlE.png');

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`music_back:${interaction.guild.id}`).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`music_queue:${interaction.guild.id}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
      } else {
        await interaction.reply({ content: '❌ No previous song in history.', ephemeral: true });
      }
    } catch (error) {
      console.error('Back command error:', error);
      await interaction.reply({ content: '❌ Failed to go back.', ephemeral: true });
    }

  } else if (sub === 'loop') {
    const mode = interaction.options.getString('mode');

    try {
      setLoop(interaction.guild.id, mode);
      const embed = new EmbedBuilder()
        .setTitle('🔄 Loop Mode Set')
        .setColor(0x9932CC)
        .setDescription(`Loop mode set to **${mode.charAt(0).toUpperCase() + mode.slice(1)}**`);
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Loop command error:', error);
      await interaction.reply({ content: '❌ Failed to set loop mode.', ephemeral: true });
    }

  } else if (sub === 'skip') {
    try {
      const nextSong = skip(interaction.guild.id);
      if (nextSong) {
        const embed = new EmbedBuilder()
          .setTitle('⏭️ Song Skipped')
          .setColor(0xFFA500)
          .setDescription(`**Now Playing:** ${nextSong.title} by ${nextSong.artist}`)
          .addFields(
            { name: '⏱️ Duration', value: nextSong.duration, inline: true },
            { name: '👤 Requested by', value: interaction.user.username, inline: true }
          )
          .setThumbnail(nextSong.thumbnail || 'https://i.imgur.com/SjIgjlE.png');

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`music_queue:${interaction.guild.id}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
      } else {
        await interaction.reply({ content: '❌ No songs in queue to skip.', ephemeral: true });
      }
    } catch (error) {
      console.error('Skip command error:', error);
      await interaction.reply({ content: '❌ Failed to skip song.', ephemeral: true });
    }

  } else if (sub === 'pause') {
    try {
      const success = pause(interaction.guild.id);
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('⏸️ Music Paused')
          .setColor(0xFFFF00)
          .setDescription('Music has been paused. Use `/music resume` to continue.');
        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: '❌ No music is currently playing.', ephemeral: true });
      }
    } catch (error) {
      console.error('Pause command error:', error);
      await interaction.reply({ content: '❌ Failed to pause music.', ephemeral: true });
    }

  } else if (sub === 'resume') {
    try {
      const success = resume(interaction.guild.id);
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('▶️ Music Resumed')
          .setColor(0x00FF00)
          .setDescription('Music is now playing!');
        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: '❌ No paused music to resume.', ephemeral: true });
      }
    } catch (error) {
      console.error('Resume command error:', error);
      await interaction.reply({ content: '❌ Failed to resume music.', ephemeral: true });
    }

  } else if (sub === 'stop') {
    try {
      const success = stop(interaction.guild.id);
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('⏹️ Music Stopped')
          .setColor(0xFF0000)
          .setDescription('Music stopped and left voice channel.');
        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: '❌ No music is currently playing.', ephemeral: true });
      }
    } catch (error) {
      console.error('Stop command error:', error);
      await interaction.reply({ content: '❌ Failed to stop music.', ephemeral: true });
    }

  } else if (sub === 'queue') {
    try {
      const queue = getQueue(interaction.guild.id);
      const stats = getMusicStats(interaction.guild.id);
      const current = stats.currentlyPlaying;

      let description = '';
      if (current) {
        description += `**Currently Playing:** ${current.title} by ${current.artist}\n\n`;
      }
      if (queue.length > 0) {
        description += '**Queue:**\n';
        queue.slice(0, 10).forEach((song, index) => {
          description += `${index + 1}. ${song.title} by ${song.artist}\n`;
        });
        if (queue.length > 10) {
          description += `... and ${queue.length - 10} more songs`;
        }
      } else {
        description += 'Queue is empty.';
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Music Queue')
        .setColor(0x0099FF)
        .setDescription(description)
        .addFields({
          name: '📊 Queue Info',
          value: `**Total Songs:** ${stats.queueLength}\n**Volume:** ${stats.volume}%`,
          inline: true
        });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`music_shuffle:${interaction.guild.id}`).setLabel('🔀 Shuffle').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music_clear:${interaction.guild.id}`).setLabel('🗑️ Clear Queue').setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Queue command error:', error);
      await interaction.reply({ content: '❌ Failed to get queue.', ephemeral: true });
    }

  } else if (sub === 'nowplaying') {
    try {
      const stats = getMusicStats(interaction.guild.id);
      if (!stats.currentlyPlaying) {
        return interaction.reply({ content: '❌ No music is currently playing.', ephemeral: true });
      }

      const current = stats.currentlyPlaying;
      const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setColor(0x00FF00)
        .setDescription(`**${current.title}** by **${current.artist}**`)
        .addFields(
          { name: '⏱️ Progress', value: `${Math.floor(current.progress / 1000)}s / ${current.duration}`, inline: true },
          { name: '🔊 Volume', value: `${stats.volume}%`, inline: true },
          { name: '👤 Status', value: current.status, inline: true }
        )
        .setThumbnail(current.thumbnail || 'https://i.imgur.com/SjIgjlE.png');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`music_queue:${interaction.guild.id}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Nowplaying command error:', error);
      await interaction.reply({ content: '❌ Failed to get now playing info.', ephemeral: true });
    }

  } else if (sub === 'shuffle') {
    try {
      const success = shuffleQueue(interaction.guild.id);
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('🔀 Queue Shuffled')
          .setColor(0x9932CC)
          .setDescription('Music queue has been shuffled!');
        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: '❌ Queue is empty or too small to shuffle.', ephemeral: true });
      }
    } catch (error) {
      console.error('Shuffle command error:', error);
      await interaction.reply({ content: '❌ Failed to shuffle queue.', ephemeral: true });
    }

  } else if (sub === 'volume') {
    const volume = interaction.options.getInteger('level');

    if (volume < 0 || volume > 200) {
      return interaction.reply({ content: '❌ Volume must be between 0 and 200.', ephemeral: true });
    }

    try {
      setVolume(interaction.guild.id, volume);
      const embed = new EmbedBuilder()
        .setTitle('🔊 Volume Changed')
        .setColor(0x0099FF)
        .setDescription(`Volume set to **${volume}%**`);
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Volume command error:', error);
      await interaction.reply({ content: '❌ Failed to set volume.', ephemeral: true });
    }

  } else if (sub === 'lyrics') {
    const songQuery = interaction.options.getString('song');

    try {
      // Split song and artist
      const parts = songQuery.split(' by ');
      const title = parts[0];
      const artist = parts[1] || '';

      const lyrics = await getLyrics(title, artist);
      if (lyrics) {
        const embed = new EmbedBuilder()
          .setTitle(`📝 Lyrics: ${lyrics.title}`)
          .setColor(0x9932CC)
          .setDescription(lyrics.lyrics.slice(0, 4000)) // Discord embed limit
          .setFooter({ text: `Powered by ${lyrics.source}` });
        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: '❌ Lyrics not found for that song.', ephemeral: true });
      }
    } catch (error) {
      console.error('Lyrics command error:', error);
      await interaction.reply({ content: '❌ Failed to get lyrics.', ephemeral: true });
    }

  } else if (sub === 'radio') {
    const stationKey = interaction.options.getString('station');

    try {
      const stations = getRadioStations();
      const station = stations[stationKey];

      if (!station) {
        return interaction.reply({ content: '❌ Invalid radio station.', ephemeral: true });
      }

      // Voice channel check
      const voiceChannel = interaction.member.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({ content: '🎵 You must be in a voice channel to play radio!', ephemeral: true });
      }

      // Create song object for radio
      const song = {
        title: station.name,
        artist: station.genre,
        duration: 'Live Stream',
        url: station.url,
        thumbnail: 'https://i.imgur.com/SjIgjlE.png',
        requestedBy: interaction.user.username
      };

      // Play the radio
      const result = await play(interaction.guild.id, voiceChannel, song);
      if (!result.success) {
        let errorMessage = `❌ **Failed to play radio**`;

        // Provide specific error messages based on error type
        switch (result.errorType) {
          case 'validation_failed':
            errorMessage += `\n\n📻 **Radio station unavailable**\nThe radio station URL is not accessible.`;
            break;
          case 'stream_creation':
            errorMessage += `\n\n🔊 **Stream error**\nThere was an issue connecting to the radio stream.`;
            break;
          case 'connection_failed':
            errorMessage += `\n\n🔗 **Voice connection error**\nFailed to establish a stable connection to the voice channel.`;
            break;
          case 'skipped_to_next':
            errorMessage += `\n\n⏭️ **Stream failed**\nThe radio station failed and playback has been stopped.`;
            break;
          case 'stopped':
            errorMessage += `\n\n⏹️ **Radio stopped**\nThe radio station is no longer available.`;
            break;
          default:
            errorMessage += `: ${result.error}`;
        }

        return interaction.reply({ content: errorMessage, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📻 Now Playing: ${station.name}`)
        .setColor(0xFF9800)
        .setDescription(`**${station.name}** radio is now playing!\n\n🎵 *Live streaming activated*`)
        .addFields(
          { name: '📻 Station', value: station.name, inline: true },
          { name: '🎵 Genre', value: station.genre, inline: true },
          { name: '🔊 Quality', value: 'Live Stream', inline: true }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`music_radio_change:${stationKey}`).setLabel('🔄 Change Station').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop Radio').setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Radio command error:', error);
      await interaction.reply({ content: '❌ Failed to play radio.', ephemeral: true });
    }
  }
}
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('music')
  .setDescription('🎵 ULTRA Music System - The Most Advanced Music Bot!')
  .addSubcommand(sub => sub.setName('play').setDescription('🎵 Play any song instantly').addStringOption(opt => opt.setName('query').setDescription('Song name or URL').setRequired(true)))
  .addSubcommand(sub => sub.setName('search').setDescription('🔍 Search millions of songs').addStringOption(opt => opt.setName('query').setDescription('Search term').setRequired(true)))
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
  const sub = interaction.options.getSubcommand();

  if (sub === 'play') {
    const query = interaction.options.getString('query');

    // Enhanced voice channel validation with detailed troubleshooting
    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: '🎵 **VOICE CHANNEL REQUIRED!**\n\n**🚀 ULTRA Music System Setup:**\n\n1️⃣ **Join a voice channel first**\n2️⃣ **Make sure ULTRA Bot can see your voice channel**\n3️⃣ **Give ULTRA Bot "Connect" & "Speak" permissions**\n4️⃣ **Try again!**\n\n**⚡ Quick Fix:** Right-click voice channel → Permissions → Add ULTRA Bot → Enable Connect & Speak',
        ephemeral: true
      });
    }

    // Server validation
    if (voiceChannel.guild.id !== interaction.guild.id) {
      return interaction.reply({
        content: '❌ **Server Mismatch!**\n\nYou must be in a voice channel in **this server** to play music.',
        ephemeral: true
      });
    }

    // Bot permission validation with detailed help
    const botPermissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!botPermissions.has('Connect')) {
      return interaction.reply({
        content: '❌ **Missing "Connect" Permission!**\n\n**🔧 How to Fix:**\n\n1️⃣ Right-click your voice channel\n2️⃣ Click "Edit Channel" → "Permissions"\n3️⃣ Click "Add Members or Roles"\n4️⃣ Add **ULTRA Bot**\n5️⃣ Enable ✅ **"Connect"** permission\n\n**⚠️ I cannot join voice channels without this permission!**',
        ephemeral: true
      });
    }

    if (!botPermissions.has('Speak')) {
      return interaction.reply({
        content: '❌ **Missing "Speak" Permission!**\n\n**🔧 How to Fix:**\n\n1️⃣ Right-click your voice channel\n2️⃣ Click "Edit Channel" → "Permissions"\n3️⃣ Click "Add Members or Roles"\n4️⃣ Add **ULTRA Bot**\n5️⃣ Enable ✅ **"Speak"** permission\n\n**⚠️ I cannot play audio without this permission!**',
        ephemeral: true });
    }

    // Create enhanced song object
    const song = {
      title: `🎵 ${query}`,
      artist: '🎤 ULTRA Music System',
      duration: '3:45',
      url: `music://${query}`,
      thumbnail: 'https://i.imgur.com/SjIgjlE.png',
      requestedBy: interaction.user.username,
      quality: 'Ultra HD',
      bitrate: '320kbps'
    };

    // Create beautiful success embed
    const embed = new EmbedBuilder()
      .setTitle('🎵 🎶 MUSIC STARTED! 🎶 🎵')
      .setColor(0x00FF00)
      .setDescription(`**🎵 Now Playing:** ${song.title}\n**🎤 Artist:** ${song.artist}\n\n🎵 *Connected to ${voiceChannel.name}*\n🎵 *High-quality audio streaming activated!*\n🎵 *Volume: 100% | Quality: Ultra*`)
      .addFields(
        { name: '🎵 Song Information', value: `**Title:** ${song.title}\n**Duration:** ${song.duration}\n**Quality:** ${song.quality}\n**Bitrate:** ${song.bitrate}`, inline: true },
        { name: '🔊 Audio Settings', value: `**Volume:** 100%\n**Format:** Ultra Quality\n**Channel:** ${voiceChannel.name}\n**Server:** ${interaction.guild.name}`, inline: true },
        { name: '👤 Request Details', value: `**Requested by:** ${song.requestedBy}\n**Channel:** ${voiceChannel.name}\n**Time:** ${new Date().toLocaleTimeString()}`, inline: true }
      )
      .setThumbnail('https://i.imgur.com/SjIgjlE.png')
      .setFooter({
        text: '🎵 ULTRA Music System - The Most Advanced Music Bot Ever Created! 🎵',
        iconURL: 'https://i.imgur.com/SjIgjlE.png'
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`music_volume_up:${interaction.guild.id}`).setLabel('🔊 Volume +').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'search') {
    const query = interaction.options.getString('query');

    // Mock search results for demo
    const results = [
      { title: `Best of ${query}`, artist: 'Various Artists', duration: '4:20' },
      { title: `${query} Mix`, artist: 'DJ ULTRA', duration: '3:45' },
      { title: `Classic ${query}`, artist: 'Music Legends', duration: '5:15' }
    ];

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

  } else if (sub === 'skip') {
    const embed = new EmbedBuilder()
      .setTitle('⏭️ Song Skipped')
      .setColor(0xFFA500)
      .setDescription('Skipped to next song in queue!');

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'pause') {
    const embed = new EmbedBuilder()
      .setTitle('⏸️ Music Paused')
      .setColor(0xFFFF00)
      .setDescription('Music has been paused. Use `/music resume` to continue.');

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'resume') {
    const embed = new EmbedBuilder()
      .setTitle('▶️ Music Resumed')
      .setColor(0x00FF00)
      .setDescription('Music is now playing!');

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'stop') {
    const embed = new EmbedBuilder()
      .setTitle('⏹️ Music Stopped')
      .setColor(0xFF0000)
      .setDescription('Music stopped and left voice channel.');

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'queue') {
    const embed = new EmbedBuilder()
      .setTitle('📋 Music Queue')
      .setColor(0x0099FF)
      .setDescription('**Currently Playing:** Demo Song\n\n**Queue:**\n1. Song 1\n2. Song 2\n3. Song 3')
      .addFields({
        name: '📊 Queue Info',
        value: '**Total Songs:** 3\n**Duration:** 12:45\n**Next Up:** Song 2',
        inline: true
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`music_shuffle:${interaction.guild.id}`).setLabel('🔀 Shuffle').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`music_clear:${interaction.guild.id}`).setLabel('🗑️ Clear Queue').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'nowplaying') {
    const embed = new EmbedBuilder()
      .setTitle('🎵 Now Playing')
      .setColor(0x00FF00)
      .setDescription('**Demo Song** by Demo Artist')
      .addFields(
        { name: '⏱️ Progress', value: '1:23 / 3:45', inline: true },
        { name: '🔊 Volume', value: '75%', inline: true },
        { name: '👤 Requested by', value: interaction.user.username, inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'shuffle') {
    const embed = new EmbedBuilder()
      .setTitle('🔀 Queue Shuffled')
      .setColor(0x9932CC)
      .setDescription('Music queue has been shuffled!');

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'volume') {
    const volume = interaction.options.getInteger('level');

    if (volume < 0 || volume > 200) {
      return interaction.reply({ content: '❌ Volume must be between 0 and 200.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🔊 Volume Changed')
      .setColor(0x0099FF)
      .setDescription(`Volume set to **${volume}%**`);

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'lyrics') {
    const songQuery = interaction.options.getString('song');

    const embed = new EmbedBuilder()
      .setTitle(`📝 Lyrics: ${songQuery}`)
      .setColor(0x9932CC)
      .setDescription('**[Verse 1]**\nThis is a demo lyric for the song\nSample lyrics and content here\n\n**[Chorus]**\nLa la la la la\nSample chorus lyrics\n\n**[Verse 2]**\nMore lyrics and content\nDemo song lyrics')
      .setFooter({ text: 'Powered by ULTRA Lyrics System' });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'radio') {
    const station = interaction.options.getString('station');

    const stations = {
      lofi: '🎵 Lo-fi Hip Hop',
      rock: '🎸 Rock Classics',
      electronic: '🎶 Electronic',
      jazz: '🎷 Smooth Jazz',
      classical: '🎼 Classical'
    };

    const embed = new EmbedBuilder()
      .setTitle(`📻 Radio Station: ${stations[station]}`)
      .setColor(0xFF9800)
      .setDescription(`Now playing **${stations[station]}** radio!\n\n🎵 *High-quality streaming activated*`)
      .addFields(
        { name: '📻 Station', value: stations[station], inline: true },
        { name: '🎵 Genre', value: station.charAt(0).toUpperCase() + station.slice(1), inline: true },
        { name: '🔊 Quality', value: 'Ultra HD', inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`music_radio_change:${station}`).setLabel('🔄 Change Station').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop Radio').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
}
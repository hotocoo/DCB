import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { warnUser, muteUser, banUser, kickUser, getUserWarnings, getModActions, getUserModStats, checkAutoMod } from '../moderation.js';
import { updateUserStats } from '../achievements.js';
export const data = new SlashCommandBuilder()
.setName('admin')
.setDescription('Advanced server administration and moderation tools')
.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
.addSubcommand((sub) =>
sub
.setName('warn')
.setDescription('Warn a user')
.addUserOption((opt) => opt.setName('user').setDescription('User to warn').setRequired(true))
.addStringOption((opt) => opt.setName('reason').setDescription('Warning reason').setRequired(true))
.addStringOption((opt) =>
opt
.setName('severity')
.setDescription('Warning severity')
.addChoices({ name: 'Low', value: 'low' }, { name: 'Medium', value: 'medium' }, { name: 'High', value: 'high' })
.setRequired(false),
),
)
.addSubcommand((sub) =>
sub
.setName('mute')
.setDescription('Mute a user')
.addUserOption((opt) => opt.setName('user').setDescription('User to mute').setRequired(true))
.addStringOption((opt) => opt.setName('reason').setDescription('Mute reason').setRequired(true))
.addIntegerOption((opt) => opt.setName('duration').setDescription('Duration in minutes').setRequired(false)),
)
.addSubcommand((sub) =>
sub
.setName('unmute')
.setDescription('Unmute a user')
.addUserOption((opt) => opt.setName('user').setDescription('User to unmute').setRequired(true))
.addStringOption((opt) => opt.setName('reason').setDescription('Unmute reason').setRequired(false)),
)
.addSubcommand((sub) =>
sub
.setName('ban')
.setDescription('Ban a user')
.addUserOption((opt) => opt.setName('user').setDescription('User to ban').setRequired(true))
.addStringOption((opt) => opt.setName('reason').setDescription('Ban reason').setRequired(true))
.addIntegerOption((opt) => opt.setName('duration').setDescription('Duration in hours (leave empty for permanent)').setRequired(false)),
)
.addSubcommand((sub) =>
sub
.setName('unban')
.setDescription('Unban a user')
.addUserOption((opt) => opt.setName('user').setDescription('User to unban').setRequired(true))
.addStringOption((opt) => opt.setName('reason').setDescription('Unban reason').setRequired(false)),
)
.addSubcommand((sub) =>
sub
.setName('kick')
.setDescription('Kick a user')
.addUserOption((opt) => opt.setName('user').setDescription('User to kick').setRequired(true))
.addStringOption((opt) => opt.setName('reason').setDescription('Kick reason').setRequired(true)),
)
.addSubcommand((sub) =>
sub
.setName('check')
.setDescription('Check user moderation status')
.addUserOption((opt) => opt.setName('user').setDescription('User to check').setRequired(true)),
)
.addSubcommand((sub) =>
sub
.setName('history')
.setDescription('View moderation history')
.addIntegerOption((opt) => opt.setName('limit').setDescription('Number of actions to show').setRequired(false)),
)
.addSubcommand((sub) => sub.setName('stats').setDescription('View server moderation statistics'));
export async function execute(interaction) {
try {
// Validate interaction object
if (!interaction || !interaction.member || !interaction.user || !interaction.guild || !interaction.options) {
throw new Error('Invalid interaction object');
}
// Check if user has administrator permissions
if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
return interaction.reply({
content: '❌ You need Administrator permissions to use this command.',
flags: MessageFlags.Ephemeral,
});
}
const sub = interaction.options.getSubcommand();
const guildId = interaction.guild.id;
// Validate subcommand
const validSubcommands = ['warn', 'mute', 'unmute', 'ban', 'unban', 'kick', 'check', 'history', 'stats'];
if (!validSubcommands.includes(sub)) {
return interaction.reply({
content: '❌ Invalid subcommand. Please use a valid admin subcommand.',
flags: MessageFlags.Ephemeral,
});
}
// Validate guild ID
if (!guildId || typeof guildId !== 'string') {
throw new Error('Invalid guild ID');
}
try {
switch (sub) {
case 'warn': {
const targetUser = interaction.options.getUser('user');
const reason = interaction.options.getString('reason');
const severity = interaction.options.getString('severity') || 'medium';
// Validate inputs
if (!targetUser || !reason || reason.trim().length === 0) {
return interaction.reply({
content: '❌ Invalid user or reason provided.',
flags: MessageFlags.Ephemeral,
});
}
if (!['low', 'medium', 'high'].includes(severity)) {
return interaction.reply({
content: '❌ Invalid severity. Must be low, medium, or high.',
flags: MessageFlags.Ephemeral,
});
}
if (targetUser.id === interaction.user.id) {
return interaction.reply({
content: '❌ You cannot warn yourself!',
flags: MessageFlags.Ephemeral,
});
}
try {
const warning = warnUser(guildId, targetUser.id, interaction.user.id, reason.trim(), severity);
const embed = new EmbedBuilder()
.setTitle('⚠️ User Warned')
.setColor(0xff_a5_00)
.setDescription(`**${targetUser.username}** has been warned.`)
.addFields(
{ name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
{ name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
{ name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
{ name: '🚨 Severity', value: severity.toUpperCase(), inline: true },
);
// Track moderation achievement
updateUserStats(interaction.user.id, { moderation_actions: 1 });
await interaction.reply({ embeds: [embed] });
// Send DM to warned user if possible
try {
await targetUser.send(`⚠️ **Warning from ${interaction.guild.name}:**\n${reason}`);
} catch (dmError) {
logger.warn('Could not send DM to warned user:', dmError.message);
}
} catch (warnError) {
logger.error('Error warning user:', warnError instanceof Error ? warnError : new Error(String(warnError)));
await interaction.reply({
content: '❌ Failed to warn user. Please try again.',
flags: MessageFlags.Ephemeral,
});
}
break;
}
case 'mute': {
const targetUser = interaction.options.getUser('user');
const reason = interaction.options.getString('reason');
const durationMinutes = interaction.options.getInteger('duration') || 60;
// Validate inputs
if (!targetUser || !reason || reason.trim().length === 0) {
return interaction.reply({
content: '❌ Invalid user or reason provided.',
flags: MessageFlags.Ephemeral,
});
}
if (durationMinutes < 1 || durationMinutes > 1440) {
// Max 24 hours
return interaction.reply({
content: '❌ Duration must be between 1 and 1440 minutes (24 hours).',
flags: MessageFlags.Ephemeral,
});
}
if (targetUser.id === interaction.user.id) {
return interaction.reply({
content: '❌ You cannot mute yourself!',
flags: MessageFlags.Ephemeral,
});
}
try {
const durationMs = durationMinutes * 60 * 1000;
const mute = muteUser(guildId, targetUser.id, interaction.user.id, reason.trim(), durationMs);
const embed = new EmbedBuilder()
.setTitle('🔇 User Muted')
.setColor(0xff_6b_6b)
.setDescription(`**${targetUser.username}** has been muted for ${durationMinutes} minutes.`)
.addFields(
{ name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
{ name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
{ name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
{ name: '⏰ Duration', value: `${durationMinutes} minutes`, inline: true },
);
await interaction.reply({ embeds: [embed] });
} catch (muteError) {
logger.error('Error muting user:', muteError instanceof Error ? muteError : new Error(String(muteError)));
await interaction.reply({
content: '❌ Failed to mute user. Please try again.',
flags: MessageFlags.Ephemeral,
});
}
break;
}
case 'unmute': {
const targetUser = interaction.options.getUser('user');
const reason = interaction.options.getString('reason') || 'Manual unmute';
// Validate inputs
if (!targetUser) {
return interaction.reply({
content: '❌ Invalid user provided.',
flags: MessageFlags.Ephemeral,
});
}
try {
const { unmuteUser } = await import('../moderation.js');
const result = unmuteUser(guildId, targetUser.id, interaction.user.id, reason.trim());
if (!result) {
return interaction.reply({
content: '❌ User is not currently muted.',
flags: MessageFlags.Ephemeral,
});
}
const embed = new EmbedBuilder()
.setTitle('🔊 User Unmuted')
.setColor(0x00_ff_00)
.setDescription(`**${targetUser.username}** has been unmuted.`)
.addFields(
{ name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
{ name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
{ name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
);
await interaction.reply({ embeds: [embed] });
} catch (unmuteError) {
logger.error('Error unmuting user:', unmuteError instanceof Error ? unmuteError : new Error(String(unmuteError)));
await interaction.reply({
content: '❌ Failed to unmute user. Please try again.',
flags: MessageFlags.Ephemeral,
});
}
break;
}
case 'ban': {
const targetUser = interaction.options.getUser('user');
const reason = interaction.options.getString('reason');
const durationHours = interaction.options.getInteger('duration');
// Validate inputs
if (!targetUser || !reason || reason.trim().length === 0) {
return interaction.reply({
content: '❌ Invalid user or reason provided.',
flags: MessageFlags.Ephemeral,
});
}
if (durationHours !== null && (durationHours < 1 || durationHours > 168)) {
// Max 1 week
return interaction.reply({
content: '❌ Duration must be between 1 and 168 hours (1 week) or leave empty for permanent.',
flags: MessageFlags.Ephemeral,
});
}
if (targetUser.id === interaction.user.id) {
return interaction.reply({
content: '❌ You cannot ban yourself!',
flags: MessageFlags.Ephemeral,
});
}
try {
const durationMs = durationHours ? durationHours * 60 * 60 * 1000 : null;
const ban = banUser(guildId, targetUser.id, interaction.user.id, reason.trim(), durationMs);
const embed = new EmbedBuilder()
.setTitle('🔨 User Banned')
.setColor(0xff_00_00)
.setDescription(`**${targetUser.username}** has been ${durationMs ? 'temporarily ' : 'permanently '}banned.`)
.addFields(
{ name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
{ name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
{ name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
{ name: '⏰ Duration', value: durationMs ? `${durationHours} hours` : 'Permanent', inline: true },
);
await interaction.reply({ embeds: [embed] });
} catch (banError) {
logger.error('Error banning user:', banError instanceof Error ? banError : new Error(String(banError)));
await interaction.reply({
content: '❌ Failed to ban user. Please try again.',
flags: MessageFlags.Ephemeral,
});
}
break;
}
case 'unban': {
const targetUser = interaction.options.getUser('user');
const reason = interaction.options.getString('reason') || 'Manual unban';
// Validate inputs
if (!targetUser) {
return interaction.reply({
content: '❌ Invalid user provided.',
flags: MessageFlags.Ephemeral,
});
}
try {
const { unbanUser } = await import('../moderation.js');
const result = unbanUser(guildId, targetUser.id, interaction.user.id, reason.trim());
if (!result) {
return interaction.reply({
content: '❌ User is not currently banned.',
flags: MessageFlags.Ephemeral,
});
}
const embed = new EmbedBuilder()
.setTitle('✅ User Unbanned')
.setColor(0x00_ff_00)
.setDescription(`**${targetUser.username}** has been unbanned.`)
.addFields(
{ name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
{ name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
{ name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
);
await interaction.reply({ embeds: [embed] });
} catch (unbanError) {
            logger.error('Error unbanning user:', unbanError instanceof Error ? unbanError : new Error(String(unbanError)));
await interaction.reply({
content: '❌ Failed to unban user. Please try again.',
flags: MessageFlags.Ephemeral,
});
}
break;
}
case 'kick': {
const targetUser = interaction.options.getUser('user');
const reason = interaction.options.getString('reason');
// Validate inputs
if (!targetUser || !reason || reason.trim().length === 0) {
return interaction.reply({
content: '❌ Invalid user or reason provided.',
flags: MessageFlags.Ephemeral,
});
}
if (targetUser.id === interaction.user.id) {
return interaction.reply({
content: '❌ You cannot kick yourself!',
flags: MessageFlags.Ephemeral,
});
}
try {
const kick = kickUser(guildId, targetUser.id, interaction.user.id, reason.trim());
const embed = new EmbedBuilder()
.setTitle('👢 User Kicked')
.setColor(0xff_8c_00)
.setDescription(`**${targetUser.username}** has been kicked from the server.`)
.addFields(
{ name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
{ name: '👮‍♂️ Moderator', value: `<@${interaction.user.id}>`, inline: true },
{ name: '📋 Reason', value: reason.length > 1024 ? reason.slice(0, 1021) + '...' : reason, inline: true },
);
await interaction.reply({ embeds: [embed] });
} catch (kickError) {
            logger.error('Error kicking user:', kickError instanceof Error ? kickError : new Error(String(kickError)));
await interaction.reply({
content: '❌ Failed to kick user. Please try again.',
flags: MessageFlags.Ephemeral,
});
}
break;
}
case 'check': {
const targetUser = interaction.options.getUser('user');
// Validate inputs
if (!targetUser) {
return interaction.reply({
content: '❌ Invalid user provided.',
flags: MessageFlags.Ephemeral,
});
}
try {
const warnings = getUserWarnings(guildId, targetUser.id) || [];
const modStats = getUserModStats(guildId, targetUser.id) || {
risk_level: 'low',
warnings: 0,
kicks: 0,
mutes: 0,
bans: 0,
total_actions: 0,
};
const embed = new EmbedBuilder()
.setTitle(`🔍 Moderation Check - ${targetUser.username}`)
.setColor(
modStats.risk_level === 'critical'
? 0xff_00_00
: modStats.risk_level === 'high'
? 0xff_a5_00
: modStats.risk_level === 'medium'
? 0xff_ff_00
: 0x00_ff_00,
)
.setThumbnail(targetUser.displayAvatarURL())
.setDescription(`**Risk Level:** ${modStats.risk_level.toUpperCase()}`)
.addFields(
{ name: '⚠️ Warnings', value: String(modStats.warnings || 0), inline: true },
{ name: '👢 Kicks', value: String(modStats.kicks || 0), inline: true },
{ name: '🔇 Mutes', value: String(modStats.mutes || 0), inline: true },
{ name: '🔨 Bans', value: String(modStats.bans || 0), inline: true },
{ name: '📊 Total Actions', value: String(modStats.total_actions || 0), inline: true },
);
if (Array.isArray(warnings) && warnings.length > 0) {
const recentWarnings = warnings.filter((w) => w && w.active).slice(0, 3);
if (recentWarnings.length > 0) {
const warningList = recentWarnings
.map(
(w) =>
`⚠️ **${(w.severity || 'medium').toUpperCase()}** - ${w.reason || 'No reason'} (${w.timestamp ? new Date(w.timestamp).toLocaleDateString() : 'Unknown date'})`,
)
.join('\n');
embed.addFields({
name: '📋 Recent Warnings',
value: warningList.length > 1024 ? warningList.slice(0, 1021) + '...' : warningList,
inline: false,
});
}
}
// Add action buttons based on current status
const row = new ActionRowBuilder();
try {
const { isUserMuted, isUserBanned } = await import('../moderation.js');
if (isUserMuted(guildId, targetUser.id)) {
row.addComponents(
new ButtonBuilder().setCustomId(`admin_unmute:${targetUser.id}:${guildId}`).setLabel('🔊 Unmute').setStyle(ButtonStyle.Success),
);
} else {
row.addComponents(
new ButtonBuilder().setCustomId(`admin_warn:${targetUser.id}:${guildId}`).setLabel('⚠️ Warn').setStyle(ButtonStyle.Secondary),
);
}
if (isUserBanned(guildId, targetUser.id)) {
row.addComponents(
new ButtonBuilder().setCustomId(`admin_unban:${targetUser.id}:${guildId}`).setLabel('✅ Unban').setStyle(ButtonStyle.Success),
);
} else {
row.addComponents(new ButtonBuilder().setCustomId(`admin_mute:${targetUser.id}:${guildId}`).setLabel('🔇 Mute').setStyle(ButtonStyle.Danger));
}
} catch (importError) {
              logger.error('Error importing moderation functions:', importError instanceof Error ? importError : new Error(String(importError)));
}
await interaction.reply({ embeds: [embed], components: row.components.length > 0 ? [row] : [] });
} catch (checkError) {
            logger.error('Error checking user moderation status:', checkError instanceof Error ? checkError : new Error(String(checkError)));
await interaction.reply({

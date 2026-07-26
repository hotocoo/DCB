import fs from 'node:fs';
import path from 'node:path';

import { getDb } from './database.js';
import { logger } from './logger.js';

const OLD_SCHEDULES_FILE = path.join(process.cwd(), 'data', 'schedules.json');

// In-memory active timers — safe to lose on restart (recreated via startScheduler)
const activeTimers = new Map();

let client = null;
let started = false;

function migrateFromJson() {
  const db = getDb();
  // Only run once if tables exist AND old file present
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reminders'").get()) return;
  if (!fs.existsSync(OLD_SCHEDULES_FILE)) return;

  try {
    const data = JSON.parse(fs.readFileSync(OLD_SCHEDULES_FILE, 'utf8')) || {};

    // Migrate reminders
    for (const [uid, list] of Object.entries(data.reminders || {})) {
      for (const r of Array.isArray(list) ? list : []) {
        db.prepare('INSERT OR REPLACE INTO reminders (id, user_id, reminder_data) VALUES (?, ?, ?)').run(r.id, uid, JSON.stringify(r));
      }
    }

    // Migrate events
    for (const [gid, list] of Object.entries(data.events || {})) {
      for (const e of Array.isArray(list) ? list : []) {
        db.prepare('INSERT OR REPLACE INTO events (id, guild_id, event_data) VALUES (?, ?, ?)').run(e.id, gid, JSON.stringify(e));
      }
    }

    // Migrate user settings
    for (const [uid, setting] of Object.entries(data.userSettings || {})) {
      db.prepare('INSERT OR REPLACE INTO user_settings (user_id, settings_data) VALUES (?, ?)').run(uid, JSON.stringify(setting));
    }

    logger.info(`Migrated scheduler data from JSON (${Object.keys(data.reminders || {}).length} users with reminders)`);
  } catch (err) { logger.error('Scheduler JSON migration failed', err instanceof Error ? err : new Error(String(err))); }
}

// Send a Discord message (with channel lookup)
async function sendDiscordMessage({ guildId, channelId }, message) {
  if (!client) return;
  let channel;
  try {
    channel = guildId ? await (await client.guilds.fetch(guildId)).channels.fetch(channelId) : await client.channels.fetch(channelId);
  } catch (error) {
    logger.error('Failed to fetch channel for scheduled message', error instanceof Error ? error : new Error(String(error)), { guildId, channelId });
    return;
  }
  try { await channel.send(message); } catch (error) { logger.error('Failed to send scheduled message', error instanceof Error ? error : new Error(String(error)), { guildId, channelId }); }
}

// Create a reminder entry
export function createReminder(userId, reminderData) {
  migrateFromJson();
  const db = getDb();
  const id = `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const reminder = {
    id, userId, title: reminderData.title || '', message: reminderData.message || '', scheduledFor: reminderData.scheduledFor,
    recurring: reminderData.recurring || null, channelId: reminderData.channelId, guildId: reminderData.guildId, created: Date.now(), active: true, executed: false,
  };

  db.prepare('INSERT OR REPLACE INTO reminders (id, user_id, reminder_data) VALUES (?, ?, ?)').run(id, userId, JSON.stringify(reminder));

  // Schedule timer if client is ready
  if (started && client) scheduleReminder(reminder);

  return reminder;
}

function scheduleReminder(reminder) {
  const delay = reminder.scheduledFor - Date.now();
  if (delay <= 0) { executeReminder(reminder); return; }
  const timerId = setTimeout(() => executeReminder(reminder), delay);
  if (typeof timerId.unref === 'function') timerId.unref();
  activeTimers.set(reminder.id, timerId);
}

async function executeReminder(reminder) {
  const message = `⏰ **Reminder: ${reminder.title || ''}**\n${reminder.message || ''}`;
  let sendSuccess = false;
  let lastError;

  if (client) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { await sendDiscordMessage({ guildId: reminder.guildId, channelId: reminder.channelId }, message); sendSuccess = true; break; } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isRetryable = /50[234]|rate limit|timeout/i.test(lastError.message);
        logger.error(`Failed to send reminder (attempt ${attempt}/3):`, lastError, { reminderId: reminder.id });
        if (!isRetryable || attempt === 3) break;
        await new Promise((r) => setTimeout(r, Math.min(5_000 * Math.pow(3, attempt - 1), 60_000)));
      }
    }
  }

  activeTimers.delete(reminder.id);
  const db = getDb();

  if (sendSuccess) {
    reminder.executed = true;
    reminder.executedAt = Date.now();
    // Update stats via user_settings
    updateStat(reminder.userId, 'reminders_sent', 1);
    if (reminder.recurring) createRecurringReminder(db, reminder);
  } else {
    reminder.active = false;
    reminder.failedToDeliver = true;
    reminder.failedAt = Date.now();
  }

  db.prepare('UPDATE reminders SET reminder_data = ? WHERE id = ?').run(JSON.stringify(reminder), reminder.id);
  return { success: sendSuccess, reminder, message };
}

function updateStat(userId, key, delta) {
  const db = getDb();
  let settings;
  try { settings = JSON.parse(db.prepare('SELECT settings_data FROM user_settings WHERE user_id = ?').get(userId)?.settings_data || '{}'); } catch { settings = {}; }
  if (!settings.stats) settings.stats = { reminders_sent: 0, events_executed: 0 };
  settings.stats[key] = (settings.stats[key] || 0) + delta;
  db.prepare('INSERT OR REPLACE INTO user_settings (user_id, settings_data) VALUES (?, ?)').run(userId, JSON.stringify(settings));
}

function createRecurringReminder(db, original) {
  const nextExec = calculateNextRecurrence(original.scheduledFor, original.recurring);
  if (!nextExec || nextExec <= original.scheduledFor) return; // safety check

  const newReminder = { ...original, id: `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, scheduledFor: nextExec, executed: false, created: Date.now() };
  db.prepare('INSERT INTO reminders (id, user_id, reminder_data) VALUES (?, ?, ?)').run(newReminder.id, original.userId, JSON.stringify(newReminder));

  if (started && client) scheduleReminder(newReminder);
}

function calculateNextRecurrence(lastExec, recurrence) {
  const date = new Date(lastExec);
  switch (recurrence.type) {
    case 'daily': date.setDate(date.getDate() + (recurrence.interval || 1)); break;
    case 'weekly': date.setDate(date.getDate() + (recurrence.interval || 1) * 7); break;
    case 'monthly': date.setMonth(date.getMonth() + (recurrence.interval || 1)); break;
    case 'hourly': date.setHours(date.getHours() + (recurrence.interval || 1)); break;
    default: return null;
  }
  return date.getTime();
}

// Event management
export function createEvent(eventData) {
  migrateFromJson();
  const db = getDb();
  const id = `event_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const event = {
    id, title: eventData.title || '', description: eventData.description || '', scheduledFor: eventData.scheduledFor, duration: eventData.duration || 3_600_000,
    channelId: eventData.channelId, guildId: eventData.guildId, creatorId: eventData.creatorId, maxParticipants: eventData.maxParticipants || 0,
    participants: [], reminders: eventData.reminders || [], created: Date.now(), active: true,
  };

  db.prepare('INSERT OR REPLACE INTO events (id, guild_id, event_data) VALUES (?, ?, ?)').run(id, eventData.guildId, JSON.stringify(event));

  if (started && client) scheduleEvent(event);

  return event;
}

function scheduleEvent(event) {
  const delay = event.scheduledFor - Date.now();
  if (delay <= 0) { executeEvent(event); return; }
  const timerId = setTimeout(() => executeEvent(event), delay);
  if (typeof timerId.unref === 'function') timerId.unref();
  activeTimers.set(event.id, timerId);

  for (let i = 0; i < event.reminders.length; i++) {
    const remTime = event.scheduledFor - event.reminders[i];
    if (remTime > Date.now()) {
      const tId = setTimeout(() => sendEventReminder(event, event.reminders[i]), remTime - Date.now());
      if (typeof tId.unref === 'function') tId.unref();
      activeTimers.set(`${event.id}_reminder_${i}`, tId);
    }
  }
}

async function executeEvent(event) {
  const message = `📅 **Event Started: ${event.title || ''}**\n${event.description || ''}`;
  let sendSuccess = false;

  if (client) {
    try { await sendDiscordMessage({ guildId: event.guildId, channelId: event.channelId }, message); sendSuccess = true; } catch (error) { logger.error('Failed to send event', error instanceof Error ? error : new Error(String(error)), { eventId: event.id }); }
  }

  activeTimers.delete(event.id);
  const db = getDb();

  event.active = false;
  if (sendSuccess) event.executedAt = Date.now(); else { event.failedToDeliver = true; event.failedAt = Date.now(); }

  if (sendSuccess) updateStat(event.creatorId, 'events_executed', 1);

  db.prepare('UPDATE events SET event_data = ? WHERE id = ?').run(JSON.stringify(event), event.id);
  return { success: sendSuccess, event, message };
}

async function sendEventReminder(event, reminderOffset) {
  const mins = Math.round(reminderOffset / 60_000);
  const message = `⏰ **Event Reminder: ${event.title || ''}**\nStarts in ${mins} minutes!\n${event.description || ''}`;
  if (client) { try { await sendDiscordMessage({ guildId: event.guildId, channelId: event.channelId }, message); } catch (error) { logger.error('Failed to send event reminder', error); } }
  return { success: true, message };
}

// Time parsing utilities
export function parseTime(timeString) {
  const now = new Date();

  // Relative time: "in 30 minutes", "in 2 hours"
  const relMatch = timeString.match(/in\s+(\d+)\s*(second|minute|hour|day|week)s?/i);
  if (relMatch) {
    const amt = Number.parseInt(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    return now.getTime() + amt * ({ second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[unit] || 60_000);
  }

  // Tomorrow
  if (timeString.includes('tomorrow')) {
    const tm = new Date(now);
    tm.setDate(tm.getDate() + 1);
    return parseTimeWithDate(timeString.replace(/tomorrow/gi, ''), tm) || now.getTime();
  }

  // Next weekday
  const dayMatch = timeString.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (dayMatch) {
    const target = ({ sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }[dayMatch[1].toLowerCase()] || 0);
    const diff = (target - now.getDay() + 7) % 7 || 7;
    const td = new Date(now);
    td.setDate(td.getDate() + diff);
    return parseTimeWithDate(timeString.replace(/next\s+\w+/i, ''), td) || now.getTime();
  }

  return parseTimeWithDate(timeString, now) || now.getTime();
}

function parseTimeWithDate(timeString, date) {
  const m = timeString.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (m) {
    let h = Number.parseInt(m[1]);
    const mins = Number.parseInt(m[2] || '0');
    const ampm = m[3].toLowerCase();
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    date.setHours(h, mins, 0, 0);
    return date.getTime();
  }
  return null;
}

// User reminders/events queries
export function getUserReminders(userId, limit = 20) {
  migrateFromJson();
  const db = getDb();
  const rows = db.prepare('SELECT reminder_data FROM reminders WHERE user_id = ?').all(userId);
  const now = Date.now();
  return rows.map((r) => JSON.parse(r.reminder_data)).filter((r) => r.active && !r.executed && r.scheduledFor > now).sort((a, b) => a.scheduledFor - b.scheduledFor).slice(0, limit);
}

export function getUserEvents(guildId, limit = 20) {
  migrateFromJson();
  const db = getDb();
  return db.prepare('SELECT event_data FROM events WHERE guild_id = ?').all(guildId).map((r) => JSON.parse(r.event_data)).filter((e) => e.active).sort((a, b) => a.scheduledFor - b.scheduledFor).slice(0, limit);
}

export function cancelReminder(userId, reminderId) {
  migrateFromJson();
  const db = getDb();
  let row = db.prepare('SELECT reminder_data FROM reminders WHERE user_id = ? AND id = ?').get(userId, reminderId);
  if (!row) return false;
  let r; try { r = JSON.parse(row.reminder_data); } catch { return false; }
  r.active = false;
  r.cancelledAt = Date.now();
  db.prepare('UPDATE reminders SET reminder_data = ? WHERE id = ?').run(JSON.stringify(r), reminderId);
  activeTimers.delete(reminderId);
  return true;
}

export function cancelEvent(guildId, eventId, userId) {
  migrateFromJson();
  const db = getDb();
  let row = db.prepare('SELECT event_data FROM events WHERE guild_id = ? AND id = ?').get(guildId, eventId);
  if (!row) return false;
  let e; try { e = JSON.parse(row.event_data); } catch { return false; }
  if (e.creatorId !== userId) return false;
  e.active = false;
  e.cancelledAt = Date.now();
  e.cancelledBy = userId;
  db.prepare('UPDATE events SET event_data = ? WHERE id = ?').run(JSON.stringify(e), eventId);
  activeTimers.delete(eventId);
  for (let i = 0; i < e.reminders?.length || 0; i++) activeTimers.delete(`${eventId}_reminder_${i}`);
  return true;
}

// Timezone settings
export function setUserTimeZone(userId, timeZone) {
  migrateFromJson();
  const db = getDb();
  let settings;
  try { settings = JSON.parse(db.prepare('SELECT settings_data FROM user_settings WHERE user_id = ?').get(userId)?.settings_data || '{}'); } catch { settings = {}; }
  settings.timeZone = timeZone;
  settings.updated = Date.now();
  db.prepare('INSERT OR REPLACE INTO user_settings (user_id, settings_data) VALUES (?, ?)').run(userId, JSON.stringify(settings));
  return true;
}

export function getUserTimeZone(userId) {
  migrateFromJson();
  const db = getDb();
  let settings;
  try { settings = JSON.parse(db.prepare('SELECT settings_data FROM user_settings WHERE user_id = ?').get(userId)?.settings_data || '{}'); } catch { settings = {}; }
  return settings.timeZone || 'UTC';
}

// Calendar view
export function getUpcomingEvents(userId, guildId, days = 7) {
  migrateFromJson();
  const end = Date.now() + days * 86_400_000;
  const reminders = getUserReminders(userId, 100).map((r) => ({ ...r, type: 'reminder' }));
  const events = getUserEvents(guildId, 100).map((e) => ({ ...e, type: 'event' }));
  return [...reminders, ...events].filter((i) => i.scheduledFor <= end).sort((a, b) => a.scheduledFor - b.scheduledFor).slice(0, 20);
}

// Stats
export function getSchedulerStats(userId) {
  migrateFromJson();
  const db = getDb();
  let settings;
  try { settings = JSON.parse(db.prepare('SELECT settings_data FROM user_settings WHERE user_id = ?').get(userId)?.settings_data || '{}'); } catch { settings = {}; }
  const stats = settings.stats || { reminders_sent: 0, events_executed: 0 };
  return { remindersSent: stats.reminders_sent || 0, eventsExecuted: stats.events_executed || 0, totalScheduled: (stats.reminders_sent || 0) + (stats.events_executed || 0), activeReminders: getUserReminders(userId, 100).length };
}

// Scheduler startup — load all pending reminders/events into timers
export function startScheduler() {
  migrateFromJson();
  const db = getDb();
  const now = Date.now();

  for (const row of db.prepare('SELECT * FROM reminders').all()) {
    try {
      const r = JSON.parse(row.reminder_data);
      if (!r.active || r.executed) continue;
      if (now > r.scheduledFor) { logger.warn('Executing overdue reminder', { reminderId: r.id }); executeReminder(r).catch((e) => logger.error('[SCHEDULER] Overdue reminder failed', e)); }
      else scheduleReminder(r);
    } catch (err) { logger.error('[SCHEDULER] Failed to load reminder', err instanceof Error ? err : new Error(String(err)), { id: row.id }); }
  }

  for (const row of db.prepare('SELECT * FROM events').all()) {
    try {
      const e = JSON.parse(row.event_data);
      if (!e.active || e.executedAt) continue;
      if (now > e.scheduledFor) { logger.warn('Executing overdue event', { eventId: e.id }); executeEvent(e).catch((err) => logger.error('[SCHEDULER] Overdue event failed', err instanceof Error ? err : new Error(String(err)))); }
      else scheduleEvent(e);
    } catch (err) { logger.error('[SCHEDULER] Failed to load event', err instanceof Error ? err : new Error(String(err)), { id: row.id }); }
  }

  started = true;
  logger.info('Scheduler started');
}

// Set client reference for Discord messaging
export function setClient(c) {
  client = c;
  if (!started) startScheduler();
}

// Cleanup expired data hourly
function cleanup() {
  migrateFromJson();
  const db = getDb();
  const now = Date.now();

  // Expire reminders older than 24h that were never executed
  for (const row of db.prepare('SELECT * FROM reminders').all()) {
    try {
      const r = JSON.parse(row.reminder_data);
      if (r.scheduledFor < now - 86_400_000 && !r.executed) { activeTimers.delete(r.id); }
    } catch {}
  }
}

// Auto-cleanup every hour
const cleanupInterval = setInterval(cleanup, 3_600_000);
if (typeof cleanupInterval.unref === 'function') cleanupInterval.unref();

// Backward-compatible singleton API for existing callers using schedulerManager.*
export const schedulerManager = { setClient, createReminder, createEvent, parseTime, getUserReminders, getUserEvents, cancelReminder, cancelEvent, getUpcomingEvents, getSchedulerStats };

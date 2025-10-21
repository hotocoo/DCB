import fs from 'fs';
import path from 'path';

const SCHEDULES_FILE = path.join(process.cwd(), 'data', 'schedules.json');

// Advanced Scheduling and Reminder System
class SchedulerManager {
  constructor() {
    this.ensureStorage();
    this.loadSchedules();
    this.activeTimers = new Map();
    this.startScheduler();
  }

  ensureStorage() {
    const dir = path.dirname(SCHEDULES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(SCHEDULES_FILE)) {
      fs.writeFileSync(SCHEDULES_FILE, JSON.stringify({
        reminders: {},
        events: {},
        recurring: {},
        stats: {}
      }));
    }
  }

  loadSchedules() {
    try {
      const data = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
      this.schedules = data;
    } catch (error) {
      console.error('Failed to load schedules:', error);
      this.schedules = {
        reminders: {},
        events: {},
        recurring: {},
        stats: {}
      };
    }
  }

  saveSchedules() {
    try {
      fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(this.schedules, null, 2));
    } catch (error) {
      console.error('Failed to save schedules:', error);
    }
  }

  // Advanced Reminder System
  createReminder(userId, reminderData) {
    const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const reminder = {
      id: reminderId,
      userId,
      title: reminderData.title,
      message: reminderData.message,
      scheduledFor: reminderData.scheduledFor,
      recurring: reminderData.recurring || null,
      channelId: reminderData.channelId,
      guildId: reminderData.guildId,
      created: Date.now(),
      active: true,
      executed: false
    };

    if (!this.schedules.reminders[userId]) {
      this.schedules.reminders[userId] = [];
    }

    this.schedules.reminders[userId].push(reminder);

    // Schedule the reminder
    this.scheduleReminder(reminder);

    this.saveSchedules();
    return reminder;
  }

  scheduleReminder(reminder) {
    const delay = reminder.scheduledFor - Date.now();

    if (delay <= 0) {
      // Execute immediately if time has passed
      this.executeReminder(reminder);
      return;
    }

    const timerId = setTimeout(() => {
      this.executeReminder(reminder);
    }, delay);

    this.activeTimers.set(reminder.id, timerId);
  }

  executeReminder(reminder) {
    // Mark as executed
    reminder.executed = true;
    reminder.executedAt = Date.now();

    // Update stats
    if (!this.schedules.stats[reminder.userId]) {
      this.schedules.stats[reminder.userId] = { reminders_sent: 0, events_executed: 0 };
    }
    this.schedules.stats[reminder.userId].reminders_sent++;

    // Handle recurring reminders
    if (reminder.recurring) {
      this.createRecurringReminder(reminder);
    }

    this.saveSchedules();
    this.activeTimers.delete(reminder.id);

    // Send the reminder (this would integrate with Discord API)
    return {
      success: true,
      reminder,
      message: `⏰ **Reminder: ${reminder.title}**\n${reminder.message}`
    };
  }

  createRecurringReminder(originalReminder) {
    const nextExecution = this.calculateNextRecurrence(originalReminder.scheduledFor, originalReminder.recurring);

    const newReminder = {
      ...originalReminder,
      id: `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      scheduledFor: nextExecution,
      executed: false,
      created: Date.now()
    };

    if (!this.schedules.reminders[originalReminder.userId]) {
      this.schedules.reminders[originalReminder.userId] = [];
    }

    this.schedules.reminders[originalReminder.userId].push(newReminder);
    this.scheduleReminder(newReminder);
  }

  calculateNextRecurrence(lastExecution, recurrence) {
    const date = new Date(lastExecution);

    switch (recurrence.type) {
      case 'daily':
        date.setDate(date.getDate() + (recurrence.interval || 1));
        break;
      case 'weekly':
        date.setDate(date.getDate() + ((recurrence.interval || 1) * 7));
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + (recurrence.interval || 1));
        break;
      case 'hourly':
        date.setHours(date.getHours() + (recurrence.interval || 1));
        break;
    }

    return date.getTime();
  }

  // Event Management System
  createEvent(eventData) {
    const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const event = {
      id: eventId,
      title: eventData.title,
      description: eventData.description,
      scheduledFor: eventData.scheduledFor,
      duration: eventData.duration || 3600000, // 1 hour default
      channelId: eventData.channelId,
      guildId: eventData.guildId,
      creatorId: eventData.creatorId,
      maxParticipants: eventData.maxParticipants || 0,
      participants: [],
      reminders: eventData.reminders || [],
      created: Date.now(),
      active: true
    };

    if (!this.schedules.events[eventData.guildId]) {
      this.schedules.events[eventData.guildId] = [];
    }

    this.schedules.events[eventData.guildId].push(event);

    // Schedule the event
    this.scheduleEvent(event);

    this.saveSchedules();
    return event;
  }

  scheduleEvent(event) {
    const delay = event.scheduledFor - Date.now();

    if (delay <= 0) {
      this.executeEvent(event);
      return;
    }

    const timerId = setTimeout(() => {
      this.executeEvent(event);
    }, delay);

    this.activeTimers.set(event.id, timerId);

    // Schedule reminders if any
    event.reminders.forEach((reminderOffset, index) => {
      const reminderTime = event.scheduledFor - reminderOffset;
      if (reminderTime > Date.now()) {
        const reminderTimerId = setTimeout(() => {
          this.sendEventReminder(event, reminderOffset);
        }, reminderTime - Date.now());

        this.activeTimers.set(`${event.id}_reminder_${index}`, reminderTimerId);
      }
    });
  }

  executeEvent(event) {
    event.active = false;
    event.executedAt = Date.now();

    // Update stats
    if (!this.schedules.stats[event.creatorId]) {
      this.schedules.stats[event.creatorId] = { reminders_sent: 0, events_executed: 0 };
    }
    this.schedules.stats[event.creatorId].events_executed++;

    this.saveSchedules();
    this.activeTimers.delete(event.id);

    return {
      success: true,
      event,
      message: `📅 **Event Started: ${event.title}**\n${event.description}`
    };
  }

  sendEventReminder(event, reminderOffset) {
    const timeUntilEvent = Math.round(reminderOffset / 60000); // Convert to minutes
    return {
      success: true,
      message: `⏰ **Event Reminder: ${event.title}**\nStarts in ${timeUntilEvent} minutes!\n${event.description}`
    };
  }

  // Advanced Time Parsing
  parseTime(timeString) {
    const now = new Date();

    // Parse relative time (e.g., "in 30 minutes", "tomorrow at 3pm")
    if (timeString.includes('in ')) {
      const match = timeString.match(/in\s+(\d+)\s*(second|minute|hour|day|week)s?/i);
      if (match) {
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        const multipliers = {
          second: 1000,
          minute: 60000,
          hour: 3600000,
          day: 86400000,
          week: 604800000
        };

        return now.getTime() + (amount * multipliers[unit]);
      }
    }

    // Parse absolute time (e.g., "tomorrow 3pm", "next friday 2pm")
    if (timeString.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return this.parseTimeWithDate(timeString.replace('tomorrow', ''), tomorrow);
    }

    if (timeString.includes('next ')) {
      const dayMatch = timeString.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      if (dayMatch) {
        const targetDay = this.getDayOfWeek(dayMatch[1]);
        const currentDay = now.getDay();
        const daysToAdd = (targetDay - currentDay + 7) % 7 || 7;

        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        return this.parseTimeWithDate(timeString.replace(/next\s+\w+/i, ''), targetDate);
      }
    }

    // Parse with current date
    return this.parseTimeWithDate(timeString, now);
  }

  parseTimeWithDate(timeString, date) {
    const timeMatch = timeString.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || '0');
      const ampm = timeMatch[3].toLowerCase();

      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      date.setHours(hours, minutes, 0, 0);
      return date.getTime();
    }

    return null;
  }

  getDayOfWeek(dayName) {
    const days = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6
    };

    return days[dayName.toLowerCase()] || 0;
  }

  // User Schedule Management
  getUserReminders(userId, limit = 20) {
    const reminders = this.schedules.reminders[userId] || [];
    return reminders
      .filter(r => r.active && !r.executed)
      .sort((a, b) => a.scheduledFor - b.scheduledFor)
      .slice(0, limit);
  }

  getUserEvents(guildId, limit = 20) {
    const events = this.schedules.events[guildId] || [];
    return events
      .filter(e => e.active)
      .sort((a, b) => a.scheduledFor - b.scheduledFor)
      .slice(0, limit);
  }

  cancelReminder(userId, reminderId) {
    const reminders = this.schedules.reminders[userId];
    if (!reminders) return false;

    const reminder = reminders.find(r => r.id === reminderId);
    if (!reminder) return false;

    reminder.active = false;
    reminder.cancelledAt = Date.now();

    // Cancel the timer
    this.activeTimers.delete(reminderId);

    this.saveSchedules();
    return true;
  }

  cancelEvent(guildId, eventId, userId) {
    const events = this.schedules.events[guildId];
    if (!events) return false;

    const event = events.find(e => e.id === eventId);
    if (!event) return false;

    // Check if user is the creator
    if (event.creatorId !== userId) return false;

    event.active = false;
    event.cancelledAt = Date.now();
    event.cancelledBy = userId;

    // Cancel all related timers
    this.activeTimers.delete(eventId);
    event.reminders.forEach((_, index) => {
      this.activeTimers.delete(`${eventId}_reminder_${index}`);
    });

    this.saveSchedules();
    return true;
  }

  // Time Zone Support
  setUserTimeZone(userId, timeZone) {
    if (!this.schedules.userSettings) {
      this.schedules.userSettings = {};
    }

    this.schedules.userSettings[userId] = {
      ...this.schedules.userSettings[userId],
      timeZone,
      updated: Date.now()
    };

    this.saveSchedules();
    return true;
  }

  getUserTimeZone(userId) {
    return this.schedules.userSettings?.[userId]?.timeZone || 'UTC';
  }

  // Calendar Integration
  getUpcomingEvents(userId, guildId, days = 7) {
    const endTime = Date.now() + (days * 24 * 60 * 60 * 1000);
    const userReminders = this.getUserReminders(userId, 100);
    const guildEvents = this.getUserEvents(guildId, 100);

    const allEvents = [
      ...userReminders.map(r => ({ ...r, type: 'reminder' })),
      ...guildEvents.map(e => ({ ...e, type: 'event' }))
    ];

    return allEvents
      .filter(item => item.scheduledFor <= endTime)
      .sort((a, b) => a.scheduledFor - b.scheduledFor)
      .slice(0, 20);
  }

  // Statistics and Analytics
  getSchedulerStats(userId) {
    const stats = this.schedules.stats[userId] || { reminders_sent: 0, events_executed: 0 };

    return {
      remindersSent: stats.reminders_sent,
      eventsExecuted: stats.events_executed,
      totalScheduled: stats.reminders_sent + stats.events_executed,
      activeReminders: this.getUserReminders(userId, 100).length
    };
  }

  // Advanced Features
  startScheduler() {
    // Load existing schedules and set up timers
    for (const userId in this.schedules.reminders) {
      for (const reminder of this.schedules.reminders[userId]) {
        if (reminder.active && !reminder.executed && reminder.scheduledFor > Date.now()) {
          this.scheduleReminder(reminder);
        }
      }
    }

    for (const guildId in this.schedules.events) {
      for (const event of this.schedules.events[guildId]) {
        if (event.active && event.scheduledFor > Date.now()) {
          this.scheduleEvent(event);
        }
      }
    }
  }

  // Cleanup and Maintenance
  cleanup() {
    const now = Date.now();
    const expiredReminders = [];

    // Find expired reminders
    for (const userId in this.schedules.reminders) {
      const userReminders = this.schedules.reminders[userId];
      for (const reminder of userReminders) {
        if (reminder.scheduledFor < now - (24 * 60 * 60 * 1000) && !reminder.executed) {
          expiredReminders.push(reminder.id);
        }
      }
    }

    // Clean up expired timers
    for (const [timerId] of this.activeTimers) {
      if (expiredReminders.includes(timerId)) {
        clearTimeout(this.activeTimers.get(timerId));
        this.activeTimers.delete(timerId);
      }
    }
  }
}

// Export singleton instance
export const schedulerManager = new SchedulerManager();

// Convenience functions
export function createReminder(userId, reminderData) {
  return schedulerManager.createReminder(userId, reminderData);
}

export function createEvent(eventData) {
  return schedulerManager.createEvent(eventData);
}

export function parseTime(timeString) {
  return schedulerManager.parseTime(timeString);
}

export function getUserReminders(userId, limit = 20) {
  return schedulerManager.getUserReminders(userId, limit);
}

export function getUserEvents(guildId, limit = 20) {
  return schedulerManager.getUserEvents(guildId, limit);
}

export function cancelReminder(userId, reminderId) {
  return schedulerManager.cancelReminder(userId, reminderId);
}

export function cancelEvent(guildId, eventId, userId) {
  return schedulerManager.cancelEvent(guildId, eventId, userId);
}

export function getUpcomingEvents(userId, guildId, days = 7) {
  return schedulerManager.getUpcomingEvents(userId, guildId, days);
}

export function getSchedulerStats(userId) {
  return schedulerManager.getSchedulerStats(userId);
}

// Auto-cleanup every hour
setInterval(() => {
  schedulerManager.cleanup();
}, 60 * 60 * 1000);
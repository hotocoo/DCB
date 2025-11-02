# Bot Database Schema

## Overview
This document outlines the SQLite database schema for migrating from JSON-based storage to a proper relational database system.

## Database Choice: SQLite
- Lightweight, file-based database
- No server setup required
- ACID compliant transactions
- Good performance for read-heavy workloads
- Easy backup and portability
- Suitable for Discord bot use cases

## Schema Design

### Tables Overview

#### 1. users
Core user information shared across all modules.

```sql
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 2. rpg_characters
RPG character data.

```sql
CREATE TABLE rpg_characters (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id),
    name TEXT NOT NULL,
    class TEXT NOT NULL,
    hp INTEGER NOT NULL,
    max_hp INTEGER NOT NULL,
    mp INTEGER NOT NULL,
    max_mp INTEGER NOT NULL,
    atk INTEGER NOT NULL,
    def INTEGER NOT NULL,
    spd INTEGER NOT NULL,
    lvl INTEGER NOT NULL,
    xp INTEGER NOT NULL,
    skill_points INTEGER NOT NULL,
    abilities TEXT, -- JSON array
    color INTEGER,
    gold INTEGER DEFAULT 0,
    daily_explorations INTEGER DEFAULT 0,
    last_daily_reset DATETIME,
    session_xp_gained INTEGER DEFAULT 0,
    last_session_reset DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 3. rpg_inventory
RPG character inventory items.

```sql
CREATE TABLE rpg_inventory (
    user_id TEXT REFERENCES rpg_characters(user_id),
    item_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, item_id)
);
```

#### 4. rpg_equipment
RPG character equipped items.

```sql
CREATE TABLE rpg_equipment (
    user_id TEXT PRIMARY KEY REFERENCES rpg_characters(user_id),
    weapon TEXT,
    armor TEXT
);
```

#### 5. economy_balances
User currency balances.

```sql
CREATE TABLE economy_balances (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id),
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 6. economy_transactions
Transaction history for economy system.

```sql
CREATE TABLE economy_transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    from_user_id TEXT REFERENCES users(user_id),
    to_user_id TEXT REFERENCES users(user_id),
    amount INTEGER NOT NULL,
    item_id TEXT,
    quantity INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 7. economy_investments
User investment data.

```sql
CREATE TABLE economy_investments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    investment_type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    rate REAL NOT NULL,
    maturity_date DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 8. guilds
Guild information.

```sql
CREATE TABLE guilds (
    guild_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    leader_id TEXT NOT NULL REFERENCES users(user_id),
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    gold INTEGER DEFAULT 0,
    description TEXT,
    max_members INTEGER DEFAULT 10,
    is_public BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 9. guild_members
Guild membership data.

```sql
CREATE TABLE guild_members (
    guild_id TEXT REFERENCES guilds(guild_id),
    user_id TEXT REFERENCES users(user_id),
    role TEXT NOT NULL DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    level INTEGER DEFAULT 1,
    contribution INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
);
```

#### 10. moderation_warnings
User warnings.

```sql
CREATE TABLE moderation_warnings (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    moderator_id TEXT NOT NULL REFERENCES users(user_id),
    reason TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 11. moderation_actions
Moderation action log.

```sql
CREATE TABLE moderation_actions (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_user_id TEXT NOT NULL REFERENCES users(user_id),
    moderator_id TEXT NOT NULL REFERENCES users(user_id),
    reason TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 12. entertainment_stats
User entertainment statistics.

```sql
CREATE TABLE entertainment_stats (
    user_id TEXT REFERENCES users(user_id),
    activity_type TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, activity_type)
);
```

#### 13. cooldowns
User cooldowns for various actions.

```sql
CREATE TABLE cooldowns (
    user_id TEXT REFERENCES users(user_id),
    action TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, action)
);
```

#### 14. achievements
User achievements.

```sql
CREATE TABLE achievements (
    user_id TEXT REFERENCES users(user_id),
    achievement_id TEXT NOT NULL,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, achievement_id)
);
```

#### 15. profiles
User profile data.

```sql
CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id),
    bio TEXT,
    avatar_url TEXT,
    theme TEXT DEFAULT 'default',
    preferences TEXT, -- JSON
    statistics TEXT, -- JSON
    customization TEXT, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 16. schedules_reminders
User reminders.

```sql
CREATE TABLE schedules_reminders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    title TEXT NOT NULL,
    description TEXT,
    timestamp DATETIME NOT NULL,
    recurring TEXT,
    next_execution DATETIME,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Migration Strategy

### Phase 1: Initial Migration
1. Create database schema
2. Export existing JSON data
3. Transform and import data
4. Validate data integrity

### Phase 2: Application Updates
1. Update storage layer to use database
2. Implement database connection pooling
3. Add database backup system
4. Update configuration

### Phase 3: Testing and Validation
1. Run comprehensive tests
2. Validate all data relationships
3. Performance testing
4. Rollback procedures

## Indexes for Performance

```sql
-- Performance indexes
CREATE INDEX idx_rpg_characters_user_id ON rpg_characters(user_id);
CREATE INDEX idx_economy_transactions_user_id ON economy_transactions(user_id);
CREATE INDEX idx_economy_transactions_timestamp ON economy_transactions(timestamp);
CREATE INDEX idx_guild_members_guild_id ON guild_members(guild_id);
CREATE INDEX idx_moderation_warnings_user_id ON moderation_warnings(user_id);
CREATE INDEX idx_cooldowns_expires_at ON cooldowns(expires_at);
CREATE INDEX idx_schedules_reminders_timestamp ON schedules_reminders(timestamp);
```

## Backup and Recovery

### Database Backup Strategy
- Automatic daily backups
- Pre-migration backup of all JSON files
- Point-in-time recovery capability
- Backup verification procedures

### Data Integrity Checks
- Foreign key constraints
- Data validation on insert/update
- Consistency checks across related tables
- Migration validation scripts
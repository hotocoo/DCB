/**
 * Automated backup system for data persistence
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { logger } from '../logger.js';
import { enhancedLogger } from './enhancedLogger.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(process.cwd(), 'backups');
const MAX_BACKUPS = 10;

/**
 * Ensure backup directory exists
 */
async function ensureBackupDir() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create backup directory', error);
  }
}

/**
 * Get all files in data directory
 */
async function getDataFiles() {
  try {
    const files = await fs.readdir(DATA_DIR, { recursive: true });
    const dataFiles = [];
    
    for (const file of files) {
      const fullPath = path.join(DATA_DIR, file);
      const stats = await fs.stat(fullPath);
      
      if (stats.isFile() && (file.endsWith('.json') || file.endsWith('.db'))) {
        dataFiles.push(file);
      }
    }
    
    return dataFiles;
  } catch (error) {
    logger.error('Failed to get data files', error);
    return [];
  }
}

/**
 * Create a backup of all data files
 */
export async function createBackup() {
  try {
    await ensureBackupDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup_${timestamp}`);
    
    await fs.mkdir(backupPath, { recursive: true });
    
    const dataFiles = await getDataFiles();
    let copiedFiles = 0;
    
    for (const file of dataFiles) {
      const sourcePath = path.join(DATA_DIR, file);
      const destPath = path.join(backupPath, file);
      
      // Ensure subdirectories exist
      const destDir = path.dirname(destPath);
      await fs.mkdir(destDir, { recursive: true });
      
      await fs.copyFile(sourcePath, destPath);
      copiedFiles++;
    }
    
    // Create backup metadata
    const metadata = {
      timestamp: Date.now(),
      dateString: new Date().toISOString(),
      filesBackedUp: copiedFiles,
      files: dataFiles
    };
    
    await fs.writeFile(
      path.join(backupPath, 'backup_metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf8'
    );
    
    enhancedLogger.info(`Backup created successfully: ${backupPath}`, {
      filesBackedUp: copiedFiles
    });
    
    // Cleanup old backups
    await cleanupOldBackups();
    
    return { success: true, backupPath, filesBackedUp: copiedFiles };
  } catch (error) {
    logger.error('Failed to create backup', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cleanup old backups, keeping only the most recent ones
 */
async function cleanupOldBackups() {
  try {
    const backups = await fs.readdir(BACKUP_DIR);
    const backupDirs = [];
    
    for (const backup of backups) {
      const backupPath = path.join(BACKUP_DIR, backup);
      const stats = await fs.stat(backupPath);
      
      if (stats.isDirectory() && backup.startsWith('backup_')) {
        backupDirs.push({
          name: backup,
          path: backupPath,
          mtime: stats.mtime
        });
      }
    }
    
    // Sort by modification time, newest first
    backupDirs.sort((a, b) => b.mtime - a.mtime);
    
    // Delete old backups
    if (backupDirs.length > MAX_BACKUPS) {
      const toDelete = backupDirs.slice(MAX_BACKUPS);
      
      for (const backup of toDelete) {
        await fs.rm(backup.path, { recursive: true, force: true });
        enhancedLogger.info(`Deleted old backup: ${backup.name}`);
      }
    }
  } catch (error) {
    logger.error('Failed to cleanup old backups', error);
  }
}

/**
 * List all available backups
 */
export async function listBackups() {
  try {
    const backups = await fs.readdir(BACKUP_DIR);
    const backupList = [];
    
    for (const backup of backups) {
      const backupPath = path.join(BACKUP_DIR, backup);
      const stats = await fs.stat(backupPath);
      
      if (stats.isDirectory() && backup.startsWith('backup_')) {
        // Try to read metadata
        const metadataPath = path.join(backupPath, 'backup_metadata.json');
        let metadata = null;
        
        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf8');
          metadata = JSON.parse(metadataContent);
        } catch {
          // No metadata available
        }
        
        backupList.push({
          name: backup,
          path: backupPath,
          created: stats.mtime,
          size: await getDirectorySize(backupPath),
          metadata
        });
      }
    }
    
    // Sort by creation time, newest first
    backupList.sort((a, b) => b.created - a.created);
    
    return backupList;
  } catch (error) {
    logger.error('Failed to list backups', error);
    return [];
  }
}

/**
 * Get total size of a directory
 */
async function getDirectorySize(dirPath) {
  try {
    const files = await fs.readdir(dirPath, { recursive: true });
    let totalSize = 0;
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  } catch (error) {
    return 0;
  }
}

/**
 * Restore from a backup
 */
export async function restoreBackup(backupName) {
  try {
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    // Verify backup exists
    try {
      await fs.access(backupPath);
    } catch {
      throw new Error('Backup not found');
    }
    
    // Create a safety backup of current data
    enhancedLogger.info('Creating safety backup before restore...');
    const safetyBackup = await createBackup();
    
    if (!safetyBackup.success) {
      throw new Error('Failed to create safety backup');
    }
    
    // Read backup metadata
    const metadataPath = path.join(backupPath, 'backup_metadata.json');
    let metadata = null;
    
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(metadataContent);
    } catch {
      enhancedLogger.warn('No metadata found in backup');
    }
    
    const filesToRestore = metadata?.files || await getDataFiles();
    let restoredFiles = 0;
    
    // Restore files
    for (const file of filesToRestore) {
      const sourcePath = path.join(backupPath, file);
      const destPath = path.join(DATA_DIR, file);
      
      try {
        await fs.access(sourcePath);
        
        // Ensure destination directory exists
        const destDir = path.dirname(destPath);
        await fs.mkdir(destDir, { recursive: true });
        
        await fs.copyFile(sourcePath, destPath);
        restoredFiles++;
      } catch {
        // File doesn't exist in backup, skip
      }
    }
    
    enhancedLogger.info(`Backup restored successfully`, {
      backupName,
      filesRestored: restoredFiles
    });
    
    return { success: true, filesRestored: restoredFiles, safetyBackup: safetyBackup.backupPath };
  } catch (error) {
    logger.error('Failed to restore backup', error, { backupName });
    return { success: false, error: error.message };
  }
}

/**
 * Start automatic backup schedule
 */
let backupInterval = null;

export function startAutomaticBackups(intervalHours = 6) {
  if (backupInterval) {
    clearInterval(backupInterval);
  }
  
  backupInterval = setInterval(async () => {
    enhancedLogger.info('Starting automatic backup...');
    const result = await createBackup();
    
    if (result.success) {
      enhancedLogger.info('Automatic backup completed successfully');
    } else {
      enhancedLogger.error('Automatic backup failed');
    }
  }, intervalHours * 60 * 60 * 1000);
  
  enhancedLogger.info('Automatic backups started', { intervalHours });
  
  // Create initial backup
  createBackup().then(result => {
    if (result.success) {
      enhancedLogger.info('Initial backup created');
    }
  });
}

/**
 * Stop automatic backups
 */
export function stopAutomaticBackups() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
    enhancedLogger.info('Automatic backups stopped');
  }
}

/**
 * Export backup statistics
 */
export async function getBackupStats() {
  try {
    const backups = await listBackups();
    
    const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
    const oldestBackup = backups[backups.length - 1];
    const newestBackup = backups[0];
    
    return {
      totalBackups: backups.length,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      oldestBackup: oldestBackup ? {
        name: oldestBackup.name,
        created: oldestBackup.created
      } : null,
      newestBackup: newestBackup ? {
        name: newestBackup.name,
        created: newestBackup.created
      } : null
    };
  } catch (error) {
    logger.error('Failed to get backup stats', error);
    return null;
  }
}

export default {
  createBackup,
  listBackups,
  restoreBackup,
  startAutomaticBackups,
  stopAutomaticBackups,
  getBackupStats
};

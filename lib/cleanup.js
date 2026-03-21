import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { getErrorMessage } from './utils.js';

export class Cleanup extends EventEmitter {
  async run(directory, olderThanDays, confirm = false) {
    this.emit('cleanup-start', { directory, olderThanDays, confirm });

    let files;
    try {
      files = await this.#collectFiles(directory);
    } catch (error) {
      const message = getErrorMessage(error, directory);
      this.emit('cleanup-error', { error, message });
      throw new Error(message);
    }

    const now = Date.now();
    const targets = [];

    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
          continue;
        }

        const ageDays = (now - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > olderThanDays) {
          const entry = {
            path: filePath,
            size: stat.size,
            mtime: stat.mtime,
            ageDays
          };

          targets.push(entry);
          this.emit('file-found', entry);
        }
      } catch (error) {
        const message = getErrorMessage(error, filePath);
        this.emit('file-error', { path: filePath, error, message });
      }
    }

    const totalCandidateSize = targets.reduce((acc, item) => acc + item.size, 0);
    this.emit('candidates-found', {
      files: targets,
      totalCandidates: targets.length,
      totalCandidateSize,
      confirm
    });

    let deletedCount = 0;
    let freedSpace = 0;

    if (confirm) {
      for (const target of targets) {
        try {
          await fs.unlink(target.path);
          deletedCount += 1;
          freedSpace += target.size;
          this.emit('file-deleted', {
            path: target.path,
            size: target.size,
            deletedCount,
            total: targets.length
          });
        } catch (error) {
          const message = getErrorMessage(error, target.path);
          this.emit('file-delete-error', { path: target.path, error, message });
        }
      }
    }

    const result = {
      confirm,
      olderThanDays,
      foundFiles: targets,
      totalCandidates: targets.length,
      totalCandidateSize,
      deletedCount,
      freedSpace
    };

    this.emit('cleanup-complete', result);
    return result;
  }

  async #collectFiles(directory) {
    const result = [];
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        const nested = await this.#collectFiles(fullPath);
        result.push(...nested);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }

    return result;
  }
}

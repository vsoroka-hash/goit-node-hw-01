import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { getErrorMessage } from './utils.js';

export class Scanner extends EventEmitter {
  async scan(directory) {
    this.emit('scan-start', { directory });

    let files;
    try {
      files = await this.#collectFiles(directory);
    } catch (error) {
      const message = getErrorMessage(error, directory);
      this.emit('scan-error', { error, message });
      throw new Error(message);
    }

    const stats = {
      totalFiles: 0,
      totalSize: 0,
      byType: new Map(),
      age: {
        last7Days: 0,
        last30Days: 0,
        olderThan90Days: 0
      },
      largestFiles: [],
      oldestFile: null
    };

    const now = Date.now();

    for (const filePath of files) {
      try {
        const fileStat = await fs.stat(filePath);

        if (!fileStat.isFile()) {
          continue;
        }

        const ext = path.extname(filePath).toLowerCase() || '(no-ext)';
        const size = fileStat.size;
        const mtime = fileStat.mtime;
        const ageDays = (now - mtime.getTime()) / (1000 * 60 * 60 * 24);

        stats.totalFiles += 1;
        stats.totalSize += size;

        const bucket = stats.byType.get(ext) ?? { count: 0, totalSize: 0 };
        bucket.count += 1;
        bucket.totalSize += size;
        stats.byType.set(ext, bucket);

        if (ageDays <= 7) {
          stats.age.last7Days += 1;
        }

        if (ageDays <= 30) {
          stats.age.last30Days += 1;
        }

        if (ageDays > 90) {
          stats.age.olderThan90Days += 1;
        }

        this.#addLargestFile(stats.largestFiles, {
          path: filePath,
          size
        });

        if (!stats.oldestFile || mtime < stats.oldestFile.mtime) {
          stats.oldestFile = { path: filePath, mtime, ageDays };
        }

        this.emit('file-found', {
          path: filePath,
          size,
          ext,
          processed: stats.totalFiles
        });
      } catch (error) {
        const message = getErrorMessage(error, filePath);
        this.emit('file-error', { path: filePath, error, message });
      }
    }

    stats.largestFiles.sort((a, b) => b.size - a.size);
    this.emit('scan-complete', stats);
    return stats;
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

  #addLargestFile(largestFiles, item) {
    largestFiles.push(item);
    largestFiles.sort((a, b) => b.size - a.size);

    if (largestFiles.length > 3) {
      largestFiles.length = 3;
    }
  }
}

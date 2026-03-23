import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getErrorMessage } from './utils.js';

export class DuplicateFinder extends EventEmitter {
  async find(directory) {
    this.emit('search-start', { directory });

    let files;
    try {
      files = await this.#collectFiles(directory);
    } catch (error) {
      const message = getErrorMessage(error, directory);
      this.emit('search-error', { error, message });
      throw new Error(message);
    }

    const hashMap = new Map();
    let processed = 0;

    for (const filePath of files) {
      let hash;
      try {
        const stat = await fsp.stat(filePath);
        if (!stat.isFile()) {
          continue;
        }

        hash = await this.#calculateHash(filePath);
        const list = hashMap.get(hash) ?? [];
        list.push({ path: filePath, size: stat.size });
        hashMap.set(hash, list);
      } catch (error) {
        const message = getErrorMessage(error, filePath);
        this.emit('file-error', { path: filePath, error, message });
      } finally {
        processed += 1;
        this.emit('file-processed', {
          path: filePath,
          hash: hash ?? null,
          processed,
          total: files.length
        });
      }
    }

    const duplicateGroups = [];
    let totalWasted = 0;

    for (const [hash, entries] of hashMap.entries()) {
      if (entries.length > 1) {
        const size = entries[0].size;
        const wasted = size * (entries.length - 1);
        totalWasted += wasted;
        duplicateGroups.push({ hash, files: entries, fileSize: size, wasted });
      }
    }

    duplicateGroups.sort((a, b) => b.wasted - a.wasted);

    const result = {
      totalFiles: files.length,
      duplicateGroups,
      totalWasted
    };

    this.emit('duplicates-found', result);
    return result;
  }

  async #collectFiles(directory) {
    const result = [];
    const entries = await fsp.readdir(directory, { withFileTypes: true });

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

  #calculateHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}

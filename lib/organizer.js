import { EventEmitter } from 'events';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import {
  CATEGORIES,
  LARGE_FILE_THRESHOLD,
  getCategoryByExtension,
  getErrorMessage,
  splitFileName
} from './utils.js';

export class Organizer extends EventEmitter {
  async organize(sourceDir, outputDir) {
    this.emit('organize-start', { sourceDir, outputDir });

    try {
      await this.#ensureCategoryDirs(outputDir);
    } catch (error) {
      const message = getErrorMessage(error, outputDir);
      this.emit('organize-error', { error, message });
      throw new Error(message);
    }

    let files;
    try {
      files = await this.#collectFiles(sourceDir);
    } catch (error) {
      const message = getErrorMessage(error, sourceDir);
      this.emit('organize-error', { error, message });
      throw new Error(message);
    }

    const summary = {
      byCategory: {
        Documents: 0,
        Images: 0,
        Archives: 0,
        Code: 0,
        Videos: 0,
        Other: 0
      },
      totalCopied: 0,
      totalSize: 0,
      totalFiles: files.length
    };

    for (const filePath of files) {
      try {
        const stat = await fsp.stat(filePath);
        if (!stat.isFile()) {
          continue;
        }

        const extension = path.extname(filePath);
        const category = getCategoryByExtension(extension);
        const destinationDir = path.join(outputDir, category);
        const targetPath = await this.#buildUniquePath(destinationDir, path.basename(filePath));

        this.emit('copy-start', {
          source: filePath,
          target: targetPath,
          size: stat.size,
          category
        });

        if (stat.size >= LARGE_FILE_THRESHOLD) {
          await pipeline(fs.createReadStream(filePath), fs.createWriteStream(targetPath));
        } else {
          await fsp.copyFile(filePath, targetPath);
        }

        summary.byCategory[category] += 1;
        summary.totalCopied += 1;
        summary.totalSize += stat.size;

        this.emit('copy-complete', {
          source: filePath,
          target: targetPath,
          size: stat.size,
          category,
          copied: summary.totalCopied,
          total: summary.totalFiles
        });
      } catch (error) {
        const message = getErrorMessage(error, filePath);
        this.emit('copy-error', { source: filePath, error, message });
      }
    }

    this.emit('organize-complete', summary);
    return summary;
  }

  async #ensureCategoryDirs(outputDir) {
    const categories = [...Object.keys(CATEGORIES), 'Other'];
    for (const category of categories) {
      const categoryPath = path.join(outputDir, category);
      await fsp.mkdir(categoryPath, { recursive: true });
      this.emit('directory-created', { category, path: categoryPath });
    }
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

  async #buildUniquePath(directory, fileName) {
    const { name, ext } = splitFileName(fileName);
    let candidate = path.join(directory, fileName);
    let index = 1;

    while (await this.#exists(candidate)) {
      candidate = path.join(directory, `${name}(${index})${ext}`);
      index += 1;
    }

    return candidate;
  }

  async #exists(filePath) {
    try {
      await fsp.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

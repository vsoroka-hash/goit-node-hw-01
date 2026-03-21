import path from 'path';

export const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

export const CATEGORIES = {
  Documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx', '.xls', '.ppt', '.csv', '.rtf'],
  Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.tiff', '.ico'],
  Archives: ['.zip', '.rar', '.tar', '.gz', '.7z', '.bz2', '.xz'],
  Code: ['.js', '.mjs', '.cjs', '.ts', '.py', '.java', '.cpp', '.c', '.h', '.html', '.css', '.json', '.xml', '.yml', '.yaml', '.sh'],
  Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv', '.flv', '.m4v']
};

export function getErrorMessage(error, targetPath) {
  if (error?.code === 'ENOENT') {
    return `Directory or file not found: ${targetPath}`;
  }

  if (error?.code === 'EACCES') {
    return `Permission denied: ${targetPath}`;
  }

  if (error?.code === 'EPERM') {
    return `Operation not permitted: ${targetPath}`;
  }

  return `Unexpected error for ${targetPath}: ${error?.message || 'unknown error'}`;
}

export function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function drawProgressBar(current, total, width = 20) {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.min(current / safeTotal, 1);
  const filled = Math.round(ratio * width);
  const bar = '-'.repeat(filled) + '-'.repeat(width - filled);
  return `${bar} ${current}/${total}`;
}

export function getCategoryByExtension(extension) {
  const ext = extension.toLowerCase();

  for (const [category, extensions] of Object.entries(CATEGORIES)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }

  return 'Other';
}

export function splitFileName(fileName) {
  const parsed = path.parse(fileName);
  return {
    name: parsed.name,
    ext: parsed.ext
  };
}

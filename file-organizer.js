#!/usr/bin/env node

import path from 'path';
import { Scanner } from './lib/scanner.js';
import { DuplicateFinder } from './lib/duplicates.js';
import { Organizer } from './lib/organizer.js';
import { Cleanup } from './lib/cleanup.js';
import { drawProgressBar, formatSize } from './lib/utils.js';

const args = process.argv.slice(2);
const command = args[0];

function parseFlagValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return undefined;
  }

  return args[index + 1];
}

function hasFlag(flag) {
  return args.includes(flag);
}

function printUsage() {
  console.log(`Usage:
  node file-organizer.js scan <directory>
  node file-organizer.js duplicates <directory>
  node file-organizer.js organize <source-directory> --output <target-directory>
  node file-organizer.js cleanup <directory> --older-than <days> [--confirm]
`);
}

function shortenHash(hash) {
  return `${hash.slice(0, 12)}...`;
}

function formatAgeDays(days) {
  return `${Math.floor(days)} days ago`;
}

async function runScan(directory) {
  const scanner = new Scanner();
  let totalProcessed = 0;

  scanner.on('scan-start', ({ directory: scanDir }) => {
    console.log(`?? Scanning: ${scanDir}`);
    console.log('Processing...');
  });

  scanner.on('file-found', ({ processed }) => {
    totalProcessed = processed;
  });

  scanner.on('file-error', ({ message }) => {
    console.error(`??  ${message}`);
  });

  scanner.on('scan-complete', (stats) => {
    process.stdout.write(`\rProcessing... ${drawProgressBar(totalProcessed, stats.totalFiles)} files\n`);

    console.log('\n?? Scan Results:');
    console.log('??????????????????????????????????');
    console.log(`Total files: ${stats.totalFiles}`);
    console.log(`Total size: ${formatSize(stats.totalSize)}\n`);

    console.log('By File Type:');
    const sortedTypes = [...stats.byType.entries()].sort((a, b) => b[1].count - a[1].count);

    for (const [ext, data] of sortedTypes) {
      console.log(`  ${ext.padEnd(8)} ${String(data.count).padStart(4)} files   ${formatSize(data.totalSize)}`);
    }

    console.log('\nFile Age:');
    console.log(`  Last 7 days:     ${stats.age.last7Days} files`);
    console.log(`  Last 30 days:    ${stats.age.last30Days} files`);
    console.log(`  Older than 90:   ${stats.age.olderThan90Days} files`);

    console.log('\nLargest files:');
    if (stats.largestFiles.length === 0) {
      console.log('  No files found');
    } else {
      stats.largestFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${path.basename(file.path)}    ${formatSize(file.size)}`);
      });
    }

    if (stats.oldestFile) {
      console.log(
        `\nOldest file: ${path.basename(stats.oldestFile.path)} (${formatAgeDays(stats.oldestFile.ageDays)})`
      );
    }
  });

  await scanner.scan(directory);
}

async function runDuplicates(directory) {
  const finder = new DuplicateFinder();
  let processed = 0;
  let total = 0;

  finder.on('search-start', ({ directory: targetDir }) => {
    console.log(`?? Searching for duplicates in: ${targetDir}`);
    console.log('Calculating hashes...');
  });

  finder.on('file-processed', (data) => {
    processed = data.processed;
    total = data.total;
  });

  finder.on('file-error', ({ message }) => {
    console.error(`??  ${message}`);
  });

  finder.on('duplicates-found', ({ duplicateGroups, totalWasted }) => {
    process.stdout.write(`\rCalculating hashes... ${drawProgressBar(processed, total)} files\n`);

    console.log(`\nFound ${duplicateGroups.length} duplicate groups (${formatSize(totalWasted)} wasted):\n`);

    duplicateGroups.forEach((group, index) => {
      console.log('??????????????????????????????????');
      console.log(`Group ${index + 1} (${group.files.length} copies, ${formatSize(group.fileSize)} each):`);
      console.log(`  SHA-256: ${shortenHash(group.hash)}\n`);

      for (const file of group.files) {
        console.log(`  ?? ${file.path}`);
      }

      console.log(`\n  Wasted space: ${formatSize(group.wasted)}\n`);
    });

    console.log('??????????????????????????????????');
    console.log(`?? Total wasted space: ${formatSize(totalWasted)}`);
  });

  await finder.find(directory);
}

async function runOrganize(sourceDir, outputDir) {
  const organizer = new Organizer();
  let copied = 0;
  let total = 0;

  organizer.on('organize-start', ({ sourceDir: src, outputDir: out }) => {
    console.log(`?? Organizing: ${src}`);
    console.log(`Target: ${out}\n`);
    console.log('Creating folders...');
  });

  organizer.on('directory-created', ({ category }) => {
    console.log(`  ? ${category}/`);
  });

  organizer.on('copy-start', () => {
    if (copied === 0) {
      console.log('\nCopying files...');
    }
  });

  organizer.on('copy-complete', (data) => {
    copied = data.copied;
    total = data.total;
    process.stdout.write(`\rCopying files... ${drawProgressBar(copied, total)}`);
  });

  organizer.on('copy-error', ({ message }) => {
    console.error(`\n??  ${message}`);
  });

  organizer.on('organize-complete', (summary) => {
    if (summary.totalFiles > 0) {
      process.stdout.write('\n');
    }

    console.log('\n? Organization complete!\n');
    console.log('Summary:');
    console.log(`  Documents: ${String(summary.byCategory.Documents).padStart(4)} files > ${path.join(outputDir, 'Documents')}`);
    console.log(`  Images:    ${String(summary.byCategory.Images).padStart(4)} files > ${path.join(outputDir, 'Images')}`);
    console.log(`  Archives:  ${String(summary.byCategory.Archives).padStart(4)} files > ${path.join(outputDir, 'Archives')}`);
    console.log(`  Code:      ${String(summary.byCategory.Code).padStart(4)} files > ${path.join(outputDir, 'Code')}`);
    console.log(`  Videos:    ${String(summary.byCategory.Videos).padStart(4)} files > ${path.join(outputDir, 'Videos')}`);
    console.log(`  Other:     ${String(summary.byCategory.Other).padStart(4)} files > ${path.join(outputDir, 'Other')}`);

    console.log(`\nTotal copied: ${summary.totalCopied} files (${formatSize(summary.totalSize)})`);
  });

  await organizer.organize(sourceDir, outputDir);
}

async function runCleanup(directory, olderThanDays, confirm) {
  const cleanup = new Cleanup();
  let deleted = 0;
  let total = 0;

  cleanup.on('cleanup-start', ({ directory: dir, olderThanDays: days }) => {
    console.log(`?? Cleanup: ${dir}`);
    console.log(`Looking for files older than ${days} days...\n`);
  });

  cleanup.on('file-error', ({ message }) => {
    console.error(`??  ${message}`);
  });

  cleanup.on('candidates-found', (result) => {
    console.log(`Found ${result.totalCandidates} files to delete:\n`);

    const preview = result.files.slice(0, 10);
    for (const file of preview) {
      console.log(path.basename(file.path));
      console.log(`  Size: ${formatSize(file.size)}`);
      console.log(`  Modified: ${formatAgeDays(file.ageDays)} (${file.mtime.toISOString().split('T')[0]})\n`);
    }

    if (result.files.length > 10) {
      console.log(`... (${result.files.length - 10} more files)`);
    }

    console.log('??????????????????????????????????');
    console.log(`Total: ${result.totalCandidates} files (${formatSize(result.totalCandidateSize)})\n`);

    if (!result.confirm) {
      console.log('??  DRY RUN MODE: No files were deleted.');
      console.log('To actually delete these files, run with --confirm flag.');
      return;
    }

    if (result.totalCandidates > 0) {
      console.log(`??  DELETING ${result.totalCandidates} files (${formatSize(result.totalCandidateSize)}). This action cannot be undone!`);
    }
  });

  cleanup.on('file-deleted', ({ deletedCount, total: toDelete }) => {
    deleted = deletedCount;
    total = toDelete;
    process.stdout.write(`\rDeleting... ${drawProgressBar(deleted, total)}`);
  });

  cleanup.on('file-delete-error', ({ message }) => {
    console.error(`\n??  ${message}`);
  });

  cleanup.on('cleanup-complete', (result) => {
    if (!result.confirm) {
      return;
    }

    if (result.totalCandidates > 0) {
      process.stdout.write('\n');
    }

    console.log('? Cleanup complete!');
    console.log(`Deleted: ${result.deletedCount} files (${formatSize(result.freedSpace)} freed)`);
  });

  await cleanup.run(directory, olderThanDays, confirm);
}

async function main() {
  try {
    if (!command) {
      printUsage();
      process.exit(1);
    }

    if (command === 'scan') {
      const directory = args[1];
      if (!directory) {
        console.error('? Error: Missing directory argument for scan command');
        printUsage();
        process.exit(1);
      }

      await runScan(path.resolve(directory));
      return;
    }

    if (command === 'duplicates') {
      const directory = args[1];
      if (!directory) {
        console.error('? Error: Missing directory argument for duplicates command');
        printUsage();
        process.exit(1);
      }

      await runDuplicates(path.resolve(directory));
      return;
    }

    if (command === 'organize') {
      const sourceDir = args[1];
      const outputDir = parseFlagValue('--output');

      if (!sourceDir || !outputDir) {
        console.error('? Error: organize requires <source-directory> and --output <target-directory>');
        printUsage();
        process.exit(1);
      }

      await runOrganize(path.resolve(sourceDir), path.resolve(outputDir));
      return;
    }

    if (command === 'cleanup') {
      const directory = args[1];
      const olderThan = parseFlagValue('--older-than');
      const confirm = hasFlag('--confirm');

      if (!directory || !olderThan) {
        console.error('? Error: cleanup requires <directory> and --older-than <days>');
        printUsage();
        process.exit(1);
      }

      const olderThanDays = Number(olderThan);
      if (Number.isNaN(olderThanDays) || olderThanDays < 0) {
        console.error('? Error: --older-than must be a non-negative number');
        process.exit(1);
      }

      await runCleanup(path.resolve(directory), olderThanDays, confirm);
      return;
    }

    console.error(`? Error: Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  } catch (error) {
    console.error(`? ${error.message}`);
    process.exit(1);
  }
}

await main();

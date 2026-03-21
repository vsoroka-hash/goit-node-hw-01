# file-organizer

CLI-інструмент на Node.js для аналізу директорій, пошуку дублікатів, сортування файлів за категоріями та очищення застарілих даних.

## Встановлення

1. Перейдіть у директорію проєкту:

```bash
cd file-organizer
```

2. Переконайтесь, що встановлено Node.js 18+.

3. Команди запускаються без додаткових залежностей.

## NPM Scripts

```bash
npm run scan -- <directory>
npm run duplicates -- <directory>
npm run organize -- <source-directory> --output <target-directory>
npm run cleanup -- <directory> --older-than <days> [--confirm]
```

## Команди

### `scan`

Рекурсивно сканує директорію, збирає статистику за розмірами, типами файлів, віком, топ-3 найбільших файлів і найстаріший файл.

```bash
node file-organizer.js scan /path/to/directory
```

### `duplicates`

Шукає дублікати за SHA-256 хешами вмісту файлів.

- Хешування виконується через `fs.createReadStream()`.
- Показує групи дублікатів і сумарний обсяг зайвого місця.

```bash
node file-organizer.js duplicates /path/to/directory
```

### `organize`

Копіює файли у цільову директорію та розкладає по категоріях:

- `Documents`
- `Images`
- `Archives`
- `Code`
- `Videos`
- `Other`

Особливості:

- Для файлів `>= 10 MB` копіювання виконується через `pipeline()` зі streams.
- Для файлів `< 10 MB` використовується `fs.copyFile()`.
- При конфлікті назв створює суфікси: `file(1).pdf`, `file(2).pdf`.

```bash
node file-organizer.js organize /source/directory --output /target/directory
```

### `cleanup`

Знаходить файли старші за вказану кількість днів.

- Без `--confirm` працює у dry run режимі.
- З `--confirm` видаляє знайдені файли через `fs.unlink()`.

```bash
node file-organizer.js cleanup /path/to/directory --older-than 90
node file-organizer.js cleanup /path/to/directory --older-than 90 --confirm
```

## Обробка помилок

Всі файлові операції загорнуті в `try...catch` з конкретними повідомленнями для:

- `ENOENT` (не знайдено файл/директорію)
- `EACCES` (немає прав доступу)
- `EPERM` (операція заборонена)
- інші помилки (fallback-повідомлення)

У разі критичної помилки процес завершується з кодом `1`.

## EventEmitter архітектура

Кожна команда реалізована окремим класом:

- `Scanner extends EventEmitter`
- `DuplicateFinder extends EventEmitter`
- `Organizer extends EventEmitter`
- `Cleanup extends EventEmitter`

Події використовуються для відображення прогресу в реальному часі (`file-found`, `file-processed`, `copy-complete`, `file-deleted` тощо).

## Структура проєкту

```text
file-organizer/
+-- package.json
+-- .gitignore
+-- README.md
+-- file-organizer.js
L-- lib/
    +-- scanner.js
    +-- duplicates.js
    +-- organizer.js
    +-- cleanup.js
    L-- utils.js
```

## Швидкі приклади

```bash
# Сканування Downloads
npm run scan -- C:/Users/you/Downloads

# Пошук дублікатів
npm run duplicates -- C:/Users/you/Downloads

# Сортування у нову директорію
npm run organize -- C:/Users/you/Downloads --output C:/Users/you/Organized

# Dry run очищення файлів старше 120 днів
npm run cleanup -- C:/Users/you/Downloads --older-than 120

# Фактичне видалення
npm run cleanup -- C:/Users/you/Downloads --older-than 120 --confirm
```


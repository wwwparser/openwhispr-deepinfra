# Доработки этого форка (DeepInfra + надёжная транскрибация)

Это форк [OpenWhispr](https://github.com/OpenWhispr/openwhispr) (оригинал — MIT,
© OpenWhispr Team). Здесь добавлен новый провайдер транскрибации **DeepInfra** и
сделан ряд доработок, повышающих надёжность распознавания речи — особенно на тихом
микрофоне и с «безголовым» WebM от MediaRecorder.

Оригинальная функциональность OpenWhispr сохранена без изменений; всё ниже —
дополнения поверх апстрима.

## Что добавлено и исправлено

### 1. Новый провайдер транскрибации — DeepInfra
Полная интеграция Whisper от DeepInfra (`openai/whisper-large-v3-turbo` и
`openai/whisper-large-v3`) наравне с существующими провайдерами:
- UI выбора модели (`TranscriptionModelPicker`), вкладка DeepInfra, ссылка на
  консоль ключей;
- хранение ключа через `safeStorage` + загрузка из `.env` (`DEEPINFRA_API_KEY`);
- endpoints, реестр моделей (`modelRegistryData.json`), локали (en/ru), типы,
  preload/IPC — по образцу уже существующих провайдеров.

### 2. Устойчивость к «пустым» ответам DeepInfra
Turbo-модель DeepInfra на коротком/тихом аудио изредка отдаёт `HTTP 200` с пустым
`{"text":""}`. Добавлено:
- один быстрый повтор запроса при пустом ответе;
- **автоматический откат** `whisper-large-v3-turbo → whisper-large-v3`
  (отдельный, обычно «тёплый» инстанс), если turbo продолжает молчать.

### 3. Конвертация аудио в WAV перед отправкой (ffmpeg)
MediaRecorder отдаёт WebM/Opus без заголовка длительности, из-за чего Whisper
turbo на коротких клипах «спотыкается» (пустой/медленный ответ). Теперь перед
отправкой в DeepInfra аудио перекодируется встроенным **ffmpeg** в чистый
**WAV 16 кГц моно** (IPC-хендлер `convert-audio-to-wav`), что делает распознавание
быстрым и стабильным. При недоступности ffmpeg — мягкий фолбэк на оригинальный blob.

### 4. Нормализация тихого микрофона (speechnorm)
Тихие записи (−35…−40 dB) распознавались плохо. Конвертация в WAV идёт с фильтром
`speechnorm`, поднимающим уровень речи до нормального (~−20 dB), — заметно выше
точность на тихих микрофонах без ручной настройки Windows.

### 5. Прокси DeepInfra через main-процесс
Запросы из renderer (Chromium) к DeepInfra иногда получали пустые ответы, тогда
как идентичные запросы из Node/curl всегда успешны. Поэтому транскрибация
DeepInfra проксируется через main-процесс (`proxy-deepinfra-transcription`) —
надёжный сетевой путь.

### 6. Keep-warm пинг
Чтобы turbo не «остывал» (холодный старт 10–15 с после простоя), приложение раз в
2 минуты шлёт крошечный (0.3 с тишины) запрос, удерживая модель загруженной.
Работает только при активном провайдере DeepInfra; расход — копеечный.

### 7. Прочее
- Разовые миграции настроек (нормализация выбранной модели DeepInfra);
- дефолтная модель провайдера, записи в `.env.example` и локалях;
- уровень логов вынесен в `OPENWHISPR_LOG_LEVEL` (info по умолчанию).

## Ключи и безопасность
- Ключи API **не хранятся в коде и не коммитятся**. Реальные ключи — только в
  локальном `.env` (в `.gitignore`); шаблон без значений — в `.env.example`.
- В репозитории и его истории секретов нет.

## Затронутые файлы
`src/helpers/audioManager.js`, `src/helpers/ipcHandlers.js`,
`src/helpers/ffmpegUtils.js`, `src/helpers/environment.js`,
`src/helpers/openRouterTranscription.js` (новый), `src/stores/settingsStore.ts`,
`src/models/modelRegistryData.json`, `src/components/TranscriptionModelPicker.tsx`,
`src/components/notes/UploadAudioView.tsx`, `src/hooks/useSettings.ts`,
`src/config/constants.ts`, `src/types/electron.ts`, `preload.js`,
`src/locales/{en,ru}/translation.json`, `.env.example`.

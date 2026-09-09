export const storage = {
  "storage.saved": {
    "ru": "сохранено",
    "en": "saved"
  },
  "storage.unsupportedVersionOrDamagedProject": {
    "ru": "Неподдерживаемая версия или повреждённый патч",
    "en": "Unsupported version or damaged project"
  },
  "storage.theSavedProjectCouldNotBeRead": {
    "ru": "Сохранённый патч не прочитан. Оригинал сохранён; автосохранение приостановлено. Экспортируй текущий проект или восстанови резервную копию.",
    "en": "The saved project could not be read. The original was preserved and autosave is paused. Export the current project or restore a backup."
  },
  "storage.unsavedChanges": {
    "ru": "есть несохранённые изменения",
    "en": "unsaved changes"
  },
  "storage.savedNoSpaceForABackup": {
    "ru": "сохранено; нет места для резервной копии",
    "en": "saved; no space for a backup"
  },
  "storage.couldNotSaveYourChangesRemainOpen": {
    "ru": "Не удалось сохранить: {p0}. Изменения остаются открыты — экспортируй проект.",
    "en": "Could not save: {p0}. Your changes remain open — export the project."
  }
} as const;

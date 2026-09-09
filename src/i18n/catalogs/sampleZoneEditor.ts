export const sampleZoneEditor = {
  "sampleZoneEditor.samplerZones": {
    "ru": "зоны сэмплера (",
    "en": "sampler zones ("
  },
  "sampleZoneEditor.noteFrequencyAndVelocitySelectAZone": {
    "ru": "Частота и сила ноты выбирают зону. При пересечении играет первая; вне зон — основной сэмпл. Round-robin чередует до 8 записей зоны по кругу. У каждой записи своя основная частота; в скрэтче скорость задаёт жест.",
    "en": "Note frequency and velocity select a zone. The first matching zone wins; outside all zones, the main sample plays. Round-robin cycles through up to 8 recordings per zone. Each recording has its own root frequency; scratch playback follows the gesture."
  },
  "sampleZoneEditor.zone": {
    "ru": "зона",
    "en": "zone "
  },
  "sampleZoneEditor.recording": {
    "ru": "запись",
    "en": "recording "
  },
  "sampleZoneEditor.recordingNotFound": {
    "ru": "запись не найдена",
    "en": "recording not found"
  },
  "sampleZoneEditor.sampleRootHz": {
    "ru": "частота записи, Гц ",
    "en": "sample root, Hz "
  },
  "sampleZoneEditor.fromHz": {
    "ru": "от, Гц",
    "en": "from, Hz "
  },
  "sampleZoneEditor.toHz": {
    "ru": "до, Гц",
    "en": "to, Hz "
  },
  "sampleZoneEditor.velocityFrom": {
    "ru": "сила от",
    "en": "velocity from "
  },
  "sampleZoneEditor.velocityTo": {
    "ru": "сила до",
    "en": "velocity to "
  },
  "sampleZoneEditor.up": {
    "ru": "выше",
    "en": "up"
  },
  "sampleZoneEditor.deleteZone": {
    "ru": "удалить зону {p0}",
    "en": "delete zone {p0}"
  },
  "sampleZoneEditor.delete": {
    "ru": "удалить",
    "en": "delete"
  },
  "sampleZoneEditor.variation": {
    "ru": "вариант",
    "en": "variation "
  },
  "sampleZoneEditor.recordingForVariationInZone": {
    "ru": "Запись варианта {p0} зоны {p1}",
    "en": "Recording for variation {p0} in zone {p1}"
  },
  "sampleZoneEditor.rootHz": {
    "ru": "основа, Гц ",
    "en": "root, Hz "
  },
  "sampleZoneEditor.rootFrequencyForVariationInZone": {
    "ru": "Основная частота варианта {p0} зоны {p1}",
    "en": "Root frequency for variation {p0} in zone {p1}"
  },
  "sampleZoneEditor.moveVariationUpInZone": {
    "ru": "Поднять вариант {p0} зоны {p1}",
    "en": "Move variation {p0} up in zone {p1}"
  },
  "sampleZoneEditor.deleteVariationFromZone": {
    "ru": "Удалить вариант {p0} зоны {p1}",
    "en": "Delete variation {p0} from zone {p1}"
  },
  "sampleZoneEditor.deleteVariation": {
    "ru": "удалить вариант",
    "en": "delete variation"
  },
  "sampleZoneEditor.roundRobinVariation": {
    "ru": "+ вариант round-robin",
    "en": "+ round-robin variation"
  },
  "sampleZoneEditor.zoneFromLibrary": {
    "ru": "+ зона из библиотеки",
    "en": "+ zone from library"
  },
  "sampleZoneEditor.importARecordingIntoTheLibraryFirst": {
    "ru": "Сначала загрузи запись в библиотеку.",
    "en": "Import a recording into the library first."
  }
} as const;

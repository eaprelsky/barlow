export const bridge = {
  "bridge.theProjectSnapshotExceedsTheBridgeS": {
    "ru": "Снимок проекта превышает лимит моста 8 МиБ.",
    "en": "The project snapshot exceeds the bridge’s 8 MiB limit."
  },
  "bridge.couldNotVerifyTheLocalHostCheck": {
    "ru": "Не удалось подтвердить локальный хост. Проверь код подключения.",
    "en": "Could not verify the local host. Check the pairing code."
  },
  "bridge.localAgentConnected": {
    "ru": "Локальный агент подключён.",
    "en": "Local agent connected."
  },
  "bridge.permissionRequired": {
    "ru": "Нет разрешения: {p0}",
    "en": "Permission required: {p0}"
  },
  "bridge.couldNotSendTheProjectSnapshot": {
    "ru": "Не удалось передать снимок проекта",
    "en": "Could not send the project snapshot"
  },
  "bridge.hostVerificationFailed": {
    "ru": "Ошибка подтверждения хоста.",
    "en": "Host verification failed."
  },
  "bridge.connectingToTheLocalAgent": {
    "ru": "Подключение к локальному агенту…",
    "en": "Connecting to the local agent…"
  },
  "bridge.theAgentIsConnectedToAnotherTab": {
    "ru": "Агент подключён к другой вкладке. Нажми «подключить», чтобы вернуть управление.",
    "en": "The agent is connected to another tab. Click Connect to regain control."
  },
  "bridge.thePairingCodeWasRejectedOrHas": {
    "ru": "Код подключения отклонён или устарел. Получи новый код у локального агента.",
    "en": "The pairing code was rejected or has expired. Get a new code from the local agent."
  },
  "bridge.waitingForTheLocalAgent": {
    "ru": "Ожидание локального агента…",
    "en": "Waiting for the local agent…"
  },
  "bridge.localAgentDisconnected": {
    "ru": "Локальный агент отключён.",
    "en": "Local agent disconnected."
  },
  "bridge.thePointerMustStartWith": {
    "ru": "указатель должен начинаться с «/»",
    "en": "The pointer must start with /"
  },
  "bridge.invalidParameterPath": {
    "ru": "недопустимый путь параметра",
    "en": "Invalid parameter path"
  },
  "bridge.emptyPointer": {
    "ru": "пустой указатель",
    "en": "Empty pointer"
  },
  "bridge.thePathEndsAt": {
    "ru": "путь обрывается на «/{p0}»",
    "en": "The path ends at /{p0}"
  },
  "bridge.thePathMustContainOnlyThePatch": {
    "ru": "путь должен содержать только собственные поля патча",
    "en": "The path must contain only the patch’s own properties"
  },
  "bridge.theParentIsNotAnObject": {
    "ru": "родитель «/{p0}» — не объект",
    "en": "The parent /{p0} is not an object"
  },
  "bridge.propertyDoesNotExistAtThisPath": {
    "ru": "поля «{p0}» нет по этому пути",
    "en": "Property {p0} does not exist at this path"
  },
  "bridge.unknownCommand": {
    "ru": "неизвестная команда",
    "en": "unknown command"
  }
} as const;

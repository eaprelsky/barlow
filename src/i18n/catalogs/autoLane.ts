export const autoLane = {
  "autoLane.12kHz": {
    "ru": "12k Гц",
    "en": "12k Hz"
  },
  "autoLane.60Hz": {
    "ru": "60 Гц",
    "en": "60 Hz"
  },
  "autoLane.wet": {
    "ru": "эффект",
    "en": "wet"
  },
  "autoLane.dry": {
    "ru": "исходный",
    "en": "dry"
  },
  "autoLane.2S": {
    "ru": "2 с",
    "en": "2 s"
  },
  "autoLane.10Ms": {
    "ru": "10 мс",
    "en": "10 ms"
  },
  "autoLane.sampleHold": {
    "ru": "ступени S&H",
    "en": "sample & hold"
  },
  "autoLane.perlinNoise": {
    "ru": "перлин",
    "en": "Perlin noise"
  },
  "autoLane.step": {
    "ru": "шаг {p0}",
    "en": "step {p0}"
  },
  "autoLane.modulationHzDepthTheGeneratorRunsIndependently": {
    "ru": "Вклад модуляции ({p0}, {p1} Гц, глубина {p2}%) — живой генератор идёт своим ходом, показана форма качания. «→ в кривую» в списке модуляций запечёт её точками",
    "en": "Modulation ({p0}, {p1} Hz, depth {p2}%): the generator runs independently; this line shows its shape. Use “→ to curve” to bake it into breakpoints"
  },
  "autoLane.curveEnterAddsAFlatCurveTab": {
    "ru": "Кривая: {p0}. Enter — добавить ровную кривую; Tab — точки, стрелки — редактировать.",
    "en": "Curve: {p0}. Enter adds a flat curve; Tab selects points; arrow keys edit them."
  },
  "autoLane.curveClickToAddAPointAt": {
    "ru": "Кривая «{p0}» по шагам: клик — точка на границе шага (Shift — свободно), тяни — двигай, правый клик — убрать",
    "en": "“{p0}” curve: click to add a point at a step boundary (Shift for free timing), drag to move, right-click to remove"
  },
  "autoLane.noPoints": {
    "ru": "Нет точек",
    "en": "No points"
  },
  "autoLane.onePoint": {
    "ru": "Одна точка",
    "en": "One point"
  },
  "autoLane.modulation": {
    "ru": "– – модуляции",
    "en": "– – modulation"
  },
  "autoLane.sceneFadeInDragThePeakTo": {
    "ru": "Вход в сцену: потяни вершину — длительность (",
    "en": "Scene fade-in: drag the peak to set duration ("
  },
  "autoLane.ms": {
    "ru": "мс)",
    "en": " ms)"
  },
  "autoLane.ms18": {
    "ru": "мс",
    "en": " ms"
  },
  "autoLane.sceneFadeOutDragThePeakTo": {
    "ru": "Выход из сцены: потяни вершину — длительность (",
    "en": "Scene fade-out: drag the peak to set duration ("
  },
  "autoLane.ms21": {
    "ru": "мс",
    "en": " ms"
  },
  "autoLane.pointUpDownChangesLevelLeftRight": {
    "ru": "Точка {p0}: вверх/вниз — уровень, влево/вправо — время, Delete — удалить",
    "en": "Point {p0}: up/down changes level, left/right changes time, Delete removes"
  },
  "autoLane.step23": {
    "ru": "шаг {p0}, {p1}%",
    "en": "step {p0}, {p1}%"
  }
} as const;

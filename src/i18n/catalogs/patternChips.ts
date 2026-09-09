export const patternChips = {
  "patternChips.muteThisTrackInTheCurrentScene": {
    "ru": "Тишина в этой сцене — как пустой эскиз: дорожка молчит, но часы партии идут — сняв мьют, войдёшь в фазе. В других сценах эскиз играет как обычно",
    "en": "Mute this track in the current scene while its clip clock keeps running. Unmuting rejoins at the current phase. Other scenes are unaffected."
  },
  "patternChips.mutedInScenes": {
    "ru": ". Мьют в {p0} сценах",
    "en": ". Muted in {p0} scenes"
  },
  "patternChips.independentVariationClickToPlayInThis": {
    "ru": "вариация (форк). Клик — играть в этой сцене, правый клик — новая вариация от этого",
    "en": "Independent variation. Click to play in this scene; right-click to create another variation."
  },
  "patternChips.aClipSharedByEverySceneThat": {
    "ru": "эскиз дорожки — общий для всех сцен, где играет. Клик — играть, правый клик — независимая копия (форк)",
    "en": "A clip shared by every scene that uses it. Click to play; right-click to make an independent copy."
  },
  "patternChips.usedInScenesEditsAffectAllOf": {
    "ru": ". Играет в {p0} сценах — правка эскиза меняет его во всех них",
    "en": ". Used in {p0} scenes — edits affect all of them"
  },
  "patternChips.newEmptyClipUpTo128": {
    "ru": "Новый пустой эскиз (до 128)",
    "en": "New empty clip (up to 128)"
  },
  "patternChips.deleteClipScenesUsingItWillSwitch": {
    "ru": "Удалить эскиз «{p0}» — сцены, где он играл, перейдут на первый оставшийся",
    "en": "Delete clip “{p0}”; scenes using it will switch to the first remaining clip"
  }
} as const;

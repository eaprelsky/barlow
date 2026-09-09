import { t as msg } from '../i18n/runtime.ts';
// Гиды онбординга: данные сценариев + хранение отметок + шина запуска.
// Принцип для «полного новичка»: один шаг = одно действие. Шаг с expect
// завершается только когда пользователь кликнул подсвеченное; клики мимо
// перехватываются (карточка подсказывает). Текст — одна короткая фраза.

export interface GuideStep {
  /** Цель подсветки (CSS-селектор, обычно data-ob). Нет цели — карточка
   *  по центру (приветствие/финал). */
  target?: string;
  /** Одна короткая фраза: что сделать. */
  say: string;
  /** Вторая строка — только если без неё никак. */
  hint?: string;
  /** Шаг-действие: гид ждёт клик (или правый клик) по цели, клики мимо
   *  блокирует. Без expect — шаг «читать», листается «далее». */
  expect?: 'click' | 'contextmenu';
  /** С какой стороны карточка; по умолчанию сама выберет, где влезет. */
  side?: 'bottom' | 'top' | 'left' | 'right';
  /** Панель, которую надо раскрыть перед этим шагом («mix», «chain», «ai»). */
  open?: string;
  /** Своя надпись кнопке «далее» (приветствие: «поехали»). */
  nextLabel?: string;
}

export interface Guide {
  id: string;
  title: string;
  /** Короткая задача — видно в меню «?». */
  goal: string;
  /** Где в меню: путь музыканта (по порядку работы над треком) или
   *  отдельные умения. */
  section: 'path' | 'more';
  steps: GuideStep[];
}

// Гиды названы от задачи музыканта и идут в порядке работы над треком:
// добавь инструмент → поменяй звук → заполни нотами → сделай вариации →
// собери сцену → навесь эффекты («комната») → под конец сведение
// (шум, компрессия). Отдельные умения (шкалы, сэмплы, ИИ…) — в конце меню.
export const GUIDES: Guide[] = [
  {
    id: 'sound-design', get title() { return msg("guides.buildAnEvolvingSound"); }, get goal() { return msg("guides.layersMSEGAndSynthesisMethods"); }, section: 'more',
    steps: [
      { target: '[data-ob="mode-inst"]', get say() { return msg("guides.openTheSelectedTrackSInstrument"); }, expect: 'click' },
      { target: '[data-ob="instrument-layers"]', get say() { return msg("guides.layersCombineTheMainVoiceWithUp"); }, get hint() { return msg("guides.addAPresetOpenItsLayerName"); } },
      { target: '[data-ob="tab-snd"]', get say() { return msg("guides.openTheMainVoiceSSource"); }, expect: 'click' },
      { target: '[data-ob="src-seg"]', get say() { return msg("guides.chooseWaveformForSynthesisOrSampleFor"); }, get hint() { return msg("guides.waveformSourcesIncludeOperatorsFMWavetableFrames"); } },
      { target: '[data-ob="tab-env"]', get say() { return msg("guides.openTheEnvelopeTheNoteSAmplitude"); }, expect: 'click' },
      { target: '[data-ob="envelope-mode"]', get say() { return msg("guides.breakpointModeLetsYouDrawMultipleAttacks"); }, get hint() { return msg("guides.startWithAPresetShapeCurveChanges"); } },
      { target: '[data-ob="tab-timbre"]', get say() { return msg("guides.openColorationAndFilters"); }, expect: 'click' },
      { target: '[data-ob="voice-color"]', get say() { return msg("guides.ringModulationAddsMetallicTonesWavefoldingChanges"); }, get hint() { return msg("guides.startWithOneProcessAndALow"); } },
      { target: '[data-ob="preview-in-track"]', get say() { return msg("guides.auditionTheSoundInYourPartS"); }, expect: 'click' },
      { target: '[data-ob="save-inst"]', get say() { return msg("guides.saveTheFinishedInstrumentToMyInstruments"); }, get hint() { return msg("guides.allVoicesAndTheirSettingsAreSaved"); } },
    ],
  },
  {
    id: 'main',
    get title() { return msg("guides.introductionBuildABeat"); },
    get goal() { return msg("guides.playAddANoteAndHearYour"); },
    section: 'path',
    steps: [
      {
        // цели нет — карточка по центру
        get say() { return msg("guides.letSBuildYourFirstBeatFollow"); },
        get hint() { return msg("guides.exitAnytimeWithEscOrTheClose"); },
        get nextLabel() { return msg("guides.letSGo"); },
      },
      {
        target: '[data-ob="play"]',
        get say() { return msg("guides.pressPlayToStartTheMusic"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="play"]',
        get say() { return msg("guides.nowPressStop"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="roll"] .cell',
        get say() { return msg("guides.clickACellToAddANote"); },
        get hint() { return msg("guides.useTheHighlightedGrid"); },
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="play"]',
        get say() { return msg("guides.pressPlayAgainToHearYourNote"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scenes"]',
        get say() { return msg("guides.scenesAboveAreSectionsOfThePiece"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="help"]',
        get say() { return msg("guides.theQuestionMarkButtonExplainsInterfaceElements"); },
        get hint() { return msg("guides.clickToFinishTheIntroduction"); },
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'tracks',
    get title() { return msg("guides.addAnInstrument"); },
    get goal() { return msg("guides.yourFirstSoundAddATrackAnd"); },
    section: 'path',
    steps: [
      {
        target: '[data-ob="add-track"]',
        get say() { return msg("guides.clickTrackATrackAppearsAndThe"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="track-name"]',
        get say() { return msg("guides.typeTheTrackNameHere"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="solo"]',
        get say() { return msg("guides.pressSToHearOnlyThisTrack"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="mode"]',
        get say() { return msg("guides.clipEditsTheNotesTrackEditsShared"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="fold"]',
        get say() { return msg("guides.pressTheCollapseArrowToReduceThe"); },
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'sound',
    get title() { return msg("guides.changeASound"); },
    get goal() { return msg("guides.chooseASoundShapeItsEnvelopeAnd"); },
    section: 'path',
    steps: [
      {
        target: '[data-ob="inst-chip"]',
        get say() { return msg("guides.clickTheInstrumentBadgeInTheTrack"); },
        get hint() { return msg("guides.theBadgeIsAvailableInExpandedAnd"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-cards"] .inst-card',
        get say() { return msg("guides.clickASoundToApplyItPlay"); },
        get hint() { return msg("guides.yourNotesAndRhythmStayUnchanged"); },
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="mode-inst"]',
        get say() { return msg("guides.clickInstrumentToOpenTheSoundEditor"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="tab-env"]',
        get say() { return msg("guides.theEnvelopeTabHasAmplitudePitchAnd"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="tab-timbre"]',
        get say() { return msg("guides.theTimbreTabContainsFiltersRingModulation"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="save-inst"]',
        get say() { return msg("guides.saveStoresYourSoundUnderMyInstruments"); },
        side: 'bottom',
      },
    ],
  },
  {
    id: 'roll',
    get title() { return msg("guides.drawNotes"); },
    get goal() { return msg("guides.addNotesAndChordsThenMoveThem"); },
    section: 'path',
    steps: [
      {
        target: '[data-ob="roll"] .cell',
        get say() { return msg("guides.clickToAddANoteClickAgain"); },
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="roll"] .cell',
        get say() { return msg("guides.multipleNotesInOneColumnMakeA"); },
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="scale-rows"]',
        get say() { return msg("guides.rowsArePitchesRatiosToTheRoot"); },
        side: 'left',
      },
      {
        target: '.roll .col-num',
        get say() { return msg("guides.theStepNumberOpensVelocityAndProbability"); },
        get hint() { return msg("guides.useTheWheelOverANoteTo"); },
        side: 'top',
      },
      {
        target: '[data-ob="roll"]',
        get say() { return msg("guides.dragABoxFromAnEmptyCell"); },
        get hint() { return msg("guides.ctrlCVCopiesAndPastesDelete"); },
        side: 'top',
      },
      {
        target: '[data-ob="roll"] .note-bar',
        get say() { return msg("guides.dragANoteSRightEdgeTo"); },
        side: 'top',
      },
    ],
  },
  {
    id: 'generators',
    get title() { return msg("guides.generateNotes"); },
    get goal() { return msg("guides.createAPatternAndRefineItWith"); },
    section: 'path',
    steps: [
      {
        target: '[data-ob="fill-btn"]',
        get say() { return msg("guides.clickFillToOpenPatternTools"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="fill-even"]',
        get say() { return msg("guides.clickEvenlySpacedToDistributeNotesAround"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="fill-mutate"]',
        get say() { return msg("guides.clickMutateForRandomEditsListenKeep"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="fill-clear"]',
        get say() { return msg("guides.clearRemovesTheNotesCtrlZRestores"); },
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'sketches',
    get title() { return msg("guides.makeVariations"); },
    get goal() { return msg("guides.copyAClipThenChangeItsPattern"); },
    section: 'path',
    steps: [
      {
        target: '[data-ob="chips"]',
        get say() { return msg("guides.badgesAreThisTrackSClipsThe"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="chip-add"]',
        get say() { return msg("guides.pressForAnEmptyClip"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="chips"] .chip:not(.mute):not(.add):not(.del)',
        get say() { return msg("guides.rightClickABadgeToMakeA"); },
        expect: 'contextmenu',
        side: 'bottom',
      },
      {
        target: '[data-ob="length"]',
        get say() { return msg("guides.lengthSetsTheNumberOfStepsIn"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="rate"]',
        get say() { return msg("guides.stepSetsThisClipSStepDuration"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="chip-mute"]',
        get say() { return msg("guides.pressMToMuteTheTrackIn"); },
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'arp',
    get title() { return msg("guides.arpeggiateAChord"); },
    get goal() { return msg("guides.subdivideANoteToPlayAFigure"); },
    section: 'path',
    steps: [
      {
        target: '[data-ob="mode-inst"]',
        expect: 'click',
        get say() { return msg("guides.clickInstrumentOnTheTrackToOpen"); },
        side: 'bottom',
        get hint() { return msg("guides.theArpeggiatorIsOnTheTimbreTab"); },

      },
      {
        target: '[data-ob="tab-timbre"]',
        get say() { return msg("guides.openTimbre"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="arp"]',
        get say() { return msg("guides.createAChordOf23Notes"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="arp-mode"]',
        get say() { return msg("guides.orderChoosesTheFigureUpDownRandom"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="arp-speed"]',
        get say() { return msg("guides.subdivisionDividesTheOriginalNoteIntoEqual"); },
        side: 'bottom',
      },
    ],
  },
  {
    id: 'arrangement',
    get title() { return msg("guides.buildAScene"); },
    get goal() { return msg("guides.combineClipVariationsIntoASection"); },
    section: 'path',
    steps: [
      {
        target: '[data-ob="scenes"] .scene-btn',
        get say() { return msg("guides.clickASceneToSelectItFor"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scene-add"]',
        get say() { return msg("guides.pressToCreateASceneFromThe"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scenes"] .scene-btn',
        get say() { return msg("guides.dragASceneButtonToReorderThe"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="scene-edit"]',
        get say() { return msg("guides.doubleClickASceneToRenameIt"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="follow-chain"]',
        get say() { return msg("guides.enableSequencePlaybackToMoveThroughThe"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="chain-panel"]',
        open: 'chain',
        get say() { return msg("guides.eachTileSelectsASceneBarCount"); },
        side: 'bottom',
      },
    ],
  },
  {
    id: 'effects',
    get title() { return msg("guides.trackEffects"); },
    get goal() { return msg("guides.delayReverbAndDistortionInAProcessing"); },
    section: 'path',
    steps: [
      {
        target: '[data-ob="mode-track"]',
        expect: 'click',
        get say() { return msg("guides.openTheTrackTabToFindIts"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="fx-add"]',
        get say() { return msg("guides.useEffectToAddProcessing"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="fx-list"] .mod-row',
        get say() { return msg("guides.rowsShowTheProcessingOrderDragThe"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="fx-list"]',
        get say() { return msg("guides.trackEffectsAreSharedByAllIts"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="mode-sketch"]',
        get say() { return msg("guides.returnToClipAutomationBelongsToThe"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="auto-toggle"]',
        get say() { return msg("guides.expandAutomationToSeeTheClipS"); },
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="mods-add"]',
        get say() { return msg("guides.addModulationToMoveAParameterAutomatically"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="mods-list"] .mod-row',
        get say() { return msg("guides.useKnobsForRateAndDepthSync"); },
        side: 'bottom',
      },
    ],
  },
  {
    id: 'mix',
    get title() { return msg("guides.mixingNoiseAndCompression"); },
    get goal() { return msg("guides.balanceTracksAndShapeTheMaster"); },
    section: 'path',
    steps: [
      {
        target: '[data-ob="mixer-btn"]',
        get say() { return msg("guides.clickMixerToOpenTheChannels"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="mix-track"]',
        get say() { return msg("guides.eachTrackHasLevelPanAndA"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="mix-master"]',
        open: 'mix',
        get say() { return msg("guides.masterNoiseAddsAirOrTapeTexture"); },
        side: 'bottom',
      },
      {
        target: '.master-vol',
        get say() { return msg("guides.masterVolumeIsInTheTransportBar"); },
        side: 'bottom',
      },
    ],
  },

  // ---- Отдельные умения ----
  {
    id: 'auto',
    get title() { return msg("guides.clipAutomation"); },
    get goal() { return msg("guides.moveVolumeFilterAndPanWithCurves"); },
    section: 'more',
    steps: [
      {
        target: '[data-ob="auto-toggle"]',
        get say() { return msg("guides.expandAutomationBelowTheNoteGridTo"); },
        expect: 'click',
        side: 'top',
      },
      {
        target: 'svg.auto-lane',
        get say() { return msg("guides.clickTheLaneToAddAPoint"); },
        get hint() { return msg("guides.holdShiftForFreeTimingRightClick"); },
        expect: 'click',
        side: 'top',
      },
      {
        target: '.auto-box .seg button:not(.on)',
        get say() { return msg("guides.switchBetweenVolumeFilterAndPanEach"); },
        expect: 'click',
        side: 'top',
      },
      {
        target: '.auto-lane [data-ob="fade-in"]',
        get say() { return msg("guides.theVolumeLaneHasSceneFadeIn"); },
        side: 'top',
      },
      {
        target: '[data-ob="mods-add"]',
        get say() { return msg("guides.addModulationToMoveThisParameterWith"); },
        get hint() { return msg("guides.theDashedLineShowsTheModulationShape"); },
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="mods-list"] .mod-row',
        get say() { return msg("guides.setRateAndDepthSyncFollowsTempo"); },
        side: 'top',
      },
    ],
  },
  {
    id: 'browser',
    get title() { return msg("guides.instrumentBrowser"); },
    get goal() { return msg("guides.findAuditionAndApplyPresetsOrSamples"); },
    section: 'more',
    steps: [
      {
        target: '[data-ob="library-btn"]',
        get say() { return msg("guides.clickInstrumentsToOpenPresetsAndSamples"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-search"]',
        get say() { return msg("guides.searchNamesAndDescriptionsDubstepFindsWobble"); },
        get hint() { return msg("guides.collectionsFilterByMusicalRoleRhythmBass"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-cards"] .inst-card',
        get say() { return msg("guides.playAuditionsThePresetInItsRecommended"); },
        get hint() { return msg("guides.existingNotesRetainTheirFrequenciesSoThe"); },
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="sb-tab-samples"]',
        get say() { return msg("guides.openSamplesToSeeAllRecordings"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="library"]',
        get say() { return msg("guides.playAuditionsASampleClickItsName"); },
        side: 'top',
      },
    ],
  },
  {
    id: 'scales',
    get title() { return msg("guides.chooseATuning"); },
    get goal() { return msg("guides.slendroEqualDivisionsAndCustomRatios"); },
    section: 'more',
    steps: [
      {
        target: '[data-ob="scale-btn"]',
        get say() { return msg("guides.clickThePitchScaleButtonToOpen"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scale-search"]',
        get say() { return msg("guides.searchForSlendroShrutiOrMaqam"); },
        side: 'bottom',
      },
      {
        target: '.scale-item',
        get say() { return msg("guides.clickATuningToApplyIt"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scale-tools"]',
        get say() { return msg("guides.hereYouCanUseNEqualDivisions"); },
        side: 'top',
      },
    ],
  },
  {
    id: 'samples',
    get title() { return msg("guides.samples"); },
    get goal() { return msg("guides.importOrGenerateASound"); },
    section: 'more',
    steps: [
      {
        target: '[data-ob="mode-inst"]',
        expect: 'click',
        get say() { return msg("guides.clickInstrumentOnTheTrackToOpen130"); },
        side: 'bottom',
        get hint() { return msg("guides.sampleControlsRequireASampleSource"); },
      },
      {
        target: '[data-ob="snd-sample"]',
        get say() { return msg("guides.chooseAStoredSampleOrImportA"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="sample-mode"]',
        get say() { return msg("guides.directGranularAndScratchModesAreAll"); },
        get hint() { return msg("guides.regionTrimmingHarmonicAnalysisAndGenerationAre"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="gen-bar"]',
        get say() { return msg("guides.describeASoundForAIToGenerate"); },
        side: 'top',
      },
      {
        target: '[data-ob="library-btn"]',
        get say() { return msg("guides.clickInstrumentsToFindPresetsAndSamples"); },
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'scratch',
    get title() { return msg("guides.scratch"); },
    get goal() { return msg("guides.recordAMouseGestureAndPlayIt"); },
    section: 'more',
    steps: [
      {
        target: '[data-ob="mode-inst"]',
        expect: 'click',
        get say() { return msg("guides.clickInstrumentOnTheTrackToOpen139"); },
        side: 'bottom',
        get hint() { return msg("guides.chooseASampleSourceFirst"); },
      },
      {
        target: '[data-ob="sample-mode"]',
        get say() { return msg("guides.onSourceChooseScratchMode"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="scratch-rec"]',
        get say() { return msg("guides.clickRecordGesture"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scratch-pad"]',
        get say() { return msg("guides.moveAcrossThePadToRecordYour"); },
        get hint() { return msg("guides.upMovesTowardTheSampleSEnd"); },
        side: 'top',
      },
      {
        target: '[data-ob="scratch-play"]',
        get say() { return msg("guides.clickAuditionToPlayTheGestureAs"); },
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'wave',
    get title() { return msg("guides.waveformEditor"); },
    get goal() { return msg("guides.trimASampleOrBuildASound"); },
    section: 'more',
    steps: [
      {
        target: '[data-ob="mode-inst"]',
        expect: 'click',
        get say() { return msg("guides.clickInstrumentToOpenTheSoundAnd"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="we-canvas"]',
        get say() { return msg("guides.dragOverTheWaveformToSelectA"); },
        get hint() { return msg("guides.regionControlsHarmonicAnalysisAndScratchAre"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="we-fft"] button',
        get say() { return msg("guides.clickSampleWaveformToCreateAnApproximate"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="we-draft-row"]',
        get say() { return msg("guides.editsStayInTheDraftAuditionIt"); },
        get hint() { return msg("guides.brightLineIsTheDraftDimLine"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="we-partials"]',
        get say() { return msg("guides.operatorRows2IsAnOctaveTail"); },
        get hint() { return msg("guides.unisonVibratoFormantsAndWaveformRecipesAre"); },
        side: 'top',
      },
    ],
  },
  {
    id: 'ai',
    get title() { return msg("guides.aiGeneration"); },
    get goal() { return msg("guides.connectAServiceAndGenerateFromA"); },
    section: 'more',
    steps: [
      {
        target: '[data-ob="ai-btn"]',
        get say() { return msg("guides.openAISettingsFromTheSettingsMenu"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="ai-key"]',
        open: 'ai',
        get say() { return msg("guides.chooseAServiceAndEnterAnAPI"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="gen-bar"]',
        get say() { return msg("guides.describeTheSoundThenGenerateASample"); },
        side: 'top',
      },
    ],
  },
  {
    id: 'files',
    get title() { return msg("guides.saveAndShare"); },
    get goal() { return msg("guides.exportAudioOrACompleteProject"); },
    section: 'more',
    steps: [
      {
        target: '[data-ob="title"]',
        get say() { return msg("guides.theProjectSavesAutomaticallyItsNameIs"); },
        side: 'bottom',
      },
      {
        target: '[data-ob="file-menu"]',
        get say() { return msg("guides.openFile"); },
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="file-menu"]',
        get say() { return msg("guides.exportWAVCreatesAudioSaveProjectCreates"); },
        get hint() { return msg("guides.openProjectAcceptsJSONAndZIPImporting"); },
        side: 'bottom',
      },
    ],
  },
  {
    id: 'audition', get title() { return msg("guides.prepareALibrarySound"); },
    get goal() { return msg("guides.compareItInAClipAndChoose"); }, section: 'more',
    steps: [
      { target: '[data-ob="mode-inst"]', get say() { return msg("guides.openInstrumentOnTheDesiredTrack"); }, expect: 'click', side: 'bottom' },
      { target: '[data-ob="recommended-hz"]', get say() { return msg("guides.chooseAFrequencyThatRepresentsTheSound"); }, side: 'bottom' },
      { target: '[data-ob="preview-timbre"]', get say() { return msg("guides.clickSoundToAuditionItForThe"); }, expect: 'click', side: 'bottom' },
      { target: '[data-ob="preview-in-track"]', get say() { return msg("guides.clickInClipToCompareWithThe"); }, expect: 'click', side: 'bottom' },
      { target: '[data-ob="save-inst"]', get say() { return msg("guides.saveTheInstrumentToStoreItsAudition"); }, side: 'bottom' },
    ],
  },
];

export const guideById = (id: string): Guide | undefined => GUIDES.find((g) => g.id === id);

// ---- Отметки прохождения (localStorage) ----

const STORE_KEY = 'barlow.onboarding.v1';

interface ObStore {
  /** Приглашение к гидам показано — пульс на кнопке «?» снят. */
  invited?: boolean;
  seen: Record<string, true>;
}

function readStore(): ObStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ObStore>;
      if (parsed && typeof parsed.seen === 'object' && parsed.seen) {
        return { invited: parsed.invited, seen: parsed.seen };
      }
    }
  } catch {
    /* отметки необязательны */
  }
  return { seen: {} };
}

function writeStore(s: ObStore) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* приватный режим — переживём */
  }
}

/** Онбординг ни разу не открывали — при первом заходе стартует вводный. */
export const onboardingUntouched = (): boolean => {
  const s = readStore();
  return !s.invited && Object.keys(s.seen).length === 0;
};

export const needsInvite = (): boolean => !readStore().invited;

export const markInvited = (): void => {
  const s = readStore();
  if (s.invited) return;
  writeStore({ ...s, invited: true });
};

export const isGuideSeen = (id: string): boolean => !!readStore().seen[id];

/** Гид считается пройденным, когда его закончили (даже мгновенно). */
export const markGuideSeen = (id: string): void => {
  const s = readStore();
  if (s.seen[id]) return;
  writeStore({ ...s, seen: { ...s.seen, [id]: true } });
};

// ---- Шина запуска ----

export interface GuideStart {
  scope?: string;
  /** Zero-based index in Guide.steps; UI labels display index + 1. */
  step?: number;
}

type StartFn = (guideId: string, opts?: GuideStart) => void;

// HelpHint'ы разбросаны по компонентам; протаскивать колбэк через все
// пропсы ради статичной кнопки — шум. Приложение регистрирует стартер,
// кнопки зовут launchGuide.
let starter: StartFn = () => {};

export const registerGuideStarter = (fn: StartFn): void => {
  starter = fn;
};

export const launchGuide = (guideId: string, opts?: GuideStart): void => {
  starter(guideId, opts);
};

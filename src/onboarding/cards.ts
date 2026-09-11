import { t as msg } from '../i18n/runtime.ts';
// Реестр карточек контролов для режима «что это?» (и будущих подсказок):
// ключ — значение data-ob. Одна карточка = один контрол: что это и что
// делает; ссылка на гид — мостик к линейному обучению. Карточки —
// описательный регистр («что это»), тексты гидов — повелительный
// («сделай так»): они не сливаются, только ссылаются.

export interface HelpCard {
  /** Имя контрола — заголовок карточки. */
  title: string;
  /** Что это и что делает (одно-два предложения). */
  text: string;
  how?: string;
  example?: string;
  /** Где про это рассказывают по шагам. */
  guide?: { id: string; step?: number };
}

export const CARDS: Record<string, HelpCard> = {
  'synthesis-mode': { get title() { return msg("cards.synthesisMethod"); }, get text() { return msg("cards.operatorsAddAndModulateWaveformsWavetableBlends"); } },
  wavetable: { get title() { return msg("cards.wavetableAnEvolvingWaveform"); }, get text() { return msg("cards.selectAFrameAndDrawItOr"); } },
  'va-oscillator': { get title() { return msg("cards.vaAnalogStyleWaveforms"); }, get text() { return msg("cards.sawtoothIsBrightAndDenseTriangleIs"); } },
  'voice-color': { get title() { return msg("cards.ringModulationWavefoldingAndCombFiltering"); }, get text() { return msg("cards.ringModulationMultipliesTheSoundByAnother"); } },
  'instrument-layers': { get title() { return msg("cards.instrumentLayers"); }, get text() { return msg("cards.combineTheMainVoiceWithUpTo"); } },
  'envelope-mode': { get title() { return msg("cards.amplitudeShape"); }, get text() { return msg("cards.theSimpleEnvelopeSetsAttackPeakHold"); } },
  mseg: { get title() { return msg("cards.multiSegmentEnvelopeMSEG"); }, get text() { return msg("cards.chooseAShapeOrDoubleClickTo"); } },
  'preset-audition': { get title() { return msg("cards.auditionAnInstrument"); }, get text() { return msg("cards.playOneNoteInThePresetS"); }, guide: { id: 'browser', step: 2 } },
  'recommended-hz': { get title() { return msg("cards.libraryAuditionFrequency"); }, get text() { return msg("cards.theSoundAuditionButtonUsesThisFrequency"); }, guide: { id: 'audition', step: 1 } },
  'preview-in-track': { get title() { return msg("cards.auditionInTheClip"); }, get text() { return msg("cards.hearTheInstrumentAtTheLowestRow"); } },
  'preview-timbre': { get title() { return msg("cards.auditionForTheLibrary"); }, get text() { return msg("cards.playOneNoteAtTheAuditionFrequency"); }, guide: { id: 'audition', step: 2 } },
  'track-voicing': { get title() { return msg("cards.glideAndVoiceChoking"); }, get text() { return msg("cards.newNoteCutsOffPreviousPreventsOverlapping"); } },
  portamento: { get title() { return msg("cards.glidePortamento"); }, get text() { return msg("cards.timeForASmoothPitchTransitionTo"); } },
  'sample-slices': { get title() { return msg("cards.sampleSlicing"); }, get text() { return msg("cards.saveTheSelectionAsASliceOr"); } },
  'note-locks': { get title() { return msg("cards.perNoteSound"); }, get text() { return msg("cards.changeAParameterSuchAsDecayOr"); } },
  // ---- Транспорт и шапка ----
  play: {
    get title() { return msg("cards.transport"); },
    get text() { return msg("cards.startOrStopTheWholeProjectYou"); },
    guide: { id: 'main', step: 1 },
  },
  bpm: {
    get title() { return msg("cards.tempo"); },
    get text() { return msg("cards.beatsPerMinuteYouCanChangeTempo"); },
  },
  title: {
    get title() { return msg("cards.projectName"); },
    get text() { return msg("cards.theProjectNameIsAlsoTheBasis"); },
    guide: { id: 'files' },
  },
  'chain-btn': {
    get title() { return msg("cards.sceneSequence"); },
    get text() { return msg("cards.arrangeScenesInOrderAndSetTheir"); },
    guide: { id: 'arrangement' },
  },
  'mixer-btn': {
    get title() { return msg("cards.mixer"); },
    get text() { return msg("cards.trackLevelsPanAndGlobalTrackSwitches"); },
    guide: { id: 'mix' },
  },
  'library-btn': {
    get title() { return msg("cards.instruments"); },
    get text() { return msg("cards.instrumentPresetsAndSamplesInTheLeft"); },
    guide: { id: 'browser' },
  },
  'file-menu': {
    get title() { return msg("cards.file"); },
    get text() { return msg("cards.createOrOpenAProjectSaveA"); },
    guide: { id: 'files' },
  },
  help: {
    get title() { return msg("cards.help"); },
    get text() { return msg("cards.turnOnTheHelpCursorThenSelect"); },
  },

  // ---- Сцены и цепочка ----
  scenes: {
    get title() { return msg("cards.scenes"); },
    get text() { return msg("cards.sectionsOfAPieceEachSelectingOne"); },
    guide: { id: 'arrangement' },
  },
  'scene-add': { get title() { return msg("cards.scene"); }, get text() { return msg("cards.createASceneFromTheCurrentScene"); } },
  'scene-edit': { get title() { return msg("cards.sceneName"); }, get text() { return msg("cards.renameOrDeleteAScene"); } },
  'follow-chain': {
    get title() { return msg("cards.sequence"); },
    get text() { return msg("cards.enableAutomaticProgressionThroughTheSceneList"); },
    guide: { id: 'arrangement', step: 4 },
  },
  'chain-panel': { get title() { return msg("cards.sceneSequencePanel"); }, get text() { return msg("cards.tilesReadLeftToRightThenRow"); } },

  // ---- Дорожка ----
  'add-track': {
    get title() { return msg("cards.track"); },
    get text() { return msg("cards.addATrackWithASineWave"); },
    guide: { id: 'tracks' },
  },
  fold: { get title() { return msg("cards.collapse"); }, get text() { return msg("cards.collapseTheTrackCardToASingle"); } },
  'track-name': { get title() { return msg("cards.trackName"); }, get text() { return msg("cards.typeANameDirectlyInThisField"); } },
  solo: {
    get title() { return msg("cards.sSceneSolo"); },
    get text() { return msg("cards.hearOnlyThisTrackInTheCurrent"); },
  },
  mode: {
    get title() { return msg("cards.clipTrackInstrument"); },
    get text() { return msg("cards.chooseWhichPartOfTheTrackCard"); },
    guide: { id: 'tracks', step: 3 },
  },
  'inst-chip': {
    get title() { return msg("cards.instrumentBadge"); },
    get text() { return msg("cards.theTrackSCurrentSoundNameAlso"); },
    guide: { id: 'sound' },
  },

  // ---- Эскиз: чипы, панель ----
  chips: { get title() { return msg("cards.clipBadges"); }, get text() { return msg("cards.reusablePartsForThisTrackTheScene"); }, guide: { id: 'sketches' } },
  'chip-add': { get title() { return msg("cards.clip"); }, get text() { return msg("cards.createAnEmptyClipOnThisTrack"); }, guide: { id: 'sketches', step: 1 } },
  'chip-mute': { get title() { return msg("cards.mMuteInThisScene"); }, get text() { return msg("cards.silenceThisTrackSSlotInThe"); } },
  length: { get title() { return msg("cards.cycleLength"); }, get text() { return msg("cards.numberOfStepsInTheClipS"); }, guide: { id: 'sketches', step: 3 } },
  rate: { get title() { return msg("cards.stepDuration"); }, get text() { return msg("cards.clipStepDuration11618"); }, guide: { id: 'sketches', step: 4 } },
  'sketch-box': { get title() { return msg("cards.clipPanel"); }, get text() { return msg("cards.everythingAboutThePartClipsControlsNote"); } },

  // ---- Стан и тулбар ----
  roll: {
    get title() { return msg("cards.noteGrid"); },
    get text() { return msg("cards.columnsAreCycleStepsRowsArePitches"); },
    guide: { id: 'roll' },
  },
  'scale-rows': { get title() { return msg("cards.noteGridRows"); }, get text() { return msg("cards.ratiosToTheRootFrequency15"); } },
  octaves: { get title() { return msg("cards.octaves"); }, get text() { return msg("cards.theOctaveButtonsAddOrRemoveRows"); } },
  'roll-tools': { get title() { return msg("cards.noteGridToolbar"); }, get text() { return msg("cards.tuningAndRootFrequencyNoteDurationAnd"); } },
  'scale-btn': { get title() { return msg("cards.pitchScale"); }, get text() { return msg("cards.chooseATuningFromTheSearchableList"); }, guide: { id: 'scales' } },
  'roll-tonic': { get title() { return msg("cards.rootFrequency"); }, get text() { return msg("cards.frequencyInHertzFromWhichTheTuning"); }, guide: { id: 'scales' } },
  'roll-phase': { get title() { return msg("cards.phase"); }, get text() { return msg("cards.offsetTheCycleInStepsKeepThe"); } },
  'auto-toggle': {
    get title() { return msg("cards.automation"); },
    get text() { return msg("cards.chooseAParameterInThePanelBelow"); },
    guide: { id: 'auto' },
  },
  'fill-btn': { get title() { return msg("cards.fill"); }, get text() { return msg("cards.generateAPatternByChoosingTimingAnd"); }, guide: { id: 'generators' } },
  'fill-tools': { get title() { return msg("cards.patternTools"); }, get text() { return msg("cards.chooseTheNoteCountEvenlySpacedOr"); } },
  'fill-even': { get title() { return msg("cards.evenlySpaced"); }, get text() { return msg("cards.euclideanPlacementOfNNotesAroundA"); }, guide: { id: 'generators', step: 1 } },
  'fill-mutate': { get title() { return msg("cards.mutate"); }, get text() { return msg("cards.applyRandomEditsAlongTheEnabledDimensions"); }, guide: { id: 'generators', step: 2 } },
  'fill-clear': { get title() { return msg("cards.clear"); }, get text() { return msg("cards.removeEveryNoteFromThisClipCtrl"); }, guide: { id: 'generators', step: 3 } },
  'step-panel': { get title() { return msg("cards.stepPanel"); }, get text() { return msg("cards.velocityTriggerProbabilityAndDurationForEach"); } },

  // ---- Инструмент ----
  'inst-panel': { get title() { return msg("cards.instrumentEditor"); }, get text() { return msg("cards.editTheMainSourceOperatorsFMWavetable"); } },
  'tab-snd': { get title() { return msg("cards.source"); }, get text() { return msg("cards.chooseSynthesisOrSamplePlaybackOperatorSynthesis"); } },
  'src-seg': { get title() { return msg("cards.waveformOrSample"); }, get text() { return msg("cards.chooseAnOperatorBasedSoundOrA"); }, guide: { id: 'samples', step: 1 } },
  'tab-env': { get title() { return msg("cards.envelope"); }, get text() { return msg("cards.attackPeakHoldAndDecayOrA"); }, guide: { id: 'sound', step: 3 } },
  'tab-timbre': { get title() { return msg("cards.timbre"); }, get text() { return msg("cards.filtersAndTheirEnvelopePlusTheTrack"); }, guide: { id: 'sound', step: 4 } },
  'save-inst': { get title() { return msg("cards.saveInstrument"); }, get text() { return msg("cards.saveTheCurrentSoundAndAuditionFrequency"); }, guide: { id: 'sound', step: 5 } },
  'snd-sample': { get title() { return msg("cards.sampleSlot"); }, get text() { return msg("cards.chooseAStoredSampleOrImportA"); }, guide: { id: 'samples', step: 1 } },
  'sample-mode': { get title() { return msg("cards.sampleMode"); }, get text() { return msg("cards.directPlaysTheRecordingGranularCreatesA"); }, guide: { id: 'samples', step: 2 } },
  'timbre-tab': { get title() { return msg("cards.filters"); }, get text() { return msg("cards.lowCutAndHighCutControlsWith"); } },
  'unison-group': { get title() { return msg("cards.unison"); }, get text() { return msg("cards.detunedCopiesThickenAndWidenANote"); } },
  'formant-group': { get title() { return msg("cards.formants"); }, get text() { return msg("cards.resonantSpectralRegionsAtFixedFrequenciesGive"); } },
  'recipe-pick': { get title() { return msg("cards.waveformRecipe"); }, get text() { return msg("cards.buildADraftOperatorSetupFromA"); } },
  'arp-group': { get title() { return msg("cards.arpeggiator"); }, get text() { return msg("cards.playTheChordOnAStepOne"); }, guide: { id: 'arp' } },
  arp: { get title() { return msg("cards.arpeggiator"); }, get text() { return msg("cards.enableChordPlaybackAsAnArpeggio"); }, guide: { id: 'arp', step: 2 } },
  'arp-mode': { get title() { return msg("cards.arpeggioOrder"); }, get text() { return msg("cards.chooseTheFigureSNoteOrderUp"); }, guide: { id: 'arp', step: 3 } },
  'arp-speed': { get title() { return msg("cards.subdivision"); }, get text() { return msg("cards.numberOfEqualSubdivisionsWithinTheOriginal"); }, guide: { id: 'arp', step: 4 } },
  'gen-bar': { get title() { return msg("cards.aiGeneration"); }, get text() { return msg("cards.describeASoundToGenerateASample"); }, guide: { id: 'ai', step: 2 } },

  // ---- Трек: сведение, эффекты ----
  'sound-panel': { get title() { return msg("cards.trackPanel"); }, get text() { return msg("cards.trackMixingLevelPanVoiceChokingEffects"); } },
  'common-row': { get title() { return msg("cards.general"); }, get text() { return msg("cards.trackLevelAndPanApplyToAll"); } },
  'fx-add': { get title() { return msg("cards.effect"); }, get text() { return msg("cards.addDelayReverbChorusDistortionBitcrusherOr"); }, guide: { id: 'effects', step: 1 } },
  'fx-list': { get title() { return msg("cards.trackEffects"); }, get text() { return msg("cards.rowsShowProcessingOrderDragTheHandle"); }, guide: { id: 'effects', step: 3 } },

  // ---- Модуляции и кривые ----
  'mods-add': { get title() { return msg("cards.modulation"); }, get text() { return msg("cards.addAnLFOSampleAndHoldOr"); }, guide: { id: 'effects', step: 6 } },
  'mods-list': { get title() { return msg("cards.parameterModulation"); }, get text() { return msg("cards.setRateAndDepthWithKnobsSync"); } },
  'mod-source': { get title() { return msg("cards.modulationSource"); }, get text() { return msg("cards.lfoIsAPeriodicWaveformSuchAs"); } },
  'fade-in': { get title() { return msg("cards.sceneFadeIn"); }, get text() { return msg("cards.fadeInThePartTogetherWithIts"); } },
  'fade-out': { get title() { return msg("cards.sceneFadeOut"); }, get text() { return msg("cards.fadeThePartAndItsTrackEffects"); } },

  // ---- Редактор волны (на вкладке «источник») ----
  'we-tabs': { get title() { return msg("cards.editorTabs"); }, get text() { return msg("cards.sourceEnvelopeAndTimbreGroupTheInstrument"); }, guide: { id: 'wave', step: 1 } },
  'we-canvas': { get title() { return msg("cards.sampleWaveform"); }, get text() { return msg("cards.dragToSelectARegionUseRegion"); }, guide: { id: 'wave', step: 1 } },
  'we-fft': { get title() { return msg("cards.harmonicAnalysis"); }, get text() { return msg("cards.convertTheSampleSAverageFFTSpectrum"); }, guide: { id: 'wave', step: 2 } },
  'we-draft-row': { get title() { return msg("cards.waveformDraft"); }, get text() { return msg("cards.drawAShapeOnTheCanvasTo"); }, guide: { id: 'wave', step: 3 } },
  'we-partials': { get title() { return msg("cards.operatorRows"); }, get text() { return msg("cards.eachRowHasAFrequencyRatioTo"); }, guide: { id: 'wave', step: 4 } },
  'we-wave-canvas': { get title() { return msg("cards.waveform"); }, get text() { return msg("cards.theSumOfTheOperatorRowsBright"); }, guide: { id: 'wave', step: 4 } },
  'we-layers': { get title() { return msg("cards.unisonVibratoAndFormants"); }, get text() { return msg("cards.sharedColorationControlsIndependentOfIndividualOperators"); } },

  // ---- Скрэтч ----
  'scratch-rec': { get title() { return msg("cards.recordGesture"); }, get text() { return msg("cards.recordMouseMovementOnThePadA"); }, guide: { id: 'scratch', step: 2 } },
  'scratch-pad': { get title() { return msg("cards.scratchPad"); }, get text() { return msg("cards.moveUpwardTowardTheSampleSEnd"); }, guide: { id: 'scratch', step: 3 } },
  'scratch-play': { get title() { return msg("cards.audition"); }, get text() { return msg("cards.playTheGestureAsOneNote"); }, guide: { id: 'scratch', step: 4 } },
  'scratch-save': { get title() { return msg("cards.renderToSample"); }, get text() { return msg("cards.nameAndRenderASuccessfulGestureTo"); } },
  'scratch-name': { get title() { return msg("cards.sampleName"); }, get text() { return msg("cards.appearsWhenRenderingToASampleThe"); } },

  // ---- Панель инструментов ----
  'library-panel': { get title() { return msg("cards.instrumentBrowser"); }, get text() { return msg("cards.presetsAndSamplesHaveSeparateTabsClick"); }, guide: { id: 'browser' } },
  'sb-tab-instruments': { get title() { return msg("cards.presetsTab"); }, get text() { return msg("cards.instrumentPresetsGroupedByCategoryStartersAre"); }, guide: { id: 'browser' } },
  'sb-tab-samples': { get title() { return msg("cards.samplesTab"); }, get text() { return msg("cards.allStoredRecordingsClickANameTo"); }, guide: { id: 'browser', step: 3 } },
  'inst-search': { get title() { return msg("cards.search"); }, get text() { return msg("cards.searchNamesCategoriesAndDescriptionsForExample"); }, guide: { id: 'browser', step: 1 } },
  'inst-cards': { get title() { return msg("cards.presets"); }, get text() { return msg("cards.collapseCategoriesAsNeededClickAPreset"); }, guide: { id: 'browser', step: 2 } },
  library: { get title() { return msg("cards.samples"); }, get text() { return msg("cards.auditionAssignARecordingByClickingIts"); }, guide: { id: 'browser', step: 4 } },

  // ---- Микшер, ИИ, шкала ----
  'mix-panel': { get title() { return msg("cards.mixer"); }, get text() { return msg("cards.trackChannelsAndTheMasterSection"); } },
  'mix-track': { get title() { return msg("cards.mixerChannel"); }, get text() { return msg("cards.trackLevelPanAndTheGlobalTrack"); }, guide: { id: 'mix', step: 1 } },
  'mix-master': { get title() { return msg("cards.master"); }, get text() { return msg("cards.noiseAddsAirOrTapeLikeTexture"); }, guide: { id: 'mix', step: 2 } },
  'ai-btn': { get title() { return msg("cards.aiSettings"); }, get text() { return msg("cards.chooseAServiceAndProvideItsKey"); }, guide: { id: 'ai', step: 0 } },
  'ai-provider': { get title() { return msg("cards.aiService"); }, get text() { return msg("cards.elevenlabsGeneratesSoundsFromTextFalAi"); }, guide: { id: 'ai', step: 1 } },
  'ai-key': { get title() { return msg("cards.aiKey"); }, get text() { return msg("cards.yourPersonalServiceKeyStoredLocally"); }, guide: { id: 'ai', step: 1 } },
  'scale-search': { get title() { return msg("cards.findTuning"); }, get text() { return msg("cards.trySlendroShrutiOrMaqam"); }, guide: { id: 'scales', step: 1 } },
  'scale-tools': { get title() { return msg("cards.tuningTools"); }, get text() { return msg("cards.divideAnOctaveIntoNEqualSteps"); }, guide: { id: 'scales', step: 3 } },
};

/** Карточка по значению data-ob (undefined — контрол без подписи). */
export const cardOf = (key: string | null): HelpCard | undefined =>
  key ? CARDS[key] : undefined;

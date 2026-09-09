import { t as msg } from '../i18n/runtime.ts';
import { makeTrackWithInstrument, makePattern, makeStep, makeScene, normalizePatch, PATCH_VERSION, type Patch, type Track, type Instrument } from '../types';
import { tableRecipe } from './wavetable';

export type Lesson = { title: string; goal: string; action: string; listen: string; term: string; check: (p: Patch) => boolean };
/** Resolve tutorial references against the open copy, including names chosen by the user. */
export function learningAction(text: string, patch: Patch): string {
  const refs: [RegExp, string | undefined][] = [
    [/«Мотив(?:а)?»|\bMotif\b/g, patch.tracks.find(t => t.id === 'learn-track-4')?.name],
    [/«Осколков»|\bShards\b/g, patch.tracks.find(t => t.id === 'learn-track-2')?.name],
    [/«Лаборатория»|\bLab\b/g, patch.tracks.length === 1 ? patch.tracks.find(t => t.id === 'learn-track-0')?.name : undefined],
  ];
  const scenes: [RegExp, string, string, number][] = [
    [/«Зерно»|\bSeed\b/g, 'Зерно', 'Seed', 0], [/«Опор[ае]»|\bFoundation\b/g, 'Опора', 'Foundation', 1],
    [/«Напряжение»|\bTension\b/g, 'Напряжение', 'Tension', 3], [/«Пустот[ае]»|\bSpace\b/g, 'Пустота', 'Space', 4],
    [/«Вспышке»|\bBurst\b/g, 'Вспышка', 'Burst', 5], [/«Возвращение»|\bReturn\b/g, 'Возвращение', 'Return', 6],
    [/«Коде»|\bCoda\b/g, 'Кода', 'Coda', 7],
  ];
  for (const [pattern, ru, en, index] of scenes) refs.push([pattern, patch.scenes.find(s => s.id === `learn-scene-${index}` || s.name === ru || s.name === en)?.name]);
  // Single pass: an inserted user name must never be interpreted as another reference.
  const combined = new RegExp(refs.map(([pattern]) => `(${pattern.source})`).join('|'), 'g');
  return text.replace(combined, (match: string) => {
    const found = refs.find(([pattern]) => new RegExp(`^(?:${pattern.source})$`).test(match));
    return found?.[1] ? `“${found[1]}”` : match;
  });
}
const anyPattern = (p: Patch, f: (s: Patch['tracks'][number]['patterns'][number]) => boolean) => p.tracks.some(t => t.patterns.some(f));
export const compositionLessons: Lesson[] = [
  { get title() { return msg("learning.theSeedOfAnIdea"); }, get goal() { return msg("learning.aRecognizableMotifConnectsTheOpeningAnd"); }, get action() { return msg("learning.openAClipOnTheMotifTrack"); }, get listen() { return msg("learning.canYouRecognizeTheMainIdeaAfter"); }, get term() { return msg("learning.aMotifIsAShortMusicalGesture"); }, check:p => p.tracks.some(t => t.id === 'learn-track-4' && t.patterns.some(s => s.steps.some(n => n.notes.length))) },
  { get title() { return msg("learning.foundationAndResponse"); }, get goal() { return msg("learning.theBassAndKickLeaveRoomFor"); }, get action() { return msg("learning.inFoundationRemoveABassNoteClose"); }, get listen() { return msg("learning.isThereMoreClarityAndBreathingRoom"); }, get term() { return msg("learning.aRestIsPartOfTheRhythm"); }, check:p => p.tracks.filter(t => t.id === 'learn-track-3' || t.id === 'learn-track-0').length === 2 },
  { get title() { return msg("learning.breakingExpectations"); }, get goal() { return msg("learning.anIndependentCycleChangesTheContextAround"); }, get action() { return msg("learning.compareClipLengthsOf7And8"); }, get listen() { return msg("learning.inWhichVersionDoTheAccentsMeet"); }, get term() { return msg("learning.differentCycleLengthsShiftHowAccentsLine"); }, check:p => new Set(p.tracks.flatMap(t => t.patterns.map(s => s.length))).size > 1 },
  { get title() { return msg("learning.buildingTension"); }, get goal() { return msg("learning.increaseTensionWithoutTurningUpTheMaster"); }, get action() { return msg("learning.drawARisingFilterAutomationCurveIn"); }, get listen() { return msg("learning.doesItHaveDirectionOrIsIt"); }, get term() { return msg("learning.developmentGraduallyTransformsFamiliarMaterial"); }, check:p => anyPattern(p,s => !!s.automation?.some(a => a.target === 'filterFreq')) },
  { get title() { return msg("learning.space"); }, get goal() { return msg("learning.makeTheReturnStrongerThroughContrast"); }, get action() { return msg("learning.leaveOneVoiceInTheSpaceScene"); }, get listen() { return msg("learning.doesThePauseStillCreateAnticipationOr"); }, get term() { return msg("learning.contrastGivesTheListenerANewPoint"); }, check:p => p.scenes.some(s => Object.values(s.slots).filter(v => !v.muted).length === 1) },
  { get title() { return msg("learning.climax"); }, get goal() { return msg("learning.bringTheIdeaBackInAChanged"); }, get action() { return msg("learning.inBurstChooseClipBForThe"); }, get listen() { return msg("learning.doesTheClimaxDifferInSubstanceAs"); }, get term() { return msg("learning.theClimaxIsThePointOfGreatest"); }, check:p => p.scenes.length >= 6 },
  { get title() { return msg("learning.resolution"); }, get goal() { return msg("learning.endTheStoryDeliberately"); }, get action() { return msg("learning.inCodaLeaveTheMotifAndAtmosphere"); }, get listen() { return msg("learning.doesTheLastSoundFeelLikeAn"); }, get term() { return msg("learning.aCodaIsAShortClosingSection"); }, check:p => !!p.sceneSpace && p.chain.length >= 6 },
  { get title() { return msg("learning.balanceAndExport"); }, get goal() { return msg("learning.saveAFinishedVariation"); }, get action() { return msg("learning.compareTheBassAndMotifAtA"); }, get listen() { return msg("learning.canYouHearEveryMusicalRoleIs"); }, get term() { return msg("learning.exportCapturesTheChosenArrangementItDoes"); }, check:p => p.followChain && p.chain.length >= 6 },
];
export const soundLessons: Lesson[] = [
  { get title() { return msg("learning.sourcesAndOvertones"); }, get goal() { return msg("learning.turnAMellowSoundIntoABright"); }, get action() { return msg("learning.openTheInstrumentOnTheLabTrack"); }, get listen() { return msg("learning.overtonesAddBrightnessEvenAtASingle"); }, get term() { return msg("learning.overtonesAreFrequencyComponentsAboveTheFundamental"); }, check:p => !!p.instruments[0]?.wave?.va },
  { get title() { return msg("learning.theShapeOfANote"); }, get goal() { return msg("learning.oneSourceCanBecomeAHitOr"); }, get action() { return msg("learning.compareAShortDecayWithALong"); }, get listen() { return msg("learning.howDoTheGestureAndMusicalRole"); }, get term() { return msg("learning.anEnvelopeDescribesHowAParameterChanges"); }, check:p => !!p.instruments[0]?.ampMseg },
  { get title() { return msg("learning.filterAndEQ"); }, get goal() { return msg("learning.makeRoomForAnotherVoice"); }, get action() { return msg("learning.addATrackEQCompareABroad"); }, get listen() { return msg("learning.isTheSoundClearerOrJustLouder"); }, get term() { return msg("learning.eqChangesTheFrequencyBalanceBandwidthDetermines"); }, check:p => p.tracks.some(t => t.effects?.some(e => e.type === 'eq')) },
  { get title() { return msg("learning.fmAndMovement"); }, get goal() { return msg("learning.createAnElasticBassOrAnInharmonic"); }, get action() { return msg("learning.switchToOperatorsAndAddAFrequency"); }, get listen() { return msg("learning.whenDoesTheToneBecomeMetallicReduce"); }, get term() { return msg("learning.fmVariesOneOscillatorSInstantaneousFrequency"); }, check:p => !!p.instruments[0]?.wave?.partials.some(x => x.mod !== undefined) },
  { get title() { return msg("learning.wavetableAndPWM"); }, get goal() { return msg("learning.letTheTimbreMoveWithinALong"); }, get action() { return msg("learning.chooseWavetableAndEnableThePositionLFO"); }, get listen() { return msg("learning.howAreTheMovementsSimilarAndHow"); }, get term() { return msg("learning.wavetableSynthesisBlendsFramesPWMVariesThe"); }, check:p => p.instruments.some(i => !!i.wave?.wavetable?.positionLfo || !!i.wave?.va?.pwmDepth) },
  { get title() { return msg("learning.layersAndRanges"); }, get goal() { return msg("learning.aStrongerNoteBringsInAnExtra"); }, get action() { return msg("learning.addALayerInProcessingAndRange"); }, get listen() { return msg("learning.doesTheMainCharacterSurviveWhenThe"); }, get term() { return msg("learning.aVelocityRangeControlsWhetherAVoice"); }, check:p => p.instruments.some(i => i.layers?.some(l => !!l.sound.voiceRange)) },
  { get title() { return msg("learning.macrosAndSharing"); }, get goal() { return msg("learning.turnAnExperimentIntoAPlayableInstrument"); }, get action() { return msg("learning.assignABrightnessMacroSaveTheInstrument"); }, get listen() { return msg("learning.doesTheMacroSRangeMakeSense"); }, get term() { return msg("learning.aMacroLinksSeveralParametersToOne"); }, check:p => p.instruments.some(i => !!i.macros?.length) },
];

export function learningProject(sound = false): Patch {
  const roles = sound ? [msg("learning.lab")] : [msg("learning.kick"),msg("learning.click"),msg("learning.shards"),msg("learning.bass"),msg("learning.motif"),msg("learning.air")];
  const made = roles.map((name, i) => {
    const length = sound ? 8 : [16,16,7,8,5,16][i], rate = sound ? 1 : [1,1,1,2,2,4][i];
    const mask = sound ? [0] : [[0,4,8,11],[4,12],[0,2,5],[1,4,7],[0,2,4],[0]][i];
    const steps = Array.from({ length }, (_, n) => makeStep(mask.includes(n), i === 4 ? [0,2,1,4,2][n % 5] : 0, n % 4 === 0 ? .8 : .55));
    const a = makePattern('A',length,steps,rate), b = makePattern('B',length,steps.map((s,n) => n === length - 1 ? makeStep(true, i === 4 ? 3 : 0,.45) : structuredClone(s)),rate);
    if (i === 4) b.automation = [{ target:'filterFreq', points:[{t:0,v:.25},{t:1,v:.85}] }];
    const partial: Partial<Track & Instrument> & {id:string;name:string} = { id:`learn-track-${i}`,name,freq:sound ? 110 : [48,180,1800,55,220,110][i],scale:[1,1.2,1.5,1.8,2],volume:sound ? .35 : [.55,.22,.13,.3,.2,.1][i],attack:i === 5 ? .8 : .005,decay:i === 5 ? 2 : .2,sustain:i === 5 ? .5 : 0,pitchDrop:i === 0 && !sound ? 3 : 1,pitchTime:.08,waveform:'wave',wave:sound ? {partials:[],va:{shape:'saw',pulseWidth:.5}} : i === 1 || i === 2 ? {partials:[{type:'noise',amp:1,ratio:1}]} : i === 4 ? {partials:[],wavetable:tableRecipe()} : {partials:[{type:'sine',amp:1,ratio:1},{type:'sine',amp:.15,ratio:2}]},filterFreq:i === 3 ? 900 : 8000,spaceSend:i >= 4 ? .3 : .04,patterns:[a,b] };
    return makeTrackWithInstrument(partial);
  });
  const tracks = made.map(m => m.track);
  const names = sound ? [msg("learning.experiment")] : [msg("learning.seed"),msg("learning.foundation"),msg("learning.dialogue"),msg("learning.tension"),msg("learning.space"),msg("learning.burst"),msg("learning.return"),msg("learning.coda")];
  const scenes = names.map((name,i) => {
    const scene = makeScene(name,tracks,t => t.patterns[i === 3 || i === 5 ? 1 : 0].id);
    scene.id = `learn-scene-${i}`;
    const active = [[4,5],[0,3,4],[0,1,2,3,4],[0,1,2,3,4,5],[5],[0,1,2,3,4,5],[0,3,4],[4,5]][i];
    if (!sound) tracks.forEach((t,n) => { if (!active.includes(n)) scene.slots[t.id].muted = true; });
    return scene;
  });
  return normalizePatch({version:PATCH_VERSION,title:sound ? msg("learning.timbreLab") : msg("learning.orbitalShardsLearningCopy"),bpm:120,masterVolume:.7,performanceSeed:42,followChain:!sound,sceneSpace:{sizeSec:2.5,level:.22},tracks,instruments:made.map(m=>m.instrument),scenes,chain:scenes.map((s,i)=>({sceneId:s.id,bars:sound ? 8 : [8,8,8,8,4,12,8,8][i]}))});
}

const RETURN_KEY = 'barlow.learning.return', WORK_KEY = 'barlow.learning.work';
export function beginLearning(current: Patch, sound: boolean): Patch {
  if (!localStorage.getItem(RETURN_KEY)) localStorage.setItem(RETURN_KEY, JSON.stringify(current));
  return learningProject(sound);
}
export function returnFromLearning(current: Patch): Patch | null {
  const saved = localStorage.getItem(RETURN_KEY); if (!saved) return null;
  const restored = normalizePatch(JSON.parse(saved));
  localStorage.setItem(WORK_KEY, JSON.stringify(current));
  return restored;
}
export function finishLearningReturn(): void { localStorage.removeItem(RETURN_KEY); }
export function resumeLearning(current: Patch): Patch | null {
  const saved = localStorage.getItem(WORK_KEY); if (!saved) return null;
  const work = normalizePatch(JSON.parse(saved));
  if (!localStorage.getItem(RETURN_KEY)) localStorage.setItem(RETURN_KEY, JSON.stringify(current));
  return work;
}

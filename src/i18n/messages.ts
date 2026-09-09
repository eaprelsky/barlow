import {app} from './catalogs/app.ts';
import {audioStatus} from './catalogs/audioStatus.ts';
import {autoLane} from './catalogs/autoLane.ts';
import {automationRecorder} from './catalogs/automationRecorder.ts';
import {binaryFile} from './catalogs/binaryFile.ts';
import {bridge} from './catalogs/bridge.ts';
import {bridgeProtocol} from './catalogs/bridgeProtocol.ts';
import {bridgeSettings} from './catalogs/bridgeSettings.ts';
import {cards} from './catalogs/cards.ts';
import {chainBudget} from './catalogs/chainBudget.ts';
import {controlEnvelopeEditor} from './catalogs/controlEnvelopeEditor.ts';
import {decodedAssets} from './catalogs/decodedAssets.ts';
import {defaultPatch} from './catalogs/defaultPatch.ts';
import {dialog} from './catalogs/dialog.ts';
import {dialogs} from './catalogs/dialogs.ts';
import {engine} from './catalogs/engine.ts';
import {envGraph} from './catalogs/envGraph.ts';
import {eqEditor} from './catalogs/eqEditor.ts';
import {equalizer} from './catalogs/equalizer.ts';
import {explanations} from './catalogs/explanations.ts';
import {factory} from './catalogs/factory.ts';
import {guides} from './catalogs/guides.ts';
import {helpResolver} from './catalogs/helpResolver.ts';
import {helpSearch} from './catalogs/helpSearch.ts';
import {helpSearchIndex} from './catalogs/helpSearchIndex.ts';
import {helpToggle} from './catalogs/helpToggle.ts';
import {instrumentEditor} from './catalogs/instrumentEditor.ts';
import {instrumentFile} from './catalogs/instrumentFile.ts';
import {instrumentPack} from './catalogs/instrumentPack.ts';
import {instrumentWorkspace} from './catalogs/instrumentWorkspace.ts';
import {knob} from './catalogs/knob.ts';
import {languageHelp} from './catalogs/languageHelp.ts';
import {layerEditor} from './catalogs/layerEditor.ts';
import {learning} from './catalogs/learning.ts';
import {learningStudio} from './catalogs/learningStudio.ts';
import {library} from './catalogs/library.ts';
import {libraryResize} from './catalogs/libraryResize.ts';
import {macroEditor} from './catalogs/macroEditor.ts';
import {macros} from './catalogs/macros.ts';
import {mainMenu} from './catalogs/mainMenu.ts';
import {msegEditor} from './catalogs/msegEditor.ts';
import {msegShapes} from './catalogs/msegShapes.ts';
import {nativeErrors} from './catalogs/nativeErrors.ts';
import {noteLocksEditor} from './catalogs/noteLocksEditor.ts';
import {onboarding} from './catalogs/onboarding.ts';
import {packManager} from './catalogs/packManager.ts';
import {parameterHelp} from './catalogs/parameterHelp.ts';
import {parameters} from './catalogs/parameters.ts';
import {patternChips} from './catalogs/patternChips.ts';
import {platform} from './catalogs/platform.ts';
import {pointHelp} from './catalogs/pointHelp.ts';
import {project} from './catalogs/project.ts';
import {providers} from './catalogs/providers.ts';
import {renderMemory} from './catalogs/renderMemory.ts';
import {renderPlan} from './catalogs/renderPlan.ts';
import {rollTools} from './catalogs/rollTools.ts';
import {samplePicker} from './catalogs/samplePicker.ts';
import {sampleSliceEditor} from './catalogs/sampleSliceEditor.ts';
import {sampleZoneEditor} from './catalogs/sampleZoneEditor.ts';
import {scalePicker} from './catalogs/scalePicker.ts';
import {scales} from './catalogs/scales.ts';
import {separation} from './catalogs/separation.ts';
import {sliderField} from './catalogs/sliderField.ts';
import {soundBrowser} from './catalogs/soundBrowser.ts';
import {soundSearch} from './catalogs/soundSearch.ts';
import {soundWorkshop} from './catalogs/soundWorkshop.ts';
import {storage} from './catalogs/storage.ts';
import {timbreAnalysis} from './catalogs/timbreAnalysis.ts';
import {trackRow} from './catalogs/trackRow.ts';
import {types} from './catalogs/types.ts';
import {voiceProcessing} from './catalogs/voiceProcessing.ts';
import {waveCanvas} from './catalogs/waveCanvas.ts';
import {waveRecipes} from './catalogs/waveRecipes.ts';
import {wavetableEditor} from './catalogs/wavetableEditor.ts';
import {wavetableImport} from './catalogs/wavetableImport.ts';
import {wavExport} from './catalogs/wavExport.ts';
export const messages = {
  ...app,
  ...audioStatus,
  ...autoLane,
  ...automationRecorder,
  ...binaryFile,
  ...bridge,
  ...bridgeProtocol,
  ...bridgeSettings,
  ...cards,
  ...chainBudget,
  ...controlEnvelopeEditor,
  ...decodedAssets,
  ...defaultPatch,
  ...dialog,
  ...dialogs,
  ...engine,
  ...envGraph,
  ...eqEditor,
  ...equalizer,
  ...explanations,
  ...factory,
  ...guides,
  ...helpResolver,
  ...helpSearch,
  ...helpSearchIndex,
  ...helpToggle,
  ...instrumentEditor,
  ...instrumentFile,
  ...instrumentPack,
  ...instrumentWorkspace,
  ...knob,
  ...languageHelp,
  ...layerEditor,
  ...learning,
  ...learningStudio,
  ...library,
  ...libraryResize,
  ...macroEditor,
  ...macros,
  ...mainMenu,
  ...msegEditor,
  ...msegShapes,
  ...nativeErrors,
  ...noteLocksEditor,
  ...onboarding,
  ...packManager,
  ...parameterHelp,
  ...parameters,
  ...patternChips,
  ...platform,
  ...pointHelp,
  ...project,
  ...providers,
  ...renderMemory,
  ...renderPlan,
  ...rollTools,
  ...samplePicker,
  ...sampleSliceEditor,
  ...sampleZoneEditor,
  ...scalePicker,
  ...scales,
  ...separation,
  ...sliderField,
  ...soundBrowser,
  ...soundSearch,
  ...soundWorkshop,
  ...storage,
  ...timbreAnalysis,
  ...trackRow,
  ...types,
  ...voiceProcessing,
  ...waveCanvas,
  ...waveRecipes,
  ...wavetableEditor,
  ...wavetableImport,
  ...wavExport,
 'language.saveError': {ru:'Не удалось сохранить язык интерфейса',en:'Could not save the interface language'},
} as const;
export type MessageKey = keyof typeof messages;

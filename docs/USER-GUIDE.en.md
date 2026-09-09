# barlow — getting started

barlow is a desktop music tool for electronic music, independent rhythmic
cycles and sound design. Use a display at least 1024 pixels wide.
Choose **Settings → English** to change the interface language. This does
not translate or alter names and music saved in your project.

## Find your way around

- **File** opens, saves and exports projects, instruments and instrument packs.
- **Edit** provides undo and redo.
- **View** shows or hides panels. The instruments and mixer buttons also toggle them.
- **Settings** contains appearance, language, audio and optional service connections.
- **Help** opens search, guided tasks and the learning studio.

Click **?** (or press **F1**) to enter explanation mode, then click a control
to learn what it does and when to use it. Click **?** again or press Escape
to leave the mode. **Ctrl+/** opens help search. Try “portamento”, “EQ” or
“wavetable”; Russian terms work too. Where available, **Show in interface**
takes you to the relevant control without changing the sound.

## Build a musical idea

1. Open the instruments panel, audition a preset and apply it to the target track.
   Preview uses a characteristic register; applying a sound preserves the track’s tuning.
2. Open the track’s **clip** tab and add notes to the grid. Columns are time
   steps; rows are pitches from the selected scale. Tracks can use different
   clip lengths and step durations.
3. A **scene** chooses one clip per track and remembers scene mute/solo.
   Muting a track in one scene leaves its musical clock running.
4. A **sequence** plays scenes in order. Set each scene’s duration and optional
   tempo, then drag the handle to reorder it.
5. Use automation for changes over time. Track effects and EQ shape the mix;
   instrument and voice controls shape the sound itself.

## A few terms that matter

| Term | Meaning in barlow |
|---|---|
| Track | A musical part with clips, tuning, routing and track effects |
| Clip | A reusable pattern of notes and automation |
| Instrument | A serializable sound recipe; multiple tracks may share it |
| Voice / layer | The main source or an additional source within an instrument |
| Velocity | Note strength; it can also select which voices participate |
| Root frequency | The frequency to which the scale ratios refer, in hertz |
| Hold | Time spent at the peak of the simple amplitude envelope; not ADSR sustain level |
| MSEG | An editable envelope made of breakpoints, with optional curves, sustain and looping |
| Portamento | A glide between successive pitches in monophonic playback |
| Q | Filter resonance / selectivity; higher Q generally means a narrower affected band |
| Feedback | The portion of a delay’s output sent back into its input |
| Downlifter | A falling transition sound; not necessarily reversed audio |

## Learn and compare

In **Help → Learning studio**, choose the IDM composition course or sound
design. **New learning copy** sets aside the current project before opening
an exercise. **Return to project** restores it and preserves your learning
copy for later. **Remember A** and **Compare with A** let you compare a
reference with your variation. Element checks confirm that required parts
exist; use the listening prompts to judge the musical result.

## Share a sound

Save a sound to My instruments, then export it as a portable instrument file.
Required samples travel with it. A pack groups several instruments and their
samples into one archive. User names, descriptions and tags remain as authored.
Project export additionally contains the arrangement; WAV export creates audio.

The separate sound workshop starts with an audio excerpt and can make a
sampler instrument. Source separation requires your own supported service
connection. The harmonic model is an approximation of a mostly monophonic
sound, not a recovery of the original synthesizer patch.

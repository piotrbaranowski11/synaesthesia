import * as Tone from "tone";
import { ISongCallback } from "../songs/abstract/songTypes";
import { IInstrument } from "./instruments/IInstrument";
import * as utils from "./utils";

interface IRepeatingSoloPartParams {
  startTime: Tone.Unit.Time;
  notes: Tone.Unit.Frequency[][];
  instrument: IInstrument;
  // noteLength: Tone.Unit.Time;
  // varyNoteLength: boolean;
  patterns: number[][];
  barLengths: (number | number[])[];
  shouldLoop: boolean;
  visCallback: ISongCallback;
}

export class SongBuilder {
  public addDrumPart(instrument: IInstrument, pattern: Array<number | number[]>, visCallback?: ISongCallback): Tone.Sequence {
    const sequencer = new Tone.Sequence(
      (time, hit) => {
        if (hit === 1) {
          instrument.trigger({ time });

          // fire the draw callback
          if (visCallback) {
            Tone.Draw.schedule(() => {
              visCallback();
            }, time);
          }
        }
      },
      pattern,
      "16n"
    );
    sequencer.loop = true;
    sequencer.start(0);

    return sequencer;
  }
  private isArray(value: number | number[]): value is number[] {
    return (value as number[]).length !== undefined;
  }
  public addChordProgression(
    instrument: IInstrument,
    chordProgression: Tone.Unit.Frequency[][],
    chordBars: (number | number[])[],
    visCallback?: ISongCallback
    // addArpeggio = true
  ): Tone.Part {
    // how many bars in total
    const totalBarCount = chordBars.flatMap((cb) => cb).reduce((sum, x) => sum + x);

    // extend the chord progression to include any repeated chords
    const extendedChordProgression: Tone.Unit.Frequency[][] = [];
    for (let chordIndex = 0; chordIndex < chordProgression.length; chordIndex++) {
      const chord = chordProgression[chordIndex];
      const barCount = chordBars[chordIndex];
      if (this.isArray(barCount)) {
        extendedChordProgression.push(...new Array(barCount.length).fill(chord));
      } else {
        extendedChordProgression.push(chord);
      }
    }
    console.log("---> extendedChordProgression", extendedChordProgression);

    const extendedChordBars = chordBars.flatMap((b) => b);

    // build the part into an array of [time, chord]
    let currentChordStartPos = 0;
    const progPart = extendedChordProgression.map((chord, index) => {
      const cb = index === 0 ? 0 : extendedChordBars[index - 1];

      // decimal bars e.g. 1.5m don't work, so need to convert to bars:beats:sixteenths then back to seconds
      const sp = Tone.Time(`0:${cb * (Tone.Transport.timeSignature as number)}:0`);
      currentChordStartPos += Tone.Time(sp).toSeconds();
      return [currentChordStartPos, chord];
    });

    let currentChord = 0;
    const part = new Tone.Part((time, notes) => {
      const playedNotes = notes as Tone.Unit.Frequency[];

      // decimal bars e.g. 1.5m don't work, so need to convert to bars:beats:sixteenths
      const chordDuration = `0:${extendedChordBars[currentChord] * (Tone.Transport.timeSignature as number)}:0`;

      // the notes given as the second element in the array
      // will be passed in as the second argument
      instrument.trigger({ notes: playedNotes, duration: chordDuration, time });
      // fire the draw callback
      if (visCallback) {
        Tone.Draw.schedule(() => {
          visCallback({ notes: playedNotes, duration: chordDuration });
        }, time);
      }

      currentChord++;
      if (currentChord === extendedChordBars.length) {
        currentChord = 0;
      }
    }, progPart);

    part.loop = true;
    part.loopEnd = `${totalBarCount}m`;
    part.start(0);

    // if (addArpeggio) {
    //   const pattern = new Tone.Pattern(
    //     (time, note) => {
    //       // the order of the notes passed in depends on the pattern
    //       instrument.trigger({ note: Tone.Frequency(note).transpose(12).toNote(), duration: "4n", time });
    //     },
    //     extendedChordProgression.flatMap((c) => c),
    //     "upDown"
    //   );
    //   pattern.interval = "8n";
    //   pattern.start(0);
    // }

    return part;
  }

  public addSoloPart(
    notes: Tone.Unit.Frequency[][],
    instrument: IInstrument,
    patterns: number[][],
    chordBars: (number | number[])[],
    visCallback: ISongCallback
  ): Tone.Sequence {
    return this.addRepeatingSoloPart({
      startTime: "0:0:0",
      notes,
      instrument,
      patterns,
      barLengths: chordBars,
      shouldLoop: true,
      visCallback,
    });
  }

  private addRepeatingSoloPart({
    startTime,
    notes,
    instrument,
    patterns,
    barLengths,
    shouldLoop,
    visCallback,
  }: IRepeatingSoloPartParams): Tone.Sequence {
    const expandedSequence: Tone.Unit.Frequency[] = [];
    for (let index = 0; index < notes.length; index++) {
      const section = notes[index];
      for (let ri = 0; ri < barLengths[index]; ri++) {
        for (let ni = 0; ni < section.length; ni++) {
          const note = section[ni];
          expandedSequence.push(note);
        }
      }
    }

    const expandedPattern = [];
    for (let index = 0; index < patterns.length; index++) {
      const section = patterns[index];
      for (let ri = 0; ri < barLengths[index]; ri++) {
        for (let ni = 0; ni < section.length; ni++) {
          const rythym = section[ni];
          expandedPattern.push(rythym);
        }
      }
    }

    // calculate the lengths of all the notes in the pattern by counting how many
    // sixteenth notes they occupy (assuming legato for the whole pattern)
    let patternNoteStart = -1;
    const noteLengths: number[] = [];
    expandedPattern.forEach((hit, index) => {
      if (hit === 1) {
        if (patternNoteStart > -1) {
          noteLengths.push(index - patternNoteStart);
        }
        patternNoteStart = index;
      }
    });
    // get the last note (that ends at the end of the sequence)
    noteLengths.push(expandedPattern.length - patternNoteStart);

    const sequencer = new Tone.Sequence(
      (time, hit) => {
        if (hit === 1) {
          // Play the next note
          const note = expandedSequence.shift();
          expandedSequence.push(note);
          //const duration = varyNoteLength ? utils.randomIntBetween(1, 8) * Tone.Time(noteLength).toSeconds() : noteLength;

          const noteLength = noteLengths.shift();
          noteLengths.push(noteLength);
          const duration = `0:0:${noteLength}`;

          instrument.trigger({ note, duration, time });

          // fire the draw callback
          if (visCallback) {
            Tone.Draw.schedule(() => {
              visCallback({ note, duration });
            }, time);
          }
        }
      },
      expandedPattern,
      "16n"
    );

    sequencer.humanize = true;
    sequencer.loop = shouldLoop;
    sequencer.start(startTime);

    return sequencer;
  }
}

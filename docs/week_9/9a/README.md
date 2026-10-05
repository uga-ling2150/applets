# Activity 9A audio and timing data

Five continuous excerpts from the AMI Meeting Corpus (manual annotations v1.6.2) are used in `9A_turn_taking_trps.html`. The original meeting headset mixes are ES2003b and IS1005c. Source ranges, target speakers, and changes are credited in the page's source card. The audio files are 16 kHz mono WAV with per-excerpt gain and a 20 ms edge fade. Each excerpt ends before the next speaker's annotated word onset.

`data.js` holds the shifted manual word boundaries, a 96-bin amplitude display, the annotated final word ending and the original next-speaker onset. The annotated word boundaries are approximate, particularly around disfluencies. The last word ending is an analysis reference, not the only possible TRP. Student clicks are judgments in a browser, not measured speech onsets; their offsets must not be called gaps or overlaps.

The applet does not upload student choices. Individual results and locally imported group files use browser storage; the JSON export allows teachers to combine up to 60 anonymous participants on one computer. The optional group import has automated validation tests, but its native file-picker interaction still needs a manual browser check.

Before classroom release, listen to all five excerpts for clarity, prosodic cues, and accidental next-speaker leakage. Review the cuts and the AMI transcript, especially excerpt 4's fragmented words. If a clip is replaced, change the data version in `core.js` so old imports are rejected.

1. Audio files 60s or longer have at least triple the number of chords in the chart, going way past the length of the audio file itself. The charts must never exceed the total amount of time of the audio file.
2. Allow users to edit the segments by dragging the chord blocks left to decrease their size and thus end time or right to increase their size and increase the end time.
3. Highlight the chord currently being played.
4. The chord change is off by a second or so. The analysis should show exactly when the chord changes
5. Silence at the beginning or end of the file should be trimmed and ignored for the analysis
6. The chord chart should wrap. The chords should be left-justified. At least four beats per line, no more than 16 (the number of chords per line will depend on the BPM of the audio file).
7. Start and end time should only go to the millisecond for users to configure. This must be a universal rule.
8. Clicking on a chord should jump the playback to the beginning of that chord segment
9. Users should be able to drag and drop segments around. Start/end times must account for this when re-arranged.

Round 2
- [x] 1. Ignore chord segments that are less than 0.75 seconds, they are likely false positives. This should be a parameter than can be easily adjusted
- [x] 2. Show progress through the chord. Show a 'loading-bar' on the current chord correpsonding to how much time there is left on the chord
- [x] 3. Make the chord segment size correspond to the time the chord has
- [x] 4. Current movement of chord segments swap. Instead, insert moved chord segment to new position and push everything to the right forward. User should see preview of where the new chord will go. This should be shown as a pulsing vertical blue line placed between the existing segments that the moved segment will go beteen.
- [x] 5. Time should only be shown to the centisecond as a UX improvement.
- [x] 6. Allow file names to be updated. The do not need to be unique. Show the uploaded at timestamp (MM/DD/YY HH:mm:ss)
- [x] 7. Make login page username/password on their own horizontal line. Currently the share the same line
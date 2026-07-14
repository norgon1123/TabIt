import { PITCH_CLASS } from "../api/music";
import type { SegmentOut } from "../api/types";

export interface ChordGuessInput {
  root: string;
  quality: string;
}

/** Did the player name this chord?
 *
 * Roots are compared by **pitch class**, not by spelling: a chart that says Db and a player
 * who plays C# are naming the same chord, and failing them on the enharmonic would be
 * teaching them something untrue. Quality must match exactly — telling a maj7 from a maj is
 * the thing being practised, so "close enough" is not.
 */
export function isCorrectGuess(guess: ChordGuessInput, segment: SegmentOut): boolean {
  const guessed = PITCH_CLASS[guess.root];
  const actual = PITCH_CLASS[segment.chord_root];
  if (guessed === undefined || actual === undefined) return false;
  return guessed === actual && guess.quality === segment.chord_quality;
}

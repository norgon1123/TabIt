/*
 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.
 You should have received a copy of the GNU General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>.
 N.B.  the above text was copied from http://www.gnu.org/licenses/gpl.html
 unmodified. I have not attached a copy of the GNU license to the source...
 Copyright (C) 2011-2012 Timo Rantalainen
 */
package timo.tuner.Analysis;

import java.util.*;

public class Functions {

    public String[][] notePosition;

    public static double max(double[] data) {
        double[] temp = (double[]) data.clone();
        Arrays.sort(temp);
        return temp[temp.length - 1];
    }

    // Set notes in array where notePosition[string][fret]
    public static int[] getNotePosition( int i) {
        int[] notePosition = new int[6];
        Arrays.fill(notePosition, -1);

        /*
         Requirements to set string/fret positions
         need counter for which string the loop is on
         need a counter for which fret the loop is on
         need to set a new array (1D length 6) for each note
         need to assign each BST node to its positions
         strings 1-4, take assign current freq, then 1 string up and -5 frets, assign same freq
         string 5 takes same pattern, but -4 frets
         string 6 takes samme pattern, but -5 from 5th string
         array takes shape of notePosition[string] = fret
         */
        
        // Set notes relative to E string and fill all other positions of note
        // Range is from E2-C4
        if (i >= 0 && i <= 20) {
            notePosition[0] = i;
            if ((i - 5) >= 0) {
                notePosition[1] = i - 5;
            }
            if ((i - 10) >= 0) {
                notePosition[2] = i - 10;
            }
            if ((i - 15) >= 0) {
                notePosition[3] = i - 15;
            }
            if ((i - 19) >= 0) {
                notePosition[4] = i - 19;
            }
        }

        // Set notes relative to A string and fill all other positions of note
        // Range is from C#4-F4
        if (i >= 21 && i <= 25) {
            notePosition[1] = i - 5;
            notePosition[2] = i - 10;
            notePosition[3] = i - 15;
            notePosition[4] = i - 19;
            if((i - 24 >= 0)){
                notePosition[5] = i - 24;
            }
        }
        
        // Set notes relative to D string and fill all other positions of note
        // Range is from F#4-A#4
        if (i >= 26 && i <= 30) {
            notePosition[2] = i - 10;
            notePosition[3] = i - 15;
            notePosition[4] = i - 19;
            notePosition[5] = i - 24;
        }
            
        // Set notes relative to G string and fill all other positions of note
        // Range is from B4-D#5
        if (i >= 31 && i <= 35) {
            notePosition[3] = i - 15;
            notePosition[4] = i - 19;
            notePosition[5] = i - 24;
        }
            
        // Set notes relative to b string and fill all other positions of note
        // Range is from E5-G5
        if (i >= 36 && i <= 39) {
            notePosition[4] = i - 19;
            notePosition[5] = i - 24;
        }
            
        // Set notes relative to e string and fill all other positions of note
        // Range is from G#5-C6
        if (i >= 40 && i <= 44) {
            notePosition[5] = i - 24;
        }

        return notePosition;
    }

}
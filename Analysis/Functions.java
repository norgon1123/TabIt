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

    /*
    Hashmap has has been made irrelevant by the BST method of searching notes
    public static HashMap getMap() {
        HashMap<String, String> temp = new HashMap<>();
        temp.put("82", "E2");
        temp.put("87", "F2");
        temp.put("92", "F#2");
        temp.put("98", "G2");
        temp.put("104", "G#2");
        temp.put("110", "A2");
        temp.put("117", "A#2");
        temp.put("123", "B2");
        temp.put("131", "C3");
        temp.put("139", "C#3");
        temp.put("147", "D3");
        temp.put("156", "D#3");
        temp.put("165", "E3");
        temp.put("175", "F3");
        temp.put("185", "F#3");
        temp.put("196", "G3");
        temp.put("208", "G#3");
        temp.put("220", "A3");
        temp.put("233", "A#3");
        temp.put("247", "B3");
        temp.put("262", "C4");
        temp.put("277", "C#4");
        temp.put("294", "D4");
        temp.put("311", "D#4");
        temp.put("330", "E4");
        temp.put("349", "F4");
        temp.put("370", "F#4");
        temp.put("392", "G4");
        temp.put("415", "G#4");
        temp.put("440", "A4");
        temp.put("466", "A#4");
        temp.put("494", "B4");
        temp.put("523", "C5");
        temp.put("554", "C#5");
        temp.put("587", "D5");
        temp.put("622", "D#5");
        temp.put("659", "E5");
        temp.put("698", "F5");
        temp.put("740", "F#5");
        temp.put("784", "G5");
        temp.put("831", "G#5");
        temp.put("880", "A5");
        temp.put("932", "A#5");
        temp.put("988", "B5");
        temp.put("1046", "C6");
        temp.put("1109", "C#6");
        temp.put("1175", "D6");
        temp.put("1244", "D#6");

        return temp;
    }
    */

    //set notes in array where notePosition[string][fret]
    public static int[] getNotePosition( int i) {
        int[] notePosition = new int[6];
        Arrays.fill(notePosition, -1);

        /*
         Requirements to set string/fret positions
         need counter for which string the loop is on
         need a counter for which fret the loop is on
         need to set a new array (6x6) for each note
         need to assign each BST node to its positions
         Strings 1-4, take assign current freq, then 1 string up and -5 frets, assign same freq
         String 5 takes same patter, but -4 frets
         string 6 takes samme patter, but -5 from 5th string
         Array takes shape of notePosition[string][fret]
         */
        
        //set notes relative to E string and fill all other positions of note
        //Range is from E2-C4
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

        //set notes relative to A string and fill all other positions of note
        //Range is from C#4-F4
        if (i >= 21 && i <= 25) {
            notePosition[1] = i - 5;
            notePosition[2] = i - 10;
            notePosition[3] = i - 15;
            notePosition[4] = i - 19;
            if((i - 24 >= 0)){
                notePosition[5] = i - 24;
            }
        }
        
        //set notes relative to D string and fill all other positions of note
        //Range is from F#4-A#4
        if (i >= 26 && i <= 30) {
            notePosition[2] = i - 10;
            notePosition[3] = i - 15;
            notePosition[4] = i - 19;
            notePosition[5] = i - 24;
        }
            
        //set notes relative to G string and fill all other positions of note
        //Range is from B4-D#5
        if (i >= 31 && i <= 35) {
            notePosition[3] = i - 15;
            notePosition[4] = i - 19;
            notePosition[5] = i - 24;
        }
            
        //set notes relative to b string and fill all other positions of note
        //Range is from E5-G5
        if (i >= 36 && i <= 39) {
            notePosition[4] = i - 19;
            notePosition[5] = i - 24;
        }
            
        //set notes relative to e string and fill all other positions of note
        //Range is from G#5-C6
        if (i >= 40 && i <= 44) {
            notePosition[5] = i - 24;
        }

        return notePosition;
    }

}

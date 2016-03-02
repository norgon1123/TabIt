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

import java.text.DecimalFormat;
import java.util.*;

public class Functions {

    public String[][] notePosition;

    public static double max(double[] data) {
        double[] temp = (double[]) data.clone();
        Arrays.sort(temp);
        return temp[temp.length - 1];
    }

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

    //set notes in array where notePosition[string][fret]
    public static String[][] getNotePosition(double[] f0cands, HashMap detectedF0s) {
        String[][] notePosition = new String[6][21];
        DecimalFormat formatter = new DecimalFormat("#0");

        //set E string
        for (int i = 0; i < 21; i++) {
            notePosition[0][i] = (String) detectedF0s.get(formatter.format(f0cands[i + 12]));
        }

        //set A string
        for (int i = 0; i < 21; i++) {
            notePosition[1][i] = (String) detectedF0s.get(formatter.format(f0cands[i + 17]));
        }

        //set D string
        for (int i = 0; i < 21; i++) {
            notePosition[2][i] = (String) detectedF0s.get(formatter.format(f0cands[i + 22]));
        }

        //set G string
        for (int i = 0; i < 21; i++) {
            notePosition[3][i] = (String) detectedF0s.get(formatter.format(f0cands[i + 27]));
        }

        //set b string
        for (int i = 0; i < 21; i++) {
            notePosition[4][i] = (String) detectedF0s.get(formatter.format(f0cands[i + 31]));
        }

        //set e string
        for (int i = 0; i < 21; i++) {
            notePosition[5][i] = (String) detectedF0s.get(formatter.format(f0cands[i + 36]));
        }

        return notePosition;
    }

    //return all positions of the notes found in Klapuri
    public static int[] getTab(String[][] position, String[] notes) {
        int[] string = new int[notes.length];
        int[] fret = new int[notes.length];
        int count = 0;
        
        for (int k = 0; k < notes.length; k++) {
            System.out.print("Holy fuck we got here to tone:" + k + "\n");
            for (int j = 0; j < 6; j++) {
                System.out.print("Holy fuck we got here to string:" + j + "\n");
                for (int i = 0; i < 21; i++) { //last error
                    System.out.print("Holy fuck we got here to fret:" + i + "\n");
                    if (position[j][i].equals(notes[k])) {
                        //string[count] = j;
                        //fret[count] = i;
                        count++;
                        System.out.print("Holy fuck we set count:" + count + "\n");
                    }
                }
            }
        }
        System.out.print("Holy fuck we got here\n");
        return string;
    }
}

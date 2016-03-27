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
import timo.tuner.ui.*;
import timo.tuner.BST.*;

public class Klapuri {

    public double[] whitened;           // Whitened data in
    public double[] gammaCoeff;
    PolyphonicPitchDetection mainProgram;   // Pointer to main program
    int harmonics = 20;
    int surroundingBins = 1;
    double alpha = 52.0;                    // Used for Hanning window
    double beta = 320.0;                    // Used for Hanning window
    double dee = 0.89;
    BTNode n;                               // Detected F0 node in tree
    public double[] detectedF0sArray;       // Array holding detectedF0s
    public Vector<Double> f0s;              // Vector holding detected f0s

    // Constructor
    public Klapuri(double[] data, double max, PolyphonicPitchDetection mainProgram) {
        this.mainProgram = mainProgram;

        // Whiten the data
        whitened = whiten(data, mainProgram);
        f0s = detectF0s(whitened, mainProgram);
    }

    // Find prominent f0s from whitened data
    Vector<Double> detectF0s(double[] whitened, PolyphonicPitchDetection mainProgram) {
        Vector<Double> F0s = new Vector<>();
        Vector<Double> S = new Vector<>();
        S.add(0.0);

        // F0 detection
        double smax = 0;
        int index = 0;
        int detectedF0s = 0;
        double[] resultsk = new double[mainProgram.freq.length];
        double[] salience;
        double summa;
        while (S.lastElement() >= smax) {
            // Calculating the salience function (the hard way...)
            salience = new double[mainProgram.f0cands.length];
            double salmax = 0;

            for (int i = 0; i < mainProgram.f0index.length; ++i) {
                summa = 0;
                for (int j = 0; j < mainProgram.f0index[i].size(); ++j) {
                    summa += (mainProgram.freq[mainProgram.f0index[i].get(j)] + alpha) / ((j + 1) * mainProgram.freq[mainProgram.f0index[i].get(j)] + beta) * whitened[mainProgram.f0index[i].get(j)];
                }
                salience[i] = summa;

                if (salience[i] > salmax) {
                    index = i;
                    salmax = salience[i];
                }
            }

            ++detectedF0s;
            F0s.add(mainProgram.f0cands[index]); //First F0

            // Replace this with using f0cands indices at some point!
            // Frequency cancellation
            int[] tempCancelled = new int[resultsk.length];

            for (int j = 0; j < mainProgram.f0index[index].size(); ++j) {
                // Suppress the surrounding bins as well
                for (int i = -1; i <= 1; ++i) {

                    if (tempCancelled[mainProgram.f0index[index].get(j) + i] == 0 && mainProgram.f0index[index].get(j) + i < resultsk.length) {
                        resultsk[mainProgram.f0index[index].get(j) + i] = resultsk[mainProgram.f0index[index].get(j) + i]
                                + (mainProgram.samplingRate * mainProgram.freq[mainProgram.f0index[index].get(j) + i] + alpha)
                                / (((double) mainProgram.f0indHarm[index].get(j))
                                * mainProgram.samplingRate * mainProgram.freq[mainProgram.f0index[index].get(j) + i] + beta)
                                * whitened[mainProgram.f0index[index].get(j) + i];

                        if (whitened[mainProgram.f0index[index].get(j) + i] - resultsk[mainProgram.f0index[index].get(j) + i] > 0) {
                            whitened[mainProgram.f0index[index].get(j) + i]
                                    = whitened[mainProgram.f0index[index].get(j) + i]
                                    - resultsk[mainProgram.f0index[index].get(j) + i] * dee;

                        } else {
                            whitened[mainProgram.f0index[index].get(j) + i] = 0;
                        }
                        tempCancelled[mainProgram.f0index[index].get(j) + i] = 1;
                    }

                }

            }
            // Frequency cancellation done
            // Polyphony estimation
            if (S.size() < detectedF0s) {
                S.add(0.0);
            }
            summa = 0;
            for (int i = 0; i < resultsk.length; ++i) {
                summa += resultsk[i];
            }
            S.set(S.size() - 1, summa / Math.pow(detectedF0s, 0.7));
            if (S.lastElement() > smax) {
                smax = S.lastElement();
            }
            // Polyphony estimated
        }

        // The last F0 is extra...
        // System.out.println("Remove extra");
        if (F0s.size() > 1) {
            F0s.remove(F0s.size() - 1);
        }

        // Find how many F0s were found within the selected range
        int count = 0;
        for (int i = 0; i < F0s.size(); i++) {
            if (F0s.get(i) >= 82 && F0s.get(i) <= 1046) {
                count++;
            }
        }

        if (count > 0) {
            //Put F0s vector into array to use in BST
            detectedF0sArray = new double[count];
            Arrays.fill(detectedF0sArray, 0);
            int kk = 0;
            for (int i = 0; i < F0s.size(); i++) {
                if (F0s.get(i) >= 82 && F0s.get(i) <= 1046) {
                    detectedF0sArray[kk] = F0s.get(i);
                    kk++;
                }
            }

            Arrays.sort(detectedF0sArray);

            // Search BST for node and return note positions
            // Only showing detected lowest freq in hopes to roughly only get root note
            if ((int) detectedF0sArray[0] != 0) {
                n = mainProgram.searchTree.getNode((int) detectedF0sArray[0]);
                System.out.println("Tha shit in the if: " + detectedF0sArray[0]);
            }
            
        // Set n to f0init to indicate a freq on the fretboard was not detected    
        } else {
            n = mainProgram.searchTree.getNode((int) mainProgram.f0Init);
            System.out.println("here!");
        }

        // Add detected BTNodes to vector in main program and return
        mainProgram.detectedF0s.add(n);
        return F0s;
    }

    double[] whiten(double[] dataIn, PolyphonicPitchDetection mainProgram) {
        double[] whitened = new double[dataIn.length];

        /*Calculate signal energies in filter windows??*/
        Vector<Double> gammab = new Vector<Double>();
        Vector<Double> stdb = new Vector<Double>();

        int kk;
        for (int i = 0; i < mainProgram.Hb.length; ++i) {
            double tempSum = 0;
            for (int j = 0; j < mainProgram.Hb[i].size(); ++j) {
                tempSum += mainProgram.Hb[i].get(j) * Math.pow(dataIn[mainProgram.hbIndices[i].get(j)], 2.0);
            }

            stdb.add(Math.sqrt(tempSum / ((double) dataIn.length)));
            gammab.add(Math.pow(stdb.lastElement(), 0.33 - 1.0));
        }

        //Interpolate gammab...
        gammaCoeff = new double[dataIn.length];

        // Search for the first frequency
        kk = 0;
        while (mainProgram.freq[kk] < mainProgram.cb[1]) {
            gammaCoeff[kk] = gammab.get(0);
            ++kk;
        }
        double whitemax = 0;
        for (int i = 0; i < gammab.size() - 1; ++i) {
            int init = ind(mainProgram.freq, mainProgram.cb[i + 1]);
            int end = ind(mainProgram.freq, mainProgram.cb[i + 2]);
            while (kk < end) {
                gammaCoeff[kk] = gammab.get(i) + (gammab.get(i + 1) - gammab.get(i)) * Math.abs((double) (kk - init)) / ((double) (end - init));
                ++kk;
            }
        }

        // Fill in the rest of the whitened with the last gammab*/
        while (kk < whitened.length) {
            gammaCoeff[kk] = gammab.get(gammab.size() - 1);
            ++kk;
        }

        // Whiten the signal
        for (int i = 0; i < whitened.length; ++i) {
            whitened[i] = dataIn[i] * gammaCoeff[i];
        }

        return whitened;
    }

    public static int ind(double[] arr, double a) {
        int b = 0;
        while (arr[b] < a) {
            ++b;
        }

        return b;
    }
}

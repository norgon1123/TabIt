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

/*
Written by Timo Rantalainen tjrantal@gmail.com 2010 (C++ version) - 2012 (Java version)
Based on Anssi Klapuri's (list of publications http://www.cs.tut.fi/~klap/iiro/ and http://www.elec.qmul.ac.uk/people/anssik/publications.htm) congress publication
Klapuri, A., " Multiple fundamental frequency estimation by summing harmonic amplitudes," 7th International Conference on Music Information Retrieval (ISMIR-06), Victoria, Canada, Oct. 2006.
http://www.cs.tut.fi/sgn/arg/klap/klap2006ismir.pdf
 and doctoral thesis:
Klapuri, A. " Signal processing methods for the automatic transcription of music," Ph.D. thesis, Tampere University of Technology, Finland, April 2004.
 http://www.cs.tut.fi/sgn/arg/klap/phd/klap_phd.pdf

Contributions from other people taken from the internet (in addition to Java-tutorials for GUI, sound capture etc.)
FFT-transform

Required class files (in addition to this one..).
ReadStratecFile.java		//Stratec pQCT file reader
DrawImage.java				//Visualize image in a panel
SelectROI.java
AnalyzeRoi.java			//Analysis calculations

JAVA compilation:
javac -cp '.:' ui/PolyphonicPitchDetection.java \
Capture/Capture.java \
DrawImage/DrawImage.java \
Analysis/Analysis.java \
Analysis/Complex.java \
Analysis/FFT.java \
Analysis/Functions.java \
Analysis/Klapuri.java
JAR building:
jar cfe PolyphonicPitchDetection.jar ui.PolyphonicPitchDetection ui DrawImage Analysis Capture

*/
package timo.tuner.ui;
import javax.swing.*;		//GUI commands swing
import java.awt.event.*; 	//Events & Actionlistener
import java.io.*;				//File IO
import java.lang.Math;
import java.awt.*;
import java.awt.geom.Line2D;
import javax.swing.event.*;
import javax.swing.border.*;
import java.util.Vector;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.io.*;
import javax.sound.sampled.*;
import java.awt.font.*;
import java.text.*;
import java.awt.image.*;
import java.awt.image.DataBuffer;

import timo.tuner.Analysis.*;	//Polyphonic analysis
import timo.tuner.Capture.*;	//Sound capture
import timo.tuner.DrawImage.*;		//Drawing images

public class PolyphonicPitchDetection extends JPanel implements ActionListener {
	JButton beginPitchDetection;
	JButton endPitchDetection;
	public DrawImage fftFigure;
	public DrawImage rawFigure;
	public DrawImage whitenedFftFigure;
	public int fftWindow = 8192;	/*FFT window width ~0.1 s -> Max ~600 bpm*/
	public float samplingRate = 44100;
	public static int imWidth =800;
	public static int imHeight =250;
	public static int harmonics = 20;
	public boolean continueCapturing;
	public static int w;
	public static int h;
	static int traces = 2;		/*how many traces are we plotting...*/
	public double[] cb;			/*Klapuri whitening ranges*/
	public ArrayList<Double>[] Hb;	/*filter bank for whitening*/
	public ArrayList<Integer>[] hbIndices;	/*filter bank indices for whitening*/
	public double[] freq;		/*FFT fequency bins*/
	public double[] f0cands;	/*Klapuri F0 candidates*/
        public double[] f0candstemp;    /*Temp holding all F0 freqs*/
        public double[] intervals;
        public String[][] fretNotes;    //array holding the position of the notes on the fretboard
	public ArrayList<Integer>[] f0index;		/*Klapuri F0 candidate indices*/
	public ArrayList<Integer>[] f0indHarm;		/*Klapuri F0 candidate indices harmonics*/
        public HashMap<String, String> detectedF0s;   //map of candidate frequencies and their respective note
	public PolyphonicPitchDetection(){ /*Constructor*/

		JPanel buttons = new JPanel(); /*Panel for start and stop*/
		/*Begin button*/
		beginPitchDetection= new JButton("Begin pitch detection");
		beginPitchDetection.setMnemonic(KeyEvent.VK_B);
		beginPitchDetection.setActionCommand("beginPitchDetection");
		beginPitchDetection.addActionListener(this);
		beginPitchDetection.setToolTipText("Press to Begin pitch detection");

		/*End button*/
		buttons.add(beginPitchDetection);
		endPitchDetection= new JButton("End pitch detection");
		endPitchDetection.setMnemonic(KeyEvent.VK_E);
		endPitchDetection.setActionCommand("endPitchDetection");
		endPitchDetection.addActionListener(this);
		endPitchDetection.setToolTipText("Press to End pitch detection");
		endPitchDetection.setEnabled(false);
		buttons.add(endPitchDetection);
		add(buttons);


		/*Figure for captured sound*/
		rawFigure = new DrawImage(new Dimension(imWidth,imHeight));
		//rawFigure.setBackground(new Dimension(imWidth,imHeight));
		//rawFigure.setPreferredSize(new Dimension(imWidth,imHeight));
		rawFigure.setOpaque(true);
		add(rawFigure);

		/*Figure for whitened fft*/
		whitenedFftFigure = new DrawImage(new Dimension(imWidth,imHeight));
		//whitenedFftFigure.setBackground(new Dimension(imWidth,imHeight));
		//whitenedFftFigure.setPreferredSize(new Dimension(imWidth,imHeight));
		whitenedFftFigure.setOpaque(true);
		add(whitenedFftFigure);
		}

	public void actionPerformed(ActionEvent e) {
		if ("beginPitchDetection".equals(e.getActionCommand())) {
			endPitchDetection.setEnabled(true);
			beginPitchDetection.setEnabled(false);
			/*Create constant arrays for Klapuri*/
			cb = new double[32];
			/*CB filterbank always the same values, could be included from somewhere...*/
			for (int b = 0;b<32;++b){
                            //System.out.print(b +"\n");
                            cb[b] = 229.0*(Math.pow(10.0,(((double) (b+1.0))/21.4))-1.0); //frequency division
                            //cb[b] = 229.0*(Math.pow(10.0,(((double) (0.00435*b+1.0))/21.4))-1.0); //test
                            //System.out.print(cb[b] +"\n");
			}
			/*Frequencies, always the same after capture init...
			captured signal will be zero padded to twice its length, so valid fft bins are equal to original epoch length
			*/
			freq = new double[(int) Math.floor((double) fftWindow)];
			for (int b = 0;b<Math.floor(fftWindow);++b){
				freq[b] = (double) b*(double)(samplingRate/2)/(double) fftWindow; //Generates FFT frequency bin based off of fftWindow (2^12), frequencies are 3.2 Hz apart
                                //System.out.print(b + " " + freq[b] +"\n");
			}
                        
			/*Create filter bank*/
                        //System.out.print("\n\n\n");
                        //System.out.print("--------------------------------------\n");
			Hb = new ArrayList[30]; //contains data
			hbIndices = new ArrayList[30];  //contains indicie to data in Hb
			for (int i = 1;i<31;++i){
				Hb[i-1] = new ArrayList<Double>();
				hbIndices[i-1] = new ArrayList<Integer>();
				int kk=Klapuri.ind(freq,cb[i-1]);   //returns index of frequency closest to and less than bank created in cb[])
                                //System.out.print(kk + " " + cb[i-1] + "\n");
				while (freq[kk] <= cb[i]){
					hbIndices[i-1] .add(kk);
					if (freq[kk] <= cb[i]){
						Hb[i-1].add(1-Math.abs(cb[i]-freq[kk])/(cb[i]-cb[i-1]));
					}else{
					   	Hb[i-1].add(1-Math.abs(cb[i]-freq[kk])/(cb[i+1]-cb[i]));
                                                //System.out.print("We out hur\n");
					}
					++kk;
				}
			}
                        

			/*
			*Create candidate frequencies here (http://www.phy.mtu.edu/~suits/NoteFreqCalcs.html)
			*Five octaves of candidate notes. Use quarter a half-step to get out of tune freqs
			*Lowest freq (f0) = 55.0 Hz, A three octaves below A above the middle C
			*/
			double f0Init = 41.2;	//Hz
			double a = Math.pow(2.0,(1.0/12.0));
                        //DecimalFormat formatter = new DecimalFormat("#0"); //testing int of f0cands
			f0candstemp = new double[5*12*4];	//5 octaves, 12 half-steps per octave, quarter half-steps
                        f0cands = new double[60];
                        int i = 0;
			for (int kk = 0;kk<f0candstemp.length;++kk){
                                f0candstemp[kk] = f0Init*Math.pow(a,((double)kk)/4.0);  // every 4 cands exists on the fretboard
                           if(kk % 4 == 0){
                               f0cands[i] = f0candstemp[kk];
                               //System.out.print("\n" + f0cands[i] + " " + i);
                               ++i;
                           }
                        }
                        
                        detectedF0s = Functions.getMap();   //create map of frequency and note assosication
                        fretNotes = Functions.getNotePosition(f0cands, detectedF0s);
                        //intervals = getIntervals(f0cands);
                        //for(int j=0; j<intervals.length; ++j)
                        //    System.out.print(intervals[j] + " " + j + "\n");
                        

			/*
			*Pre-calculate frequency bins for  a given f0 candidate
			*/
			 f0index = new ArrayList[f0cands.length];
			 f0indHarm = new ArrayList[f0cands.length];
			double halfBinWidth= ((double)samplingRate/(double) fftWindow)/2;
			for (int k =0;k<f0index.length;++k){
			   f0index[k] = new ArrayList();
			   f0indHarm[k] = new ArrayList();
                           //passes frequency bank, returns ArrayList of 
			   for (int h = 0; h < harmonics; ++h){
			      ArrayList<Integer> tempInd =find(freq,f0cands[k]*((double)h+1.0)-halfBinWidth,f0cands[k]*((double)h+1.0)+halfBinWidth); //gets index of closest match between freq bank and f0cand (5 harmonics used)
                              //System.out.print(tempInd + "\n");
			      f0index[k].addAll(tempInd);
                              //System.out.print(f0index[k] + "\n");
			      for (int t = 0;t<tempInd.size();++t){
			      	f0indHarm[k] .add(h+1);
                                //System.out.print(f0indHarm[k] + "\n");
			      }
			   }
			}



			continueCapturing = true;
			/*Start capturing and analysis thread*/
			//Capture capture = new Capture(samplingRate,8,this);
			Capture capture = new Capture(16,this);
			Thread captureThread = new Thread(capture,"captureThread");
			captureThread.start();
		}
		if ("endPitchDetection".equals(e.getActionCommand())){
			continueCapturing = false;
			endPitchDetection.setEnabled(false);
			beginPitchDetection.setEnabled(true);
		}
	}

        //checks if amounts are greater than lowest reference and less than highest reference
        //if yes, adds value to new ArrayLlist b
	private ArrayList<Integer> find(double[] arr, double lower, double upper){
	   ArrayList<Integer> b = new ArrayList<Integer>();
           //System.out.print(arr.length +"\n");
	   for (int i = 0; i<arr.length;++i){
	      if (arr[i]>=lower && arr[i] <=upper){
	      	b.add(i);
                //System.out.print(b +"\n");
	      }
	   }
	   return b;
	}
        
        //Get freq difference between characteristic frequencies
        private double[] getIntervals(double[] freq){
            double[] temp = new double[freq.length];
            temp[0] = (freq[1] - freq[0])/2;
            for(int i=1; i<freq.length-1; ++i){
                temp[i] = (freq[i+1] - freq[i])/2;
            }
            return temp;
        }
                
	public static void initAndShowGUI(){
		JFrame f = new JFrame("Polyphonic Pitch Detection");
		f.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
		JComponent newContentPane = new PolyphonicPitchDetection();
		newContentPane.setOpaque(true); //content panes must be opaque
		f.setContentPane(newContentPane);
		f.pack();
		Dimension screenSize = Toolkit.getDefaultToolkit().getScreenSize();

		if (screenSize.width < imWidth+40){w = screenSize.width-40;}else{w=imWidth+40;}
		if (screenSize.height < imHeight*traces+100){h = screenSize.height-40;}else{h=imHeight*traces+100;}
		f.setLocation(20, 20);
		//f.setLocation(screenSize.width/2 - w/2, screenSize.height/2 - h/2);
		f.setSize(w, h);
		f.setVisible(true);
	}


	public static void main(String[] args){
		javax.swing.SwingUtilities.invokeLater(new Runnable() {
			public void run(){
				initAndShowGUI();
			}
		}
		);
	}
}



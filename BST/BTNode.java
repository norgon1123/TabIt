/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package timo.tuner.BST;

/**
 *
 * @author Neil Orgon
 */

public class BTNode {
    public int data;
    public BTNode left, right;
    public int[] positions;
     
     //constructor
     BTNode(int x, BTNode L, BTNode R){
        data = x;
        left = L;
        right = R;
     }

}

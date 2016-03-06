package timo.tuner.BST;

/**
 *
 * @author Neil Orgon
 */
//constructor
public class BST {

    private BTNode root;
    int column = 0;

    public BST() {
        root = null;
    }

//insert word to BST
    public void insert(int x) {
        if (root == null) {
            root = new BTNode(x, null, null);
        } else {
            insert(root, x);
        }
    }

//find correct node for word in BST
//if word already exists in BST, increment occur
    private void insert(BTNode n, int x) {
        if (x < n.data) {
            if (n.left == null) {
                n.left = new BTNode(x, null, null);
            } else {
                insert(n.left, x);
            }
        } else {
            if (n.right == null) {
                n.right = new BTNode(x, null, null);
            } else {
                insert(n.right, x);
            }
        }
    }

//print BST
    public void printInorder() {
        inorder(root);
    }

//print BST in order
    private void inorder(BTNode n) {
        if (n != null) {
            inorder(n.left);
            visit(n);
            inorder(n.right);
        }
    }

//print 4 words per column with occurance
    private void visit(BTNode n) {
        System.out.printf("freq: %d ", n.data);
    }

    //getter method for height of BST
    public int height() {
        BTNode n = root;
        return height(n);
    }

//return height of BST
    private int height(BTNode n) {
        if (n == null) {
            return -1;
        }
        int lefth = height(n.left);
        int righth = height(n.right);
        if (lefth > righth) {
            return lefth + 1;
        } else {
            return righth + 1;
        }
    }

//getter method for node with data val
    public BTNode getNode(int val) {
        BTNode n = root;
        return getNode(n, val);
    }

//search and return node with data val
    private BTNode getNode(BTNode n, int val) {
        BTNode node = null;
        if (n != null) {
            if (n.data == val) {
                node = n; //it took 2 compares, null check and = check,
            } else if (n.data > val) //the third compare
            {
                return getNode(n.left, val);
            } else {
                return getNode(n.right, val);
            }
        }
        return node;
    }

}

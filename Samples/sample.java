class MathUtils {

    int square(int x) {
        return multiply(x, x);
    }

    int multiply(int a, int b) {
        int result = 0;
        for (int i = 0; i < b; i++) {
            result = result + a;
        }
        return result;
    }

    int factorial(int n) {
        if (n <= 1) {
            return 1;
        }
        return n * factorial(n - 1);
    }

    void printResults(int n) {
        int sq = square(n);
        int fact = factorial(n);

        display("Square: " + sq);
        display("Factorial: " + fact);
    }

    void display(String msg) {
        // imagine this prints to screen
        return;
    }
}

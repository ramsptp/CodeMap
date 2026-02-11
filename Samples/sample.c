#include <stdio.h>

int gcd(int a, int b) {
    while (b != 0) {
        int temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

int main() {
    int num1 = 48;
    int num2 = 18;
    
    if (num1 <= 0 || num2 <= 0) {
        printf("Numbers must be positive\n");
        return 1;
    }
    
    int result = gcd(num1, num2);
    
    if (result > 1) {
        printf("GCD is %d\n", result);
    } else {
        printf("Co-prime numbers\n");
    }
    
    return 0;
}

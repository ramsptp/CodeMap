def calculate_factorial(n):
    if n < 0:
        return None
    elif n == 0:
        return 1
    else:
        result = 1
        for i in range(1, n + 1):
            result *= i
        return result

def greet_user(name):
    print(f"Hello, {name}!")
    if name == "Alice":
        print("Welcome back, Alice!")
    else:
        print("Nice to meet you!")

class Calculator:
    def add(self, a, b):
        return a + b
    
    def multiply(self, a, b):
        product = 0
        for _ in range(b):
            product += a
        return product

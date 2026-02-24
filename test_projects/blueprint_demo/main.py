from utils import process_data
from math_helpers import calculate_sum

def run_app():
    data = [1, 2, 3, 4]
    total = calculate_sum(data)
    result = process_data(total)
    print(f"Result: {result}")

if __name__ == "__main__":
    run_app()

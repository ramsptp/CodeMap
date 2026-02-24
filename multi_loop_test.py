def run_test_loops():
    # Simple For Loop
    print("Starting For Loop")
    for i in range(3):
        print(f"For loop iteration {i}")
        if i == 1:
            print("Halfway there!")
        
    # Simple While Loop
    print("\nStarting While Loop")
    count = 0
    while count < 3:
        print(f"While loop iteration {count}")
        if count == 0:
            print("First iteration!")
        else:
            print("Subsequent iteration")
            
        count += 1
        
    # Nested loops with try-except
    print("\nStarting Nested Loop test")
    matrix = [[1, 2], [3, 4]]
    try:
        for row in matrix:
            for item in row:
                if item == 3:
                    print("Found 3!")
                else:
                    print(f"Processing {item}")
    except Exception as e:
        print(f"Error: {e}")
        
    return "Done"

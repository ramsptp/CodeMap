def standalone_task():
    print("I do not depend on anything, and nobody depends on me.")
    for i in range(5):
        print(i)

if __name__ == "__main__":
    standalone_task()

// Curated Code Templates for Students
const templates = [
  // ===== MATH =====
  {
    id: "gcd", category: "Math", name: "GCD (Euclidean Algorithm)",
    description: "Find Greatest Common Divisor of two numbers using Euclid's algorithm.",
    code: {
      python: `def gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return a\n\n# Example\nprint(gcd(48, 18))  # Output: 6`,
      java: `public class GCD {\n    public static int gcd(int a, int b) {\n        while (b != 0) {\n            int temp = b;\n            b = a % b;\n            a = temp;\n        }\n        return a;\n    }\n\n    public static void main(String[] args) {\n        System.out.println(gcd(48, 18)); // Output: 6\n    }\n}`,
      cpp: `#include <iostream>\nusing namespace std;\n\nint gcd(int a, int b) {\n    while (b != 0) {\n        int temp = b;\n        b = a % b;\n        a = temp;\n    }\n    return a;\n}\n\nint main() {\n    cout << gcd(48, 18) << endl; // Output: 6\n    return 0;\n}`,
      javascript: `function gcd(a, b) {\n    while (b !== 0) {\n        [a, b] = [b, a % b];\n    }\n    return a;\n}\n\nconsole.log(gcd(48, 18)); // Output: 6`
    }
  },
  {
    id: "prime_check", category: "Math", name: "Prime Number Check",
    description: "Check if a number is prime using trial division.",
    code: {
      python: `def is_prime(n):\n    if n < 2:\n        return False\n    for i in range(2, int(n**0.5) + 1):\n        if n % i == 0:\n            return False\n    return True\n\n# Example\nfor num in [2, 7, 10, 17, 25]:\n    print(f"{num}: {is_prime(num)}")`,
      java: `public class PrimeCheck {\n    public static boolean isPrime(int n) {\n        if (n < 2) return false;\n        for (int i = 2; i <= Math.sqrt(n); i++) {\n            if (n % i == 0) return false;\n        }\n        return true;\n    }\n\n    public static void main(String[] args) {\n        int[] nums = {2, 7, 10, 17, 25};\n        for (int num : nums) {\n            System.out.println(num + ": " + isPrime(num));\n        }\n    }\n}`,
      cpp: `#include <iostream>\n#include <cmath>\nusing namespace std;\n\nbool isPrime(int n) {\n    if (n < 2) return false;\n    for (int i = 2; i <= sqrt(n); i++) {\n        if (n % i == 0) return false;\n    }\n    return true;\n}\n\nint main() {\n    int nums[] = {2, 7, 10, 17, 25};\n    for (int num : nums) {\n        cout << num << ": " << (isPrime(num) ? "true" : "false") << endl;\n    }\n    return 0;\n}`,
      javascript: `function isPrime(n) {\n    if (n < 2) return false;\n    for (let i = 2; i <= Math.sqrt(n); i++) {\n        if (n % i === 0) return false;\n    }\n    return true;\n}\n\n[2, 7, 10, 17, 25].forEach(num => console.log(\`\${num}: \${isPrime(num)}\`));`
    }
  },
  {
    id: "fibonacci", category: "Math", name: "Fibonacci Sequence",
    description: "Generate Fibonacci numbers iteratively.",
    code: {
      python: `def fibonacci(n):\n    a, b = 0, 1\n    result = []\n    for _ in range(n):\n        result.append(a)\n        a, b = b, a + b\n    return result\n\nprint(fibonacci(10))`,
      java: `public class Fibonacci {\n    public static void main(String[] args) {\n        int n = 10;\n        int a = 0, b = 1;\n        for (int i = 0; i < n; i++) {\n            System.out.print(a + " ");\n            int temp = a + b;\n            a = b;\n            b = temp;\n        }\n    }\n}`,
      cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    int n = 10, a = 0, b = 1;\n    for (int i = 0; i < n; i++) {\n        cout << a << " ";\n        int temp = a + b;\n        a = b;\n        b = temp;\n    }\n    return 0;\n}`,
      javascript: `function fibonacci(n) {\n    let a = 0, b = 1;\n    const result = [];\n    for (let i = 0; i < n; i++) {\n        result.push(a);\n        [a, b] = [b, a + b];\n    }\n    return result;\n}\n\nconsole.log(fibonacci(10));`
    }
  },
  {
    id: "factorial", category: "Math", name: "Factorial (Iterative & Recursive)",
    description: "Calculate factorial of a number.",
    code: {
      python: `def factorial_iterative(n):\n    result = 1\n    for i in range(2, n + 1):\n        result *= i\n    return result\n\ndef factorial_recursive(n):\n    if n <= 1:\n        return 1\n    return n * factorial_recursive(n - 1)\n\nprint(factorial_iterative(5))  # 120\nprint(factorial_recursive(5))  # 120`,
      java: `public class Factorial {\n    public static long iterative(int n) {\n        long result = 1;\n        for (int i = 2; i <= n; i++) result *= i;\n        return result;\n    }\n\n    public static long recursive(int n) {\n        if (n <= 1) return 1;\n        return n * recursive(n - 1);\n    }\n\n    public static void main(String[] args) {\n        System.out.println(iterative(5)); // 120\n        System.out.println(recursive(5)); // 120\n    }\n}`,
      cpp: `#include <iostream>\nusing namespace std;\n\nlong long factorialIterative(int n) {\n    long long result = 1;\n    for (int i = 2; i <= n; i++) result *= i;\n    return result;\n}\n\nlong long factorialRecursive(int n) {\n    if (n <= 1) return 1;\n    return n * factorialRecursive(n - 1);\n}\n\nint main() {\n    cout << factorialIterative(5) << endl; // 120\n    cout << factorialRecursive(5) << endl; // 120\n    return 0;\n}`,
      javascript: `function factorialIterative(n) {\n    let result = 1;\n    for (let i = 2; i <= n; i++) result *= i;\n    return result;\n}\n\nfunction factorialRecursive(n) {\n    if (n <= 1) return 1;\n    return n * factorialRecursive(n - 1);\n}\n\nconsole.log(factorialIterative(5)); // 120\nconsole.log(factorialRecursive(5)); // 120`
    }
  },
  // ===== SORTING =====
  {
    id: "bubble_sort", category: "Sorting", name: "Bubble Sort",
    description: "Simple comparison-based sorting algorithm. O(n²) time complexity.",
    code: {
      python: `def bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n - i - 1):\n            if arr[j] > arr[j + 1]:\n                arr[j], arr[j + 1] = arr[j + 1], arr[j]\n    return arr\n\nprint(bubble_sort([64, 34, 25, 12, 22, 11, 90]))`,
      java: `public class BubbleSort {\n    public static void sort(int[] arr) {\n        int n = arr.length;\n        for (int i = 0; i < n; i++) {\n            for (int j = 0; j < n - i - 1; j++) {\n                if (arr[j] > arr[j + 1]) {\n                    int temp = arr[j];\n                    arr[j] = arr[j + 1];\n                    arr[j + 1] = temp;\n                }\n            }\n        }\n    }\n\n    public static void main(String[] args) {\n        int[] arr = {64, 34, 25, 12, 22, 11, 90};\n        sort(arr);\n        for (int x : arr) System.out.print(x + " ");\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nvoid bubbleSort(vector<int>& arr) {\n    int n = arr.size();\n    for (int i = 0; i < n; i++)\n        for (int j = 0; j < n - i - 1; j++)\n            if (arr[j] > arr[j + 1])\n                swap(arr[j], arr[j + 1]);\n}\n\nint main() {\n    vector<int> arr = {64, 34, 25, 12, 22, 11, 90};\n    bubbleSort(arr);\n    for (int x : arr) cout << x << " ";\n    return 0;\n}`,
      javascript: `function bubbleSort(arr) {\n    const n = arr.length;\n    for (let i = 0; i < n; i++)\n        for (let j = 0; j < n - i - 1; j++)\n            if (arr[j] > arr[j + 1])\n                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];\n    return arr;\n}\n\nconsole.log(bubbleSort([64, 34, 25, 12, 22, 11, 90]));`
    }
  },
  {
    id: "merge_sort", category: "Sorting", name: "Merge Sort",
    description: "Efficient divide-and-conquer sorting. O(n log n) time complexity.",
    code: {
      python: `def merge_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    mid = len(arr) // 2\n    left = merge_sort(arr[:mid])\n    right = merge_sort(arr[mid:])\n    return merge(left, right)\n\ndef merge(left, right):\n    result = []\n    i = j = 0\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            result.append(left[i])\n            i += 1\n        else:\n            result.append(right[j])\n            j += 1\n    result.extend(left[i:])\n    result.extend(right[j:])\n    return result\n\nprint(merge_sort([38, 27, 43, 3, 9, 82, 10]))`,
      java: `public class MergeSort {\n    public static void mergeSort(int[] arr, int l, int r) {\n        if (l < r) {\n            int m = (l + r) / 2;\n            mergeSort(arr, l, m);\n            mergeSort(arr, m + 1, r);\n            merge(arr, l, m, r);\n        }\n    }\n\n    static void merge(int[] arr, int l, int m, int r) {\n        int[] left = java.util.Arrays.copyOfRange(arr, l, m + 1);\n        int[] right = java.util.Arrays.copyOfRange(arr, m + 1, r + 1);\n        int i = 0, j = 0, k = l;\n        while (i < left.length && j < right.length)\n            arr[k++] = left[i] <= right[j] ? left[i++] : right[j++];\n        while (i < left.length) arr[k++] = left[i++];\n        while (j < right.length) arr[k++] = right[j++];\n    }\n\n    public static void main(String[] args) {\n        int[] arr = {38, 27, 43, 3, 9, 82, 10};\n        mergeSort(arr, 0, arr.length - 1);\n        for (int x : arr) System.out.print(x + " ");\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nvoid merge(vector<int>& arr, int l, int m, int r) {\n    vector<int> left(arr.begin()+l, arr.begin()+m+1);\n    vector<int> right(arr.begin()+m+1, arr.begin()+r+1);\n    int i=0, j=0, k=l;\n    while (i<left.size() && j<right.size())\n        arr[k++] = left[i]<=right[j] ? left[i++] : right[j++];\n    while (i<left.size()) arr[k++] = left[i++];\n    while (j<right.size()) arr[k++] = right[j++];\n}\n\nvoid mergeSort(vector<int>& arr, int l, int r) {\n    if (l<r) {\n        int m=(l+r)/2;\n        mergeSort(arr,l,m);\n        mergeSort(arr,m+1,r);\n        merge(arr,l,m,r);\n    }\n}\n\nint main() {\n    vector<int> arr={38,27,43,3,9,82,10};\n    mergeSort(arr,0,arr.size()-1);\n    for (int x:arr) cout<<x<<" ";\n    return 0;\n}`,
      javascript: `function mergeSort(arr) {\n    if (arr.length <= 1) return arr;\n    const mid = Math.floor(arr.length / 2);\n    const left = mergeSort(arr.slice(0, mid));\n    const right = mergeSort(arr.slice(mid));\n    const result = [];\n    let i = 0, j = 0;\n    while (i < left.length && j < right.length)\n        result.push(left[i] <= right[j] ? left[i++] : right[j++]);\n    return result.concat(left.slice(i), right.slice(j));\n}\n\nconsole.log(mergeSort([38, 27, 43, 3, 9, 82, 10]));`
    }
  },
  {
    id: "quick_sort", category: "Sorting", name: "Quick Sort",
    description: "Fast divide-and-conquer sorting using a pivot. Average O(n log n).",
    code: {
      python: `def quick_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    return quick_sort(left) + middle + quick_sort(right)\n\nprint(quick_sort([3, 6, 8, 10, 1, 2, 1]))`,
      java: `public class QuickSort {\n    public static void quickSort(int[] arr, int low, int high) {\n        if (low < high) {\n            int pi = partition(arr, low, high);\n            quickSort(arr, low, pi - 1);\n            quickSort(arr, pi + 1, high);\n        }\n    }\n\n    static int partition(int[] arr, int low, int high) {\n        int pivot = arr[high];\n        int i = low - 1;\n        for (int j = low; j < high; j++) {\n            if (arr[j] < pivot) {\n                i++;\n                int temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;\n            }\n        }\n        int temp = arr[i+1]; arr[i+1] = arr[high]; arr[high] = temp;\n        return i + 1;\n    }\n\n    public static void main(String[] args) {\n        int[] arr = {3, 6, 8, 10, 1, 2, 1};\n        quickSort(arr, 0, arr.length - 1);\n        for (int x : arr) System.out.print(x + " ");\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nint partition(vector<int>& arr, int low, int high) {\n    int pivot = arr[high], i = low - 1;\n    for (int j = low; j < high; j++)\n        if (arr[j] < pivot) swap(arr[++i], arr[j]);\n    swap(arr[i+1], arr[high]);\n    return i + 1;\n}\n\nvoid quickSort(vector<int>& arr, int low, int high) {\n    if (low < high) {\n        int pi = partition(arr, low, high);\n        quickSort(arr, low, pi - 1);\n        quickSort(arr, pi + 1, high);\n    }\n}\n\nint main() {\n    vector<int> arr = {3,6,8,10,1,2,1};\n    quickSort(arr, 0, arr.size()-1);\n    for (int x : arr) cout << x << " ";\n    return 0;\n}`,
      javascript: `function quickSort(arr) {\n    if (arr.length <= 1) return arr;\n    const pivot = arr[Math.floor(arr.length / 2)];\n    const left = arr.filter(x => x < pivot);\n    const middle = arr.filter(x => x === pivot);\n    const right = arr.filter(x => x > pivot);\n    return [...quickSort(left), ...middle, ...quickSort(right)];\n}\n\nconsole.log(quickSort([3, 6, 8, 10, 1, 2, 1]));`
    }
  },
  // ===== SEARCHING =====
  {
    id: "binary_search", category: "Searching", name: "Binary Search",
    description: "Efficient search on sorted arrays. O(log n) time complexity.",
    code: {
      python: `def binary_search(arr, target):\n    low, high = 0, len(arr) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1\n\narr = [2, 3, 4, 10, 40]\nprint(binary_search(arr, 10))  # Output: 3`,
      java: `public class BinarySearch {\n    public static int search(int[] arr, int target) {\n        int low = 0, high = arr.length - 1;\n        while (low <= high) {\n            int mid = (low + high) / 2;\n            if (arr[mid] == target) return mid;\n            else if (arr[mid] < target) low = mid + 1;\n            else high = mid - 1;\n        }\n        return -1;\n    }\n\n    public static void main(String[] args) {\n        int[] arr = {2, 3, 4, 10, 40};\n        System.out.println(search(arr, 10)); // Output: 3\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nint binarySearch(vector<int>& arr, int target) {\n    int low = 0, high = arr.size() - 1;\n    while (low <= high) {\n        int mid = (low + high) / 2;\n        if (arr[mid] == target) return mid;\n        else if (arr[mid] < target) low = mid + 1;\n        else high = mid - 1;\n    }\n    return -1;\n}\n\nint main() {\n    vector<int> arr = {2, 3, 4, 10, 40};\n    cout << binarySearch(arr, 10) << endl; // Output: 3\n    return 0;\n}`,
      javascript: `function binarySearch(arr, target) {\n    let low = 0, high = arr.length - 1;\n    while (low <= high) {\n        const mid = Math.floor((low + high) / 2);\n        if (arr[mid] === target) return mid;\n        else if (arr[mid] < target) low = mid + 1;\n        else high = mid - 1;\n    }\n    return -1;\n}\n\nconsole.log(binarySearch([2, 3, 4, 10, 40], 10)); // Output: 3`
    }
  },
  {
    id: "linear_search", category: "Searching", name: "Linear Search",
    description: "Simple sequential search. O(n) time complexity.",
    code: {
      python: `def linear_search(arr, target):\n    for i, val in enumerate(arr):\n        if val == target:\n            return i\n    return -1\n\nprint(linear_search([10, 23, 45, 70, 11, 15], 70))  # Output: 3`,
      java: `public class LinearSearch {\n    public static int search(int[] arr, int target) {\n        for (int i = 0; i < arr.length; i++)\n            if (arr[i] == target) return i;\n        return -1;\n    }\n\n    public static void main(String[] args) {\n        int[] arr = {10, 23, 45, 70, 11, 15};\n        System.out.println(search(arr, 70)); // Output: 3\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nint linearSearch(vector<int>& arr, int target) {\n    for (int i = 0; i < arr.size(); i++)\n        if (arr[i] == target) return i;\n    return -1;\n}\n\nint main() {\n    vector<int> arr = {10, 23, 45, 70, 11, 15};\n    cout << linearSearch(arr, 70) << endl; // Output: 3\n    return 0;\n}`,
      javascript: `function linearSearch(arr, target) {\n    for (let i = 0; i < arr.length; i++)\n        if (arr[i] === target) return i;\n    return -1;\n}\n\nconsole.log(linearSearch([10, 23, 45, 70, 11, 15], 70)); // Output: 3`
    }
  },
  // ===== DATA STRUCTURES =====
  {
    id: "stack", category: "Data Structures", name: "Stack Implementation",
    description: "LIFO data structure with push, pop, and peek operations.",
    code: {
      python: `class Stack:\n    def __init__(self):\n        self.items = []\n\n    def push(self, item):\n        self.items.append(item)\n\n    def pop(self):\n        if not self.is_empty():\n            return self.items.pop()\n\n    def peek(self):\n        if not self.is_empty():\n            return self.items[-1]\n\n    def is_empty(self):\n        return len(self.items) == 0\n\n    def size(self):\n        return len(self.items)\n\ns = Stack()\ns.push(1); s.push(2); s.push(3)\nprint(s.pop())   # 3\nprint(s.peek())  # 2`,
      java: `import java.util.ArrayList;\n\npublic class Stack<T> {\n    private ArrayList<T> items = new ArrayList<>();\n\n    public void push(T item) { items.add(item); }\n    public T pop() { return items.remove(items.size() - 1); }\n    public T peek() { return items.get(items.size() - 1); }\n    public boolean isEmpty() { return items.isEmpty(); }\n    public int size() { return items.size(); }\n\n    public static void main(String[] args) {\n        Stack<Integer> s = new Stack<>();\n        s.push(1); s.push(2); s.push(3);\n        System.out.println(s.pop());  // 3\n        System.out.println(s.peek()); // 2\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\ntemplate<typename T>\nclass Stack {\n    vector<T> items;\npublic:\n    void push(T item) { items.push_back(item); }\n    T pop() { T val = items.back(); items.pop_back(); return val; }\n    T peek() { return items.back(); }\n    bool isEmpty() { return items.empty(); }\n    int size() { return items.size(); }\n};\n\nint main() {\n    Stack<int> s;\n    s.push(1); s.push(2); s.push(3);\n    cout << s.pop() << endl;  // 3\n    cout << s.peek() << endl; // 2\n    return 0;\n}`,
      javascript: `class Stack {\n    constructor() { this.items = []; }\n    push(item) { this.items.push(item); }\n    pop() { return this.items.pop(); }\n    peek() { return this.items[this.items.length - 1]; }\n    isEmpty() { return this.items.length === 0; }\n    size() { return this.items.length; }\n}\n\nconst s = new Stack();\ns.push(1); s.push(2); s.push(3);\nconsole.log(s.pop());  // 3\nconsole.log(s.peek()); // 2`
    }
  },
  {
    id: "queue", category: "Data Structures", name: "Queue Implementation",
    description: "FIFO data structure with enqueue and dequeue operations.",
    code: {
      python: `from collections import deque\n\nclass Queue:\n    def __init__(self):\n        self.items = deque()\n\n    def enqueue(self, item):\n        self.items.append(item)\n\n    def dequeue(self):\n        if not self.is_empty():\n            return self.items.popleft()\n\n    def front(self):\n        if not self.is_empty():\n            return self.items[0]\n\n    def is_empty(self):\n        return len(self.items) == 0\n\nq = Queue()\nq.enqueue(1); q.enqueue(2); q.enqueue(3)\nprint(q.dequeue())  # 1\nprint(q.front())    # 2`,
      java: `import java.util.LinkedList;\n\npublic class Queue<T> {\n    private LinkedList<T> items = new LinkedList<>();\n\n    public void enqueue(T item) { items.addLast(item); }\n    public T dequeue() { return items.removeFirst(); }\n    public T front() { return items.getFirst(); }\n    public boolean isEmpty() { return items.isEmpty(); }\n\n    public static void main(String[] args) {\n        Queue<Integer> q = new Queue<>();\n        q.enqueue(1); q.enqueue(2); q.enqueue(3);\n        System.out.println(q.dequeue()); // 1\n        System.out.println(q.front());   // 2\n    }\n}`,
      cpp: `#include <iostream>\n#include <queue>\nusing namespace std;\n\nint main() {\n    queue<int> q;\n    q.push(1); q.push(2); q.push(3);\n    cout << q.front() << endl; // 1\n    q.pop();\n    cout << q.front() << endl; // 2\n    return 0;\n}`,
      javascript: `class Queue {\n    constructor() { this.items = []; }\n    enqueue(item) { this.items.push(item); }\n    dequeue() { return this.items.shift(); }\n    front() { return this.items[0]; }\n    isEmpty() { return this.items.length === 0; }\n}\n\nconst q = new Queue();\nq.enqueue(1); q.enqueue(2); q.enqueue(3);\nconsole.log(q.dequeue()); // 1\nconsole.log(q.front());   // 2`
    }
  },
  {
    id: "linked_list", category: "Data Structures", name: "Linked List",
    description: "Singly linked list with insert, delete, and traverse operations.",
    code: {
      python: `class Node:\n    def __init__(self, data):\n        self.data = data\n        self.next = None\n\nclass LinkedList:\n    def __init__(self):\n        self.head = None\n\n    def append(self, data):\n        new_node = Node(data)\n        if not self.head:\n            self.head = new_node\n            return\n        curr = self.head\n        while curr.next:\n            curr = curr.next\n        curr.next = new_node\n\n    def display(self):\n        curr = self.head\n        while curr:\n            print(curr.data, end=" -> ")\n            curr = curr.next\n        print("None")\n\nll = LinkedList()\nll.append(1); ll.append(2); ll.append(3)\nll.display()  # 1 -> 2 -> 3 -> None`,
      java: `public class LinkedList {\n    static class Node {\n        int data;\n        Node next;\n        Node(int d) { data = d; next = null; }\n    }\n\n    Node head;\n\n    void append(int data) {\n        Node newNode = new Node(data);\n        if (head == null) { head = newNode; return; }\n        Node curr = head;\n        while (curr.next != null) curr = curr.next;\n        curr.next = newNode;\n    }\n\n    void display() {\n        Node curr = head;\n        while (curr != null) {\n            System.out.print(curr.data + " -> ");\n            curr = curr.next;\n        }\n        System.out.println("null");\n    }\n\n    public static void main(String[] args) {\n        LinkedList ll = new LinkedList();\n        ll.append(1); ll.append(2); ll.append(3);\n        ll.display(); // 1 -> 2 -> 3 -> null\n    }\n}`,
      cpp: `#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n    Node(int d) : data(d), next(nullptr) {}\n};\n\nclass LinkedList {\n    Node* head = nullptr;\npublic:\n    void append(int data) {\n        Node* newNode = new Node(data);\n        if (!head) { head = newNode; return; }\n        Node* curr = head;\n        while (curr->next) curr = curr->next;\n        curr->next = newNode;\n    }\n    void display() {\n        Node* curr = head;\n        while (curr) { cout << curr->data << " -> "; curr = curr->next; }\n        cout << "nullptr" << endl;\n    }\n};\n\nint main() {\n    LinkedList ll;\n    ll.append(1); ll.append(2); ll.append(3);\n    ll.display(); // 1 -> 2 -> 3 -> nullptr\n    return 0;\n}`,
      javascript: `class Node {\n    constructor(data) {\n        this.data = data;\n        this.next = null;\n    }\n}\n\nclass LinkedList {\n    constructor() { this.head = null; }\n    append(data) {\n        const node = new Node(data);\n        if (!this.head) { this.head = node; return; }\n        let curr = this.head;\n        while (curr.next) curr = curr.next;\n        curr.next = node;\n    }\n    display() {\n        let curr = this.head, result = [];\n        while (curr) { result.push(curr.data); curr = curr.next; }\n        console.log(result.join(" -> ") + " -> null");\n    }\n}\n\nconst ll = new LinkedList();\nll.append(1); ll.append(2); ll.append(3);\nll.display(); // 1 -> 2 -> 3 -> null`
    }
  },
  // ===== STRINGS =====
  {
    id: "palindrome", category: "Strings", name: "Palindrome Check",
    description: "Check if a string reads the same forwards and backwards.",
    code: {
      python: `def is_palindrome(s):\n    s = s.lower().replace(" ", "")\n    return s == s[::-1]\n\nprint(is_palindrome("racecar"))  # True\nprint(is_palindrome("hello"))    # False`,
      java: `public class Palindrome {\n    public static boolean isPalindrome(String s) {\n        s = s.toLowerCase().replaceAll(" ", "");\n        return s.equals(new StringBuilder(s).reverse().toString());\n    }\n\n    public static void main(String[] args) {\n        System.out.println(isPalindrome("racecar")); // true\n        System.out.println(isPalindrome("hello"));   // false\n    }\n}`,
      cpp: `#include <iostream>\n#include <algorithm>\nusing namespace std;\n\nbool isPalindrome(string s) {\n    string rev = s;\n    reverse(rev.begin(), rev.end());\n    return s == rev;\n}\n\nint main() {\n    cout << isPalindrome("racecar") << endl; // 1\n    cout << isPalindrome("hello") << endl;   // 0\n    return 0;\n}`,
      javascript: `function isPalindrome(s) {\n    s = s.toLowerCase().replace(/\\s/g, "");\n    return s === s.split("").reverse().join("");\n}\n\nconsole.log(isPalindrome("racecar")); // true\nconsole.log(isPalindrome("hello"));   // false`
    }
  },
  {
    id: "reverse_string", category: "Strings", name: "Reverse a String",
    description: "Reverse a string using different approaches.",
    code: {
      python: `def reverse_string(s):\n    return s[::-1]\n\ndef reverse_manual(s):\n    chars = list(s)\n    left, right = 0, len(chars) - 1\n    while left < right:\n        chars[left], chars[right] = chars[right], chars[left]\n        left += 1\n        right -= 1\n    return ''.join(chars)\n\nprint(reverse_string("hello"))  # olleh\nprint(reverse_manual("world"))  # dlrow`,
      java: `public class ReverseString {\n    public static String reverse(String s) {\n        return new StringBuilder(s).reverse().toString();\n    }\n\n    public static void main(String[] args) {\n        System.out.println(reverse("hello")); // olleh\n    }\n}`,
      cpp: `#include <iostream>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    string s = "hello";\n    reverse(s.begin(), s.end());\n    cout << s << endl; // olleh\n    return 0;\n}`,
      javascript: `function reverseString(s) {\n    return s.split("").reverse().join("");\n}\n\nconsole.log(reverseString("hello")); // olleh`
    }
  },
  // ===== DYNAMIC PROGRAMMING =====
  {
    id: "knapsack", category: "Dynamic Programming", name: "0/1 Knapsack",
    description: "Classic DP problem: maximize value within weight capacity.",
    code: {
      python: `def knapsack(W, weights, values, n):\n    dp = [[0] * (W + 1) for _ in range(n + 1)]\n    for i in range(1, n + 1):\n        for w in range(W + 1):\n            if weights[i-1] <= w:\n                dp[i][w] = max(dp[i-1][w], values[i-1] + dp[i-1][w - weights[i-1]])\n            else:\n                dp[i][w] = dp[i-1][w]\n    return dp[n][W]\n\nvalues = [60, 100, 120]\nweights = [10, 20, 30]\nW = 50\nprint(knapsack(W, weights, values, len(values)))  # 220`,
      java: `public class Knapsack {\n    public static int knapsack(int W, int[] wt, int[] val, int n) {\n        int[][] dp = new int[n + 1][W + 1];\n        for (int i = 1; i <= n; i++)\n            for (int w = 0; w <= W; w++)\n                if (wt[i-1] <= w)\n                    dp[i][w] = Math.max(dp[i-1][w], val[i-1] + dp[i-1][w - wt[i-1]]);\n                else\n                    dp[i][w] = dp[i-1][w];\n        return dp[n][W];\n    }\n\n    public static void main(String[] args) {\n        int[] val = {60, 100, 120};\n        int[] wt = {10, 20, 30};\n        System.out.println(knapsack(50, wt, val, 3)); // 220\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nint knapsack(int W, vector<int>& wt, vector<int>& val, int n) {\n    vector<vector<int>> dp(n+1, vector<int>(W+1, 0));\n    for (int i = 1; i <= n; i++)\n        for (int w = 0; w <= W; w++)\n            if (wt[i-1] <= w)\n                dp[i][w] = max(dp[i-1][w], val[i-1] + dp[i-1][w-wt[i-1]]);\n            else\n                dp[i][w] = dp[i-1][w];\n    return dp[n][W];\n}\n\nint main() {\n    vector<int> val={60,100,120}, wt={10,20,30};\n    cout << knapsack(50, wt, val, 3) << endl; // 220\n    return 0;\n}`,
      javascript: `function knapsack(W, weights, values, n) {\n    const dp = Array.from({length: n+1}, () => Array(W+1).fill(0));\n    for (let i = 1; i <= n; i++)\n        for (let w = 0; w <= W; w++)\n            if (weights[i-1] <= w)\n                dp[i][w] = Math.max(dp[i-1][w], values[i-1] + dp[i-1][w - weights[i-1]]);\n            else\n                dp[i][w] = dp[i-1][w];\n    return dp[n][W];\n}\n\nconsole.log(knapsack(50, [10,20,30], [60,100,120], 3)); // 220`
    }
  },
  // ===== RECURSION =====
  {
    id: "tower_of_hanoi", category: "Recursion", name: "Tower of Hanoi",
    description: "Classic recursion problem: move disks between pegs.",
    code: {
      python: `def hanoi(n, source, target, auxiliary):\n    if n == 1:\n        print(f"Move disk 1 from {source} to {target}")\n        return\n    hanoi(n - 1, source, auxiliary, target)\n    print(f"Move disk {n} from {source} to {target}")\n    hanoi(n - 1, auxiliary, target, source)\n\nhanoi(3, 'A', 'C', 'B')`,
      java: `public class Hanoi {\n    public static void hanoi(int n, char src, char tgt, char aux) {\n        if (n == 1) {\n            System.out.println("Move disk 1 from " + src + " to " + tgt);\n            return;\n        }\n        hanoi(n-1, src, aux, tgt);\n        System.out.println("Move disk " + n + " from " + src + " to " + tgt);\n        hanoi(n-1, aux, tgt, src);\n    }\n\n    public static void main(String[] args) {\n        hanoi(3, 'A', 'C', 'B');\n    }\n}`,
      cpp: `#include <iostream>\nusing namespace std;\n\nvoid hanoi(int n, char src, char tgt, char aux) {\n    if (n == 1) {\n        cout << "Move disk 1 from " << src << " to " << tgt << endl;\n        return;\n    }\n    hanoi(n-1, src, aux, tgt);\n    cout << "Move disk " << n << " from " << src << " to " << tgt << endl;\n    hanoi(n-1, aux, tgt, src);\n}\n\nint main() {\n    hanoi(3, 'A', 'C', 'B');\n    return 0;\n}`,
      javascript: `function hanoi(n, src, tgt, aux) {\n    if (n === 1) {\n        console.log(\`Move disk 1 from \${src} to \${tgt}\`);\n        return;\n    }\n    hanoi(n-1, src, aux, tgt);\n    console.log(\`Move disk \${n} from \${src} to \${tgt}\`);\n    hanoi(n-1, aux, tgt, src);\n}\n\nhanoi(3, 'A', 'C', 'B');`
    }
  },
  // ===== GRAPH ALGORITHMS =====
  {
    id: "bfs", category: "Graph Algorithms", name: "Breadth-First Search (BFS)",
    description: "Graph traversal exploring all neighbors at current depth first.",
    code: {
      python: `from collections import deque\n\ndef bfs(graph, start):\n    visited = set([start])\n    queue = deque([start])\n    result = []\n    while queue:\n        node = queue.popleft()\n        result.append(node)\n        for neighbor in graph.get(node, []):\n            if neighbor not in visited:\n                visited.add(neighbor)\n                queue.append(neighbor)\n    return result\n\ngraph = {'A': ['B','C'], 'B': ['D','E'], 'C': ['F'], 'D': [], 'E': ['F'], 'F': []}\nprint(bfs(graph, 'A'))  # ['A', 'B', 'C', 'D', 'E', 'F']`,
      java: `import java.util.*;\n\npublic class BFS {\n    public static List<String> bfs(Map<String, List<String>> graph, String start) {\n        List<String> result = new ArrayList<>();\n        Set<String> visited = new HashSet<>();\n        Queue<String> queue = new LinkedList<>();\n        visited.add(start);\n        queue.add(start);\n        while (!queue.isEmpty()) {\n            String node = queue.poll();\n            result.add(node);\n            for (String n : graph.getOrDefault(node, List.of()))\n                if (visited.add(n)) queue.add(n);\n        }\n        return result;\n    }\n\n    public static void main(String[] args) {\n        Map<String, List<String>> g = Map.of("A", List.of("B","C"), "B", List.of("D","E"), "C", List.of("F"), "D", List.of(), "E", List.of("F"), "F", List.of());\n        System.out.println(bfs(g, "A"));\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\n#include <queue>\n#include <unordered_set>\n#include <unordered_map>\nusing namespace std;\n\nvector<int> bfs(unordered_map<int, vector<int>>& graph, int start) {\n    vector<int> result;\n    unordered_set<int> visited = {start};\n    queue<int> q;\n    q.push(start);\n    while (!q.empty()) {\n        int node = q.front(); q.pop();\n        result.push_back(node);\n        for (int n : graph[node])\n            if (visited.find(n) == visited.end()) {\n                visited.insert(n);\n                q.push(n);\n            }\n    }\n    return result;\n}\n\nint main() {\n    unordered_map<int,vector<int>> g = {{0,{1,2}},{1,{3,4}},{2,{5}},{3,{}},{4,{5}},{5,{}}};\n    for (int x : bfs(g, 0)) cout << x << " ";\n    return 0;\n}`,
      javascript: `function bfs(graph, start) {\n    const visited = new Set([start]);\n    const queue = [start];\n    const result = [];\n    while (queue.length > 0) {\n        const node = queue.shift();\n        result.push(node);\n        for (const neighbor of (graph[node] || []))\n            if (!visited.has(neighbor)) {\n                visited.add(neighbor);\n                queue.push(neighbor);\n            }\n    }\n    return result;\n}\n\nconst graph = {A:['B','C'], B:['D','E'], C:['F'], D:[], E:['F'], F:[]};\nconsole.log(bfs(graph, 'A'));`
    }
  },
  {
    id: "dfs", category: "Graph Algorithms", name: "Depth-First Search (DFS)",
    description: "Graph traversal exploring as deep as possible before backtracking.",
    code: {
      python: `def dfs(graph, start, visited=None):\n    if visited is None:\n        visited = set()\n    visited.add(start)\n    result = [start]\n    for neighbor in graph.get(start, []):\n        if neighbor not in visited:\n            result.extend(dfs(graph, neighbor, visited))\n    return result\n\ngraph = {'A': ['B','C'], 'B': ['D','E'], 'C': ['F'], 'D': [], 'E': ['F'], 'F': []}\nprint(dfs(graph, 'A'))`,
      java: `import java.util.*;\n\npublic class DFS {\n    static void dfs(Map<String, List<String>> graph, String node, Set<String> visited) {\n        visited.add(node);\n        System.out.print(node + " ");\n        for (String n : graph.getOrDefault(node, List.of()))\n            if (!visited.contains(n)) dfs(graph, n, visited);\n    }\n\n    public static void main(String[] args) {\n        Map<String, List<String>> g = Map.of("A", List.of("B","C"), "B", List.of("D","E"), "C", List.of("F"), "D", List.of(), "E", List.of("F"), "F", List.of());\n        dfs(g, "A", new HashSet<>());\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\n#include <unordered_set>\n#include <unordered_map>\nusing namespace std;\n\nvoid dfs(unordered_map<int,vector<int>>& g, int node, unordered_set<int>& visited) {\n    visited.insert(node);\n    cout << node << " ";\n    for (int n : g[node])\n        if (visited.find(n) == visited.end())\n            dfs(g, n, visited);\n}\n\nint main() {\n    unordered_map<int,vector<int>> g = {{0,{1,2}},{1,{3,4}},{2,{5}},{3,{}},{4,{5}},{5,{}}};\n    unordered_set<int> visited;\n    dfs(g, 0, visited);\n    return 0;\n}`,
      javascript: `function dfs(graph, start, visited = new Set()) {\n    visited.add(start);\n    const result = [start];\n    for (const neighbor of (graph[start] || []))\n        if (!visited.has(neighbor))\n            result.push(...dfs(graph, neighbor, visited));\n    return result;\n}\n\nconst graph = {A:['B','C'], B:['D','E'], C:['F'], D:[], E:['F'], F:[]};\nconsole.log(dfs(graph, 'A'));`
    }
  },
  // ===== MORE MATH =====
  {
    id: "power", category: "Math", name: "Power Function (Fast Exponentiation)",
    description: "Calculate x^n efficiently using binary exponentiation. O(log n).",
    code: {
      python: `def power(x, n):\n    if n == 0:\n        return 1\n    if n < 0:\n        x = 1 / x\n        n = -n\n    result = 1\n    while n > 0:\n        if n % 2 == 1:\n            result *= x\n        x *= x\n        n //= 2\n    return result\n\nprint(power(2, 10))   # 1024\nprint(power(3, 5))    # 243`,
      java: `public class Power {\n    public static double power(double x, int n) {\n        if (n == 0) return 1;\n        long N = n;\n        if (N < 0) { x = 1/x; N = -N; }\n        double result = 1;\n        while (N > 0) {\n            if (N % 2 == 1) result *= x;\n            x *= x;\n            N /= 2;\n        }\n        return result;\n    }\n\n    public static void main(String[] args) {\n        System.out.println(power(2, 10)); // 1024.0\n    }\n}`,
      cpp: `#include <iostream>\nusing namespace std;\n\ndouble power(double x, int n) {\n    if (n==0) return 1;\n    long long N = n;\n    if (N<0) { x=1/x; N=-N; }\n    double result = 1;\n    while (N>0) {\n        if (N%2==1) result *= x;\n        x *= x;\n        N /= 2;\n    }\n    return result;\n}\n\nint main() {\n    cout << power(2, 10) << endl; // 1024\n    return 0;\n}`,
      javascript: `function power(x, n) {\n    if (n === 0) return 1;\n    if (n < 0) { x = 1/x; n = -n; }\n    let result = 1;\n    while (n > 0) {\n        if (n % 2 === 1) result *= x;\n        x *= x;\n        n = Math.floor(n / 2);\n    }\n    return result;\n}\n\nconsole.log(power(2, 10)); // 1024`
    }
  },
  {
    id: "sieve", category: "Math", name: "Sieve of Eratosthenes",
    description: "Find all prime numbers up to n efficiently.",
    code: {
      python: `def sieve(n):\n    is_prime = [True] * (n + 1)\n    is_prime[0] = is_prime[1] = False\n    for i in range(2, int(n**0.5) + 1):\n        if is_prime[i]:\n            for j in range(i*i, n+1, i):\n                is_prime[j] = False\n    return [i for i in range(n+1) if is_prime[i]]\n\nprint(sieve(30))`,
      java: `public class Sieve {\n    public static void main(String[] args) {\n        int n = 30;\n        boolean[] isPrime = new boolean[n + 1];\n        java.util.Arrays.fill(isPrime, true);\n        isPrime[0] = isPrime[1] = false;\n        for (int i = 2; i * i <= n; i++)\n            if (isPrime[i])\n                for (int j = i * i; j <= n; j += i)\n                    isPrime[j] = false;\n        for (int i = 2; i <= n; i++)\n            if (isPrime[i]) System.out.print(i + " ");\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nvector<int> sieve(int n) {\n    vector<bool> is_prime(n+1, true);\n    is_prime[0] = is_prime[1] = false;\n    for (int i=2; i*i<=n; i++)\n        if (is_prime[i])\n            for (int j=i*i; j<=n; j+=i)\n                is_prime[j] = false;\n    vector<int> primes;\n    for (int i=2; i<=n; i++)\n        if (is_prime[i]) primes.push_back(i);\n    return primes;\n}\n\nint main() {\n    for (int p : sieve(30)) cout << p << " ";\n    return 0;\n}`,
      javascript: `function sieve(n) {\n    const isPrime = Array(n+1).fill(true);\n    isPrime[0] = isPrime[1] = false;\n    for (let i = 2; i*i <= n; i++)\n        if (isPrime[i])\n            for (let j = i*i; j <= n; j += i)\n                isPrime[j] = false;\n    return isPrime.reduce((acc, v, i) => v ? [...acc, i] : acc, []);\n}\n\nconsole.log(sieve(30));`
    }
  }
];

// Extract unique categories
export const TEMPLATE_CATEGORIES = [...new Set(templates.map(t => t.category))];

export default templates;

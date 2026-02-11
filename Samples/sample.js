function processData(limit) {
    let sum = 0;
    console.log("Starting calculation...");

    for (let i = 1; i <= limit; i++) {
        if (i % 3 === 0 && i % 5 === 0) {
            console.log("FizzBuzz");
            sum += i * 2;
        } else if (i % 3 === 0) {
            console.log("Fizz");
            sum += i;
        } else if (i % 5 === 0) {
            console.log("Buzz");
            sum += i;
        } else {
            console.log(i);
        }
    }

    if (sum > 100) {
        return "High Value";
    } else {
        return "Low Value";
    }
}

processData(20);

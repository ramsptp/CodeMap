#include <iostream>
#include <vector>

int calculateScore(const std::vector<int>& scores) {
    int total = 0;
    
    for (int score : scores) {
        if (score < 0) {
            continue;
        }
        
        if (score > 100) {
            total += 100;
        } else {
            total += score;
        }
    }
    
    if (total > 500) {
        std::cout << "Excellent Performance" << std::endl;
    } else if (total > 200) {
        std::cout << "Good Performance" << std::endl;
    } else {
        std::cout << "Needs Improvement" << std::endl;
    }
    
    return total;
}

int main() {
    std::vector<int> myScores = {10, 50, 120, -5, 80};
    calculateScore(myScores);
    return 0;
}

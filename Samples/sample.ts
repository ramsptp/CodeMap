function analyzeUser(age: number, role: string): boolean {
    if (age < 18) {
        return false;
    }

    if (role === 'admin') {
        console.log("Access Granted: Admin");
        return true;
    }

    let strikes = 0;
    const actions = ['login', 'view', 'edit'];

    for (const action of actions) {
        if (action === 'delete') {
            strikes++;
        }
    }

    if (strikes > 0) {
        return false;
    }

    return true;
}

analyzeUser(25, 'user');

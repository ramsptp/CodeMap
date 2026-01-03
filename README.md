# CodeMap — Codebase Visualization Tool

CodeMap analyzes source code and generates:

- Flowcharts (visual control-flow)
- Call Graphs (who calls what)
- Cyclomatic Complexity (logic difficulty)

Supported languages (currently):

- Python
- Java

More languages coming soon.

---

## 🚀 Getting Started (Full Setup)

### 📥 1️⃣ Clone the Repository

    git clone https://github.com/ramsptp/CodeMap.git

    cd CodeMap

---

## 🖥 Backend Setup (FastAPI — Python)

### 2️⃣ Create & Activate Virtual Environment

Windows:

    python -m venv venv
    venv\Scripts\activate

Mac/Linux:

    python3 -m venv venv
    source venv/bin/activate

---

### 3️⃣ Install Backend Requirements

(Everything is pre-listed in `requirements.txt`)

    pip install -r requirements.txt

---

### 4️⃣ Run the Backend Server

    uvicorn main:app --reload

Backend will be available at:

    http://127.0.0.1:8000

---

## 🌐 Frontend Setup (React)

### 5️⃣ Install Frontend Dependencies

From the project root (where `package.json` exists):

    npm install

---

### 6️⃣ Start the Frontend App

    npm start

Frontend runs at:

    http://localhost:3000

---

## 🧭 Using CodeMap

1. Paste your code in the editor
2. Select the programming language
3. Click **Analyze**
4. Explore:

- Total functions detected
- Flowchart (choose any function)
- Call graph visualization
- Cyclomatic complexity per function

---

## 🛠 Troubleshooting

Backend not running?

    uvicorn main:app --reload

Virtual environment not active?

    venv\Scripts\activate

Frontend errors?

    npm install
    npm start

If ports are busy, close old terminals or restart.

---

## 🤝 Contributing

Ideas, bug reports, and improvements are welcome.  
Open a pull request or create an issue — we’ll iterate together.

---

## 📄 License

This project is intended for educational and academic purposes.
Feel free to modify and extend it.

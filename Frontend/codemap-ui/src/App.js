import React, { useState } from "react";
import axios from "axios";

function App() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const analyzeCode = async () => {
    setError(null);
    setResult(null);

    if (!code.trim()) {
      setError("Please paste some Python code.");
      return;
    }

    try {
      const response = await axios.post(
        "http://127.0.0.1:8000/analyze",
        { code },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      setResult(response.data);
    } catch (err) {
      setError("Failed to analyze code.");
      console.error(err);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "auto", padding: 20, fontFamily: "Arial" }}>
      <h2>CodeMap: Paste Python Code for Analysis</h2>
      <textarea
        rows={15}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 14 }}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your Python code here..."
      />
      <br />
      <button onClick={analyzeCode} style={{ marginTop: 10, padding: "10px 20px" }}>
        Analyze
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 20 }}>
          <h3>Analysis Result:</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default App;

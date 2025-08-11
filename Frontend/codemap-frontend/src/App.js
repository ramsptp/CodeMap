import React, { useState, useEffect } from "react";
import axios from "axios";
import mermaid from "mermaid";


function MermaidChart({ chart }) {
  const [svg, setSvg] = useState("");

  React.useEffect(() => {
    if (!chart) {
      setSvg("");
      return;
    }
    mermaid.initialize({ startOnLoad: true });
    mermaid.render("mermaidChart", chart).then(({ svg }) => setSvg(svg)).catch(() => setSvg("<p>Invalid Mermaid syntax</p>"));
  }, [chart]);

  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}

function App() {
  const [code, setCode] = useState("");
  const [functions, setFunctions] = useState([]);
  const [selectedFunc, setSelectedFunc] = useState("");
  const [result, setResult] = useState(null);
  const [flowchart, setFlowchart] = useState(null);
  const [error, setError] = useState(null);

  const analyzeCode = async (funcName = "") => {
    setError(null);
    setResult(null);
    setFlowchart(null);

    if (!code.trim()) {
      setError("Please paste some Python code.");
      return;
    }

    try {
      const params = {};
      if (funcName) params.function_name = funcName;

      const response = await axios.post(
        "http://127.0.0.1:8000/analyze",
        { code },
        {
          params,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      setResult(response.data);
      setFunctions(response.data.functions.names || []);

      if (response.data.flowchart) {
        setFlowchart(response.data.flowchart);
      } else {
        setFlowchart(null);
      }
    } catch (err) {
      setError("Failed to analyze code.");
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedFunc) {
      analyzeCode(selectedFunc);
    }
  }, [selectedFunc]);

  return (
    <div style={{ maxWidth: 900, margin: "auto", padding: 20, fontFamily: "Arial" }}>
      <h2>CodeMap: Paste Python Code & See Flowcharts</h2>
      <textarea
        rows={15}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 14 }}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your Python code here..."
      />
      <br />
      <button onClick={() => analyzeCode()} style={{ marginTop: 10, padding: "10px 20px" }}>
        Analyze Code
      </button>

      {functions.length > 0 && (
        <>
          <h3>Select a function to view flowchart:</h3>
          <select
            value={selectedFunc}
            onChange={(e) => setSelectedFunc(e.target.value)}
            style={{ fontSize: 16, padding: 5 }}
          >
            <option value="">-- Select function --</option>
            {functions.map((fn) => (
              <option key={fn} value={fn}>
                {fn}
              </option>
            ))}
          </select>
        </>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 20 }}>
          <h3>Code Analysis:</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {flowchart && (
        <div style={{ marginTop: 30 }}>
          <h3>Function Flowchart:</h3>
          <MermaidChart chart={flowchart} />
        </div>
      )}
    </div>
  );
}

export default App;

import React, { useState, useEffect } from "react";
import axios from "axios";
import mermaid from "mermaid";

// Initialize Mermaid once
mermaid.initialize({ startOnLoad: false });

function MermaidChart({ chart }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    if (!chart) {
      setSvg("");
      return;
    }

    const renderId = "mermaid-" + Math.random().toString(36).substring(2, 9);

    mermaid
      .render(renderId, chart)
      .then(({ svg }) => setSvg(svg))
      .catch((err) => {
        console.error("Mermaid render error:", err);
        setSvg("<p style='color:red'>Invalid Mermaid syntax</p>");
      });
  }, [chart]);

  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}


function App() {
  const [code, setCode] = useState("");
  const [functions, setFunctions] = useState([]);
  const [selectedFunc, setSelectedFunc] = useState("");
  const [flowchart, setFlowchart] = useState(null);
  const [callGraph, setCallGraph] = useState(null);
  const [view, setView] = useState("flowchart");
  const [error, setError] = useState(null);

  const analyzeCode = async (funcName = "") => {
    setError(null);
    setFlowchart(null);
    setCallGraph(null);

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
        { params }
      );

      setFunctions(response.data.functions?.names || []);
      setFlowchart(response.data.flowchart || null);
      setCallGraph(response.data.call_graph || null);
    } catch (err) {
      setError("Failed to analyze code.");
      console.error(err);
    }
  };

  // Auto re-analyze when function changes (only for flowchart)
  useEffect(() => {
    if (view === "flowchart" && selectedFunc) {
      analyzeCode(selectedFunc);
    }
  }, [selectedFunc]);

  return (
    <div style={{ maxWidth: 900, margin: "auto", padding: 20, fontFamily: "Arial" }}>
      <h2>CodeMap: Code Visualization Tool</h2>

      <textarea
        rows={15}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 14 }}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your Python code here..."
      />

      <br />
      <button onClick={() => analyzeCode(selectedFunc)} style={{ marginTop: 10, padding: "10px 20px" }}>
        Analyze Code
      </button>

      {/* View Toggle */}
      <div style={{ marginTop: 20 }}>
        <button onClick={() => setView("flowchart")}>Flowchart</button>
        <button onClick={() => setView("callgraph")} style={{ marginLeft: 10 }}>
          Call Graph
        </button>
      </div>

      {/* Function Selector (Flowchart only) */}
      {view === "flowchart" && functions.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h4>Select function:</h4>
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
        </div>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Diagrams */}
      <div style={{ marginTop: 30 }}>
        {view === "flowchart" && flowchart && (
          <>
            <h3>Function Flowchart</h3>
            <MermaidChart chart={flowchart} />
          </>
        )}

        {view === "callgraph" && callGraph && (
          <>
            <h3>Call Graph</h3>
            <MermaidChart chart={callGraph} />
          </>
        )}
      </div>
    </div>
  );
}

export default App;

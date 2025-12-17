import React, { useState, useEffect } from "react";
import axios from "axios";
import mermaid from "mermaid";

// Mermaid should be initialized once
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
  const [result, setResult] = useState(null);
  const [functions, setFunctions] = useState([]);
  const [selectedFunc, setSelectedFunc] = useState("");
  const [flowchart, setFlowchart] = useState(null);
  const [callGraph, setCallGraph] = useState(null);
  const [complexity, setComplexity] = useState({});
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

      setResult(response.data);
      setFunctions(response.data.functions?.names || []);
      setFlowchart(response.data.flowchart || null);
      setCallGraph(response.data.call_graph || null);
      setComplexity(response.data.complexity || {});
    } catch (err) {
      console.error(err);
      setError("Failed to analyze code.");
    }
  };

  // Re-run flowchart analysis when function changes
  useEffect(() => {
    if (view === "flowchart" && selectedFunc) {
      analyzeCode(selectedFunc);
    }
  }, [selectedFunc]);

  return (
    <div style={{ maxWidth: 900, margin: "auto", padding: 20, fontFamily: "Arial" }}>
      <h2>CodeMap – Codebase Visualization Tool</h2>

      <textarea
        rows={15}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 14 }}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your Python code here..."
      />

      <br />
      <button
        onClick={() => analyzeCode(selectedFunc)}
        style={{ marginTop: 10, padding: "10px 20px" }}
      >
        Analyze Code
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* ---------- Overview ---------- */}
      {result && (
        <div style={{ marginTop: 20, padding: 15, border: "1px solid #ccc" }}>
          <h3>Code Overview</h3>

          <p>
            <strong>Total Functions:</strong>{" "}
            {result.functions?.count ?? 0}
          </p>

          <p>
            <strong>Function Names:</strong>{" "}
            {result.functions?.names?.join(", ")}
          </p>

          {Object.keys(complexity).length > 0 && (
            <>
              <h4>Cyclomatic Complexity</h4>
              <ul>
                {Object.entries(complexity).map(([fn, val]) => (
                  <li key={fn}>
                    {fn}: {val}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ---------- View Toggle ---------- */}
      <div style={{ marginTop: 20 }}>
        <button onClick={() => setView("flowchart")}>Flowchart</button>
        <button onClick={() => setView("callgraph")} style={{ marginLeft: 10 }}>
          Call Graph
        </button>
      </div>

      {/* ---------- Function Selector ---------- */}
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

      {/* ---------- Diagrams ---------- */}
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

import React, { useState, useEffect } from "react";
import axios from "axios";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false });

function MermaidChart({ chart, onNodeClick }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    if (!chart) {
      setSvg("");
      return;
    }

    const id = "m-" + Math.random().toString(36).substring(2, 9);

    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        setSvg(svg);

        // Small delay so DOM exists
        setTimeout(() => {
          const nodes = document.querySelectorAll("svg g.node");

          console.log("[Mermaid] Found", nodes.length, "clickable nodes");

          nodes.forEach((node) => {
            node.style.cursor = "pointer";

            node.onclick = () => {
              let label =
                node.getAttribute("id")?.trim() ||
                node.querySelector("title")?.textContent?.trim() ||
                node.querySelector("text")?.textContent?.trim() ||
                node.querySelector("foreignObject")?.textContent?.trim() ||
                "";

              console.log("[Click] Raw label =", label);

              // normalize IDs like flowchart-foo-0
              if (label.startsWith("flowchart-")) {
                const parts = label.split("-");
                if (parts.length >= 3) {
                  label = parts.slice(1, parts.length - 1).join("-");
                }
              }

              console.log("[Click] Normalized label =", label);

              if (onNodeClick) onNodeClick(label);
            };
          });
        }, 200);
      })
      .catch((err) => {
        console.error(err);
        setSvg("<p style='color:red'>Invalid Mermaid syntax</p>");
      });
  }, [chart, onNodeClick]);

  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}

function App() {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");

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

    if (!code.trim()) {
      setError("Please paste some code.");
      return;
    }

    try {
      const params = {};
      if (funcName) params.function_name = funcName;

      const response = await axios.post(
        "http://127.0.0.1:8000/analyze",
        { code, language },
        { params }
      );

      setResult(response.data);
      setFunctions(response.data.functions?.names || []);
      setFlowchart(response.data.flowchart || null);
      setCallGraph(response.data.call_graph || null);
      setComplexity(response.data.complexity || {});
    } catch (err) {
      console.error(err);
      setError("Failed to analyze code. Please check backend.");
    }
  };

  // when user selects dropdown function
  useEffect(() => {
    if (view === "flowchart" && selectedFunc) {
      analyzeCode(selectedFunc);
    }
  }, [selectedFunc]);

  // when a node is clicked in call graph
  const handleNodeClick = (label) => {
    console.log("[ClickHandler] Received:", label);
    console.log("[Functions list]", functions);

    if (functions.includes(label)) {
      setSelectedFunc(label);
      setView("flowchart");
      analyzeCode(label);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "auto", padding: 20, fontFamily: "Arial" }}>
      <h2>CodeMap – Codebase Visualization Tool</h2>

      {/* Language selector */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ marginRight: 10 }}>Language:</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{ padding: 5 }}
        >
          <option value="python">Python</option>
          <option value="java">Java</option>
        </select>
      </div>

      {/* Code box */}
      <textarea
        rows={15}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 14 }}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste code here..."
      />

      <button
        onClick={() => analyzeCode(selectedFunc)}
        style={{ marginTop: 10, padding: "10px 20px" }}
      >
        Analyze Code
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Overview */}
      {result && (
        <div style={{ marginTop: 20, padding: 15, border: "1px solid #ccc" }}>
          <h3>Code Overview</h3>

          <p><strong>Total Functions:</strong> {result.functions?.count ?? 0}</p>
          <p><strong>Function Names:</strong> {result.functions?.names?.join(", ")}</p>

          {Object.keys(complexity).length > 0 && (
            <>
              <h4>Cyclomatic Complexity</h4>
              <ul>
                {Object.entries(complexity).map(([fn, val]) => (
                  <li key={fn}>{fn}: {val}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* View toggle */}
      <div style={{ marginTop: 20 }}>
        <button onClick={() => setView("flowchart")}>Flowchart</button>
        <button onClick={() => setView("callgraph")} style={{ marginLeft: 10 }}>
          Call Graph
        </button>
      </div>

      {/* Function selector */}
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
              <option key={fn} value={fn}>{fn}</option>
            ))}
          </select>
        </div>
      )}

      {/* Charts */}
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
            <MermaidChart chart={callGraph} onNodeClick={handleNodeClick} />
          </>
        )}
      </div>
    </div>
  );
}

export default App;

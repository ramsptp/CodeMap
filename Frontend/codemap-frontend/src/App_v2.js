import React, { useState, useEffect, useMemo } from "react";
import axios from "axios"; 
import ReactFlow, { 
  Background, 
  Controls, 
  useNodesState, 
  useEdgesState,
  Handle, 
  Position 
} from 'reactflow';
import 'reactflow/dist/style.css'; 
import dagre from 'dagre';
import { 
  Folder, Code, GitBranch, Play, Settings, 
  Columns, ClipboardList, Plus, ArrowLeft,
  FileText, Layers, FileCode
} from "lucide-react"; 

// ===========================================
// 0. DEFAULT SNIPPETS
// ===========================================
const SNIPPETS = {
  python: 
`def calculate_factorial(n):
    if n < 0:
        return None
    elif n == 0:
        return 1
    else:
        result = 1
        for i in range(1, n + 1):
            result *= i
        return result

def greet_user(name):
    print(f"Hello, {name}!")
    if name == "Alice":
        print("Welcome back, Alice!")
    else:
        print("Nice to meet you!")`,

  java: 
`public class LogicDemo {
    public int factorial(int n) {
        if (n < 0) {
            return -1;
        }
        int result = 1;
        for (int i = 1; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    public void checkStatus(int code) {
        if (code == 200) {
            System.out.println("OK");
        } else {
            System.out.println("Error");
        }
    }
}`
};

// ===========================================
// 1. CUSTOM NODE DEFINITIONS
// ===========================================

// OVAL (Terminator)
const TerminatorNode = ({ data }) => {
  return (
    <div style={{
      padding: "10px 20px",
      borderRadius: "25px",
      background: "#333",
      color: "#fff",
      border: "2px solid #fff",
      textAlign: "center",
      minWidth: "100px",
      fontSize: "12px",
      fontWeight: "bold"
    }}>
      {data.label}
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
};

// RECTANGLE (Process)
const ProcessNode = ({ data }) => {
  if (!data.label) {
      return (
        <div style={{ width: 10, height: 10, background: '#555', borderRadius: '50%' }}>
           <Handle type="target" position={Position.Top} style={{opacity:0}} />
           <Handle type="source" position={Position.Bottom} style={{opacity:0}} />
        </div>
      )
  }
  return (
    <div style={{
      padding: "10px",
      borderRadius: "4px",
      background: "#1e1e1e",
      color: "#d4d4d4",
      border: "1px solid #777",
      textAlign: "center",
      minWidth: "100px",
      fontSize: "12px"
    }}>
      {data.label}
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
};

// DIAMOND (Decision)
const DecisionNode = ({ data }) => {
  return (
    <div style={{ position: "relative", width: "100px", height: "80px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        position: "absolute",
        width: "60px",
        height: "60px",
        background: "#333",
        border: "2px solid #dcb67a",
        transform: "rotate(45deg)",
        zIndex: -1
      }} />
      <div style={{ zIndex: 1, fontSize: "10px", textAlign: "center", color: "#fff", maxWidth: "80px" }}>
        {data.label}
      </div>
      <Handle type="target" position={Position.Top} style={{ top: 10, background: '#555' }} />
      <Handle type="source" position={Position.Bottom} style={{ bottom: 10, background: '#555' }} />
    </div>
  );
};

// HEXAGON (Loop)
const LoopNode = ({ data }) => {
  return (
    <div style={{ position: "relative", width: "150px", height: "60px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        background: "#00d8ff", 
        clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)",
        zIndex: -2
      }} />
       <div style={{
        position: "absolute",
        inset: 2, 
        background: "#222", 
        clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)",
        zIndex: -1
      }} />

      <div style={{ zIndex: 1, fontSize: "11px", textAlign: "center", color: "#00d8ff", maxWidth: "120px", fontWeight: "bold" }}>
        {data.label}
      </div>
      <Handle type="target" position={Position.Top} style={{ top: 0, background: '#555' }} />
      <Handle type="source" position={Position.Bottom} style={{ bottom: 0, background: '#555' }} />
    </div>
  );
};

// ===========================================
// 2. LAYOUT ENGINE (Dagre)
// ===========================================
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges) => {
  dagreGraph.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 60 }); 

  nodes.forEach((node) => {
    let width = 150;
    let height = 50;
    if (node.type === "decision") { height = 80; width = 100; }
    if (node.type === "loop") { height = 60; width = 150; } 
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - (node.type === 'decision' ? 50 : node.type === 'loop' ? 75 : 75),
        y: nodeWithPosition.y - 25,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

// ===========================================
// 3. GRAPH WRAPPER
// ===========================================
const FlowGraph = ({ data, onNodeClick }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodeTypes = useMemo(() => ({
    terminator: TerminatorNode,
    process: ProcessNode,
    decision: DecisionNode,
    loop: LoopNode 
  }), []);

  useEffect(() => {
    if (data && data.nodes) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        data.nodes,
        data.edges
      );
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
  }, [data, setNodes, setEdges]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes} 
        fitView
      >
        <Background color="#333" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
};

// ===========================================
// 4. MAIN APP
// ===========================================
const NewApp = () => {
  const [sidebarView, setSidebarView] = useState("snippets"); 
  const [activeFile, setActiveFile] = useState("Scratchpad"); 
  const [viewMode, setViewMode] = useState("split"); 
  const [currentFunc, setCurrentFunc] = useState(null); 
  
  // NEW: Language State
  const [language, setLanguage] = useState("python"); // 'python' or 'java'
  const [snippetCode, setSnippetCode] = useState(SNIPPETS.python);
  
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Switch Language & Template
  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    setSnippetCode(SNIPPETS[lang]);
    setAnalysisResult(null); // Clear previous results
    setCurrentFunc(null);
  };

  const handleAnalyze = async (specificFunction = null) => {
    setLoading(true);
    const codeToSend = sidebarView === "snippets" ? snippetCode : "# File content...";
    
    try {
      const payload = { 
        code: codeToSend, 
        language: language // Send selected language
      };
      
      if (specificFunction) {
        payload.function_name = specificFunction;
        setCurrentFunc(specificFunction);
      } else {
        setCurrentFunc(null); 
      }

      const response = await axios.post("http://127.0.0.1:8000/analyze", payload);
      setAnalysisResult(response.data);
      
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("Backend error. Is Port 8000 running?");
    } finally {
      setLoading(false);
    }
  };

  const onGraphNodeClick = (event, node) => {
    if (!currentFunc && analysisResult?.functions?.names.includes(node.data.label)) {
       handleAnalyze(node.data.label);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: "#1e1e1e", color: "#d4d4d4", fontFamily: "Segoe UI, sans-serif" }}>
       
       {/* 1. ACTIVITY BAR */}
      <div style={{ width: "50px", background: "#333", display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: "25px" }}>
        <Folder size={24} color={sidebarView === "explorer" ? "#fff" : "#777"} style={{cursor: "pointer"}} onClick={() => setSidebarView("explorer")} />
        <GitBranch size={24} color={sidebarView === "git" ? "#fff" : "#777"} style={{cursor: "pointer"}} onClick={() => setSidebarView("git")} />
        <ClipboardList size={24} color={sidebarView === "snippets" ? "#fff" : "#777"} style={{cursor: "pointer"}} onClick={() => setSidebarView("snippets")} />
        <Settings size={24} color="#777" style={{ marginTop: "auto", cursor: "pointer" }} />
      </div>

      {/* 2. SIDEBAR CONTENT */}
      <div style={{ width: "250px", background: "#252526", display: "flex", flexDirection: "column", borderRight: "1px solid #1e1e1e" }}>
        <div style={{ padding: "15px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase" }}>
          {sidebarView === "snippets" ? "Scratchpad" : sidebarView === "git" ? "Source Control" : "Explorer"}
        </div>
        
        {sidebarView === "snippets" && (
           <div style={{ padding: "10px" }}>
              <button style={{...actionBtnStyle, background: "#3e3e42", marginBottom: "15px", display: "flex", justifyContent: "center", alignItems: "center", gap: "5px"}}>
                 <Plus size={14} /> New Snippet
              </button>
              <div style={{fontSize: "0.8rem", color: "#888", marginBottom: "10px"}}>Templates</div>
              <FileItem name="Python Logic" type="code" active={language === "python"} onClick={() => handleLanguageChange("python")} />
              <FileItem name="Java Class" type="code" active={language === "java"} onClick={() => handleLanguageChange("java")} />
           </div>
        )}
      </div>

      {/* 3. CENTER STAGE */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#1e1e1e" }}>
        {/* TOOLBAR */}
        <div style={{ height: "40px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", padding: "0 15px", justifyContent: "space-between", background: "#1e1e1e" }}>
          
          <div style={{ fontSize: "0.8rem", color: "#888", display: "flex", alignItems: "center", gap: "10px" }}>
            {currentFunc ? (
               <>
                 <button onClick={() => handleAnalyze(null)} style={{...iconBtnStyle, color: "#4caf50", display: "flex", alignItems: "center", gap: "5px", fontWeight: "bold"}}>
                   <ArrowLeft size={14} /> Back to Overview
                 </button>
                 <span>/ {currentFunc}()</span>
               </>
            ) : (
               <span>Project Overview</span>
            )}
          </div>

          <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
             {/* LANGUAGE TOGGLE */}
             <div style={{ display: "flex", background: "#333", borderRadius: "4px", overflow: "hidden" }}>
                <button 
                  onClick={() => handleLanguageChange("python")}
                  style={{...langBtnStyle, background: language === "python" ? "#4caf50" : "transparent", color: language === "python" ? "white" : "#aaa"}}
                >
                  Python
                </button>
                <button 
                  onClick={() => handleLanguageChange("java")}
                  style={{...langBtnStyle, background: language === "java" ? "#f89820" : "transparent", color: language === "java" ? "white" : "#aaa"}}
                >
                  Java
                </button>
             </div>

             <div style={{ width: 1, height: 20, background: "#555" }} />

             {/* VIEW SWITCHER */}
             <div style={{ display: "flex", gap: "5px" }}>
                <button onClick={() => setViewMode("code")} title="Code Only" style={{...iconBtnStyle, background: viewMode === "code" ? "#3e3e42" : "transparent"}}> <FileText size={14} /> </button>
                <button onClick={() => setViewMode("split")} title="Split View" style={{...iconBtnStyle, background: viewMode === "split" ? "#3e3e42" : "transparent"}}> <Columns size={14} /> </button>
                <button onClick={() => setViewMode("graph")} title="Graph Only" style={{...iconBtnStyle, background: viewMode === "graph" ? "#3e3e42" : "transparent"}}> <Layers size={14} /> </button>
             </div>
             
             <button style={runBtnStyle} onClick={() => handleAnalyze(null)}><Play size={14} fill="white" /> Analyze</button>
          </div>
        </div>

        {/* CANVAS */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex" }}>
          {(viewMode === "code" || viewMode === "split") && (
            <div style={{ flex: viewMode === "split" ? "0 0 40%" : "1", borderRight: "1px solid #333", height: "100%" }}>
              <textarea 
                value={snippetCode} onChange={(e) => setSnippetCode(e.target.value)}
                style={editorStyle} spellCheck="false"
              />
            </div>
          )}

          {(viewMode === "graph" || viewMode === "split") && (
            <div style={{ flex: 1, position: "relative", height: "100%", background: "#1e1e1e" }}>
               {loading ? (
                 <div style={centerMsgStyle}>Analyzing...</div>
               ) : analysisResult && analysisResult.graph_data ? (
                 <FlowGraph data={analysisResult.graph_data} onNodeClick={onGraphNodeClick} />
               ) : (
                 <div style={centerMsgStyle}>
                    <p>[ React Flow Engine ]</p>
                    <p style={{fontSize: "0.8rem"}}>Ready to Analyze</p>
                 </div>
               )}
            </div>
          )}
        </div>
      </div>
      
      {/* 4. INSPECTOR */}
      <div style={{ width: "250px", background: "#252526", borderLeft: "1px solid #1e1e1e", padding: "15px" }}>
         <div style={{ fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "15px" }}>Functions</div>
         {analysisResult?.functions?.names?.map(fn => (
           <div 
             key={fn} 
             onClick={() => handleAnalyze(fn)}
             style={{
               padding: "8px", borderBottom: "1px solid #333", fontSize: "0.85rem", 
               cursor: "pointer", color: currentFunc === fn ? "#4caf50" : "#ccc",
               background: currentFunc === fn ? "#333" : "transparent"
             }}
           >
             <Code size={12} style={{marginRight: 8, display: "inline"}}/>
             {fn}()
           </div>
         ))}
         <div style={{ marginTop: "20px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "5px" }}>Complexity</div>
         <div style={{ background: "#333", borderRadius: "5px", padding: "15px" }}>
            <div style={{ fontSize: "2.5rem", fontWeight: "300", color: "#4caf50" }}>
              {currentFunc && analysisResult?.complexity 
                  ? analysisResult.complexity[currentFunc] 
                  : "-"}
            </div>
         </div>
      </div>
    </div>
  );
};

// --- STYLES ---
const FileItem = ({ name, type, active, onClick }) => (
  <div 
    onClick={onClick}
    style={{ padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: active ? "white" : "#888", background: active ? "#3e3e42" : "transparent", fontSize: "0.9rem", borderRadius: "3px" }}>
    <Code size={14} color={active ? "#4caf50" : "#888"}/> {name}
  </div>
);
const iconBtnStyle = { background: "transparent", border: "none", color: "#ccc", cursor: "pointer", padding: "5px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "3px" };
const langBtnStyle = { border: "none", cursor: "pointer", padding: "4px 12px", fontSize: "0.8rem", fontWeight: "bold" };
const runBtnStyle = { background: "#2da042", border: "none", color: "white", padding: "5px 12px", borderRadius: "3px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" };
const actionBtnStyle = { width: "100%", padding: "6px", border: "none", color: "white", cursor: "pointer", borderRadius: "3px" };
const editorStyle = { width: "100%", height: "100%", background: "#1e1e1e", color: "#d4d4d4", border: "none", padding: "20px", fontFamily: "monospace", fontSize: "14px", resize: "none", outline: "none" };
const centerMsgStyle = { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#555", textAlign: "center" };

export default NewApp;
import React, { useState } from "react";
import axios from "axios"; 
import { 
  Folder, Code, GitBranch, Play, ZoomIn, ZoomOut, Settings, 
  Layers, FileText, Columns, ClipboardList, Plus 
} from "lucide-react"; 

// --- MOCK GRAPH COMPONENT ---
const GraphPlaceholder = ({ loading }) => (
  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", color: "#555" }}>
    {loading ? (
      <>
        <div className="spinner" style={{marginBottom: 15, fontSize: "2rem", animation: "spin 1s linear infinite"}}>⚙️</div>
        <p>Analyzing Logic flow...</p>
      </>
    ) : (
      <>
        <p>[ Graph Rendering Engine ]</p>
        <p style={{ fontSize: "0.8rem" }}>Ready to visualize.</p>
      </>
    )}
  </div>
);

const NewApp = () => {
  // --- STATE ---
  const [sidebarView, setSidebarView] = useState("snippets"); // 'explorer', 'git', 'snippets'
  const [activeFile, setActiveFile] = useState("Scratchpad"); // Display name in tab
  const [viewMode, setViewMode] = useState("split"); // 'code', 'graph', 'split'
  
  // Data State
  const [snippetCode, setSnippetCode] = useState(`# Paste your Python code here\ndef hello():\n    print("Hello World")`);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // --- API HANDLER ---
  const handleAnalyze = async () => {
    setLoading(true);
    // If in snippet mode, use snippetCode. If in explorer, use file content (mocked for now)
    const codeToSend = sidebarView === "snippets" ? snippetCode : "# File content would go here...";
    
    try {
      const response = await axios.post("http://127.0.0.1:8000/analyze", { 
        code: codeToSend, 
        language: "python" 
      });
      setAnalysisResult(response.data);
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("Backend connection failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: "#1e1e1e", color: "#d4d4d4", fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      
      {/* 1. ACTIVITY BAR (Far Left) */}
      <div style={{ width: "50px", background: "#333", display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: "25px" }}>
        
        {/* Mode 1: Explorer */}
        <div title="Project Explorer" style={{ position: "relative" }}>
           <Folder size={24} color={sidebarView === "explorer" ? "#fff" : "#777"} style={{cursor: "pointer"}} onClick={() => {setSidebarView("explorer"); setActiveFile("main.py")}} />
           {sidebarView === "explorer" && <div style={activeBarIndicator} />}
        </div>

        {/* Mode 2: Git */}
        <div title="Source Control" style={{ position: "relative" }}>
           <GitBranch size={24} color={sidebarView === "git" ? "#fff" : "#777"} style={{cursor: "pointer"}} onClick={() => setSidebarView("git")} />
           {sidebarView === "git" && <div style={activeBarIndicator} />}
        </div>

        {/* Mode 3: Snippet/Paste (NEW) */}
        <div title="Quick Paste & Analyze" style={{ position: "relative" }}>
           <ClipboardList size={24} color={sidebarView === "snippets" ? "#fff" : "#777"} style={{cursor: "pointer"}} onClick={() => {setSidebarView("snippets"); setActiveFile("Scratchpad")}} />
           {sidebarView === "snippets" && <div style={activeBarIndicator} />}
        </div>

        <Settings size={24} color="#777" style={{ marginTop: "auto", cursor: "pointer" }} />
      </div>

      {/* 2. SIDEBAR CONTENT (Changes based on Activity Bar) */}
      <div style={{ width: "250px", background: "#252526", display: "flex", flexDirection: "column", borderRight: "1px solid #1e1e1e" }}>
        
        {/* VIEW: EXPLORER */}
        {sidebarView === "explorer" && (
          <>
            <div style={sidebarHeaderStyle}>Project Explorer</div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <FileItem name="src" type="folder" isOpen={true} />
              <div style={{ paddingLeft: "20px" }}>
                <FileItem name="utils.py" type="file" />
              </div>
              <FileItem name="main.py" type="file" active={true} />
            </div>
          </>
        )}

        {/* VIEW: GIT */}
        {sidebarView === "git" && (
          <>
            <div style={sidebarHeaderStyle}>Source Control</div>
            <div style={{ padding: "15px" }}>
              <p style={{ fontSize: "0.8rem", color: "#aaa", marginBottom: "10px" }}>Clone Repository</p>
              <input type="text" placeholder="https://github.com/..." style={inputStyle} />
              <button style={actionBtnStyle}>Clone</button>
            </div>
          </>
        )}

        {/* VIEW: SNIPPETS (NEW) */}
        {sidebarView === "snippets" && (
          <>
            <div style={sidebarHeaderStyle}>Scratchpad</div>
            <div style={{ padding: "10px" }}>
              <button style={{...actionBtnStyle, background: "#3e3e42", marginBottom: "15px", display: "flex", justifyContent: "center", alignItems: "center", gap: "5px"}}>
                 <Plus size={14} /> New Snippet
              </button>
              
              <div style={{ fontSize: "0.75rem", color: "#666", textTransform: "uppercase", marginBottom: "5px" }}>History</div>
              <FileItem name="Complex Loop Logic" type="code" active={true} />
              <FileItem name="Database Helper" type="code" />
              <FileItem name="Auth Middleware" type="code" />
            </div>
          </>
        )}
      </div>

      {/* 3. CENTER STAGE (Split View) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#1e1e1e" }}>
        
        {/* TAB BAR */}
        <div style={{ height: "35px", background: "#2d2d2d", display: "flex", alignItems: "center" }}>
          <div style={{ padding: "0 15px", height: "100%", background: "#1e1e1e", display: "flex", alignItems: "center", borderTop: `2px solid ${sidebarView === "snippets" ? "#dcb67a" : "#007acc"}`, color: "white", fontSize: "0.9rem", gap: "8px" }}>
             {/* Icon changes based on mode */}
            {sidebarView === "snippets" ? <FileText size={14} color="#dcb67a" /> : <Code size={14} color="#007acc" />} 
            {activeFile}
          </div>
          
          {/* View Toggles */}
          <div style={{ marginLeft: "auto", display: "flex", marginRight: 10, gap: "5px" }}>
            <button onClick={() => setViewMode("code")} title="Code Only" style={{...tabBtnStyle, background: viewMode === "code" ? "#3e3e42" : "transparent"}}> <FileText size={14} /> </button>
            <button onClick={() => setViewMode("split")} title="Split View" style={{...tabBtnStyle, background: viewMode === "split" ? "#3e3e42" : "transparent"}}> <Columns size={14} /> </button>
            <button onClick={() => setViewMode("graph")} title="Graph Only" style={{...tabBtnStyle, background: viewMode === "graph" ? "#3e3e42" : "transparent"}}> <Layers size={14} /> </button>
          </div>
        </div>

        {/* TOOLBAR */}
        <div style={{ height: "40px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", padding: "0 15px", justifyContent: "space-between", background: "#1e1e1e" }}>
          <div style={{ fontSize: "0.8rem", color: "#888" }}>{sidebarView === "snippets" ? "Local Scratchpad" : "repo/src/main.py"}</div>
          <button style={runBtnStyle} onClick={handleAnalyze}> <Play size={14} fill="white" /> Analyze </button>
        </div>

        {/* CANVAS (Split Pane) */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex" }}>
          
          {/* LEFT: EDITOR */}
          {(viewMode === "code" || viewMode === "split") && (
            <div style={{ flex: viewMode === "split" ? "0 0 50%" : "1", borderRight: "1px solid #333", height: "100%" }}>
              {sidebarView === "snippets" ? (
                <textarea 
                  value={snippetCode}
                  onChange={(e) => setSnippetCode(e.target.value)}
                  placeholder="# Paste your code here to analyze..."
                  style={editorStyle}
                  spellCheck="false"
                />
              ) : (
                // Read-only view for files (Mock)
                <div style={{...editorStyle, color: "#aaa", padding: "20px"}}>
                   # File View (Read Only)<br/>
                   # To edit, switch to Scratchpad mode.<br/>
                   <br/>
                   def main():<br/>
                   &nbsp;&nbsp;pass
                </div>
              )}
            </div>
          )}

          {/* RIGHT: GRAPH */}
          {(viewMode === "graph" || viewMode === "split") && (
            <div style={{ flex: 1, position: "relative", height: "100%", background: "#1e1e1e" }}>
               <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(#444 1px, transparent 1px)", backgroundSize: "20px 20px", opacity: 0.2, pointerEvents: "none" }}></div>
               <GraphPlaceholder loading={loading} />
            </div>
          )}

        </div>
      </div>

      {/* 4. INSPECTOR PANEL (Right) */}
      <div style={{ width: "280px", background: "#252526", borderLeft: "1px solid #1e1e1e", padding: "15px" }}>
        <div style={{ fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "15px" }}>Properties</div>
        <div style={{ background: "#333", borderRadius: "5px", padding: "15px", marginBottom: "15px" }}>
          <div style={{ fontSize: "0.8rem", color: "#aaa" }}>Cyclomatic Complexity</div>
          <div style={{ fontSize: "2.5rem", fontWeight: "300", color: analysisResult ? getRiskColor(getMaxComplexity(analysisResult)) : "#777" }}>
             {analysisResult ? getMaxComplexity(analysisResult) : "-"}
          </div>
          <div style={{ fontSize: "0.8rem", color: analysisResult ? getRiskColor(getMaxComplexity(analysisResult)) : "#777" }}>
             {analysisResult ? "Calculated Score" : "No Analysis"}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- STYLES & HELPERS ---
const getMaxComplexity = (data) => {
  if (!data.complexity) return 0;
  const values = Object.values(data.complexity);
  return values.length > 0 ? Math.max(...values) : 0;
};
const getRiskColor = (score) => (score < 5 ? "#4caf50" : score < 10 ? "#dcb67a" : "#ff5252");

const FileItem = ({ name, type, isOpen, active }) => (
  <div style={{ padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", background: active ? "#37373d" : "transparent", color: active ? "white" : "#ccc", fontSize: "0.9rem" }}>
    {type === "folder" ? <Folder size={14} color="#dcb67a" /> : type === "code" ? <FileText size={14} color="#dcb67a" /> : <Code size={14} color="#4caf50"/>}
    {name}
  </div>
);

const sidebarHeaderStyle = { padding: "10px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" };
const activeBarIndicator = { position: "absolute", left: -10, top: 0, bottom: 0, width: "3px", background: "white" }; // Visual marker for active tab
const editorStyle = { width: "100%", height: "100%", background: "#1e1e1e", color: "#d4d4d4", border: "none", padding: "20px", fontFamily: "monospace", fontSize: "14px", resize: "none", outline: "none", lineHeight: "1.5" };
const inputStyle = { width: "100%", padding: "6px", background: "#3c3c3c", border: "1px solid #3c3c3c", color: "white", borderRadius: "3px" };
const actionBtnStyle = { width: "100%", marginTop: "10px", padding: "6px", background: "#0e639c", border: "none", color: "white", cursor: "pointer", borderRadius: "3px" };
const runBtnStyle = { background: "#2da042", border: "none", color: "white", padding: "5px 12px", borderRadius: "3px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", fontSize: "0.9rem" };
const tabBtnStyle = { border: "none", color: "#ccc", padding: "4px 8px", borderRadius: "3px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", fontSize: "0.8rem" };

export default NewApp;
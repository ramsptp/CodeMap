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
  FileText, Layers, Trash2, FileCode, ChevronDown
} from "lucide-react"; 

// ===========================================
// 0. DATA & TEMPLATES
// ===========================================
const DEFAULT_TEMPLATES = {
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
        return result`,

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
}`
};

const DEFAULT_FILES = {
  "main.py": 
`# Main Entry Point
def main():
    print("Starting App...")
    x = 10
    if x > 5:
        print("Running logic...")
    print("Done")`,

  "utils.py":
`def helper():
    return "I am a helper"`,
    
  "scratchpad.py": 
`# Scratchpad
# Go to 'Snippets' tab to load templates here!`
};

// ===========================================
// 1. CUSTOM NODE DEFINITIONS
// ===========================================

const TerminatorNode = ({ data }) => {
  const labelLower = data.label ? data.label.toLowerCase() : "";
  const isStart = labelLower.startsWith("start");
  const borderColor = isStart ? "#4caf50" : "#ff5252"; 
  const textColor = isStart ? "#4caf50" : "#ff5252"; 

  return (
    <div style={{
      padding: "10px 20px",
      borderRadius: "25px",
      background: "#1e1e1e", 
      color: textColor,      
      border: `2px solid ${borderColor}`, 
      textAlign: "center",
      minWidth: "100px",
      fontSize: "12px",
      fontWeight: "bold",
      boxShadow: `0 0 10px ${borderColor}20` 
    }}>
      {data.label}
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};

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
      padding: "12px",
      borderRadius: "4px",
      background: "#1e1e1e", 
      color: "#e0e0e0",      
      border: "1px solid #fff", 
      textAlign: "left",
      minWidth: "120px",
      maxWidth: "250px",
      fontSize: "12px",
      fontFamily: "monospace",
      boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
    }}>
      {data.label}
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
};

const DecisionNode = ({ data }) => {
  return (
    <div style={{ position: "relative", width: "100px", height: "80px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        position: "absolute",
        width: "60px",
        height: "60px",
        background: "#1e1e1e", 
        border: "2px solid #dcb67a", 
        transform: "rotate(45deg)",
        zIndex: -1,
        boxShadow: "0 0 10px rgba(220, 182, 122, 0.2)"
      }} />
      <div style={{ zIndex: 1, fontSize: "10px", textAlign: "center", color: "#dcb67a", maxWidth: "80px", fontWeight: "bold" }}>
        {data.label}
      </div>
      <Handle type="target" position={Position.Top} style={{ top: 10, background: '#555' }} />
      <Handle type="source" position={Position.Bottom} style={{ bottom: 10, background: '#555' }} />
    </div>
  );
};

const LoopNode = ({ data }) => {
  return (
    <div style={{ position: "relative", width: "160px", height: "60px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        background: "#00d8ff", 
        clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)",
        zIndex: -2,
        boxShadow: "0 0 10px rgba(0, 216, 255, 0.3)"
      }} />
       <div style={{
        position: "absolute",
        inset: 2, 
        background: "#1e1e1e", 
        clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)",
        zIndex: -1
      }} />
      <div style={{ zIndex: 1, fontSize: "11px", textAlign: "center", color: "#00d8ff", maxWidth: "130px", fontWeight: "bold" }}>
        {data.label}
      </div>
      <Handle type="target" position={Position.Top} style={{ top: 0, background: '#555' }} />
      <Handle type="source" position={Position.Bottom} style={{ bottom: 0, background: '#555' }} />
    </div>
  );
};

// ===========================================
// 2. LAYOUT ENGINE (IMPROVED HORIZONTAL BRANCHING)
// ===========================================
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges) => {
  // Use LR (Left-Right) for more horizontal spread
  dagreGraph.setGraph({ 
    rankdir: 'TB',     // Top to Bottom main flow
    nodesep: 120,      // Increased horizontal spacing between nodes
    ranksep: 100,      // Increased vertical spacing between ranks
    edgesep: 50,       // Space between edges
    marginx: 50,
    marginy: 50
  });

  nodes.forEach((node) => {
    let width = 150;
    let height = 60;
    
    if (node.type === "terminator") { 
      width = 180; 
      height = 50; 
    }
    if (node.type === "decision") { 
      width = 120; 
      height = 100; 
    }
    if (node.type === "loop") { 
      width = 200; 
      height = 70; 
    }
    if (node.type === "process") { 
      if (!node.data.label) {
        // Merge point - make it tiny
        width = 10;
        height = 10;
      } else {
        width = 200; 
        height = 60; 
      }
    }
    
    dagreGraph.setNode(node.id, { width, height });
  });

  // Add edges with rank constraints for better branching
  edges.forEach((edge) => {
    const edgeConfig = {};
    
    // Give False/Done branches more weight to push them horizontally
    if (edge.label === "False" || edge.label === "Done") {
      edgeConfig.weight = 2; // Higher weight = prefer this path
    } else if (edge.label === "True" || edge.label === "Loop") {
      edgeConfig.weight = 1;
    }
    
    dagreGraph.setEdge(edge.source, edge.target, edgeConfig);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    
    // Center the nodes based on their type
    let xOffset = 100;
    let yOffset = 30;
    
    if (node.type === 'terminator') {
      xOffset = 90;
      yOffset = 25;
    }
    if (node.type === 'decision') {
      xOffset = 60;
      yOffset = 50;
    }
    if (node.type === 'loop') {
      xOffset = 100;
      yOffset = 35;
    }
    if (node.type === 'process') {
      if (!node.data.label) {
        xOffset = 5;
        yOffset = 5;
      } else {
        xOffset = 100;
        yOffset = 30;
      }
    }

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - xOffset,
        y: nodeWithPosition.y - yOffset,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

// ===========================================
// 3. GRAPH COMPONENT (WITH LAYOUT MEMORY)
// ===========================================
const FlowGraph = ({ data, onNodeClick, graphMemory, setGraphMemory, memoryKey }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodeTypes = useMemo(() => ({
    terminator: TerminatorNode,
    process: ProcessNode,
    decision: DecisionNode,
    loop: LoopNode 
  }), []);

  // Create a unique key based on node IDs to force re-layout when needed
  const graphKey = useMemo(() => {
    if (!data?.nodes || data.nodes.length === 0) return 'empty';
    return data.nodes.map(n => n.id).join('-');
  }, [data]);

  // Calculate or retrieve layout
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    if (!data || !data.nodes || data.nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Check if we have this layout in memory
    if (memoryKey && graphMemory[memoryKey]) {
      console.log(`📦 Loading layout from memory: ${memoryKey}`);
      return graphMemory[memoryKey];
    }

    // Calculate new layout
    console.log(`🔄 Calculating new layout: ${memoryKey || 'unnamed'}`);
    const layout = getLayoutedElements(data.nodes, data.edges || []);
    
    // Save to memory if we have a key
    if (memoryKey && setGraphMemory) {
      setGraphMemory(prev => ({
        ...prev,
        [memoryKey]: layout
      }));
    }
    
    return layout;
  }, [graphKey, memoryKey, graphMemory, data, setGraphMemory]);

  // Update React Flow state when layout changes
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

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
        fitViewOptions={{ padding: 0.2 }}
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
  // UI State
  const [sidebarView, setSidebarView] = useState("explorer"); 
  const [viewMode, setViewMode] = useState("split"); 
  const [currentFunc, setCurrentFunc] = useState(null); 
  const [language, setLanguage] = useState("python"); // Snippet Language Dropdown State
  
  // 1. FILE SYSTEM STATE (Explorer)
  const [files, setFiles] = useState(DEFAULT_FILES);
  const [activeFileName, setActiveFileName] = useState("main.py");

  // 2. SNIPPET MEMORY STATE (Independent Buffers)
  // This ensures Python snippet changes don't vanish when you switch to Java
  const [snippetMemory, setSnippetMemory] = useState(DEFAULT_TEMPLATES);
  
  // Backend State
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // 3. GRAPH LAYOUT MEMORY STATE
  // Stores calculated layouts so switching between functions preserves positions
  const [graphMemory, setGraphMemory] = useState({});

  // --- ACTIONS ---

  const handleFileClick = (filename) => {
    setActiveFileName(filename);
    setCurrentFunc(null);
    setAnalysisResult(null);
  };

  const handleCreateFile = () => {
    const name = prompt("Enter file name (e.g., helper.py):");
    if (name) {
        if (files[name]) {
            alert("File already exists!");
            return;
        }
        setFiles(prev => ({ ...prev, [name]: "# New File" }));
        setActiveFileName(name);
        setSidebarView("explorer");
    }
  };

  const handleDeleteFile = (e, name) => {
      e.stopPropagation();
      if (Object.keys(files).length === 1) {
          alert("Cannot delete the last file!");
          return;
      }
      if (window.confirm(`Delete ${name}?`)) {
          const newFiles = { ...files };
          delete newFiles[name];
          setFiles(newFiles);
          if (activeFileName === name) {
              setActiveFileName(Object.keys(newFiles)[0]);
          }
      }
  };

  // --- EDITOR CHANGE HANDLER ---
  const handleCodeChange = (e) => {
      const newContent = e.target.value;
      
      if (sidebarView === "explorer") {
          // Update File System
          setFiles(prev => ({ ...prev, [activeFileName]: newContent }));
          // Clear graph memory for this file since code changed
          setGraphMemory(prev => {
              const updated = { ...prev };
              Object.keys(updated).forEach(key => {
                  if (key.startsWith(`${activeFileName}:`)) {
                      delete updated[key];
                  }
              });
              return updated;
          });
      } else {
          // Update Snippet Memory (for the current language)
          setSnippetMemory(prev => ({ ...prev, [language]: newContent }));
          // Clear graph memory for this snippet
          setGraphMemory(prev => {
              const updated = { ...prev };
              Object.keys(updated).forEach(key => {
                  if (key.startsWith(`snippet-${language}:`)) {
                      delete updated[key];
                  }
              });
              return updated;
          });
      }
  };

  // Generate memory key for current graph
  const getMemoryKey = () => {
      if (sidebarView === "explorer") {
          return currentFunc 
              ? `${activeFileName}:${currentFunc}` 
              : `${activeFileName}:overview`;
      } else {
          return currentFunc
              ? `snippet-${language}:${currentFunc}`
              : `snippet-${language}:overview`;
      }
  };

  // --- SNIPPET ACTIONS ---
  // Overwrites the ACTIVE file with the CURRENT Snippet buffer
  const handleLoadSnippet = (lang) => {
      const contentToLoad = snippetMemory[lang]; // Use the memory, not the default!
      if (window.confirm(`Overwrite '${activeFileName}' with your ${lang} snippet?`)) {
          setFiles(prev => ({ ...prev, [activeFileName]: contentToLoad }));
          
          // Switch to explorer so they can see the file updated
          setSidebarView("explorer"); 
      }
  };

  // --- ANALYSIS ---
  const handleAnalyze = async (specificFunction = null) => {
    setLoading(true);
    
    // 1. Determine Language Logic
    let langToSend = "python";
    let codeToSend = "";

    if (sidebarView === "explorer") {
        // Auto-detect from file extension
        if (activeFileName.endsWith(".java")) langToSend = "java";
        else langToSend = "python";
        codeToSend = files[activeFileName];
    } else {
        // Use explicit dropdown choice in Snippets mode
        langToSend = language;
        codeToSend = snippetMemory[language];
    }
    
    try {
      const payload = { 
        code: codeToSend, 
        language: langToSend
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
        
        <div 
          onClick={() => setSidebarView("explorer")} 
          style={{ cursor: "pointer", borderLeft: sidebarView === "explorer" ? "2px solid #4caf50" : "2px solid transparent", width: "100%", display: "flex", justifyContent: "center", padding: "5px 0" }}
          title="Project Explorer"
        >
            <Folder size={24} color={sidebarView === "explorer" ? "#fff" : "#777"} />
        </div>

        <div 
          onClick={() => setSidebarView("snippets")} 
          style={{ cursor: "pointer", borderLeft: sidebarView === "snippets" ? "2px solid #4caf50" : "2px solid transparent", width: "100%", display: "flex", justifyContent: "center", padding: "5px 0" }}
          title="Code Snippets"
        >
             <ClipboardList size={24} color={sidebarView === "snippets" ? "#fff" : "#777"} />
        </div>

        <GitBranch size={24} color="#555" style={{cursor: "not-allowed"}} />
        <Settings size={24} color="#777" style={{ marginTop: "auto", cursor: "pointer" }} />
      </div>

      {/* 2. SIDEBAR CONTENT */}
      <div style={{ width: "250px", background: "#252526", display: "flex", flexDirection: "column", borderRight: "1px solid #1e1e1e" }}>
        
        {/* VIEW A: EXPLORER */}
        {sidebarView === "explorer" && (
            <>
                <div style={{ padding: "15px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>FILES</span>
                    <Plus size={16} style={{ cursor: "pointer" }} onClick={handleCreateFile} title="New File"/>
                </div>
                <div style={{ padding: "0 10px" }}>
                    {Object.keys(files).map(filename => (
                        <FileItem 
                            key={filename} 
                            name={filename} 
                            active={activeFileName === filename} 
                            onClick={() => handleFileClick(filename)}
                            onDelete={(e) => handleDeleteFile(e, filename)}
                        />
                    ))}
                </div>
            </>
        )}

        {/* VIEW B: SNIPPETS */}
        {sidebarView === "snippets" && (
            <>
                <div style={{ padding: "15px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase" }}>
                    SNIPPETS
                </div>
                <div style={{ padding: "0 10px" }}>
                    <div style={{fontSize: "0.8rem", color: "#888", marginBottom: "15px", fontStyle: "italic", borderBottom: "1px solid #333", paddingBottom: "10px"}}>
                        Select a template below to load into the snippet editor.
                    </div>
                    
                    {/* Buttons just switch the ACTIVE snippet view, they don't overwrite files immediately */}
                    <FileItem 
                        name="Python Template" 
                        active={language === "python"} 
                        onClick={() => setLanguage("python")} 
                    />
                    <FileItem 
                        name="Java Template" 
                        active={language === "java"} 
                        onClick={() => setLanguage("java")} 
                    />

                    <div style={{marginTop: "20px"}}>
                        <button style={actionBtnStyle} onClick={() => handleLoadSnippet(language)}>
                            Inject to {activeFileName}
                        </button>
                    </div>
                </div>
            </>
        )}
      </div>

      {/* 3. CENTER STAGE */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#1e1e1e" }}>
        {/* TOOLBAR */}
        <div style={{ height: "40px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", padding: "0 15px", justifyContent: "space-between", background: "#1e1e1e" }}>
          
          {/* Breadcrumbs */}
          <div style={{ fontSize: "0.8rem", color: "#888", display: "flex", alignItems: "center", gap: "10px" }}>
             <FileCode size={14} color="#4caf50"/>
             {sidebarView === "explorer" ? (
                 <span style={{fontWeight: "bold", color: "#d4d4d4"}}>{activeFileName}</span>
             ) : (
                 <span style={{fontWeight: "bold", color: "#f89820"}}>Snippet: {language.toUpperCase()}</span>
             )}
             
             {currentFunc && (
                 <>
                  <span style={{color: "#555"}}>/</span> 
                  <span style={{color: "#4caf50"}}>{currentFunc}()</span>
                 </>
             )}
          </div>

          <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
             
             {/* CONDITIONAL LANGUAGE CONTROL */}
             {sidebarView === "snippets" ? (
                 <select 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value)}
                    style={dropdownStyle}
                 >
                    <option value="python">Python</option>
                    <option value="java">Java</option>
                 </select>
             ) : (
                 <div style={{ fontSize: "0.75rem", color: "#666", fontWeight: "bold", background: "#252526", padding: "4px 8px", borderRadius: "3px" }}>
                    {activeFileName.endsWith(".java") ? "JAVA FILE" : "PYTHON FILE"}
                 </div>
             )}

             <div style={{ width: 1, height: 20, background: "#555" }} />

             {/* VIEW SWITCHER */}
             <div style={{ display: "flex", gap: "5px" }}>
                <button onClick={() => setViewMode("code")} title="Code Only" style={{...iconBtnStyle, background: viewMode === "code" ? "#3e3e42" : "transparent"}}> <FileText size={14} /> </button>
                <button onClick={() => setViewMode("split")} title="Split View" style={{...iconBtnStyle, background: viewMode === "split" ? "#3e3e42" : "transparent"}}> <Columns size={14} /> </button>
                <button onClick={() => setViewMode("graph")} title="Graph Only" style={{...iconBtnStyle, background: viewMode === "graph" ? "#3e3e42" : "transparent"}}> <Layers size={14} /> </button>
             </div>
             
             <button style={runBtnStyle} onClick={() => handleAnalyze(null)}>
                 <Play size={14} fill="white" /> 
                 {sidebarView === "snippets" ? " Analyze Snippet" : " Analyze File"}
             </button>
          </div>
        </div>

        {/* CANVAS */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex" }}>
          {(viewMode === "code" || viewMode === "split") && (
            <div style={{ flex: viewMode === "split" ? "0 0 40%" : "1", borderRight: "1px solid #333", height: "100%" }}>
              <textarea 
                value={sidebarView === "explorer" ? files[activeFileName] : snippetMemory[language]} 
                onChange={handleCodeChange}
                style={editorStyle} spellCheck="false"
              />
            </div>
          )}

          {(viewMode === "graph" || viewMode === "split") && (
            <div style={{ flex: 1, position: "relative", height: "100%", background: "#1e1e1e" }}>
               {loading ? (
                 <div style={centerMsgStyle}>Analyzing...</div>
               ) : analysisResult && analysisResult.graph_data ? (
                 <FlowGraph 
                   data={analysisResult.graph_data} 
                   onNodeClick={onGraphNodeClick}
                   graphMemory={graphMemory}
                   setGraphMemory={setGraphMemory}
                   memoryKey={getMemoryKey()}
                 />
               ) : (
                 <div style={centerMsgStyle}>
                    <p>[ React Flow Engine ]</p>
                    <p style={{fontSize: "0.8rem"}}>
                        {sidebarView === "explorer" ? "Select a file to map" : "Write a snippet to map"}
                    </p>
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
const FileItem = ({ name, active, onClick, onDelete }) => (
  <div 
    onClick={onClick}
    style={{ 
        padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "6px", cursor: "pointer", color: active ? "white" : "#888", 
        background: active ? "#3e3e42" : "transparent", fontSize: "0.9rem", borderRadius: "3px", marginBottom: "2px"
    }}>
    <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
        <FileText size={14} color={active ? "#4caf50" : "#888"}/> {name}
    </div>
    {onDelete && <Trash2 size={12} color={active ? "#ff5252" : "#555"} onClick={onDelete} />}
  </div>
);
const iconBtnStyle = { background: "transparent", border: "none", color: "#ccc", cursor: "pointer", padding: "5px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "3px" };
const runBtnStyle = { background: "#2da042", border: "none", color: "white", padding: "5px 12px", borderRadius: "3px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" };
const actionBtnStyle = { width: "100%", padding: "8px", border: "none", color: "white", background: "#4caf50", cursor: "pointer", borderRadius: "3px", fontWeight: "bold", fontSize: "0.8rem" };
const editorStyle = { width: "100%", height: "100%", background: "#1e1e1e", color: "#d4d4d4", border: "none", padding: "20px", fontFamily: "monospace", fontSize: "14px", resize: "none", outline: "none" };
const centerMsgStyle = { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#555", textAlign: "center" };
const dropdownStyle = { background: "#252526", color: "#d4d4d4", border: "1px solid #333", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8rem", outline: "none", cursor: "pointer" };

export default NewApp;
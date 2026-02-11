import React, { useState, useEffect, useMemo, useCallback } from "react";
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
import JSZip from 'jszip';
import {
  Folder, Code, GitBranch, Play, Settings,
  Columns, ClipboardList, Plus, ArrowLeft,
  FileText, Layers, Trash2, FileCode, ChevronDown
} from "lucide-react";
import FileExplorer from './components/FileExplorer';

// ===========================================
// DEPENDENCY SCANNER
// ===========================================

// Scan Python imports
const scanPythonImports = (content) => {
  const imports = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match: from module import ...
    const fromMatch = line.match(/^\s*from\s+([\w.]+)\s+import/);
    if (fromMatch) {
      imports.push(fromMatch[1].split('.')[0]); // Get base module
    }

    // Match: import module
    const importMatch = line.match(/^\s*import\s+([\w.]+)/);
    if (importMatch) {
      imports.push(importMatch[1].split('.')[0]);
    }
  }

  return [...new Set(imports)]; // Remove duplicates
};

// Scan Java imports
const scanJavaImports = (content) => {
  const imports = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^\s*import\s+([\w.]+);/);
    if (match) {
      // Get class name from package path
      const parts = match[1].split('.');
      imports.push(parts[parts.length - 1]);
    }
  }

  return [...new Set(imports)];
};

// Scan JavaScript/TypeScript imports
const scanJsImports = (content) => {
  const imports = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match: import ... from 'module'
    const esImport = line.match(/^\s*import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
    if (esImport) {
      const mod = esImport[1].replace(/^\.\//, '').replace(/\.\w+$/, '');
      const parts = mod.split('/');
      imports.push(parts[parts.length - 1]);
    }

    // Match: const x = require('module')
    const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      const mod = requireMatch[1].replace(/^\.\//, '').replace(/\.\w+$/, '');
      const parts = mod.split('/');
      imports.push(parts[parts.length - 1]);
    }

    // Match: import('module') dynamic
    const dynamicImport = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynamicImport) {
      const mod = dynamicImport[1].replace(/^\.\//, '').replace(/\.\w+$/, '');
      const parts = mod.split('/');
      imports.push(parts[parts.length - 1]);
    }

    // Match: export ... from 'module'
    const reExport = line.match(/^\s*export\s+.*?\s+from\s+['"]([^'"]+)['"]/);
    if (reExport) {
      const mod = reExport[1].replace(/^\.\//, '').replace(/\.\w+$/, '');
      const parts = mod.split('/');
      imports.push(parts[parts.length - 1]);
    }
  }

  return [...new Set(imports)];
};

// Scan file tree for dependencies
const scanTreeDependencies = (tree, basePath = '') => {
  const imports = new Map(); // filePath -> [imported modules]
  const importedBy = new Map(); // filePath -> [files that import it]
  const filesByName = new Map(); // filename (without ext) -> full path

  // First pass: collect all file paths and names
  const collectFiles = (node, path) => {
    if (node.type === 'file') {
      const nameWithoutExt = node.name.replace(/\.[^.]+$/, '');
      filesByName.set(nameWithoutExt.toLowerCase(), path);
    } else if (node.type === 'folder' && node.children) {
      for (const [name, child] of Object.entries(node.children)) {
        collectFiles(child, path ? `${path}/${name}` : name);
      }
    }
  };
  collectFiles(tree, '');

  // Second pass: scan imports
  const scanNode = (node, path) => {
    if (node.type === 'file' && node.content) {
      let fileImports = [];

      if (node.name.endsWith('.py')) {
        fileImports = scanPythonImports(node.content);
      } else if (node.name.endsWith('.java')) {
        fileImports = scanJavaImports(node.content);
      } else if (/\.(js|jsx|ts|tsx)$/.test(node.name)) {
        fileImports = scanJsImports(node.content);
      }

      // Resolve imports to actual files in the tree
      const resolvedImports = [];
      for (const imp of fileImports) {
        const importPath = filesByName.get(imp.toLowerCase());
        if (importPath && importPath !== path) {
          resolvedImports.push(importPath);

          // Update importedBy
          if (!importedBy.has(importPath)) {
            importedBy.set(importPath, []);
          }
          importedBy.get(importPath).push(path);
        }
      }

      if (resolvedImports.length > 0) {
        imports.set(path, resolvedImports);
      }
    } else if (node.type === 'folder' && node.children) {
      for (const [name, child] of Object.entries(node.children)) {
        scanNode(child, path ? `${path}/${name}` : name);
      }
    }
  };
  scanNode(tree, '');

  return { imports, importedBy };
};

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

// Hierarchical file tree structure
const DEFAULT_FILE_TREE = {
  type: 'folder',
  name: 'root',
  children: {
    'src': {
      type: 'folder',
      name: 'src',
      children: {
        'main.py': {
          type: 'file',
          name: 'main.py',
          content: `# Main Entry Point
from utils import helper

def main():
    print("Starting App...")
    x = 10
    if x > 5:
        print("Running logic...")
        helper()
    print("Done")`
        },
        'utils.py': {
          type: 'file',
          name: 'utils.py',
          content: `def helper():
    return "I am a helper"

def format_output(text):
    return f"[OUTPUT] {text}"`
        }
      }
    },
    'config.py': {
      type: 'file',
      name: 'config.py',
      content: `# Configuration
DEBUG = True
VERSION = "1.0.0"`
    },
    'scratchpad.py': {
      type: 'file',
      name: 'scratchpad.py',
      content: `# Scratchpad
# Go to 'Snippets' tab to load templates here!`
    }
  }
};

// Helper: Get file content from tree by path
const getFileContent = (tree, path) => {
  if (!path) return '';
  const parts = path.split('/');
  let current = tree;
  for (const part of parts) {
    if (current.children && current.children[part]) {
      current = current.children[part];
    } else {
      return '';
    }
  }
  return current.content || '';
};

// Helper: Set file content in tree by path
const setFileContent = (tree, path, content) => {
  const newTree = JSON.parse(JSON.stringify(tree));
  const parts = path.split('/');
  let current = newTree;
  for (const part of parts) {
    if (current.children && current.children[part]) {
      current = current.children[part];
    } else {
      return newTree;
    }
  }
  if (current.type === 'file') {
    current.content = content;
  }
  return newTree;
};

// Helper: Get filename from path
const getFileName = (path) => {
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1];
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
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
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
// 3b. FILE DEPENDENCY GRAPH COMPONENT
// ===========================================

// Language color palette
const LANG_COLORS = {
  py: { bg: '#2b5b84', border: '#3572A5', text: '#fff', label: 'Python' },
  java: { bg: '#6d4c0a', border: '#b07219', text: '#fff', label: 'Java' },
  js: { bg: '#6b5e00', border: '#f1e05a', text: '#fff', label: 'JS' },
  jsx: { bg: '#6b5e00', border: '#f1e05a', text: '#fff', label: 'JSX' },
  ts: { bg: '#1a4b6e', border: '#3178c6', text: '#fff', label: 'TS' },
  tsx: { bg: '#1a4b6e', border: '#3178c6', text: '#fff', label: 'TSX' },
  json: { bg: '#4a3800', border: '#cb8c00', text: '#fff', label: 'JSON' },
  css: { bg: '#1a3a5c', border: '#563d7c', text: '#fff', label: 'CSS' },
  html: { bg: '#6c2e00', border: '#e34c26', text: '#fff', label: 'HTML' },
  md: { bg: '#333', border: '#888', text: '#fff', label: 'Markdown' },
  default: { bg: '#333', border: '#666', text: '#ccc', label: 'File' }
};

const getFileColor = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return LANG_COLORS[ext] || LANG_COLORS.default;
};

// Custom node for file dependency graph
const FileDepNode = ({ data }) => {
  const colors = data.colors;
  const isSelected = data.isSelected;

  return (
    <div style={{
      background: isSelected ? '#094771' : colors.bg,
      border: `2px solid ${isSelected ? '#4caf50' : colors.border}`,
      borderRadius: '8px',
      padding: '10px 16px',
      minWidth: '140px',
      textAlign: 'center',
      boxShadow: isSelected
        ? '0 0 12px rgba(76, 175, 80, 0.5)'
        : '0 2px 8px rgba(0, 0, 0, 0.3)',
      transition: 'all 0.2s ease',
      cursor: 'pointer',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: colors.border, width: 8, height: 8 }} />
      <div style={{
        fontSize: '0.55rem',
        color: colors.border,
        textTransform: 'uppercase',
        fontWeight: 'bold',
        marginBottom: '3px',
        letterSpacing: '0.5px',
        opacity: 0.9,
      }}>
        {colors.label}
      </div>
      <div style={{
        color: colors.text,
        fontSize: '0.8rem',
        fontWeight: isSelected ? 'bold' : 'normal',
        wordBreak: 'break-word',
      }}>
        {data.label}
      </div>
      {data.folder && (
        <div style={{
          color: 'rgba(255,255,255,0.4)',
          fontSize: '0.6rem',
          marginTop: '2px',
        }}>
          {data.folder}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: colors.border, width: 8, height: 8 }} />
    </div>
  );
};

const FileDepGraph = ({ dependencies, fileTree, selectedFile, onFileSelect, graphMemory, setGraphMemory }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodeTypes = useMemo(() => ({
    fileNode: FileDepNode
  }), []);

  // Generate a key for the current graph structure to manage memory
  const graphKey = useMemo(() => {
    if (!dependencies?.imports && !dependencies?.importedBy) return 'empty';
    // Create a simple hash based on file names involved
    const files = new Set();
    dependencies.imports?.forEach((_, k) => files.add(k));
    dependencies.importedBy?.forEach((_, k) => files.add(k));
    return `file-dep-${Array.from(files).sort().join('|')}`;
  }, [dependencies]);

  // 1. Structure & Layout Effect (Runs only when dependencies change)
  useEffect(() => {
    if (!dependencies) return;

    // Collect all files that have dependencies
    const allFiles = new Set();
    dependencies.imports?.forEach((deps, file) => {
      allFiles.add(file);
      deps.forEach(d => allFiles.add(d));
    });
    dependencies.importedBy?.forEach((importers, file) => {
      allFiles.add(file);
      importers.forEach(i => allFiles.add(i));
    });

    if (allFiles.size === 0) return;

    // Check memory first
    if (graphMemory && graphMemory[graphKey]) {
      console.log(`📦 Loading file graph layout from memory: ${graphKey}`);
      const savedData = graphMemory[graphKey];
      setNodes(savedData.nodes.map(n => ({
        ...n,
        data: { ...n.data, isSelected: n.id === selectedFile }
      })));
      setEdges(savedData.edges);
      return;
    }

    console.log(`🔄 Calculating new file graph layout`);

    // Create Base Nodes
    const newNodes = Array.from(allFiles).map(filePath => {
      const fileName = filePath.split('/').pop();
      const folderPath = filePath.split('/').slice(0, -1).join('/');
      const colors = getFileColor(fileName);

      return {
        id: filePath,
        type: 'fileNode',
        data: {
          label: fileName,
          folder: folderPath || null,
          colors,
          isSelected: filePath === selectedFile,
        },
        position: { x: 0, y: 0 },
      };
    });

    // Create Edges
    const newEdges = [];
    dependencies.imports?.forEach((deps, sourceFile) => {
      deps.forEach(targetFile => {
        newEdges.push({
          id: `${sourceFile}->${targetFile}`,
          source: sourceFile,
          target: targetFile,
          animated: true,
          style: { stroke: '#4da3ff', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: '#4da3ff' },
          label: 'imports',
          labelStyle: { fill: '#888', fontSize: '0.6rem' },
          labelBgStyle: { fill: '#1e1e1e', fillOpacity: 0.8 },
        });
      });
    });

    // Run Dagre Layout
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: 'TB',
      nodesep: 80,
      ranksep: 100,
      edgesep: 30,
      marginx: 40,
      marginy: 40,
    });

    newNodes.forEach(node => {
      g.setNode(node.id, { width: 160, height: 70 });
    });

    newEdges.forEach(edge => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    const layoutedNodes = newNodes.map(node => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: { x: pos.x - 80, y: pos.y - 35 },
      };
    });

    setNodes(layoutedNodes);
    setEdges(newEdges);

    // Save initial layout to memory
    if (setGraphMemory) {
      setGraphMemory(prev => ({
        ...prev,
        [graphKey]: { nodes: layoutedNodes, edges: newEdges }
      }));
    }
  }, [graphKey, dependencies, setGraphMemory, graphMemory]); // Intentionally exclude selectedFile

  // 2. Selection Effect (Runs when selectedFile changes)
  useEffect(() => {
    setNodes(nds => nds.map(node => ({
      ...node,
      data: {
        ...node.data,
        isSelected: node.id === selectedFile
      }
    })));
  }, [selectedFile, setNodes]);

  // 3. Drag Persistence
  const onNodeDragStop = useCallback((event, node) => {
    // Determine current nodes (React Flow state)
    // We need to access the LATEST nodes state to save it. 
    // Since we can't access state directly inside this callback without dependency,
    // we rely on the node passed, but we need ALL nodes.
    // Actually, setGraphMemory callback works best here.

    setNodes(nds => {
      // Save the *updated* nodes to memory
      if (setGraphMemory) {
        setGraphMemory(prev => ({
          ...prev,
          [graphKey]: { nodes: nds, edges }
        }));
      }
      return nds;
    });
  }, [graphKey, setGraphMemory, edges, setNodes]);

  const handleNodeClick = useCallback((event, node) => {
    if (onFileSelect) {
      onFileSelect(node.id, null);
    }
  }, [onFileSelect]);

  const hasData = nodes.length > 0;

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {hasData ? (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
        >
          <Background color="#333" gap={16} />
          <Controls />
        </ReactFlow>
      ) : (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#555', textAlign: 'center',
        }}>
          <p style={{ fontSize: '1.2rem' }}>📊 File Dependency Map</p>
          <p style={{ fontSize: '0.8rem' }}>
            Upload files with imports to see relationships
          </p>
        </div>
      )}
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

  // 1. FILE SYSTEM STATE (Explorer) - Now using tree structure
  const [fileTree, setFileTree] = useState(DEFAULT_FILE_TREE);
  const [selectedFilePath, setSelectedFilePath] = useState("src/main.py"); // Full path like 'src/main.py'

  // 2. SNIPPET MEMORY STATE (Independent Buffers)
  const [snippetMemory, setSnippetMemory] = useState(DEFAULT_TEMPLATES);

  // Backend State
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // 3. GRAPH LAYOUT MEMORY STATE
  const [graphMemory, setGraphMemory] = useState({});

  // 4. DEPENDENCY TRACKING STATE
  const [dependencies, setDependencies] = useState({ imports: new Map(), importedBy: new Map() });

  // Get current file content from tree
  const currentFileContent = useMemo(() => {
    return getFileContent(fileTree, selectedFilePath);
  }, [fileTree, selectedFilePath]);

  // Get display name for current file
  const activeFileName = useMemo(() => {
    return getFileName(selectedFilePath);
  }, [selectedFilePath]);

  // Auto-scan dependencies when file tree changes
  useEffect(() => {
    const deps = scanTreeDependencies(fileTree);
    setDependencies(deps);
  }, [fileTree]);

  // --- ACTIONS ---

  // Handle file selection from FileExplorer
  const handleFileSelect = useCallback((path, content) => {
    setSelectedFilePath(path);
    setCurrentFunc(null);
    setAnalysisResult(null);
  }, []);

  // Handle file upload (multiple files)
  const handleUploadFiles = useCallback((files) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFileTree(prev => {
          const newTree = JSON.parse(JSON.stringify(prev));
          newTree.children[file.name] = {
            type: 'file',
            name: file.name,
            content: e.target.result
          };
          return newTree;
        });
      };
      reader.readAsText(file);
    });
  }, []);

  // Handle folder upload
  const handleUploadFolder = useCallback((files) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const pathParts = file.webkitRelativePath.split('/');
        setFileTree(prev => {
          const newTree = JSON.parse(JSON.stringify(prev));
          let current = newTree;

          // Navigate/create folder structure
          for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!current.children[part]) {
              current.children[part] = {
                type: 'folder',
                name: part,
                children: {}
              };
            }
            current = current.children[part];
          }

          // Add file
          const fileName = pathParts[pathParts.length - 1];
          current.children[fileName] = {
            type: 'file',
            name: fileName,
            content: e.target.result
          };

          return newTree;
        });
      };
      reader.readAsText(file);
    });
  }, []);

  // Handle ZIP upload with extraction
  const handleUploadZip = useCallback(async (file) => {
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);

      const zipName = file.name.replace('.zip', '');

      // First, collect all files with their content
      const fileData = [];
      const filePromises = [];

      // First, log what's in the ZIP
      const allPaths = [];
      contents.forEach((relativePath, zipEntry) => {
        allPaths.push({ path: relativePath, isDir: zipEntry.dir });
      });
      console.log('All ZIP entries:', allPaths);

      contents.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir) {
          // Skip hidden files
          const isHidden = relativePath.split('/').some(part => part.startsWith('.'));

          // Skip common binary extensions
          const ext = relativePath.split('.').pop()?.toLowerCase();
          const binaryExts = ['zip', 'exe', 'dll', 'so', 'dylib', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'mp3', 'mp4', 'avi', 'mov', 'wav', 'ttf', 'woff', 'woff2', 'eot', 'class', 'jar', 'pyc', 'pyo'];
          const isBinary = binaryExts.includes(ext);

          if (!isHidden && !isBinary) {
            filePromises.push(
              zipEntry.async('string').then(content => {
                fileData.push({ path: relativePath, content });
              }).catch(err => {
                console.warn('Failed to read file as text:', relativePath, err);
              })
            );
          }
        }
      });

      // Wait for all files to be read
      await Promise.all(filePromises);

      console.log('ZIP files extracted:', fileData.length, fileData.map(f => f.path));

      // Now build the tree synchronously
      setFileTree(prevTree => {
        const newTree = JSON.parse(JSON.stringify(prevTree));

        // Create root folder for zip contents
        newTree.children[zipName] = {
          type: 'folder',
          name: zipName,
          children: {}
        };

        // Add all files to the tree
        for (const { path, content } of fileData) {
          const pathParts = path.split('/').filter(p => p); // Filter empty parts
          let current = newTree.children[zipName];

          // Create folder structure
          for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!current.children) {
              current.children = {};
            }
            if (!current.children[part]) {
              current.children[part] = {
                type: 'folder',
                name: part,
                children: {}
              };
            }
            current = current.children[part];
          }

          // Add file
          const fileName = pathParts[pathParts.length - 1];
          if (fileName) {
            if (!current.children) {
              current.children = {};
            }
            current.children[fileName] = {
              type: 'file',
              name: fileName,
              content: content
            };
          }
        }

        return newTree;
      });

    } catch (error) {
      console.error('ZIP extraction failed:', error);
      alert('Failed to extract ZIP file. Make sure it\'s a valid ZIP.');
    }
  }, []);

  // --- EDITOR CHANGE HANDLER ---
  const handleCodeChange = (e) => {
    const newContent = e.target.value;

    if (sidebarView === "explorer") {
      // Update File Tree
      setFileTree(prev => setFileContent(prev, selectedFilePath, newContent));
      // Clear graph memory for this file since code changed
      setGraphMemory(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (key.startsWith(`${selectedFilePath}:`)) {
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
        ? `${selectedFilePath}:${currentFunc}`
        : `${selectedFilePath}:overview`;
    } else {
      return currentFunc
        ? `snippet-${language}:${currentFunc}`
        : `snippet-${language}:overview`;
    }
  };

  // --- SNIPPET ACTIONS ---
  // Overwrites the ACTIVE file with the CURRENT Snippet buffer
  const handleLoadSnippet = (lang) => {
    const contentToLoad = snippetMemory[lang];
    if (window.confirm(`Overwrite '${activeFileName}' with your ${lang} snippet?`)) {
      setFileTree(prev => setFileContent(prev, selectedFilePath, contentToLoad));
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
      codeToSend = currentFileContent;
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

        <GitBranch size={24} color="#555" style={{ cursor: "not-allowed" }} />
        <Settings size={24} color="#777" style={{ marginTop: "auto", cursor: "pointer" }} />
      </div>

      {/* 2. SIDEBAR CONTENT */}
      <div style={{ width: "250px", background: "#252526", display: "flex", flexDirection: "column", borderRight: "1px solid #1e1e1e" }}>

        {/* VIEW A: EXPLORER - Now using FileExplorer component */}
        {sidebarView === "explorer" && (
          <FileExplorer
            fileTree={fileTree}
            setFileTree={setFileTree}
            selectedFile={selectedFilePath}
            onFileSelect={handleFileSelect}
            dependencies={dependencies}
            onUploadFiles={handleUploadFiles}
            onUploadFolder={handleUploadFolder}
            onUploadZip={handleUploadZip}
          />
        )}

        {/* VIEW B: SNIPPETS */}
        {sidebarView === "snippets" && (
          <>
            <div style={{ padding: "15px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase" }}>
              SNIPPETS
            </div>
            <div style={{ padding: "0 10px" }}>
              <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "15px", fontStyle: "italic", borderBottom: "1px solid #333", paddingBottom: "10px" }}>
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

              <div style={{ marginTop: "20px" }}>
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
            <FileCode size={14} color="#4caf50" />
            {sidebarView === "explorer" ? (
              <span style={{ fontWeight: "bold", color: "#d4d4d4" }}>{activeFileName}</span>
            ) : (
              <span style={{ fontWeight: "bold", color: "#f89820" }}>Snippet: {language.toUpperCase()}</span>
            )}

            {currentFunc && (
              <>
                <span style={{ color: "#555" }}>/</span>
                <span style={{ color: "#4caf50" }}>{currentFunc}()</span>
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
              <button onClick={() => setViewMode("code")} title="Code Only" style={{ ...iconBtnStyle, background: viewMode === "code" ? "#3e3e42" : "transparent" }}> <FileText size={14} /> </button>
              <button onClick={() => setViewMode("split")} title="Split View" style={{ ...iconBtnStyle, background: viewMode === "split" ? "#3e3e42" : "transparent" }}> <Columns size={14} /> </button>
              <button onClick={() => setViewMode("graph")} title="Graph Only" style={{ ...iconBtnStyle, background: viewMode === "graph" ? "#3e3e42" : "transparent" }}> <Layers size={14} /> </button>
              {sidebarView === "explorer" && (
                <>
                  <div style={{ width: 1, height: 20, background: "#444", alignSelf: "center" }} />
                  <button onClick={() => setViewMode("fileMap")} title="File Dependency Map" style={{ ...iconBtnStyle, background: viewMode === "fileMap" ? "#3e3e42" : "transparent", color: viewMode === "fileMap" ? "#4caf50" : "#ccc" }}> <GitBranch size={14} /> </button>
                </>
              )}
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
                value={sidebarView === "explorer" ? currentFileContent : snippetMemory[language]}
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
                  <p style={{ fontSize: "0.8rem" }}>
                    {sidebarView === "explorer" ? "Select a file to map" : "Write a snippet to map"}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* FILE DEPENDENCY MAP - Explorer only */}
          {viewMode === "fileMap" && sidebarView === "explorer" && (
            <div style={{ flex: 1, position: "relative", height: "100%", background: "#1e1e1e" }}>
              <FileDepGraph
                dependencies={dependencies}
                fileTree={fileTree}
                selectedFile={selectedFilePath}
                onFileSelect={handleFileSelect}
                graphMemory={graphMemory}
                setGraphMemory={setGraphMemory}
              />
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
            <Code size={12} style={{ marginRight: 8, display: "inline" }} />
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
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <FileText size={14} color={active ? "#4caf50" : "#888"} /> {name}
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
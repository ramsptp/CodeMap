import React, { useState, useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import axios from "axios";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import JSZip from 'jszip';
import { toPng } from 'html-to-image';
import {
  Folder, Code, GitBranch, Play, Settings,
  Columns, ClipboardList, Plus, ArrowLeft,
  FileText, Layers, Trash2, FileCode, ChevronDown, Edit3,
  Search, FolderOpen, ChevronRight, Move, Maximize, Minus, X, Download, Github, Loader,
  AlertTriangle, CheckCircle, Info, Zap, Image, LayoutDashboard
} from "lucide-react";
import FileExplorer from './components/FileExplorer';
import GitHubExplorer from './components/GitHubExplorer';
import { parseRepoInput, fetchDefaultBranch, fetchRepoTree, fetchFileContent, checkRateLimit, fetchReadme, fetchFileCommits } from './utils/githubApi';

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
const DEFAULT_SNIPPETS = [
  {
    id: "default-python",
    name: "Python Factorial",
    language: "python",
    content: `def calculate_factorial(n):
    if n < 0:
        return None
    elif n == 0:
        return 1
    else:
        result = 1
        for i in range(1, n + 1):
            result *= i
        return result`
  },
  {
    id: "default-java",
    name: "Java Factorial",
    language: "java",
    content: `public class LogicDemo {
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
  }
];

// Load snippets from localStorage or use defaults
const loadSnippets = () => {
  try {
    const saved = localStorage.getItem('codemap-snippets');
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore parse errors */ }
  return DEFAULT_SNIPPETS;
};

const saveSnippets = (snippets) => {
  localStorage.setItem('codemap-snippets', JSON.stringify(snippets));
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
    'samples': {
      type: 'folder',
      name: 'samples',
      children: {
        'sample.cpp': {
          type: 'file',
          name: 'sample.cpp',
          content: `#include <iostream>

void checkVoting(int age) {
    if (age >= 18) {
        std::cout << "Eligible to vote" << std::endl;
    } else {
        std::cout << "Too young" << std::endl;
    }
}

int main() {
    int myAge = 20;
    checkVoting(myAge);
    return 0;
}`
        },
        'sample.c': {
          type: 'file',
          name: 'sample.c',
          content: `#include <stdio.h>

int gcd(int a, int b) {
    while (b != 0) {
        int temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

int main() {
    int num1 = 48;
    int num2 = 18;
    
    if (num1 <= 0 || num2 <= 0) {
        printf("Numbers must be positive\\n");
        return 1;
    }
    
    int result = gcd(num1, num2);
    
    if (result > 1) {
        printf("GCD is %d\\n", result);
    } else {
        printf("Co-prime numbers\\n");
    }
    
    return 0;
}`
        },
        'sample.js': {
          type: 'file',
          name: 'sample.js',
          content: `function processData(limit) {
    let sum = 0;
    console.log("Starting calculation...");

    for (let i = 1; i <= limit; i++) {
        if (i % 3 === 0 && i % 5 === 0) {
            console.log("FizzBuzz");
            sum += i * 2;
        } else if (i % 3 === 0) {
            console.log("Fizz");
            sum += i;
        } else if (i % 5 === 0) {
            console.log("Buzz");
            sum += i;
        } else {
            console.log(i);
        }
    }

    if (sum > 100) {
        return "High Value";
    } else {
        return "Low Value";
    }
}

processData(20);`
        },
        'sample.ts': {
          type: 'file',
          name: 'sample.ts',
          content: `function analyzeUser(age: number, role: string): boolean {
    if (age < 18) {
        return false;
    }

    if (role === 'admin') {
        console.log("Access Granted: Admin");
        return true;
    }

    let strikes = 0;
    const actions = ['login', 'view', 'edit'];

    for (const action of actions) {
        if (action === 'delete') {
            strikes++;
        }
    }

    if (strikes > 0) {
        return false;
    }

    return true;
}

analyzeUser(25, 'user');`
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
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ bottom: 10, background: '#555' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ right: 10, background: '#555' }} />
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
      <Handle type="target" position={Position.Left} id="left" style={{ left: 0, background: '#555' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ bottom: 0, background: '#555' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ right: 0, background: '#555' }} />
    </div>
  );
};

// ===========================================
// 2. LAYOUT ENGINE (IMPROVED HORIZONTAL BRANCHING)
// ===========================================
const getLayoutedElements = (nodes, edges) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  // Use LR (Left-Right) for more horizontal spread
  // Use tight-tree for standard AST-like flowchart branch behavior
  dagreGraph.setGraph({
    rankdir: 'TB',     // Top to Bottom main flow
    ranker: 'tight-tree', // Better handling of strictly branching subtrees
    nodesep: 150,      // Significantly increased horizontal spacing to avoid overlaps
    ranksep: 120,      // Increased vertical spacing to accommodate tall wrapping nodes
    edgesep: 60,       // Tighter edges
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
      width = 140; // Slightly wider diamonds
      height = 100;
    }
    if (node.type === "loop") {
      width = 200;
      height = 70;
    }
    if (node.type === "process") {
      if (!node.data.label) {
        width = 1;
        height = 1;
      } else {
        const textLen = node.data.label.length;
        width = Math.min(Math.max(200, textLen * 8), 350); // Dynamic width up to 350
        height = Math.max(60, Math.ceil(textLen / 30) * 30 + 40); // Taller if text wraps
      }
    }

    dagreGraph.setNode(node.id, { width, height });
  });

  // Add edges to Dagre. Order matters for left-to-right placement in some cases.
  // We want False branches to generally stay on the "main spine" (leftish if we consider right as branching)
  // Dagre often places nodes based on sequence of addition.
  // Let's sort edges so False/Done are added first.
  const sortedEdges = [...edges].sort((a, b) => {
    // False and Loop represent the main spine branch (downwards).
    const aMain = (a.label === "False" || a.label === "Loop");
    const bMain = (b.label === "False" || b.label === "Loop");
    if (aMain && !bMain) return -1;
    if (!aMain && bMain) return 1;
    return 0;
  });

  sortedEdges.forEach((edge) => {
    // Force smoothstep for professional circuit-board look
    edge.type = 'smoothstep';
    edge.style = { ...edge.style, strokeWidth: 2, borderRadius: 20 }; // Smooth corners
    edge.animated = true; // Keep animation

    const edgeConfig = {};

    // Give False/Loop branches more weight to push them straight down
    if (edge.label === "False" || edge.label === "Loop") {
      edgeConfig.weight = 100; // Very high weight keeps it straight down
      edgeConfig.minlen = 1;   // Standard rank drop
    } else if (edge.label === "True" || edge.label === "Done") {
      edgeConfig.weight = 1;  // Low weight allows it to branch off
      edgeConfig.minlen = 1;
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
      xOffset = 70;
      yOffset = 50;
    }
    if (node.type === 'loop') {
      xOffset = 100;
      yOffset = 35;
    }
    if (node.type === 'process') {
      if (!node.data.label) {
        // Invisible dot centering
        xOffset = 0;
        yOffset = 0;
      } else {
        const textLen = node.data.label.length;
        xOffset = Math.min(Math.max(200, textLen * 8), 350) / 2;
        yOffset = Math.max(60, Math.ceil(textLen / 30) * 30 + 40) / 2;
      }
    }
    if (node.type === 'externalCall') {
      xOffset = 110;
      yOffset = 30;
    }

    // Final visibility check for empty nodes
    const style = { ...node.style };
    if (node.type === 'process' && !node.data.label) {
      style.opacity = 0;
      style.width = 1;
      style.height = 1;
    }

    return {
      ...node,
      style,
      position: {
        x: nodeWithPosition.x - xOffset,
        y: nodeWithPosition.y - yOffset,
      },
      // Using handles specified by backend, no global overrides
    };
  });

  return { nodes: layoutedNodes, edges };
};

// ===========================================
// 3. FUNCTION DEPENDENCY GRAPH
// ===========================================
const FuncDepNode = ({ data }) => {
  const cx = data.maxComplexity || data.complexity || 0;
  const isCyclic = !!data.is_cyclic;
  const lang = data.language || 'python';
  const stats = data.stats;

  const [showTooltip, setShowTooltip] = useState(false);

  // Base colors mapping modeled from FileDepNode
  const langColors = {
    python: "#2196f3", java: "#f44336", javascript: "#ffeb3b", typescript: "#2196f3", cpp: "#9c27b0", c: "#9c27b0"
  };

  // Heatmap mode: color by complexity (green → yellow → orange → red)
  const getHeatmapColor = (complexity) => {
    const clamped = Math.min(Math.max(complexity, 0), 15);
    const t = clamped / 15; // 0..1
    if (t < 0.33) return `hsl(${120 - t * 180}, 70%, 45%)`; // green → yellow
    if (t < 0.66) return `hsl(${60 - (t - 0.33) * 180}, 80%, 45%)`; // yellow → orange
    return `hsl(${0}, 85%, ${50 - (t - 0.66) * 30}%)`; // orange → dark red
  };

  const baseColor = data.heatmapMode ? getHeatmapColor(cx) : (langColors[lang] || "#888");

  // If cyclic, force red to indicate danger. Otherwise, keep lang color. 
  // Wait, the prompt says "python should be blue, etc". 
  // Let's use the lang color for the node border, but keep the red badge for cyclicity.
  // Actually, let's keep the existing logic where high complexity turns it red/orange, but base it on language otherwise.
  let borderColor = baseColor;
  if (cx > 10) borderColor = '#f44336';
  else if (cx > 5) borderColor = '#ff9800';

  const activeColor = isCyclic ? '#f44336' : borderColor;

  return (
    <div
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{
        padding: '12px 20px', borderRadius: '12px',
        border: `2px solid ${activeColor}`,
        background: `linear-gradient(135deg, ${activeColor}11, #1e1e1e)`,
        color: '#e0e0e0', fontSize: '0.85rem', fontFamily: 'monospace',
        textAlign: 'center', cursor: 'pointer', minWidth: '120px',
        transition: 'all 0.2s', boxShadow: `0 2px 12px ${activeColor}22`,
        position: 'relative'
      }}>
      {isCyclic && (
        <div style={{
          position: 'absolute', top: -10, right: -10, background: '#f44336', color: '#fff',
          borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
          zIndex: 10
        }} title="Circular Dependency Detected">
          ⚠️
        </div>
      )}

      {/* Hover Tooltip for Connection Stats */}
      {showTooltip && stats && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translate(-50%, -8px)',
          background: 'rgba(0,0,0,0.85)',
          color: '#eee',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '0.7rem',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 1000,
          display: 'flex',
          gap: '10px'
        }}>
          <span>📤 Out: {stats.imports}</span>
          <span style={{ borderLeft: '1px solid #555', paddingLeft: '10px' }}>📥 In: {stats.importedBy}</span>
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid rgba(0,0,0,0.85)'
          }} />
        </div>
      )}

      <Handle type="target" position={Position.Top} style={{ background: activeColor, width: 8, height: 8 }} />
      <div style={{ fontWeight: 700, marginBottom: '2px' }}>{data.label}</div>
      <div style={{ fontSize: '0.6rem', color: activeColor, fontWeight: 600 }}>
        complexity: {cx} | {lang}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: activeColor, width: 8, height: 8 }} />
    </div>
  );
};

const FuncDepGraph = ({ depData, onFuncClick, graphMemory, setGraphMemory, memoryKey, onNodeDoubleClick, searchQuery = '', heatmapMode = false }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const funcDepNodeTypes = useMemo(() => ({ funcDep: FuncDepNode }), []);

  // Compute dagre layout
  const computeLayout = useCallback((depNodes, depEdges) => {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 100, ranksep: 120, marginx: 40, marginy: 40 });

    depNodes.forEach(n => g.setNode(n.id, { width: 160, height: 70 }));
    depEdges.forEach(e => g.setEdge(e.source, e.target));
    dagre.layout(g);

    return depNodes.map(n => {
      const pos = g.node(n.id);
      return { ...n, position: { x: pos.x - 80, y: pos.y - 35 } };
    });
  }, []);

  // Style edges
  const styleEdges = useCallback((depEdges) => {
    return depEdges.map(e => {
      const isCyclic = !!e.data?.is_cyclic;
      const strokeColor = isCyclic ? '#f44336' : '#7c4dff';
      const strokeWidth = isCyclic ? 3 : 2;
      const opacity = isCyclic ? 1 : 0.7;

      return {
        ...e,
        animated: true,
        style: { stroke: strokeColor, strokeWidth, opacity },
        markerEnd: { type: 'arrowclosed', color: strokeColor },
        label: isCyclic ? '⚠️ cycle' : (e.data?.label || 'calls'),
        labelStyle: { fill: isCyclic ? '#f44336' : '#888', fontSize: '0.6rem', fontWeight: isCyclic ? 'bold' : 'normal' },
        labelBgStyle: { fill: '#1e1e1e', fillOpacity: 0.8 },
      };
    });
  }, []);

  useEffect(() => {
    if (!depData || !depData.nodes || depData.nodes.length === 0) return;

    // Compute imports and importedBy counts
    const importsCount = {};
    const importedByCount = {};

    // Count edges
    if (depData.edges) {
      depData.edges.forEach(e => {
        importsCount[e.source] = (importsCount[e.source] || 0) + 1;
        importedByCount[e.target] = (importedByCount[e.target] || 0) + 1;
      });
    }

    // Attach stats to nodes
    const nodesWithStats = depData.nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        stats: {
          imports: importsCount[n.id] || 0,
          importedBy: importedByCount[n.id] || 0
        }
      }
    }));

    const key = memoryKey || 'funcDep';
    const saved = graphMemory?.[key];

    if (saved && saved.nodes) {
      // Restore saved positions
      setNodes(saved.nodes);
      setEdges(saved.edges || styleEdges(depData.edges));
    } else {
      // Fresh dagre layout
      const layoutedNodes = computeLayout(nodesWithStats, depData.edges);
      const styledEdges = styleEdges(depData.edges);
      setNodes(layoutedNodes);
      setEdges(styledEdges);
    }
  }, [depData, memoryKey, graphMemory, setNodes, setEdges, computeLayout, styleEdges]);

  // Search-based highlighting
  useEffect(() => {
    if (!searchQuery) {
      // Reset all nodes to full opacity
      setNodes(nds => nds.map(n => ({ ...n, style: { ...n.style, opacity: 1, transition: 'opacity 0.2s' } })));
      setEdges(eds => eds.map(e => ({ ...e, style: { ...e.style, opacity: e.data?.is_cyclic ? 1 : 0.7 } })));
      return;
    }
    const q = searchQuery.toLowerCase();
    const matchingIds = new Set();
    setNodes(nds => nds.map(n => {
      const label = (n.data?.label || n.id || '').toLowerCase();
      const matches = label.includes(q);
      if (matches) matchingIds.add(n.id);
      return { ...n, style: { ...n.style, opacity: matches ? 1 : 0.12, transition: 'opacity 0.2s' } };
    }));
    setEdges(eds => eds.map(e => ({
      ...e, style: { ...e.style, opacity: (matchingIds.has(e.source) || matchingIds.has(e.target)) ? 0.8 : 0.06 }
    })));
  }, [searchQuery, setNodes, setEdges]);

  // Heatmap mode propagation
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n, data: { ...n.data, heatmapMode }
    })));
  }, [heatmapMode, setNodes]);

  // Save positions when nodes are dragged
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);

    // Save on drag stop
    const hasDragStop = changes.some(c => c.type === 'position' && c.dragging === false);
    if (hasDragStop && setGraphMemory && memoryKey) {
      // Defer to next tick so nodes state is updated
      setTimeout(() => {
        setNodes(currentNodes => {
          setGraphMemory(prev => ({
            ...prev,
            [memoryKey]: { nodes: currentNodes, edges }
          }));
          return currentNodes;
        });
      }, 0);
    }
  }, [onNodesChange, setGraphMemory, memoryKey, setNodes, edges]);

  // Reset layout
  const handleReset = useCallback(() => {
    if (!depData) return;
    const layoutedNodes = computeLayout(depData.nodes, depData.edges);
    const styledEdges = styleEdges(depData.edges);
    setNodes(layoutedNodes);
    setEdges(styledEdges);
    // Clear memory
    if (setGraphMemory && memoryKey) {
      setGraphMemory(prev => {
        const updated = { ...prev };
        delete updated[memoryKey];
        return updated;
      });
    }
  }, [depData, computeLayout, styleEdges, setNodes, setEdges, setGraphMemory, memoryKey]);

  const handleNodeClick = useCallback((event, node) => {
    // Save positions before drilling in
    if (setGraphMemory && memoryKey) {
      setGraphMemory(prev => ({
        ...prev,
        [memoryKey]: { nodes, edges }
      }));
    }
    if (onFuncClick) {
      onFuncClick(node.id);
    }
  }, [onFuncClick, setGraphMemory, memoryKey, nodes, edges]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {nodes.length > 0 ? (
        <>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={(e, node) => onNodeDoubleClick?.(e, node)}
            nodeTypes={funcDepNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
          >
            <Background color="#1e1e1e" gap={20} size={1} />
            <Controls />
          </ReactFlow>
          <button
            onClick={handleReset}
            title="Reset node positions"
            style={{
              position: 'absolute', bottom: 15, left: 55, zIndex: 100, // Bottom-left near zoom controls
              background: '#333', border: '1px solid #555', borderRadius: '6px',
              color: '#aaa', padding: '6px 12px', cursor: 'pointer',
              fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}
          >
            ↻ Reset Layout
          </button>
        </>
      ) : (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#555', textAlign: 'center' }}>
          <p style={{ fontSize: '1.2rem' }}>📊 Function Dependencies</p>
          <p style={{ fontSize: '0.8rem' }}>No dependencies detected</p>
        </div>
      )}
    </div>
  );
};

// ===========================================
// 4. FLOW GRAPH COMPONENT (WITH LAYOUT MEMORY)
// ===========================================
const nodeTypes = {
  terminator: TerminatorNode,
  process: ProcessNode,
  decision: DecisionNode,
  loop: LoopNode,
  externalCall: ({ data }) => {
    return (
      <div style={{
        padding: '10px 16px',
        borderRadius: '8px',
        border: '2px dashed #7c4dff',
        background: 'linear-gradient(135deg, #2d1b69 0%, #1a1a2e 100%)',
        color: '#bb86fc',
        fontSize: '0.75rem',
        fontFamily: 'monospace',
        textAlign: 'center',
        maxWidth: '220px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 0 12px rgba(124, 77, 255, 0.2)',
      }}>
        <Handle type="target" position={Position.Top} style={{ background: '#7c4dff', width: 8, height: 8 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.85rem' }}>📎</span>
          <span style={{ fontWeight: 700 }}>{data.label}</span>
        </div>
        {data.sourceFile && (
          <div style={{ color: 'rgba(187, 134, 252, 0.6)', fontSize: '0.6rem', marginTop: '4px' }}>
            from {data.sourceFile.split('/').pop()}
          </div>
        )}
        <Handle type="source" position={Position.Bottom} style={{ background: '#7c4dff', width: 8, height: 8 }} />
      </div>
    );
  },
};

const FlowGraph = forwardRef(({ data, onNodeClick, graphMemory, setGraphMemory, memoryKey, crossFileData, currentFilePath }, ref) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Expose export functionality to parent
  useImperativeHandle(ref, () => ({
    exportImage: (fileName) => {
      // 1. Calculate bounds from current nodes state (which has measured dimensions)
      if (nodes.length === 0) {
        alert("No graph to export.");
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      nodes.forEach(node => {
        const x = node.position.x;
        const y = node.position.y;
        const w = node.width || 150;
        const h = node.height || 60;

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
      });

      const PADDING = 50;
      const width = (maxX - minX) + PADDING * 2;
      const height = (maxY - minY) + PADDING * 2;

      const selector = '.react-flow__viewport';
      const node = document.querySelector(selector);

      if (!node) return;

      toPng(node, {
        backgroundColor: '#1e1e1e',
        width: width,
        height: height,
        style: {
          width: width,
          height: height,
          transform: `translate(${-minX + PADDING}px, ${-minY + PADDING}px) scale(1)`,
        },
        pixelRatio: 2,
      })
        .then((dataUrl) => {
          const link = document.createElement('a');
          link.download = `codemap-flowchart-${fileName || 'overview'}.png`;
          link.href = dataUrl;
          link.click();
        })
        .catch((err) => {
          console.error('Failed to export image:', err);
          alert('Failed to export. See console.');
        });
    }
  }));

  // Create a unique key based on node IDs to force re-layout when needed
  const graphKey = useMemo(() => {
    if (!data?.nodes || data.nodes.length === 0) return 'empty';
    return data.nodes.map(n => n.id).join('-');
  }, [data]);

  // Calculate  // MEMOIZED LAYOUT
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    // FORCE RECALCULATION (DEBUGGING) - Ignore Cache
    // const cacheKey = `${selectedFile?.name}:${selectedFunction || 'overview'}`;
    // if (layoutCache.current[cacheKey]) {
    //   console.log(`📦 Loading layout from memory: ${cacheKey}`);
    //   return layoutCache.current[cacheKey];
    // }

    if (!data || !data.nodes || data.nodes.length === 0) return { nodes: [], edges: [] };

    console.log(`🔄 Calculating new layout: ${memoryKey || 'unnamed'}`);

    // Transform nodes: mark external calls if crossFileData is available
    let transformedNodes = data.nodes;
    if (crossFileData && crossFileData.calls && currentFilePath) {
      const callsForFile = crossFileData.calls[currentFilePath] || {};
      transformedNodes = data.nodes.map(node => {
        // Check if this process node's label matches an external function call
        if (node.type === 'process' && node.data.label) {
          const label = node.data.label.trim();
          // Try to match function calls like "helper()" or "result = helper(args)"
          for (const [funcName, sourceFile] of Object.entries(callsForFile)) {
            if (label.includes(funcName + '(') || label === funcName) {
              return {
                ...node,
                type: 'externalCall',
                data: { ...node.data, label: funcName + '()', sourceFile }
              };
            }
          }
        }
        return node;
      });
    }

    const layout = getLayoutedElements(transformedNodes, data.edges || []);

    // layoutCache.current[cacheKey] = layout; // Disable saving to cache
    return layout;
  }, [data.nodes, data.edges, memoryKey, crossFileData, currentFilePath]); // Removed graphKey to avoid loops: layout

  // Update React Flow state when layout changes
  useEffect(() => {
    if (layoutedNodes.length > 0) {
      // Check if we have saved positions in graphMemory
      const saved = graphMemory?.[memoryKey];
      if (saved && saved.nodes && saved.nodes.length === layoutedNodes.length) {
        setNodes(saved.nodes);
        setEdges(saved.edges || layoutedEdges);
      } else {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      }
    }
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]); // intentionally exclude graphMemory/memoryKey to avoid re-render loops

  // Save positions when nodes are dragged
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);

    const hasDragStop = changes.some(c => c.type === 'position' && c.dragging === false);
    if (hasDragStop && setGraphMemory && memoryKey) {
      setTimeout(() => {
        setNodes(currentNodes => {
          setEdges(currentEdges => {
            setGraphMemory(prev => ({
              ...prev,
              [memoryKey]: { nodes: currentNodes, edges: currentEdges }
            }));
            return currentEdges;
          });
          return currentNodes;
        });
      }, 0);
    }
  }, [onNodesChange, setGraphMemory, memoryKey, setNodes, setEdges]);

  // Reset to dagre layout
  const handleReset = useCallback(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    if (setGraphMemory && memoryKey) {
      setGraphMemory(prev => {
        const updated = { ...prev };
        delete updated[memoryKey];
        return updated;
      });
    }
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges, setGraphMemory, memoryKey]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background color="#333" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'process') return '#888888'; // Grey for standard statements
            if (n.type === 'decision') return '#ffb74d'; // Orange-ish for decision
            if (n.type === 'loop') return '#2196f3'; // Blue for loop
            if (n.type === 'externalCall') return '#7c4dff'; // Purple for external
            if (n.type === 'terminator') {
              const labelLower = (n.data?.label || '').toLowerCase();
              return labelLower.startsWith('start') ? '#4caf50' : '#ff5252'; // Green for start, Red for return
            }
            return '#555555'; // Fallback
          }}
          nodeStrokeWidth={3}
          style={{
            backgroundColor: '#1e1e1e',
            border: '1px solid #444',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
          }}
          maskColor="rgba(0, 0, 0, 0.4)"
          position="bottom-right"
        />
      </ReactFlow>
      <button
        onClick={handleReset}
        title="Reset node positions"
        style={{
          position: 'absolute', bottom: 15, left: 55, zIndex: 100, // Bottom-left near zoom controls
          background: '#333', border: '1px solid #555', borderRadius: '6px',
          color: '#aaa', padding: '6px 12px', cursor: 'pointer',
          fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
        }}
      >
        ↻ Reset Layout
      </button>
    </div>
  );
});

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
  cpp: { bg: '#513998', border: '#a074c4', text: '#fff', label: 'C++' },
  cc: { bg: '#513998', border: '#a074c4', text: '#fff', label: 'C++' },
  c: { bg: '#283593', border: '#5c6bc0', text: '#fff', label: 'C' },
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
  const isDimmed = data.isDimmed;
  const stats = data.stats || { imports: 0, importedBy: 0 };
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div style={{
      background: isSelected
        ? `linear-gradient(135deg, ${colors.bg}cc, ${colors.bg}99)`
        : `linear-gradient(135deg, ${colors.bg}bb, ${colors.bg}66)`,
      border: `1px solid ${isSelected ? '#4caf50' : colors.border}80`,
      backdropFilter: 'blur(6px)',
      borderRadius: '12px',
      padding: '12px 16px',
      minWidth: '150px',
      textAlign: 'center',
      boxShadow: isSelected
        ? `0 0 20px ${colors.border}66, inset 0 0 10px ${colors.border}33`
        : `0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.1)`,
      transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
      cursor: 'pointer',
      opacity: isDimmed ? 0.2 : 1,
      transform: isDimmed ? 'scale(0.95)' : 'scale(1)',
      position: 'relative',
      zIndex: isSelected || showTooltip ? 10 : 1,
    }}
      className="file-dep-node"
      onMouseEnter={(e) => {
        setShowTooltip(true);
        e.currentTarget.style.transform = isDimmed ? 'scale(0.95)' : 'scale(1.05)';
        e.currentTarget.style.zIndex = 100;
      }}
      onMouseLeave={(e) => {
        setShowTooltip(false);
        e.currentTarget.style.transform = isDimmed ? 'scale(0.95)' : 'scale(1)';
        e.currentTarget.style.zIndex = isSelected ? 10 : 1;
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: colors.border, width: 8, height: 8, opacity: isDimmed ? 0.2 : 1 }} />

      <div style={{
        fontSize: '0.6rem',
        color: colors.border,
        textTransform: 'uppercase',
        fontWeight: 'bold',
        marginBottom: '4px',
        letterSpacing: '1px',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
      }}>
        {colors.label}
      </div>

      <div style={{
        color: '#fff',
        fontSize: '0.9rem',
        fontWeight: isSelected ? '700' : '500',
        wordBreak: 'break-word',
        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
      }}>
        {data.label}
      </div>

      {data.folder && (
        <div style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: '0.65rem',
          marginTop: '4px',
          fontStyle: 'italic',
        }}>
          {data.folder}
        </div>
      )}

      {/* Tooltip */}
      {showTooltip && !isDimmed && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translate(-50%, -8px)',
          background: 'rgba(0,0,0,0.85)',
          color: '#eee',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '0.7rem',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 1000,
          display: 'flex',
          gap: '10px'
        }}>
          <span>📤 Imports: {stats.imports}</span>
          <span style={{ borderLeft: '1px solid #555', paddingLeft: '10px' }}>📥 Used by: {stats.importedBy}</span>
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(0,0,0,0.85)',
          }} />
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: colors.border, width: 8, height: 8, opacity: isDimmed ? 0.2 : 1 }} />
    </div>
  );
};

const fileDepGraphNodeTypes = {
  fileNode: FileDepNode
};

const FileDepGraph = ({ dependencies, fileTree, selectedFile, onFileSelect, graphMemory, setGraphMemory, crossFileData, onNodeDoubleClick, searchQuery = '' }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [hoveredNode, setHoveredNode] = useState(null);

  // Generate a key for current graph structure
  const graphKey = useMemo(() => {
    if (!dependencies?.imports && !dependencies?.importedBy) return 'empty';
    const files = new Set();
    dependencies.imports?.forEach((_, k) => files.add(k));
    dependencies.importedBy?.forEach((_, k) => files.add(k));
    return `file-dep-${Array.from(files).sort().join('|')}`;
  }, [dependencies]);

  // Helper function to update graph styles (dimming/highlighting)
  const updateGraphStyles = useCallback((targetNodeId, currentNodes, currentEdges) => {
    if (!targetNodeId) {
      // Reset all to normal
      setNodes(nds => nds.map(n => ({
        ...n, data: { ...n.data, isDimmed: false, isSelected: n.id === selectedFile }
      })));
      setEdges(eds => eds.map(e => ({
        ...e,
        animated: false,
        style: { ...e.style, opacity: 0.6, strokeWidth: 1.5, stroke: '#4da3ff' },
        zIndex: 0
      })));
      return;
    }

    const connectedNodeIds = new Set([targetNodeId]);
    const connectedEdgeIds = new Set();

    currentEdges.forEach(edge => {
      if (edge.source === targetNodeId) {
        connectedNodeIds.add(edge.target);
        connectedEdgeIds.add(edge.id);
      }
      if (edge.target === targetNodeId) {
        connectedNodeIds.add(edge.source);
        connectedEdgeIds.add(edge.id);
      }
    });

    setEdges(currentEdges.map(edge => {
      const isConnected = connectedEdgeIds.has(edge.id);
      return {
        ...edge,
        animated: isConnected,
        style: {
          ...edge.style,
          opacity: isConnected ? 1 : 0.1,
          strokeWidth: isConnected ? 2.5 : 1.5,
          stroke: isConnected ? '#4caf50' : '#4da3ff'
        },
        zIndex: isConnected ? 10 : 0
      };
    }));

    setNodes(currentNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        isDimmed: !connectedNodeIds.has(n.id),
        isSelected: n.id === selectedFile // Keep selection state
      }
    })));
  }, [selectedFile, setNodes, setEdges]);


  // 1. Structure & Layout Effect
  useEffect(() => {
    if (!dependencies) return;

    const allFiles = new Set();
    dependencies.imports?.forEach((deps, file) => {
      allFiles.add(file);
      deps.forEach(d => allFiles.add(d));
    });
    dependencies.importedBy?.forEach((importers, file) => {
      allFiles.add(file);
      importers.forEach(i => allFiles.add(i));
    });

    if (allFiles.size === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Check memory first
    if (graphMemory && graphMemory[graphKey]) {
      console.log(`📦 Loading file graph layout from memory: ${graphKey}`);
      const savedData = graphMemory[graphKey];
      setNodes(savedData.nodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          isSelected: n.id === selectedFile,
          isDimmed: false,
          // stats might be missing in old memory, update them
          stats: {
            imports: dependencies.imports?.get(n.id)?.length || 0,
            importedBy: dependencies.importedBy?.get(n.id)?.length || 0
          }
        }
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
      const importsCount = dependencies.imports?.get(filePath)?.length || 0;
      const importedByCount = dependencies.importedBy?.get(filePath)?.length || 0;

      return {
        id: filePath,
        type: 'fileNode',
        data: {
          label: fileName,
          folder: folderPath || null,
          colors,
          isSelected: filePath === selectedFile,
          isDimmed: false,
          stats: { imports: importsCount, importedBy: importedByCount }
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
          style: { stroke: '#4da3ff', strokeWidth: 1.5, opacity: 0.6 },
          markerEnd: { type: 'arrowclosed', color: '#4da3ff' },
          label: (() => {
            // Show function names from crossFileData if available
            if (crossFileData && crossFileData.calls) {
              const calls = crossFileData.calls[sourceFile] || {};
              const funcsFromTarget = Object.entries(calls)
                .filter(([, src]) => src === targetFile)
                .map(([name]) => name);
              if (funcsFromTarget.length > 0) {
                return funcsFromTarget.length <= 3
                  ? funcsFromTarget.join(', ')
                  : funcsFromTarget.slice(0, 2).join(', ') + ` +${funcsFromTarget.length - 2}`;
              }
            }
            return 'imports';
          })(),
          labelStyle: { fill: '#aaa', fontSize: '0.6rem', fontFamily: 'monospace' },
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
      g.setNode(node.id, { width: 170, height: 80 });
    });

    newEdges.forEach(edge => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    const layoutedNodes = newNodes.map(node => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: { x: pos.x - 85, y: pos.y - 40 },
      };
    });

    setNodes(layoutedNodes);
    setEdges(newEdges);

    if (setGraphMemory) {
      setGraphMemory(prev => ({
        ...prev,
        [graphKey]: { nodes: layoutedNodes, edges: newEdges }
      }));
    }
  }, [graphKey, dependencies, setGraphMemory, graphMemory, selectedFile, crossFileData]); // crossFileData added for edge labels

  // 2. Selection & Sticky Focus Logic
  useEffect(() => {
    // Apply focus/dimming based on selectedFile
    // This effect runs when nodes/edges are initialized or selectedFile changes.
    // We need to ensure nodes and edges are available.
    if (nodes.length > 0 && edges.length > 0) {
      updateGraphStyles(selectedFile, nodes, edges);
    } else if (!selectedFile) {
      // If no selected file and no nodes/edges, ensure reset
      setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, isDimmed: false, isSelected: false } })));
      setEdges(eds => eds.map(e => ({ ...e, animated: false, style: { ...e.style, opacity: 0.6, strokeWidth: 1.5, stroke: '#4da3ff' }, zIndex: 0 })));
    }
  }, [selectedFile, nodes.length, edges.length, updateGraphStyles]); // Depend on nodes/edges length to trigger after layout

  // 2b. Search-based highlighting
  useEffect(() => {
    if (!searchQuery) return; // let selection logic handle normal state
    const q = searchQuery.toLowerCase();
    const matchingIds = new Set();
    setNodes(nds => nds.map(n => {
      const label = (n.data?.label || n.id || '').toLowerCase();
      const matches = label.includes(q);
      if (matches) matchingIds.add(n.id);
      return { ...n, data: { ...n.data, isDimmed: !matches, isSelected: n.id === selectedFile } };
    }));
    setEdges(eds => eds.map(e => ({
      ...e, style: { ...e.style, opacity: (matchingIds.has(e.source) || matchingIds.has(e.target)) ? 0.8 : 0.06 }
    })));
  }, [searchQuery, setNodes, setEdges, selectedFile]);

  // 3. Drag Persistence
  const onNodeDragStop = useCallback((event, node) => {
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

  const onPaneClick = useCallback(() => {
    // Clear selection on background click
    if (onFileSelect) onFileSelect(null, null); // Clear selection
  }, [onFileSelect]);

  // Handle Hover - Highlight connections and dim others
  const handleNodeMouseEnter = useCallback((event, node) => {
    setHoveredNode(node.id);
    updateGraphStyles(node.id, nodes, edges);
  }, [nodes, edges, updateGraphStyles]);

  const handleNodeMouseLeave = useCallback((event, node) => {
    setHoveredNode(null);
    // Revert to selectedFile focus, or clear all if no selectedFile
    updateGraphStyles(selectedFile, nodes, edges);
  }, [selectedFile, nodes, edges, updateGraphStyles]);

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
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          onNodeDoubleClick={(e, node) => onNodeDoubleClick?.(e, node)}
          nodeTypes={fileDepGraphNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
        >
          <Background color="#1e1e1e" gap={20} size={1} />
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState("split");
  const [currentFuncsMap, setCurrentFuncsMap] = useState({});
  const currentFunc = currentFuncsMap[sidebarView] || null;
  const setCurrentFunc = useCallback((val) => {
    setCurrentFuncsMap(prev => ({ ...prev, [sidebarView]: typeof val === 'function' ? val(prev[sidebarView]) : val }));
  }, [sidebarView]);

  // Panel widths (resizable)
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [codePaneWidth, setCodePaneWidth] = useState(40); // percentage
  const [rightPanelWidth, setRightPanelWidth] = useState(260);
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const pendingCrossFileAnalysis = useRef(null); // { filePath, funcName }
  const dragRef = useRef(null); // { type, startX, startValue }

  // Drag handler
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragRef.current) return;
      e.preventDefault();
      const { type, startX, startValue } = dragRef.current;
      const delta = e.clientX - startX;

      if (type === 'sidebar') {
        setSidebarWidth(Math.max(150, Math.min(500, startValue + delta)));
      } else if (type === 'codepane') {
        const container = containerRef.current;
        if (!container) return;
        const totalWidth = container.getBoundingClientRect().width;
        const newPct = startValue + (delta / totalWidth) * 100;
        setCodePaneWidth(Math.max(20, Math.min(80, newPct)));
      } else if (type === 'rightpanel') {
        setRightPanelWidth(Math.max(180, Math.min(500, startValue - delta)));
      }
    };
    const handleMouseUp = () => {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startDrag = (type, startValue) => (e) => {
    e.preventDefault();
    dragRef.current = { type, startX: e.clientX, startValue };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  // 1. FILE SYSTEM STATE (Explorer) - Now using tree structure
  const [fileTree, setFileTree] = useState(DEFAULT_FILE_TREE);
  const [selectedFilePath, setSelectedFilePath] = useState("src/main.py"); // Full path like 'src/main.py'

  // 2. SNIPPET STATE (Universal Snippet Library)
  const [snippets, setSnippets] = useState(loadSnippets);
  const [activeSnippetId, setActiveSnippetId] = useState(() => {
    const loaded = loadSnippets();
    return loaded.length > 0 ? loaded[0].id : null;
  });
  const [renamingSnippetId, setRenamingSnippetId] = useState(null);

  // Derived: active snippet object
  const activeSnippet = useMemo(() => {
    return snippets.find(s => s.id === activeSnippetId) || null;
  }, [snippets, activeSnippetId]);

  // Persist snippets to localStorage whenever they change
  useEffect(() => {
    saveSnippets(snippets);
  }, [snippets]);

  // Clear analysis when switching snippets (prevent stale graph)
  useEffect(() => {
    if (sidebarView === "snippets") {
      setAnalysisResult(null);
      setCurrentFunc(null);
    }
  }, [activeSnippetId]);

  // Backend State
  const [analysisResultsMap, setAnalysisResultsMap] = useState({});
  const analysisResult = analysisResultsMap[sidebarView] || null;
  const setAnalysisResult = useCallback((val) => {
    setAnalysisResultsMap(prev => ({ ...prev, [sidebarView]: typeof val === 'function' ? val(prev[sidebarView]) : val }));
  }, [sidebarView]);
  const [loading, setLoading] = useState(false);
  const [analysisCache, setAnalysisCache] = useState({}); // filePath -> { result, func }

  // Project Blueprint state
  const [blueprintTree, setBlueprintTree] = useState(null);
  const [blueprintLoading, setBlueprintLoading] = useState(false);
  const [blueprintData, setBlueprintData] = useState(null); // { dep_graph, file_info, project_stats }
  const [blueprintSelectedFile, setBlueprintSelectedFile] = useState(null);
  const [blueprintFlowchartFile, setBlueprintFlowchartFile] = useState(null); // Which file is currently being drilled down into

  // Compute blueprint insights
  const blueprintInsights = useMemo(() => {
    if (!blueprintData?.dep_graph) return null;
    const { nodes, edges } = blueprintData.dep_graph;

    const importedByCount = {};
    const importsCount = {};

    nodes.forEach(n => {
      importedByCount[n.id] = 0;
      importsCount[n.id] = 0;
    });

    edges.forEach(e => {
      if (importedByCount[e.target] !== undefined) importedByCount[e.target]++;
      if (importsCount[e.source] !== undefined) importsCount[e.source]++;
    });

    let mostImported = null;
    let maxCount = -1;
    let isolatedCount = 0;

    nodes.forEach(n => {
      const inCount = importedByCount[n.id];
      const outCount = importsCount[n.id];

      if (inCount > maxCount) {
        maxCount = inCount;
        mostImported = { file: n.data?.label || n.id, count: inCount };
      }

      if (inCount === 0 && outCount === 0) {
        isolatedCount++;
      }
    });

    const cyclesCount = nodes.filter(n => n.data?.is_cyclic).length;

    return {
      mostImported: maxCount > 0 ? mostImported : null,
      isolatedCount,
      cyclesCount
    };
  }, [blueprintData]);

  // 3. GITHUB STATE
  const [repoInput, setRepoInput] = useState(() => localStorage.getItem('lastRepoInput') || '');
  useEffect(() => {
    localStorage.setItem('lastRepoInput', repoInput);
  }, [repoInput]);

  const [githubTree, setGithubTree] = useState(null);
  const [githubRepoInfo, setGithubRepoInfo] = useState(null); // { owner, repo, branch }
  const [githubFileContent, setGithubFileContent] = useState('');
  const [githubSelectedFile, setGithubSelectedFile] = useState(null);
  const [githubLoadingRepo, setGithubLoadingRepo] = useState(false);
  const [githubLoadingFile, setGithubLoadingFile] = useState(null);
  const [githubError, setGithubError] = useState(null);
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem('codemap_github_token') || '');
  const [githubRateInfo, setGithubRateInfo] = useState(null); // { remaining, limit, reset }

  // GitHub Blueprint state (mirrors Blueprint pattern)
  const [githubBlueprintData, setGithubBlueprintData] = useState(null); // { dep_graph, file_info, project_stats }
  const [githubBlueprintLoading, setGithubBlueprintLoading] = useState(false);
  const [githubFlowchartFile, setGithubFlowchartFile] = useState(null);
  const [githubReadmeHtml, setGithubReadmeHtml] = useState(null);
  const [githubFileCommits, setGithubFileCommits] = useState([]); // recent commits for selected file
  const [showGithubPopup, setShowGithubPopup] = useState(false);
  const [githubQuickStats, setGithubQuickStats] = useState(null);
  const [githubFilesHeight, setGithubFilesHeight] = useState(200);

  // Drag handler for Analyzed Files section height (direction: 1 for bottom border, -1 for top border)
  const startGithubFilesDrag = useCallback((e, direction) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = githubFilesHeight;

    const handleMouseMove = (moveEvent) => {
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.max(50, Math.min(800, startHeight + delta * direction));
      setGithubFilesHeight(newHeight);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [githubFilesHeight]);

  // Load GitHub repo
  const handleLoadRepo = async () => {
    const parsed = parseRepoInput(repoInput);
    if (!parsed) { setGithubError('Invalid format. Use owner/repo or a GitHub URL.'); return; }
    setGithubLoadingRepo(true);
    setGithubError(null);
    setGithubTree(null);
    setGithubSelectedFile(null);
    setGithubFileContent('');
    setAnalysisResult(null);
    setCurrentFunc(null);
    setGithubBlueprintData(null);
    setGithubFlowchartFile(null);
    try {
      const token = githubToken || null;
      const branch = await fetchDefaultBranch(parsed.owner, parsed.repo, token);
      const tree = await fetchRepoTree(parsed.owner, parsed.repo, branch, token);
      setGithubRepoInfo({ ...parsed, branch });
      setGithubTree(tree);
      // Check rate limit
      try { const rl = await checkRateLimit(token); setGithubRateInfo(rl); } catch (e) { /* ignore */ }

      // Compute quick stats from the tree for the popup
      const codeExts = ['py', 'java', 'js', 'jsx', 'ts', 'tsx', 'cpp', 'cc', 'c', 'h', 'hpp', 'cs', 'go', 'rs', 'rb'];
      const langMap = { py: 'Python', java: 'Java', js: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', cpp: 'C++', cc: 'C++', c: 'C', h: 'C/C++', hpp: 'C++', cs: 'C#', go: 'Go', rs: 'Rust', rb: 'Ruby' };
      let totalFiles = 0, codeFiles = 0, totalSize = 0;
      const langBreakdown = {};
      const collectStats = (node) => {
        if (node.type === 'file') {
          totalFiles++;
          const ext = node.name.split('.').pop()?.toLowerCase();
          if (codeExts.includes(ext)) {
            codeFiles++;
            const lang = langMap[ext] || ext;
            langBreakdown[lang] = (langBreakdown[lang] || 0) + 1;
          }
          if (node._ghSize) totalSize += node._ghSize;
        } else if (node.type === 'folder' && node.children) {
          Object.values(node.children).forEach(collectStats);
        }
      };
      collectStats(tree);
      setGithubQuickStats({ totalFiles, codeFiles, totalSize, langBreakdown, owner: parsed.owner, repo: parsed.repo, branch });
      // Fetch README in parallel (non-blocking)
      fetchReadme(parsed.owner, parsed.repo, token).then(html => setGithubReadmeHtml(html)).catch(() => setGithubReadmeHtml(null));
      setShowGithubPopup(true);
    } catch (err) {
      setGithubError(err.message);
    } finally {
      setGithubLoadingRepo(false);
    }
  };

  // GitHub dependency state
  const [githubDependencies, setGithubDependencies] = useState({ imports: new Map(), importedBy: new Map() });

  // Handle GitHub file selection
  const handleGithubFileSelect = async (filePath, node) => {
    if (!githubRepoInfo || !node?._ghPath) return;
    setGithubSelectedFile(filePath);
    setGithubLoadingFile(true);
    setAnalysisResult(null);
    setCurrentFunc(null);
    try {
      const content = await fetchFileContent(githubRepoInfo.owner, githubRepoInfo.repo, node._ghPath, githubToken || null);
      setGithubFileContent(content);
      setGithubLoadingFile(null);
      // Fetch recent commits for this file (non-blocking)
      fetchFileCommits(githubRepoInfo.owner, githubRepoInfo.repo, node._ghPath, githubToken || null)
        .then(commits => setGithubFileCommits(commits))
        .catch(() => setGithubFileCommits([]));

      // Inject content into the tree node for dependency scanning
      setGithubTree(prev => {
        if (!prev) return prev;
        const updated = JSON.parse(JSON.stringify(prev));
        const parts = filePath.split('/');
        let current = updated;
        for (const part of parts) {
          if (current.children && current.children[part]) {
            current = current.children[part];
          }
        }
        if (current && current.type === 'file') {
          current.content = content;
        }
        // Re-scan dependencies with updated tree
        const deps = scanTreeDependencies(updated);
        setGithubDependencies(deps);
        return updated;
      });
    } catch (err) {
      setGithubFileContent(`// Error loading file: ${err.message}`);
      setGithubLoadingFile(null);
    }
  };

  // Batch-analyze GitHub repo
  const handleAnalyzeGithubRepo = async () => {
    if (!githubTree || !githubRepoInfo) return;
    setGithubBlueprintLoading(true);
    setShowGithubPopup(false);
    try {
      // Collect all code files from tree, fetch their content
      const codeExts = ['py', 'java', 'js', 'jsx', 'ts', 'tsx', 'cpp', 'cc', 'c', 'h', 'hpp', 'cs', 'go', 'rs', 'rb'];
      const codeFiles = [];
      const collectCodeFiles = (node, path) => {
        if (node.type === 'file') {
          const ext = node.name.split('.').pop()?.toLowerCase();
          if (codeExts.includes(ext)) {
            codeFiles.push({ path, ghPath: node._ghPath || path, content: node.content });
          }
        } else if (node.type === 'folder' && node.children) {
          Object.entries(node.children).forEach(([name, child]) => {
            collectCodeFiles(child, path ? `${path}/${name}` : name);
          });
        }
      };
      collectCodeFiles(githubTree, '');

      // Fetch content for files that don't have it yet
      const filesToFetch = codeFiles.filter(f => !f.content);
      if (filesToFetch.length > 0) {
        const batchSize = 5; // Fetch 5 files at a time to avoid rate limits
        for (let i = 0; i < filesToFetch.length; i += batchSize) {
          const batch = filesToFetch.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map(f => fetchFileContent(githubRepoInfo.owner, githubRepoInfo.repo, f.ghPath, githubToken || null).catch(() => ''))
          );
          batch.forEach((f, idx) => { f.content = results[idx]; });
        }
      }

      // POST to analyze-project
      const projectFiles = codeFiles.filter(f => f.content).map(f => ({ path: f.path, content: f.content }));
      if (projectFiles.length > 0) {
        const res = await axios.post('http://127.0.0.1:8000/analyze-project', { files: projectFiles });
        if (!res.data.error) {
          setGithubBlueprintData(res.data);
          // Inject fetched content back into the tree so double-click can find it
          setGithubTree(prev => {
            if (!prev) return prev;
            const updated = JSON.parse(JSON.stringify(prev));
            for (const file of codeFiles) {
              if (!file.content) continue;
              const parts = file.path.split('/').filter(Boolean);
              let current = updated;
              for (const part of parts) {
                if (current?.children?.[part]) current = current.children[part];
                else { current = null; break; }
              }
              if (current && current.type === 'file') {
                current.content = file.content;
              }
            }
            return updated;
          });
        } else {
          alert('Analysis error: ' + res.data.error);
        }
      }
    } catch (err) {
      console.error('GitHub batch analysis failed:', err);
      alert('Failed to analyze repository.');
    } finally {
      setGithubBlueprintLoading(false);
    }
  };

  // GitHub insights (same logic as blueprintInsights)
  const githubInsights = useMemo(() => {
    if (!githubBlueprintData?.dep_graph) return null;
    const { nodes, edges } = githubBlueprintData.dep_graph;
    const importedByCount = {};
    const importsCount = {};
    nodes.forEach(n => { importedByCount[n.id] = 0; importsCount[n.id] = 0; });
    edges.forEach(e => {
      if (importedByCount[e.target] !== undefined) importedByCount[e.target]++;
      if (importsCount[e.source] !== undefined) importsCount[e.source]++;
    });
    let mostImported = null, maxCount = -1, isolatedCount = 0;
    nodes.forEach(n => {
      const inCount = importedByCount[n.id];
      const outCount = importsCount[n.id];
      if (inCount > maxCount) { maxCount = inCount; mostImported = { file: n.data?.label || n.id, count: inCount }; }
      if (inCount === 0 && outCount === 0) isolatedCount++;
    });
    const cyclesCount = nodes.filter(n => n.data?.is_cyclic).length;
    return { mostImported: maxCount > 0 ? mostImported : null, isolatedCount, cyclesCount };
  }, [githubBlueprintData]);

  // GitHub dep data for FuncDepGraph (same as blueprintDepData)
  const githubDepData = useMemo(() => {
    if (!githubBlueprintData?.dep_graph) return null;
    return {
      nodes: githubBlueprintData.dep_graph.nodes.map(n => ({
        ...n,
        type: 'funcDep',
        data: {
          label: n.data.label,
          complexity: n.data.maxComplexity || 0,
          language: n.data.language,
          is_cyclic: n.data.is_cyclic
        }
      })),
      edges: githubBlueprintData.dep_graph.edges.map(e => ({ ...e, source: e.source, target: e.target })),
    };
  }, [githubBlueprintData]);

  // 4. GRAPH LAYOUT MEMORY STATE
  const [graphMemory, setGraphMemory] = useState({});
  const [graphSearchQuery, setGraphSearchQuery] = useState('');
  const [heatmapMode, setHeatmapMode] = useState(false);

  // AI Explanation state
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('codemap_gemini_key') || '');
  const [aiExplanationsMap, setAiExplanationsMap] = useState({});
  const aiExplanation = aiExplanationsMap[sidebarView] || null;
  const setAiExplanation = useCallback((val) => {
    setAiExplanationsMap(prev => ({ ...prev, [sidebarView]: typeof val === 'function' ? val(prev[sidebarView]) : val }));
  }, [sidebarView]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState(null); // null | 'ok' | 'error'

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

  // Cross-file analysis state
  const [crossFileData, setCrossFileData] = useState(null);

  // Auto-run cross-file analysis when dependencies change
  useEffect(() => {
    const runCrossFileAnalysis = async () => {
      // Collect all files with content from the tree
      const files = [];
      const collectFiles = (node, path) => {
        if (node.type === 'file' && node.content) {
          files.push({ path, content: node.content });
        } else if (node.type === 'folder' && node.children) {
          for (const [name, child] of Object.entries(node.children)) {
            collectFiles(child, path ? `${path}/${name}` : name);
          }
        }
      };
      collectFiles(fileTree, '');

      if (files.length < 2) {
        setCrossFileData(null);
        return;
      }

      try {
        const response = await axios.post('http://127.0.0.1:8000/analyze-multi', { files });
        if (response.data && !response.data.error) {
          setCrossFileData(response.data);
          console.log('📊 Cross-file analysis:', response.data);
        }
      } catch (err) {
        console.warn('Cross-file analysis unavailable:', err.message);
      }
    };

    runCrossFileAnalysis();
  }, [fileTree]);

  // Initialize Gemini API key on mount if saved
  useEffect(() => {
    const savedKey = localStorage.getItem('codemap_gemini_key');
    if (savedKey) {
      axios.post('http://127.0.0.1:8000/set-api-key', { api_key: savedKey })
        .then(res => {
          if (res.data.status === 'ok') setApiKeyStatus('ok');
          else setApiKeyStatus('error');
        })
        .catch(() => setApiKeyStatus('error'));
    }
  }, []);

  // Save API key handler
  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      const res = await axios.post('http://127.0.0.1:8000/set-api-key', { api_key: apiKeyInput.trim() });
      if (res.data.status === 'ok') {
        localStorage.setItem('codemap_gemini_key', apiKeyInput.trim());
        setGeminiApiKey(apiKeyInput.trim());
        setApiKeyStatus('ok');
        setShowApiKeyModal(false);
      } else {
        setApiKeyStatus('error');
      }
    } catch {
      setApiKeyStatus('error');
    }
  };

  // Explain code handler
  const handleExplain = async () => {
    if (!geminiApiKey) {
      setShowApiKeyModal(true);
      return;
    }
    const code = sidebarView === 'explorer' ? currentFileContent : sidebarView === 'github' ? githubFileContent : activeSnippet?.content;
    if (!code) return;

    const lang = sidebarView === 'explorer'
      ? (activeFileName?.split('.').pop() || 'python')
      : sidebarView === 'github'
        ? (githubSelectedFile?.split('.').pop() || 'python')
        : (activeSnippet?.language || 'python');

    setAiLoading(true);
    setAiExplanation(null);
    try {
      const res = await axios.post('http://127.0.0.1:8000/explain', {
        code,
        language: lang,
        function_name: currentFunc || null,
      });
      if (res.data.error) {
        setAiExplanation('⚠️ ' + res.data.error);
      } else {
        setAiExplanation(res.data.explanation);
      }
    } catch (err) {
      setAiExplanation('⚠️ Failed to connect to AI service.');
    } finally {
      setAiLoading(false);
    }
  };

  // --- ACTIONS ---

  // Handle file selection from FileExplorer
  const handleFileSelect = useCallback((path, content) => {
    // Cache current analysis before switching
    if (selectedFilePath && analysisResult) {
      setAnalysisCache(prev => ({
        ...prev,
        [selectedFilePath]: { result: analysisResult, func: currentFunc }
      }));
    }
    setSelectedFilePath(path);
    setCurrentFunc(null);
    setAiExplanation(null);
    // Restore cached analysis if available
    setAnalysisResult(prev => {
      const cached = analysisCache[path];
      if (cached) {
        // Restore function too, but only after a tick
        setTimeout(() => setCurrentFunc(cached.func), 0);
        return cached.result;
      }
      return null;
    });
  }, [selectedFilePath, analysisResult, currentFunc, analysisCache]);

  // Effect: auto-analyze when a cross-file navigation is pending
  useEffect(() => {
    if (pendingCrossFileAnalysis.current && currentFileContent) {
      const { filePath, funcName } = pendingCrossFileAnalysis.current;
      if (filePath === selectedFilePath) {
        pendingCrossFileAnalysis.current = null;
        // Small delay to let React finish rendering the new file
        setTimeout(() => {
          handleAnalyze(funcName);
        }, 100);
      }
    }
  }, [selectedFilePath, currentFileContent]);

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
        } // Close for-of loop over fileData

        // Auto-analyze exactly like the standalone button does
        if (sidebarView === "blueprint") {
          const filesArray = [];
          for (const { path, content } of fileData) {
            filesArray.push({ path, content });
          }
          if (filesArray.length > 0) {
            setBlueprintLoading(true);
            axios.post('http://127.0.0.1:8000/analyze-project', { files: filesArray })
              .then(res => {
                if (res.data && !res.data.error) {
                  setBlueprintData(res.data);
                } else {
                  alert("Project analysis error: " + (res.data?.error || "Unknown"));
                }
              })
              .catch(err => {
                console.error("Analysis failed:", err);
                alert("Failed to analyze project.");
              })
              .finally(() => setBlueprintLoading(false));
          }
        }

        return newTree;
      }); // Close setFileTree

    } catch (error) { // Close try block started at handleUploadZip
      console.error('ZIP extraction failed:', error);
      alert('Failed to extract ZIP file. Make sure it\'s a valid ZIP.');
    }
  }, [sidebarView]); // Close handleUploadZip

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
      // Update active snippet content
      if (activeSnippetId) {
        setSnippets(prev => prev.map(s =>
          s.id === activeSnippetId ? { ...s, content: newContent } : s
        ));
        // Clear graph memory for this snippet
        setGraphMemory(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            if (key.startsWith(`snippet-${activeSnippetId}:`)) {
              delete updated[key];
            }
          });
          return updated;
        });
      }
    }
  };

  // Generate memory key for current graph
  const getMemoryKey = () => {
    if (sidebarView === "explorer") {
      return currentFunc
        ? `${selectedFilePath}:${currentFunc}`
        : `${selectedFilePath}:overview`;
    } else {
      const sid = activeSnippetId || 'none';
      return currentFunc
        ? `snippet-${sid}:${currentFunc}`
        : `snippet-${sid}:overview`;
    }
  };

  // --- SNIPPET ACTIONS ---
  const handleCreateSnippet = () => {
    const newId = `snippet-${Date.now()}`;
    const newSnippet = {
      id: newId,
      name: `Untitled ${snippets.length + 1}`,
      language: "python",
      content: `# New Snippet\n# Write your code here\n`
    };
    setSnippets(prev => [...prev, newSnippet]);
    setActiveSnippetId(newId);
  };

  const handleDeleteSnippet = (id) => {
    if (snippets.length <= 1) return; // Keep at least one
    setSnippets(prev => {
      const updated = prev.filter(s => s.id !== id);
      if (activeSnippetId === id) {
        setActiveSnippetId(updated[0]?.id || null);
      }
      return updated;
    });
  };

  const handleRenameSnippet = (id, newName) => {
    if (!newName.trim()) return;
    setSnippets(prev => prev.map(s =>
      s.id === id ? { ...s, name: newName.trim() } : s
    ));
    setRenamingSnippetId(null);
  };

  const handleChangeSnippetLanguage = (newLang) => {
    if (!activeSnippetId) return;
    setSnippets(prev => prev.map(s =>
      s.id === activeSnippetId ? { ...s, language: newLang } : s
    ));
    // Clear graph memory since language changed
    setGraphMemory(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        if (key.startsWith(`snippet-${activeSnippetId}:`)) {
          delete updated[key];
        }
      });
      return updated;
    });
  };

  // Overwrites the ACTIVE file with the CURRENT Snippet buffer
  const handleLoadSnippet = () => {
    if (!activeSnippet) return;
    if (window.confirm(`Overwrite '${activeFileName}' with snippet '${activeSnippet.name}'?`)) {
      setFileTree(prev => setFileContent(prev, selectedFilePath, activeSnippet.content));
      setSidebarView("explorer");
    }
  };

  // --- ANALYSIS ---
  const handleAnalyze = async (specificFunction = null) => {
    // 1. Determine Language Logic
    let codeToSend = "";
    let langToSend = "python";

    if (sidebarView === "explorer") {
      if (!currentFileContent) return;
      codeToSend = currentFileContent;

      // Auto-detect language from extension
      if (activeFileName.endsWith(".py")) langToSend = "python";
      else if (activeFileName.endsWith(".java")) langToSend = "java";
      else if (activeFileName.endsWith(".js") || activeFileName.endsWith(".jsx")) langToSend = "javascript";
      else if (activeFileName.endsWith(".ts") || activeFileName.endsWith(".tsx")) langToSend = "typescript";
      else if (activeFileName.endsWith(".cpp") || activeFileName.endsWith(".cc")) langToSend = "cpp";
      else if (activeFileName.endsWith(".c")) langToSend = "c";

    } else if (sidebarView === "github") {
      if (!githubFileContent || !githubSelectedFile) return;
      codeToSend = githubFileContent;
      const fn = githubSelectedFile.split('/').pop() || '';
      if (fn.endsWith('.py')) langToSend = 'python';
      else if (fn.endsWith('.java')) langToSend = 'java';
      else if (fn.endsWith('.js') || fn.endsWith('.jsx')) langToSend = 'javascript';
      else if (fn.endsWith('.ts') || fn.endsWith('.tsx')) langToSend = 'typescript';
      else if (fn.endsWith('.cpp') || fn.endsWith('.cc')) langToSend = 'cpp';
      else if (fn.endsWith('.c')) langToSend = 'c';

    } else if (sidebarView === "blueprint") {
      const targetPath = blueprintFlowchartFile || blueprintSelectedFile;
      if (!targetPath || !blueprintTree) return;
      const content = getFileContent(blueprintTree, targetPath);
      if (!content) return;
      codeToSend = content;
      const fn = targetPath.split('/').pop() || '';
      if (fn.endsWith('.py')) langToSend = 'python';
      else if (fn.endsWith('.java')) langToSend = 'java';
      else if (fn.endsWith('.js') || fn.endsWith('.jsx')) langToSend = 'javascript';
      else if (fn.endsWith('.ts') || fn.endsWith('.tsx')) langToSend = 'typescript';
      else if (fn.endsWith('.cpp') || fn.endsWith('.cc')) langToSend = 'cpp';
      else if (fn.endsWith('.c')) langToSend = 'c';

    } else {
      // Use active snippet's language and content
      if (!activeSnippet) return;
      langToSend = activeSnippet.language;
      codeToSend = activeSnippet.content;
    }

    setLoading(true);

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
      const newResult = response.data;

      // Preserve func_dep_graph from whole-file analysis when drilling into a function
      if (specificFunction && analysisResult?.func_dep_graph && !newResult.func_dep_graph) {
        newResult.func_dep_graph = analysisResult.func_dep_graph;
      }

      setAnalysisResult(newResult);
      setAiExplanation(null);

      // Cache the result
      const cacheKey = sidebarView === 'explorer' ? selectedFilePath :
        sidebarView === 'blueprint' ? (blueprintFlowchartFile || blueprintSelectedFile) :
          `snippet-${activeSnippetId}`;
      if (cacheKey) {
        setAnalysisCache(prev => ({
          ...prev,
          [cacheKey]: { result: newResult, func: specificFunction || null }
        }));
      }

    } catch (error) {
      console.error("Analysis failed:", error);
      alert("Backend error. Is Port 8000 running?");
    } finally {
      setLoading(false);
    }
  };

  const onGraphNodeClick = (event, node) => {
    // Check if this is an external call node - navigate cross-file
    if (node.type === 'externalCall' && node.data.sourceFile) {
      const funcName = node.data.label.replace(/\(\)$/, ''); // Strip trailing ()
      // Set pending analysis, then navigate to the file
      pendingCrossFileAnalysis.current = { filePath: node.data.sourceFile, funcName };
      handleFileSelect(node.data.sourceFile, null);
      return;
    }

    if (!currentFunc && analysisResult?.functions?.names.includes(node.data.label)) {
      handleAnalyze(node.data.label);
    }
  };

  const blueprintDepData = useMemo(() => {
    if (!blueprintData?.dep_graph) return null;
    return {
      nodes: blueprintData.dep_graph.nodes.map(n => ({
        ...n,
        type: 'funcDep',
        data: {
          label: n.data.label,
          complexity: n.data.maxComplexity || 0,
          language: n.data.language,
          is_cyclic: n.data.is_cyclic
        }
      })),
      edges: blueprintData.dep_graph.edges.map(e => ({
        ...e,
        source: e.source,
        target: e.target,
      })),
    };
  }, [blueprintData]);

  // Export Graph JSON
  const handleExportGraph = () => {
    if (!analysisResult || !analysisResult.graph_data) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(analysisResult.graph_data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `codemap_flow_${currentFunc || 'graph'}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Export Graph PNG (FIXED: Captures Entire Graph using Ref)
  const handleDownloadImage = () => {
    if (graphRef.current) {
      graphRef.current.exportImage(currentFunc);
    }
  };

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
  }, []);

  return (
    <div ref={containerRef} style={{ display: "flex", height: "100vh", backgroundColor: "#1e1e1e", color: "#d4d4d4", fontFamily: "Segoe UI, sans-serif" }}>

      {/* 1. ACTIVITY BAR */}
      <div style={{ width: "50px", background: "#333", display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: "25px" }}>

        <div
          onClick={() => { setSidebarView("explorer"); setSidebarCollapsed(false); }}
          style={{ cursor: "pointer", borderLeft: sidebarView === "explorer" ? "2px solid #4caf50" : "2px solid transparent", width: "100%", display: "flex", justifyContent: "center", padding: "5px 0" }}
          title="Project Explorer"
        >
          <Folder size={24} color={sidebarView === "explorer" ? "#fff" : "#777"} />
        </div>

        <div
          onClick={() => { setSidebarView("snippets"); setSidebarCollapsed(false); }}
          style={{ cursor: "pointer", borderLeft: sidebarView === "snippets" ? "2px solid #4caf50" : "2px solid transparent", width: "100%", display: "flex", justifyContent: "center", padding: "5px 0" }}
          title="Code Snippets"
        >
          <ClipboardList size={24} color={sidebarView === "snippets" ? "#fff" : "#777"} />
        </div>

        <div
          onClick={() => { setSidebarView("github"); setSidebarCollapsed(false); }}
          style={{ cursor: "pointer", borderLeft: sidebarView === "github" ? "2px solid #4caf50" : "2px solid transparent", width: "100%", display: "flex", justifyContent: "center", padding: "5px 0" }}
          title="GitHub Explorer"
        >
          <Github size={24} color={sidebarView === "github" ? "#fff" : "#777"} />
        </div>

        <div
          onClick={() => { setSidebarView("blueprint"); setSidebarCollapsed(false); }}
          style={{ cursor: "pointer", borderLeft: sidebarView === "blueprint" ? "2px solid #7c4dff" : "2px solid transparent", width: "100%", display: "flex", justifyContent: "center", padding: "5px 0" }}
          title="Project Blueprint"
        >
          <LayoutDashboard size={24} color={sidebarView === "blueprint" ? "#b388ff" : "#777"} />
        </div>

        <div
          onClick={() => setSidebarCollapsed(c => !c)}
          style={{ cursor: "pointer", marginTop: "auto", width: "100%", display: "flex", justifyContent: "center", padding: "8px 0", transition: "transform 0.2s" }}
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <ChevronRight size={20} color="#777" style={{ transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.25s ease' }} />
        </div>
      </div>

      {/* 2. SIDEBAR CONTENT */}
      {!sidebarCollapsed && (
        <div style={{ width: `${sidebarWidth}px`, background: "#252526", display: "flex", flexDirection: "column", borderRight: "none", flexShrink: 0 }}>

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
              <div style={{ padding: "15px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                SNIPPETS
                <button
                  onClick={handleCreateSnippet}
                  style={{ background: "none", border: "1px solid #4caf50", color: "#4caf50", borderRadius: "4px", padding: "2px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem" }}
                  title="New Snippet"
                >
                  <Plus size={12} /> New
                </button>
              </div>
              <div style={{ padding: "0 10px", overflowY: "auto", flex: 1 }}>
                {snippets.map(snippet => (
                  <div
                    key={snippet.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "6px 8px", marginBottom: "2px", borderRadius: "4px", cursor: "pointer",
                      background: activeSnippetId === snippet.id ? "#2a2d2e" : "transparent",
                      borderLeft: activeSnippetId === snippet.id ? "2px solid #4caf50" : "2px solid transparent",
                      fontSize: "0.8rem", color: activeSnippetId === snippet.id ? "#fff" : "#aaa"
                    }}
                    onClick={() => setActiveSnippetId(snippet.id)}
                  >
                    <FileCode size={14} color={activeSnippetId === snippet.id ? "#4caf50" : "#666"} />
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      {renamingSnippetId === snippet.id ? (
                        <input
                          autoFocus
                          defaultValue={snippet.name}
                          onBlur={(e) => handleRenameSnippet(snippet.id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSnippet(snippet.id, e.target.value); if (e.key === 'Escape') setRenamingSnippetId(null); }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ background: "#1e1e1e", border: "1px solid #4caf50", color: "#fff", width: "100%", padding: "2px 4px", borderRadius: "3px", fontSize: "0.8rem", outline: "none" }}
                        />
                      ) : (
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{snippet.name}</span>
                      )}
                    </div>
                    <span style={{ fontSize: "0.6rem", color: "#555", textTransform: "uppercase", flexShrink: 0 }}>{snippet.language}</span>
                    <Edit3
                      size={12} color="#666" style={{ cursor: "pointer", flexShrink: 0 }}
                      onClick={(e) => { e.stopPropagation(); setRenamingSnippetId(snippet.id); }}
                      title="Rename"
                    />
                    {snippets.length > 1 && (
                      <Trash2
                        size={12} color="#555" style={{ cursor: "pointer", flexShrink: 0 }}
                        onClick={(e) => { e.stopPropagation(); handleDeleteSnippet(snippet.id); }}
                        title="Delete"
                      />
                    )}
                  </div>
                ))}

                <div style={{ marginTop: "20px", borderTop: "1px solid #333", paddingTop: "10px" }}>
                  <button style={actionBtnStyle} onClick={handleLoadSnippet}>
                    Inject to {activeFileName}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* VIEW C: GITHUB */}
          {sidebarView === "github" && (
            <>
              <div style={{ padding: "12px 15px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: "8px" }}>
                <Github size={14} color="#fff" /> GitHub
              </div>

              {/* Repo Input */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #333" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleLoadRepo(); }}
                    placeholder="owner/repo"
                    style={{
                      flex: 1, background: "#1e1e1e", border: "1px solid #444", borderRadius: "4px",
                      padding: "6px 10px", color: "#d4d4d4", fontSize: "0.8rem", outline: "none"
                    }}
                  />
                  <button
                    onClick={handleLoadRepo}
                    disabled={githubLoadingRepo || !repoInput.trim()}
                    style={{
                      background: githubLoadingRepo ? "#333" : "#238636", border: "none", borderRadius: "4px",
                      padding: "6px 12px", color: "#fff", fontSize: "0.75rem", cursor: githubLoadingRepo ? "wait" : "pointer",
                      display: "flex", alignItems: "center", gap: "4px"
                    }}
                  >
                    {githubLoadingRepo ? <Loader size={12} className="spin" /> : <Play size={12} />}
                    {githubLoadingRepo ? 'Loading' : 'Load'}
                  </button>
                </div>

                {githubError && (
                  <div style={{ marginTop: "8px", padding: "6px 8px", background: "#3b1d1d", border: "1px solid #6b3030", borderRadius: "4px", fontSize: "0.75rem", color: "#f87171" }}>
                    {githubError}
                  </div>
                )}

                {githubRepoInfo && (
                  <div style={{ marginTop: "8px", fontSize: "0.7rem", color: "#666", display: "flex", alignItems: "center", gap: "6px" }}>
                    <GitBranch size={10} /> {githubRepoInfo.branch}
                  </div>
                )}
              </div>

              {/* Rate limit indicator (token is now in API Settings modal) */}
              {githubRateInfo && (
                <div
                  onClick={() => setShowApiKeyModal(true)}
                  style={{
                    padding: "6px 12px", borderBottom: "1px solid #333", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "6px", fontSize: "0.65rem",
                  }}
                  title="Open API Settings to manage your GitHub token"
                >
                  <Settings size={10} color="#888" />
                  <span style={{ color: "#888" }}>API</span>
                  <span style={{
                    marginLeft: "auto", padding: "2px 6px", borderRadius: "8px",
                    background: githubRateInfo.remaining < 10 ? "#f4433620" : "#23863620",
                    color: githubRateInfo.remaining < 10 ? "#f44336" : "#4caf50",
                  }}>
                    {githubRateInfo.remaining}/{githubRateInfo.limit} left
                  </span>
                </div>
              )}

              {/* Analysis Loading */}
              {githubBlueprintLoading && (
                <div style={{ padding: "20px 12px", textAlign: "center", borderBottom: "1px solid #333" }}>
                  <Loader size={20} className="spin" style={{ marginBottom: "8px" }} />
                  <div style={{ fontSize: "0.75rem", color: "#4caf50" }}>Analyzing repository...</div>
                  <div style={{ fontSize: "0.65rem", color: "#666", marginTop: "4px" }}>Fetching and processing code files</div>
                </div>
              )}

              {/* Project Stats (after analysis) */}
              {githubBlueprintData?.project_stats && (
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #333" }}>
                  <div style={{ fontSize: "0.65rem", color: "#238636", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.5px" }}>Project Stats</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    {[
                      { label: "Files", value: githubBlueprintData.project_stats.total_files, color: "#4caf50" },
                      { label: "Functions", value: githubBlueprintData.project_stats.total_functions, color: "#ff9800" },
                      { label: "Lines", value: githubBlueprintData.project_stats.total_lines, color: "#00bcd4" },
                      { label: "Languages", value: githubBlueprintData.project_stats.languages.length, color: "#e040fb" },
                    ].map((s, i) => (
                      <div key={i} style={{ background: "#1e1e1e", borderRadius: "6px", padding: "6px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: "1rem", fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: "0.6rem", color: "#666" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Health Insights (after analysis) */}
              {githubInsights && (
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #333" }}>
                  <div style={{ fontSize: "0.65rem", color: "#f44336", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.5px" }}>Health Insights</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {githubInsights.cyclesCount > 0 && (
                      <div style={{ background: "#f4433615", padding: "6px 8px", borderRadius: "4px", borderLeft: "3px solid #f44336", fontSize: "0.75rem", color: "#ffcdd2" }}>
                        <span style={{ fontWeight: "bold" }}>⚠️ {githubInsights.cyclesCount} files</span> in import cycles
                      </div>
                    )}
                    {githubInsights.mostImported && (
                      <div style={{ background: "#1e1e1e", padding: "6px 8px", borderRadius: "4px", borderLeft: "3px solid #238636", fontSize: "0.75rem", color: "#ccc" }}>
                        <span style={{ fontWeight: "bold", color: "#fff" }}>Most Relied Upon:</span><br />
                        {githubInsights.mostImported.file} ({githubInsights.mostImported.count} imports)
                      </div>
                    )}
                    {githubInsights.isolatedCount > 0 && (
                      <div style={{ background: "#1e1e1e", padding: "6px 8px", borderRadius: "4px", borderLeft: "3px solid #9e9e9e", fontSize: "0.75rem", color: "#ccc" }}>
                        <span style={{ fontWeight: "bold", color: "#fff" }}>Isolated Files:</span> {githubInsights.isolatedCount}
                      </div>
                    )}
                    {!githubInsights.cyclesCount && !githubInsights.mostImported && !githubInsights.isolatedCount > 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#666', fontStyle: 'italic' }}>No special insights detected.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Commits (for selected file) */}
              {githubFileCommits.length > 0 && githubSelectedFile && (() => {
                const showAll = githubFileCommits._showAll;
                const visibleCommits = showAll ? githubFileCommits : githubFileCommits.slice(0, 3);
                return (
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid #333" }}>
                    <div
                      style={{ fontSize: "0.65rem", color: "#7c4dff", textTransform: "uppercase", marginBottom: "4px", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
                      onClick={() => {
                        const updated = [...githubFileCommits];
                        updated._showAll = !showAll;
                        setGithubFileCommits(updated);
                      }}
                    >
                      <GitBranch size={10} /> Recent Commits
                      <span style={{ marginLeft: "auto", color: "#666", fontSize: "0.6rem" }}>
                        {showAll ? '▲ less' : `${githubFileCommits.length} total`}
                      </span>
                    </div>
                    {visibleCommits.map((c, i) => (
                      <a
                        key={i}
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "4px 6px", marginBottom: "2px", borderRadius: "4px",
                          background: "transparent", textDecoration: "none",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#1e1e1e"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        {c.avatar && (
                          <img src={c.avatar} alt="" style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.7rem", color: "#aaa" }}>
                          {c.message}
                        </div>
                        <span style={{ fontSize: "0.55rem", color: "#555", flexShrink: 0 }}>{c.sha}</span>
                      </a>
                    ))}
                    {!showAll && githubFileCommits.length > 3 && (
                      <div
                        onClick={() => { const updated = [...githubFileCommits]; updated._showAll = true; setGithubFileCommits(updated); }}
                        style={{ fontSize: "0.65rem", color: "#7c4dff", cursor: "pointer", textAlign: "center", padding: "3px 0", marginTop: "2px" }}
                      >
                        Show {githubFileCommits.length - 3} more…
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* File List (after analysis) */}
              {githubBlueprintData?.file_info && (
                <>
                  <div
                    onMouseDown={(e) => startGithubFilesDrag(e, -1)}
                    style={{
                      height: "4px", background: "rgba(255,255,255,0.02)", cursor: "ns-resize",
                      transition: "background 0.2s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#007fd4"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  />
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid #333", height: `${githubFilesHeight}px`, overflowY: "auto" }}>
                    <div style={{ fontSize: "0.65rem", color: "#666", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.5px", display: "flex", justifyContent: "space-between" }}>
                      <span>Analyzed Files</span>
                      <span>{Object.keys(githubBlueprintData.file_info).length} files</span>
                    </div>
                    {Object.entries(githubBlueprintData.file_info).map(([path, info]) => {
                      const filename = path.split('/').pop() || path;
                      const langColors = { python: '#3572A5', java: '#b07219', javascript: '#f1e05a', typescript: '#3178c6', cpp: '#f34b7d', c: '#555555' };
                      return (
                        <div
                          key={path}
                          style={{
                            padding: "4px 8px", marginBottom: "2px", borderRadius: "4px",
                            display: "flex", alignItems: "center", gap: "6px",
                            fontSize: "0.75rem", color: "#aaa",
                          }}
                        >
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: langColors[info.language] || "#666", flexShrink: 0 }} />
                          <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{filename}</div>
                          <span style={{ fontSize: "0.6rem", color: "#555" }}>{info.functions.length}f</span>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    onMouseDown={(e) => startGithubFilesDrag(e, 1)}
                    style={{
                      height: "4px", background: "rgba(255,255,255,0.02)", cursor: "ns-resize",
                      transition: "background 0.2s", marginBottom: "4px"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#007fd4"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  />
                </>
              )}

              {/* Remote Tree */}
              <GitHubExplorer
                treeData={githubTree}
                selectedFile={githubSelectedFile}
                onFileSelect={handleGithubFileSelect}
                loadingFile={githubLoadingFile}
                repoInfo={githubRepoInfo}
                dependencies={githubDependencies}
              />
            </>
          )}

          {/* VIEW D: PROJECT BLUEPRINT */}
          {sidebarView === "blueprint" && (
            <>
              <div style={{ padding: "12px 15px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: "8px", color: "#b388ff" }}>
                <LayoutDashboard size={14} color="#7c4dff" /> Project Blueprint
              </div>

              {/* Upload Area */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #333" }}>
                <label style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  padding: "10px", border: "2px dashed #7c4dff44", borderRadius: "8px",
                  cursor: "pointer", color: "#b388ff", fontSize: "0.78rem", fontWeight: 600,
                  background: "#7c4dff08", transition: "all 0.2s",
                }}>
                  <FolderOpen size={16} />
                  {blueprintLoading ? "Analyzing..." : "Upload Project (ZIP)"}
                  <input
                    type="file"
                    accept=".zip"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = '';

                      setBlueprintLoading(true);
                      setBlueprintData(null);

                      try {
                        const JSZip = (await import('jszip')).default;
                        const zip = await JSZip.loadAsync(file);
                        const codeExts = ['.py', '.java', '.js', '.jsx', '.ts', '.tsx', '.cpp', '.cc', '.c', '.h', '.hpp', '.cs', '.rb', '.go', '.rs', '.kt', '.swift'];
                        const newTree = { type: 'folder', name: file.name.replace('.zip', ''), children: {} };
                        const projectFiles = [];

                        for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
                          if (zipEntry.dir) continue;
                          const isCode = codeExts.some(ext => relativePath.toLowerCase().endsWith(ext));
                          const content = isCode ? await zipEntry.async('string') : '';

                          // Build tree
                          const pathParts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
                          let current = newTree;
                          for (let i = 0; i < pathParts.length - 1; i++) {
                            if (!current.children[pathParts[i]]) {
                              current.children[pathParts[i]] = { type: 'folder', name: pathParts[i], children: {} };
                            }
                            current = current.children[pathParts[i]];
                          }
                          const fileName = pathParts[pathParts.length - 1];
                          current.children[fileName] = { type: 'file', name: fileName, content };

                          if (isCode) {
                            projectFiles.push({ path: relativePath, content });
                          }
                        }

                        setBlueprintTree(newTree);
                        console.log('[Blueprint] Code files found:', projectFiles.length, projectFiles.map(f => f.path));

                        if (projectFiles.length > 0) {
                          const res = await axios.post('http://127.0.0.1:8000/analyze-project', { files: projectFiles });
                          console.log('[Blueprint] API response:', res.status, JSON.stringify(res.data).slice(0, 300));
                          if (!res.data.error) {
                            setBlueprintData(res.data);
                            console.log('[Blueprint] Data set, nodes:', res.data.dep_graph?.nodes?.length);
                          } else {
                            console.error('[Blueprint] API error:', res.data.error);
                          }
                        }
                      } catch (err) {
                        console.error('Blueprint upload failed:', err);
                        alert('Failed to process project ZIP.');
                      } finally {
                        setBlueprintLoading(false);
                      }
                    }}
                  />
                </label>
              </div>

              {/* Project Stats */}
              {blueprintData?.project_stats && (
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #333" }}>
                  <div style={{ fontSize: "0.65rem", color: "#7c4dff", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.5px" }}>Project Stats</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    {[
                      { label: "Files", value: blueprintData.project_stats.total_files, color: "#4caf50" },
                      { label: "Functions", value: blueprintData.project_stats.total_functions, color: "#ff9800" },
                      { label: "Lines", value: blueprintData.project_stats.total_lines, color: "#00bcd4" },
                      { label: "Languages", value: blueprintData.project_stats.languages.length, color: "#e040fb" },
                    ].map((s, i) => (
                      <div key={i} style={{ background: "#1e1e1e", borderRadius: "6px", padding: "6px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: "1rem", fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: "0.6rem", color: "#666" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Health Insights */}
              {blueprintInsights && (
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #333" }}>
                  <div style={{ fontSize: "0.65rem", color: "#f44336", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.5px" }}>Health Insights</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {blueprintInsights.cyclesCount > 0 && (
                      <div style={{ background: "#f4433615", padding: "6px 8px", borderRadius: "4px", borderLeft: "3px solid #f44336", fontSize: "0.75rem", color: "#ffcdd2" }}>
                        <span style={{ fontWeight: "bold" }}>⚠️ {blueprintInsights.cyclesCount} files</span> in import cycles
                      </div>
                    )}
                    {blueprintInsights.mostImported && (
                      <div style={{ background: "#1e1e1e", padding: "6px 8px", borderRadius: "4px", borderLeft: "3px solid #7c4dff", fontSize: "0.75rem", color: "#ccc" }}>
                        <span style={{ fontWeight: "bold", color: "#fff" }}>Most Relied Upon:</span><br />
                        {blueprintInsights.mostImported.file} ({blueprintInsights.mostImported.count} imports)
                      </div>
                    )}
                    {blueprintInsights.isolatedCount > 0 && (
                      <div style={{ background: "#1e1e1e", padding: "6px 8px", borderRadius: "4px", borderLeft: "3px solid #9e9e9e", fontSize: "0.75rem", color: "#ccc" }}>
                        <span style={{ fontWeight: "bold", color: "#fff" }}>Isolated Files:</span> {blueprintInsights.isolatedCount}
                      </div>
                    )}
                    {!blueprintInsights.cyclesCount && !blueprintInsights.mostImported && !blueprintInsights.isolatedCount > 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#666', fontStyle: 'italic' }}>No special insights detected.</div>
                    )}
                  </div>
                </div>
              )}

              {/* File List */}
              {blueprintData?.file_info && (
                <div style={{ padding: "8px 12px", flex: 1, overflowY: "auto" }}>
                  <div style={{ fontSize: "0.65rem", color: "#666", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.5px" }}>Files</div>
                  {Object.entries(blueprintData.file_info).map(([path, info]) => {
                    const filename = path.split('/').pop() || path;
                    const isSelected = blueprintSelectedFile === path;
                    const langColors = { python: '#3572A5', java: '#b07219', javascript: '#f1e05a', typescript: '#3178c6', cpp: '#f34b7d', c: '#555555' };
                    return (
                      <div
                        key={path}
                        onClick={() => setBlueprintSelectedFile(path)}
                        style={{
                          padding: "6px 8px", marginBottom: "2px", borderRadius: "4px", cursor: "pointer",
                          background: isSelected ? "#2a2d2e" : "transparent",
                          borderLeft: `2px solid ${isSelected ? "#7c4dff" : "transparent"}`,
                          display: "flex", alignItems: "center", gap: "6px",
                          fontSize: "0.75rem", color: isSelected ? "#fff" : "#aaa",
                        }}
                      >
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: langColors[info.language] || "#666", flexShrink: 0 }} />
                        <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{filename}</div>
                        <span style={{ fontSize: "0.6rem", color: "#555" }}>{info.functions.length}f</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {!blueprintData && !blueprintLoading && (
                <div style={{ padding: "20px", textAlign: "center", color: "#555", fontSize: "0.78rem", fontStyle: "italic" }}>
                  Upload a project ZIP to see its architecture.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* SIDEBAR DIVIDER */}
      {!sidebarCollapsed && (
        <div
          onMouseDown={startDrag('sidebar', sidebarWidth)}
          style={{
            width: "4px", background: "linear-gradient(180deg, #333 0%, #444 50%, #333 100%)",
            cursor: "col-resize", flexShrink: 0, position: "relative"
          }}
        >
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: "2px", height: "30px", background: "#666", borderRadius: "2px"
          }} />
        </div>
      )}

      {/* 3. CENTER STAGE */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#1e1e1e" }}>
        {/* TOOLBAR */}
        <div style={{ height: "40px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", padding: "0 15px", justifyContent: "space-between", background: "#1e1e1e" }}>

          {/* Breadcrumbs */}
          <div style={{ fontSize: "0.8rem", color: "#888", display: "flex", alignItems: "center", gap: "10px" }}>
            <FileCode size={14} color="#4caf50" />
            {sidebarView === "explorer" ? (
              <span style={{ fontWeight: "bold", color: "#d4d4d4" }}>{activeFileName}</span>
            ) : sidebarView === "github" ? (
              <span style={{ fontWeight: "bold", color: "#c9d1d9" }}>
                {githubSelectedFile ? githubSelectedFile.split('/').pop() : (githubRepoInfo ? `${githubRepoInfo.owner}/${githubRepoInfo.repo}` : 'GitHub')}
              </span>
            ) : sidebarView === "blueprint" ? (
              <span style={{ fontWeight: "bold", color: "#b388ff" }}>
                {blueprintData ? (blueprintTree?.name || 'Project Blueprint') : 'Project Blueprint'}
              </span>
            ) : (
              <span style={{ fontWeight: "bold", color: "#f89820" }}>Snippet: {activeSnippet ? activeSnippet.name : 'None'}</span>
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
                value={activeSnippet ? activeSnippet.language : "python"}
                onChange={(e) => handleChangeSnippetLanguage(e.target.value)}
                style={dropdownStyle}
              >
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="cpp">C++</option>
                <option value="c">C</option>
              </select>
            ) : (
              <div style={{ fontSize: "0.75rem", color: "#666", fontWeight: "bold", background: "#252526", padding: "4px 8px", borderRadius: "3px" }}>
                {(() => {
                  if (activeFileName.endsWith(".py")) return "PYTHON FILE";
                  if (activeFileName.endsWith(".java")) return "JAVA FILE";
                  if (activeFileName.endsWith(".js") || activeFileName.endsWith(".jsx")) return "JS FILE";
                  if (activeFileName.endsWith(".ts") || activeFileName.endsWith(".tsx")) return "TS FILE";
                  if (activeFileName.endsWith(".cpp") || activeFileName.endsWith(".cc")) return "C++ FILE";
                  if (activeFileName.endsWith(".c")) return "C FILE";
                  return "FILE";
                })()}
              </div>
            )}

            <div style={{ width: 1, height: 20, background: "#555" }} />

            {/* VIEW SWITCHER */}
            <div style={{ display: "flex", gap: "5px" }}>
              <button onClick={() => setViewMode("code")} title="Code Only" style={{ ...iconBtnStyle, background: viewMode === "code" ? "#3e3e42" : "transparent" }}> <FileText size={14} /> </button>
              <button onClick={() => setViewMode("split")} title="Split View" style={{ ...iconBtnStyle, background: viewMode === "split" ? "#3e3e42" : "transparent" }}> <Columns size={14} /> </button>
              <button onClick={() => setViewMode("graph")} title="Graph Only" style={{ ...iconBtnStyle, background: viewMode === "graph" ? "#3e3e42" : "transparent" }}> <Layers size={14} /> </button>
              {(sidebarView === "explorer" || sidebarView === "github") && (
                <>
                  <div style={{ width: 1, height: 20, background: "#444", alignSelf: "center" }} />
                  <button onClick={() => setViewMode("fileMap")} title="File Dependency Map" style={{ ...iconBtnStyle, background: viewMode === "fileMap" ? "#3e3e42" : "transparent", color: viewMode === "fileMap" ? "#4caf50" : "#ccc" }}> <GitBranch size={14} /> </button>
                </>
              )}
            </div>

            <button style={runBtnStyle} onClick={() => { if (sidebarView === 'github' && githubBlueprintData && githubSelectedFile) { setGithubFlowchartFile(githubSelectedFile); } handleAnalyze(null); }}>
              <Play size={14} fill="white" />
              {sidebarView === "snippets" ? " Analyze Snippet" : " Analyze File"}
            </button>
            {/* EXPORT BUTTONS */}
            <button style={{ ...iconBtnStyle, marginLeft: "auto" }} onClick={handleExportGraph} title="Export Graph JSON">
              <Download size={14} />
            </button>
            <button style={{ ...iconBtnStyle }} onClick={handleDownloadImage} title="Download PNG Image">
              <Image size={14} />
            </button>
            <button style={{ ...iconBtnStyle }} onClick={() => setViewMode(viewMode === "code" ? "split" : "code")} title="Toggle Code">
              {viewMode === "code" ? <Columns size={14} /> : <Maximize size={14} />}
            </button>
            <button
              style={{ ...iconBtnStyle, color: apiKeyStatus === 'ok' ? '#4caf50' : '#ccc' }}
              onClick={() => { setApiKeyInput(geminiApiKey); setShowApiKeyModal(true); }}
              title="API Settings"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {/* CANVAS */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex" }}>
          {/* Floating Graph Search Bar */}
          <div style={{
            position: "absolute", top: 12, right: 12, zIndex: 200,
            display: "flex", alignItems: "center", gap: "6px",
            background: "rgba(30,30,30,0.92)", backdropFilter: "blur(8px)",
            border: `1px solid ${graphSearchQuery ? '#7c4dff' : '#444'}`,
            borderRadius: "8px", padding: "4px 10px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            transition: "border-color 0.2s, width 0.3s",
            width: graphSearchQuery ? "260px" : "180px",
          }}>
            <Search size={13} color={graphSearchQuery ? '#7c4dff' : '#666'} />
            <input
              type="text"
              placeholder="Search nodes…"
              value={graphSearchQuery}
              onChange={(e) => setGraphSearchQuery(e.target.value)}
              style={{
                background: "transparent", border: "none", outline: "none",
                color: "#ddd", fontSize: "0.75rem", width: "100%",
                fontFamily: "inherit",
              }}
            />
            {graphSearchQuery && (
              <button
                onClick={() => setGraphSearchQuery('')}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "#888", fontSize: "0.8rem", padding: 0, lineHeight: 1,
                }}
              >✕</button>
            )}
          </div>
          {/* Heatmap Toggle */}
          <button
            onClick={() => setHeatmapMode(h => !h)}
            title={heatmapMode ? "Switch to Language Colors" : "Switch to Complexity Heatmap"}
            style={{
              position: "absolute", top: 46, right: 12, zIndex: 200,
              background: heatmapMode ? "rgba(124,77,255,0.25)" : "rgba(30,30,30,0.92)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${heatmapMode ? '#7c4dff' : '#444'}`,
              borderRadius: "8px", padding: "4px 10px",
              cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
              color: heatmapMode ? "#bb86fc" : "#888", fontSize: "0.65rem",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              transition: "all 0.2s",
            }}
          >
            🔥 {heatmapMode ? "Heatmap On" : "Heatmap"}
          </button>
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
                crossFileData={crossFileData}
                searchQuery={graphSearchQuery}
                onNodeDoubleClick={(_, node) => {
                  setSidebarView("explorer");
                  handleFileSelect(node.id, null);
                  // Small timeout to allow state to settle before analyzing
                  setTimeout(() => handleAnalyze(), 100);
                }}
              />
            </div>
          )}

          {/* FILE DEPENDENCY MAP - GitHub */}
          {viewMode === "fileMap" && sidebarView === "github" && (
            <div style={{ flex: 1, position: "relative", height: "100%", background: "#1e1e1e" }}>
              <FileDepGraph
                dependencies={githubDependencies}
                fileTree={githubTree || { type: 'folder', name: 'root', children: {} }}
                selectedFile={githubSelectedFile}
                onFileSelect={(path) => { setGithubSelectedFile(path); }}
                graphMemory={graphMemory}
                setGraphMemory={setGraphMemory}
                searchQuery={graphSearchQuery}
              />
            </div>
          )}

          {(viewMode === "code" || viewMode === "split") && (
            <div style={{ flex: viewMode === "split" ? `0 0 ${codePaneWidth}%` : "1", borderRight: "none", height: "100%" }}>
              <textarea
                value={sidebarView === "explorer" ? currentFileContent : sidebarView === "github" ? githubFileContent : (activeSnippet ? activeSnippet.content : '')}
                onChange={sidebarView === "github" ? undefined : handleCodeChange}
                readOnly={sidebarView === "github"}
                style={{ ...editorStyle, ...(sidebarView === "github" ? { opacity: 0.85 } : {}) }} spellCheck="false"
              />
            </div>
          )}

          {/* Split View Divider */}
          {viewMode === "split" && (
            <div
              onMouseDown={startDrag('codepane', codePaneWidth)}
              style={{
                width: "4px", background: "linear-gradient(180deg, #333 0%, #444 50%, #333 100%)",
                cursor: "col-resize", flexShrink: 0, position: "relative"
              }}
            >
              <div style={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                width: "2px", height: "30px", background: "#666", borderRadius: "2px"
              }} />
            </div>
          )}

          {(viewMode === "graph" || viewMode === "split" || sidebarView === "blueprint" || (sidebarView === "github" && githubBlueprintData)) && (
            <div style={{ flex: 1, position: "relative", height: "100%", background: "#1e1e1e" }}>
              {loading || blueprintLoading || githubBlueprintLoading ? (
                <div style={centerMsgStyle}>{blueprintLoading ? "Analyzing project..." : githubBlueprintLoading ? "Analyzing GitHub repository..." : "Analyzing..."}</div>
              ) : sidebarView === "blueprint" && !blueprintFlowchartFile && blueprintData?.dep_graph ? (
                <>
                  <FuncDepGraph
                    depData={blueprintDepData}
                    onFuncClick={(fileId) => setBlueprintSelectedFile(fileId)}
                    onNodeDoubleClick={(e, node) => {
                      console.log("Blueprint Double Click triggered for node:", node);
                      setBlueprintFlowchartFile(node.id);
                      setBlueprintSelectedFile(node.id);
                      // Trigger analysis on that file so the flowchart appears
                      setTimeout(() => handleAnalyze(), 100);
                    }}
                    graphMemory={graphMemory}
                    setGraphMemory={setGraphMemory}
                    memoryKey="blueprint:depGraph"
                    searchQuery={graphSearchQuery}
                    heatmapMode={heatmapMode}
                  />
                </>
              ) : sidebarView === "blueprint" && blueprintFlowchartFile && analysisResult?.func_dep_graph && !currentFunc ? (
                <>
                  <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
                    <button
                      onClick={() => { setBlueprintFlowchartFile(null); setAnalysisResult(null); }}
                      style={{
                        padding: '6px 12px', background: '#333', color: '#fff',
                        border: '1px solid #555', borderRadius: '4px', cursor: 'pointer',
                        fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      ← Back to Blueprint Map
                    </button>
                  </div>
                  <FuncDepGraph
                    depData={analysisResult.func_dep_graph}
                    onFuncClick={(funcName) => handleAnalyze(funcName)}
                    graphMemory={graphMemory}
                    setGraphMemory={setGraphMemory}
                    memoryKey={`${blueprintFlowchartFile}:funcDep`}
                    searchQuery={graphSearchQuery}
                    heatmapMode={heatmapMode}
                  />
                </>
              ) : sidebarView === "blueprint" && blueprintFlowchartFile && analysisResult?.graph_data ? (
                <>
                  <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
                    <button
                      onClick={() => { setBlueprintFlowchartFile(null); setAnalysisResult(null); }}
                      style={{
                        padding: '6px 12px', background: '#333', color: '#fff',
                        border: '1px solid #555', borderRadius: '4px', cursor: 'pointer',
                        fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      ← Back to Blueprint Map
                    </button>
                  </div>
                  <FlowGraph
                    ref={graphRef}
                    data={analysisResult.graph_data}
                    onNodeClick={onGraphNodeClick}
                    graphMemory={graphMemory}
                    setGraphMemory={setGraphMemory}
                    memoryKey={`${blueprintFlowchartFile}:${currentFunc || 'full'}`}
                    crossFileData={crossFileData}
                    currentFilePath={blueprintFlowchartFile}
                  />
                </>
              ) : sidebarView === "blueprint" ? (
                <div style={centerMsgStyle}>
                  <p>🏗️ Project Blueprint</p>
                  <p style={{ fontSize: "0.8rem" }}>Upload a project ZIP to see its architecture.</p>
                </div>
              ) : sidebarView === "github" && !githubFlowchartFile && githubBlueprintData?.dep_graph ? (
                <>
                  <FuncDepGraph
                    depData={githubDepData}
                    onFuncClick={(fileId) => { }}
                    onNodeDoubleClick={(e, node) => {
                      console.log("GitHub Double Click triggered for node:", node);
                      setGithubFlowchartFile(node.id);
                      // Find file content and analyze it
                      const fileInfo = githubBlueprintData?.file_info;
                      if (fileInfo) {
                        const filePath = Object.keys(fileInfo).find(p => p === node.id || p.endsWith('/' + (node.data?.label || '')));
                        if (filePath && fileInfo[filePath]) {
                          // Trigger analysis on the file
                          const ext = filePath.split('.').pop()?.toLowerCase();
                          const langMap = { py: 'python', java: 'java', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', cpp: 'cpp', c: 'c' };
                          const lang = langMap[ext] || 'python';
                          // Find the file content from the tree
                          const findContent = (tree, targetPath) => {
                            const parts = targetPath.split('/');
                            let current = tree;
                            for (const part of parts) {
                              if (current?.children?.[part]) current = current.children[part];
                              else return null;
                            }
                            return current?.content;
                          };
                          const content = findContent(githubTree, filePath);
                          if (content) {
                            // Show the code in split view
                            setGithubFileContent(content);
                            setGithubSelectedFile(filePath);
                            setViewMode('split');
                            // Analyze the file
                            setLoading(true);
                            axios.post('http://127.0.0.1:8000/analyze', { code: content, language: lang })
                              .then(res => { if (!res.data.error) setAnalysisResult(res.data); })
                              .catch(err => console.error('Analysis failed:', err))
                              .finally(() => setLoading(false));
                          }
                        }
                      }
                    }}
                    graphMemory={graphMemory}
                    setGraphMemory={setGraphMemory}
                    memoryKey="github:depGraph"
                    searchQuery={graphSearchQuery}
                    heatmapMode={heatmapMode}
                  />
                </>
              ) : sidebarView === "github" && githubFlowchartFile && analysisResult?.func_dep_graph && !currentFunc ? (
                <>
                  <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
                    <button
                      onClick={() => { setGithubFlowchartFile(null); setAnalysisResult(null); }}
                      style={{
                        padding: '6px 12px', background: '#333', color: '#fff',
                        border: '1px solid #555', borderRadius: '4px', cursor: 'pointer',
                        fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      ← Back to Repo Map
                    </button>
                  </div>
                  <FuncDepGraph
                    depData={analysisResult.func_dep_graph}
                    onFuncClick={(funcName) => handleAnalyze(funcName)}
                    graphMemory={graphMemory}
                    setGraphMemory={setGraphMemory}
                    memoryKey={`${githubFlowchartFile}:funcDep`}
                    searchQuery={graphSearchQuery}
                    heatmapMode={heatmapMode}
                  />
                </>
              ) : sidebarView === "github" && githubFlowchartFile && analysisResult?.graph_data ? (
                <>
                  <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
                    <button
                      onClick={() => { setCurrentFunc(null); setAiExplanation(null); }}
                      style={{
                        padding: '6px 12px', background: '#333', color: '#fff',
                        border: '1px solid #555', borderRadius: '4px', cursor: 'pointer',
                        fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      ← Back to Dependencies
                    </button>
                  </div>
                  <FlowGraph
                    ref={graphRef}
                    data={analysisResult.graph_data}
                    onNodeClick={onGraphNodeClick}
                    graphMemory={graphMemory}
                    setGraphMemory={setGraphMemory}
                    memoryKey={`${githubFlowchartFile}:${currentFunc || 'full'}`}
                    crossFileData={crossFileData}
                    currentFilePath={githubFlowchartFile}
                  />
                </>
              ) : sidebarView === "github" && !githubBlueprintData ? (
                <div style={centerMsgStyle}>
                  <p>🐙 GitHub Explorer</p>
                  <p style={{ fontSize: "0.8rem" }}>Load a repo and analyze it to see its architecture.</p>
                </div>
              ) : analysisResult && analysisResult.func_dep_graph && !currentFunc ? (
                <FuncDepGraph
                  depData={analysisResult.func_dep_graph}
                  onFuncClick={(funcName) => handleAnalyze(funcName)}
                  graphMemory={graphMemory}
                  setGraphMemory={setGraphMemory}
                  memoryKey={`${sidebarView === 'explorer' ? selectedFilePath : 'snippet'}:funcDep`}
                  searchQuery={graphSearchQuery}
                  heatmapMode={heatmapMode}
                />
              ) : analysisResult && analysisResult.graph_data ? (
                <FlowGraph
                  ref={graphRef}
                  data={analysisResult.graph_data}
                  onNodeClick={onGraphNodeClick}
                  graphMemory={graphMemory}
                  setGraphMemory={setGraphMemory}
                  memoryKey={getMemoryKey()}
                  crossFileData={crossFileData}
                  currentFilePath={sidebarView === 'explorer' ? selectedFilePath : githubSelectedFile}
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
        </div>
      </div>

      {/* RIGHT PANEL DIVIDER */}
      {!rightPanelCollapsed && (
        <div
          onMouseDown={startDrag('rightpanel', rightPanelWidth)}
          style={{
            width: "4px", background: "linear-gradient(180deg, #333 0%, #444 50%, #333 100%)",
            cursor: "col-resize", flexShrink: 0, position: "relative"
          }}
        >
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: "2px", height: "30px", background: "#666", borderRadius: "2px"
          }} />
        </div>
      )}

      {/* 4. RIGHT PANEL — INSPECTOR */}
      {rightPanelCollapsed ? (
        <div
          onClick={() => setRightPanelCollapsed(false)}
          style={{
            width: "32px", background: "#252526", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
            borderLeft: "1px solid #333", gap: "8px", transition: "background 0.15s"
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#2a2d2e'}
          onMouseLeave={e => e.currentTarget.style.background = '#252526'}
          title="Expand Inspector"
        >
          <ChevronRight size={14} color="#777" style={{ transform: 'rotate(180deg)' }} />
          <span style={{
            writingMode: "vertical-rl", textOrientation: "mixed",
            fontSize: "0.65rem", color: "#666", letterSpacing: "1px",
            textTransform: "uppercase", fontWeight: "bold"
          }}>Inspector</span>
        </div>
      ) : (
        <div style={{ width: `${rightPanelWidth}px`, background: "#252526", borderLeft: "none", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: "12px 15px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Search size={14} color="#4caf50" /> Inspector
            </div>
            <ChevronRight
              size={14} color="#777" style={{ cursor: "pointer", transition: "color 0.15s" }}
              onClick={() => setRightPanelCollapsed(true)}
              onMouseEnter={e => e.currentTarget.style.color = '#ddd'}
              onMouseLeave={e => e.currentTarget.style.color = '#777'}
            />
          </div>

          {sidebarView === 'blueprint' ? (
            blueprintSelectedFile && blueprintData?.file_info?.[blueprintSelectedFile] ? (
              <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px", flex: 1, minHeight: 0, overflow: "hidden" }}>
                <div style={{ fontSize: "0.85rem", color: "#d4d4d4", fontWeight: "bold", wordBreak: "break-all" }}>
                  <FileCode size={14} color="#b388ff" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  {blueprintSelectedFile.split('/').pop()}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div style={{ background: "#1e1e1e", borderRadius: "6px", padding: "8px", borderLeft: "3px solid #ff9800" }}>
                    <div style={{ fontSize: "0.6rem", color: "#888", textTransform: "uppercase" }}>Imports (Out)</div>
                    <div style={{ fontSize: "0.9rem", color: "#ccc", fontWeight: "bold" }}>
                      {blueprintData.dep_graph?.edges?.filter(e => e.source === blueprintSelectedFile).length || 0}
                    </div>
                  </div>
                  <div style={{ background: "#1e1e1e", borderRadius: "6px", padding: "8px", borderLeft: "3px solid #00bcd4" }}>
                    <div style={{ fontSize: "0.6rem", color: "#888", textTransform: "uppercase" }}>Imported By (In)</div>
                    <div style={{ fontSize: "0.9rem", color: "#ccc", fontWeight: "bold" }}>
                      {blueprintData.dep_graph?.edges?.filter(e => e.target === blueprintSelectedFile).length || 0}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: "0.7rem", color: "#666", textTransform: "uppercase", marginBottom: "6px" }}>Code Preview ({blueprintData.file_info[blueprintSelectedFile].functions.length} functions)</div>
                  <pre style={{
                    margin: 0, padding: "10px", background: "#1e1e1e", borderRadius: "6px",
                    color: "#d4d4d4", fontSize: "0.75rem", overflowY: "auto", flex: 1,
                    border: "1px solid #333", whiteSpace: "pre-wrap"
                  }}>
                    {getFileContent(blueprintTree, blueprintSelectedFile) || "No code available."}
                  </pre>
                </div>
              </div>
            ) : (
              <div style={{ padding: "20px", textAlign: "center", color: "#555", fontSize: "0.8rem", fontStyle: "italic" }}>
                Select a file in the blueprint file tree to view its metrics and code.
              </div>
            )
          ) : sidebarView === 'github' && githubBlueprintData?.file_info && !analysisResult ? (
            <div style={{ padding: "10px 12px", flex: 1, overflowY: "auto" }}>
              <div style={{ fontSize: "0.7rem", color: "#666", textTransform: "uppercase", marginBottom: "10px", letterSpacing: "0.5px" }}>
                Repo Files — {Object.keys(githubBlueprintData.file_info).length} files
              </div>
              {Object.entries(githubBlueprintData.file_info)
                .sort(([, a], [, b]) => {
                  const aMax = a.complexity ? Math.max(...Object.values(a.complexity), 0) : 0;
                  const bMax = b.complexity ? Math.max(...Object.values(b.complexity), 0) : 0;
                  return bMax - aMax;
                })
                .map(([filePath, info]) => {
                  const filename = filePath.split('/').pop() || filePath;
                  const folderPath = filePath.split('/').slice(0, -1).join('/');
                  const langColors = { python: '#3572A5', java: '#b07219', javascript: '#f1e05a', typescript: '#3178c6', cpp: '#f34b7d', c: '#555555' };
                  const langColor = langColors[info.language] || '#666';
                  const maxCx = info.complexity ? Math.max(...Object.values(info.complexity), 0) : 0;
                  const fileBadgeColor = maxCx <= 5 ? "#4caf50" : maxCx <= 10 ? "#ff9800" : "#f44336";

                  return (
                    <div key={filePath} style={{ marginBottom: "8px", background: "#1e1e1e", borderRadius: "6px", border: "1px solid #333", overflow: "hidden" }}>
                      {/* File Header */}
                      <div style={{
                        padding: "6px 8px", display: "flex", alignItems: "center", gap: "6px",
                        borderBottom: "1px solid #2a2a2a", cursor: "default"
                      }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: langColor, flexShrink: 0 }} />
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: "0.78rem", color: "#ddd", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {filename}
                          </div>
                          {folderPath && (
                            <div style={{ fontSize: "0.6rem", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {folderPath}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "4px", alignItems: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: "0.6rem", color: "#666" }}>{info.line_count}L</span>
                          <span style={{
                            background: fileBadgeColor + "22", color: fileBadgeColor, fontSize: "0.6rem",
                            padding: "1px 5px", borderRadius: "8px", fontWeight: "bold"
                          }}>
                            cx:{maxCx}
                          </span>
                        </div>
                      </div>
                      {/* Functions */}
                      {info.functions && info.functions.length > 0 && (
                        <div style={{ padding: "4px 8px" }}>
                          {info.functions.map(fname => {
                            const cx = info.complexity?.[fname] || 0;
                            const badgeColor = cx <= 5 ? "#4caf50" : cx <= 10 ? "#ff9800" : "#f44336";
                            return (
                              <div key={fname} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "2px 4px", fontSize: "0.72rem", color: "#aaa",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px", overflow: "hidden" }}>
                                  <Code size={10} color={badgeColor} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fname}()</span>
                                </div>
                                <span style={{
                                  background: badgeColor + "18", color: badgeColor, fontSize: "0.58rem",
                                  padding: "1px 4px", borderRadius: "8px", fontWeight: "bold", flexShrink: 0
                                }}>
                                  {cx}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : !analysisResult ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#555", fontSize: "0.8rem", fontStyle: "italic" }}>
              Analyze code to see insights here.
            </div>
          ) : (
            <>
              {/* Back to Dependencies button */}
              {currentFunc && analysisResult?.func_dep_graph && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
                  <button
                    onClick={() => { setCurrentFunc(null); setAiExplanation(null); }}
                    style={{
                      width: '100%', padding: '7px 10px',
                      background: '#7c4dff22', border: '1px solid #7c4dff44',
                      borderRadius: '6px', cursor: 'pointer',
                      color: '#b388ff', fontSize: '0.75rem', fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                  >
                    ← Back to Dependencies
                  </button>
                </div>
              )}
              {/* Function List */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #333" }}>
                <div style={{ fontSize: "0.7rem", color: "#666", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "0.5px" }}>Functions</div>
                {(analysisResult?.functions?.names || []).length === 0 ? (
                  <div style={{ fontSize: "0.75rem", color: "#555", fontStyle: "italic" }}>No functions detected</div>
                ) : (
                  analysisResult.functions.names.map(fname => {
                    const cx = analysisResult.complexity?.[fname] || 0;
                    const badgeColor = cx <= 5 ? "#4caf50" : cx <= 10 ? "#ff9800" : "#f44336";
                    const isActive = currentFunc === fname;
                    return (
                      <div
                        key={fname}
                        onClick={() => handleAnalyze(fname)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "6px 8px", marginBottom: "2px", borderRadius: "4px", cursor: "pointer",
                          background: isActive ? "#2a2d2e" : "transparent",
                          borderLeft: isActive ? `2px solid ${badgeColor}` : "2px solid transparent",
                          fontSize: "0.8rem", color: isActive ? "#fff" : "#bbb",
                          transition: "background 0.15s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#2a2d2e"}
                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                          <Code size={12} color={badgeColor} />
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fname}()</span>
                        </div>
                        <span style={{
                          background: badgeColor + "22", color: badgeColor, fontSize: "0.65rem",
                          padding: "2px 6px", borderRadius: "10px", fontWeight: "bold", flexShrink: 0
                        }}>
                          {cx}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Complexity Gauge */}
              {currentFunc && analysisResult?.complexity?.[currentFunc] != null && (
                <div style={{ padding: "12px", borderBottom: "1px solid #333" }}>
                  <div style={{ fontSize: "0.7rem", color: "#666", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "0.5px" }}>Complexity</div>
                  {(() => {
                    const cx = analysisResult.complexity[currentFunc];
                    const pct = Math.min(cx / 20 * 100, 100);
                    const barColor = cx <= 5 ? "#4caf50" : cx <= 10 ? "#ff9800" : "#f44336";
                    const label = cx <= 5 ? "Simple" : cx <= 10 ? "Moderate" : cx <= 15 ? "Complex" : "Very Complex";
                    return (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ fontSize: "0.75rem", color: "#ccc" }}>{currentFunc}()</span>
                          <span style={{ fontSize: "0.75rem", color: barColor, fontWeight: "bold" }}>{cx} — {label}</span>
                        </div>
                        <div style={{ background: "#1e1e1e", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
                          <div style={{
                            width: `${pct}%`, height: "100%", borderRadius: "4px",
                            background: `linear-gradient(90deg, #4caf50, ${barColor})`,
                            transition: "width 0.6s ease, background 0.6s ease",
                            boxShadow: `0 0 8px ${barColor}44`
                          }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* AI Explain Button */}
              {analysisResult && (
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
                  <button
                    onClick={handleExplain}
                    disabled={aiLoading}
                    style={{
                      width: '100%', padding: '8px 12px',
                      background: aiLoading ? '#333' : 'linear-gradient(135deg, #7c4dff, #448aff)',
                      border: 'none', borderRadius: '6px', cursor: aiLoading ? 'wait' : 'pointer',
                      color: '#fff', fontSize: '0.78rem', fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      transition: 'all 0.2s', boxShadow: aiLoading ? 'none' : '0 2px 8px rgba(124, 77, 255, 0.3)',
                    }}
                  >
                    {aiLoading ? <Loader size={14} className="spin" /> : <Zap size={14} />}
                    {aiLoading ? 'Thinking...' : `✨ Explain ${currentFunc ? currentFunc + '()' : 'Code'}`}
                  </button>
                </div>
              )}

              {/* AI Explanation */}
              {aiExplanation && (
                <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
                  <div style={{ fontSize: '0.7rem', color: '#7c4dff', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={12} /> AI Explanation
                  </div>
                  {(() => {
                    // Parse structured response into Overview + Algorithm
                    const text = aiExplanation;
                    const overviewMatch = text.match(/OVERVIEW:\s*\n?([\s\S]*?)(?=\n\s*ALGORITHM:|$)/i);
                    const algorithmMatch = text.match(/ALGORITHM:\s*\n?([\s\S]*?)$/i);
                    const overview = overviewMatch ? overviewMatch[1].trim() : text;
                    const algorithm = algorithmMatch ? algorithmMatch[1].trim() : null;

                    return (
                      <>
                        {/* Overview */}
                        <div style={{
                          background: 'linear-gradient(135deg, #1a1a2e 0%, #1e1e1e 100%)',
                          borderRadius: '8px', padding: '10px 12px', marginBottom: '8px',
                          fontSize: '0.76rem', color: '#d4d4d4', lineHeight: '1.5',
                          borderLeft: '3px solid #7c4dff',
                          fontFamily: 'system-ui, sans-serif',
                        }}>
                          {overview}
                        </div>

                        {/* Algorithm Steps */}
                        {algorithm && (
                          <div style={{
                            background: '#1a1a1a', borderRadius: '8px', padding: '10px 12px',
                            fontSize: '0.72rem', lineHeight: '1.6', fontFamily: 'system-ui, sans-serif',
                          }}>
                            <div style={{ color: '#7c4dff', fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>
                              Algorithm
                            </div>
                            {algorithm.split('\n').filter(l => l.trim()).map((line, i) => {
                              const isCheck = /check:/i.test(line);
                              const isLoop = /loop:/i.test(line);
                              const isStart = /^\s*1[\.\)]/i.test(line) || /\bstart\b/i.test(line) || /\bbegin\b/i.test(line);
                              const isReturn = /\breturn\b/i.test(line) || /\bend\b/i.test(line) || /\boutput\b/i.test(line);
                              const color = isCheck ? '#ff9800' : isLoop ? '#00bcd4' : isStart ? '#4caf50' : isReturn ? '#f44336' : '#aaa';
                              const highlighted = isCheck || isLoop || isStart || isReturn;
                              return (
                                <div key={i} style={{
                                  padding: '3px 0', color,
                                  borderLeft: `2px solid ${highlighted ? color : 'transparent'}`,
                                  paddingLeft: highlighted ? '8px' : '0',
                                  marginBottom: '2px',
                                }}>
                                  {line.trim()}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Insights */}
              {analysisResult?.insights && (
                <div style={{ padding: "12px" }}>
                  <div style={{ fontSize: "0.7rem", color: "#666", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "0.5px" }}>Insights</div>
                  <div style={{
                    background: "#1e1e1e", borderRadius: "6px", padding: "10px 12px", marginBottom: "10px",
                    fontSize: "0.78rem", color: "#ccc", lineHeight: "1.5",
                    borderLeft: "3px solid #4caf50"
                  }}>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
                      {analysisResult.insights.decision_count > 0 && (
                        <span style={{ background: "#ff980022", color: "#ff9800", padding: "2px 8px", borderRadius: "10px", fontSize: "0.65rem" }}>
                          🔀 {analysisResult.insights.decision_count} branch{analysisResult.insights.decision_count !== 1 ? "es" : ""}
                        </span>
                      )}
                      {analysisResult.insights.loop_count > 0 && (
                        <span style={{ background: "#00bcd422", color: "#00bcd4", padding: "2px 8px", borderRadius: "10px", fontSize: "0.65rem" }}>
                          🔁 {analysisResult.insights.loop_count} loop{analysisResult.insights.loop_count !== 1 ? "s" : ""}
                        </span>
                      )}
                      {analysisResult.insights.return_count > 0 && (
                        <span style={{ background: "#f4433622", color: "#f44336", padding: "2px 8px", borderRadius: "10px", fontSize: "0.65rem" }}>
                          ↩ {analysisResult.insights.return_count} return{analysisResult.insights.return_count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {analysisResult.insights.summary}
                  </div>
                  {analysisResult.insights.suggestions?.map((s, i) => {
                    const icon = s.type === "warning" ? <AlertTriangle size={13} color="#ff9800" /> : s.type === "success" ? <CheckCircle size={13} color="#4caf50" /> : <Info size={13} color="#64b5f6" />;
                    const borderColor = s.type === "warning" ? "#ff9800" : s.type === "success" ? "#4caf50" : "#64b5f6";
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "flex-start", gap: "8px",
                        background: "#1e1e1e", borderRadius: "6px", padding: "8px 10px", marginBottom: "6px",
                        borderLeft: `3px solid ${borderColor}`, fontSize: "0.75rem", color: "#aaa", lineHeight: "1.4"
                      }}>
                        <div style={{ flexShrink: 0, marginTop: "1px" }}>{icon}</div>
                        <span>{s.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* API SETTINGS MODAL */}
      {showApiKeyModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
        }} onClick={() => setShowApiKeyModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#252526', border: '1px solid #444', borderRadius: '12px',
            padding: '24px', width: '460px', maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={18} color="#7c4dff" /> API Settings
            </h3>

            {/* Gemini AI Key Section */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Zap size={14} color="#7c4dff" />
                <span style={{ fontSize: '0.8rem', color: '#ccc', fontWeight: 600 }}>Gemini AI Key</span>
              </div>
              <p style={{ color: '#888', fontSize: '0.7rem', margin: '0 0 8px' }}>
                For AI-powered explanations. Get one free at{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#7c4dff' }}>aistudio.google.com</a>
              </p>
              <input
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                placeholder="AIza..."
                style={{
                  width: '100%', padding: '8px 12px', background: '#1e1e1e', border: '1px solid #444',
                  borderRadius: '6px', color: '#d4d4d4', fontSize: '0.8rem', fontFamily: 'monospace',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {apiKeyStatus === 'error' && (
                <p style={{ color: '#f44336', fontSize: '0.7rem', margin: '6px 0 0' }}>⚠️ Invalid API key.</p>
              )}
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: '#444', margin: '0 0 20px' }} />

            {/* GitHub Token Section */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Github size={14} color="#fff" />
                <span style={{ fontSize: '0.8rem', color: '#ccc', fontWeight: 600 }}>GitHub Token</span>
                {githubRateInfo && (
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.65rem', padding: '2px 8px',
                    borderRadius: '10px',
                    background: githubRateInfo.remaining < 10 ? '#f4433620' : '#23863620',
                    color: githubRateInfo.remaining < 10 ? '#f44336' : '#4caf50',
                  }}>
                    {githubRateInfo.remaining}/{githubRateInfo.limit} req left
                  </span>
                )}
              </div>
              <p style={{ color: '#888', fontSize: '0.7rem', margin: '0 0 8px' }}>
                Optional. Without a token: 60 req/hr. With a token: 5,000 req/hr.{' '}
                <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" style={{ color: '#238636' }}>Generate token</a>
              </p>
              <input
                type="password"
                value={githubToken}
                onChange={(e) => {
                  setGithubToken(e.target.value);
                  localStorage.setItem('codemap_github_token', e.target.value);
                }}
                placeholder="ghp_... (no special scopes needed for public repos)"
                style={{
                  width: '100%', padding: '8px 12px', background: '#1e1e1e', border: '1px solid #444',
                  borderRadius: '6px', color: '#d4d4d4', fontSize: '0.8rem', fontFamily: 'monospace',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {githubRateInfo && githubRateInfo.remaining < 5 && (
                <p style={{ color: '#f44336', fontSize: '0.65rem', margin: '6px 0 0' }}>
                  ⚠️ Rate limit almost exhausted. {githubToken ? 'Token may be invalid.' : 'Add a token above.'}
                  {githubRateInfo.reset && ` Resets at ${githubRateInfo.reset.toLocaleTimeString()}.`}
                </p>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowApiKeyModal(false)} style={{
                padding: '8px 16px', background: 'transparent', border: '1px solid #555',
                borderRadius: '6px', color: '#888', cursor: 'pointer', fontSize: '0.8rem',
              }}>Close</button>
              <button onClick={handleSaveApiKey} style={{
                padding: '8px 20px', background: 'linear-gradient(135deg, #7c4dff, #448aff)',
                border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 600,
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Repo Overview Popup */}
      {showGithubPopup && githubQuickStats && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}
          onClick={() => setShowGithubPopup(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#252526', borderRadius: '16px', padding: '28px 32px',
              border: '1px solid #444', width: '520px', maxWidth: '90vw',
              maxHeight: '85vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Github size={22} color="#fff" />
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                  {githubQuickStats.owner}/{githubQuickStats.repo}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#888', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <GitBranch size={10} /> {githubQuickStats.branch}
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              <div style={{ background: '#1e1e1e', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#4caf50' }}>{githubQuickStats.totalFiles}</div>
                <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '2px' }}>Total Files</div>
              </div>
              <div style={{ background: '#1e1e1e', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#ff9800' }}>{githubQuickStats.codeFiles}</div>
                <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '2px' }}>Code Files</div>
              </div>
              <div style={{ background: '#1e1e1e', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#00bcd4' }}>
                  {githubQuickStats.totalSize > 1048576 ? `${(githubQuickStats.totalSize / 1048576).toFixed(1)}MB` : githubQuickStats.totalSize > 1024 ? `${(githubQuickStats.totalSize / 1024).toFixed(0)}KB` : `${githubQuickStats.totalSize}B`}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '2px' }}>Est. Size</div>
              </div>
            </div>

            {/* Language Breakdown */}
            {Object.keys(githubQuickStats.langBreakdown).length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Languages</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Object.entries(githubQuickStats.langBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([lang, count]) => {
                      const langColors = { Python: '#3572A5', Java: '#b07219', JavaScript: '#f1e05a', TypeScript: '#3178c6', 'C++': '#f34b7d', C: '#555555', 'C/C++': '#555555', 'C#': '#178600', Go: '#00ADD8', Rust: '#dea584', Ruby: '#701516' };
                      return (
                        <div key={lang} style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          background: '#1e1e1e', padding: '4px 10px', borderRadius: '12px',
                          fontSize: '0.72rem', color: '#ccc',
                        }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: langColors[lang] || '#888' }} />
                          {lang} <span style={{ color: '#666' }}>({count})</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* README Preview */}
            {githubReadmeHtml && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>README</div>
                <div
                  style={{
                    background: '#1e1e1e', borderRadius: '10px', padding: '16px',
                    maxHeight: '250px', overflowY: 'auto',
                    fontSize: '0.78rem', color: '#ccc', lineHeight: '1.6',
                    border: '1px solid #333',
                  }}
                  dangerouslySetInnerHTML={{ __html: githubReadmeHtml }}
                  className="github-readme-preview"
                />
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowGithubPopup(false)}
                style={{
                  flex: 1, padding: '10px', background: 'transparent', border: '1px solid #555',
                  borderRadius: '8px', color: '#888', cursor: 'pointer', fontSize: '0.8rem',
                }}
              >
                Browse Only
              </button>
              <button
                onClick={handleAnalyzeGithubRepo}
                style={{
                  flex: 2, padding: '10px',
                  background: 'linear-gradient(135deg, #238636, #2ea043)',
                  border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer',
                  fontSize: '0.85rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
              >
                <Zap size={14} /> Analyze Repo
              </button>
            </div>
          </div>
        </div>
      )}
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
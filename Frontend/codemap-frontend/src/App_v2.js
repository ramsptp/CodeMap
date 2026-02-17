import React, { useState, useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
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
import { toPng } from 'html-to-image';
import {
  Folder, Code, GitBranch, Play, Settings,
  Columns, ClipboardList, Plus, ArrowLeft,
  FileText, Layers, Trash2, FileCode, ChevronDown, Edit3,
  Search, FolderOpen, ChevronRight, Move, Maximize, Minus, X, Download, Github, Loader,
  AlertTriangle, CheckCircle, Info, Zap, Image
} from "lucide-react";
import FileExplorer from './components/FileExplorer';
import GitHubExplorer from './components/GitHubExplorer';
import { parseRepoInput, fetchDefaultBranch, fetchRepoTree, fetchFileContent } from './utils/githubApi';

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
  dagreGraph.setGraph({
    rankdir: 'TB',     // Top to Bottom main flow
    nodesep: 80,       // Increased horizontal spacing
    ranksep: 80,       // Increased vertical spacing
    edgesep: 40,       // Tighter edges
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
        // Invisible Merge Node
        width = 1;
        height = 1;
      } else {
        width = 220; // Wider process nodes
        height = 60;
      }
    }

    dagreGraph.setNode(node.id, { width, height });
  });

  // Add edges with rank constraints
  edges.forEach((edge) => {
    // Force smoothstep for professional circuit-board look
    edge.type = 'smoothstep';
    edge.style = { ...edge.style, strokeWidth: 2, borderRadius: 20 }; // Smooth corners
    edge.animated = true; // Keep animation

    const edgeConfig = {};

    // Give False/Done branches more weight to push them horizontally
    if (edge.label === "False" || edge.label === "Done") {
      edgeConfig.weight = 2; // slightly less than before to allow manual override
    } else if (edge.label === "True" || edge.label === "Loop") {
      edgeConfig.weight = 1;
    }

    dagreGraph.setEdge(edge.source, edge.target, edgeConfig);
  });

  dagre.layout(dagreGraph);

  // ===============================================
  // POST-PROCESSING: THE "IRON SPINE" ALGORITHM
  // ===============================================

  // 1. Helper: Force a vertical line down from a start node (Brute Force)
  // NOW WITH STRICT DOMINATOR CHECK TO PREVENT LEAKING TO MERGE NODES
  const forceRightBranchAlignment = (startNodeId, targetX, sourceId, visited = new Set()) => {
    if (visited.has(startNodeId)) return;

    // STRICT DOMINATOR CHECK
    // We only move this node if ALL its incoming edges come from:
    // 1. The 'sourceId' (parent of the branch)
    // 2. Nodes we have already visited/claimed in this traversal
    const incomingEdges = edges.filter(e => e.target === startNodeId);

    // Exception: If it's the very first node of the branch (direct child of sourceId),
    // and it has other parents (e.g. merge), we might still want to shift it 
    // IF the logic is "Right Branch starts here". 
    // BUT if the first node is a merge node (e.g. empty true block), we should NOT shift it.
    // So the check holds.

    const isDominated = incomingEdges.every(e => {
      return e.source === sourceId || visited.has(e.source);
    });

    // Debug
    // console.log(`Checking ${startNodeId} for domination by [${sourceId}, ...visited]`);

    if (!isDominated) {
      // console.log(`STOP: Node ${startNodeId} is not dominated (has external incoming edges)`);
      return;
    }

    visited.add(startNodeId);

    const node = dagreGraph.node(startNodeId);
    if (!node) return;

    // FORCE X
    node.x = targetX;

    // Propagate to all children
    const childrenEdges = edges.filter(e => e.source === startNodeId);
    childrenEdges.forEach(e => {
      forceRightBranchAlignment(e.target, targetX, sourceId, visited);
    });
  };

  // 2. Helper: Shift a subtree (for initial placement)
  const shiftSubtree = (nodeId, deltaX, visited = new Set()) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = dagreGraph.node(nodeId);
    if (node) {
      node.x += deltaX;
      edges.filter(e => e.source === nodeId).forEach(e => {
        shiftSubtree(e.target, deltaX, visited);
      });
    }
  };

  // 3. Helper: Standard Recursive Vertical Aligner (for Down/False branch)
  const alignVertical = (targetId, targetX, sourceId, visited = new Set()) => {
    if (visited.has(targetId)) return;

    // Same Dominator Check for Vertical Alignment?
    // Generally yes, we don't want to force-align a merge node to the False branch
    // if it also receives the True branch (from the right). 
    // Merge node should ideally be centered (Dagre default), or aligned with Decision?
    // If aligned with Decision, then False branch wins.
    // Let's keep it simple: strict visual flow for straight down.

    const incomingEdges = edges.filter(e => e.target === targetId);
    const isDominated = incomingEdges.every(e => {
      return e.source === sourceId || visited.has(e.source);
    });

    if (!isDominated) return;

    visited.add(targetId);

    const targetNode = dagreGraph.node(targetId);
    if (!targetNode) return;

    // Snap to column
    targetNode.x = targetX;

    // Recursion
    const childrenEdges = edges.filter(e => e.source === targetId);
    childrenEdges.forEach(edge => {
      alignVertical(edge.target, targetX, sourceId, visited);
    });
  };

  // Scan Decision AND Loop Nodes
  nodes.forEach(node => {
    if (node.type === "decision" || node.type === "loop") {
      const decisionNode = dagreGraph.node(node.id);

      // --- RIGHT BRANCH (True / Done) ---
      const rightEdge = edges.find(e => e.source === node.id && (e.label === "True" || e.label === "Done"));
      if (rightEdge) {
        const targetId = rightEdge.target;
        // Pass 'node.id' as the authorized source
        forceRightBranchAlignment(targetId, decisionNode.x + 200, node.id);
      }

      // --- DOWN BRANCH (False / Loop) ---
      const downEdge = edges.find(e => e.source === node.id && (e.label === "False" || e.label === "Loop"));
      if (downEdge) {
        alignVertical(downEdge.target, decisionNode.x, node.id);
      }
    }
  });

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
        xOffset = 110;
        yOffset = 30;
      }
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
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  return { nodes: layoutedNodes, edges };
};

// ===========================================
// 3. GRAPH COMPONENT (WITH LAYOUT MEMORY)
// ===========================================
const nodeTypes = {
  terminator: TerminatorNode,
  process: ProcessNode,
  decision: DecisionNode,
  loop: LoopNode
};

const FlowGraph = forwardRef(({ data, onNodeClick, graphMemory, setGraphMemory, memoryKey }, ref) => {
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
    const layout = getLayoutedElements(data.nodes, data.edges || []);

    // layoutCache.current[cacheKey] = layout; // Disable saving to cache
    return layout;
  }, [data.nodes, data.edges, memoryKey]); // Removed graphKey to avoid loops: layout

  // Update React Flow state when layout changes
  useEffect(() => {
    if (layoutedNodes.length > 0) {
      // Only update if actually different to avoid loops
      // Simple length check or just trust the memo
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
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

const FileDepGraph = ({ dependencies, fileTree, selectedFile, onFileSelect, graphMemory, setGraphMemory }) => {
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
  }, [graphKey, dependencies, setGraphMemory, graphMemory, selectedFile]); // selectedFile added for memory load selection

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
          nodeTypes={nodeTypes}
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
  const [viewMode, setViewMode] = useState("split");
  const [currentFunc, setCurrentFunc] = useState(null);

  // Panel widths (resizable)
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [codePaneWidth, setCodePaneWidth] = useState(40); // percentage
  const [rightPanelWidth, setRightPanelWidth] = useState(260);
  const containerRef = useRef(null);
  const graphRef = useRef(null);
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
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);

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
    try {
      const branch = await fetchDefaultBranch(parsed.owner, parsed.repo);
      const tree = await fetchRepoTree(parsed.owner, parsed.repo, branch);
      setGithubRepoInfo({ ...parsed, branch });
      setGithubTree(tree);
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
    setGithubLoadingFile(filePath);
    setAnalysisResult(null);
    setCurrentFunc(null);
    try {
      const content = await fetchFileContent(githubRepoInfo.owner, githubRepoInfo.repo, node._ghPath);
      setGithubFileContent(content);
      setGithubLoadingFile(null);

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

  // 4. GRAPH LAYOUT MEMORY STATE
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

        <div
          onClick={() => setSidebarView("github")}
          style={{ cursor: "pointer", borderLeft: sidebarView === "github" ? "2px solid #4caf50" : "2px solid transparent", width: "100%", display: "flex", justifyContent: "center", padding: "5px 0" }}
          title="GitHub Explorer"
        >
          <Github size={24} color={sidebarView === "github" ? "#fff" : "#777"} />
        </div>

        <Settings size={24} color="#777" style={{ marginTop: "auto", cursor: "pointer" }} />
      </div>

      {/* 2. SIDEBAR CONTENT */}
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
      </div>

      {/* SIDEBAR DIVIDER */}
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

            <button style={runBtnStyle} onClick={() => handleAnalyze(null)}>
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
          </div>
        </div>

        {/* CANVAS */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex" }}>
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

          {(viewMode === "graph" || viewMode === "split") && (
            <div style={{ flex: 1, position: "relative", height: "100%", background: "#1e1e1e" }}>
              {loading ? (
                <div style={centerMsgStyle}>Analyzing...</div>
              ) : analysisResult && analysisResult.graph_data ? (
                <FlowGraph
                  ref={graphRef}
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
              />
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL DIVIDER */}
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

      {/* 4. RIGHT PANEL — INSPECTOR */}
      <div style={{ width: `${rightPanelWidth}px`, background: "#252526", borderLeft: "none", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ padding: "12px 15px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: "8px" }}>
          <Search size={14} color="#4caf50" /> Inspector
        </div>

        {!analysisResult ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#555", fontSize: "0.8rem", fontStyle: "italic" }}>
            Analyze code to see insights here.
          </div>
        ) : (
          <>
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
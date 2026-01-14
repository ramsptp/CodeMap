import ast
import re
import logging
import uuid
from typing import Optional
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CodeRequest(BaseModel):
    code: str
    language: str = "python"
    function_name: Optional[str] = None

# ==========================================
# 1. CORE BUILDER
# ==========================================
class ReactFlowBuilder:
    def __init__(self):
        self.nodes = []
        self.edges = []
        self._id_counter = 0

    def new_id(self):
        self._id_counter += 1
        return str(self._id_counter)

    def add_node(self, label, type="process", position=None):
        nid = self.new_id()
        pos = position if position else {"x": 0, "y": 0}
        self.nodes.append({
            "id": nid,
            "data": {"label": label},
            "type": type, 
            "position": pos
        })
        return nid

    def add_edge(self, source, target, label=None):
        if source and target:
            edge_id = f"e{source}-{target}-{uuid.uuid4().hex[:4]}"
            edge = {
                "id": edge_id,
                "source": source,
                "target": target,
                "type": "smoothstep", 
                "animated": True,
                "style": {"stroke": "#b1b1b7", "strokeWidth": 2},
            }
            if label:
                edge["label"] = label
                edge["labelStyle"] = {"fill": "#fff", "fontWeight": 700}
                edge["labelShowBg"] = True
                edge["labelBgStyle"] = {"fill": "#1e1e1e"}
            self.edges.append(edge)

    def get_data(self):
        return {"nodes": self.nodes, "edges": self.edges}

# ==========================================
# 2. COMPLEXITY METRICS
# ==========================================
def calculate_python_complexity(node):
    complexity = 1
    for child in ast.walk(node):
        if isinstance(child, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.ExceptHandler)):
            complexity += 1
    return complexity

def calculate_java_complexity(body: str):
    complexity = 1
    keywords = ["if", "for", "while", "case", "catch"]
    for kw in keywords:
        matches = re.findall(rf"\b{kw}\b", body)
        complexity += len(matches)
    return complexity

# ==========================================
# 3. PYTHON PARSER
# ==========================================
class PythonFlowBuilder(ReactFlowBuilder):
    def stmt_sequence(self, stmts):
        entry = last_exit = None
        terminal = False

        for stmt in stmts:
            s_entry, s_exit, s_term = self.process_stmt(stmt)
            if not s_entry: continue

            if entry is None: entry = s_entry
            if last_exit: self.add_edge(last_exit, s_entry)
            
            last_exit = s_exit
            if s_term:
                terminal = True
                break
        return entry, last_exit, terminal

    def process_stmt(self, stmt):
        if isinstance(stmt, ast.Return):
            val = ast.unparse(stmt.value) if stmt.value else "None"
            node = self.add_node(f"return {val}", "terminator")
            return node, node, True
        
        if isinstance(stmt, ast.If):
            cond_node = self.add_node(f"If: {ast.unparse(stmt.test)}", "decision")
            t_entry, t_exit, t_term = self.stmt_sequence(stmt.body)
            if t_entry: self.add_edge(cond_node, t_entry, "True")

            f_entry = f_exit = None
            f_term = False
            if stmt.orelse:
                f_entry, f_exit, f_term = self.stmt_sequence(stmt.orelse)
                if f_entry: self.add_edge(cond_node, f_entry, "False")

            if not (t_term and f_term):
                merge = self.add_node("", "process") 
                if t_exit and not t_term: self.add_edge(t_exit, merge)
                if f_exit and not f_term: self.add_edge(f_exit, merge)
                if not stmt.orelse: self.add_edge(cond_node, merge, "False")
                return cond_node, merge, False
            return cond_node, None, True
        
        if isinstance(stmt, (ast.While, ast.For)):
            if isinstance(stmt, ast.While):
                label = f"While {ast.unparse(stmt.test)}"
            else:
                label = f"For {ast.unparse(stmt.target)} in {ast.unparse(stmt.iter)}"
            
            cond = self.add_node(label, "loop")
            body_entry, body_exit, body_term = self.stmt_sequence(stmt.body)
            if body_entry: self.add_edge(cond, body_entry, "Loop")
            if body_exit and not body_term: self.add_edge(body_exit, cond)
            after = self.add_node("Exit Loop", "process")
            self.add_edge(cond, after, "Done")
            return cond, after, False

        try:
            label = ast.unparse(stmt)
        except:
            label = "Statement"
        node = self.add_node(label, "process")
        return node, node, False

    def build_for_function(self, func):
        self.nodes, self.edges, self._id_counter = [], [], 0
        start = self.add_node(f"Start: {func.name}", "terminator")
        entry, _, _ = self.stmt_sequence(func.body)
        if entry: self.add_edge(start, entry)
        return self.get_data()

# ==========================================
# 4. JAVA PARSER
# ==========================================
JAVA_METHOD_REGEX = re.compile(r"(public|private|protected)?\s*(static)?\s*[\w<>]+\s+(\w+)\s*\((.*?)\)\s*\{", re.MULTILINE)

def extract_java_methods(code: str):
    methods = []
    for m in JAVA_METHOD_REGEX.finditer(code):
        name = m.group(3)
        start = m.end()
        brace = 1
        i = start
        while i < len(code) and brace > 0:
            if code[i] == "{": brace += 1
            elif code[i] == "}": brace -= 1
            i += 1
        body = code[start:i-1].strip()
        methods.append({"name": name, "body": body})
    return methods

def parse_java_structure(code):
    statements = []
    current = []
    depth_brace = 0
    depth_paren = 0
    
    for char in code:
        current.append(char)
        if char == '{': depth_brace += 1
        elif char == '}': depth_brace -= 1
        elif char == '(': depth_paren += 1
        elif char == ')': depth_paren -= 1
        
        if char == ';' and depth_brace == 0 and depth_paren == 0:
            statements.append("".join(current).strip())
            current = []
        elif char == '}' and depth_brace == 0:
            statements.append("".join(current).strip())
            current = []
            
    if current and "".join(current).strip():
        statements.append("".join(current).strip())
        
    return statements

class JavaFlowBuilder(ReactFlowBuilder):
    def build_for_body(self, name, body_text):
        self.nodes, self.edges, self._id_counter = [], [], 0
        start = self.add_node(f"Start: {name}", "terminator")
        last_node = start
        
        stmts = parse_java_structure(body_text)
        
        for stmt in stmts:
            # 1. FOR LOOP
            if stmt.startswith("for"):
                header_match = re.search(r"for\s*\((.*?)\)", stmt)
                header = header_match.group(0) if header_match else "For Loop"
                
                loop_node = self.add_node(header, "loop")
                self.add_edge(last_node, loop_node)
                
                # EXTRACT BODY
                body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
                body_content = body_match.group(1).strip() if body_match else "..."
                
                # UPDATED: Show the actual content, not "Loop Body"
                body_node = self.add_node(body_content, "process")
                
                self.add_edge(loop_node, body_node, "True")
                self.add_edge(body_node, loop_node) 
                
                merge = self.add_node("", "process") 
                self.add_edge(loop_node, merge, "Done")
                last_node = merge
                
            # 2. WHILE LOOP
            elif stmt.startswith("while"):
                header_match = re.search(r"while\s*\((.*?)\)", stmt)
                header = header_match.group(0) if header_match else "While Loop"
                
                loop_node = self.add_node(header, "loop")
                self.add_edge(last_node, loop_node)
                
                body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
                body_content = body_match.group(1).strip() if body_match else "..."
                
                # UPDATED: Show actual content
                body_node = self.add_node(body_content, "process")
                
                self.add_edge(loop_node, body_node, "True")
                self.add_edge(body_node, loop_node)
                
                merge = self.add_node("", "process")
                self.add_edge(loop_node, merge, "Done")
                last_node = merge

            # 3. IF STATEMENT
            elif stmt.startswith("if"):
                header_match = re.search(r"if\s*\((.*?)\)", stmt)
                header = header_match.group(0) if header_match else "If"
                
                decision = self.add_node(header, "decision")
                self.add_edge(last_node, decision)
                
                # True Branch - Extract Body
                body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
                body_content = body_match.group(1).strip() if body_match else "..."
                
                true_node = self.add_node(body_content, "process")
                self.add_edge(decision, true_node, "True")
                
                merge = self.add_node("", "process")
                self.add_edge(true_node, merge)
                self.add_edge(decision, merge, "False")
                last_node = merge

            # 4. RETURN
            elif stmt.startswith("return"):
                node = self.add_node(stmt, "terminator")
                self.add_edge(last_node, node)
                last_node = None
            
            # 5. GENERIC
            else:
                node = self.add_node(stmt, "process")
                if last_node: self.add_edge(last_node, node)
                last_node = node
                
        return self.get_data()

# ==========================================
# 5. CALL GRAPH & API
# ==========================================
def build_python_call_graph(tree):
    builder = ReactFlowBuilder()
    funcs = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    func_map = {}
    for f in funcs:
        func_map[f.name] = builder.add_node(f.name, "process")
    for f in funcs:
        src_id = func_map[f.name]
        for node in ast.walk(f):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                target_name = node.func.id
                if target_name in func_map:
                    target_id = func_map[target_name]
                    builder.add_edge(src_id, target_id)
    return builder.get_data()

def build_java_call_graph(methods):
    builder = ReactFlowBuilder()
    method_map = {}
    for m in methods:
        method_map[m["name"]] = builder.add_node(m["name"], "process")
    for m in methods:
        src_id = method_map[m["name"]]
        for other_m in methods:
            if m["name"] == other_m["name"]: continue
            if re.search(rf"\b{other_m['name']}\s*\(", m["body"]):
                target_id = method_map[other_m["name"]]
                builder.add_edge(src_id, target_id)
    return builder.get_data()

@app.post("/analyze")
async def analyze_code(request: CodeRequest):
    result = {
        "functions": {"names": [], "count": 0}, 
        "graph_data": None, 
        "complexity": {}
    }
    
    try:
        if request.language == "python":
            tree = ast.parse(request.code)
            funcs = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
            result["functions"]["names"] = [f.name for f in funcs]
            result["functions"]["count"] = len(funcs)
            result["complexity"] = {f.name: calculate_python_complexity(f) for f in funcs}
            
            if request.function_name:
                target = next((f for f in funcs if f.name == request.function_name), None)
                if target:
                    result["graph_data"] = PythonFlowBuilder().build_for_function(target)
            else:
                if len(funcs) > 1:
                    result["graph_data"] = build_python_call_graph(tree)
                elif len(funcs) == 1:
                    result["graph_data"] = PythonFlowBuilder().build_for_function(funcs[0])
                else:
                    wrapper = ast.FunctionDef(name="Script", args=ast.arguments(args=[], defaults=[]), body=tree.body, decorator_list=[])
                    result["graph_data"] = PythonFlowBuilder().build_for_function(wrapper)

        elif request.language == "java":
            methods = extract_java_methods(request.code)
            result["functions"]["names"] = [m["name"] for m in methods]
            result["functions"]["count"] = len(methods)
            result["complexity"] = {m["name"]: calculate_java_complexity(m["body"]) for m in methods}
            
            if request.function_name:
                target = next((m for m in methods if m["name"] == request.function_name), None)
                if target:
                    result["graph_data"] = JavaFlowBuilder().build_for_body(target["name"], target["body"])
            else:
                if len(methods) > 1:
                    result["graph_data"] = build_java_call_graph(methods)
                elif len(methods) == 1:
                    result["graph_data"] = JavaFlowBuilder().build_for_body(methods[0]["name"], methods[0]["body"])

    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        return {"error": str(e)}

    return result
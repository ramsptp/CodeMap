# main.py
import ast
import logging
from fastapi import FastAPI, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# ---------------- Logging ----------------
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# ---------------- FastAPI ----------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Models ----------------
class CodeRequest(BaseModel):
    code: str

# ---------------- Utils ----------------
def escape_label(s: str) -> str:
    if s is None:
        return ""
    s = str(s)
    return s.replace("\n", " ").replace('"', "'").replace("|", "/").strip()

# ---------------- Flow Builder ----------------
class FlowBuilder:
    def __init__(self):
        self.nodes = []
        self.edges = []
        self._id = 0

    def new_id(self):
        nid = f"N{self._id}"
        self._id += 1
        return nid

    def add_node(self, label: str, shape: str = "rect"):
        label = escape_label(label)
        nid = self.new_id()
        self.nodes.append((nid, label, shape))
        logger.debug(f"add_node: {nid} ({shape}) '{label}'")
        return nid

    def add_edge(self, src, dst, label=None):
        if not src or not dst:
            return
        self.edges.append((src, dst, label))
        logger.debug(f"add_edge: {src} -> {dst} ({label})")

    def stmt_sequence(self, stmts):
        entry = last_exit = None
        terminal = False

        for stmt in stmts:
            s_entry, s_exit, s_term = self.process_stmt(stmt)
            if s_entry is None:
                continue
            if entry is None:
                entry = s_entry
            if last_exit:
                self.add_edge(last_exit, s_entry)
            last_exit = s_exit
            if s_term:
                terminal = True
                break

        return entry, last_exit, terminal

    def process_stmt(self, stmt):
        if isinstance(stmt, ast.Return):
            val = ast.unparse(stmt.value) if stmt.value else ""
            node = self.add_node(f"return {val}")
            return node, node, True

        if isinstance(stmt, (ast.Assign, ast.AugAssign, ast.Expr)):
            code = ast.unparse(stmt)
            node = self.add_node(code)
            return node, node, False

        if isinstance(stmt, ast.If):
            cond = ast.unparse(stmt.test)
            cond_node = self.add_node(cond, "diamond")

            t_entry, t_exit, t_term = self.stmt_sequence(stmt.body)
            if t_entry:
                self.add_edge(cond_node, t_entry, "True")

            f_entry = f_exit = None
            f_term = False
            if stmt.orelse:
                if len(stmt.orelse) == 1 and isinstance(stmt.orelse[0], ast.If):
                    f_entry, f_exit, f_term = self.process_stmt(stmt.orelse[0])
                else:
                    f_entry, f_exit, f_term = self.stmt_sequence(stmt.orelse)
                if f_entry:
                    self.add_edge(cond_node, f_entry, "False")

            if not (t_term and f_term):
                merge = self.add_node("Continue")
                if t_exit and not t_term:
                    self.add_edge(t_exit, merge)
                if f_exit and not f_term:
                    self.add_edge(f_exit, merge)
                if not stmt.orelse:
                    self.add_edge(cond_node, merge, "False")
                return cond_node, merge, False

            return cond_node, None, True

        if isinstance(stmt, (ast.For, ast.While)):
            header = ast.unparse(stmt)
            loop = self.add_node(header, "diamond")
            b_entry, b_exit, b_term = self.stmt_sequence(stmt.body)
            if b_entry:
                self.add_edge(loop, b_entry, "True")
            if b_exit and not b_term:
                self.add_edge(b_exit, loop, "Repeat")
            after = self.add_node("After Loop")
            self.add_edge(loop, after, "False")
            return loop, after, False

        node = self.add_node(ast.unparse(stmt))
        return node, node, False

    def build_for_function(self, func: ast.FunctionDef):
        self.nodes, self.edges, self._id = [], [], 0
        start = self.add_node(f"Function: {func.name}()", "circle")
        entry, _, _ = self.stmt_sequence(func.body)
        if entry:
            self.add_edge(start, entry)

        lines = ["flowchart TD"]
        for nid, label, shape in self.nodes:
            q = f'"{label}"'
            if shape == "circle":
                lines.append(f"{nid}(({q}))")
            elif shape == "diamond":
                lines.append(f"{nid}{{{q}}}")
            else:
                lines.append(f"{nid}[{q}]")

        for s, d, lbl in self.edges:
            if lbl:
                lines.append(f"{s} -->|{escape_label(lbl)}| {d}")
            else:
                lines.append(f"{s} --> {d}")

        return "\n".join(lines)

# ---------------- Call Graph ----------------
def generate_call_graph(tree: ast.AST):
    call_graph = {}
    current = None

    class V(ast.NodeVisitor):
        def visit_FunctionDef(self, node):
            nonlocal current
            current = node.name
            call_graph[current] = set()
            self.generic_visit(node)
            current = None

        def visit_Call(self, node):
            if current:
                if isinstance(node.func, ast.Name):
                    call_graph[current].add(node.func.id)
                elif isinstance(node.func, ast.Attribute):
                    call_graph[current].add(node.func.attr)
            self.generic_visit(node)

    V().visit(tree)
    return {k: list(v) for k, v in call_graph.items()}

def build_callgraph_mermaid(call_graph: dict):
    lines = ["flowchart LR"]
    for caller, callees in call_graph.items():
        for callee in callees:
            lines.append(f"{caller} --> {callee}")
    return "\n".join(lines)

# ---------------- API ----------------
@app.post("/analyze")
async def analyze_code(request: CodeRequest, function_name: str = Query(None)):
    try:
        tree = ast.parse(request.code)
    except Exception as e:
        return {"error": f"Parse error: {e}"}

    functions = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    func_names = [f.name for f in functions]

    result = {
        "functions": {"count": len(func_names), "names": func_names},
        "flowchart": None,
        "call_graph": None,
    }

    # Flowchart
    if function_name:
        target = next((f for f in functions if f.name == function_name), None)
        if not target:
            return {"error": f"Function '{function_name}' not found", **result}
        builder = FlowBuilder()
        result["flowchart"] = builder.build_for_function(target)

    # Call graph
    call_graph = generate_call_graph(tree)
    result["call_graph"] = build_callgraph_mermaid(call_graph)

    return result

@app.get("/")
async def root():
    return {"message": "CodeMap API running"}

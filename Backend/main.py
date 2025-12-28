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

# ---------------- Java Support ----------------
try:
    import javalang
    JAVA_ENABLED = True
    logger.info("Java support enabled")
except Exception:
    JAVA_ENABLED = False
    logger.warning("Java support NOT installed (pip install javalang)")

# ---------------- Models ----------------
class CodeRequest(BaseModel):
    code: str
    language: str = "python"   # <---- NEW

# ---------------- Utils ----------------
def escape_label(s: str) -> str:
    if s is None:
        return ""
    s = str(s)
    return s.replace("\n", " ").replace('"', "'").replace("|", "/").strip()

# ---------------- Flow Builder (Python) ----------------
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
        return nid

    def add_edge(self, src, dst, label=None):
        if not src or not dst:
            return
        self.edges.append((src, dst, label))

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
            node = self.add_node(ast.unparse(stmt))
            return node, node, False

        if isinstance(stmt, ast.If):
            cond_node = self.add_node(ast.unparse(stmt.test), "diamond")
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
            loop = self.add_node(ast.unparse(stmt), "diamond")
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

# ---------------- Call Graph (Python) ----------------
def generate_call_graph(tree: ast.AST):
    call_graph = {}
    defined = {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
    for name in defined:
        call_graph[name] = set()

    current = None

    class Visitor(ast.NodeVisitor):
        def visit_FunctionDef(self, node):
            nonlocal current
            current = node.name
            self.generic_visit(node)
            current = None

        def visit_Call(self, node):
            if current:
                fn = None
                if isinstance(node.func, ast.Name):
                    fn = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    fn = node.func.attr
                if fn in defined:
                    call_graph[current].add(fn)
            self.generic_visit(node)

    Visitor().visit(tree)
    return {k: list(v) for k, v in call_graph.items()}

def build_callgraph_mermaid(graph: dict):
    lines = ["flowchart LR"]
    for f in graph.keys():
        lines.append(f'{f}["{f}"]')
    for caller, callees in graph.items():
        for callee in callees:
            lines.append(f"{caller} --> {callee}")
    return "\n".join(lines)

# ---------------- Cyclomatic Complexity (Python) ----------------
def compute_cyclomatic_complexity(func: ast.FunctionDef) -> int:
    c = 1
    for node in ast.walk(func):
        if isinstance(node, (ast.If, ast.For, ast.While)):
            c += 1
        if isinstance(node, ast.BoolOp):
            c += len(node.values) - 1
    return c

# ---------------- Java Helpers ----------------
def java_parse(code: str):
    return javalang.parse.parse(code)

def java_functions(tree):
    methods = []
    for _, cls in tree.filter(javalang.tree.ClassDeclaration):
        for m in cls.methods:
            methods.append(m)
    return methods

# ---------------- API ----------------
@app.post("/analyze")
async def analyze_code(request: CodeRequest, function_name: str = Query(None)):

    # ---------- JAVA ----------
    if request.language.lower() == "java":
        if not JAVA_ENABLED:
            return {"error": "Java support not installed. Run: pip install javalang"}

        try:
            tree = java_parse(request.code)
        except Exception as e:
            return {"error": f"Java parse error: {e}"}

        funcs = java_functions(tree)
        names = [m.name for m in funcs]

        return {
            "language": "java",
            "functions": {"count": len(names), "names": names},
            "flowchart": None,
            "call_graph": None,
            "complexity": {m.name: 1 for m in funcs}  # placeholder
        }

    # ---------- PYTHON ----------
    try:
        tree = ast.parse(request.code)
    except Exception as e:
        return {"error": f"Parse error: {e}"}

    functions = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    func_names = [f.name for f in functions]

    complexity = {f.name: compute_cyclomatic_complexity(f) for f in functions}

    result = {
        "language": "python",
        "functions": {"count": len(func_names), "names": func_names},
        "flowchart": None,
        "call_graph": None,
        "complexity": complexity
    }

    if function_name:
        target = next((f for f in functions if f.name == function_name), None)
        if not target:
            return {"error": f"Function '{function_name}' not found", **result}
        builder = FlowBuilder()
        result["flowchart"] = builder.build_for_function(target)

    cg = generate_call_graph(tree)
    result["call_graph"] = build_callgraph_mermaid(cg)

    return result


@app.get("/")
async def root():
    return {"message": "CodeMap API running"}

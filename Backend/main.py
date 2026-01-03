import ast
import re
import logging
from fastapi import FastAPI, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.DEBUG)
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


def escape_label(s: str) -> str:
    if s is None:
        return ""
    return (
        str(s)
        .replace("\n", " ")
        .replace('"', "'")
        .replace("|", "/")
        .strip()
    )


# ---------------- FLOW BASE -----------------
class FlowBuilderBase:
    def __init__(self):
        self.nodes = []
        self.edges = []
        self._id = 0

    def new_id(self):
        nid = f"N{self._id}"
        self._id += 1
        return nid

    def add_node(self, label, shape="rect"):
        nid = self.new_id()
        self.nodes.append((nid, escape_label(label), shape))
        return nid

    def add_edge(self, src, dst, label=None):
        if src and dst:
            self.edges.append((src, dst, label))

    def render_mermaid(self):
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


# ---------------- PYTHON FLOW -----------------
class PythonFlowBuilder(FlowBuilderBase):
    def stmt_sequence(self, stmts):
        entry = last_exit = None
        terminal = False
        for stmt in stmts:
            s_entry, s_exit, s_term = self.process_stmt(stmt)
            if not s_entry:
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

        node = self.add_node(ast.unparse(stmt))
        return node, node, False

    def build_for_function(self, func):
        self.nodes, self.edges, self._id = [], [], 0
        start = self.add_node(f"Function: {func.name}()", "circle")
        entry, _, _ = self.stmt_sequence(func.body)
        if entry:
            self.add_edge(start, entry)
        return self.render_mermaid()


# ---------------- PYTHON COMPLEXITY -----------------
def compute_python_complexity(func: ast.FunctionDef) -> int:
    """
    Cyclomatic Complexity:
    base 1 + number of decision points
    """
    complexity = 1

    for node in ast.walk(func):
        if isinstance(node, (ast.If, ast.For, ast.While, ast.AsyncFor)):
            complexity += 1
        if isinstance(node, ast.BoolOp):  # and/or conditions
            complexity += len(node.values) - 1
        if isinstance(node, ast.Try):
            complexity += len(node.handlers)

    return complexity


# ---------------- JAVA PARSER -----------------
JAVA_METHOD_REGEX = re.compile(
    r"(public|private|protected)?\s*(static)?\s*[\w<>]+\s+(\w+)\s*\((.*?)\)\s*\{",
    re.MULTILINE,
)


def extract_java_methods(code: str):
    methods = []
    for m in JAVA_METHOD_REGEX.finditer(code):
        name = m.group(3)
        start = m.end()
        brace = 1
        i = start
        while i < len(code) and brace > 0:
            if code[i] == "{":
                brace += 1
            elif code[i] == "}":
                brace -= 1
            i += 1
        body = code[start : i - 1].strip()
        methods.append({"name": name, "body": body})
    return methods


# -------- JAVA SIMPLE AST --------
def parse_java_block(code, i=0):
    stmts = []

    def skip_ws(j):
        while j < len(code) and code[j].isspace():
            j += 1
        return j

    def parse_paren(j):
        depth = 0
        start = j
        while j < len(code):
            if code[j] == "(":
                depth += 1
            elif code[j] == ")":
                depth -= 1
                if depth == 0:
                    return code[start + 1 : j], j + 1
            j += 1
        return "", j

    i = skip_ws(i)

    while i < len(code):
        i = skip_ws(i)
        if i >= len(code):
            break

        if code[i] == "}":
            return stmts, i + 1

        if code.startswith("if", i):
            i += 2
            cond, i = parse_paren(i)
            i = skip_ws(i)
            body, i = parse_java_block(code, i + 1)
            i = skip_ws(i)
            else_body = []
            if code.startswith("else", i):
                i += 4
                i = skip_ws(i)
                else_body, i = parse_java_block(code, i + 1)
            stmts.append({"type": "if", "cond": cond, "then": body, "else": else_body})
            continue

        if code.startswith("while", i):
            i += 5
            cond, i = parse_paren(i)
            i = skip_ws(i)
            body, i = parse_java_block(code, i + 1)
            stmts.append({"type": "while", "cond": cond, "body": body})
            continue

        if code.startswith("for", i):
            i += 3
            cond, i = parse_paren(i)
            i = skip_ws(i)
            body, i = parse_java_block(code, i + 1)
            stmts.append({"type": "for", "cond": cond, "body": body})
            continue

        if code.startswith("return", i):
            j = code.find(";", i)
            stmts.append({"type": "return", "text": code[i:j]})
            i = j + 1
            continue

        j = code.find(";", i)
        stmts.append({"type": "stmt", "text": code[i:j]})
        i = j + 1

    return stmts, i


# -------- JAVA FLOW BUILDER --------
class JavaFlowBuilder(FlowBuilderBase):
    def build_block(self, stmts, start):
        last = start
        for s in stmts:
            if s["type"] == "stmt":
                node = self.add_node(s["text"])
                self.add_edge(last, node)
                last = node
                continue

            if s["type"] == "return":
                node = self.add_node(s["text"])
                self.add_edge(last, node)
                last = node
                break

            if s["type"] == "if":
                cond = self.add_node(s["cond"], "diamond")
                self.add_edge(last, cond)

                then_node = self.add_node("Then")
                self.add_edge(cond, then_node, "True")
                then_exit = self.build_block(s["then"], then_node)

                merge = self.add_node("Continue")

                if s["else"]:
                    else_node = self.add_node("Else")
                    self.add_edge(cond, else_node, "False")
                    else_exit = self.build_block(s["else"], else_node)
                    self.add_edge(else_exit, merge)
                else:
                    self.add_edge(cond, merge, "False")

                self.add_edge(then_exit, merge)
                last = merge
                continue

            if s["type"] in ("while", "for"):
                cond = self.add_node(s["cond"], "diamond")
                self.add_edge(last, cond)

                body = self.add_node("Loop body")
                self.add_edge(cond, body, "True")

                exit_node = self.build_block(s["body"], body)
                self.add_edge(exit_node, cond)

                after = self.add_node("After loop")
                self.add_edge(cond, after, "False")

                last = after
                continue

        return last

    def build_for_method(self, method):
        self.nodes, self.edges, self._id = [], [], 0
        start = self.add_node(f"Method: {method['name']}()", "circle")
        stmts, _ = parse_java_block("{"+method["body"]+"}", 1)
        end = self.build_block(stmts, start)
        self.add_edge(end, self.add_node("End"))
        return self.render_mermaid()


# -------- JAVA COMPLEXITY --------
def compute_java_complexity(method_body: str) -> int:
    """
    Very similar logic:
    base 1 + number of decision points
    """
    stmts, _ = parse_java_block("{"+method_body+"}", 1)

    def walk(nodes):
        total = 0
        for s in nodes:
            if s["type"] in ("if", "while", "for"):
                total += 1
            if s["type"] == "if":
                total += walk(s["then"]) + walk(s["else"])
            if s["type"] in ("while", "for"):
                total += walk(s["body"])
        return total

    return 1 + walk(stmts)


# ------------ CALL GRAPHS -------------
def build_python_call_graph(tree):
    graph = {}
    funcs = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    names = {f.name for f in funcs}
    for f in funcs:
        graph[f.name] = set()

        class V(ast.NodeVisitor):
            def visit_Call(self, node):
                if isinstance(node.func, ast.Name) and node.func.id in names:
                    graph[f.name].add(node.func.id)
                self.generic_visit(node)

        V().visit(f)

    return {k: list(v) for k, v in graph.items()}


def build_java_call_graph(methods):
    names = [m["name"] for m in methods]
    graph = {n: [] for n in names}
    for m in methods:
        for other in names:
            if other != m["name"] and re.search(rf"\b{other}\s*\(", m["body"]):
                graph[m["name"]].append(other)
    return graph


def callgraph_mermaid(graph):
    lines = ["flowchart LR"]
    for f in graph:
        lines.append(f'{f}["{f}"]')
    for a, bs in graph.items():
        for b in bs:
            lines.append(f"{a} --> {b}")
    return "\n".join(lines)


# ---------------- API ----------------
@app.post("/analyze")
async def analyze_code(request: CodeRequest, function_name: str = Query(None)):

    # ---------- PYTHON ----------
    if request.language.lower() == "python":
        tree = ast.parse(request.code)
        funcs = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
        names = [f.name for f in funcs]

        complexity = {f.name: compute_python_complexity(f) for f in funcs}

        result = {
            "functions": {"count": len(names), "names": names},
            "flowchart": None,
            "call_graph": callgraph_mermaid(build_python_call_graph(tree)),
            "complexity": complexity,
        }

        if function_name:
            target = next((f for f in funcs if f.name == function_name), None)
            if target:
                builder = PythonFlowBuilder()
                result["flowchart"] = builder.build_for_function(target)

        return result

    # ---------- JAVA ----------
    if request.language.lower() == "java":
        methods = extract_java_methods(request.code)
        names = [m["name"] for m in methods]

        complexity = {
            m["name"]: compute_java_complexity(m["body"])
            for m in methods
        }

        result = {
            "functions": {"count": len(names), "names": names},
            "flowchart": None,
            "call_graph": callgraph_mermaid(build_java_call_graph(methods)),
            "complexity": complexity,
        }

        if function_name:
            target = next((m for m in methods if m["name"] == function_name), None)
            if target:
                builder = JavaFlowBuilder()
                result["flowchart"] = builder.build_for_method(target)

        return result

    return {"error": "Unsupported language"}


@app.get("/")
async def root():
    return {"message": "CodeMap API running"}

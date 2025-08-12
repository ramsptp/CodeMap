# main.py
import ast
import logging
from fastapi import FastAPI, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

class CodeRequest(BaseModel):
    code: str

def escape_label(s: str) -> str:
    """Make label safe for Mermaid: remove newlines, double quotes, pipes."""
    if s is None:
        s = ""
    s = str(s)
    s = s.replace("\n", " ").replace('"', "'").replace("|", "/").strip()
    return s

class FlowBuilder:
    def __init__(self):
        self.nodes = []        # list of (id, label, shape)
        self.edges = []        # list of (src, dst, label_or_none)
        self._id = 0

    def new_id(self):
        nid = f"N{self._id}"
        self._id += 1
        return nid

    def add_node(self, label: str, shape: str = "rect"):
        label = escape_label(label)
        nid = self.new_id()
        self.nodes.append((nid, label, shape))
        logger.debug(f"add_node: {nid} ({shape}) label='{label}'")
        return nid

    def add_edge(self, src: str, dst: str, label: str = None):
        if src is None or dst is None:
            logger.debug(f"SKIP add_edge due to None src/dst: {src} -> {dst} label={label}")
            return
        # Use -->|label| style when label present
        self.edges.append((src, dst, label))
        logger.debug(f"add_edge: {src} -- {label or ''} --> {dst}")

    def stmt_sequence(self, stmts):
        """
        Process a list of statements sequentially.
        Returns (entry_node_id or None, exit_node_id or None, terminal_flag)
        terminal_flag True means control flow does not continue past this sequence
        (e.g. it ends with return in all possible paths).
        """
        entry = None
        last_exit = None
        terminal = False

        for i, stmt in enumerate(stmts):
            s_entry, s_exit, s_term = self.process_stmt(stmt)
            if s_entry is None:
                # nothing generated for this statement
                continue
            if entry is None:
                entry = s_entry
            if last_exit is not None:
                # connect previous exit -> this entry
                self.add_edge(last_exit, s_entry)
            last_exit = s_exit
            # if this statement is terminal and there are subsequent statements,
            # they are unreachable via normal control flow
            if s_term:
                # remaining statements are not reachable via this path
                terminal = True
                # break: we treat sequence as terminal when a return is reached
                break

        return entry, last_exit, terminal

    def process_stmt(self, stmt):
        """
        Process single statement. Return (entry, exit, terminal_flag).
        entry and exit are node ids (strings) or None if nothing created.
        """
        if isinstance(stmt, ast.Return):
            try:
                code = ast.unparse(stmt.value) if hasattr(ast, "unparse") and stmt.value is not None else "return"
            except Exception:
                code = "return"
            node = self.add_node(f"return {code}", "rect")
            return node, node, True

        if isinstance(stmt, ast.Assign):
            try:
                code = ast.unparse(stmt)
            except Exception:
                targets = ", ".join([t.id if isinstance(t, ast.Name) else "?" for t in stmt.targets])
                code = f"{targets} = ?"
            node = self.add_node(code, "rect")
            return node, node, False

        if isinstance(stmt, ast.AugAssign):
            try:
                code = ast.unparse(stmt)
            except Exception:
                code = "augassign"
            node = self.add_node(code, "rect")
            return node, node, False

        if isinstance(stmt, ast.Expr):
            # expression, e.g., call like print(...)
            try:
                code = ast.unparse(stmt.value) if hasattr(ast, "unparse") else ast.dump(stmt)
            except Exception:
                code = ast.dump(stmt)
            node = self.add_node(code, "rect")
            return node, node, False

        if isinstance(stmt, ast.If):
            # condition node (diamond)
            try:
                cond_text = ast.unparse(stmt.test) if hasattr(ast, "unparse") else "cond"
            except Exception:
                cond_text = "cond"
            cond_node = self.add_node(cond_text, "diamond")

            # then branch (True)
            then_entry, then_exit, then_term = self.stmt_sequence(stmt.body)
            if then_entry:
                self.add_edge(cond_node, then_entry, "True")
            else:
                # empty then (rare) -> connect to a dummy pass node
                pass_node = self.add_node("pass", "rect")
                self.add_edge(cond_node, pass_node, "True")
                then_exit = pass_node
                then_term = False

            # else branch: could be elif (If in orelse) or a sequence
            else_entry = None
            else_exit = None
            else_term = False
            if stmt.orelse:
                # if orelse is a single If, treat as elif chain by processing that If
                if len(stmt.orelse) == 1 and isinstance(stmt.orelse[0], ast.If):
                    o_stmt = stmt.orelse[0]
                    # process the elif If as a child; we want entry/exit/terminal
                    e_entry, e_exit, e_term = self.process_stmt(o_stmt)
                    if e_entry:
                        self.add_edge(cond_node, e_entry, "False")
                        else_entry = e_entry
                        else_exit = e_exit
                        else_term = e_term
                else:
                    e_entry, e_exit, e_term = self.stmt_sequence(stmt.orelse)
                    if e_entry:
                        self.add_edge(cond_node, e_entry, "False")
                        else_entry = e_entry
                        else_exit = e_exit
                        else_term = e_term
            else:
                # no else: False should fall through to "continue" (we'll create merge)
                # we'll mark else_exit None and else_term False
                else_entry = None
                else_exit = None
                else_term = False

            # Determine if all branches are terminal
            if then_term and (else_term or not stmt.orelse):
                # if both branches terminate (or no else and then_term True?), then this If is terminal
                # careful: if no else and then_term True, the False path continues (i.e. not terminal).
                # so only when there's an else and both are terminal treat terminal True.
                all_terminal = False
                if stmt.orelse:
                    all_terminal = then_term and else_term
                else:
                    all_terminal = False
            else:
                all_terminal = False

            # if at least one branch can continue, create a merge continuation node
            if (not then_term) or (stmt.orelse and not else_term):
                merge_node = self.add_node("Continue", "rect")
                # connect then exit to merge if then branch didn't terminate
                if then_exit and not then_term:
                    self.add_edge(then_exit, merge_node)
                # connect else exit to merge if exists and not terminal
                if else_exit and not else_term:
                    self.add_edge(else_exit, merge_node)
                # if there's an else absent (no else), connect cond_node False to merge_node
                if not stmt.orelse:
                    self.add_edge(cond_node, merge_node, "False")
                return cond_node, merge_node, False
            else:
                # both branches terminal (returns), If is terminal (no continuation)
                return cond_node, None, True

        if isinstance(stmt, ast.For):
            # for loop as diamond-like entry
            try:
                header = ast.unparse(stmt.target) + " in " + (ast.unparse(stmt.iter) if hasattr(ast, "unparse") else "iter")
            except Exception:
                header = "for"
            loop_node = self.add_node(header, "diamond")
            # body
            body_entry, body_exit, body_term = self.stmt_sequence(stmt.body)
            if body_entry:
                self.add_edge(loop_node, body_entry, "True")
            else:
                # empty body
                pass_node = self.add_node("pass", "rect")
                self.add_edge(loop_node, pass_node, "True")
                body_exit = pass_node
                body_term = False

            # back edge from body_exit to loop_node if body exists and doesn't terminal on all paths
            if body_exit and not body_term:
                self.add_edge(body_exit, loop_node, "Next Iteration")

            after_node = self.add_node("After Loop", "rect")
            self.add_edge(loop_node, after_node, "False")

            return loop_node, after_node, False

        if isinstance(stmt, ast.While):
            try:
                cond_text = ast.unparse(stmt.test) if hasattr(ast, "unparse") else "while"
            except Exception:
                cond_text = "while"
            loop_node = self.add_node(cond_text, "diamond")
            body_entry, body_exit, body_term = self.stmt_sequence(stmt.body)
            if body_entry:
                self.add_edge(loop_node, body_entry, "True")
            else:
                pass_node = self.add_node("pass", "rect")
                self.add_edge(loop_node, pass_node, "True")
                body_exit = pass_node
                body_term = False

            if body_exit and not body_term:
                self.add_edge(body_exit, loop_node, "Repeat")

            after_node = self.add_node("After Loop", "rect")
            self.add_edge(loop_node, after_node, "False")
            return loop_node, after_node, False

        # fallback: create a generic node for unknown statement type
        try:
            code = ast.unparse(stmt) if hasattr(ast, "unparse") else type(stmt).__name__
        except Exception:
            code = type(stmt).__name__
        node = self.add_node(code, "rect")
        return node, node, False

    def build_for_function(self, func_node: ast.FunctionDef):
        """Build flow for a single function AST node."""
        # reset counters for a fresh graph per function
        self.nodes = []
        self.edges = []
        self._id = 0

        # create function start node (circle)
        start_node = self.add_node(f"Function: {func_node.name}()", "circle")
        entry, exit_node, terminal = self.stmt_sequence(func_node.body)
        if entry:
            self.add_edge(start_node, entry)
        else:
            # empty function: connect start -> end (nothing)
            pass

        # generate mermaid text
        lines = ["flowchart TD"]
        for nid, label, shape in self.nodes:
            quoted = f'"{label}"'
            if shape == "circle":
                # circle uses double parens
                lines.append(f'{nid}(({quoted}))')
            elif shape == "diamond":
                lines.append(f'{nid}{{{quoted}}}')
            else:
                lines.append(f'{nid}[{quoted}]')
        # edges
        for s, d, lbl in self.edges:
            if lbl:
                # use -->|label| syntax
                safe_lbl = escape_label(lbl)
                lines.append(f'{s} -->|{safe_lbl}| {d}')
            else:
                lines.append(f'{s} --> {d}')

        mermaid = "\n".join(lines)
        logger.debug("Generated Mermaid:\n" + mermaid)
        return mermaid

@app.post("/analyze")
async def analyze_code(request: CodeRequest, function_name: str = Query(None)):
    code = request.code
    try:
        tree = ast.parse(code)
    except Exception as e:
        return {"error": f"Failed to parse code: {e}"}

    functions = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    func_names = [f.name for f in functions]
    result = {"functions": {"count": len(func_names), "names": func_names}}

    if function_name:
        target = None
        for f in functions:
            if f.name == function_name:
                target = f
                break
        if not target:
            return {"error": f"Function '{function_name}' not found", **result}

        builder = FlowBuilder()
        mermaid = builder.build_for_function(target)
        # debug print on server console
        logger.info("MERMAID OUTPUT:\n" + mermaid)
        result["flowchart"] = mermaid
    else:
        result["flowchart"] = None

    return result

@app.get("/")
async def root():
    return {"message": "CodeMap API running. POST /analyze with JSON {code: '...'} and optional ?function_name=foo"}

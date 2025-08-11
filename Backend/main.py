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
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

class CodeRequest(BaseModel):
    code: str

def shape_label(node_type, text):
    if node_type == "FunctionDef":
        return text, "circle"
    elif node_type in ("If", "Elif", "While", "For"):
        return text, "diamond"
    elif node_type in ("Return", "Expr", "Assign", "AugAssign", "Call", "Process"):
        return text, "rect"
    else:
        logger.debug(f"Unknown node type: {node_type}")
        return text, "rect"

def escape_label(text):
    # Escape Mermaid special chars for safe labels
    return text.replace("<", "&lt;").replace(">", "&gt;").replace("\"", "'").replace("&", "&amp;")

def add_edge(edges, frm, to, label=None):
    if label:
        edge_str = f'{frm} -->|{label}| {to}'
    else:
        edge_str = f'{frm} --> {to}'
    logger.debug(f"Add edge: {edge_str}")
    edges.append(edge_str)

def ast_to_mermaid(node, node_id=0, edges=None, labels=None, shapes=None):
    if edges is None:
        edges = []
    if labels is None:
        labels = {}
    if shapes is None:
        shapes = {}

    current_id = node_id

    # Helper for recursion edge adding
    def process_stmt_list(stmt_list, start_id):
        last_id = start_id
        for stmt in stmt_list:
            next_id = last_id + 1
            if isinstance(stmt, (ast.If, ast.For, ast.While)):
                logger.debug(f"Recursing into node type {type(stmt).__name__} at id {next_id}")
                edges_sub, labels_sub, shapes_sub, next_id_sub = ast_to_mermaid(stmt, next_id, edges, labels, shapes)
                add_edge(edges_sub, last_id, next_id_sub - 1)
                last_id = next_id_sub - 1
            else:
                try:
                    code_str = ast.unparse(stmt) if hasattr(ast, "unparse") else type(stmt).__name__
                except Exception:
                    code_str = type(stmt).__name__
                label_text, shape = shape_label(type(stmt).__name__, code_str)
                labels[next_id] = escape_label(label_text)
                shapes[next_id] = shape
                logger.debug(f"Adding node {next_id}: '{label_text}' shape: {shape}")
                add_edge(edges, last_id, next_id)
                last_id = next_id
        return last_id

    if isinstance(node, ast.FunctionDef):
        label_text, shape = shape_label("FunctionDef", f'Function: {node.name}')
        labels[current_id] = escape_label(label_text)
        shapes[current_id] = shape
        logger.debug(f"FunctionDef node {current_id} label: {label_text} shape: {shape}")

        last_id = current_id
        last_id = process_stmt_list(node.body, last_id)
        return edges, labels, shapes, last_id + 1

    if isinstance(node, ast.If):
        try:
            cond_text = ast.unparse(node.test) if hasattr(ast, "unparse") else "condition"
        except Exception:
            cond_text = "condition"
        label_text, shape = shape_label("If", f'If: {cond_text}')
        labels[current_id] = escape_label(label_text)
        shapes[current_id] = shape
        logger.debug(f"If node {current_id} label: {label_text} shape: {shape}")

        # THEN branch
        then_start = current_id + 1
        labels[then_start], shapes[then_start] = shape_label("Process", "Then")
        labels[then_start] = escape_label(labels[then_start])
        add_edge(edges, current_id, then_start, "True")

        last_id = then_start
        last_id = process_stmt_list(node.body, last_id)
        then_end = last_id

        # ELSE branch
        else_branch = node.orelse
        if else_branch:
            if len(else_branch) == 1 and isinstance(else_branch[0], ast.If):
                # elif case
                elif_node = else_branch[0]
                elif_start = then_end + 1
                label_text, shape = shape_label("Elif", f'Elif: {ast.unparse(elif_node.test) if hasattr(ast, "unparse") else "condition"}')
                labels[elif_start] = escape_label(label_text)
                shapes[elif_start] = shape
                add_edge(edges, current_id, elif_start, "False")

                last_id = elif_start
                then_start = last_id + 1
                labels[then_start], shapes[then_start] = shape_label("Process", "Then")
                labels[then_start] = escape_label(labels[then_start])
                add_edge(edges, last_id, then_start, "True")

                last_id = then_start
                last_id = process_stmt_list(elif_node.body, last_id)
                then_end_elif = last_id

                else_branch_elif = elif_node.orelse
                if else_branch_elif:
                    dummy_if = ast.If(test=ast.Constant(True), body=else_branch_elif, orelse=[])
                    else_start_elif = then_end_elif + 1
                    edges, labels, shapes, next_id = ast_to_mermaid(dummy_if, else_start_elif, edges, labels, shapes)
                    add_edge(edges, elif_start, else_start_elif, "False")
                    last_id = next_id - 1

                merge_id = last_id + 1
                labels[merge_id], shapes[merge_id] = shape_label("Process", "End If")
                labels[merge_id] = escape_label(labels[merge_id])
                add_edge(edges, then_end, merge_id)
                add_edge(edges, then_end_elif, merge_id)
                logger.debug(f"Merge node {merge_id} after elif")
                return edges, labels, shapes, merge_id + 1

            else:
                else_start = then_end + 1
                labels[else_start], shapes[else_start] = shape_label("Process", "Else")
                labels[else_start] = escape_label(labels[else_start])
                add_edge(edges, current_id, else_start, "False")

                last_id = else_start
                last_id = process_stmt_list(else_branch, last_id)
                else_end = last_id

                merge_id = else_end + 1
                labels[merge_id], shapes[merge_id] = shape_label("Process", "End If")
                labels[merge_id] = escape_label(labels[merge_id])
                add_edge(edges, then_end, merge_id)
                add_edge(edges, else_end, merge_id)
                logger.debug(f"Merge node {merge_id} after else")
                return edges, labels, shapes, merge_id + 1

        else:
            merge_id = then_end + 1
            labels[merge_id], shapes[merge_id] = shape_label("Process", "End If")
            labels[merge_id] = escape_label(labels[merge_id])
            add_edge(edges, then_end, merge_id)
            add_edge(edges, current_id, merge_id, "False")
            logger.debug(f"Merge node {merge_id} no else branch")
            return edges, labels, shapes, merge_id + 1

    if isinstance(node, ast.For):
        try:
            target_text = ast.unparse(node.target) if hasattr(ast, 'unparse') else 'var'
            iter_text = ast.unparse(node.iter) if hasattr(ast, 'unparse') else 'iterable'
        except Exception:
            target_text = 'var'
            iter_text = 'iterable'

        label_text, shape = shape_label("For", f"For: {target_text} in {iter_text}")
        labels[current_id] = escape_label(label_text)
        shapes[current_id] = shape
        logger.debug(f"For node {current_id} label: {label_text} shape: {shape}")

        body_start = current_id + 1
        labels[body_start], shapes[body_start] = shape_label("Process", "Body")
        labels[body_start] = escape_label(labels[body_start])
        add_edge(edges, current_id, body_start, "True")

        last_id = body_start
        last_id = process_stmt_list(node.body, last_id)

        add_edge(edges, last_id, current_id, "Next Iteration")

        after_loop = last_id + 1
        labels[after_loop], shapes[after_loop] = shape_label("Process", "After Loop")
        labels[after_loop] = escape_label(labels[after_loop])
        add_edge(edges, current_id, after_loop, "False")

        return edges, labels, shapes, after_loop + 1

    if isinstance(node, ast.While):
        try:
            cond_text = ast.unparse(node.test) if hasattr(ast, 'unparse') else 'condition'
        except Exception:
            cond_text = 'condition'

        label_text, shape = shape_label("While", f"While: {cond_text}")
        labels[current_id] = escape_label(label_text)
        shapes[current_id] = shape
        logger.debug(f"While node {current_id} label: {label_text} shape: {shape}")

        body_start = current_id + 1
        labels[body_start], shapes[body_start] = shape_label("Process", "Body")
        labels[body_start] = escape_label(labels[body_start])
        add_edge(edges, current_id, body_start, "True")

        last_id = body_start
        last_id = process_stmt_list(node.body, last_id)

        add_edge(edges, last_id, current_id, "Repeat")

        after_loop = last_id + 1
        labels[after_loop], shapes[after_loop] = shape_label("Process", "After Loop")
        labels[after_loop] = escape_label(labels[after_loop])
        add_edge(edges, current_id, after_loop, "False")

        return edges, labels, shapes, after_loop + 1

    if isinstance(node, ast.Return):
        try:
            code_str = ast.unparse(node.value) if hasattr(ast, "unparse") else "Return"
        except Exception:
            code_str = "Return"
        label_text, shape = shape_label("Return", f"Return: {code_str}")
        labels[current_id] = escape_label(label_text)
        shapes[current_id] = shape
        logger.debug(f"Return node {current_id} label: {label_text} shape: {shape}")
        return edges, labels, shapes, current_id + 1

    if isinstance(node, ast.Expr):
        try:
            code_str = ast.unparse(node.value) if hasattr(ast, "unparse") else "Expr"
        except Exception:
            code_str = "Expr"
        label_text, shape = shape_label("Expr", f"Expr: {code_str}")
        labels[current_id] = escape_label(label_text)
        shapes[current_id] = shape
        logger.debug(f"Expr node {current_id} label: {label_text} shape: {shape}")
        return edges, labels, shapes, current_id + 1

    if isinstance(node, ast.Assign):
        try:
            code_str = ast.unparse(node) if hasattr(ast, "unparse") else "Assign"
        except Exception:
            code_str = "Assign"
        label_text, shape = shape_label("Assign", f"Assign: {code_str}")
        labels[current_id] = escape_label(label_text)
        shapes[current_id] = shape
        logger.debug(f"Assign node {current_id} label: {label_text} shape: {shape}")
        return edges, labels, shapes, current_id + 1

    if isinstance(node, ast.AugAssign):
        try:
            code_str = ast.unparse(node) if hasattr(ast, "unparse") else "AugAssign"
        except Exception:
            code_str = "AugAssign"
        label_text, shape = shape_label("AugAssign", f"AugAssign: {code_str}")
        labels[current_id] = escape_label(label_text)
        shapes[current_id] = shape
        logger.debug(f"AugAssign node {current_id} label: {label_text} shape: {shape}")
        return edges, labels, shapes, current_id + 1

    # Default fallback
    label_text, shape = shape_label(type(node).__name__, type(node).__name__)
    labels[current_id] = escape_label(label_text)
    shapes[current_id] = shape
    logger.debug(f"Default node {current_id} label: {label_text} shape: {shape}")
    return edges, labels, shapes, current_id + 1

def build_mermaid_graph(edges, labels, shapes):
    lines = ["flowchart TD"]
    for node_id, label_text in labels.items():
        shape = shapes.get(node_id, "rect")
        # Always quote the label with double quotes for safety
        quoted_label = f'"{label_text}"'
        if shape == "circle":
            lines.append(f'{node_id}(({quoted_label}))')
        elif shape == "diamond":
            lines.append(f'{node_id}{{{quoted_label}}}')
        else:
            lines.append(f'{node_id}[{quoted_label}]')
    lines.extend(edges)
    graph_str = "\n".join(lines)
    logger.debug(f"Generated Mermaid Graph:\n{graph_str}")
    return graph_str


@app.post("/analyze")
async def analyze_code(request: CodeRequest, function_name: str = Query(None)):
    code = request.code
    try:
        tree = ast.parse(code)
        functions = [node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]
        classes = [node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]
        line_count = len(code.splitlines())

        flowchart = None
        if function_name:
            func_node = None
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef) and node.name == function_name:
                    func_node = node
                    break
            if func_node:
                edges, labels, shapes, _ = ast_to_mermaid(func_node)
                flowchart = build_mermaid_graph(edges, labels, shapes)
            else:
                flowchart = f"Flowchart generation failed: function '{function_name}' not found."

        return {
            "functions": {"count": len(functions), "names": functions},
            "classes": {"count": len(classes), "names": classes},
            "lines_of_code": line_count,
            "flowchart": flowchart,
        }
    except Exception as e:
        logger.error(f"Exception during analysis: {e}")
        return {"error": str(e)}

@app.get("/")
async def root():
    return {"message": "CodeMap API running. Use POST /analyze with JSON {code: 'your code'} and optional ?function_name=foo"}

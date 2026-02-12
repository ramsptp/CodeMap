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

    def add_edge(self, source, target, label=None, style=None, sourceHandle=None, targetHandle=None):
        if source and target:
            edge_id = f"e{source}-{target}-{uuid.uuid4().hex[:4]}"
            
            # Default Style
            edge_style = {"stroke": "#b1b1b7", "strokeWidth": 2}
            if style:
                edge_style.update(style)
                
            edge = {
                "id": edge_id,
                "source": source,
                "target": target,
                "type": "smoothstep", 
                "animated": True,
                "style": edge_style,
            }
            if sourceHandle:
                edge["sourceHandle"] = sourceHandle
            if targetHandle:
                edge["targetHandle"] = targetHandle
            if label:
                edge["label"] = label
                
                # --- COLOR LOGIC FOR LABELS ---
                text_color = "#fff" # Default White
                if label == "True":
                    text_color = "#4caf50" # Green
                elif label == "False":
                    text_color = "#ff5252" # Red
                elif label == "Loop":
                    text_color = "#00d8ff" # Cyan/Blue
                elif label == "Done":
                    text_color = "#dcb67a" # Gold
                
                edge["labelStyle"] = {"fill": text_color, "fontWeight": 700}
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
# 3. IMPROVED PYTHON PARSER
# ==========================================
class PythonFlowBuilder(ReactFlowBuilder):
    def stmt_sequence(self, stmts):
        """Process a sequence of statements and return entry, exit, and terminal flag"""
        entry = last_exit = None
        terminal = False

        for stmt in stmts:
            s_entry, s_exit, s_term = self.process_stmt(stmt)
            if not s_entry: 
                continue

            # Connect to previous statement
            if entry is None: 
                entry = s_entry
            if last_exit: 
                self.add_edge(last_exit, s_entry)
            
            last_exit = s_exit
            
            # If we hit a terminal statement (return), stop processing
            if s_term:
                terminal = True
                break
                
        return entry, last_exit, terminal

    def process_stmt(self, stmt):
        """Process a single statement and return (entry_node, exit_node, is_terminal)"""
        
        # RETURN STATEMENT
        if isinstance(stmt, ast.Return):
            val = ast.unparse(stmt.value) if stmt.value else "None"
            node = self.add_node(f"return {val}", "terminator")
            return node, node, True
        
        # IF STATEMENT (IMPROVED BRANCHING)
        if isinstance(stmt, ast.If):
            cond_node = self.add_node(f"If: {ast.unparse(stmt.test)}", "decision")
            
            # Process TRUE branch
            t_entry, t_exit, t_term = self.stmt_sequence(stmt.body)
            if t_entry: 
                self.add_edge(cond_node, t_entry, "True")
            
            # Process FALSE branch (else/elif)
            f_entry = f_exit = None
            f_term = False
            if stmt.orelse:
                f_entry, f_exit, f_term = self.stmt_sequence(stmt.orelse)
                if f_entry: 
                    self.add_edge(cond_node, f_entry, "False")
            
            # MERGE LOGIC - Create explicit merge point
            # Only create merge if at least one branch continues (not terminal)
            if not (t_term and f_term):
                merge = self.add_node("", "process")  # Empty label = merge point
                
                # Connect TRUE branch to merge if it doesn't terminate
                if t_exit and not t_term: 
                    self.add_edge(t_exit, merge)
                
                # Connect FALSE branch to merge
                if f_exit and not f_term: 
                    self.add_edge(f_exit, merge)
                elif not stmt.orelse:  # No else clause - direct connection
                    self.add_edge(cond_node, merge, "False")
                
                return cond_node, merge, False
            
            # Both branches terminate - no merge needed
            return cond_node, None, True
        
        # LOOP STATEMENTS
        if isinstance(stmt, (ast.While, ast.For)):
            if isinstance(stmt, ast.While):
                label = f"While {ast.unparse(stmt.test)}"
            else:
                label = f"For {ast.unparse(stmt.target)} in {ast.unparse(stmt.iter)}"
            
            loop_node = self.add_node(label, "loop")
            
            # Process loop body
            body_entry, body_exit, body_term = self.stmt_sequence(stmt.body)
            if body_entry: 
                self.add_edge(loop_node, body_entry, "Loop")
            
            # Loop back (only if body doesn't terminate)
            if body_exit and not body_term: 
                self.add_edge(body_exit, loop_node)
            
            # Exit point after loop
            after = self.add_node("Exit Loop", "process")
            self.add_edge(loop_node, after, "Done")
            
            return loop_node, after, False

        # REGULAR STATEMENT
        try:
            label = ast.unparse(stmt)
        except:
            label = "Statement"
        
        node = self.add_node(label, "process")
        return node, node, False

    def build_for_function(self, func):
        """Build flowchart for a specific function"""
        self.nodes, self.edges, self._id_counter = [], [], 0
        
        start = self.add_node(f"Start: {func.name}", "terminator")
        entry, exit_node, _ = self.stmt_sequence(func.body)
        
        if entry: 
            self.add_edge(start, entry)
        
        return self.get_data()

# ==========================================
# 4. IMPROVED JAVA PARSER
# ==========================================
JAVA_METHOD_REGEX = re.compile(
    r"(public|private|protected)?\s*(static)?\s*[\w<>]+\s+(\w+)\s*\((.*?)\)\s*\{", 
    re.MULTILINE
)

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
    """Parse Java/C++ code into statements, respecting braces and if-else chains"""
    statements = []
    current = []
    depth_brace = 0
    depth_paren = 0
    
    i = 0
    while i < len(code):
        char = code[i]
        current.append(char)
        
        if char == '{': depth_brace += 1
        elif char == '}': depth_brace -= 1
        elif char == '(': depth_paren += 1
        elif char == ')': depth_paren -= 1
        
        # Check for statement separators
        # 1. Semicolon at top level
        if char == ';' and depth_brace == 0 and depth_paren == 0:
            statements.append("".join(current).strip())
            current = []
            
        # 2. Closing brace at top level
        elif char == '}' and depth_brace == 0:
            # Look ahead for 'else' to avoid splitting if-else chains
            j = i + 1
            is_else = False
            while j < len(code):
                if code[j].isspace():
                    j += 1
                    continue
                # Check if next token is 'else'
                if code[j:j+4] == "else" and (j+4 >= len(code) or not code[j+4].isalnum()):
                     is_else = True
                break
            
            if not is_else:
                statements.append("".join(current).strip())
                current = []
            # If it is 'else', we continue accumulating 'current' locally
            
        i += 1
            
    if current and "".join(current).strip():
        statements.append("".join(current).strip())
        
    return statements

class JavaFlowBuilder(ReactFlowBuilder):
    def build_for_body(self, name, body_text):
        """Build flowchart for Java method"""
        self.nodes, self.edges, self._id_counter = [], [], 0
        start = self.add_node(f"Start: {name}", "terminator")
        last_node = start
        
        stmts = parse_java_structure(body_text)
        
        for stmt in stmts:
            # FOR LOOP
            if stmt.startswith("for"):
                header_match = re.search(r"for\s*\((.*?)\)", stmt)
                header = header_match.group(0) if header_match else "For Loop"
                
                loop_node = self.add_node(header, "loop")
                self.add_edge(last_node, loop_node)
                
                body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
                body_content = body_match.group(1).strip() if body_match else "..."
                
                body_node = self.add_node(body_content, "process")
                if b_entry:
                    self.add_edge(loop_node, b_entry, "Loop", sourceHandle="bottom")
                    if b_exit and not b_term:
                        self.add_edge(b_exit, loop_node, targetHandle="left")
                
                merge = self.add_node("", "process")  # Merge point
                self.add_edge(loop_node, merge, "Done", sourceHandle="right")
                last_node = merge
            
            # WHILE LOOP
            elif stmt.startswith("while"):
                header_match = re.search(r"while\s*\((.*?)\)", stmt)
                header = header_match.group(0) if header_match else "While Loop"
                
                loop_node = self.add_node(header, "loop")
                self.add_edge(last_node, loop_node)
                
                body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
                body_content = body_match.group(1).strip() if body_match else "..."
                
                body_node = self.add_node(body_content, "process")
                self.add_edge(loop_node, body_node, "Loop", sourceHandle="bottom")
                self.add_edge(body_node, loop_node, targetHandle="left")  # Loop back
                
                merge = self.add_node("", "process")  # Merge point
                self.add_edge(loop_node, merge, "Done", sourceHandle="right")
                last_node = merge

            # IF STATEMENT
            elif stmt.startswith("if"):
                header_match = re.search(r"if\s*\((.*?)\)", stmt)
                header = header_match.group(0) if header_match else "If"
                
                decision = self.add_node(header, "decision")
                self.add_edge(last_node, decision)
                
                body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
                body_content = body_match.group(1).strip() if body_match else "..."
                
                true_node = self.add_node(body_content, "process")
                self.add_edge(decision, true_node, "True", sourceHandle="right")
                
                merge = self.add_node("", "process")  # Merge point
                self.add_edge(true_node, merge)
                self.add_edge(decision, merge, "False", sourceHandle="bottom")
                last_node = merge

            # RETURN STATEMENT
            elif stmt.startswith("return"):
                node = self.add_node(stmt, "terminator")
                self.add_edge(last_node, node)
                last_node = None  # Terminal
            
            # REGULAR STATEMENT
            else:
                node = self.add_node(stmt, "process")
                if last_node: 
                    self.add_edge(last_node, node)
                last_node = node
                
        return self.get_data()

# ==========================================
# 5. JAVASCRIPT / TYPESCRIPT PARSER
# ==========================================
# ==========================================
# 5. JAVASCRIPT / TYPESCRIPT PARSER
# ==========================================
class JavaScriptFlowBuilder(ReactFlowBuilder):
    def process_block(self, stmts, loop_context=None):
        """Process a sequence of statements. Returns (entry, exit, terminal)"""
        entry = last_exit = None
        terminal = False
        
        for stmt in stmts:
            s_entry, s_exit, s_term = self.process_stmt(stmt, loop_context)
            if not s_entry: continue
            
            if entry is None: entry = s_entry
            if last_exit and not is_terminal_node(last_exit): 
                self.add_edge(last_exit, s_entry)
            
            last_exit = s_exit
            if s_term:
                terminal = True
                break
                
        return entry, last_exit, terminal

    def process_stmt(self, stmt, loop_context=None):
        """Process a single statement string"""
        
        # FOR / FOR..OF / FOR..IN
        if stmt.startswith("for"):
            header_match = re.search(r"for\s*\((.*?)\)", stmt)
            header = header_match.group(0) if header_match else "For Loop"
            
            loop_node = self.add_node(header, "loop")
            after = self.add_node("Done", "process") # Exit node
            
            # Context for children
            new_context = {"continue": loop_node, "break": after}
            
            body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
            body_content = body_match.group(1).strip() if body_match else ""
            
            if body_content:
                body_stmts = parse_java_structure(body_content)
                b_entry, b_exit, b_term = self.process_block(body_stmts, new_context)
                
                if b_entry:
                    self.add_edge(loop_node, b_entry, "Loop", sourceHandle="bottom")
                    if b_exit and not b_term:
                        self.add_edge(b_exit, loop_node, targetHandle="left")
            
            after = self.add_node("Done", "process")
            
            self.add_edge(loop_node, after, "Done", sourceHandle="right")
            return loop_node, after, False

        # WHILE LOOP
        elif stmt.startswith("while"):
            header_match = re.search(r"while\s*\((.*?)\)", stmt)
            header = header_match.group(0) if header_match else "While Loop"
            
            loop_node = self.add_node(header, "loop")
            after = self.add_node("Done", "process")
            
            new_context = {"continue": loop_node, "break": after}
            
            body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
            body_content = body_match.group(1).strip() if body_match else ""
            
            if body_content:
                body_stmts = parse_java_structure(body_content)
                b_entry, b_exit, b_term = self.process_block(body_stmts, new_context)
                
                if b_entry:
                    # Loop Body -> Bottom (User request)
                    self.add_edge(loop_node, b_entry, "Loop", sourceHandle="bottom")
                    if b_exit and not b_term:
                        self.add_edge(b_exit, loop_node, targetHandle="left")
            
            # Done -> Right (User request)
            self.add_edge(loop_node, after, "Done", sourceHandle="right")
            return loop_node, after, False

        # IF STATEMENT
        elif stmt.startswith("if"):
            # 1. Parse Header
            header_end_idx = 0
            paren_count = 0
            in_paren = False
            for i, char in enumerate(stmt):
                if char == '(':
                    if not in_paren: in_paren = True
                    paren_count += 1
                elif char == ')':
                    paren_count -= 1
                    if in_paren and paren_count == 0:
                        header_end_idx = i + 1
                        break
            
            header = stmt[:header_end_idx].strip()
            rest = stmt[header_end_idx:].strip()
            
            # 2. Identify True Body and Else Part
            if_body = ""
            else_part = None
            
            if rest.startswith("{"):
                # Braced Body: Find matching '}'
                brace_count = 0
                body_end_idx = 0
                for i, char in enumerate(rest):
                    if char == '{': brace_count += 1
                    elif char == '}': 
                        brace_count -= 1
                        if brace_count == 0:
                            body_end_idx = i + 1
                            break
                if_body = rest[:body_end_idx]
                potential_else = rest[body_end_idx:].strip()
                if potential_else.startswith("else"):
                    else_part = potential_else[4:].strip()
            else:
                # Unbraced Body: complicated because we don't know where it ends easily inside this string
                # BUT since parse_java_structure groups if/else, 
                # if there is an 'else', it must be at the end?
                # Actually, checking for 'else' via split is safer for unbraced single statements
                # provided strings don't contain "else".
                # For safety/simplicity in unbraced case, we assume split("else", 1) is acceptable
                # OR we can scan for semicolon? 
                # If unbraced, it should be a single statement ending in semicolon.
                # Let's try to find 'else' keyword token
                
                # Simple fallback for unbraced: split on "else " (with space) or "else{" or just "else"
                # To be robust, we'll try to find "else" that is NOT in a string/quote.
                # For now, simplistic split is likely okay for unbraced code
                parts = stmt.split("else", 1) 
                # Wait, if we use split, we must apply it to 'stmt' but careful about header
                # Re-using naive split for UNBRACED cases is acceptable risk for now
                if "else" in rest:
                     # Find last 'else'? No, first 'else'.
                     split_idx = rest.find("else")
                     if_body = rest[:split_idx].strip()
                     else_part = rest[split_idx+4:].strip()
                else:
                    if_body = rest
            
            decision = self.add_node(header, "decision")
            
            # Process True Body
            t_entry = t_exit = t_term = None
            if if_body:
                # Remove outer braces for processing
                content = if_body
                if content.startswith("{") and content.endswith("}"):
                    content = content[1:-1].strip()
                
                if content:
                    t_stmts = parse_java_structure(content)
                    t_entry, t_exit, t_term = self.process_block(t_stmts, loop_context)

            if t_entry:
                self.add_edge(decision, t_entry, "True", sourceHandle="right")

            # Process False Body
            f_entry = f_exit = f_term = None
            if else_part:
                if else_part.startswith("if"):
                     # else if...
                    f_entry, f_exit, f_term = self.process_stmt(else_part, loop_context)
                else:
                    # else { ... }
                    content = else_part
                    if content.startswith("{") and content.endswith("}"):
                        content = content[1:-1].strip()
                    
                    if content:
                        f_stmts = parse_java_structure(content)
                        f_entry, f_exit, f_term = self.process_block(f_stmts, loop_context)
            
            if f_entry:
                self.add_edge(decision, f_entry, "False", sourceHandle="bottom")

            if t_term and f_term:
                 return decision, None, True
            
            merge = self.add_node("", "process") # Use process with empty label for dot rendering
            
            if t_exit and not t_term: self.add_edge(t_exit, merge)
            elif not t_entry: self.add_edge(decision, merge, "True", sourceHandle="right")
            
            if f_exit and not f_term: self.add_edge(f_exit, merge)
            elif not f_entry: self.add_edge(decision, merge, "False", sourceHandle="bottom")
            
            return decision, merge, False

        # RETURN
        elif stmt.startswith("return"):
            # Clean label
            label = stmt.replace("return", "").strip().replace(";", "")
            if not label: label = "Return"
            else: label = f"Return {label}"
            
            node = self.add_node(label, "terminator")
            return node, node, True
        
        # CONTINUE
        elif stmt.startswith("continue"):
            node = self.add_node("continue", "process")
            if loop_context and "continue" in loop_context:
                self.add_edge(node, loop_context["continue"], style={"strokeDasharray": "5,5"})
            return node, node, True # Terminal for local flow
            
        # BREAK
        elif stmt.startswith("break"):
            node = self.add_node("break", "process")
            if loop_context and "break" in loop_context:
                self.add_edge(node, loop_context["break"], style={"strokeDasharray": "5,5"})
            return node, node, True # Terminal for local flow

        # REGULAR
        else:
            # Clean up label: remove wrapping braces if they exist (artifact of lazy parsing)
            # Clean up label: remove wrapping braces first
            label = stmt.strip()
            if label.startswith("{") and label.endswith("}"):
                label = label[1:-1].strip()
            
            # C++ specific cleanup
            label = label.replace("std::", "")
            label = label.replace("<< endl", "")
            label = label.replace("<< std::endl", "")
            label = " ".join(label.split()) # Collapse whitespace
            
            # Truncate if too long
            if len(label) > 40: label = label[:37] + "..."
            
            node = self.add_node(label, "process")
            return node, node, False

    def build_for_body(self, name, body_text):
        """Build flowchart for JS/TS function body"""
        self.nodes, self.edges, self._id_counter = [], [], 0
        start = self.add_node(f"Start: {name}", "terminator")
        
        stmts = parse_java_structure(body_text)
        entry, exit_node, _ = self.process_block(stmts)
        
        if entry:
            self.add_edge(start, entry)
            
        return self.get_data()

def is_terminal_node(node_id):
    # This helper would need access to nodes to check type. 
    # For now, we rely on the boolean flag returned by process_stmt
    return False 

# Helper to check if node is terminator type? 
# We don't have easy access to node list here. 
# We'll rely on the manual boolean flags passed around.


def calculate_js_complexity(code):
    complexity = 1
    # Basic tokens for JS complexity
    tokens = ["if", "else", "for", "while", "case", "catch", "&&", "||", "\\?"]
    for t in tokens:
        complexity += len(re.findall(rf"\b{re.escape(t)}\b", code))
    return complexity

def extract_js_functions(code):
    """Extract standard functions and arrow functions (supports TS types)"""
    funcs = []
    
    # 1. Standard: function foo(args): Type {
    # Regex: function \s+ name \s* (args) \s* (: Type)? \s* {
    std_regex = re.compile(r"function\s+(\w+)\s*\((.*?)\)\s*(?::\s*[^\{]+)?\s*\{", re.MULTILINE)
    for m in std_regex.finditer(code):
        start = m.end()
        # Find matching brace
        brace = 1
        i = start
        while i < len(code) and brace > 0:
            if code[i] == "{": brace += 1
            elif code[i] == "}": brace -= 1
            i += 1
        body = code[start:i-1].strip()
        funcs.append({"name": m.group(1), "body": body, "type": "standard"})

    # 2. Arrow: const foo = (args): Type => {
    # Regex: (const|let|var) name = (args) (: Type)? => {
    arrow_regex = re.compile(r"(const|let|var)\s+(\w+)\s*=\s*(\(.*\)|[\w]+)\s*(?::\s*[^\{=]+)?\s*=>\s*\{", re.MULTILINE)
    for m in arrow_regex.finditer(code):
        start = m.end()
        brace = 1
        i = start
        while i < len(code) and brace > 0:
            if code[i] == "{": brace += 1
            elif code[i] == "}": brace -= 1
            i += 1
        body = code[start:i-1].strip()
        funcs.append({"name": m.group(2), "body": body, "type": "arrow"})
        
    return funcs
        
    return funcs

# ==========================================
# 6. C++ PARSER
# ==========================================
class CppFlowBuilder(JavaScriptFlowBuilder):
    """Reuse JS builder as control flow syntax is identical"""
    pass

def calculate_cpp_complexity(code):
    complexity = 1
    tokens = ["if", "else", "for", "while", "case", "catch", "&&", "||", "\\?"]
    for t in tokens:
        complexity += len(re.findall(rf"\b{re.escape(t)}\b", code))
    return complexity

def extract_cpp_methods(code):
    """Extract C++ functions"""
    # Regex for C++ function: Type name(args) {
    # Excluding 'if', 'while', 'for', 'switch' which look like functions
    keywords = ["if", "while", "for", "switch", "catch"]
    keyword_pattern = "|".join(keywords)
    
    # Basic robust regex
    # Matches: Type Name(Args) {
    # Type can include *, &, spaces (e.g. unsigned int, int*)
    # Use non-greedy match for Type to avoid eating Name
    regex = re.compile(
        r"([\w:<>*&\s]+?)\s+(\w+)\s*\((.*?)\)\s*(const)?\s*\{", 
        re.MULTILINE
    )
    
    funcs = []
    for m in regex.finditer(code):
        name = m.group(2)
        if name in keywords: continue
        
        start = m.end()
        brace = 1
        i = start
        while i < len(code) and brace > 0:
            if code[i] == "{": brace += 1
            elif code[i] == "}": brace -= 1
            i += 1
        body = code[start:i-1].strip()
        funcs.append({"name": name, "body": body})
    return funcs


# ==========================================
# 7. MAIN API HANDLER
# ==========================================
@app.post("/analyze")
async def analyze_code(request: CodeRequest):
    result = {
        "functions": {"names": [], "count": 0}, 
        "graph_data": None, 
        "complexity": {}
    }
    
    lang = request.language.lower()
    
    try:
        if lang == "python":
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
                if len(funcs) == 1:
                    result["graph_data"] = PythonFlowBuilder().build_for_function(funcs[0])
                else:
                    # Default: Wrapper
                    wrapper = ast.FunctionDef(name="Script", args=ast.arguments(args=[], defaults=[]), body=tree.body, decorator_list=[])
                    result["graph_data"] = PythonFlowBuilder().build_for_function(wrapper)

        elif lang == "java":
            methods = extract_java_methods(request.code)
            result["functions"]["names"] = [m["name"] for m in methods]
            result["functions"]["count"] = len(methods)
            result["complexity"] = {m["name"]: calculate_java_complexity(m["body"]) for m in methods}
            
            if request.function_name:
                target = next((m for m in methods if m["name"] == request.function_name), None)
                if target:
                    result["graph_data"] = JavaFlowBuilder().build_for_body(target["name"], target["body"])
            else:
                if len(methods) > 0:
                    result["graph_data"] = JavaFlowBuilder().build_for_body(methods[0]["name"], methods[0]["body"])

        elif lang in ["javascript", "typescript", "js", "ts"]:
            funcs = extract_js_functions(request.code)
            result["functions"]["names"] = [f["name"] for f in funcs]
            result["functions"]["count"] = len(funcs)
            result["complexity"] = {f["name"]: calculate_js_complexity(f["body"]) for f in funcs}
            
            if request.function_name:
                target = next((f for f in funcs if f["name"] == request.function_name), None)
                if target:
                    result["graph_data"] = JavaScriptFlowBuilder().build_for_body(target["name"], target["body"])
            else:
                if len(funcs) > 0:
                    result["graph_data"] = JavaScriptFlowBuilder().build_for_body(funcs[0]["name"], funcs[0]["body"])
                else:
                    # Treat whole file as script body
                    result["graph_data"] = JavaScriptFlowBuilder().build_for_body("Script", request.code)

        elif lang in ["cpp", "c", "c++"]:
            funcs = extract_cpp_methods(request.code)
            result["functions"]["names"] = [f["name"] for f in funcs]
            result["functions"]["count"] = len(funcs)
            result["complexity"] = {f["name"]: calculate_cpp_complexity(f["body"]) for f in funcs}
            
            if request.function_name:
                target = next((f for f in funcs if f["name"] == request.function_name), None)
                if target:
                    result["graph_data"] = CppFlowBuilder().build_for_body(target["name"], target["body"])
            else:
                if len(funcs) > 0:
                    result["graph_data"] = CppFlowBuilder().build_for_body(funcs[0]["name"], funcs[0]["body"])
                else:
                    result["graph_data"] = CppFlowBuilder().build_for_body("Main", request.code)

    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        return {"error": str(e)}

    return result
import ast
import re
import logging
import uuid
from typing import Optional
import google.generativeai as genai
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
                self.add_edge(cond_node, t_entry, "True", sourceHandle="right")
            
            # Process FALSE branch (else/elif)
            f_entry = f_exit = None
            f_term = False
            if stmt.orelse:
                f_entry, f_exit, f_term = self.stmt_sequence(stmt.orelse)
                if f_entry: 
                    self.add_edge(cond_node, f_entry, "False", sourceHandle="bottom")
            
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
                    self.add_edge(cond_node, merge, "False", sourceHandle="bottom")
                
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
                self.add_edge(loop_node, body_entry, "Loop", sourceHandle="bottom")
            
            # Loop back (only if body doesn't terminate)
            if body_exit and not body_term: 
                self.add_edge(body_exit, loop_node, targetHandle="left")
            
            # Exit point after loop
            after = self.add_node("Exit Loop", "process")
            self.add_edge(loop_node, after, "Done", sourceHandle="right")
            
            return loop_node, after, False

        # TRY / EXCEPT STATEMENT
        if isinstance(stmt, ast.Try):
            try_node = self.add_node("Try:", "process")
            
            # Process the try body inline (individual statements)
            body_entry, body_exit, body_term = self.stmt_sequence(stmt.body)
            if body_entry:
                self.add_edge(try_node, body_entry)
            
            # Merge point after try body and all except handlers
            merge = self.add_node("", "process")
            
            if body_exit and not body_term:
                self.add_edge(body_exit, merge)
            
            # Process each except handler
            for handler in stmt.handlers:
                exc_label = f"except {ast.unparse(handler.type) if handler.type else 'Exception'}"
                exc_node = self.add_node(exc_label, "decision")
                # Connect from try_node (exception path)
                self.add_edge(try_node, exc_node, "Error")
                h_entry, h_exit, h_term = self.stmt_sequence(handler.body)
                if h_entry:
                    self.add_edge(exc_node, h_entry)
                if h_exit and not h_term:
                    self.add_edge(h_exit, merge)
            
            # Process finally block if present
            if stmt.finalbody:
                f_entry, f_exit, f_term = self.stmt_sequence(stmt.finalbody)
                if f_entry:
                    self.add_edge(merge, f_entry)
                return try_node, f_exit if f_exit else merge, f_term
            
            return try_node, merge, False


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
        
        stmts = parse_java_structure(body_text)
        entry, exit_node, _ = self._process_block(stmts)
        
        if entry:
            self.add_edge(start, entry)
            
        return self.get_data()

    def _process_block(self, stmts):
        """Process a list of statements, returning (entry, exit, terminal)"""
        entry = None
        last_exit = None
        terminal = False

        for stmt in stmts:
            s_entry, s_exit, s_term = self._process_stmt(stmt)
            if not s_entry: continue
            
            if entry is None: entry = s_entry
            if last_exit:
                self.add_edge(last_exit, s_entry)
            
            last_exit = s_exit
            if s_term:
                terminal = True
                break
                
        return entry, last_exit, terminal

    def _process_stmt(self, stmt):
        """Process a single statement, returns (entry, exit, terminal)"""

        # FOR LOOP
        if stmt.startswith("for"):
            header_match = re.search(r"for\s*\((.*?)\)", stmt)
            header = header_match.group(0) if header_match else "For Loop"
            
            loop_node = self.add_node(header, "loop")
            
            body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
            body_content = body_match.group(1).strip() if body_match else ""
            
            if body_content:
                body_stmts = parse_java_structure(body_content)
                b_entry, b_exit, b_term = self._process_block(body_stmts)
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
            
            body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
            body_content = body_match.group(1).strip() if body_match else ""
            
            if body_content:
                body_stmts = parse_java_structure(body_content)
                b_entry, b_exit, b_term = self._process_block(body_stmts)
                if b_entry:
                    self.add_edge(loop_node, b_entry, "Loop", sourceHandle="bottom")
                    if b_exit and not b_term:
                        self.add_edge(b_exit, loop_node, targetHandle="left")

            after = self.add_node("Done", "process")
            self.add_edge(loop_node, after, "Done", sourceHandle="right")
            return loop_node, after, False

        # IF STATEMENT
        elif stmt.startswith("if"):
            header_match = re.search(r"if\s*\((.*?)\)", stmt)
            header = header_match.group(0) if header_match else "If"
            
            decision = self.add_node(header, "decision")
            
            # Parse true body
            body_match = re.search(r"\{(.*)\}", stmt, re.DOTALL)
            true_content = body_match.group(1).strip() if body_match else ""
            
            t_entry = t_exit = None
            t_term = False
            if true_content:
                t_stmts = parse_java_structure(true_content)
                t_entry, t_exit, t_term = self._process_block(t_stmts)
            
            if t_entry:
                self.add_edge(decision, t_entry, "True", sourceHandle="right")
            
            # Check for else
            # Find else part after the if body (simple approach)
            f_entry = f_exit = None
            f_term = False
            else_match = re.search(r"\}\s*else\s*\{(.*)\}", stmt, re.DOTALL)
            if else_match:
                else_content = else_match.group(1).strip()
                if else_content:
                    f_stmts = parse_java_structure(else_content)
                    f_entry, f_exit, f_term = self._process_block(f_stmts)
            
            if f_entry:
                self.add_edge(decision, f_entry, "False", sourceHandle="bottom")
            
            # Both terminal — no merge needed
            if t_term and f_term:
                return decision, None, True
            
            # Create merge point
            merge = self.add_node("", "process")
            
            if t_exit and not t_term: self.add_edge(t_exit, merge)
            elif not t_entry: self.add_edge(decision, merge, "True", sourceHandle="right")
            
            if f_exit and not f_term: self.add_edge(f_exit, merge)
            elif not f_entry: self.add_edge(decision, merge, "False", sourceHandle="bottom")
            
            return decision, merge, False

        # RETURN STATEMENT
        elif stmt.startswith("return"):
            label = stmt.replace("return", "").strip().replace(";", "")
            if not label: label = "Return"
            else: label = f"Return {label}"
            node = self.add_node(label, "terminator")
            return node, node, True
        
        # REGULAR STATEMENT
        else:
            label = stmt.strip()
            if len(label) > 40: label = label[:37] + "..."
            node = self.add_node(label, "process")
            return node, node, False

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
                    self.add_edge(loop_node, b_entry, "Loop", sourceHandle="bottom")
                    if b_exit and not b_term:
                        self.add_edge(b_exit, loop_node, targetHandle="left")
            
            # Done -> Bottom
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
# 7. CROSS-FILE ANALYSIS (PHASE 1)
# ==========================================

def extract_symbols(code: str, language: str) -> list:
    """Extract exported function/method names from a file"""
    lang = language.lower()
    names = []
    
    try:
        if lang == "python":
            tree = ast.parse(code)
            names = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
        elif lang == "java":
            methods = extract_java_methods(code)
            names = [m["name"] for m in methods]
        elif lang in ["javascript", "typescript", "js", "ts"]:
            funcs = extract_js_functions(code)
            names = [f["name"] for f in funcs]
        elif lang in ["cpp", "c", "c++"]:
            funcs = extract_cpp_methods(code)
            names = [f["name"] for f in funcs]
    except Exception as e:
        logger.warning(f"Symbol extraction failed: {e}")
    
    return names


def extract_function_calls(code: str, language: str) -> list:
    """Extract function call names from code (best-effort via regex)"""
    lang = language.lower()
    calls = set()
    
    # Universal regex: word followed by ( — catches most function calls
    # Exclude language keywords that look like calls
    KEYWORDS = {
        "if", "else", "elif", "for", "while", "return", "import", "from",
        "class", "def", "try", "except", "finally", "with", "as", "in",
        "print", "range", "len", "str", "int", "float", "list", "dict",
        "set", "tuple", "type", "isinstance", "hasattr", "getattr",
        "super", "self", "this", "new", "delete", "typeof", "void",
        "switch", "case", "catch", "throw", "throws", "public", "private",
        "protected", "static", "final", "abstract", "interface",
        "const", "let", "var", "function", "async", "await",
        "console", "document", "window", "require", "module", "exports",
        "include", "using", "namespace", "template", "virtual", "override",
        "sizeof", "nullptr", "true", "false", "null", "undefined",
        "printf", "scanf", "cout", "cin", "endl", "std",
    }
    
    # Match word( pattern — standard function calls
    for match in re.finditer(r'\b([a-zA-Z_]\w*)\s*\(', code):
        name = match.group(1)
        if name not in KEYWORDS and not name[0].isupper():
            # Skip class constructors (capitalized) for now
            calls.add(name)
    
    # For Python: also catch calls like module.function()
    if lang == "python":
        for match in re.finditer(r'\b\w+\.([a-zA-Z_]\w*)\s*\(', code):
            name = match.group(1)
            if name not in KEYWORDS:
                calls.add(name)
    
    return list(calls)


def detect_language(path: str) -> str:
    """Detect language from file extension"""
    ext = path.rsplit('.', 1)[-1].lower() if '.' in path else ''
    LANG_MAP = {
        'py': 'python', 'java': 'java',
        'js': 'javascript', 'jsx': 'javascript',
        'ts': 'typescript', 'tsx': 'typescript',
        'cpp': 'cpp', 'cc': 'cpp', 'c': 'c', 'h': 'cpp', 'hpp': 'cpp',
    }
    return LANG_MAP.get(ext, '')


class FileEntry(BaseModel):
    path: str
    content: str
    language: Optional[str] = None


class MultiFileRequest(BaseModel):
    files: list  # List of FileEntry dicts


@app.post("/analyze-multi")
async def analyze_multi(request: MultiFileRequest):
    """
    Analyze multiple files and return a cross-file symbol table.
    
    Returns:
        symbols: { filePath: [functionName, ...] }
        calls:   { filePath: { functionName: resolvedFilePath } }
        file_deps: { filePath: [importedFilePath, ...] }
    """
    symbols = {}      # path -> [function names defined here]
    all_calls = {}     # path -> [function names called here]
    resolved = {}      # path -> { callName: sourceFilePath }
    file_deps = {}     # path -> [imported file paths]
    
    try:
        # Pass 1: Extract symbols (function definitions) from every file
        for file_dict in request.files:
            path = file_dict["path"] if isinstance(file_dict, dict) else file_dict.path
            content = file_dict["content"] if isinstance(file_dict, dict) else file_dict.content
            lang_raw = file_dict.get("language") if isinstance(file_dict, dict) else file_dict.language
            lang = lang_raw or detect_language(path)
            
            if not lang:
                continue
            
            syms = extract_symbols(content, lang)
            symbols[path] = syms
        
        # Build reverse lookup: functionName -> filePath (first definition wins)
        symbol_lookup = {}  # functionName -> filePath
        for path, syms in symbols.items():
            for sym in syms:
                if sym not in symbol_lookup:
                    symbol_lookup[sym] = path
        
        # Pass 2: Extract function calls and resolve them
        for file_dict in request.files:
            path = file_dict["path"] if isinstance(file_dict, dict) else file_dict.path
            content = file_dict["content"] if isinstance(file_dict, dict) else file_dict.content
            lang_raw = file_dict.get("language") if isinstance(file_dict, dict) else file_dict.language
            lang = lang_raw or detect_language(path)
            
            if not lang:
                continue
            
            calls = extract_function_calls(content, lang)
            all_calls[path] = calls
            
            # Resolve: which calls map to functions defined in OTHER files?
            resolved_calls = {}
            deps = set()
            
            for call_name in calls:
                source_file = symbol_lookup.get(call_name)
                if source_file and source_file != path:
                    resolved_calls[call_name] = source_file
                    deps.add(source_file)
            
            if resolved_calls:
                resolved[path] = resolved_calls
            if deps:
                file_deps[path] = list(deps)
        
    except Exception as e:
        logger.error(f"Multi-file analysis failed: {str(e)}")
        return {"error": str(e)}
    
    return {
        "symbols": symbols,
        "calls": resolved,
        "file_deps": file_deps
    }


# ==========================================
# 8. MAIN API HANDLER
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

    # Generate insights from graph data
    result["insights"] = generate_insights(result)
    
    # Generate function dependency graph (when multiple functions exist)
    if result["functions"]["count"] > 1 and not request.function_name:
        try:
            lang = request.language.lower()
            func_bodies = {}
            
            # Extract function bodies for dependency analysis
            if lang == "python":
                tree = ast.parse(request.code)
                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef):
                        lines = request.code.split('\n')
                        func_bodies[node.name] = '\n'.join(lines[node.lineno - 1:node.end_lineno])
            elif lang == "java":
                for m in extract_java_methods(request.code):
                    func_bodies[m["name"]] = m["body"]
            elif lang in ["javascript", "typescript", "js", "ts"]:
                for f in extract_js_functions(request.code):
                    func_bodies[f["name"]] = f["body"]
            elif lang in ["cpp", "c", "c++"]:
                for f in extract_cpp_methods(request.code):
                    func_bodies[f["name"]] = f["body"]
            
            all_func_names = set(func_bodies.keys())
            
            # Build dependency edges: which function calls which
            dep_edges = []
            for caller, body in func_bodies.items():
                calls = extract_function_calls(body, lang)
                for call in calls:
                    if call in all_func_names and call != caller:
                        dep_edges.append({"source": caller, "target": call})
            
            # Build graph data for the frontend
            dep_nodes = []
            for i, fname in enumerate(func_bodies.keys()):
                cx = result["complexity"].get(fname, 0)
                dep_nodes.append({
                    "id": fname,
                    "data": {
                        "label": fname + "()",
                        "complexity": cx,
                    },
                    "type": "funcDep",
                })
            
            result["func_dep_graph"] = {
                "nodes": dep_nodes,
                "edges": [{"id": f'{e["source"]}->{e["target"]}', "source": e["source"], "target": e["target"]} for e in dep_edges],
            }
        except Exception as e:
            logger.warning(f"Function dep graph failed: {e}")
    
    return result


def generate_insights(result):
    """Generate heuristic code insights from analysis result"""
    insights = {
        "total_nodes": 0,
        "decision_count": 0,
        "loop_count": 0,
        "return_count": 0,
        "summary": "",
        "suggestions": []
    }
    
    gd = result.get("graph_data")
    if not gd:
        return insights
    
    nodes = gd.get("nodes", [])
    insights["total_nodes"] = len(nodes)
    
    for n in nodes:
        ntype = n.get("type", "")
        if ntype == "decision":
            insights["decision_count"] += 1
        elif ntype == "loop":
            insights["loop_count"] += 1
        elif ntype == "terminator":
            # Exclude the "Start:" node
            label = n.get("data", {}).get("label", "")
            if not label.startswith("Start:"):
                insights["return_count"] += 1
    
    # Build summary
    parts = []
    if insights["decision_count"]:
        parts.append(f"{insights['decision_count']} branch{'es' if insights['decision_count'] != 1 else ''}")
    if insights["loop_count"]:
        parts.append(f"{insights['loop_count']} loop{'s' if insights['loop_count'] != 1 else ''}")
    if insights["return_count"]:
        parts.append(f"{insights['return_count']} return point{'s' if insights['return_count'] != 1 else ''}")
    
    if parts:
        insights["summary"] = "This function has " + ", ".join(parts) + "."
    else:
        insights["summary"] = "This is a linear function with no branching."
    
    # Generate suggestions
    complexity = result.get("complexity", {})
    max_complexity = max(complexity.values()) if complexity else 0
    
    if max_complexity > 15:
        insights["suggestions"].append({
            "type": "warning",
            "text": f"High complexity ({max_complexity}) — strongly consider refactoring into smaller functions."
        })
    elif max_complexity > 10:
        insights["suggestions"].append({
            "type": "warning",
            "text": f"Moderate-high complexity ({max_complexity}) — consider splitting into smaller functions."
        })
    
    if insights["return_count"] > 3:
        insights["suggestions"].append({
            "type": "info",
            "text": f"Multiple return paths ({insights['return_count']}) — consider using early returns or a single exit point."
        })
    
    if insights["decision_count"] > 4:
        insights["suggestions"].append({
            "type": "info",
            "text": f"Many branches ({insights['decision_count']}) — consider a lookup table or strategy pattern."
        })
    
    if insights["loop_count"] > 2:
        insights["suggestions"].append({
            "type": "info",
            "text": f"Multiple loops ({insights['loop_count']}) — consider extracting loop bodies into helper functions."
        })
    
    if insights["total_nodes"] > 20:
        insights["suggestions"].append({
            "type": "info", 
            "text": "Large function — consider breaking it down for better readability and testability."
        })
    
    if not insights["suggestions"]:
        insights["suggestions"].append({
            "type": "success",
            "text": "This function looks clean and well-structured. ✨"
        })
    
    return insights


# ==========================================
# 10. AI CODE EXPLANATION (GEMINI)
# ==========================================

# In-memory API key storage
_gemini_api_key = None
_gemini_model = None


class ApiKeyRequest(BaseModel):
    api_key: str


class ExplainRequest(BaseModel):
    code: str
    language: str = "python"
    function_name: Optional[str] = None


@app.post("/set-api-key")
async def set_api_key(request: ApiKeyRequest):
    global _gemini_api_key, _gemini_model
    _gemini_api_key = request.api_key
    try:
        genai.configure(api_key=_gemini_api_key)
        _gemini_model = genai.GenerativeModel('gemini-2.5-flash')
        # Quick validation — list models
        return {"status": "ok", "message": "API key set successfully"}
    except Exception as e:
        _gemini_api_key = None
        _gemini_model = None
        return {"status": "error", "message": str(e)}


@app.post("/explain")
async def explain_code(request: ExplainRequest):
    global _gemini_api_key, _gemini_model
    
    if not _gemini_api_key or not _gemini_model:
        return {"error": "No API key configured. Please set your Gemini API key first."}
    
    try:
        code_to_explain = request.code
        func_context = ""
        
        # If a specific function is selected, extract just that function's code
        if request.function_name:
            func_context = f" for the function `{request.function_name}`"
            lang = request.language.lower()
            extracted = None
            
            try:
                if lang == "python":
                    tree = ast.parse(request.code)
                    for node in ast.walk(tree):
                        if isinstance(node, ast.FunctionDef) and node.name == request.function_name:
                            lines = request.code.split('\n')
                            extracted = '\n'.join(lines[node.lineno - 1:node.end_lineno])
                            break
                elif lang == "java":
                    methods = extract_java_methods(request.code)
                    target = next((m for m in methods if m["name"] == request.function_name), None)
                    if target:
                        extracted = f'{request.function_name}() {{\n{target["body"]}\n}}'
                elif lang in ["javascript", "typescript", "js", "ts"]:
                    funcs = extract_js_functions(request.code)
                    target = next((f for f in funcs if f["name"] == request.function_name), None)
                    if target:
                        extracted = f'function {request.function_name}() {{\n{target["body"]}\n}}'
                elif lang in ["cpp", "c", "c++"]:
                    funcs = extract_cpp_methods(request.code)
                    target = next((f for f in funcs if f["name"] == request.function_name), None)
                    if target:
                        extracted = f'{request.function_name}() {{\n{target["body"]}\n}}'
            except Exception:
                pass  # Fall back to full code
            
            if extracted:
                code_to_explain = extracted
        
        prompt = f"""You are a code explanation assistant for a visual code mapping tool called CodeMap.
The user is viewing a flowchart of their code. Explain the following {request.language} code{func_context}.

Format your response EXACTLY like this (plain text only, no markdown):

OVERVIEW:
[1-2 sentences: what this code does and why. Keep it simple.]

ALGORITHM:
1. [First step — matches the Start node in the flowchart]
2. [Next step — describe what happens, match process/decision nodes]
3. [Continue numbering each logical step]
... [Use "Loop:" prefix for loop steps, "Check:" prefix for if/else branches]

Rules:
- The algorithm steps should map to the flowchart nodes the user sees
- Use "Check:" for if/else decisions (e.g., "Check: Is b not zero?")
- Use "Loop:" for while/for loops (e.g., "Loop: While b != 0, swap values")
- Keep each step to one short line
- Use simple language a junior developer would understand
- Do NOT use markdown, bullet points, or bold — just plain numbered list

Code:
```{request.language}
{code_to_explain}
```"""
        
        response = _gemini_model.generate_content(prompt)
        return {"explanation": response.text.strip()}
        
    except Exception as e:
        logger.error(f"Gemini explain failed: {str(e)}")
        return {"error": f"AI explanation failed: {str(e)}"}


# ==========================================
# 11. PROJECT BLUEPRINT — BATCH ANALYSIS
# ==========================================

class ProjectFile(BaseModel):
    path: str
    content: str
    language: Optional[str] = None

class ProjectRequest(BaseModel):
    files: list[ProjectFile]


def detect_language(path: str) -> Optional[str]:
    """Detect language from file extension."""
    ext_map = {
        '.py': 'python', '.java': 'java',
        '.js': 'javascript', '.jsx': 'javascript',
        '.ts': 'typescript', '.tsx': 'typescript',
        '.cpp': 'cpp', '.cc': 'cpp', '.c': 'c',
        '.h': 'cpp', '.hpp': 'cpp',
        '.cs': 'csharp', '.rb': 'ruby',
        '.go': 'go', '.rs': 'rust',
        '.kt': 'kotlin', '.swift': 'swift',
    }
    for ext, lang in ext_map.items():
        if path.lower().endswith(ext):
            return lang
    return None


@app.post("/analyze-project")
async def analyze_project(request: ProjectRequest):
    """Batch-analyze all files in a project and return file relationships."""
    
    file_info = {}   # path -> { language, functions, line_count, complexity }
    
    try:
        # Analyze each file for functions and metadata
        for f in request.files:
            lang = f.language or detect_language(f.path)
            if not lang:
                continue
            
            funcs = []
            complexity = {}
            
            try:
                if lang == "python":
                    tree = ast.parse(f.content)
                    func_nodes = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
                    funcs = [fn.name for fn in func_nodes]
                    complexity = {fn.name: calculate_python_complexity(fn) for fn in func_nodes}
                elif lang == "java":
                    methods = extract_java_methods(f.content)
                    funcs = [m["name"] for m in methods]
                elif lang in ["javascript", "typescript"]:
                    jsfuncs = extract_js_functions(f.content)
                    funcs = [fn["name"] for fn in jsfuncs]
                elif lang in ["cpp", "c"]:
                    cfuncs = extract_cpp_methods(f.content)
                    funcs = [fn["name"] for fn in cfuncs]
            except Exception:
                pass
            
            file_info[f.path] = {
                "language": lang,
                "functions": funcs,
                "line_count": f.content.count('\n') + 1,
                "complexity": complexity,
            }
        
        # Cross-file dependency analysis (inlined from analyze_multi)
        symbols = {}   # path -> [function names defined]
        resolved = {}  # path -> { callName: sourceFilePath }
        file_deps = {} # path -> [imported file paths]
        
        # Pass 1: Extract symbols
        for f in request.files:
            lang = f.language or detect_language(f.path)
            if not lang:
                continue
            syms = extract_symbols(f.content, lang)
            symbols[f.path] = syms
        
        # Build reverse lookup
        symbol_lookup = {}
        for path, syms in symbols.items():
            for sym in syms:
                if sym not in symbol_lookup:
                    symbol_lookup[sym] = path
        
        # Pass 2: Resolve calls
        for f in request.files:
            lang = f.language or detect_language(f.path)
            if not lang:
                continue
            calls_list = extract_function_calls(f.content, lang)
            resolved_calls = {}
            deps = set()
            for call_name in calls_list:
                source_file = symbol_lookup.get(call_name)
                if source_file and source_file != f.path:
                    resolved_calls[call_name] = source_file
                    deps.add(source_file)
            if resolved_calls:
                resolved[f.path] = resolved_calls
            if deps:
                file_deps[f.path] = list(deps)
        
        calls = resolved
        
        # Build graph nodes and edges for the frontend
        graph_nodes = []
        for path, info in file_info.items():
            filename = path.split('/')[-1] if '/' in path else path.split('\\')[-1] if '\\' in path else path
            max_cx = max(info["complexity"].values()) if info["complexity"] else 0
            graph_nodes.append({
                "id": path,
                "data": {
                    "label": filename,
                    "language": info["language"],
                    "functions": info["functions"],
                    "functionCount": len(info["functions"]),
                    "lineCount": info["line_count"],
                    "maxComplexity": max_cx,
                },
            })
        
        graph_edges = []
        edge_id = 0
        for source_path, deps in file_deps.items():
            for target_path in deps:
                # Find which functions are called
                called_funcs = []
                if source_path in calls:
                    for func_name, src_file in calls[source_path].items():
                        if src_file == target_path:
                            called_funcs.append(func_name)
                
                edge_id += 1
                graph_edges.append({
                    "id": f"e{edge_id}",
                    "source": source_path,
                    "target": target_path,
                    "data": {
                        "functions": called_funcs,
                        "label": ", ".join(called_funcs) if called_funcs else "imports",
                    },
                })
        
        # Project-level stats
        total_files = len(file_info)
        total_functions = sum(len(info["functions"]) for info in file_info.values())
        total_lines = sum(info["line_count"] for info in file_info.values())
        languages = list(set(info["language"] for info in file_info.values()))
        
        return {
            "file_info": file_info,
            "dep_graph": {
                "nodes": graph_nodes,
                "edges": graph_edges,
            },
            "project_stats": {
                "total_files": total_files,
                "total_functions": total_functions,
                "total_lines": total_lines,
                "languages": languages,
            },
        }
    
    except Exception as e:
        logger.error(f"Project analysis failed: {str(e)}")
        return {"error": str(e)}
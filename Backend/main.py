from fastapi import FastAPI
import ast

app = FastAPI(title="CodeMap - Code Analyzer")

@app.post("/analyze")
async def analyze_code(code: str):
    try:
        # Parse the code into an AST
        tree = ast.parse(code)

        # Extract function names
        functions = [node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]

        # Extract class names
        classes = [node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]

        # Count lines
        line_count = len(code.splitlines())

        return {
            "functions": {
                "count": len(functions),
                "names": functions
            },
            "classes": {
                "count": len(classes),
                "names": classes
            },
            "lines_of_code": line_count
        }

    except SyntaxError as e:
        return {"error": f"Syntax error: {str(e)}"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/")
async def root():
    return {"message": "Welcome to CodeMap API. Use POST /analyze to analyze your code."}

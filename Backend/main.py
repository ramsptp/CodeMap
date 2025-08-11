from fastapi import FastAPI
from pydantic import BaseModel
import ast
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CodeRequest(BaseModel):
    code: str

@app.post("/analyze")
async def analyze_code(request: CodeRequest):
    code = request.code
    try:
        tree = ast.parse(code)
        functions = [node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]
        classes = [node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]
        line_count = len(code.splitlines())

        return {
            "functions": {"count": len(functions), "names": functions},
            "classes": {"count": len(classes), "names": classes},
            "lines_of_code": line_count,
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/")
async def root():
    return {"message": "CodeMap API running. Use POST /analyze with JSON {code: 'your code'}"}

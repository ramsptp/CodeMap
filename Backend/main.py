from fastapi import FastAPI, UploadFile
import ast

app = FastAPI()

@app.post("/analyze-code/")
async def analyze_code(file: UploadFile):
    code = (await file.read()).decode("utf-8")
    tree = ast.parse(code)
    return {"functions": [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]}

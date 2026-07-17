import json
from pathlib import Path

from graphify.extract import collect_files, extract


def main():
    detect = json.loads(
        Path("graphify-out/.graphify_detect.json").read_text(encoding="utf-8")
    )
    code_files = []
    for file_name in detect.get("files", {}).get("code", []):
        file_path = Path(file_name)
        code_files.extend(
            collect_files(file_path) if file_path.is_dir() else [file_path]
        )

    result = (
        extract(code_files, cache_root=Path("."))
        if code_files
        else {"nodes": [], "edges": [], "input_tokens": 0, "output_tokens": 0}
    )
    Path("graphify-out/.graphify_ast.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"AST: {len(result['nodes'])} nodes, {len(result['edges'])} edges")


if __name__ == "__main__":
    main()

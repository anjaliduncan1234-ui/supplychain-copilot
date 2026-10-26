import pathlib
r = pathlib.Path(__file__).parent
csv = (r/"data/ARIS_Supply_Chain_Simulated_500_Orders.csv").read_text(encoding="utf-8")
assert "</script" not in csv.lower()
html = (r/"src/template.html").read_text(encoding="utf-8").replace("/*ENGINE*/", (r/"src/engine.js").read_text(encoding="utf-8")).replace("/*CSV*/", csv)
(r/"dist").mkdir(exist_ok=True); (r/"dist/index.html").write_text(html, encoding="utf-8"); print("built", len(html)//1024, "KB")

"""Regenerate transparent raster icons from mark.svg (optional: pip install Pillow PyMuPDF)."""
from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "assets" / "icons"
source = (ROOT / "mark.svg").read_text(encoding="utf-8")
palette = ET.fromstring(source).attrib

def render(color):
    root = ET.fromstring(source)
    root.set("viewBox", "6 6 52 52")
    for node in root.iter():
        for attr, value in list(node.attrib.items()):
            if value == "currentColor":
                node.set(attr, color)
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    with fitz.open(stream=ET.tostring(root), filetype="svg") as document:
        with fitz.open("pdf", document.convert_to_pdf()) as pdf:
            pixels = pdf[0].get_pixmap(matrix=fitz.Matrix(8, 8), alpha=True)
    return Image.open(BytesIO(pixels.tobytes("png"))).convert("RGBA")

for suffix, color in (("", palette["color"]), ("-dark", palette["data-dark-color"])):
    image = render(color)
    assert image.getpixel((0, 0))[3] == 0, "Icon corners must remain transparent"
    image.resize((32, 32), Image.Resampling.LANCZOS).save(ROOT / f"favicon{suffix}-32.png")
    image.save(ROOT / f"favicon{suffix}.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    if not suffix:
        image.resize((180, 180), Image.Resampling.LANCZOS).save(ROOT / "apple-touch-icon.png")
print("Generated transparent light/dark PNG, ICO and Apple touch icons from mark.svg.")

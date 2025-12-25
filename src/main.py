#!/usr/bin/env python
import csv
import io
from pathlib import Path


PARENT_DIR = Path(__file__).resolve().parent
INDEX_TEMPLATE = Path(PARENT_DIR / "assets/index.html").read_text()
HEAD_TEMPLATE = Path(PARENT_DIR / "assets/head.html").read_text()
BODY_TEMPLATE = Path(PARENT_DIR / "assets/body.html").read_text()
SNIPPET_TEMPLATE = Path(PARENT_DIR / "assets/snippet.html").read_text()
SCRIPT_SNIPPET = Path(PARENT_DIR / "assets/script.html").read_text()
EXPECTED_HEADER = [
    "name",
    "abv",
    "image_url",
    "description",
    "price_big",
    "price_small",
]

TAPLIST = Path(PARENT_DIR / "assets/taplist.csv").read_text()


def gen_snippet(beer):
    title = beer["tap_num"] + ". " + beer["name"]
    image_snippet = (
        f"<img src='{beer['image_url']}' alt='{beer['name']}' />"
        if beer["image_url"]
        else '<div class="placeholder"><i class="fas fa-beer"></i></div>'
    )

    return SNIPPET_TEMPLATE.format(
        title=title,
        abv=beer["abv"],
        image_snippet=image_snippet,
        description=beer["description"],
        price_big=beer["price_big"],
        price_small=beer["price_small"],
    )


def get_snippets(csv_reader):
    snippets_list = []
    for row in csv_reader:
        snippets_list.append(gen_snippet(row))
    return "\n".join(snippets_list)


if __name__ == "__main__":
    reader = csv.DictReader(io.StringIO(TAPLIST))
    if reader.fieldnames != [
        "tap_num",
        "name",
        "abv",
        "image_url",
        "description",
        "price_big",
        "price_small",
    ]:
        raise ValueError(
            f"Unexpected CSV header, expected: {EXPECTED_HEADER}, got: {reader.fieldnames}"
        )

    snippets_html = get_snippets(reader)
    body_html = BODY_TEMPLATE.format(beer_snippets=snippets_html, script=SCRIPT_SNIPPET)
    final_html = INDEX_TEMPLATE.format(header=HEAD_TEMPLATE, body=body_html)
    Path(PARENT_DIR / "../docs/index.html").write_text(final_html)
    print("Done")

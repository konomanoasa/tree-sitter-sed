import sys
from pathlib import Path

from setuptools import Extension, setup

Path("dist/metadata").mkdir(parents=True, exist_ok=True)

setup(
    options={
        "build": {"build_base": "dist/build"},
        "egg_info": {"egg_base": "dist/metadata"},
    },
    ext_modules=[
        Extension(
            "tree_sitter_sed.binding",
            sources=[
                "bindings/python/binding.c",
                "sed_ere/src/parser.c",
                "sed_ere/src/scanner.c",
                "src/parser.c",
                "src/scanner.c",
            ],
            include_dirs=["src", "sed_ere/src"],
            depends=[
                "common/scanner.h",
                "common/tokens.h",
                "sed_ere/src/tree_sitter/parser.h",
                "src/tree_sitter/parser.h",
            ],
            extra_compile_args=["/std:c17", "/utf-8"]
            if sys.platform == "win32"
            else ["-std=c17"],
        )
    ],
)

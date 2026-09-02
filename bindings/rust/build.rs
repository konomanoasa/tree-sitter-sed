use std::path::Path;

fn compile_parser(source_dir: &Path, library_name: &str, wasm_headers: Option<&Path>) {
    let parser_path = source_dir.join("parser.c");
    let scanner_path = source_dir.join("scanner.c");
    let mut c_config = cc::Build::new();
    c_config.std("c11").include(source_dir);

    #[cfg(target_env = "msvc")]
    c_config.flag("-utf-8");

    if let Some(headers) = wasm_headers {
        c_config.include(headers);
    }

    c_config.file(&parser_path).file(&scanner_path);
    c_config.compile(library_name);

    println!("cargo:rerun-if-changed={}", parser_path.display());
    println!("cargo:rerun-if-changed={}", scanner_path.display());
}

fn main() {
    let target = std::env::var("TARGET").expect("Cargo must provide TARGET");
    let wasm_headers = (target == "wasm32-unknown-unknown").then(|| {
        std::env::var_os("DEP_TREE_SITTER_LANGUAGE_WASM_HEADERS")
            .map(std::path::PathBuf::from)
            .expect(
                "tree-sitter-language must provide its headers when compiling for wasm32-unknown-unknown",
            )
    });

    compile_parser(Path::new("src"), "tree-sitter-sed", wasm_headers.as_deref());
    compile_parser(
        Path::new("sed_ere/src"),
        "tree-sitter-sed-ere",
        wasm_headers.as_deref(),
    );
    println!("cargo:rerun-if-changed=common/scanner.h");
}

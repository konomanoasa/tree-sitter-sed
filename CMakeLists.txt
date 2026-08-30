cmake_minimum_required(VERSION 3.13)

project(
  tree-sitter-sed
  VERSION 0.3.0
  DESCRIPTION "Tree-sitter grammars for POSIX sed."
  HOMEPAGE_URL "https://github.com/konomanoasa/tree-sitter-sed"
  LANGUAGES C
)

option(BUILD_SHARED_LIBS "Build using shared libraries" ON)
option(TREE_SITTER_REUSE_ALLOCATOR "Reuse the Tree-sitter allocator" OFF)

file(
  STRINGS src/parser.c
  TREE_SITTER_ABI_DEFINITION
  REGEX "^#define LANGUAGE_VERSION [0-9]+$"
)
file(
  STRINGS sed_ere/src/parser.c
  TREE_SITTER_ERE_ABI_DEFINITION
  REGEX "^#define LANGUAGE_VERSION [0-9]+$"
)
if(
  NOT TREE_SITTER_ABI_DEFINITION MATCHES "^#define LANGUAGE_VERSION [0-9]+$"
  OR NOT TREE_SITTER_ERE_ABI_DEFINITION MATCHES
    "^#define LANGUAGE_VERSION [0-9]+$"
)
  message(FATAL_ERROR "Both parsers must define one LANGUAGE_VERSION")
endif()
if(NOT TREE_SITTER_ABI_DEFINITION STREQUAL TREE_SITTER_ERE_ABI_DEFINITION)
  message(FATAL_ERROR "The sed and sed_ere parsers must use the same ABI")
endif()
string(
  REGEX REPLACE "^#define LANGUAGE_VERSION " ""
  TREE_SITTER_ABI_VERSION
  "${TREE_SITTER_ABI_DEFINITION}"
)

include(GNUInstallDirs)
if(CMAKE_CURRENT_SOURCE_DIR STREQUAL CMAKE_SOURCE_DIR)
  include(CTest)
endif()

add_library(
  tree-sitter-sed
  src/parser.c
  src/scanner.c
  sed_ere/src/parser.c
  sed_ere/src/scanner.c
)
set_source_files_properties(
  src/scanner.c
  PROPERTIES INCLUDE_DIRECTORIES "${CMAKE_CURRENT_SOURCE_DIR}/src"
)
set_source_files_properties(
  sed_ere/src/scanner.c
  PROPERTIES INCLUDE_DIRECTORIES "${CMAKE_CURRENT_SOURCE_DIR}/sed_ere/src"
)
target_include_directories(
  tree-sitter-sed
  INTERFACE
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/bindings/c>
    $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
)
target_compile_definitions(
  tree-sitter-sed
  PRIVATE
    $<$<BOOL:${TREE_SITTER_REUSE_ALLOCATOR}>:TREE_SITTER_REUSE_ALLOCATOR>
    $<$<CONFIG:Debug>:TREE_SITTER_DEBUG>
)
set_target_properties(
  tree-sitter-sed
  PROPERTIES
    C_STANDARD 11
    C_STANDARD_REQUIRED ON
    DEFINE_SYMBOL ""
    POSITION_INDEPENDENT_CODE ON
    SOVERSION "${TREE_SITTER_ABI_VERSION}.${PROJECT_VERSION_MAJOR}"
)

if(BUILD_TESTING AND CMAKE_CURRENT_SOURCE_DIR STREQUAL CMAKE_SOURCE_DIR)
  add_executable(tree-sitter-sed-binding-test test/binding.test.c)
  target_link_libraries(tree-sitter-sed-binding-test PRIVATE tree-sitter-sed)
  add_test(
    NAME tree-sitter-sed-binding
    COMMAND tree-sitter-sed-binding-test
  )
endif()

configure_file(
  bindings/c/tree-sitter-sed.pc.in
  "${CMAKE_CURRENT_BINARY_DIR}/tree-sitter-sed.pc"
  @ONLY
)

install(
  TARGETS tree-sitter-sed
  ARCHIVE DESTINATION "${CMAKE_INSTALL_LIBDIR}"
  LIBRARY DESTINATION "${CMAKE_INSTALL_LIBDIR}"
  RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}"
)
install(
  DIRECTORY bindings/c/tree_sitter
  DESTINATION "${CMAKE_INSTALL_INCLUDEDIR}"
  FILES_MATCHING PATTERN "*.h"
)
install(
  FILES "${CMAKE_CURRENT_BINARY_DIR}/tree-sitter-sed.pc"
  DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"
)
install(
  DIRECTORY queries/
  DESTINATION "${CMAKE_INSTALL_DATADIR}/tree-sitter/queries/sed"
  FILES_MATCHING PATTERN "*.scm"
)
install(
  DIRECTORY sed_ere/queries/
  DESTINATION "${CMAKE_INSTALL_DATADIR}/tree-sitter/queries/sed_ere"
  FILES_MATCHING PATTERN "*.scm"
)

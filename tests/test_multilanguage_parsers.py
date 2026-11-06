"""Tests for multi-language AST structural parsers (Java, Go, Rust, C/C++, C#)."""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from backend.parser.cpp_parser import CppParser
from backend.parser.csharp_parser import CSharpParser
from backend.parser.go_parser import GoParser
from backend.parser.java_parser import JavaParser
from backend.parser.rust_parser import RustParser
from backend.parser.service import ParserService


def test_java_parser(tmp_path: Path) -> None:
    java_code = textwrap.dedent("""\
        /**
         * Service package documentation.
         */
        package com.example.service;

        import java.util.List;
        import java.util.ArrayList;
        import static org.junit.Assert.assertEquals;

        /**
         * Represents a user repository service.
         */
        public class UserService extends BaseService implements IUserService {
            private List<String> users;

            /**
             * Find user by id.
             */
            public User findById(Long id) throws UserNotFoundException {
                return null;
            }

            public void saveUser(User user) {
                // save logic
            }
        }
    """)
    file_path = tmp_path / "UserService.java"
    file_path.write_text(java_code, encoding="utf-8")

    parser = JavaParser()
    parsed = parser.parse_file(str(file_path))

    assert parsed.language == "Java"
    assert len(parsed.imports) == 3
    assert parsed.imports[0].module == "java.util"
    assert "List" in parsed.imports[0].names

    assert len(parsed.classes) == 1
    cls = parsed.classes[0]
    assert cls.name == "UserService"
    assert "BaseService" in cls.bases
    assert "IUserService" in cls.bases
    assert "Represents a user repository service." in cls.docstring

    assert len(cls.methods) == 2
    assert cls.methods[0].name == "findById"
    assert "id" in cls.methods[0].args
    assert cls.methods[1].name == "saveUser"


def test_go_parser(tmp_path: Path) -> None:
    go_code = textwrap.dedent("""\
        // Package server provides HTTP server capabilities.
        package server

        import (
            "fmt"
            "net/http"
            log "github.com/sirupsen/logrus"
        )

        // Config holds server settings.
        type Config struct {
            Port int
        }

        type Handler interface {
            ServeHTTP(w http.ResponseWriter, r *http.Request)
        }

        // Start spins up the listener.
        func (c *Config) Start() error {
            return nil
        }

        func HealthCheck() string {
            return "OK"
        }
    """)
    file_path = tmp_path / "server.go"
    file_path.write_text(go_code, encoding="utf-8")

    parser = GoParser()
    parsed = parser.parse_file(str(file_path))

    assert parsed.language == "Go"
    assert len(parsed.imports) == 3
    modules = [imp.module for imp in parsed.imports]
    assert "fmt" in modules
    assert "net/http" in modules
    assert "github.com/sirupsen/logrus" in modules

    assert len(parsed.classes) == 2
    assert parsed.classes[0].name == "Config"
    assert parsed.classes[1].name == "Handler"

    assert len(parsed.functions) == 2
    func_names = [f.name for f in parsed.functions]
    assert "(c *Config).Start" in func_names
    assert "HealthCheck" in func_names


def test_rust_parser(tmp_path: Path) -> None:
    rust_code = textwrap.dedent("""\
        //! Core analytics engine module.

        use std::collections::HashMap;
        use crate::models::{User, Repository};

        /// Repository health metrics.
        pub struct HealthReport {
            pub score: f64,
        }

        pub enum Grade {
            A, B, C, D
        }

        /// Computes health score from repository.
        pub async fn compute_score(repo: &Repository) -> HealthReport {
            HealthReport { score: 95.0 }
        }
    """)
    file_path = tmp_path / "lib.rs"
    file_path.write_text(rust_code, encoding="utf-8")

    parser = RustParser()
    parsed = parser.parse_file(str(file_path))

    assert parsed.language == "Rust"
    assert len(parsed.imports) == 2
    assert parsed.imports[0].module == "std::collections"

    assert len(parsed.classes) == 2
    type_names = [c.name for c in parsed.classes]
    assert "HealthReport" in type_names
    assert "Grade" in type_names

    assert len(parsed.functions) == 1
    assert parsed.functions[0].name == "compute_score"
    assert "repo" in parsed.functions[0].args


def test_cpp_parser(tmp_path: Path) -> None:
    cpp_code = textwrap.dedent("""\
        /**
         * Vector matrix library.
         */
        #include <vector>
        #include <string>
        #include "matrix.h"

        // Represents a dense matrix.
        class Matrix : public MathBase {
        public:
            int rows;
            int cols;
        };

        // Calculates determinant.
        double calculate_det(const Matrix& m) {
            return 1.0;
        }
    """)
    file_path = tmp_path / "matrix.cpp"
    file_path.write_text(cpp_code, encoding="utf-8")

    parser = CppParser()
    parsed = parser.parse_file(str(file_path))

    assert parsed.language == "C++"
    assert len(parsed.imports) == 3
    assert parsed.imports[0].module == "vector"

    assert len(parsed.classes) == 1
    assert parsed.classes[0].name == "Matrix"
    assert "MathBase" in parsed.classes[0].bases

    assert len(parsed.functions) == 1
    assert parsed.functions[0].name == "calculate_det"
    assert "m" in parsed.functions[0].args


def test_csharp_parser(tmp_path: Path) -> None:
    cs_code = textwrap.dedent("""\
        using System;
        using System.Collections.Generic;
        using Storage = System.IO;

        namespace Engine.Services;

        /// <summary>
        /// Scan engine coordinator service.
        /// </summary>
        public class ScanEngine : IScanner, IDisposable {
            /// <summary>
            /// Run full repository analysis.
            /// </summary>
            public async Task<ScanResult> ExecuteScanAsync(string repoPath) {
                return null;
            }
        }
    """)
    file_path = tmp_path / "ScanEngine.cs"
    file_path.write_text(cs_code, encoding="utf-8")

    parser = CSharpParser()
    parsed = parser.parse_file(str(file_path))

    assert parsed.language == "C#"
    assert len(parsed.imports) == 3
    assert parsed.imports[0].module == "System"

    assert len(parsed.classes) == 1
    cls = parsed.classes[0]
    assert cls.name == "ScanEngine"
    assert "IScanner" in cls.bases
    assert "IDisposable" in cls.bases

    assert len(cls.methods) == 1
    assert cls.methods[0].name == "ExecuteScanAsync"
    assert "repoPath" in cls.methods[0].args


@pytest.mark.asyncio
async def test_parser_service_multi_language_end_to_end(tmp_path: Path) -> None:
    (tmp_path / "main.py").write_text("def run(): pass\n", encoding="utf-8")
    (tmp_path / "app.ts").write_text("export function start(): void {}\n", encoding="utf-8")
    (tmp_path / "Main.java").write_text("public class Main { public static void main(String[] args) {} }\n", encoding="utf-8")
    (tmp_path / "main.go").write_text("package main\nfunc main() {}\n", encoding="utf-8")
    (tmp_path / "main.rs").write_text("fn main() {}\n", encoding="utf-8")
    (tmp_path / "util.cpp").write_text("void helper() {}\n", encoding="utf-8")
    (tmp_path / "Program.cs").write_text("public class Program { public void Run() {} }\n", encoding="utf-8")

    svc = ParserService()
    parsed = await svc.parse_repository(str(tmp_path), incremental=False)

    languages = {pf.language for pf in parsed.values()}
    assert "Python" in languages
    assert "TypeScript" in languages
    assert "Java" in languages
    assert "Go" in languages
    assert "Rust" in languages
    assert "C++" in languages
    assert "C#" in languages

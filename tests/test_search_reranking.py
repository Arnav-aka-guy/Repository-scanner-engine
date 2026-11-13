from backend.embeddings.reranker import SearchReranker
from backend.health.scoring import calculate_grade
from backend.health.service import compute_health_report
from backend.parser.models import FunctionInfo, ParsedFile


def test_grade_cannot_be_good_if_any_dimension_is_at_risk():
    # If all dimensions healthy and score is 92.0 -> A
    assert calculate_grade(92.0, ["Healthy", "Healthy", "Healthy", "Healthy", "Healthy"]) == "A"
    assert calculate_grade(84.0, ["Healthy", "Healthy", "Healthy", "Needs Review", "Healthy"]) == "B"

    # If any dimension is "At Risk", grade cannot be A or B — capped at C
    assert calculate_grade(92.0, ["Healthy", "Healthy", "Healthy", "Healthy", "At Risk"]) == "C"
    assert calculate_grade(85.0, ["At Risk", "Healthy", "Healthy", "Healthy", "Healthy"]) == "C"
    assert calculate_grade(65.0, ["At Risk", "Healthy", "Healthy", "Healthy", "Healthy"]) == "D"
    assert calculate_grade(50.0, ["At Risk", "Healthy", "Healthy", "Healthy", "Healthy"]) == "E"


def test_vendor_and_build_files_excluded_from_complexity():
    from backend.health.classifier import is_source_file

    assert is_source_file("backend/api/auth.py") is True
    assert is_source_file("frontend/src/App.tsx") is True

    # Excluded categories
    assert is_source_file("node_modules/react/index.js") is False
    assert is_source_file("frontend/dist/assets/index.js") is False
    assert is_source_file(".venv/lib/site-packages/fastapi/main.py") is False
    assert is_source_file("alembic/versions/004_migration.py") is False
    assert is_source_file("tests/test_api.py") is False


def test_fixed_benchmark_repository_snapshot_scores():
    # Benchmark 1: Pristine clean repository
    clean_pf = {
        "src/core.py": ParsedFile(
            file_path="src/core.py",
            language="Python",
            functions=[
                FunctionInfo(
                    name="calculate_sum",
                    start_line=1,
                    end_line=10,
                    source_code="def calculate_sum(a, b):\n    '''Calculate sum.'''\n    return a + b\n",
                    docstring="Calculate sum.",
                )
            ],
            classes=[],
        )
    }
    clean_report = compute_health_report(clean_pf)
    assert clean_report.total_score >= 80.0
    assert clean_report.grade in ("A", "B")

    # Benchmark 2: Repository with hardcoded secret (Security At Risk)
    secret_pf = {
        "src/config.py": ParsedFile(
            file_path="src/config.py",
            language="Python",
            functions=[
                FunctionInfo(
                    name="get_key",
                    start_line=1,
                    end_line=10,
                    source_code="def get_key():\n    token = 'sk-abcdef1234567890abcdef1234567890'\n    return token\n",
                    docstring="",
                )
            ],
            classes=[],
        )
    }
    secret_report = compute_health_report(secret_pf)
    # Because Security is "At Risk", overall grade must be capped at C or worse
    sec_dim = next(d for d in secret_report.dimensions if d.key == "security")
    assert sec_dim.status == "At Risk"
    assert secret_report.grade in ("C", "D", "E")


def test_hybrid_search_exact_symbol_boost_and_rationale():
    reranker = SearchReranker()
    vec_results = [
        {
            "entity_name": "generic_helper",
            "file_path": "src/utils.py",
            "start_line": 10,
            "score": 0.82,
            "metadata": {"entity_name": "generic_helper", "file_path": "src/utils.py", "start_line": 10},
        },
        {
            "entity_name": "authenticate_user",
            "file_path": "src/auth.py",
            "start_line": 1,
            "score": 0.80,
            "metadata": {"entity_name": "authenticate_user", "file_path": "src/auth.py", "start_line": 1},
        },
    ]
    kw_results = [
        {
            "entity_name": "authenticate_user",
            "file_path": "src/auth.py",
            "start_line": 1,
            "keyword_score": 5.0,
            "metadata": {"entity_name": "authenticate_user", "file_path": "src/auth.py", "start_line": 1},
        }
    ]

    reranked = reranker.rerank(vec_results, kw_results, top_k=5, query="authenticate_user")
    assert len(reranked) >= 1
    top_hit = reranked[0]
    # Exact symbol match must be boosted to rank 1
    assert top_hit["entity_name"] == "authenticate_user"
    assert any("exact symbol name" in r for r in top_hit["match_reasons"])

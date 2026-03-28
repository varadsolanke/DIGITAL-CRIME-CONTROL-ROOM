import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

from database.db_config import get_db_connection, initialize_database
from utils.data_loader import load_csv_to_db
from utils.query_executor import (
    build_predefined_query_sql,
    convert_natural_language_to_sql,
    execute_custom_query_safely,
    execute_select_query,
    refresh_attack_summary,
    run_predefined_query,
    run_transaction_demo,
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER = BASE_DIR / "uploads"
SCHEMA_PATH = BASE_DIR / "database" / "schema.sql"
ALLOWED_EXTENSIONS = {"csv"}

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = str(UPLOAD_FOLDER)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
initialize_database(str(SCHEMA_PATH))


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _row_count(conn, table_name: str) -> int:
    rows = execute_select_query(conn, f"SELECT COUNT(*) AS total FROM {table_name}")
    return int(rows[0]["total"]) if rows else 0


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file part in request."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"status": "error", "message": "No file selected."}), 400

    if not allowed_file(file.filename):
        return jsonify({"status": "error", "message": "Only CSV files are allowed."}), 400

    filename = secure_filename(file.filename)
    save_path = UPLOAD_FOLDER / filename
    file.save(save_path)

    conn = None
    try:
        conn = get_db_connection()
        load_result = load_csv_to_db(str(save_path), conn)
        refresh_attack_summary(conn)

        performance_rows = execute_select_query(
            conn,
            """
            EXPLAIN SELECT *
            FROM activity_logs
            WHERE user_id = 1
            ORDER BY timestamp DESC
            LIMIT 10
            """,
        )

        return jsonify(
            {
                "status": "success",
                "message": "CSV uploaded and processed successfully.",
                "inserted_rows": load_result.inserted_rows,
                "skipped_rows": load_result.skipped_rows,
                "index_performance_hint": performance_rows,
            }
        )
    except Exception as error:
        return jsonify({"status": "error", "message": str(error)}), 500
    finally:
        if conn:
            conn.close()


@app.route("/dashboard")
def dashboard():
    conn = None
    try:
        conn = get_db_connection()
        refresh_attack_summary(conn)

        metrics = {
            "total_attacks": _row_count(conn, "activity_logs"),
            "unique_users": _row_count(conn, "users"),
            "unique_targets": _row_count(conn, "targets"),
        }

        attack_distribution = execute_select_query(
            conn,
            """
            SELECT attack_type, total_count
            FROM attack_summary
            ORDER BY total_count DESC
            LIMIT 20
            """,
        )

        attacks_over_time = execute_select_query(
            conn,
            """
            SELECT DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:00') AS minute_slot,
                   COUNT(*) AS total_count
            FROM activity_logs
            GROUP BY minute_slot
            ORDER BY minute_slot
            LIMIT 200
            """,
        )

        return render_template(
            "dashboard.html",
            metrics=metrics,
            attack_distribution=attack_distribution,
            attacks_over_time=attacks_over_time,
        )
    except Exception as error:
        return render_template("dashboard.html", error=str(error), metrics=None)
    finally:
        if conn:
            conn.close()


@app.route("/query")
def query_panel():
    return render_template("query.html")


@app.route("/simulation")
def simulation():
    return render_template("simulation.html")


@app.route("/run_query", methods=["POST"])
def run_query():
    payload = request.get_json(silent=True) or {}
    query_type = payload.get("query_type")
    custom_sql = payload.get("sql", "")
    natural_language = payload.get("natural_language", "")
    filters = payload.get("filters", {})

    conn = None
    try:
        conn = get_db_connection()
        generated_sql = ""

        if query_type == "custom":
            generated_sql = custom_sql.strip()
            rows = execute_custom_query_safely(conn, custom_sql)
        elif query_type == "natural_language":
            generated_sql = convert_natural_language_to_sql(natural_language)
            rows = execute_custom_query_safely(conn, generated_sql)
        else:
            predefined_sql, _ = build_predefined_query_sql(query_type, filters=filters)
            generated_sql = predefined_sql.strip()
            rows = run_predefined_query(conn, query_type, filters=filters)

        return jsonify({"status": "success", "rows": rows, "generated_sql": generated_sql})
    except Exception as error:
        return jsonify({"status": "error", "message": str(error)}), 400
    finally:
        if conn:
            conn.close()


@app.route("/acid_demo", methods=["POST"])
def acid_demo():
    conn = None
    try:
        conn = get_db_connection()
        error_text = run_transaction_demo(conn)
        return jsonify(
            {
                "status": "success",
                "message": "Transaction rollback demo executed.",
                "simulated_error": error_text,
            }
        )
    except Exception as error:
        return jsonify({"status": "error", "message": str(error)}), 500
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    initialize_database(str(SCHEMA_PATH))
    app.run(debug=True)

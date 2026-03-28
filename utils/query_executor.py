from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from mysql.connector import Error


DANGEROUS_SQL_PATTERN = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke)\b",
    re.IGNORECASE,
)


PREDEFINED_QUERIES = {
    "frequent_attackers": """
        SELECT u.ip_address AS user_ip, COUNT(*) AS total_attacks
        FROM activity_logs l
        JOIN users u ON l.user_id = u.user_id
        GROUP BY u.user_id
        ORDER BY total_attacks DESC
        LIMIT 20
    """,
    "recent_attacks": """
        SELECT l.log_id, u.ip_address AS user_ip, t.ip_address AS target_ip, a.attack_type, l.timestamp
        FROM activity_logs l
        JOIN users u ON l.user_id = u.user_id
        JOIN targets t ON l.target_id = t.target_id
        JOIN attacks a ON l.attack_id = a.attack_id
        WHERE l.timestamp >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
        ORDER BY l.timestamp DESC
        LIMIT 100
    """,
    "join_query": """
        SELECT l.log_id, u.ip_address AS user_ip, t.ip_address AS target_ip, a.attack_type, a.protocol,
               l.timestamp, l.packets, l.bytes
        FROM activity_logs l
        JOIN users u ON l.user_id = u.user_id
        JOIN targets t ON l.target_id = t.target_id
        JOIN attacks a ON l.attack_id = a.attack_id
        ORDER BY l.timestamp DESC
        LIMIT 200
    """,
}


def build_predefined_query_sql(query_key: str, filters: Optional[Dict[str, Any]] = None):
    if query_key in PREDEFINED_QUERIES:
        return PREDEFINED_QUERIES[query_key], ()

    if query_key == "rollup":
        query = """
            SELECT a.attack_type, a.protocol, COUNT(*) AS total_count
            FROM activity_logs l
            JOIN attacks a ON l.attack_id = a.attack_id
            GROUP BY a.attack_type, a.protocol WITH ROLLUP
        """
        return query, ()

    if query_key == "drilldown":
        attack_type = (filters or {}).get("attack_type", "BENIGN")
        query = """
            SELECT l.timestamp, u.ip_address AS user_ip, t.ip_address AS target_ip, l.packets, l.bytes
            FROM activity_logs l
            JOIN users u ON l.user_id = u.user_id
            JOIN targets t ON l.target_id = t.target_id
            JOIN attacks a ON l.attack_id = a.attack_id
            WHERE a.attack_type = %s
            ORDER BY l.timestamp DESC
            LIMIT 200
        """
        return query, (attack_type,)

    if query_key == "slice_dice":
        attack_type = (filters or {}).get("attack_type")
        protocol = (filters or {}).get("protocol")
        start_time = (filters or {}).get("start_time")
        end_time = (filters or {}).get("end_time")

        where_clauses = []
        params: List[Any] = []

        if attack_type:
            where_clauses.append("a.attack_type = %s")
            params.append(attack_type)
        if protocol:
            where_clauses.append("a.protocol = %s")
            params.append(protocol)
        if start_time:
            where_clauses.append("l.timestamp >= %s")
            params.append(start_time)
        if end_time:
            where_clauses.append("l.timestamp <= %s")
            params.append(end_time)

        where_sql = ""
        if where_clauses:
            where_sql = "WHERE " + " AND ".join(where_clauses)

        query = f"""
            SELECT a.attack_type, a.protocol, DATE(l.timestamp) AS attack_date,
                   COUNT(*) AS total_count, SUM(l.packets) AS total_packets, SUM(l.bytes) AS total_bytes
            FROM activity_logs l
            JOIN attacks a ON l.attack_id = a.attack_id
            {where_sql}
            GROUP BY a.attack_type, a.protocol, DATE(l.timestamp)
            ORDER BY attack_date DESC
            LIMIT 300
        """
        return query, tuple(params)

    raise ValueError(f"Unknown predefined query key: {query_key}")


def convert_natural_language_to_sql(nl_query: str) -> str:
    text = nl_query.strip()
    if not text:
        raise ValueError("Natural language query cannot be empty.")

    lower = text.lower()

    limit_match = re.search(r"(?:top|limit)\s+(\d+)", lower)
    requested_limit = int(limit_match.group(1)) if limit_match else None
    safe_limit = min(max(requested_limit or 100, 1), 1000)

    if "frequent attacker" in lower or "top attacker" in lower or "most attacker" in lower:
        return f"""
            SELECT u.ip_address AS user_ip, COUNT(*) AS total_attacks
            FROM activity_logs l
            JOIN users u ON l.user_id = u.user_id
            GROUP BY u.user_id
            ORDER BY total_attacks DESC
            LIMIT {safe_limit}
        """

    if "attack type" in lower and ("distribution" in lower or "count" in lower or "summary" in lower):
        return f"""
            SELECT a.attack_type, COUNT(*) AS total_count
            FROM activity_logs l
            JOIN attacks a ON l.attack_id = a.attack_id
            GROUP BY a.attack_type
            ORDER BY total_count DESC
            LIMIT {safe_limit}
        """

    if "over time" in lower or "per minute" in lower or "timeline" in lower:
        return f"""
            SELECT DATE_FORMAT(l.timestamp, '%Y-%m-%d %H:%i:00') AS minute_slot,
                   COUNT(*) AS total_count
            FROM activity_logs l
            GROUP BY minute_slot
            ORDER BY minute_slot DESC
            LIMIT {safe_limit}
        """

    since_match = re.search(r"last\s+(\d+)\s+(minute|minutes|hour|hours|day|days)", lower)
    if since_match:
        value = int(since_match.group(1))
        unit_raw = since_match.group(2)
        if unit_raw.startswith("minute"):
            unit = "MINUTE"
        elif unit_raw.startswith("hour"):
            unit = "HOUR"
        else:
            unit = "DAY"

        return f"""
            SELECT l.log_id, u.ip_address AS user_ip, t.ip_address AS target_ip, a.attack_type, a.protocol,
                   l.timestamp, l.packets, l.bytes
            FROM activity_logs l
            JOIN users u ON l.user_id = u.user_id
            JOIN targets t ON l.target_id = t.target_id
            JOIN attacks a ON l.attack_id = a.attack_id
            WHERE l.timestamp >= DATE_SUB(NOW(), INTERVAL {value} {unit})
            ORDER BY l.timestamp DESC
            LIMIT {safe_limit}
        """

    attack_type_match = re.search(r"attack type\s+([a-zA-Z0-9_\- ]+)", text, flags=re.IGNORECASE)
    if attack_type_match:
        attack_type = attack_type_match.group(1).strip().replace("'", "''")
        return f"""
            SELECT l.log_id, u.ip_address AS user_ip, t.ip_address AS target_ip, a.attack_type, a.protocol,
                   l.timestamp, l.packets, l.bytes
            FROM activity_logs l
            JOIN users u ON l.user_id = u.user_id
            JOIN targets t ON l.target_id = t.target_id
            JOIN attacks a ON l.attack_id = a.attack_id
            WHERE a.attack_type = '{attack_type}'
            ORDER BY l.timestamp DESC
            LIMIT {safe_limit}
        """

    protocol_match = re.search(r"protocol\s+(tcp|udp|icmp)", lower)
    if protocol_match:
        protocol = protocol_match.group(1).upper()
        return f"""
            SELECT l.log_id, u.ip_address AS user_ip, t.ip_address AS target_ip, a.attack_type, a.protocol,
                   l.timestamp, l.packets, l.bytes
            FROM activity_logs l
            JOIN users u ON l.user_id = u.user_id
            JOIN targets t ON l.target_id = t.target_id
            JOIN attacks a ON l.attack_id = a.attack_id
            WHERE UPPER(a.protocol) = '{protocol}'
            ORDER BY l.timestamp DESC
            LIMIT {safe_limit}
        """

    if "show" in lower or "list" in lower or "all" in lower or "logs" in lower:
        return f"""
            SELECT l.log_id, u.ip_address AS user_ip, t.ip_address AS target_ip, a.attack_type, a.protocol,
                   l.timestamp, l.packets, l.bytes
            FROM activity_logs l
            JOIN users u ON l.user_id = u.user_id
            JOIN targets t ON l.target_id = t.target_id
            JOIN attacks a ON l.attack_id = a.attack_id
            ORDER BY l.timestamp DESC
            LIMIT {safe_limit}
        """

    raise ValueError(
        "Could not map this natural-language query to SQL. Try phrasing like: "
        "'top 10 frequent attackers', 'attacks in last 5 minutes', "
        "'attack type distribution', or 'show logs for protocol tcp'."
    )


def execute_select_query(conn, query: str, params: Optional[tuple] = None) -> List[Dict[str, Any]]:
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(query, params or ())
        return cursor.fetchall()
    finally:
        cursor.close()


def execute_custom_query_safely(conn, query: str) -> List[Dict[str, Any]]:
    q = query.strip()
    if not q:
        raise ValueError("SQL query cannot be empty.")

    if ";" in q[:-1]:
        raise ValueError("Multiple SQL statements are not allowed.")

    if not q.lower().startswith(("select", "with")):
        raise ValueError("Only SELECT/CTE read-only queries are allowed.")

    if DANGEROUS_SQL_PATTERN.search(q):
        raise ValueError("Query contains blocked SQL keywords.")

    return execute_select_query(conn, q)


def run_predefined_query(conn, query_key: str, filters: Optional[Dict[str, Any]] = None):
    query, params = build_predefined_query_sql(query_key, filters=filters)
    return execute_select_query(conn, query, params)


def refresh_attack_summary(conn):
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM attack_summary")
        cursor.execute(
            """
            INSERT INTO attack_summary (attack_type, total_count)
            SELECT a.attack_type, COUNT(*) AS total_count
            FROM activity_logs l
            JOIN attacks a ON l.attack_id = a.attack_id
            GROUP BY a.attack_type
            """
        )
        conn.commit()
    except Error as error:
        conn.rollback()
        raise RuntimeError(f"Failed to refresh attack_summary: {error}")
    finally:
        cursor.close()


def run_transaction_demo(conn) -> str:
    cursor = conn.cursor()
    try:
        print("[ACID DEMO] START TRANSACTION")
        conn.start_transaction()

        cursor.execute("INSERT INTO users (ip_address) VALUES (%s)", ("203.0.113.250",))
        user_id = cursor.lastrowid

        cursor.execute("INSERT INTO targets (ip_address) VALUES (%s)", ("198.51.100.250",))
        target_id = cursor.lastrowid

        cursor.execute(
            "INSERT INTO attacks (attack_type, protocol) VALUES (%s, %s)",
            ("SIMULATED_ATTACK", "TCP"),
        )
        attack_id = cursor.lastrowid

        cursor.execute(
            """
            INSERT INTO activity_logs (user_id, target_id, attack_id, timestamp, packets, bytes)
            VALUES (%s, %s, %s, NOW(), %s, %s)
            """,
            (user_id, target_id, attack_id, 100, 1000),
        )

        raise RuntimeError("Simulated failure for rollback demonstration.")
    except Exception as error:
        conn.rollback()
        print(f"[ACID DEMO] ERROR: {error}")
        print("[ACID DEMO] ROLLBACK complete")
        return str(error)
    finally:
        cursor.close()

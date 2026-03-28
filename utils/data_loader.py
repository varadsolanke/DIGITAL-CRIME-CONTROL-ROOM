from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from hashlib import md5
from typing import Dict, Iterable, Optional

import pandas as pd
from mysql.connector import Error


@dataclass
class LoadResult:
    inserted_rows: int = 0
    skipped_rows: int = 0


def _pick_column(columns: Iterable[str], candidates: Iterable[str]) -> Optional[str]:
    normalized = {c.strip().lower(): c for c in columns}
    for candidate in candidates:
        key = candidate.strip().lower()
        if key in normalized:
            return normalized[key]
    return None


def _safe_int(value, default: int = 0) -> int:
    if pd.isna(value):
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_str(value, default: str = "unknown") -> str:
    if pd.isna(value):
        return default
    text = str(value).strip()
    return text if text else default


def _safe_timestamp(value) -> datetime:
    if pd.isna(value):
        return datetime.utcnow()
    parsed = pd.to_datetime(value, errors="coerce", utc=False)
    if pd.isna(parsed):
        return datetime.utcnow()
    return parsed.to_pydatetime().replace(tzinfo=None)


def load_csv_to_db(file_path: str, conn) -> LoadResult:
    df = pd.read_csv(file_path)

    # Try to find IP columns (optional for CICIDS datasets)
    source_col = _pick_column(df.columns, ["Source IP", "Src IP", "src_ip", "source_ip"])
    target_col = _pick_column(
        df.columns, ["Destination IP", "Dst IP", "dst_ip", "destination_ip"]
    )

    # Find attack/label column (CICIDS uses ' Label' with leading space)
    attack_col = _pick_column(df.columns, ["Label", " Label", "Attack", "Attack Type", "attack_type"])
    
    # Try to find protocol column
    protocol_col = _pick_column(df.columns, ["Protocol", "protocol"])

    # Timestamp is optional
    timestamp_col = _pick_column(df.columns, ["Timestamp", "timestamp", "time"])

    # Find bytes column (CICIDS: 'Total Length of Fwd Packets')
    bytes_col = _pick_column(
        df.columns,
        [
            "Total Length of Fwd Packets",
            "Total Length of Bwd Packets",
            "Flow Bytes/s",
            "Bytes",
            "bytes",
        ],
    )
    
    # Find packets column (CICIDS: ' Total Fwd Packets' with leading space)
    packets_col = _pick_column(
        df.columns,
        [
            "Total Fwd Packets",
            " Total Fwd Packets",
            "Total Backward Packets",
            " Total Backward Packets",
            "Packets",
            "packets",
        ],
    )

    if not attack_col:
        raise ValueError("Required Label/Attack column was not found in CSV.")

    cursor = conn.cursor(dictionary=True)
    result = LoadResult()

    user_cache: Dict[str, int] = {}
    target_cache: Dict[str, int] = {}
    attack_cache: Dict[str, int] = {}
    
    # Use row index for timestamp if no timestamp column
    base_time = datetime.utcnow()
    batch_size = 5000
    activity_batch = []

    try:
        for idx, (_, row) in enumerate(df.iterrows()):
            # Handle IPs: if columns exist, use them; otherwise generate synthetic
            if source_col and target_col:
                source_ip = _safe_str(row.get(source_col), default="0.0.0.0")
                target_ip = _safe_str(row.get(target_col), default="0.0.0.0")
                if source_ip == "0.0.0.0" or target_ip == "0.0.0.0":
                    result.skipped_rows += 1
                    continue
            else:
                # Generate synthetic IPs from row hash for CICIDS datasets
                row_hash = md5(str(idx).encode()).hexdigest()[:8]
                source_ip = f"192.168.{int(row_hash[:2], 16) % 256}.{int(row_hash[2:4], 16)}"
                target_ip = f"10.0.{int(row_hash[4:6], 16) % 256}.{int(row_hash[6:8], 16)}"

            # Extract attack type and protocol
            attack_type = _safe_str(row.get(attack_col), default="BENIGN")
            protocol = _safe_str(row.get(protocol_col), default="TCP") if protocol_col else "TCP"
            
            # Handle timestamp
            if timestamp_col:
                event_time = _safe_timestamp(row.get(timestamp_col))
            else:
                # Use row index to create incremental timestamps
                event_time = base_time + timedelta(seconds=idx % 3600)

            # Extract bytes and packets
            packets = _safe_int(row.get(packets_col), default=0)
            bytes_value = _safe_int(row.get(bytes_col), default=0)

            user_id = _get_or_create_user(cursor, source_ip, user_cache)
            target_id = _get_or_create_target(cursor, target_ip, target_cache)
            attack_id = _get_or_create_attack(cursor, attack_type, protocol, attack_cache)

            # Accumulate batch
            activity_batch.append((user_id, target_id, attack_id, event_time, packets, bytes_value))
            result.inserted_rows += 1

            # Execute batch when threshold reached
            if len(activity_batch) >= batch_size:
                cursor.executemany(
                    """
                    INSERT INTO activity_logs (user_id, target_id, attack_id, timestamp, packets, bytes)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    activity_batch,
                )
                conn.commit()
                activity_batch = []
                print(f"[LOAD PROGRESS] Inserted {result.inserted_rows} rows...")

        # Insert remaining batch
        if activity_batch:
            cursor.executemany(
                """
                INSERT INTO activity_logs (user_id, target_id, attack_id, timestamp, packets, bytes)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                activity_batch,
            )
            conn.commit()

    except Error:
        conn.rollback()
        raise
    finally:
        cursor.close()

    return result


def _get_or_create_user(cursor, source_ip: str, cache: Dict[str, int]) -> int:
    if source_ip in cache:
        return cache[source_ip]

    cursor.execute("SELECT user_id FROM users WHERE ip_address = %s", (source_ip,))
    row = cursor.fetchone()
    if row:
        cache[source_ip] = row["user_id"]
        return row["user_id"]

    cursor.execute("INSERT INTO users (ip_address) VALUES (%s)", (source_ip,))
    cache[source_ip] = cursor.lastrowid
    return cursor.lastrowid


def _get_or_create_target(cursor, target_ip: str, cache: Dict[str, int]) -> int:
    if target_ip in cache:
        return cache[target_ip]

    cursor.execute("SELECT target_id FROM targets WHERE ip_address = %s", (target_ip,))
    row = cursor.fetchone()
    if row:
        cache[target_ip] = row["target_id"]
        return row["target_id"]

    cursor.execute("INSERT INTO targets (ip_address) VALUES (%s)", (target_ip,))
    cache[target_ip] = cursor.lastrowid
    return cursor.lastrowid


def _get_or_create_attack(cursor, attack_type: str, protocol: str, cache: Dict[str, int]) -> int:
    cache_key = f"{attack_type}|{protocol}"
    if cache_key in cache:
        return cache[cache_key]

    cursor.execute(
        "SELECT attack_id FROM attacks WHERE attack_type = %s AND protocol = %s",
        (attack_type, protocol),
    )
    row = cursor.fetchone()
    if row:
        cache[cache_key] = row["attack_id"]
        return row["attack_id"]

    cursor.execute(
        "INSERT INTO attacks (attack_type, protocol) VALUES (%s, %s)",
        (attack_type, protocol),
    )
    cache[cache_key] = cursor.lastrowid
    return cursor.lastrowid

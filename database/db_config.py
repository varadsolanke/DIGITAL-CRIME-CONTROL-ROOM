import os

import mysql.connector
from mysql.connector import Error


def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "digital_crime_control_room"),
        autocommit=False,
    )


def initialize_database(schema_path: str):
    conn = None
    cursor = None
    try:
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
            autocommit=True,
        )
        cursor = conn.cursor()

        with open(schema_path, "r", encoding="utf-8") as schema_file:
            sql_script = schema_file.read()

        for statement in sql_script.split(";"):
            stmt = statement.strip()
            if not stmt:
                continue
            try:
                cursor.execute(stmt)
            except Error as error:
                # Make schema initialization re-runnable by ignoring duplicate index errors.
                if getattr(error, "errno", None) == 1061:
                    continue
                raise

    except Error as error:
        print(f"[DB INIT ERROR] {error}")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

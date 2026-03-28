CREATE DATABASE IF NOT EXISTS digital_crime_control_room;
USE digital_crime_control_room;

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS targets (
    target_id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS attacks (
    attack_id INT AUTO_INCREMENT PRIMARY KEY,
    attack_type VARCHAR(120) NOT NULL,
    protocol VARCHAR(50) NOT NULL,
    UNIQUE KEY uq_attack_protocol (attack_type, protocol)
);

CREATE TABLE IF NOT EXISTS activity_logs (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    target_id INT NOT NULL,
    attack_id INT NOT NULL,
    timestamp DATETIME NOT NULL,
    packets BIGINT NOT NULL DEFAULT 0,
    bytes BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_logs_target FOREIGN KEY (target_id) REFERENCES targets(target_id),
    CONSTRAINT fk_logs_attack FOREIGN KEY (attack_id) REFERENCES attacks(attack_id)
);

CREATE INDEX idx_user_time ON activity_logs(user_id, timestamp);
CREATE INDEX idx_attack_time ON activity_logs(attack_id, timestamp);
CREATE INDEX idx_target_time ON activity_logs(target_id, timestamp);

CREATE TABLE IF NOT EXISTS attack_summary (
    attack_type VARCHAR(120) PRIMARY KEY,
    total_count BIGINT NOT NULL
);

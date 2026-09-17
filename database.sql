-- Kör i den valda databasen (t.ex. puls) via phpMyAdmin.
-- Kan importeras igen: befintliga frågor och svar bevaras.
-- MySQL 5.7+/8.x eller MariaDB 10.4+. InnoDB krävs för transaktioner.
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS puls_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    owner_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    theme_json TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_owner (owner_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS puls_auth_rate_limits (
    rate_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 1,
    reset_at DATETIME NOT NULL,
    PRIMARY KEY (rate_key),
    KEY idx_auth_rate_reset (reset_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS puls_questions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    owner_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(240) NOT NULL,
    kind VARCHAR(16) NOT NULL,
    options_json TEXT NOT NULL,
    min_value DOUBLE NOT NULL DEFAULT 0,
    max_value DOUBLE NOT NULL DEFAULT 10,
    result_view VARCHAR(16) NOT NULL,
    is_open TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_questions_code (code),
    KEY idx_questions_owner_created (owner_hash, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS puls_answers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    question_id BIGINT UNSIGNED NOT NULL,
    voter_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    value_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_answers_question_voter (question_id, voter_hash),
    KEY idx_answers_question_id (question_id, id),
    CONSTRAINT puls_fk_answers_question FOREIGN KEY (question_id) REFERENCES puls_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Setet använder den första frågans kod. Befintliga frågor behöver inte ändras.
CREATE TABLE IF NOT EXISTS puls_question_sets (
    id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(240) NOT NULL,
    progression VARCHAR(16) NOT NULL,
    current_position INT UNSIGNED NOT NULL DEFAULT 0,
    is_open TINYINT(1) NOT NULL DEFAULT 1,
    finished TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT puls_fk_sets_root FOREIGN KEY (id) REFERENCES puls_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS puls_set_questions (
    set_id BIGINT UNSIGNED NOT NULL,
    question_id BIGINT UNSIGNED NOT NULL,
    position INT UNSIGNED NOT NULL,
    PRIMARY KEY (set_id, position),
    UNIQUE KEY uq_set_question (question_id),
    CONSTRAINT puls_fk_set_questions_set FOREIGN KEY (set_id) REFERENCES puls_question_sets(id) ON DELETE CASCADE,
    CONSTRAINT puls_fk_set_questions_question FOREIGN KEY (question_id) REFERENCES puls_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS puls_set_designs (
    set_id BIGINT UNSIGNED NOT NULL,
    design_json TEXT NOT NULL,
    version CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (set_id),
    CONSTRAINT puls_fk_set_design FOREIGN KEY (set_id) REFERENCES puls_question_sets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS puls_set_design_assets (
    set_id BIGINT UNSIGNED NOT NULL,
    slot VARCHAR(16) NOT NULL,
    mime VARCHAR(32) NOT NULL,
    content MEDIUMBLOB NOT NULL,
    PRIMARY KEY (set_id,slot),
    CONSTRAINT puls_fk_set_design_asset FOREIGN KEY (set_id) REFERENCES puls_question_sets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS puls_question_designs (
    question_id BIGINT UNSIGNED NOT NULL,
    design_json TEXT NOT NULL,
    version CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (question_id),
    CONSTRAINT puls_fk_question_design FOREIGN KEY (question_id) REFERENCES puls_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS puls_question_design_assets (
    question_id BIGINT UNSIGNED NOT NULL,
    slot VARCHAR(16) NOT NULL,
    mime VARCHAR(32) NOT NULL,
    content MEDIUMBLOB NOT NULL,
    PRIMARY KEY (question_id,slot),
    CONSTRAINT puls_fk_question_design_asset FOREIGN KEY (question_id) REFERENCES puls_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

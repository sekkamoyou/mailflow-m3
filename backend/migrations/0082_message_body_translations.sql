CREATE TABLE IF NOT EXISTS message_body_translations (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE ON UPDATE CASCADE,
  language VARCHAR(32) NOT NULL,
  source_hash CHAR(64) NOT NULL,
  segments JSONB NOT NULL,
  translated BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (message_id, language, source_hash)
);

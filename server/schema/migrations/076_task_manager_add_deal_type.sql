-- Extend task type enum to support deal-focused tasks.

USE call_nest;

ALTER TABLE task_assignments
  MODIFY COLUMN task_type ENUM('todo','meeting','call','deal') NOT NULL DEFAULT 'todo';

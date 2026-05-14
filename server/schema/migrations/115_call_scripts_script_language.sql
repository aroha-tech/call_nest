ALTER TABLE `call_scripts`
ADD COLUMN `script_language` VARCHAR(10) DEFAULT 'en' AFTER `script_name`;
